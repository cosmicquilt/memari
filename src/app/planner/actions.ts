"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { PageLevel } from "@/generated/prisma/enums";
import {
  clampGridPlacement,
  rectsOverlap,
  moduleInstancesToRects,
  sidebarColumnSpan,
  columnSpanToDayCount,
  cellHeightPx,
  pixelHeightToRowSpan,
  rowsBelowHours,
  resolveZone,
  followerRowsAfterGrowth,
  resolveModulePlacement,
  gravityRepackAfterDeparture,
  type PageGrid,
} from "@/lib/grid";
import { MIN_ROW_SPAN, getMinRowSpanForSlug, minRowSpansForStack } from "@/lib/moduleMinRowSpan";
import { resolvePairResize } from "@/lib/stackResize";

/** A stored propValues column, as the floor rules want it. Prisma types it
 *  as JsonValue, and a row written before a prop existed simply has no key -
 *  getMinRowSpanForSlug layers whatever it gets over the schema defaults. */
const configOf = (mi: { propValues: unknown }): Record<string, unknown> =>
  (mi.propValues as Record<string, unknown> | null) ?? {};
import {
  canCrossZones, isSpineSlug, findSpine } from "@/lib/moduleRegistry";
import { PLANNER_TRIMS, type PlannerTrimKey } from "@/lib/planner-trims";
import { renderModuleInstance } from "@/lib/renderModuleInstance";
import {
  weekLayout,
  dayLayout,
  frontMatterLayout,
  backMatterLayout,
  monthLayout,
  missingPlacements,
  weekSidebarBoxes,
  weekTodoPlacements,
  weekHourlyPlacements,
  type PageLayout,
  type ExistingInstance,
} from "@/lib/pageLayouts";
import {
  getHourlyGridCoreContentHeightPx,
  getHourlyGridCoreOffModeMinHeightPx,
  hourlyPropsFromSettings,
  hourlyGapRows,
  DEFAULT_HOURLY_SETTINGS,
} from "@/lib/modules/hourlyGridCore";
import { fontFamilyFromTheme, type FontChoice, type PlannerTheme } from "@/lib/theme";

// Raw Polotno element shape we round-trip. Deliberately loose (Polotno's
// own element types vary by kind) — we're not interpreting these yet,
// just proving the DB can store and return whatever the canvas produces.
type PolotnoElement = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
};

// Shared by every action below that needs a PageGrid from a fetched Page
// row — the same 6-field mapping was being rebuilt inline in four
// separate places.
function pageGridFor(page: {
  widthPx: number;
  heightPx: number;
  gridColumns: number;
  gridRows: number;
  gridGapPx: number;
  marginPx: number;
}): PageGrid {
  return {
    widthPx: page.widthPx,
    heightPx: page.heightPx,
    gridColumns: page.gridColumns,
    gridRows: page.gridRows,
    boxInsetPx: page.gridGapPx / 2,
    marginPx: page.marginPx,
  };
}


// updateModuleConfig accepts propValues straight from the client and
// used to write it verbatim — a wrong type or an unexpected key would
// sail through, get stored, and then hit the unchecked
// `propValues as unknown as XConfig` casts in each module renderer
// (renderLabeledBox etc.) the next time the page renders server-side.
// Since page.tsx is a Server Component, a renderer throwing there breaks
// the *entire* /planner page for that user, not just the one module —
// worth guarding against even though this is self-scoped (a user can
// only do this to their own planner, never someone else's).
//
// Whitelists to the module type's own configSchema (a real JSON Schema,
// already stored per ModuleType — see prisma/seed.mts): unknown keys are
// dropped, wrong-typed values fall back to the schema's own default (the
// same default addPaletteModuleAt seeds a fresh instance with), enum
// values outside the allowed set are rejected the same way, and
// strings/arrays are capped to a sane length as a light bound on how
// much JSON one instance can accumulate.
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 100;

function sanitizePropValues(
  configSchema: unknown,
  propValues: Record<string, unknown>
): Record<string, unknown> {
  const schema = configSchema as {
    properties?: Record<
      string,
      { type?: string; enum?: unknown[]; items?: { type?: string }; default?: unknown }
    >;
  };
  const properties = schema.properties ?? {};
  const sanitized: Record<string, unknown> = {};

  for (const [key, def] of Object.entries(properties)) {
    const value = propValues[key];
    switch (def.type) {
      case "string": {
        const str = typeof value === "string" ? value.slice(0, MAX_STRING_LENGTH) : undefined;
        sanitized[key] = str ?? def.default ?? "";
        break;
      }
      case "boolean":
        sanitized[key] = typeof value === "boolean" ? value : Boolean(def.default);
        break;
      case "integer": {
        const n = typeof value === "number" && Number.isInteger(value) ? value : undefined;
        sanitized[key] = n !== undefined && (!def.enum || def.enum.includes(n)) ? n : def.default;
        break;
      }
      case "array": {
        const arr = Array.isArray(value)
          ? value
              .slice(0, MAX_ARRAY_LENGTH)
              .filter((item) => def.items?.type !== "string" || typeof item === "string")
              .map((item) => (typeof item === "string" ? item.slice(0, MAX_STRING_LENGTH) : item))
          : undefined;
        sanitized[key] = arr ?? def.default ?? [];
        break;
      }
      default:
        // A schema type this validator doesn't know how to check yet —
        // pass the value through as-is rather than silently discarding
        // a field. Every property type actually in use today (see
        // prisma/seed.mts) is one of the four cases above.
        sanitized[key] = value !== undefined ? value : def.default;
    }
  }

  return sanitized;
}

// Shared by every action that persists a change to a grid-placed instance
// and needs to hand the client back fresh JSON to swap into the live
// canvas (see PlannerEditorCanvas's swapCanvasElement) — the same
// "build the renderModuleInstance input from a DB row + a slug" shape
// was being repeated at each call site.
function renderInstance(
  row: {
    id: string;
    locked: boolean;
    columnStart: number | null;
    rowStart: number | null;
    columnSpan: number;
    rowSpan: number;
    propValues: unknown;
  },
  slug: string,
  pageGrid: PageGrid,
  fontFamily: string
) {
  const [element] = renderModuleInstance({ ...row, moduleType: { slug } }, pageGrid, fontFamily);
  return element;
}

// Same wrapper as renderInstance above, but returns every element
// renderModuleInstance produced instead of just the first — renderInstance's
// own `const [element] = ...` is only safe for a *non-locked* instance,
// which renderModuleInstance always wraps in exactly one synthetic
// `type:"group"` element (see that file's own comment). A locked instance
// (e.g. hourly-grid-core) renders as a flat list of many real elements
// instead — day-header rects, divider bars, and so on — and taking only
// the first one silently drops everything else. Reported directly: "all
// dividing lines and above days of the week disapear except for the
// leftmost box... persists until refreshing the page" — resizeHourlyGridCore
// is the first caller of this shared helper to ever hit a locked,
// multi-element instance (every existing renderInstance call site is
// scoped to non-locked types only, so this bug was latent until now).
function renderInstanceElements(
  row: {
    id: string;
    locked: boolean;
    columnStart: number | null;
    rowStart: number | null;
    columnSpan: number;
    rowSpan: number;
    propValues: unknown;
  },
  slug: string,
  pageGrid: PageGrid,
  fontFamily: string
) {
  return renderModuleInstance({ ...row, moduleType: { slug } }, pageGrid, fontFamily);
}

// The WEEK planner's default sidebar content — the 3 labeled boxes from
// the reference PDF (Gratitude/Reminders/Notes), sized in the same rough
// proportions (Notes gets the most room). Shared between getOrCreatePlanner
// (the initial seed, only ever applied once per planner — see its own
// hasSidebarContent check) and resetPlannerToTemplate below (the debug
// "put it back exactly like this" reset) so the two can't independently
// drift on what "the original layout" actually was.
// A function of the page's row count, because the two trims differ only in
// height: 36 rows on 7x10, 34 on Letter. Everything above Notes is fixed -
// week-title holds type that cannot shrink, and the other two were sized
// against the reference - so the difference lands on Notes, the largest
// box, where two dots are least visible. 36 -> 3/7/11/15, 34 -> 3/7/11/13.
// These three now READ the layout rather than restating it - see
// src/lib/pageLayouts.ts. They kept their shapes because
// resetPlannerToTemplate below consumes them in this form; what changed is
// that the numbers have exactly one home. The comments that used to live
// here, explaining why Notes absorbs the trim difference and why the to-do
// starts at row 21, moved there with them.
const weekSidebarTemplateBoxes = weekSidebarBoxes;
const weekTodoTemplate = weekTodoPlacements;
const WEEK_HOURLY_TEMPLATE = weekHourlyPlacements();

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

/**
 * The clear rows a spine keeps beneath it.
 *
 * Only the hours have a content height that stops short of their box, and
 * hourlyGapRows measures from it - handed a calendar's props it looks for
 * a start time that is not there and throws. Everything else fills its box
 * and simply keeps a whole cell clear, which is what the month template
 * leaves and what its resize handle offers.
 *
 * One function because there are three call sites and they have to agree:
 * a drop reserves this, a cross-zone move reserves it, and the editor's
 * own preview reserves it. Mirrors the same branch in resolveDrag.
 */
function spineGapRows(
  slug: string,
  cellPx: number,
  propValues: unknown,
  rowSpan: number
): number {
  return slug === "hourly-grid-core" ? hourlyGapRows(cellPx, propValues, rowSpan) : 1;
}

/**
 * The one book this person is building, with the pages of one LEVEL ready.
 *
 * ONE BOOK, NOT ONE PLANNER PER CADENCE. There used to be two of these - a
 * WEEK planner and a MONTH planner, two unrelated rows - because a page had
 * no way of saying how often it was printed. It has one now (Page.level), so
 * the weekly spread and the monthly spread are two LEVELS of one book, which
 * is what the timeline drawer needs and what a printed book actually is.
 *
 * Every lookup that used to filter on `baseType: "WEEK"` now just asks for
 * the owner's book. That filter existed to stop a week operation reading the
 * month planner's pages - reported as a month layout overlaying the week
 * spread - and the bug it guarded against cannot happen with one row.
 *
 * Idempotent, and safe to call for a level that already exists: it creates
 * the book if there is none, seeds this level's spread if that is missing,
 * and re-applies the level's layout, which is itself idempotent.
 */
const BOOK: Prisma.PlannerFindFirstArgs["orderBy"] = [{ createdAt: "asc" }, { id: "asc" }];

const WITH_PAGES = {
  pages: {
    orderBy: { position: "asc" },
    include: { moduleInstances: { include: { moduleType: true } } },
  },
} as const;

/** Which arrangement a level's pages start as. A level with no entry seeds
 *  blank pages, which is exactly right for front matter and for dailies -
 *  they have no spine to lay out around. */
// Every level now has one, so the Partial is doing nothing - but it stays,
// because a level added later must be allowed to start with a blank page
// rather than forcing someone to invent an arrangement for it first.
const LEVEL_LAYOUT: Partial<Record<PageLevel, (gridRows: number) => PageLayout>> = {
  FRONT_MATTER: frontMatterLayout,
  MONTHLY: monthLayout,
  WEEKLY: weekLayout,
  DAILY: dayLayout,
  BACK_MATTER: backMatterLayout,
};

/**
 * How many pages a level's set is.
 *
 * A week and a month are each a thing you look at whole, so they open flat -
 * two pages, the book laid open. A DAY is a day: one page, and ninety of them
 * as spreads is a book twice the size for no more content. Two consecutive
 * days face each other in the bound book anyway.
 */
const LEVEL_PAGE_COUNT: Record<PageLevel, number> = {
  FRONT_MATTER: 1,
  MONTHLY: 2,
  WEEKLY: 2,
  DAILY: 1,
  BACK_MATTER: 1,
};

export async function getOrCreateBook(level: PageLevel = PageLevel.WEEKLY) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  // Oldest first, id as the tie-break. Which row is "the book" must not
  // depend on what the database felt like returning - the same order
  // fold-books.mts uses to decide which planner survives a fold.
  let planner = await prisma.planner.findFirst({
    where: { ownerId: userId, isTemplate: false },
    orderBy: BOOK,
    include: WITH_PAGES,
  });

  if (!planner) {
    planner = await prisma.planner.create({
      data: {
        ownerId: userId,
        title: "My First Planner",
        // gridColumns/gridRows/gridGapPx are left unset here - Page's
        // schema defaults (24x36 lattice) apply.
        pages: {
          create: Array.from({ length: LEVEL_PAGE_COUNT[level] }, (_, position) => ({
            position,
            level,
          })),
        },
      },
      include: WITH_PAGES,
    });
  }

  let needsRefetch = false;

  // This level's own set. A spread is two pages - the book open flat,
  // position 0 on the left and 1 on the right - and a daily is one. Positions
  // are per level, so each level has its own 0.
  const wanted = LEVEL_PAGE_COUNT[level];
  const atLevel = (p: NonNullable<typeof planner>) =>
    p.pages.filter((page) => page.level === level);
  for (let position = atLevel(planner).length; position < wanted; position++) {
    await prisma.page.create({ data: { plannerId: planner.id, position, level } });
    needsRefetch = true;
    planner = await prisma.planner.findUniqueOrThrow({
      where: { id: planner.id },
      include: WITH_PAGES,
    });
  }

  // applyLayout takes the pages a placement's `page` index refers to, so a
  // one-page level hands it a one-page list rather than a spread with a hole
  // in it.
  const levelPages = atLevel(planner).sort((a, b) => a.position - b.position);
  const layout = LEVEL_LAYOUT[level];
  if (layout && (await applyLayout(layout(levelPages[0].gridRows), levelPages))) {
    needsRefetch = true;
  }

  if (needsRefetch) {
    planner = await prisma.planner.findUniqueOrThrow({
      where: { id: planner.id },
      include: WITH_PAGES,
    });
  }

  return planner;
}

// Debug-only "put the sidebar and the TO-DO checklist back exactly like
// they started" reset — see NativePlannerEditor's header button for
// where this is triggered. Scoped to two specific regions, not every
// non-locked instance on the planner:
//   1. The left page's sidebar — every labeled-box on either page,
//      regardless of its current column (see the delete's own comment
//      below for why this isn't columnStart:0-scoped the way it used
//      to be), replaced with the template's own sidebar boxes at
//      columnStart:0.
//   2. The area below the hourly grid, on BOTH pages — template default
//      is a full-height TO-DO checklist there (WEEK_TODO_TEMPLATE — see
//      its own comment for why this needs to exist here at all: it was
//      missing entirely until this was added, reported as "bottom
//      modules are gone" even after the sidebar-only version of this
//      fix, because the checklist that PDF page 3/4 actually show there
//      had simply never been seeded by anything, reset included). Any
//      habit-tracker sharing that space is deleted too, not just
//      shrunk-and-left-in-place: it's not part of the original
//      template (a fresh planner never has one — see getOrCreatePlanner's
//      own comment on why habit-tracker has no auto-heal step), so a
//      "put it back exactly like it started" reset has nothing to
//      preserve it for. Without this, a habit-tracker dropped in
//      earlier survives the checklist's delete+recreate untouched and
//      ends up sharing the checklist's newly-restored full-height cell
//      — reported directly: "reset to template, but left side on the
//      bottom is a hybrid between to do and habit."
// An even earlier version of this wiped every non-locked instance on
// both pages, unconditionally — that was worse than either of the above,
// silently deleting anything else the user might place on the page with
// nothing to replace it. All scoped deletes below key off moduleTypeId,
// not a position heuristic, so a checklist (or habit-tracker) the user
// moved or resized away from its template spot is still found and
// removed/replaced correctly. labeled-box's own delete matches both
// pages and any column for the exact same reason — it used to be
// columnStart:0-only (the sidebar's own template column), back when a
// labeled-box could never be anywhere else. The cross-zone feature
// broke that assumption: one dragged into the bottom zone (columnStart
// matching the hourly grid, not 0) survived this delete untouched and
// was left overlapping the freshly-recreated checklist there, reported
// directly: "when i reset template after moving side to bottom it
// stays there and ends up overlapping with the reset bottom module."
// Deleting every labeled-box on both pages regardless of position is
// safe, not overzealous: the sidebar's own template boxes are recreated
// fresh immediately after anyway, and a labeled-box in the bottom zone
// was never part of the original template to begin with (same
// reasoning habit-tracker's own delete right below already uses).
//
// week-title is left untouched regardless — there's no editor UI that
// can change it, so nothing on it could have drifted from the template.
// hourly-grid-core USED TO be the same story, but Page Settings > Hours
// (updateHourlySettings/resizeHourlyGridCore) is now real editor UI that
// changes it — its own rowSpan and start/end/interval/intervalMode/
// compactHourRows are reset back to the seed defaults below too, or a
// planner left with a resized/off-mode hourly grid after "reset to
// template" would still look wrong, and WEEK_TODO_TEMPLATE's own
// hardcoded rowStart: 21 (one past hourly-grid-core's default 20-row
// span) would land the freshly-recreated checklist/habit-tracker
// overlapping it instead of in the correct gap. dayLabels/dayCount/
// events/hourLineStyle/dayBorder are deliberately left alone — none of
// those are part of the Hours feature's own mutable surface, and
// dayLabels specifically holds real per-week data (Week Settings' own
// concern), not something a template reset should touch.
//
// No live-patchable return value the way updateModuleConfig/
// resizeAdjacentModules etc. have — reconstructing every piece of
// client state a wipe-and-reseed touches (placements, moduleLookup,
// instanceIdsByPageId, every derived stack/resize-pair map) would mean
// re-deriving everything loadPlannerPages already does correctly for a
// fresh page load. Simpler and more robust to do the database work here
// and let the caller just reload the page afterward — same choice
// updateWeekSettings already made, for the same reason.
/**
 * Switches the whole planner to a different page size.
 *
 * Re-lays the template afterwards rather than trying to reflow what is
 * there: the trims differ by two rows, and every stack in the spread is
 * packed to fill its zone exactly, so there is no slack to absorb the
 * difference anywhere. Templates are already functions of the row count
 * (weekSidebarTemplateBoxes, weekTodoTemplate), so the re-lay lands
 * correctly at either size with nothing trim-specific written down.
 */
