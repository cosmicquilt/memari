// "Use this" (2026-10-06 for the people's weeks; every kind 2026-10-08): one
// of the landing page's spreads as a new journal of your own - exactly as
// the hero printed it, opened in the editor to change. The spreads are
// src/app/landing/heroSpreads.ts (the people's weeks from archetypes.ts),
// and where everything goes is spreads.ts's spreadPlacements - the one
// description both read.
//
// FOUR KINDS, four journals, each made the way the start dialog's Create
// makes one (this quarter, the spread's week start and type) and then laid
// out like the spread:
//
//   week   a weekly book; its weekly spread takes the spread's modules
//   month  a monthly book; its month spread does
//   day    a daily book; its day page takes the spread's left page (the
//          hero shows two facing days of ONE daily template)
//   pages  a weekly book whose Beginning is the spread's two pages
//
// And a PREBUILT PLANNER (2026-10-15, landing/plannerTemplates.ts): a whole
// book whose front pages, months, weeks and days are each laid out from a
// spread of their own - createJournalFromPlanner, the same steps once per
// part. The otter's quiz (2026-10-20, otterPlanner.ts) makes its book the
// same way, from spreads it put together: createJournalFromParts.
//
// The locked spine stays - the week title, the hours, the month's title and
// calendar - but takes the spread's SETTINGS: the hours' range, increments
// and row height, how tall they are (hoursRows), and how the month's days
// are ruled. Not its dates or events: those are the journal's own.
//
// THE SEEDED DEFAULTS DO NOT COME BACK. ensureLevel runs on every open and
// re-creates whatever a level's layout says is missing, but only into FREE
// cells (placementsOnFreeCells), and every spread's pages are full -
// spreads.test.mts checks every layout fills its rows.
//
// SERVER-ONLY.

import { prisma } from "@/lib/prisma";
import { PageLevel } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { HERO_BY_KEY, type HeroSpread } from "@/app/landing/heroSpreads";
import { partsOf, type PlannerPart, type PlannerTemplate } from "@/app/landing/plannerTemplates";
import { spreadPlacements, type Placed } from "@/app/landing/spreads";
import { createBookFor, type BookWithPages, type NewJournal } from "./bookSeeding";

/** This quarter from the first of next month, as the start dialog offers -
 *  the term the subscription ships by default. */
function nextQuarter(today: Date): { startISO: string; endISO: string } {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startISO: iso(start), endISO: iso(end) };
}

/** Which level a spread's pages become, and the book's levels. */
function shapeOf(spread: HeroSpread): { target: PageLevel; levels: PageLevel[] } {
  switch (spread.layout.kind) {
    case "month":
      return { target: PageLevel.MONTHLY, levels: [PageLevel.FRONT_MATTER, PageLevel.MONTHLY, PageLevel.BACK_MATTER] };
    case "day":
      return { target: PageLevel.DAILY, levels: [PageLevel.FRONT_MATTER, PageLevel.DAILY, PageLevel.BACK_MATTER] };
    case "pages":
      return { target: PageLevel.FRONT_MATTER, levels: [PageLevel.FRONT_MATTER, PageLevel.WEEKLY, PageLevel.BACK_MATTER] };
    default:
      return { target: PageLevel.WEEKLY, levels: [PageLevel.FRONT_MATTER, PageLevel.WEEKLY, PageLevel.BACK_MATTER] };
  }
}

/** The journal a spread starts, at the hero's trim. */
export function journalFor(spread: HeroSpread, title: string, browserTimeZone: string | null, today = new Date()): NewJournal {
  return {
    title,
    trim: "bound7x10",
    ...nextQuarter(today),
    levels: shapeOf(spread).levels,
    dated: true,
    weekStartDay: spread.layout.weekStartsMonday ? 1 : 0,
    font: spread.layout.font,
    browserTimeZone,
  };
}

/** What a spine keeps from the spread: its settings, not its dates. Also
 *  what a layout saved to Saved keeps (templateSaving.ts). */
