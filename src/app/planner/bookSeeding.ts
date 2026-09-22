// How a journal's pages come to exist: the seeding that opening a level and
// creating a journal both go through.
//
// A plain server module, deliberately NOT a "use server" file: nothing here
// checks who is asking, so nothing here may be callable from a browser. The
// actions in actions.ts check that the journal is the signed-in person's and
// then call in. It lives apart from them so a script can exercise it against
// a throwaway planner without a session - see scripts/check-journals.mts.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { PageLevel } from "@/generated/prisma/enums";
import { LEVEL_PAGE_COUNT, LEVELS_IN_BINDING_ORDER } from "@/lib/pageLevels";
import {
  weekLayout,
  dayLayout,
  frontMatterLayout,
  backMatterLayout,
  monthLayout,
  missingPlacements,
  titleCorrections,
  type PageLayout,
  type ExistingInstance,
} from "@/lib/pageLayouts";
import { PLANNER_TRIMS, type PlannerTrimKey } from "@/lib/planner-trims";
import type { FontChoice, PlannerTheme } from "@/lib/theme";

export const WITH_PAGES = {
  pages: {
    orderBy: { position: "asc" },
    include: {
      moduleInstances: { include: { moduleType: true, savedModule: { select: { name: true } } } },
      // Which saved page this one is a use of, by name - see savedItems.ts.
      savedPage: { select: { name: true } },
    },
  },
} as const;

export type BookWithPages = Prisma.PlannerGetPayload<{ include: typeof WITH_PAGES }>;

/** Which arrangement a level's pages start as. A level with no entry seeds
 *  blank pages, which is exactly right for front matter and for dailies -
 *  they have no spine to lay out around. */
// Every level now has one, so the Partial is doing nothing - but it stays,
// because a level added later must be allowed to start with a blank page
// rather than forcing someone to invent an arrangement for it first.
export const LEVEL_LAYOUT: Partial<Record<PageLevel, (gridRows: number) => PageLayout>> = {
  FRONT_MATTER: frontMatterLayout,
  MONTHLY: monthLayout,
  WEEKLY: weekLayout,
  DAILY: dayLayout,
  BACK_MATTER: backMatterLayout,
};

/**
 * Create whatever a spread is MISSING from its layout, and nothing it
 * already has.
 *
 * This replaced a run of bespoke `ensureX` helpers - one per module in the
 * arrangement, each repeating the same "is it here? no? create it" shape
 * with its coordinates inlined. They worked, and they were the reason
 * there could only ever be one layout per cadence: a second one meant a
 * second set of them. The arrangement is data now (src/lib/pageLayouts.ts)
 * and this is the only code that applies it, so a new layout is an entry.
 *
 * Runs on EVERY load, not just the first, so "missing" has to be decided
 * by something that does not go stale - see PresenceRule, and the month
 * Notes box that was guarded by a row number its own create had moved off.
 */
async function applyLayout(
  layout: PageLayout,
  pages: Array<{
    id: string;
    moduleInstances: Array<{
      moduleType: { slug: string };
      columnStart: number | null;
      propValues: unknown;
    }>;
  }>
): Promise<boolean> {
  const existing = pages.map((page) =>
    page.moduleInstances.map(
      (mi): ExistingInstance => ({
        slug: mi.moduleType.slug,
        columnStart: mi.columnStart,
        heading: (mi.propValues as { heading?: string } | null)?.heading,
      })
    )
  ) as [ExistingInstance[], ExistingInstance[]];

  const missing = missingPlacements(layout, existing);
  if (missing.length === 0) return false;

  const types = await prisma.moduleType.findMany({
    where: { slug: { in: [...new Set(missing.map((m) => m.slug))] } },
  });
  const bySlug = new Map(types.map((t) => [t.slug, t]));

  await prisma.moduleInstance.createMany({
    data: missing.map((placement) => {
      const type = bySlug.get(placement.slug);
      if (!type) {
        // A layout naming a module that is not registered is a bug in the
        // layout, and a silent skip would leave a hole in the page that
        // nobody could explain.
        throw new Error(
          `${layout.key} places "${placement.slug}", which is not a registered module type`
        );
      }
      return {
        pageId: pages[placement.page].id,
        moduleTypeId: type.id,
        placementMode: "GRID" as const,
        locked: placement.locked,
        columnStart: placement.columnStart,
        rowStart: placement.rowStart,
        columnSpan: placement.columnSpan ?? type.defaultColumnSpan,
        rowSpan: placement.rowSpan ?? type.defaultRowSpan,
        propValues: placement.propValues as Prisma.InputJsonValue,
      };
    }),
  });
  return true;
}