export async function setPlannerTrim(trim: PlannerTrimKey) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");

  const spec = PLANNER_TRIMS[trim];
  const planner = await prisma.planner.findFirst({
    // The owner's book. Deterministic order, so which row this is never
    // depends on what the database felt like returning - see BOOK.
    where: { ownerId: userId, isTemplate: false },
    orderBy: BOOK,
    include: {
      pages: {
        orderBy: { position: "asc" },
        include: { moduleInstances: { include: { moduleType: true } } },
      },
    },
  });
  if (!planner) throw new Error("Planner not found");

  // Absorb the height difference at the BOTTOM of each stack rather than
  // re-laying the template, so whatever the user built survives the swap.
  //
  // The trims differ by exactly two rows and nothing else - same 24-dot
  // width, same square cell, same 20-dot hour block - so this is the same
  // operation as dragging a stack's bottom edge two rows, which the editor
  // already does. Only stacks anchored to the page bottom move: a stack
  // that ends mid-page is not what the missing rows came out of, and
  // growing it would open a gap the user never asked for.
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const page of planner.pages) {
    const delta = spec.gridRows - page.gridRows;
    if (delta === 0) continue;
    const pageGrid = pageGridFor({ ...page, gridRows: spec.gridRows });

    const byColumn = new Map<string, typeof page.moduleInstances>();
    for (const mi of page.moduleInstances) {
      if (mi.locked || mi.columnStart === null || mi.rowStart === null) continue;
      const key = `${mi.columnStart}:${mi.columnSpan}`;
      byColumn.set(key, [...(byColumn.get(key) ?? []), mi]);
    }

    for (const group of byColumn.values()) {
      const sorted = [...group].sort((a, b) => (a.rowStart ?? 0) - (b.rowStart ?? 0));
      const bottom = sorted[sorted.length - 1];
      const bottomEnd = (bottom.rowStart ?? 0) + bottom.rowSpan;
      // Only the stacks that reached the old page bottom.
      if (bottomEnd !== page.gridRows) continue;

      // Shrinking cascades upward once a member hits its own floor, the
      // same rule the resize handle follows; growing only ever grows the
      // last one.
      let remaining = delta;
      const spans = sorted.map((mi) => mi.rowSpan);
      if (delta > 0) {
        spans[spans.length - 1] += delta;
        remaining = 0;
      } else {
        for (let i = spans.length - 1; i >= 0 && remaining < 0; i--) {
          const floor = getMinRowSpanForSlug(
            sorted[i].moduleType.slug,
            pageGrid,
            sorted[i].columnSpan,
            configOf(sorted[i])
          );
          const give = Math.min(spans[i] - floor, -remaining);
          spans[i] -= Math.max(0, give);
          remaining += Math.max(0, give);
        }
      }

      // Repack from the stack's own top so no gaps open up.
      let cursor = sorted[0].rowStart ?? 0;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].rowStart !== cursor || sorted[i].rowSpan !== spans[i]) {
          updates.push(
            prisma.moduleInstance.update({
              where: { id: sorted[i].id },
              data: { rowStart: cursor, rowSpan: spans[i] },
            })
          );
        }
        cursor += spans[i];
      }
    }
  }

  await prisma.$transaction([
    prisma.page.updateMany({
      where: { id: { in: planner.pages.map((page) => page.id) } },
      data: {
        widthPx: spec.widthPx,
        heightPx: spec.heightPx,
        gridRows: spec.gridRows,
        marginPx: spec.marginPx,
      },
    }),
    ...updates,
  ]);
}

export async function resetPlannerToTemplate() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const planner = await prisma.planner.findFirst({
    // The owner's book. Deterministic order, so which row this is never
    // depends on what the database felt like returning - see BOOK.
    where: { ownerId: userId, isTemplate: false },
    orderBy: BOOK,
    include: {
      pages: {
        orderBy: { position: "asc" },
        include: { moduleInstances: { include: { moduleType: true } } },
      },
    },
  });
  if (!planner) {
    throw new Error("Planner not found");
  }
  const [leftPage, rightPage] = planner.pages;
  if (!leftPage || !rightPage) {
    throw new Error("Planner is missing a page");
  }
  const pagesById: Record<"left" | "right", { id: string }> = { left: leftPage, right: rightPage };

  const [boxType, checklistType, habitTrackerType] = await Promise.all([
    prisma.moduleType.findUniqueOrThrow({ where: { slug: "labeled-box" } }),
    prisma.moduleType.findUniqueOrThrow({ where: { slug: "todo-checklist" } }),
    prisma.moduleType.findUniqueOrThrow({ where: { slug: "habit-tracker" } }),
  ]);

  // Reset each page's own hourly-grid-core back to the seed default —
  // see this function's own header comment for why. Merges into each
  // instance's existing propValues (not a wholesale replace) so
  // dayLabels/dayCount/events/hourLineStyle/dayBorder survive untouched.
  const hourlyResets = [leftPage, rightPage].flatMap((page, pageIndex) => {
    const hourly = page.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
    if (!hourly) return [];
    const columns = pageIndex === 0 ? WEEK_HOURLY_TEMPLATE.left : WEEK_HOURLY_TEMPLATE.right;
    return [
      prisma.moduleInstance.update({
        where: { id: hourly.id },
        data: {
          // Columns as well as rowSpan. A "reset to template" that restores
          // only one of a block's two dimensions is not a reset.
          columnStart: columns.columnStart,
          rowStart: 0,
          columnSpan: columns.columnSpan,
          // 20 dots: 2 of header (13.7pt tab + 22.3pt gap = 36.0pt) plus
          // 36 half-hour slots at 9pt = 324pt = 18 dots. Lands exactly.
          rowSpan: 20,
          // rowSpan 20 above is only the right answer for these settings -
          // it counts 36 half-hour slots at 9pt. Restoring the geometry
          // without them is what left a planner reset from Tall drawing
          // 18pt rows in a box built for 9pt ones.
          propValues: hourlyPropsFromSettings(
            hourly.propValues,
            DEFAULT_HOURLY_SETTINGS
          ) as Prisma.InputJsonValue,
        },
      }),
    ];
  });

  // week-title was never restored at all - not its rowSpan, not its
  // columns - so it silently kept whatever geometry it had. It only moved
  // when the grid changed underneath it, which is exactly when a reset is
  // most likely to be the thing someone reaches for.
  const weekTitle = leftPage.moduleInstances.find((mi) => mi.moduleType.slug === "week-title");
  const titleResets = weekTitle
    ? [
        prisma.moduleInstance.update({
          where: { id: weekTitle.id },
          data: {
            columnStart: 0,
            rowStart: 0,
            columnSpan: weekTitle.moduleType.defaultColumnSpan,
            rowSpan: weekTitle.moduleType.defaultRowSpan,
          },
        }),
      ]
    : [];

  await prisma.$transaction([
    ...titleResets,
    ...hourlyResets,
    prisma.moduleInstance.deleteMany({
      where: { pageId: { in: [leftPage.id, rightPage.id] }, moduleTypeId: boxType.id },
    }),
    prisma.moduleInstance.createMany({
      data: weekSidebarTemplateBoxes(leftPage.gridRows).map((box) => ({
        pageId: leftPage.id,
        moduleTypeId: boxType.id,
        placementMode: "GRID" as const,
        columnStart: 0,
        rowStart: box.rowStart,
        columnSpan: boxType.defaultColumnSpan,
        rowSpan: box.rowSpan,
        propValues: { heading: box.heading, ruled: false, templateHeading: box.heading },
      })),
    }),
    prisma.moduleInstance.deleteMany({
      where: { pageId: { in: [leftPage.id, rightPage.id] }, moduleTypeId: checklistType.id },
    }),
    // Not part of the original template (see this function's own header
    // comment) — cleared alongside the checklist it shares the same
    // below-the-hourly-grid zone with, rather than left behind to
    // overlap the checklist's freshly-restored full-height cell.
    prisma.moduleInstance.deleteMany({
      where: { pageId: { in: [leftPage.id, rightPage.id] }, moduleTypeId: habitTrackerType.id },
    }),
    prisma.moduleInstance.createMany({
      data: weekTodoTemplate(leftPage.gridRows).map((todo) => ({
        pageId: pagesById[todo.page].id,
        moduleTypeId: checklistType.id,
        placementMode: "GRID" as const,
        columnStart: todo.columnStart,
        rowStart: todo.rowStart,
        columnSpan: todo.columnSpan,
        rowSpan: todo.rowSpan,
        propValues: { dayCount: todo.dayCount },
      })),
    }),
  ]);
}

// getOrCreateMonthPlanner is gone. It was "parallel to getOrCreatePlanner,
// not a generalization of it", and its own comment said the generalization
// was deferred "until the native editor's own requirements for how a user
// picks a planner are known". They are known now: a person has ONE book and
// the monthly spread is a level of it, so the two functions are one -
// getOrCreateBook(PageLevel.MONTHLY).