export function spineSettings(placed: Placed): Record<string, unknown> {
  if (placed.slug === "month-grid-core") return { inside: placed.props.inside };
  // The hours: everything but the days they are drawn for and what is on them.
  const dated = new Set(["dayCount", "dayLabels", "events"]);
  return Object.fromEntries(Object.entries(placed.props).filter(([key]) => !dated.has(key)));
}

/**
 * A spread that cannot be made here: a module it places has no row in this
 * database - in production, one registered since the module types were last
 * seeded (`npx prisma db seed`). Thrown before anything is created.
 */
export class WeekUnavailable extends Error {}

/** What a spread places: its modules, and the settings for the spines. A
 *  day spread is one daily template shown twice: its left page is it. */
function placementsOf(spread: HeroSpread): { modules: Placed[]; spines: Placed[] } {
  const placed = spreadPlacements(spread).filter((p) => spread.layout.kind !== "day" || p.page === 0);
  return { modules: placed.filter((p) => !p.locked), spines: placed.filter((p) => p.locked && p.slug.endsWith("-core")) };
}

type ModuleTypeRow = Awaited<ReturnType<typeof prisma.moduleType.findMany>>[number];

/** Every module type the spreads place, before anything is created: a
 *  missing one used to throw after the journal was made, leaving a half-
 *  laid-out journal behind. */
async function moduleTypesFor(spreads: HeroSpread[], what: string): Promise<Map<string, ModuleTypeRow>> {
  const slugs = [...new Set(spreads.flatMap((spread) => placementsOf(spread).modules.map((p) => p.slug)))];
  const types = await prisma.moduleType.findMany({ where: { slug: { in: slugs } } });
  const bySlug = new Map(types.map((t) => [t.slug, t]));
  const missing = slugs.filter((slug) => !bySlug.has(slug));
  if (missing.length > 0) {
    throw new WeekUnavailable(`${what} places ${missing.join(", ")}, which this database has no module type for - run \`npx prisma db seed\``);
  }
  return bySlug;
}

/**
 * Lay `book`'s `target` pages out as `spread`: the writes that do it, for
 * one transaction. A page is added first where the level has too few - the
 * Beginning starts with one, and module pages need two.
 */
async function layOutLevel(book: BookWithPages, spread: HeroSpread, target: PageLevel, bySlug: Map<string, ModuleTypeRow>): Promise<Prisma.PrismaPromise<unknown>[]> {
  const { modules, spines } = placementsOf(spread);
  let pages = book.pages
    .filter((page) => page.level === target && (page.variantKey ?? null) === null)
    .sort((a, b) => a.position - b.position);
  const needed = spread.layout.kind === "day" ? 1 : 2;
  if (pages.length > 0 && pages.length < needed) {
    const first = pages[0];
    const added = await prisma.page.create({
      data: {
        plannerId: first.plannerId,
        level: first.level,
        position: pages[pages.length - 1].position + 1,
        widthPx: first.widthPx,
        heightPx: first.heightPx,
        gridColumns: first.gridColumns,
        gridRows: first.gridRows,
        gridGapPx: first.gridGapPx,
        marginPx: first.marginPx,
      },
      include: { moduleInstances: { include: { moduleType: true } } },
    });
    pages = [...pages, added as (typeof pages)[number]];
  }
  if (pages.length < needed) throw new Error(`The new journal has no ${target} pages to lay out.`);

  const rows: Prisma.ModuleInstanceCreateManyInput[] = modules.map((p) => ({
    pageId: pages[p.page].id,
    moduleTypeId: bySlug.get(p.slug)!.id,
    placementMode: "GRID" as const,
    locked: false,
    columnStart: p.columnStart,
    rowStart: p.rowStart,
    columnSpan: p.columnSpan,
    rowSpan: p.rowSpan,
    propValues: p.props as Prisma.InputJsonValue,
  }));
  // The journal's own spine, given the spread's settings and height.
  const spineUpdates = spines.flatMap((spine) => {
    const own = pages[spine.page].moduleInstances.find((mi) => mi.locked && mi.moduleType.slug === spine.slug);
    if (!own) return [];
    const propValues = { ...((own.propValues as Record<string, unknown>) ?? {}), ...spineSettings(spine) };
    return [prisma.moduleInstance.update({ where: { id: own.id }, data: { rowSpan: spine.rowSpan, propValues: propValues as Prisma.InputJsonValue } })];
  });
  return [
    prisma.moduleInstance.deleteMany({ where: { pageId: { in: pages.slice(0, needed).map((page) => page.id) }, locked: false } }),
    ...spineUpdates,
    prisma.moduleInstance.createMany({ data: rows }),
  ];
}