/** The four fields a trim sets on a page - see PLANNER_TRIMS. */
type PageSize = { widthPx: number; heightPx: number; gridRows: number; marginPx: number };

function sizeOfTrim(trim: PlannerTrimKey): PageSize {
  const spec = PLANNER_TRIMS[trim];
  return { widthPx: spec.widthPx, heightPx: spec.heightPx, gridRows: spec.gridRows, marginPx: spec.marginPx };
}

/**
 * A journal with one LEVEL's pages ready: the set created if it is missing,
 * its layout applied, and its titles put back to the layout's size.
 *
 * Idempotent, and run on every open - which is why "missing" is decided by
 * PresenceRule and not by counting.
 *
 * THE DEFAULT LAYOUT'S PAGES ONLY go to applyLayout. It used to be handed
 * every page at the level, sorted by position - and a month's own layout
 * (February's) is a copy with positions 0 and 1 of its own, so page [1], the
 * layout's right page, could be a copy's LEFT page, depending on the order
 * the database returned them in. Measured in the dev book: the right page's
 * full-width Notes (c0+24) had been created on the monthly LEFT page, lying
 * over the sidebar, and blocked every sidebar reorder.
 *
 * New pages take the size of the pages the journal already has - a Letter
 * journal gets Letter pages - falling back to `size` for a journal with none
 * yet. They used to take the schema's default, 7x10, whatever the journal was.
 */
export async function ensureLevel(
  start: BookWithPages,
  level: PageLevel,
  size?: PageSize
): Promise<BookWithPages> {
  let planner = start;
  let needsRefetch = false;

  const model = planner.pages[0];
  const pageSize: PageSize | undefined = model
    ? { widthPx: model.widthPx, heightPx: model.heightPx, gridRows: model.gridRows, marginPx: model.marginPx }
    : size;

  // This level's own set. A spread is two pages - the book open flat,
  // position 0 on the left and 1 on the right - and a daily is one. Positions
  // are per level AND per layout, so each has its own 0.
  const defaultSet = (p: BookWithPages) =>
    p.pages
      .filter((page) => page.level === level && (page.variantKey ?? null) === null)
      .sort((a, b) => a.position - b.position);
  const wanted = LEVEL_PAGE_COUNT[level];
  for (let position = defaultSet(planner).length; position < wanted; position++) {
    await prisma.page.create({ data: { plannerId: planner.id, position, level, ...(pageSize ?? {}) } });
    needsRefetch = true;
  }
  if (needsRefetch) {
    planner = await prisma.planner.findUniqueOrThrow({ where: { id: planner.id }, include: WITH_PAGES });
    needsRefetch = false;
  }

  // applyLayout takes the pages a placement's `page` index refers to, so a
  // one-page level hands it a one-page list rather than a spread with a hole
  // in it.
  const levelPages = defaultSet(planner);
  const layout = LEVEL_LAYOUT[level];
  if (layout && (await applyLayout(layout(levelPages[0].gridRows), levelPages))) {
    needsRefetch = true;
  }
  // Titles are locked, so their size is the layout's - see titleCorrections.
  // This is what repairs a book seeded with a 3-row month title lying over
  // the top of its sidebar, and every occurrence layout copied from it - so
  // it reads EVERY page at the level, copies included.
  const corrections = layout
    ? titleCorrections(
        layout(levelPages[0].gridRows),
        planner.pages
          .filter((page) => page.level === level)
          .map((page) =>
            page.moduleInstances.map((mi) => ({
              id: mi.id,
              slug: mi.moduleType.slug,
              locked: mi.locked,
              columnStart: mi.columnStart,
              rowStart: mi.rowStart,
              columnSpan: mi.columnSpan,
              rowSpan: mi.rowSpan,
            }))
          )
      )
    : [];
  if (corrections.length > 0) {
    await prisma.$transaction(
      corrections.map((c) => prisma.moduleInstance.update({ where: { id: c.id }, data: c.data }))
    );
    needsRefetch = true;
  }

  if (needsRefetch) {
    planner = await prisma.planner.findUniqueOrThrow({ where: { id: planner.id }, include: WITH_PAGES });
  }
  return planner;
}