// Adds a module at wherever the user actually dropped it on the canvas
// (see PlannerEditorCanvas's palette drag handlers), snapped to the
// nearest grid cell and clamped so it can't hang off the page edge.
// Returns the freshly-rendered element (a Polotno group, per
// renderModuleInstance) so the client can insert it into the live store
// directly instead of reloading the page.
export async function addPaletteModuleAt(
  pageId: string,
  moduleTypeSlug: string,
  columnStart: number,
  rowStart: number
) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  // Serializable, not the default Read Committed: reading which cells are
  // occupied and then creating the new instance has to be atomic against
  // another concurrent call doing the same thing, or two near-simultaneous
  // drops (e.g. a duplicated drop event) can both read the page as "not
  // yet occupied" before either commits, both compute the same free cell,
  // and both land there — which is exactly how duplicate/overlapping
  // modules ended up in the DB. Serializable makes Postgres reject the
  // loser instead of silently allowing both writes; the client already
  // guards against the same-tab case (see PlannerEditorCanvas's
  // addInFlight ref), this is the backstop for anything that gets past it.
  const { page, created, reflowedRows } = await prisma.$transaction(
    async (tx) => {
      const page = await tx.page.findFirst({
        where: { id: pageId, planner: { ownerId: userId } },
        include: {
          moduleInstances: { include: { moduleType: true } },
          planner: { select: { theme: true } },
        },
      });
      if (!page) {
        throw new Error("Page not found or not owned by this user");
      }

      const moduleType = await tx.moduleType.findUniqueOrThrow({
        where: { slug: moduleTypeSlug },
      });

      // todo-checklist and habit-tracker size *and position* themselves
      // to match whichever page they land on — 3 day-columns wide,
      // starting at column 1 on the left (3-day) page (column 0 is the
      // sidebar), 4 wide starting at column 0 on the right (4-day) page
      // — by reading that page's own hourly-grid-core instance, rather
      // than always using the module type's fixed default/whatever
      // column the caller happened to request. Previously only
      // columnSpan was overridden, not columnStart — reported directly:
      // "habit tracker doesn't work on left side its to big" (a 4-wide
      // request the caller sends by default, starting at column 0,
      // still 1 column too wide *and* wrongly positioned even after the
      // span-only override, so it always collided with the sidebar's
      // own column-0 content there) "and the highlighted snap box
      // doesn't match the side it (3 wide on left, 4 wide on right)" —
      // the client's own live preview (NativePlannerEditor.tsx's
      // handleDragMove) had no idea this adjustment existed at all, so
      // it never requested the corrected column range in the first
      // place, compounding the same gap on the caller's side too.
      // Without any of this, a checklist/tracker dropped on the 4-day
      // page would also still only draw 3 day segments (the schema
      // default), out of step with the hourly grid it's sitting under.
      const pageGrid = pageGridFor(page);
      // The page's SPINE, whichever cadence it is. A module dropped on a
      // month page should take its columns from the calendar for the same
      // reason one dropped on a week page takes them from the hours: the
      // spine is what the zones are measured from.
      const hourlyGrid = findSpine(page.moduleInstances);

      let effectiveColumnStart = columnStart;
      let effectiveColumnSpan = moduleType.defaultColumnSpan;
      let effectiveRowSpan = moduleType.defaultRowSpan;
      // The caller's own requested row, passed straight through. Nothing
      // reassigns this any more - see the sidebar branch below.
      const effectiveRowStart = rowStart;
      const configOverrides: Record<string, unknown> = {};
      // EVERY module takes its width from the zone it lands in. This used
      // to be gated on three slugs by name - todo-checklist,
      // habit-tracker, labeled-box - and everything else fell through to
      // `moduleType.defaultColumnSpan`.
      //
      // That is why none of the new modules could be dropped. A matrix or
      // a progress meter defaults to 12 columns, so dropping one in a
      // 6-column sidebar asked for a box twice the sidebar's width: it
      // overlapped the hourly grid, could not be placed, and the drop did
      // nothing at all. Reported as the matrix drag not working, then
      // "other new modules dont work either".
      //
      // It also broke the reflow for the ones that DID fit, because
      // siblings are only allowed to shrink when their column range
      // matches the arrival's exactly (see paletteMinRowSpanById below) -
      // so a module arriving at anything other than the zone's own width
      // could never ask for room.
      //
      // Nothing here was ever really per-module: the rule is "an arriving
      // module fills its zone", which is the same rule
      // moveModuleAcrossZones applies to one crossing into that zone. The
      // slug list was just the set of modules that existed when it was
      // written - the pattern the registry exists to retire.
      {
        // todo-checklist and habit-tracker size *and position* themselves
        // to match whichever page they land on — 3 day-columns wide,
        // starting at column 1 on the left (3-day) page (column 0 is the
        // sidebar), 4 wide starting at column 0 on the right (4-day) page
        // — by reading that page's own hourly-grid-core instance, rather
        // than always using the module type's fixed default/whatever
        // column the caller happened to request. Previously only
        // columnSpan was overridden, not columnStart — reported directly:
        // "habit tracker doesn't work on left side its to big" (a 4-wide
        // request the caller sends by default, starting at column 0,
        // still 1 column too wide *and* wrongly positioned even after the
        // span-only override, so it always collided with the sidebar's
        // own column-0 content there) "and the highlighted snap box
        // doesn't match the side it (3 wide on left, 4 wide on right)" —
        // the client's own live preview (NativePlannerEditor.tsx's
        // handleDragMove) had no idea this adjustment existed at all, so
        // it never requested the corrected column range in the first
        // place, compounding the same gap on the caller's side too.
        // Without any of this, a checklist/tracker dropped on the 4-day
        // page would also still only draw 3 day segments (the schema
        // default), out of step with the hourly grid it's sitting under.
        //
        // That's all still true for a drop *in* the hourly grid's own
        // column range (the "bottom" zone) — labeled-box included now,
        // requested directly: "the notes in the bottom modules section
        // should fill the containers width (3 on left, 4 on right)."
        // Same column-matching override as todo-checklist/habit-tracker
        // already had; a labeled-box just has no dayCount prop to also
        // override, and its own renderer (labeledBox.ts) already
        // handles arbitrary width fine (that's how it works in the
        // sidebar at columnSpan 1 too), so it needs nothing else here.
        //
        // A drop *outside* that range instead — in practice, only ever
        // column 0 on the left page, the one column the hourly grid
        // there doesn't cover — lands as a single sidebar-width column
        // for todo-checklist/habit-tracker, with todo-checklist's own
        // dayCount forced to 1 (see that module's own top-of-file
        // comment: a single day-column IS just its existing per-day
        // loop run once, no renderer change needed) and habit-tracker
        // switching to its own compact, stacked layout at render time
        // purely from the narrower allocated width (see that module's
        // own comment on COMPACT_LAYOUT_MAX_WIDTH_PX). labeled-box
        // outside the bottom zone deliberately falls through this whole
        // block untouched instead (see the plain `else` below, not an
        // `else if` covering all three slugs) — it already has its own
        // long-established side-zone placement behavior (this is where
        // every existing sidebar box has always come from), and this
        // feature only ever needed to change what happens *in* the
        // bottom zone, not touch that.
        // resolveZone (grid.ts) is the shared rule. Infinity for the row
        // tolerance keeps this side's behaviour exactly as it was -
        // column containment alone, no row test. See that function.
        const zone =
          hourlyGrid && hourlyGrid.columnStart !== null && hourlyGrid.rowStart !== null
            ? resolveZone(
                { columnStart: hourlyGrid.columnStart, rowStart: hourlyGrid.rowStart,
                  columnSpan: hourlyGrid.columnSpan, rowSpan: hourlyGrid.rowSpan },
                { columnStart, rowStart },
                Number.POSITIVE_INFINITY
              )
            : null;
        const inBottomZone = zone?.isBottomZone ?? false;
        if (inBottomZone && hourlyGrid && hourlyGrid.columnStart !== null) {
          effectiveColumnStart = hourlyGrid.columnStart;
          effectiveColumnSpan = hourlyGrid.columnSpan;
          // A to-do's day count used to be written here, copied off the
          // hourly grid it was landing under. It is derived from the span
          // at render now (see the registry's derivedProps), so writing it
          // stored a second description of the same width - the thing that
          // had to be kept in step along every path that could change a
          // span, and was not.

          // This branch used to also force effectiveRowStart to the
          // zone's own bottom edge, appending the new module below
          // everything already there and ignoring the requested row.
          // See the sidebar branch below for why that is gone.
        } else {
          // Sidebar (side-zone) compact placement — see this block's own
          // top comment for the full reasoning, including why labeled-box
          // doesn't reach this branch at all (a plain `else`, not `else if`,
          // would have). columnStart is left as the caller's own request
          // (in practice always 0, the sidebar's own first column).
          //
          // The span was the literal 1 here, which meant "the sidebar" only
          // while a page was 4 columns wide. On the lattice it is 6, and
          // this committed a habit-tracker one 1/4in dot wide - its title
          // overflowing, its day letters piled up, and an add zone offered
          // under the one-dot stack it formed.
          effectiveColumnSpan = sidebarColumnSpan(pageGrid, hourlyGrid?.columnStart);
          // A to-do's dayCount used to be written here too. It is derived
          // from the span at render (see the registry's derivedProps), so
          // storing it was a second description of the same width - the
          // bug the bottom-zone branch above already stopped doing.

          // The requested row is honoured, not overridden.
          //
          // Both this branch and the bottom-zone one above used to end
          // by forcing effectiveRowStart to the deepest existing bottom
          // edge in the column - append to the end of the zone. That
          // was right when a palette drop was its own path with a
          // dashed-rectangle preview and no meaningful row to point at.
          // It is wrong now: the drag previews the module inserted at a
          // specific row, with siblings shrinking around it, and the
          // caller passes exactly the row that preview resolved. The
          // server then quietly appended it to the bottom instead.
          //
          // The visible symptom was not the module being low down - it
          // was a HOLE. The client optimistically commits the preview's
          // own reflow on release and then applies whatever the server
          // says moved. Appending moves nobody, so the server's
          // "reflowed" list came back empty, the optimistically-shifted
          // siblings were never corrected, and the space they had
          // opened up mid-stack stayed open with the new module sitting
          // below all of it. Reported as "i dropped habits on side ...
          // it went in the side but left a large gap above it."
          //
          // What is left here is the part still true: the sidebar is
          // one column wide, and a to-do renders one day-column in it.
          // Sizing is settled below by getMinRowSpanForSlug (the
          // arriving-size rule, which already overwrote everything this
          // branch used to compute), and fitting is settled by
          // resolveModulePlacement, which unlike the old fixed-size
          // search can ask siblings to shrink - the same thing the
          // preview was already showing.
        }
      }

      // The size a module gets for ARRIVING in a zone, which is what
      // this is - the same getMinRowSpanForSlug moveModuleAcrossZones
      // gives one crossing into the same zone.
      //
      // Everything above computed effectiveRowSpan from defaultRowSpan
      // (10 for a to-do or a habit tracker), shrinking it only when it
      // would not otherwise fit. That was the rule when a palette drop
      // was its own separate path with a dashed-rectangle preview. It
      // is not the rule the drag shows any more: the preview renders
      // the module at the arriving size, so committing ten rows made it
      // visibly resize itself the instant it was released. Reported as
      // a to-do and a habit tracker "not rendering in place."
      //
      // Applied last, after every branch above has settled
      // effectiveColumnSpan, because the minimum depends on the width.
      effectiveRowSpan = getMinRowSpanForSlug(
        moduleTypeSlug,
        pageGrid,
        effectiveColumnSpan,
        // A module that does not exist yet has no stored props - only
        // whatever this drop overrides. The rest comes from the schema.
        configOverrides
      );
      const candidate = clampGridPlacement(pageGrid, {
        columnStart: effectiveColumnStart,
        rowStart: effectiveRowStart,
        columnSpan: effectiveColumnSpan,
        rowSpan: effectiveRowSpan,
      });
      // Don't drop a new module on top of something already there — find
      // the nearest free cell instead of just clamping to the page edge.
      // Plain relocation rather than the drag-reposition path's stack
      // reflow (see PlannerEditorCanvas) — reasonable for a fresh drop,
      // which doesn't have "siblings it was already part of" to reorder
      // among.
      const occupied: Array<{
        id: string;
        locked: boolean;
        columnStart: number;
        rowStart: number;
        columnSpan: number;
        rowSpan: number;
      }> = [];
      for (const mi of page.moduleInstances) {
        if (mi.columnStart === null || mi.rowStart === null) continue;
        occupied.push({
          id: mi.id,
          locked: mi.locked,
          columnStart: mi.columnStart,
          rowStart: mi.rowStart,
          columnSpan: mi.columnSpan,
          rowSpan: mi.rowSpan,
        });
      }
      // Reserves the same 1-row breathing gap below hourly-grid-core
      // that WEEK_TODO_TEMPLATE's own seed values already leave
      // (rowStart 20, one past the grid's own rowStart 0 + rowSpan 19 —
      // see that constant's own comment) and resizeStackFromBottom's
      // cascade math never eats into — a synthetic 1-row-tall occupied
      // rect, not a special case in the resolver itself, so
      // resolveModulePlacement treats it exactly as it would a real
      // locked module sitting there. Reported directly: "dragged in
      // bottom modules have no 1 unit gap with hours" — a palette drop
      // had no way to know about this convention at all before, landing
      // flush against the grid instead. Column-range overlap only, so
      // this is inert for anything not sharing a column with the grid —
      // a sidebar box on the left page's column 0 is never affected by
      // the grid's own 1-3 range there.
      if (hourlyGrid && hourlyGrid.columnStart !== null && hourlyGrid.rowStart !== null) {
        // Carries an id and locked:true so it stays a real member of
        // the others list now that resolveModulePlacement consumes it -
        // same virtual-lock convention resolveDrag uses client-side
        // (__hourlygridgap__), and locked keeps it a bound rather than
        // something the reflow could try to move.
        // Half a cell or a full one, depending on where the hours end -
        // see hourlyGapRows. Zero rows whenever the block's own rounding
        // up to whole cells already leaves that much slack, which is the
        // common case; reserving a row on top of it was what made the gap
        // nearly two cells.
        const gapRows = spineGapRows(
          hourlyGrid.moduleType.slug,
          cellHeightPx(pageGrid),
          hourlyGrid.propValues,
          hourlyGrid.rowSpan
        );
        if (gapRows > 0) {
          occupied.push({
            id: "__hourlygridgap__",
            locked: true,
            columnStart: hourlyGrid.columnStart,
            rowStart: hourlyGrid.rowStart + hourlyGrid.rowSpan,
            columnSpan: hourlyGrid.columnSpan,
            rowSpan: gapRows,
          });
        }
      }
      // Resolve the way a cross-zone MOVE resolves, not by hunting for
      // a gap. findNearestFreeCell only ever finds space that is
      // already free - it never asks anyone to make room - so a drop
      // into a full zone landed somewhere the user had not pointed at,
      // while the drag preview had been showing the zone's own modules
      // shrinking to admit it. Preview and commit disagreeing, which is
      // the failure mode this system is most prone to.
      //
      // Mirrors moveModuleAcrossZones' own identical block below: the
      // same resolveModulePlacement, the same minRowSpanById floors for
      // siblings sharing the target column, the same reflow applied
      // afterwards. draggedOriginalRowStart is undefined here and only
      // here - a fresh module has no row it is coming from, which is
      // exactly the "insert new content" case the resolver already has
      // a documented default for.
      const paletteMinRowSpanById: Record<string, number> = {};
      for (const o of occupied) {
        if (o.locked) continue;
        if (o.columnStart !== effectiveColumnStart || o.columnSpan !== effectiveColumnSpan) continue;
        const otherMi = page.moduleInstances.find((mi) => mi.id === o.id);
        if (!otherMi) continue;
        paletteMinRowSpanById[o.id] = getMinRowSpanForSlug(
          otherMi.moduleType.slug,
          pageGrid,
          effectiveColumnSpan,
          configOf(otherMi)
        );
      }
      const paletteResolution = resolveModulePlacement(
        pageGrid,
        { ...candidate, columnStart: effectiveColumnStart, columnSpan: effectiveColumnSpan, rowSpan: effectiveRowSpan },
        occupied,
        undefined,
        paletteMinRowSpanById
      );
      // The editor already showed "no room" and never sends this; a
      // refusal here means the two disagreed, and the answer is still to
      // write nothing rather than a module on top of another.
      if (!paletteResolution.fits) {
        throw new Error("No room here: every module in this zone is already at its minimum size");
      }
      const { placement: resolvedPlacement, reflow: paletteReflow } = paletteResolution;

      // Pack the arriving module up against whatever sits directly
      // above it, exactly as resolveDrag does client-side for a
      // crossing (NativePlannerEditor.tsx - see its own comment for the
      // derivation). resolveModulePlacement only reflows on a
      // COLLISION, so a drop into free space stays wherever it was
      // asked for; every other placement path in this app gravitates to
      // the top of its zone, and the drag preview already draws it
      // there. Without this, honouring the requested row above would
      // have traded one gap for another.
      //
      // Measured against the post-reflow picture, since a sibling that
      // just moved to make room defines the real edge above. The zone's
      // own ceiling needs no special case: __hourlygridgap__ bounds the
      // bottom zone and week-title the sidebar, both already in
      // `occupied` spanning the right columns. Only ever pulls UP, and
      // only into genuinely empty space.
      const paletteMovedById = new Map(paletteReflow.map((m) => [m.id, m]));
      let paletteTopEdge = 0;
      for (const o of occupied) {
        if (o.columnStart >= effectiveColumnStart + effectiveColumnSpan) continue;
        if (o.columnStart + o.columnSpan <= effectiveColumnStart) continue;
        const moved = paletteMovedById.get(o.id);
        const bottom = (moved?.rowStart ?? o.rowStart) + (moved?.rowSpan ?? o.rowSpan);
        if (bottom <= resolvedPlacement.rowStart && bottom > paletteTopEdge) paletteTopEdge = bottom;
      }
      const clamped =
        paletteTopEdge < resolvedPlacement.rowStart
          ? { ...resolvedPlacement, rowStart: paletteTopEdge }
          : resolvedPlacement;

      // Pull each config field's declared default out of the JSON
      // Schema, so a freshly-added instance starts in a sensible state,
      // then layer the page-specific overrides (dayCount, above) on top.
      const schema = moduleType.configSchema as {
        properties?: Record<string, { default?: unknown }>;
      };
      const defaultConfig: Record<string, unknown> = {
        ...Object.fromEntries(
          Object.entries(schema.properties ?? {}).map(([key, def]) => [key, def.default])
        ),
        ...configOverrides,
      };
      // See getOrCreatePlanner's identical field on its own seeded boxes
      // for what this is for — a freshly palette-dropped box's "full
      // reset" target is just its own starting heading (the schema
      // default, "Notes"), same as any other instance's is whatever it
      // started as.
      if (moduleTypeSlug === "labeled-box") {
        defaultConfig.templateHeading = defaultConfig.heading;
      }

      // Rows are kept, not discarded. The caller has to be told what
      // MOVED as well as what was created - see the return value.
      const reflowedRows: Awaited<ReturnType<typeof tx.moduleInstance.update>>[] = [];
      for (const move of paletteReflow) {
        reflowedRows.push(
          await tx.moduleInstance.update({
            where: { id: move.id },
            data:
              move.rowSpan !== undefined
                ? { rowStart: move.rowStart, rowSpan: move.rowSpan }
                : { rowStart: move.rowStart },
          })
        );
      }
      const created = await tx.moduleInstance.create({
        data: {
          pageId,
          moduleTypeId: moduleType.id,
          placementMode: "GRID",
          columnStart: clamped.columnStart,
          rowStart: clamped.rowStart,
          columnSpan: effectiveColumnSpan,
          rowSpan: effectiveRowSpan,
          propValues: defaultConfig as Prisma.InputJsonValue,
        },
      });

      return { page, moduleType, effectiveColumnSpan, created, reflowedRows };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  const pageGrid = pageGridFor(page);
  const paletteFontFamily = fontFamilyFromTheme(page.planner.theme);
  const element = renderInstance(created, moduleTypeSlug, pageGrid, paletteFontFamily);

  return {
    instanceId: created.id,
    // columnStart/rowStart: the *actual* committed position, not just
    // an echo of whatever the caller asked for — resolveModulePlacement
    // above can land the candidate somewhere the caller never
    // explicitly requested, whether by reordering it into the target
    // stack, shrinking siblings around it, or relocating it outright
    // when neither fits. handleAddModule (NativePlannerEditor.
    // tsx) used to trust its own client-side columnStart/rowStart
    // unconditionally instead of reading this back — safe as long as
    // the client's own guess and this function's own resolution could
    // never disagree, which stopped being reliably true the moment two
    // independent copies of the same gap-reservation logic existed in
    // two different files. Returning the real, authoritative position
    // here removes that assumption entirely rather than trying to keep
    // both copies in perfect lockstep by hand.
    columnStart: created.columnStart,
    rowStart: created.rowStart,
    columnSpan: created.columnSpan,
    rowSpan: created.rowSpan,
    propValues: created.propValues,
    element,
    // Everything the drop MOVED, re-rendered at its new geometry, the
    // same shape moveModuleAcrossZones returns. Without this the caller
    // applied the new module and nothing else, so siblings stayed where
    // they were client-side while the new module was drawn in the space
    // they had just been told to vacate - two modules on one cell, both
    // painted. Reported as a habit tracker and a to-do "combining into
    // a hybrid module with both titles overlapping."
    reflowed: reflowedRows.map((row) => ({
      id: row.id,
      rowStart: row.rowStart as number,
      rowSpan: row.rowSpan,
      elements: renderInstanceElements(
        row,
        page.moduleInstances.find((mi) => mi.id === row.id)?.moduleType.slug ?? moduleTypeSlug,
        pageGrid,
        paletteFontFamily
      ),
    })),
  };
}

// Persists a drag-to-reposition move. The client already snapped the
// module to its nearest grid cell visually before calling this (see
// PlannerEditorCanvas) — this re-clamps server-side too, so a client bug
// or stale data can't push a module off the page or move a locked one.
export async function updateModulePlacement(
  instanceId: string,
  placement: { columnStart: number; rowStart: number }
) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const instance = await prisma.moduleInstance.findFirst({
    where: { id: instanceId, page: { planner: { ownerId: userId } } },
    include: { page: true },
  });
  if (!instance) {
    throw new Error("Module instance not found or not owned by this user");
  }
  if (instance.locked) {
    throw new Error("Cannot reposition a locked module");
  }

  const pageGrid = pageGridFor(instance.page);
  const clamped = clampGridPlacement(pageGrid, {
    columnStart: placement.columnStart,
    rowStart: placement.rowStart,
    columnSpan: instance.columnSpan,
    rowSpan: instance.rowSpan,
  });

  await prisma.moduleInstance.update({
    where: { id: instanceId },
    data: { columnStart: clamped.columnStart, rowStart: clamped.rowStart },
  });
}