/** A new journal for `ownerId` laid out as `spread`. */
export async function createJournalFromSpread(ownerId: string, spread: HeroSpread, title: string, browserTimeZone: string | null): Promise<BookWithPages> {
  const bySlug = await moduleTypesFor([spread], spread.key);
  const book = await createBookFor(ownerId, journalFor(spread, title, browserTimeZone));
  await prisma.$transaction(await layOutLevel(book, spread, shapeOf(spread).target, bySlug));
  return book;
}

/** The level each part of a planner's book is. */
const PART_LEVEL: Record<PlannerPart, PageLevel> = {
  front: PageLevel.FRONT_MATTER,
  month: PageLevel.MONTHLY,
  week: PageLevel.WEEKLY,
  day: PageLevel.DAILY,
};

/** The journal a planner starts: its parts' levels between the Beginning
 *  and the End, at the hero's trim, this quarter. Its spreads agree on the
 *  week's first day and the font (spreads.test.mts checks), so the first
 *  part's are the book's. */
export function journalForPlanner(planner: PlannerTemplate, title: string, browserTimeZone: string | null, today = new Date()): NewJournal {
  const parts = partsOf(planner);
  const first = HERO_BY_KEY[parts[0].key].layout;
  const inner = parts.filter(({ part }) => part !== "front").map(({ part }) => PART_LEVEL[part]);
  return {
    title,
    trim: "bound7x10",
    ...nextQuarter(today),
    levels: [PageLevel.FRONT_MATTER, ...inner, PageLevel.BACK_MATTER],
    dated: true,
    weekStartDay: first.weekStartsMonday ? 1 : 0,
    font: first.font,
    browserTimeZone,
  };
}

/** A new journal for `ownerId`: the whole of `planner`'s book, every part
 *  laid out from its spread, in one transaction. */
export async function createJournalFromPlanner(ownerId: string, planner: PlannerTemplate, title: string, browserTimeZone: string | null): Promise<BookWithPages> {
  const parts = partsOf(planner).map(({ part, key }) => ({ part, spread: HERO_BY_KEY[key] }));
  return createJournalFromParts(ownerId, parts, journalForPlanner(planner, title, browserTimeZone), planner.key);
}

/** The levels a book of these parts has: the Beginning and the End round
 *  its months, weeks and days, in binding order. */
export function levelsForParts(parts: Array<{ part: PlannerPart }>): PageLevel[] {
  const inner = (["month", "week", "day"] as const).filter((p) => parts.some(({ part }) => part === p)).map((p) => PART_LEVEL[p]);
  return [PageLevel.FRONT_MATTER, ...inner, PageLevel.BACK_MATTER];
}

/** A new journal for `ownerId` made as `journal` says, each part laid out
 *  from its spread - every module type checked first, then one
 *  transaction, so a journal is never left half laid out. */
export async function createJournalFromParts(
  ownerId: string,
  parts: Array<{ part: PlannerPart; spread: HeroSpread }>,
  journal: NewJournal,
  what: string
): Promise<BookWithPages> {
  const bySlug = await moduleTypesFor(
    parts.map(({ spread }) => spread),
    what
  );
  const book = await createBookFor(ownerId, journal);
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  for (const { part, spread } of parts) writes.push(...(await layOutLevel(book, spread, PART_LEVEL[part], bySlug)));
  await prisma.$transaction(writes);
  return book;
}