/**
 * A term from two ISO dates, or null for none. Parsed as UTC midnight,
 * matching every other date in this app - a local parse would put a book
 * that starts on the 1st into the previous month for anyone west of
 * Greenwich.
 */
export function parseTerm(startISO: string | null, endISO: string | null): { start: Date; end: Date } | null {
  if (!startISO || !endISO) return null;
  const start = new Date(`${startISO}T00:00:00.000Z`);
  const end = new Date(`${endISO}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Those dates could not be read.");
  }
  if (end.getTime() < start.getTime()) {
    throw new Error("A book cannot end before it begins.");
  }
  return { start, end };
}

/** Everything the Create panel decides. */
export type NewJournal = {
  title: string;
  trim: PlannerTrimKey;
  startISO: string | null;
  endISO: string | null;
  levels: PageLevel[];
  dated: boolean;
  weekStartDay: number;
  font: FontChoice;
};

export const JOURNAL_TITLE_MAX = 80;

/**
 * A NewJournal from whatever a browser sent. A server action is a public
 * endpoint whatever its types say, so every field is checked here rather
 * than trusted.
 */
export function validateNewJournal(input: unknown): NewJournal {
  const raw = (input ?? {}) as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, JOURNAL_TITLE_MAX) : "";
  if (typeof raw.trim !== "string" || !(raw.trim in PLANNER_TRIMS)) throw new Error("No such page size.");
  const levels = Array.isArray(raw.levels)
    ? LEVELS_IN_BINDING_ORDER.filter((level) => (raw.levels as unknown[]).includes(level))
    : [];
  if (levels.length === 0) throw new Error("Choose at least one kind of page.");
  const weekStartDay = raw.weekStartDay === 1 ? 1 : 0;
  const font: FontChoice = raw.font === "sans" ? "sans" : "serif";
  const startISO = typeof raw.startISO === "string" && raw.startISO ? raw.startISO : null;
  const endISO = typeof raw.endISO === "string" && raw.endISO ? raw.endISO : null;
  parseTerm(startISO, endISO);
  return {
    title: title || "Untitled journal",
    trim: raw.trim as PlannerTrimKey,
    startISO,
    endISO,
    levels,
    dated: raw.dated !== false,
    weekStartDay,
    font,
  };
}

/**
 * A new journal for `ownerId`, with every chosen level seeded. Returns it
 * with its pages. A level left out simply has no pages, which is how a book
 * leaves it out of print (see generateBook); opening it from the timeline
 * later seeds it then.
 */
export async function createBookFor(ownerId: string, input: NewJournal): Promise<BookWithPages> {
  const term = parseTerm(input.startISO, input.endISO);
  const theme: PlannerTheme = { fontFamily: input.font, weekStartDay: input.weekStartDay };
  let planner = await prisma.planner.create({
    data: {
      ownerId,
      title: input.title,
      dated: input.dated,
      startDate: term?.start ?? null,
      endDate: term?.end ?? null,
      theme: theme as Prisma.InputJsonValue,
    },
    include: WITH_PAGES,
  });
  const size = sizeOfTrim(input.trim);
  for (const level of input.levels) {
    planner = await ensureLevel(planner, level, size);
  }
  return planner;
}