// Repositioning an existing todo-checklist/habit-tracker/labeled-box
// across the side-zone/bottom-zone boundary — requested directly: "make
// it so i can drag side modules to the bottom and bottom modules to the
// side and they insert as the minimum height and change according
// widths automatically depending on section... resizing sections around
// them even if the section is full." Deliberately a separate action from
// updateModulePlacement above (which stays untouched as the fast path
// for the overwhelming majority of drags — an ordinary same-zone
// reposition never changes columnSpan/rowSpan and has nothing to
// re-render), since crossing zones can change size, config
// (todo-checklist's own dayCount), and even shrink OTHER siblings to
// make room — none of which a plain columnStart/rowStart write can
// express.
//
// `columnStart`/`rowStart` from the caller are only ever used to
// determine *which zone* the drop targets and where to insert within
// it — never trusted as the final columnSpan/rowSpan/exact position,
// which are fully re-derived here (same zone-classification idiom
// addPaletteModuleAt already uses for a fresh drop, and the same
// dayCount override it already applies for todo-checklist) before
// handing off to resolveModulePlacement (grid.ts, shared with the
// client's own live-preview copy in resolveDrag) for the authoritative
// placement — including its new shrink-existing-siblings tier, which is
// the actual "even if the section is full" behavior; nothing here
// reimplements it.
export async function moveModuleAcrossZones(instanceId: string, targetPageId: string, columnStart: number, rowStart: number) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  // Fetches the whole planner's own pages (each with its own
  // moduleInstances), not just the dragged instance's own source page —
  // a cross-page crossing needs BOTH the source page's own siblings
  // (for the departure-side gravity-fill) and the target page's own
  // siblings (for the shrink-cascade/reorder), and this is genuinely
  // new: there's no existing precedent anywhere in this app for
  // reassigning an existing ModuleInstance's own pageId, so ownership
  // needs to be established for both pages, not just the source one.
  // Scoping targetPage's own lookup to planner.pages (rather than a
  // second, unscoped query by id) gets the "does targetPageId actually
  // belong to this same, already-ownership-checked planner" check for
  // free — a same-page move (targetPageId === instance.pageId, the
  // overwhelming majority of every call to this action) just finds
  // itself in that same array.
  const instance = await prisma.moduleInstance.findFirst({
    where: { id: instanceId, page: { planner: { ownerId: userId } } },
    include: {
      moduleType: true,
      page: {
        include: {
          planner: {
            include: {
              pages: {
                orderBy: { position: "asc" },
                include: { moduleInstances: { include: { moduleType: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!instance) {
    throw new Error("Module instance not found or not owned by this user");
  }
  if (instance.locked) {
    throw new Error("Cannot reposition a locked module");
  }
  if (instance.columnStart === null || instance.rowStart === null) {
    throw new Error("Module isn't grid-placed");
  }
  const sourcePage = instance.page.planner.pages.find((p) => p.id === instance.pageId);
  const targetPage = instance.page.planner.pages.find((p) => p.id === targetPageId);
  if (!sourcePage || !targetPage) {
    throw new Error("Target page not found on this planner");
  }

  const slug = instance.moduleType.slug;
  if (!canCrossZones(slug)) {
    throw new Error("This module type can't cross zones");
  }

  const sourcePageGrid = pageGridFor(sourcePage);
  const targetPageGrid = pageGridFor(targetPage);
  const hourlyGrid = findSpine(targetPage.moduleInstances);
  // Same shared rule, same Infinity tolerance - see resolveZone (grid.ts).
  const zone =
    hourlyGrid && hourlyGrid.columnStart !== null && hourlyGrid.rowStart !== null
      ? resolveZone(
          { columnStart: hourlyGrid.columnStart, rowStart: hourlyGrid.rowStart,
            columnSpan: hourlyGrid.columnSpan, rowSpan: hourlyGrid.rowSpan },
          { columnStart, rowStart },
          Number.POSITIVE_INFINITY
        )
      : null;
  const inBottomZone = zone?.isBottomZone ?? false;

  let effectiveColumnStart: number;
  let effectiveColumnSpan: number;
  const configOverrides: Record<string, unknown> = {};
  if (inBottomZone && hourlyGrid && hourlyGrid.columnStart !== null) {
    effectiveColumnStart = hourlyGrid.columnStart;
    effectiveColumnSpan = hourlyGrid.columnSpan;
  } else {
    // Side zone. Reached by every zone-crossing type now, labeled-box
    // included — see canCrossZones (grid.ts) for why that used to throw
    // here instead, and why the asymmetry was a bug.
    effectiveColumnStart = 0;
    // The fourth copy of this literal. A module dragged into the sidebar
    // landed one 1/4in dot wide, exactly as a palette drop did before
    // addPaletteModuleAt was fixed - same bug, different entry point.
    effectiveColumnSpan = sidebarColumnSpan(targetPageGrid, hourlyGrid?.columnStart ?? null);
    if (slug === "todo-checklist") {
      configOverrides.dayCount = columnSpanToDayCount(targetPageGrid, effectiveColumnSpan);
    }
  }
  const effectiveRowSpan = getMinRowSpanForSlug(slug, targetPageGrid, effectiveColumnSpan, {
    // Its own stored props, plus anything this move overrides (a to-do's
    // dayCount changes with the zone). Content travels with the module.
    ...configOf(instance),
    ...configOverrides,
  });

  const sourceOthers: Array<{ id: string; locked: boolean; columnStart: number; rowStart: number; columnSpan: number; rowSpan: number }> =
    [];
  for (const mi of sourcePage.moduleInstances) {
    if (mi.id === instance.id || mi.columnStart === null || mi.rowStart === null) continue;
    sourceOthers.push({
      id: mi.id,
      locked: mi.locked,
      columnStart: mi.columnStart,
      rowStart: mi.rowStart,
      columnSpan: mi.columnSpan,
      rowSpan: mi.rowSpan,
    });
  }
  const targetOthers: Array<{ id: string; locked: boolean; columnStart: number; rowStart: number; columnSpan: number; rowSpan: number }> =
    [];
  let hourlyGridRect: {
    columnStart: number;
    rowStart: number;
    columnSpan: number;
    rowSpan: number;
    // Carried so the breathing gap below can be computed from where the
    // hours actually end rather than assumed to be one row - and the slug
    // with it, because only the hours have an end that is not their own
    // bottom edge. See spineGapRows.
    propValues: unknown;
    slug: string;
  } | null = null;
  for (const mi of targetPage.moduleInstances) {
    if (mi.id === instance.id || mi.columnStart === null || mi.rowStart === null) continue;
    targetOthers.push({
      id: mi.id,
      locked: mi.locked,
      columnStart: mi.columnStart,
      rowStart: mi.rowStart,
      columnSpan: mi.columnSpan,
      rowSpan: mi.rowSpan,
    });
    if (isSpineSlug(mi.moduleType.slug)) {
      // The slug travels with it: this is whichever spine the page has,
      // and the gap rule below has to know which kind it got.
      hourlyGridRect = { columnStart: mi.columnStart, rowStart: mi.rowStart, columnSpan: mi.columnSpan, rowSpan: mi.rowSpan, propValues: mi.propValues, slug: mi.moduleType.slug };
    }
  }
  // Same synthetic 1-row breathing-gap reservation below hourly-grid-core
  // as resolveDrag's own identical block (NativePlannerEditor.tsx) and
  // addPaletteModuleAt above — keeps a landing flush against the hourly
  // grid unreachable here too, not just on a same-zone drag. Reserved
  // against the TARGET page's own hourly grid, same as resolveDrag.
  if (hourlyGridRect) {
    const gapRows = spineGapRows(
      hourlyGridRect.slug,
      cellHeightPx(targetPageGrid),
      hourlyGridRect.propValues,
      hourlyGridRect.rowSpan
    );
    if (gapRows > 0) {
      targetOthers.push({
        id: "__hourlygridgap__",
        locked: true,
        columnStart: hourlyGridRect.columnStart,
        rowStart: hourlyGridRect.rowStart + hourlyGridRect.rowSpan,
        columnSpan: hourlyGridRect.columnSpan,
        rowSpan: gapRows,
      });
    }
  }

  const candidate = { columnStart: effectiveColumnStart, rowStart, columnSpan: effectiveColumnSpan, rowSpan: effectiveRowSpan };
  const minRowSpanById = minRowSpansForStack(targetPageGrid, candidate, targetOthers, (id) => {
    const mi = targetPage.moduleInstances.find((m) => m.id === id);
    return mi ? { slug: mi.moduleType.slug, propValues: configOf(mi) } : undefined;
  });

  const resolution = resolveModulePlacement(
    targetPageGrid,
    candidate,
    targetOthers,
    instance.rowStart,
    minRowSpanById
  );
  // Nothing has been written yet. See addPaletteModuleAt's identical
  // refusal: the editor shows "no room" and keeps the module where it was.
  if (!resolution.fits) {
    throw new Error("No room here: every module in this zone is already at its minimum size");
  }
  const { placement: resolved, reflow } = resolution;

  // Crossing leaves a gap in the SOURCE zone (the one being left) —
  // resolveModulePlacement above only ever reorders/reflows the TARGET
  // zone's own stack (candidate's own column, on whichever page it
  // lives on), since that's the only one this module's own new
  // placement ever collides with. Mirrors resolveDrag's own identical
  // addition (NativePlannerEditor.tsx) — requested directly: "side
  // modules dont live update or move to fill empty space accordingly."
  // Always against sourceOthers (this module's OWN page), never
  // targetOthers — the gap being closed is always on the page being
  // LEFT, regardless of where the module is going. Computed against the
  // module's own ORIGINAL columnStart/rowStart (before this move) — the
  // source and target stacks never share a column range on the SAME
  // page, so this can never collide with (or duplicate an id already
  // in) the target-zone reflow above; when source and target ARE the
  // same page (the ordinary same-page case), they're still different
  // columns for the same reason.
  const sourceGravity = gravityRepackAfterDeparture(
    { id: instance.id, columnStart: instance.columnStart, rowStart: instance.rowStart, columnSpan: instance.columnSpan, rowSpan: instance.rowSpan },
    sourceOthers
  );

  const updates: ReturnType<typeof prisma.moduleInstance.update>[] = [];
  const instanceUpdateData: {
    pageId: string;
    columnStart: number;
    rowStart: number;
    columnSpan: number;
    rowSpan: number;
    propValues?: Prisma.InputJsonValue;
  } = {
    // Written unconditionally, even for a same-page move — that just
    // writes back the value the row already had, harmless, and keeps
    // this one code path correct for both cases rather than needing a
    // conditional.
    pageId: targetPageId,
    columnStart: resolved.columnStart,
    rowStart: resolved.rowStart,
    columnSpan: effectiveColumnSpan,
    rowSpan: effectiveRowSpan,
  };
  if (Object.keys(configOverrides).length > 0) {
    instanceUpdateData.propValues = { ...(instance.propValues as object), ...configOverrides } as Prisma.InputJsonValue;
  }
  updates.push(prisma.moduleInstance.update({ where: { id: instance.id }, data: instanceUpdateData }));
  for (const move of reflow) {
    updates.push(
      prisma.moduleInstance.update({
        where: { id: move.id },
        data: move.rowSpan !== undefined ? { rowStart: move.rowStart, rowSpan: move.rowSpan } : { rowStart: move.rowStart },
      })
    );
  }
  for (const move of sourceGravity) {
    updates.push(
      prisma.moduleInstance.update({
        where: { id: move.id },
        data: move.rowSpan !== undefined ? { rowStart: move.rowStart, rowSpan: move.rowSpan } : { rowStart: move.rowStart },
      })
    );
  }

  const updated = await prisma.$transaction(updates);

  const fontFamily = fontFamilyFromTheme(instance.page.planner.theme);
  const slugById = new Map<string, string>([[instance.id, slug]]);
  for (const move of reflow) {
    const otherMi = targetPage.moduleInstances.find((mi) => mi.id === move.id);
    if (otherMi) slugById.set(move.id, otherMi.moduleType.slug);
  }
  for (const move of sourceGravity) {
    const otherMi = sourcePage.moduleInstances.find((mi) => mi.id === move.id);
    if (otherMi) slugById.set(move.id, otherMi.moduleType.slug);
  }
  // Target page's own grid for the dragged instance and its target-
  // reflow siblings, source page's own grid for source-gravity rows —
  // both shapes are confirmed identical today (same schema defaults on
  // every page), but this makes that correctness explicit rather than
  // incidental to it.
  const targetIds = new Set<string>([instance.id, ...reflow.map((m) => m.id)]);
  return updated.map((row) => ({
    id: row.id,
    rowStart: row.rowStart as number,
    rowSpan: row.rowSpan,
    elements: renderInstanceElements(row, slugById.get(row.id) ?? slug, targetIds.has(row.id) ? targetPageGrid : sourcePageGrid, fontFamily),
  }));
}

// Removes a module the user deleted from the canvas (see
// PlannerEditorCanvas's save flow, which diffs the tracked ids it started
// with against what's still on the page).
export async function deleteModuleInstance(instanceId: string) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const instance = await prisma.moduleInstance.findFirst({
    where: { id: instanceId, page: { planner: { ownerId: userId } } },
  });
  if (!instance) {
    throw new Error("Module instance not found or not owned by this user");
  }
  if (instance.locked) {
    throw new Error("Cannot delete a locked module");
  }

  await prisma.moduleInstance.delete({ where: { id: instanceId } });
}

// Deletes a module from the live native editor's hover-to-delete button
// and "gravitates" the rest of its same-column stack to fill the gap —
// distinct from deleteModuleInstance above, which is a plain delete with
// no repacking, used by the old editor's diff-on-save flow where leaving
// a hole behind is fine (the whole page reloads fresh afterward anyway).
//
// Walks both directions from the deleted module to collect the full
// contiguous same-column unlocked stack it was part of (same adjacency
// test resizeStackFromBottom's own stack-collection uses, just followed
// upward *and* downward here since any member, not only the bottom, can
// be the one deleted), then repacks everything BUT the deleted module
// contiguously from the stack's own top anchor. Members that were above
// the deleted one land back exactly where they already were (nothing
// before them changed); members that were below shift up to close the
// gap it leaves — "gravity," matching what was asked for. Only rowStart
// changes for any of them; rowSpan (and therefore rendered content) is
// completely untouched, so — unlike a resize — nothing here needs to be
// server-re-rendered, only repositioned. The freed rows end up as one
// contiguous block at the stack's own new bottom, which is exactly the
// space stackBottomsByPageId/AddModuleButton (NativePlannerEditor.tsx)
// already knows how to offer back up as an add-module "+" zone — no
// separate handling needed for "deleted the bottom module" vs "deleted
// one in the middle," they fall out of the same repack.
export async function deleteModuleWithGravity(instanceId: string) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const target = await prisma.moduleInstance.findFirst({
    where: { id: instanceId, page: { planner: { ownerId: userId } } },
    include: { page: { include: { moduleInstances: true } } },
  });
  if (!target) {
    throw new Error("Module instance not found or not owned by this user");
  }
  if (target.locked) {
    throw new Error("Cannot delete a locked module");
  }
  if (target.columnStart === null || target.rowStart === null) {
    throw new Error("Module isn't grid-placed");
  }
  const columnStart = target.columnStart;
  const rowStart = target.rowStart;

  const siblings = target.page.moduleInstances.filter(
    (mi): mi is typeof mi & { rowStart: number } =>
      mi.id !== target.id &&
      !mi.locked &&
      mi.columnStart === columnStart &&
      mi.columnSpan === target.columnSpan &&
      mi.rowStart !== null
  );

  type StackMember = { id: string; rowStart: number; rowSpan: number };
  const stack: StackMember[] = [{ id: target.id, rowStart, rowSpan: target.rowSpan }];
  let topCursor = rowStart;
  for (;;) {
    const above = siblings.find((mi) => mi.rowStart + mi.rowSpan === topCursor);
    if (!above) break;
    stack.unshift({ id: above.id, rowStart: above.rowStart, rowSpan: above.rowSpan });
    topCursor = above.rowStart;
  }
  let bottomCursor = rowStart + target.rowSpan;
  for (;;) {
    const below = siblings.find((mi) => mi.rowStart === bottomCursor);
    if (!below) break;
    stack.push({ id: below.id, rowStart: below.rowStart, rowSpan: below.rowSpan });
    bottomCursor = below.rowStart + below.rowSpan;
  }

  const remaining = stack.filter((m) => m.id !== target.id);
  let cursor = stack[0].rowStart;
  const plan = remaining.map((m) => {
    const newRowStart = cursor;
    cursor += m.rowSpan;
    return { id: m.id, rowStart: newRowStart };
  });

  await prisma.$transaction([
    prisma.moduleInstance.delete({ where: { id: target.id } }),
    ...plan.map((p) => prisma.moduleInstance.update({ where: { id: p.id }, data: { rowStart: p.rowStart } })),
  ]);

  return { deletedId: target.id, shifted: plan };
}

// Updates a non-locked module's own content (heading text, ruled/blank,
// habit names, ...) — not its position (updateModulePlacement) or type.
// Locked structural blocks (week-title, hourly-grid-core) go through
// updateWeekSettings instead — they're not selectable on the canvas at
// all (see renderModuleInstance.ts), so there's no "select it, then edit
// its properties" flow for them to begin with.
//
// Returns the freshly-rendered element (a Polotno group, same shape
// addPaletteModuleAt returns) so the client can swap it into the live
// canvas — delete the old group by id, add this one in its place — same
// pattern as adding a brand new module, just replacing an existing one.
export async function updateModuleConfig(
  instanceId: string,
  propValues: Record<string, unknown>
) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const instance = await prisma.moduleInstance.findFirst({
    where: { id: instanceId, page: { planner: { ownerId: userId } } },
    include: { page: { include: { planner: { select: { theme: true } } } }, moduleType: true },
  });
  if (!instance) {
    throw new Error("Module instance not found or not owned by this user");
  }
  if (instance.locked) {
    throw new Error("Cannot edit a locked module's config here — use Week Settings instead");
  }
  if (instance.columnStart === null || instance.rowStart === null) {
    throw new Error("Module isn't grid-placed");
  }

  const sanitized = sanitizePropValues(instance.moduleType.configSchema, propValues);

  const updated = await prisma.moduleInstance.update({
    where: { id: instanceId },
    data: { propValues: sanitized as Prisma.InputJsonValue },
  });

  const pageGrid = pageGridFor(instance.page);
  const element = renderInstance(
    updated,
    instance.moduleType.slug,
    pageGrid,
    fontFamilyFromTheme(instance.page.planner.theme)
  );

  return { element, propValues: updated.propValues };
}

// Grows/shrinks a non-locked module's row and/or column span, keeping its
// columnStart/rowStart fixed (this resizes in place — the client-side
// stepper controls only ever change one dimension by one cell at a time,
// see PropertiesPanel.tsx). Deliberately not a drag-to-resize interaction
// on the canvas: Polotno's own resize handles would visually stretch the
// group's children (width/height/position scaled), which doesn't do
// anything sensible for renderers that recompute fixed-pt content from
// scratch for a given geometry rather than rendering something meant to
// be stretched — so this goes through the same "server re-renders fresh
// content for the new size, client swaps the group in place" path as
// updateModuleConfig instead, which is already proven correct.
//
// Rejects (doesn't clamp-and-relocate) a resize that would overlap
// another module — silently moving a module elsewhere because it grew
// would be more surprising than just telling the user why it can't grow
// that direction.
export async function updateModuleSize(
  instanceId: string,
  size: { columnSpan: number; rowSpan: number }
) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const instance = await prisma.moduleInstance.findFirst({
    where: { id: instanceId, page: { planner: { ownerId: userId } } },
    include: {
      page: {
        include: {
          moduleInstances: { include: { moduleType: true } },
          planner: { select: { theme: true } },
        },
      },
      moduleType: true,
    },
  });
  if (!instance) {
    throw new Error("Module instance not found or not owned by this user");
  }
  if (instance.locked) {
    throw new Error("Cannot resize a locked module");
  }
  if (instance.columnStart === null || instance.rowStart === null) {
    throw new Error("Module isn't grid-placed");
  }

  const pageGrid = pageGridFor(instance.page);

  // todo-checklist/habit-tracker's column span is tied to matching the
  // page's day count — see addPaletteModuleAt's identical derivation,
  // which is what actually keeps a freshly-dropped one in sync. That
  // invariant needs to hold here too, not just be implied by the client
  // hiding the width stepper for those types (see PropertiesPanel.tsx) —
  // otherwise this action alone would happily desync a checklist's
  // columns from the hourly grid it sits under.
  let requestedColumnSpan = size.columnSpan;
  if (instance.moduleType.slug === "todo-checklist" || instance.moduleType.slug === "habit-tracker") {
    const hourlyGrid = findSpine(instance.page.moduleInstances);
    if (hourlyGrid) {
      requestedColumnSpan = hourlyGrid.columnSpan;
    }
  }

  const clampedColumnSpan = Math.max(
    1,
    Math.min(requestedColumnSpan, pageGrid.gridColumns - instance.columnStart)
  );
  const clampedRowSpan = Math.max(1, Math.min(size.rowSpan, pageGrid.gridRows - instance.rowStart));

  const candidate = {
    columnStart: instance.columnStart,
    rowStart: instance.rowStart,
    columnSpan: clampedColumnSpan,
    rowSpan: clampedRowSpan,
  };
  const others = moduleInstancesToRects(instance.page.moduleInstances, instance.id);
  if (others.some((o) => rectsOverlap(candidate, o))) {
    throw new Error("Can't resize — another module is in the way");
  }

  const updated = await prisma.moduleInstance.update({
    where: { id: instanceId },
    data: { columnSpan: clampedColumnSpan, rowSpan: clampedRowSpan },
  });

  const element = renderInstance(
    updated,
    instance.moduleType.slug,
    pageGrid,
    fontFamilyFromTheme(instance.page.planner.theme)
  );

  return { element, columnSpan: updated.columnSpan, rowSpan: updated.rowSpan };
}

// Resizes two vertically-stacked, directly-adjacent modules together by
// sliding the shared boundary between them — growing the top one shrinks
// the bottom one by the same number of rows (and vice versa), so there's
// never a gap or an overlap between the pair. This is what
// useEdgeResize.ts's bottom-edge drag calls when it finds a module
// directly below the one being resized; updateModuleSize above (the
// single-module path) still handles the case where there's nothing below
// to couple with.
//
// Deliberately skips updateModuleSize's "does this collide with anything
// else" check: the pair's combined footprint (topRowStart through
// bottomRowStart+bottomRowSpan) is exactly invariant here — only the
// internal boundary between the two moves — so nothing outside the pair
// can newly overlap that wasn't overlapping before. All that needs
// clamping is that neither module's rowSpan drops below 1.
export async function resizeAdjacentModules(
  topInstanceId: string,
  bottomInstanceId: string,
  deltaRows: number
) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const [top, bottom] = await Promise.all([
    prisma.moduleInstance.findFirst({
      where: { id: topInstanceId, page: { planner: { ownerId: userId } } },
      include: {
        page: {
          include: {
            planner: { select: { theme: true } },
            // The rest of the column, which this used to do without: the
            // boundary can now slide the stack down into free space when
            // the module below has no rows to give, and that needs to know
            // what is below and where the page runs out. See stackResize.ts.
            moduleInstances: { include: { moduleType: true } },
          },
        },
        moduleType: true,
      },
    }),
    prisma.moduleInstance.findFirst({
      where: { id: bottomInstanceId, page: { planner: { ownerId: userId } } },
      include: { page: { include: { planner: { select: { theme: true } } } }, moduleType: true },
    }),
  ]);
  if (!top || !bottom) {
    throw new Error("Module instance not found or not owned by this user");
  }
  if (top.locked || bottom.locked) {
    throw new Error("Cannot resize a locked module");
  }
  if (
    top.columnStart === null ||
    top.rowStart === null ||
    bottom.columnStart === null ||
    bottom.rowStart === null
  ) {
    throw new Error("Module isn't grid-placed");
  }
  if (top.pageId !== bottom.pageId) {
    throw new Error("Modules aren't on the same page");
  }
  // Re-verified server-side, not trusted from the client: confirms the
  // two really are stacked in the same column with the bottom one's top
  // edge sitting exactly on the top one's bottom edge, before treating a
  // delta on one as implying the opposite delta on the other.
  if (
    bottom.columnStart !== top.columnStart ||
    bottom.columnSpan !== top.columnSpan ||
    bottom.rowStart !== top.rowStart + top.rowSpan
  ) {
    throw new Error("Modules aren't vertically adjacent");
  }

  // Neither module may shrink below its own minimum — see
  // getMinRowSpanForSlug's own comment on why that's not always the
  // uniform MIN_ROW_SPAN (a labeled-box vs. a todo-checklist/habit-
  // tracker's own, taller header need different floors; a pair can even
  // mix the two, e.g. a todo-checklist stacked with a habit-tracker).
  // Authoritative here since this is what actually persists;
  // useEdgeResize.ts and NativePlannerEditor.tsx mirror the same
  // per-slug minimums client-side so a drag never visually promises a
  // size the server would then further clamp.
  const pageGrid = pageGridFor(top.page);
  const topMinRowSpan = getMinRowSpanForSlug(top.moduleType.slug, pageGrid, top.columnSpan, configOf(top));
  const bottomMinRowSpan = getMinRowSpanForSlug(
    bottom.moduleType.slug,
    pageGrid,
    bottom.columnSpan,
    configOf(bottom)
  );
  // Everything in this exact column, at or below the boundary. A stack is
  // gravity-packed, so these are contiguous and the only free rows are
  // under all of them.
  const inColumn = top.page.moduleInstances.filter(
    (mi) =>
      mi.columnStart === top.columnStart &&
      mi.columnSpan === top.columnSpan &&
      mi.rowStart !== null &&
      mi.rowStart >= bottom.rowStart!
  );
  const stackBottomEnd = inColumn.reduce(
    (lowest, mi) => Math.max(lowest, (mi.rowStart ?? 0) + mi.rowSpan),
    bottom.rowStart + bottom.rowSpan
  );
  // Whatever bounds the stack from below - a locked block sharing this
  // column range, or the page itself. Same overlap test resizeStackFromBottom
  // uses, so the two handles agree about where the page runs out.
  const columnsOverlap = (mi: { columnStart: number | null; columnSpan: number }) =>
    mi.columnStart !== null &&
    mi.columnStart < top.columnStart! + top.columnSpan &&
    mi.columnStart + mi.columnSpan > top.columnStart!;
  // ANY module below that overlaps this column range bounds the slide, not
  // only a locked one - resizeStackFromBottom counts only locked blocks, and
  // that is safe for it because it grows a module inside its own column.
  // This operation MOVES modules downward, so an unlocked full-width block
  // sitting under a sidebar stack is just as solid an obstacle; treating it
  // as free space slides the stack straight through it.
  const inStack = new Set(inColumn.map((mi) => mi.id));
  const bound = top.page.moduleInstances.reduce(
    (lowest, mi) =>
      !inStack.has(mi.id) &&
      mi.rowStart !== null &&
      mi.rowStart >= stackBottomEnd &&
      columnsOverlap(mi)
        ? Math.min(lowest, mi.rowStart)
        : lowest,
    pageGrid.gridRows
  );

  const { topDelta, pushDown } = resolvePairResize({
    requestedDelta: deltaRows,
    topRowSpan: top.rowSpan,
    topMinRowSpan,
    bottomRowSpan: bottom.rowSpan,
    bottomMinRowSpan,
    spaceBelow: Math.max(0, bound - stackBottomEnd),
  });
  if (topDelta === 0) {
    throw new Error("Nothing to resize");
  }

  const newTopRowSpan = top.rowSpan + topDelta;
  const newBottomRowStart = bottom.rowStart + topDelta;
  // The bottom SHRINKS by whatever was not found in the space below, so a
  // pure slide leaves it the size it was - see PairResize.
  const newBottomRowSpan = bottom.rowSpan - (topDelta - pushDown);

  // Anything under the bottom module slides by the same amount it did.
  const moved = pushDown > 0
    ? inColumn.filter((mi) => mi.id !== bottom.id)
    : [];

  const [updatedTop, updatedBottom] = await prisma.$transaction([
    prisma.moduleInstance.update({
      where: { id: top.id },
      data: { rowSpan: newTopRowSpan },
    }),
    prisma.moduleInstance.update({
      where: { id: bottom.id },
      data: { rowStart: newBottomRowStart, rowSpan: newBottomRowSpan },
    }),
    ...moved.map((mi) =>
      prisma.moduleInstance.update({
        where: { id: mi.id },
        data: { rowStart: (mi.rowStart ?? 0) + pushDown },
      })
    ),
  ]);

  const fontFamily = fontFamilyFromTheme(top.page.planner.theme);
  return {
    top: {
      element: renderInstance(updatedTop, top.moduleType.slug, pageGrid, fontFamily),
      rowSpan: updatedTop.rowSpan,
    },
    bottom: {
      element: renderInstance(updatedBottom, bottom.moduleType.slug, pageGrid, fontFamily),
      rowStart: updatedBottom.rowStart,
      rowSpan: updatedBottom.rowSpan,
    },
    // Only ever non-empty when the boundary slid the stack rather than
    // shrinking the module below it. Their content is unchanged - only
    // where they sit - so no re-render is returned with them.
    moved: moved.map((mi) => ({ id: mi.id, rowStart: (mi.rowStart ?? 0) + pushDown })),
  };
}

// Resizes an entire same-column stack from its own OUTER bottom edge —
// the module passed in must be the bottom-most of its stack (nothing
// else sits directly below it in the same column), unlike
// resizeAdjacentModules above, which pairs two modules that already have
// each other to couple against. There's no sibling below to couple with
// here, so growing and shrinking are genuinely different operations, not
// mirror images of the same one:
//
// - Growing (deltaRows > 0) only ever grows the bottom-most module —
//   it's reaching into free page space below the stack, which has no
//   shared "budget" the way shrinking does, so there's nothing to
//   cascade through.
// - Shrinking (deltaRows < 0) cascades upward once the bottom-most
//   module hits MIN_ROW_SPAN (mirrors resizeAdjacentModules' own floor):
//   the bottom module absorbs the shrink first, and once it can't give
//   any more, the module above it starts shrinking too, and so on up the
//   stack — the same "drag reaches the next module once the current one
//   is floored" idea a column-resize cascade in a spreadsheet uses.
//   Every affected module (and only those) gets repacked contiguously
//   afterward from the stack's own unmoved top anchor, so shrinking
//   never leaves a gap in the middle of the stack — all the freed space
//   ends up as one contiguous block at the bottom, not scattered
//   between individual members.
export async function resizeStackFromBottom(bottomInstanceId: string, totalDeltaRows: number) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const bottom = await prisma.moduleInstance.findFirst({
    where: { id: bottomInstanceId, page: { planner: { ownerId: userId } } },
    include: {
      page: {
        include: {
          moduleInstances: { include: { moduleType: true } },
          planner: { select: { theme: true } },
        },
      },
      moduleType: true,
    },
  });
  if (!bottom) {
    throw new Error("Module instance not found or not owned by this user");
  }
  if (bottom.locked) {
    throw new Error("Cannot resize a locked module");
  }
  if (bottom.columnStart === null || bottom.rowStart === null) {
    throw new Error("Module isn't grid-placed");
  }
  const bottomColumnStart = bottom.columnStart;
  const bottomRowStart = bottom.rowStart;

  const siblings = bottom.page.moduleInstances.filter(
    (mi): mi is typeof mi & { rowStart: number } =>
      mi.id !== bottom.id &&
      !mi.locked &&
      mi.columnStart === bottomColumnStart &&
      mi.columnSpan === bottom.columnSpan &&
      mi.rowStart !== null
  );
  // Re-verified server-side, not trusted from the client: confirms
  // nothing else in the same column sits directly below this one — if
  // something does, this isn't really the stack's own outer bottom, and
  // resizeAdjacentModules (a coupled pair) is the right action instead.
  if (siblings.some((mi) => mi.rowStart === bottomRowStart + bottom.rowSpan)) {
    throw new Error("Not the bottom of its stack");
  }

  // Walk upward from `bottom`, collecting the full contiguous run of
  // same-column unlocked siblings this instance is the bottom of — same
  // adjacency test resolveModulePlacement's own stack-sibling logic uses
  // (grid.ts), just followed as a chain instead of checked pairwise.
  // Reduced to a plain {id, rowStart, rowSpan, slug} shape rather than
  // keeping Prisma's full include shape — `bottom` and a `siblings` entry
  // are structurally different types (only `bottom`'s own query included
  // its `page`), which a shared array can't hold as-is.
  type StackMember = {
    id: string;
    rowStart: number;
    rowSpan: number;
    slug: string;
    // Carried alongside the slug because the floor depends on it - a
    // tracker may not be shrunk past its own named rows.
    propValues: Record<string, unknown>;
  };
  const stack: StackMember[] = [
    {
      id: bottom.id,
      rowStart: bottomRowStart,
      rowSpan: bottom.rowSpan,
      slug: bottom.moduleType.slug,
      propValues: configOf(bottom),
    },
  ];
  let topCursor = bottomRowStart;
  for (;;) {
    const above = siblings.find((mi) => mi.rowStart + mi.rowSpan === topCursor);
    if (!above) break;
    stack.unshift({
      id: above.id,
      rowStart: above.rowStart,
      rowSpan: above.rowSpan,
      slug: above.moduleType.slug,
      propValues: configOf(above),
    });
    topCursor = above.rowStart;
  }

  const pageGrid = pageGridFor(bottom.page);
  // Per-member minimum, not the uniform MIN_ROW_SPAN — see
  // getMinRowSpanForSlug's own comment on why a stack can mix module
  // types (e.g. a todo-checklist stacked with a habit-tracker), each
  // with a different floor.
  const originalSpans = stack.map((mi) => mi.rowSpan);
  // bottom.columnSpan for every member, not each member's own — the
  // siblings filter just above already requires every stack member to
  // share bottom's own columnSpan (mi.columnSpan === bottom.columnSpan),
  // so they're guaranteed identical anyway.
  const minSpans = stack.map((mi) =>
    getMinRowSpanForSlug(mi.slug, pageGrid, bottom.columnSpan, mi.propValues)
  );
  const totalShrinkable = originalSpans.reduce((sum, span, i) => sum + (span - minSpans[i]), 0);

  const stackBottom = bottomRowStart + bottom.rowSpan;
  // How far the stack may grow — up to whatever bounds it from below (a
  // locked block sharing its column range, if any) or the page's own
  // bottom edge otherwise. Same "column-range overlap, not exact span
  // match" test resolveModulePlacement's own topBound/bottomBound use.
  const columnsOverlap = (o: { columnStart: number | null; columnSpan: number }) =>
    o.columnStart !== null && o.columnStart < bottomColumnStart + bottom.columnSpan && o.columnStart + o.columnSpan > bottomColumnStart;
  const boundingBelow = bottom.page.moduleInstances.filter(
    (mi): mi is typeof mi & { rowStart: number } =>
      mi.locked && mi.rowStart !== null && mi.rowStart >= stackBottom && columnsOverlap(mi)
  );
  const maxBottomBound = boundingBelow.length > 0 ? Math.min(...boundingBelow.map((mi) => mi.rowStart)) : pageGrid.gridRows;
  const maxGrow = Math.max(0, maxBottomBound - stackBottom);

  // Clamped in terms of the resulting *gap* below the stack (maxGrow -
  // delta), not delta directly, and a gap of exactly 1 row is treated
  // as unreachable — see StackResizeHandle's own comment
  // (NativePlannerEditor.tsx) for the full reasoning: AddModuleButton/
  // addPaletteModuleAt always place a full MIN_ROW_SPAN-tall module
  // there, so a 1-row gap can never actually fit what it's advertising
  // room for, and a module added into it will overlap. Reported
  // directly: "resize bottom side module and leave a small gap then
  // add a new side module, the new overlaps." The client already snaps
  // its own live preview away from a 1-row landing before ever calling
  // here; this is the authoritative guard in case a stale or buggy
  // request still asks for one, so it just resolves to 0 (no gap)
  // rather than reproducing the bug server-side. If there isn't even
  // enough combined room to reach a genuinely usable gap (< MIN_ROW_SPAN
  // total between growing and shrinking), the only valid landing is 0.
  const maxPossibleGap = maxGrow + totalShrinkable;
  const effectiveMaxGap = maxPossibleGap >= MIN_ROW_SPAN ? maxPossibleGap : 0;
  const rawGap = maxGrow - totalDeltaRows;
  const boundedGap = Math.max(0, Math.min(effectiveMaxGap, rawGap));
  const targetGap = boundedGap === 1 ? 0 : boundedGap;
  const clampedDelta = maxGrow - targetGap;
  if (clampedDelta === 0) {
    throw new Error("Nothing to resize");
  }

  const newSpans = [...originalSpans];
  if (clampedDelta > 0) {
    newSpans[newSpans.length - 1] += clampedDelta;
  } else {
    let remaining = -clampedDelta;
    for (let i = newSpans.length - 1; i >= 0 && remaining > 0; i--) {
      const shrinkable = newSpans[i] - minSpans[i];
      const take = Math.min(shrinkable, remaining);
      newSpans[i] -= take;
      remaining -= take;
    }
  }

  // Repack contiguously from the stack's own top anchor (stack[0]'s
  // current rowStart) — that member's own position never moves, since
  // every row this operation frees or claims comes from the bottom.
  let cursor = stack[0].rowStart;
  const plan = stack.map((mi, i) => {
    const rowStart = cursor;
    cursor += newSpans[i];
    return { id: mi.id, slug: mi.slug, rowStart, rowSpan: newSpans[i] };
  });

  const updated = await prisma.$transaction(
    plan.map((p) => prisma.moduleInstance.update({ where: { id: p.id }, data: { rowStart: p.rowStart, rowSpan: p.rowSpan } }))
  );

  const fontFamily = fontFamilyFromTheme(bottom.page.planner.theme);
  return updated.map((row, i) => ({
    id: row.id,
    rowStart: plan[i].rowStart,
    rowSpan: row.rowSpan,
    elements: renderInstanceElements(row, plan[i].slug, pageGrid, fontFamily),
  }));
}

// Updates the week-title heading + both pages' hourly-grid-core day-of-
// month numbers for the current user's planner. These are locked/
// structural (not individually selectable on the canvas — see
// renderModuleInstance.ts), so they're edited as one batch here rather
// than through updateModuleConfig's select-one-module flow. Unlike that
// action, this doesn't return a live-patchable element: hourly-grid-core
// renders as many flat elements, not one group, so an in-place swap would
// need to enumerate and replace all of them individually. Editing week
// settings is an infrequent, deliberate action (once per week of
// planning, not an interactive drag), so the caller just reloads the
// page afterward instead.
export async function updateWeekSettings(settings: {
  weekNumber: number;
  weekTotal: number;
  dateRangeLabel: string;
  leftDates: number[]; // [Sun, Mon, Tue]
  rightDates: number[]; // [Wed, Thu, Fri, Sat]
}) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const planner = await prisma.planner.findFirst({
    // The owner's book. Deterministic order, so which row this is never
    // depends on what the database felt like returning - see BOOK.
    where: { ownerId: userId, isTemplate: false },
    orderBy: BOOK,
    include: {
      pages: {
        orderBy: { position: "asc" },
        include: { moduleInstances: { include: { moduleType: true } } },
      },
    },
  });
  if (!planner || planner.pages.length < 2) {
    throw new Error("Planner not found");
  }
  const [leftPage, rightPage] = planner.pages;

  const updates: Array<Promise<unknown>> = [];

  const weekTitle = leftPage.moduleInstances.find((mi) => mi.moduleType.slug === "week-title");
  if (weekTitle) {
    updates.push(
      prisma.moduleInstance.update({
        where: { id: weekTitle.id },
        data: {
          propValues: {
            weekNumber: settings.weekNumber,
            weekTotal: settings.weekTotal,
            dateRangeLabel: settings.dateRangeLabel,
          } as Prisma.InputJsonValue,
        },
      })
    );
  }

  const applyDates = (
    page: (typeof planner.pages)[number],
    dates: number[]
  ) => {
    const hourly = page.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
    if (!hourly) return;
    const props = hourly.propValues as { dayLabels?: Array<{ name: string; date: number }> };
    const dayLabels = (props.dayLabels ?? []).map((d, i) => ({
      ...d,
      date: dates[i] ?? d.date,
    }));
    updates.push(
      prisma.moduleInstance.update({
        where: { id: hourly.id },
        data: {
          propValues: { ...(hourly.propValues as object), dayLabels } as Prisma.InputJsonValue,
        },
      })
    );
  };
  applyDates(leftPage, settings.leftDates);
  applyDates(rightPage, settings.rightDates);

  await Promise.all(updates);
}

// Page Settings > Font. Planner-wide (not per-page/per-instance) — see
// src/lib/theme.ts's PlannerTheme shape, stored directly in Planner.theme
// (a free-form Json? column that was otherwise completely unused). Same
// "infrequent, deliberate action, caller reloads afterward" tradeoff as
// updateWeekSettings above, not a live-patchable single element: a font
// change affects every module on both pages at once, not one instance.
export async function updatePlannerFont(fontFamily: FontChoice) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const planner = await prisma.planner.findFirst({
    // The owner's book. Deterministic order, so which row this is never
    // depends on what the database felt like returning - see BOOK.
    where: { ownerId: userId, isTemplate: false },
    orderBy: BOOK,
  });
  if (!planner) {
    throw new Error("Planner not found");
  }

  const nextTheme: PlannerTheme = { ...(planner.theme as PlannerTheme | null), fontFamily };
  await prisma.planner.update({
    where: { id: planner.id },
    data: { theme: nextTheme as Prisma.InputJsonValue },
  });
}

/**
 * Page Settings > Dates. Does this planner carry dates at all?
 *
 * ONE COLUMN, and nothing else is written. Undated is applied at READ time
 * (loadPlannerPages calls the registry's per-module `undated` hook), so the
 * stored propValues keep whatever dates were entered and this toggle round
 * trips without losing them. The alternative - blanking the values in the
 * database - makes turning dates back on a re-seed, which throws away a date
 * range somebody typed by hand.
 *
 * Takes no cadence any more: there is one book, and every level of it is
 * dated or undated together. A monthly spread with dates beside a weekly one
 * without them is not a planner anybody wants.
 */
export async function setPlannerDated(dated: boolean) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const planner = await prisma.planner.findFirst({
    where: { ownerId: userId, isTemplate: false },
    orderBy: BOOK,
  });
  if (!planner) {
    throw new Error("Planner not found");
  }

  await prisma.planner.update({ where: { id: planner.id }, data: { dated } });
}

/**
 * Page Settings > Term. What stretch of time this book covers.
 *
 * Sequence generation walks it to turn the templates into pages, and the
 * cog's popup divides it into the months (or weeks, or days) a person can
 * give their own layout to - see occurrences().
 *
 * Both dates or neither. A half-set term is not a shorter book, it is a book
 * whose length nobody can compute, and every count downstream would have to
 * carry a third state to say so.
 */
export async function setPlannerTerm(startISO: string | null, endISO: string | null) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }
  const planner = await prisma.planner.findFirst({
    where: { ownerId: userId, isTemplate: false },
    orderBy: BOOK,
  });
  if (!planner) {
    throw new Error("Planner not found");
  }

  if (!startISO || !endISO) {
    await prisma.planner.update({
      where: { id: planner.id },
      data: { startDate: null, endDate: null },
    });
    return;
  }

  // Parsed as UTC midnight, matching every other date in this app - a local
  // parse would put a book that starts on the 1st into the previous month
  // for anyone west of Greenwich.
  const start = new Date(`${startISO}T00:00:00.000Z`);
  const end = new Date(`${endISO}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Those dates could not be read.");
  }
  if (end.getTime() < start.getTime()) {
    throw new Error("A book cannot end before it begins.");
  }

  await prisma.planner.update({
    where: { id: planner.id },
    data: { startDate: start, endDate: end },
  });
}

/**
 * Give one occurrence its own layout, by copying the default one.
 *
 * COPIED, NOT BLANK. "Customise February" means "start from what every other
 * month gets and change it" - handing back an empty page would throw away
 * the work the default represents and make the feature something you only
 * use when starting over.
 *
 * Idempotent: an occurrence that already has its own pages is left exactly
 * as it is rather than being reset to the default, which would silently
 * discard whatever had been changed.
 */
export async function createLevelVariant(level: PageLevel, variantKey: string) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }
  if (!variantKey) {
    throw new Error("An occurrence needs a key.");
  }
  const planner = await prisma.planner.findFirst({
    where: { ownerId: userId, isTemplate: false },
    orderBy: BOOK,
    include: {
      pages: { include: { moduleInstances: true }, orderBy: { position: "asc" } },
    },
  });
  if (!planner) {
    throw new Error("Planner not found");
  }

  if (planner.pages.some((page) => page.level === level && page.variantKey === variantKey)) {
    return;
  }
  const source = planner.pages.filter((page) => page.level === level && page.variantKey === null);
  if (source.length === 0) {
    throw new Error(`There is no default ${level} layout to copy.`);
  }

  // One transaction: a half-copied spread - the left page of February
  // present and the right one missing - is worse than no February at all,
  // because it looks finished.
  await prisma.$transaction(async (tx) => {
    for (const page of source) {
      const copy = await tx.page.create({
        data: {
          plannerId: planner.id,
          level,
          variantKey,
          position: page.position,
          widthPx: page.widthPx,
          heightPx: page.heightPx,
          gridColumns: page.gridColumns,
          gridRows: page.gridRows,
          gridGapPx: page.gridGapPx,
          marginPx: page.marginPx,
        },
      });
      if (page.moduleInstances.length === 0) continue;
      await tx.moduleInstance.createMany({
        data: page.moduleInstances.map((instance) => ({
          pageId: copy.id,
          moduleTypeId: instance.moduleTypeId,
          placementMode: instance.placementMode,
          locked: instance.locked,
          x: instance.x,
          y: instance.y,
          width: instance.width,
          height: instance.height,
          columnStart: instance.columnStart,
          rowStart: instance.rowStart,
          columnSpan: instance.columnSpan,
          rowSpan: instance.rowSpan,
          zIndex: instance.zIndex,
          propValues: instance.propValues as Prisma.InputJsonValue,
        })),
      });
    }
  });
}

/**
 * Add a page to a level's set.
 *
 * A LEVEL IS A STACK OF PAGES, not one spread - Andrew's own framing: people
 * should be able to "add extra pages, either empty/ruled or full of modules
 * that cant fit on spread at each level that repeats". Every week in the book
 * then gets all of them.
 *
 * BLANK, deliberately. The level's template arrangement belongs to the pages
 * it seeded; a fourth weekly page is somewhere to put whatever did not fit on
 * the spread, and seeding it with a copy of the spread would be the opposite
 * of that. It has no locked spine either, so the whole page is free - the
 * same kind of page as the front matter.
 *
 * Appended, never inserted: position is the order pages are bound in, and the
 * new one goes after the ones that exist.
 */
export async function addPageToLevel(level: PageLevel, variantKey: string | null) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }
  const planner = await prisma.planner.findFirst({
    where: { ownerId: userId, isTemplate: false },
    orderBy: BOOK,
    include: { pages: true },
  });
  if (!planner) {
    throw new Error("Planner not found");
  }

  const siblings = planner.pages.filter(
    (page) => page.level === level && (page.variantKey ?? null) === variantKey
  );
  // The page's own size comes from a sibling rather than from the schema
  // defaults: a planner switched to Letter has 2550px pages, and a new one
  // at 2175 would be a different size from the rest of its own book.
  const model = siblings[0] ?? planner.pages[0];
  const page = await prisma.page.create({
    data: {
      plannerId: planner.id,
      level,
      variantKey,
      position: siblings.length,
      ...(model
        ? {
            widthPx: model.widthPx,
            heightPx: model.heightPx,
            gridColumns: model.gridColumns,
            gridRows: model.gridRows,
            gridGapPx: model.gridGapPx,
            marginPx: model.marginPx,
          }
        : {}),
    },
  });
  return page.id;
}

/**
 * Remove a page from a level's set.
 *
 * ONLY A BLANK ONE, and only when it is not the last. Adding a page has to be
 * undoable or it is a one-way door - the first thing that happened after the
 * add button existed was two pages created by a stray click with no way back.
 *
 * Refusing to delete a page with anything on it is what makes this safe
 * enough to sit in a toolbar with no confirmation dialog: the only pages it
 * can remove are ones nobody has put anything on. Emptying a page first is
 * the path for the other case, and it is deliberate rather than accidental.
 *
 * The rest of the set is renumbered, because positions within a level and
 * variant are an ORDER and must stay 0..n-1 - check:levels enforces that.
 */
export async function deletePageFromLevel(pageId: string) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { planner: true, moduleInstances: { select: { id: true } } },
  });
  if (!page || page.planner.ownerId !== userId) {
    throw new Error("Page not found");
  }
  if (page.moduleInstances.length > 0) {
    throw new Error("Only a blank page can be removed. Delete what is on it first.");
  }

  const siblings = await prisma.page.findMany({
    where: {
      plannerId: page.plannerId,
      level: page.level,
      variantKey: page.variantKey,
    },
    orderBy: { position: "asc" },
  });
  if (siblings.length <= 1) {
    throw new Error("A level needs at least one page.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.page.delete({ where: { id: page.id } });
    // Renumbered in one pass, and to a range that cannot collide with the
    // rows still there: shifting 2 down to 1 while 1 still exists trips the
    // unique index. Negative positions are free.
    const rest = siblings.filter((s) => s.id !== page.id);
    for (const [index, sibling] of rest.entries()) {
      if (sibling.position !== index) {
        await tx.page.update({ where: { id: sibling.id }, data: { position: -1 - index } });
      }
    }
    for (const [index, sibling] of rest.entries()) {
      if (sibling.position !== index) {
        await tx.page.update({ where: { id: sibling.id }, data: { position: index } });
      }
    }
  });
}

/**
 * Put one occurrence back on the default layout.
 *
 * Deletes its own pages, so whatever was changed on them is gone - which is
 * exactly what "stop customising February" means, and why the caller has to
 * confirm it. The default pages are untouched; they were copied FROM, never
 * moved.
 */
export async function deleteLevelVariant(level: PageLevel, variantKey: string) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }
  if (!variantKey) {
    throw new Error("The default layout cannot be removed.");
  }
  const planner = await prisma.planner.findFirst({
    where: { ownerId: userId, isTemplate: false },
    orderBy: BOOK,
  });
  if (!planner) {
    throw new Error("Planner not found");
  }
  // Scoped to this planner as well as the key: deleteMany on a key alone
  // would reach into another person's book.
  await prisma.page.deleteMany({
    where: { plannerId: planner.id, level, variantKey },
  });
}

// Validates a client-submitted "HH:MM" string strictly (unlike
// hourlyGridCore.ts's own private timeToMinutes, which trusts
// already-persisted data and would silently propagate NaN through its
// math for something malformed) — this is a real input boundary
// (updateHourlySettings below is a public server action, not
// necessarily called through the <input type="time"> that constrains
// what a real browser submits).
function timeStringToMinutes(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

// Page Settings > Hours. Two very different operations behind one Save
// button, branched on settings.intervalMode:
//
// "on" (30min/1hr increments): unlike updateWeekSettings' plain
// propValues merges, this genuinely changes hourly-grid-core's own
// footprint (its row-count, hence rowSpan, is derived from real point
// measurements independent of what space happens to be "available" —
// see getHourlyGridCoreContentHeightPx's own comment), so it needs an
// overflow guard (nothing before this stopped a wide time range from
// requesting more rows than the page actually has) and a repack of
// whatever's below it (its own bottom edge moves, so the "below the
// hourly grid" zone's own top has to move with it) — both applied to
// each page independently, since dayCount/whatever each page's own
// below-zone stack holds can differ.
//
// "off" (blank, height-adjustable space): none of that applies —
// turning increments off doesn't change hourly-grid-core's own rowSpan
// at all (it keeps whatever height it currently has; the user adjusts
// it afterward via the drag handle — resizeHourlyGridCore below), so
// this is just a propValues merge, closer to updateWeekSettings' own
// shape. startTime/endTime/intervalMinutes are still saved even in this
// branch (not just discarded) so switching back to "on" later restores
// whatever the user had picked, rather than reverting to schema
// defaults.
export async function updateHourlySettings(settings: {
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  intervalMinutes: 30 | 60;
  intervalMode: "on" | "off";
  // One of ROW_HEIGHT_OPTIONS_PT (hourlyGridCore.ts). Undefined keeps the
  // 9pt default.
  rowHeightPt?: number;
  // Only meaningful at intervalMinutes:60 — see getRowHeightPx's own
  // comment (hourlyGridCore.ts) for why 1-hour rows double their height
  // by default, and what opting into this reverts to. Harmless to send
  // even at 30min/off; just ignored wherever row height doesn't depend
  // on it.
  compactHourRows: boolean;
  weekStartDay: number; // 0=Sun..6=Sat
  // Set only after the editor has asked and been told yes: drop the lowest
  // module below the hours and try again. See HOURS_DO_NOT_FIT.
  deleteLowestBelowToFit?: boolean;
}) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }
  if (settings.intervalMinutes !== 30 && settings.intervalMinutes !== 60) {
    throw new Error("Interval must be 30 or 60 minutes");
  }
  const startMinutes = timeStringToMinutes(settings.startTime);
  const endMinutes = timeStringToMinutes(settings.endTime);
  if (startMinutes === null || endMinutes === null) {
    throw new Error("Invalid start/end time");
  }
  if (endMinutes <= startMinutes) {
    throw new Error("End time must be after start time");
  }

  const planner = await prisma.planner.findFirst({
    // The owner's book. Deterministic order, so which row this is never
    // depends on what the database felt like returning - see BOOK.
    where: { ownerId: userId, isTemplate: false },
    orderBy: BOOK,
    include: {
      pages: {
        orderBy: { position: "asc" },
        include: { moduleInstances: { include: { moduleType: true } } },
      },
    },
  });
  if (!planner || planner.pages.length < 2) {
    throw new Error("Planner not found");
  }

  const updates: ReturnType<typeof prisma.moduleInstance.update>[] = [];
  // Deletions requested by the editor after asking the user - applied in
  // the same transaction as the resize they make room for.
  const deletions: Prisma.PrismaPromise<unknown>[] = [];

  if (settings.intervalMode === "off") {
    for (const page of planner.pages) {
      const hourly = page.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
      if (!hourly) continue;
      updates.push(
        prisma.moduleInstance.update({
          where: { id: hourly.id },
          data: {
            // Row height is carried through even though "off" draws no
            // ruled rows, so the choice survives a round trip through
            // blank mode rather than silently reverting - one of several
            // fields it would be easy to leave out here, which is why the
            // set is written once in hourlyPropsFromSettings.
            propValues: hourlyPropsFromSettings(hourly.propValues, {
              ...settings,
              intervalMode: "off",
              rowHeightPt: settings.rowHeightPt ?? DEFAULT_HOURLY_SETTINGS.rowHeightPt,
            }) as Prisma.InputJsonValue,
          },
        })
      );
    }
    if (updates.length === 0) {
      throw new Error("No hourly grid found on this planner");
    }
  } else {
    const requiredHeightPx = getHourlyGridCoreContentHeightPx({
      startTime: settings.startTime,
      endTime: settings.endTime,
      intervalMinutes: settings.intervalMinutes,
      compactHourRows: settings.compactHourRows,
      rowHeightPt: settings.rowHeightPt,
    });

    // No longer a flat row: the gap is half a cell or a full one
    // depending on where the hours end, which hourlyGapRows works out from
    // the same content height that sizes the block. Computed per page
    // below, since a page whose hours land mid-cell needs a different
    // number of rows kept clear than one whose hours land on the line.

    type PerPage = {
      hourlyId: string;
      hourlyPropValues: unknown;
      hourlyRowStart: number;
      newRowSpan: number;
      // Carried rather than recomputed below: the room calculation and the
      // placement have to be the same number, and when they were worked
      // out separately they stopped agreeing - the room left space for a
      // computed gap while the placement still added a literal 1.
      gapRows: number;
      belowMembers: Array<{ id: string; rowStart: number; rowSpan: number }>;
    };
    const perPage: PerPage[] = [];

    for (const page of planner.pages) {
      const hourly = page.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
      if (!hourly || hourly.columnStart === null || hourly.rowStart === null) continue;
      const pageGrid = pageGridFor(page);
      const newRowSpan = pixelHeightToRowSpan(pageGrid, requiredHeightPx);

      // The below-zone stack: unlocked siblings sharing hourly's own exact
      // column range — same "exact match, not just overlap" membership
      // test resizeStackFromBottom/resizeAdjacentModules already use for
      // "is this really the same stack," not a looser overlap check.
      // Top to bottom. The fit, the fair shrink and "the lowest" below all
      // read this order, and the database hands rows back in whatever order
      // it likes - so "delete the lowest to fit" could remove one that was
      // not the lowest.
      let belowMembers = page.moduleInstances
        .filter(
          (mi): mi is typeof mi & { rowStart: number } =>
            !mi.locked &&
            mi.rowStart !== null &&
            mi.columnStart === hourly.columnStart &&
            mi.columnSpan === hourly.columnSpan &&
            mi.rowStart >= hourly.rowStart! + hourly.rowSpan
        )
        .sort((a, b) => a.rowStart - b.rowStart);
      // Checked against each member's CURRENT rowSpan, not its own minimum
      // floor — this repack (packStackFromTop, below) only ever moves a
      // member's rowStart, it never shrinks a member's own rowSpan to fit.
      // Checking against the floor instead would let this guard pass while
      // the repack that follows still pushes an unshrunk module past the
      // page's own bottom edge (confirmed against this app's real dev data:
      // a full-day range needs 25 of 30 rows, leaving 4 for the below zone
      // — comfortably above the existing todo-checklist's own 2-row floor,
      // but well under its actual current 10-row size).
      if (settings.deleteLowestBelowToFit && belowMembers.length > 0) {
        const lowest = belowMembers[belowMembers.length - 1];
        deletions.push(prisma.moduleInstance.delete({ where: { id: lowest.id } }));
        belowMembers = belowMembers.slice(0, -1);
      }

      // Make room by SHRINKING what is below rather than refusing. This
      // used to throw the moment the below-zone did not fit at its current
      // sizes, leaving the user to go and resize something first. The rule -
      // a row at a time from each, no lower than its floor, and freed rows
      // back to the last one when the hours get shorter - is rowsBelowHours
      // (grid.ts), which the row-height drag previews with as well.
      //
      // The gap is measured against the settings being committed, not the
      // stored ones: the block is being resized to fit these hours, so the
      // gap under them has to be measured from the same place.
      const gapRows = hourlyGapRows(
        cellHeightPx(pageGrid),
        { ...settings, intervalMode: "on" },
        newRowSpan
      );
      const floors = belowMembers.map((mi) =>
        getMinRowSpanForSlug(mi.moduleType.slug, pageGrid, mi.columnSpan, configOf(mi))
      );
      const placed = rowsBelowHours(
        belowMembers.map((mi, i) => ({ rowStart: mi.rowStart, rowSpan: mi.rowSpan, minRowSpan: floors[i] })),
        hourly.rowStart + newRowSpan + gapRows,
        pageGrid.gridRows
      );
      if (placed.unmet > 0) {
        // Only name the modules when removing the lowest would actually
        // close the gap. At 18pt with 30-minute increments the hours need
        // 39 of 36 rows on their own, so deleting anything is futile -
        // and offering it would walk someone through destroying a module
        // for nothing. Everything below is at its floor by this point, so
        // the lowest frees exactly its floor.
        const deletingLowestWouldFit =
          belowMembers.length > 0 && floors[floors.length - 1] >= placed.unmet;
        const names = deletingLowestWouldFit
          ? belowMembers.map(
              (mi) => ((mi.propValues as { heading?: string } | null)?.heading ?? mi.moduleType.name)
            )
          : [];
        throw new Error(`HOURS_DO_NOT_FIT:${placed.unmet}:${names.join("|")}`);
      }

      perPage.push({
        hourlyId: hourly.id,
        hourlyPropValues: hourly.propValues,
        hourlyRowStart: hourly.rowStart,
        newRowSpan,
        gapRows,
        belowMembers: belowMembers.map((mi, i) => ({
          id: mi.id,
          rowStart: placed.rows[i].rowStart,
          rowSpan: placed.rows[i].rowSpan,
        })),
      });
    }
    if (perPage.length === 0) {
      throw new Error("No hourly grid found on this planner");
    }

    for (const p of perPage) {
      updates.push(
        prisma.moduleInstance.update({
          where: { id: p.hourlyId },
          data: {
            rowSpan: p.newRowSpan,
            // getHourlyGridCoreContentHeightPx above SIZES the block from
            // these same settings, so anything left out here produces a box
            // built for one thing holding another. That is exactly what
            // happened when rowHeightPt was missing: the block grew to fit
            // 18pt rows and drew 9pt ones.
            propValues: hourlyPropsFromSettings(p.hourlyPropValues, {
              ...settings,
              intervalMode: "on",
              rowHeightPt: settings.rowHeightPt ?? DEFAULT_HOURLY_SETTINGS.rowHeightPt,
            }) as Prisma.InputJsonValue,
          },
        })
      );
      // Written exactly as rowsBelowHours placed them - rows and spans both,
      // since a member can have shrunk or, when the hours got shorter,
      // grown.
      for (const member of p.belowMembers) {
        updates.push(
          prisma.moduleInstance.update({
            where: { id: member.id },
            data: { rowStart: member.rowStart, rowSpan: member.rowSpan },
          })
        );
      }
    }
  }

  const nextTheme: PlannerTheme = { ...(planner.theme as PlannerTheme | null), weekStartDay: settings.weekStartDay };
  await prisma.$transaction([
    ...deletions,
    ...updates,
    prisma.planner.update({ where: { id: planner.id }, data: { theme: nextTheme as Prisma.InputJsonValue } }),
  ]);

  // Every surviving grid-placed instance, with its post-change geometry and
  // a fresh render, in the same {id, rowStart, rowSpan, elements} shape
  // resizeHourlyGridCore and resizeStackFromBottom already return. This
  // used to return nothing and every caller answered by reloading the page,
  // which is a hard thing to do at the end of a drag: the preview is torn
  // down, the committed value flashes back, and then the whole document is
  // rebuilt. With the result in hand the caller can patch its own state
  // instead and the change simply stays where the drag left it.
  //
  // The whole planner rather than a tracked set of touched ids: a settings
  // change repacks the below-zone stacks, so "what moved" is most of the
  // page anyway, and the alternative is threading an id set through three
  // separate update branches to save one render that the reload was doing
  // for every module regardless.
  //
  // NOTE this lists what SURVIVES. deleteLowestBelowToFit can remove an
  // instance, and a caller that passes it still has to reconcile
  // deletions itself (the settings panel reloads, which does). The drag
  // handle never passes it - it only offers heights that already fit.
  const after = await prisma.planner.findFirst({
    where: { id: planner.id },
    include: {
      pages: {
        orderBy: { position: "asc" },
        include: { moduleInstances: { include: { moduleType: true } } },
      },
    },
  });
  if (!after) return [];
  const fontFamily = fontFamilyFromTheme(after.theme);
  return after.pages.flatMap((page) => {
    const pageGrid = pageGridFor(page);
    return page.moduleInstances
      .filter((mi) => mi.columnStart !== null && mi.rowStart !== null)
      .map((mi) => ({
        id: mi.id,
        rowStart: mi.rowStart as number,
        rowSpan: mi.rowSpan,
        propValues: mi.propValues,
        elements: renderInstanceElements(mi, mi.moduleType.slug, pageGrid, fontFamily),
      }));
  });
}

// Drag-resize for hourly-grid-core's own bottom edge, only ever valid
// while intervalMode is "off" (see that field's own comment in
// hourlyGridCore.ts) — the one case where a normally-always-locked block
// becomes user-resizable. Deliberately a separate action, not a
// loosening of resizeAdjacentModules/resizeStackFromBottom's own
// `.locked` guard, which protects genuinely-immovable structural blocks
// everywhere else in this app.
//
// A genuine COUPLED-PAIR resize (growing pushes the below-zone stack
// down, shrinking pulls it up, both by the same amount — same spirit as
// resizeAdjacentModules, just bridging the standing gap between hourly-
// grid-core and the below zone instead of requiring exact zero-gap
// adjacency), not the "stack grows into unclaimed free space, capped,
// never touches a neighbor" shape resizeStackFromBottom uses — the first
// version of this action used that shape and it was wrong: reported
// directly, "not moving the bottom modules... should change height both
// sides." Every below-zone instance sharing hourly-grid-core's own exact
// column range shifts its own rowStart by the same delta (rowSpan
// unchanged, preserving whatever gap already existed rather than forcing
// exactly one row) — see hourlyOffModeStackBottomsByPageId's own comment
// (NativePlannerEditor.tsx) for the client-side mirror of this same math,
// including the live-preview version.
//
// Returns one {id, rowStart, rowSpan, element} entry per instance this
// actually touched (hourly-grid-core itself, plus every shifted
// follower) — the same shape resizeStackFromBottom returns (there, one
// entry per cascaded member), so the client's existing
// handleStackResizeAdjacent applies either result identically without
// needing to know which action actually ran.
export async function resizeHourlyGridCore(instanceId: string, deltaRows: number) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const instance = await prisma.moduleInstance.findFirst({
    where: { id: instanceId, page: { planner: { ownerId: userId } } },
    include: {
      page: {
        include: {
          moduleInstances: { include: { moduleType: true } },
          planner: { select: { theme: true } },
        },
      },
      moduleType: true,
    },
  });
  if (!instance) {
    throw new Error("Module instance not found or not owned by this user");
  }
  // Any SPINE. The operation is about a locked block a page is built
  // around and the stack that follows it, which is as true of a month
  // calendar as of an hourly grid; only the guard below is hours-specific.
  if (!isSpineSlug(instance.moduleType.slug)) {
    throw new Error("Not a page spine module");
  }
  if (instance.columnStart === null || instance.rowStart === null) {
    throw new Error("Module isn't grid-placed");
  }
  // The hours are only freely resizable with increments off; with them on
  // the height is the row count times the row height, and the handle there
  // commits a row height instead. A calendar has no such setting - its
  // weeks divide whatever height it is given - so it is always resizable.
  const props = instance.propValues as { intervalMode?: "on" | "off" };
  if (instance.moduleType.slug === "hourly-grid-core" && props.intervalMode !== "off") {
    throw new Error("Can only drag-resize the hourly grid while increments are off");
  }

  // Every page's spine moves together, to the SAME span.
  //
  // A spread is one sheet: a left calendar three cells to a week beside a
  // right one at four is not a thing anyone wants, and the live preview
  // already mirrors the drag across both pages. Only the commit did not,
  // so the two drifted apart every time one was dragged - found at six
  // rows against sixteen. Resizing to a common TARGET rather than by a
  // common delta also repairs a spread that has already diverged, which
  // one built out of deltas never could.
  const pages = await prisma.page.findMany({
    where: { plannerId: instance.page.plannerId },
    orderBy: { position: "asc" },
    include: { moduleInstances: { include: { moduleType: true } } },
  });

  /** What one page's spine can do, and what its followers would have to
   *  give up for it. Everything here is per-page: each has its own
   *  followers, its own free space and its own floors. */
  const analyse = (page: (typeof pages)[number]) => {
    const spine = page.moduleInstances.find(
      (mi) => mi.moduleType.slug === instance.moduleType.slug && mi.rowStart !== null && mi.columnStart !== null
    );
    if (!spine || spine.rowStart === null) return null;
    const pageGrid = pageGridFor(page);
    // "around the same minimum size as modules," requested directly.
    // getHourlyGridCoreOffModeMinHeightPx's own comment explains why
    // header+gap alone already lands at exactly MIN_ROW_SPAN on this app's
    // real geometry; still clamped through the same Math.max as every
    // other floor, in case that geometry changes.
    const minRowSpan =
      spine.moduleType.slug === "hourly-grid-core"
        ? Math.max(MIN_ROW_SPAN, pixelHeightToRowSpan(pageGrid, getHourlyGridCoreOffModeMinHeightPx()))
        : MIN_ROW_SPAN;
    const stackBottomRowEnd = spine.rowStart + spine.rowSpan;
    // The below-zone followers: every unlocked instance sharing the
    // spine's exact column range at or below its bottom, top to bottom.
    // They move together, keeping their own relative spacing.
    const followers = page.moduleInstances
      .filter(
        (mi) =>
          !mi.locked &&
          mi.id !== spine.id &&
          mi.columnStart === spine.columnStart &&
          mi.columnSpan === spine.columnSpan &&
          mi.rowStart !== null &&
          mi.rowStart >= stackBottomRowEnd
      )
      .sort((a, b) => (a.rowStart as number) - (b.rowStart as number));
    const tailRowEnd =
      followers.length > 0
        ? Math.max(...followers.map((mi) => (mi.rowStart as number) + mi.rowSpan))
        : stackBottomRowEnd;
    const followerIds = new Set(followers.map((mi) => mi.id));
    let boundBelowTail = pageGrid.gridRows;
    for (const mi of page.moduleInstances) {
      if (mi.id === spine.id || followerIds.has(mi.id) || mi.rowStart === null) continue;
      const sameColumn = mi.columnStart === spine.columnStart && mi.columnSpan === spine.columnSpan;
      if (mi.rowStart < tailRowEnd || !sameColumn) continue;
      boundBelowTail = Math.min(boundBelowTail, mi.rowStart);
    }
    const freeBelow = Math.max(0, boundBelowTail - tailRowEnd);
    const followerSpans = followers.map((mi) => mi.rowSpan);
    // Zero, not each module's own floor. A spine growing to fill the page
    // has to be able to take the last of what is under it, and the module
    // is kept at zero rather than deleted so shrinking hands it straight
    // back - followerRowsAfterGrowth gives freed height to the last
    // follower, so it returns at the size the spine gave up. Only the
    // spine may do this; a follower's own handle still stops at its floor,
    // since a module dragged to nothing by its own edge would leave
    // nothing to grab. Mirrors SPINE_FOLLOWER_FLOOR on the client.
    const followerFloors = followers.map(() => 0);
    // Growing can take room from the followers as well as from free space
    // below them. Without the second term the block cannot grow at all on
    // a full page, and the handle silently only shrinks.
    const followerShrinkable = followerSpans.reduce(
      (sum, span, i) => sum + Math.max(0, span - followerFloors[i]),
      0
    );
    return {
      page,
      spine,
      pageGrid,
      minRowSpan,
      followers,
      followerSpans,
      followerFloors,
      freeBelow,
      stackBottomRowEnd,
      maxSpan: spine.rowSpan + freeBelow + followerShrinkable,
    };
  };

  const analyses = pages.map(analyse).filter((a): a is NonNullable<typeof a> => a !== null);
  const dragged = analyses.find((a) => a.spine.id === instance.id);
  if (!dragged) {
    throw new Error("Module instance not found or not owned by this user");
  }

  // Clamped against EVERY page, not just the dragged one: a target one
  // page cannot reach would put the spread back out of step, which is the
  // fault this exists to fix.
  const target = Math.max(
    ...analyses.map((a) => a.minRowSpan),
    Math.min(...analyses.map((a) => a.maxSpan), instance.rowSpan + deltaRows)
  );
  if (analyses.every((a) => a.spine.rowSpan === target)) {
    throw new Error("Nothing to resize");
  }

  const writes = analyses.flatMap((a) => {
    const delta = target - a.spine.rowSpan;
    // Shift into the free space, then take height once there is none left.
    // followerRowsAfterGrowth owns that rule for both sides - the live
    // preview calls the same function - so drag and drop cannot disagree.
    const rows = followerRowsAfterGrowth(
      a.followers.map((mi, i) => ({ rowSpan: a.followerSpans[i], minRowSpan: a.followerFloors[i] })),
      delta,
      a.freeBelow,
      a.followers.length > 0 ? (a.followers[0].rowStart as number) : a.stackBottomRowEnd
    );
    return [
      prisma.moduleInstance.update({ where: { id: a.spine.id }, data: { rowSpan: target } }),
      ...a.followers.map((mi, i) =>
        prisma.moduleInstance.update({
          where: { id: mi.id },
          data: { rowStart: rows[i].rowStart, rowSpan: rows[i].rowSpan },
        })
      ),
    ];
  });

  const fontFamily = fontFamilyFromTheme(instance.page.planner.theme);
  const updated = await prisma.$transaction(writes);

  // Each row rendered as what it actually is. The fallback slug here used
  // to be the literal "hourly-grid-core", which was true while this only
  // ever resized one - it drew a calendar as an hourly grid the moment it
  // resized another, asking a month config for a start time.
  const slugById = new Map(
    analyses.flatMap((a) => [
      [a.spine.id, a.spine.moduleType.slug] as const,
      ...a.followers.map((mi) => [mi.id, mi.moduleType.slug] as const),
    ])
  );
  const gridById = new Map(
    analyses.flatMap((a) => [
      [a.spine.id, a.pageGrid] as const,
      ...a.followers.map((mi) => [mi.id, a.pageGrid] as const),
    ])
  );
  return updated.map((row) => ({
    id: row.id,
    rowStart: row.rowStart as number,
    rowSpan: row.rowSpan,
    elements: renderInstanceElements(
      row,
      slugById.get(row.id) ?? instance.moduleType.slug,
      gridById.get(row.id) ?? dragged.pageGrid,
      fontFamily
    ),
  }));
}

export async function savePageElements(
  pageId: string,
  elements: PolotnoElement[]
) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  // Confirm the page belongs to a planner this user owns before writing.
  const page = await prisma.page.findFirst({
    where: { id: pageId, planner: { ownerId: userId } },
  });
  if (!page) {
    throw new Error("Page not found or not owned by this user");
  }

  const freeform = await prisma.moduleType.findUniqueOrThrow({
    where: { slug: "freeform-element" },
  });

  // Only replace the freeform elements — locked core blocks (and any
  // other grid-placed modules) aren't part of what the canvas round-trip
  // saves here, so they must survive this write untouched.
  await prisma.$transaction([
    prisma.moduleInstance.deleteMany({
      where: { pageId, moduleTypeId: freeform.id },
    }),
    prisma.moduleInstance.createMany({
      data: elements.map((el, index) => ({
        pageId,
        moduleTypeId: freeform.id,
        placementMode: "FREE" as const,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        zIndex: index,
        propValues: { polotnoElement: el } as Prisma.InputJsonValue,
      })),
    }),
  ]);
}

// Bulk placement restore, for undo/redo.
//
// Every geometry mutation in this editor - a move, a resize, and the
// reflow or gravity fill each one triggers - ends as a set of rows with
// new columnStart/rowStart/columnSpan/rowSpan, and sometimes a new
// pageId. So undo does not need an inverse for each of those actions
// individually; it needs one action that can put a set of rows back
// where they were. The client keeps snapshots and hands one back.
//
// Deliberately does NOT resolve, reflow or clamp. Every other write in
// this file re-derives placement server-side because the client's
// request is a guess about where something should end up. This one is
// not a guess - it is a state this planner was actually in, produced by
// those same resolutions - so re-resolving it would be re-deciding an
// already-decided question, and could land somewhere the user never saw.
export async function restoreModulePlacements(
  entries: Array<{
    id: string;
    pageId: string;
    columnStart: number;
    rowStart: number;
    columnSpan: number;
    rowSpan: number;
  }>
) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }
  if (entries.length === 0) return [];

  // One ownership check covering every id at once - anything not inside
  // a planner this user owns simply is not returned, and the count
  // check below turns that into a refusal rather than a partial write.
  const owned = await prisma.moduleInstance.findMany({
    where: { id: { in: entries.map((e) => e.id) }, page: { planner: { ownerId: userId } } },
    include: { moduleType: true, page: { include: { planner: true } } },
  });
  if (owned.length !== entries.length) {
    throw new Error("Module instances not found or not owned by this user");
  }
  const ownedById = new Map(owned.map((mi) => [mi.id, mi]));

  // Target pages must belong to the same planner too - pageId is
  // caller-supplied and a restore can legitimately move a module back
  // to the page it came from, so it cannot just be trusted.
  const plannerId = owned[0].page.plannerId;
  const pages = await prisma.page.findMany({
    where: { plannerId, planner: { ownerId: userId } },
  });
  const pageById = new Map(pages.map((p) => [p.id, p]));
  for (const entry of entries) {
    if (!pageById.has(entry.pageId)) {
      throw new Error("Target page not found or not owned by this user");
    }
  }

  const updated = await prisma.$transaction(
    entries.map((entry) =>
      prisma.moduleInstance.update({
        where: { id: entry.id },
        data: {
          pageId: entry.pageId,
          columnStart: entry.columnStart,
          rowStart: entry.rowStart,
          columnSpan: entry.columnSpan,
          rowSpan: entry.rowSpan,
        },
      })
    )
  );

  const fontFamily = fontFamilyFromTheme(owned[0].page.planner.theme);
  return updated.map((row) => {
    const page = pageById.get(row.pageId);
    const mi = ownedById.get(row.id);
    return {
      id: row.id,
      pageId: row.pageId,
      columnStart: row.columnStart as number,
      rowStart: row.rowStart as number,
      columnSpan: row.columnSpan,
      rowSpan: row.rowSpan,
      elements: renderInstanceElements(
        row,
        mi?.moduleType.slug ?? "",
        pageGridFor(page!),
        fontFamily
      ),
    };
  });
}
