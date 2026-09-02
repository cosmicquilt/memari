"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  clampGridPlacement,
  rectsOverlap,
  moduleInstancesToRects,
  gridCellToPixels,
  pixelHeightToRowSpan,
  packStackFromTop,
  resolveModulePlacement,
  gravityRepackAfterDeparture,
  canCrossZones,
  type PageGrid,
} from "@/lib/grid";
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";
import { renderModuleInstance } from "@/lib/renderModuleInstance";
import { computeMonthCalendar } from "@/lib/monthCalendar";
import { getTodoChecklistRowMetricsPx } from "@/lib/modules/todoChecklist";
import { getHabitTrackerRowMetricsPx, isHabitTrackerCompact } from "@/lib/modules/habitTracker";
import { getHourlyGridCoreContentHeightPx, getHourlyGridCoreOffModeMinHeightPx } from "@/lib/modules/hourlyGridCore";
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
  gridColumns: number;
  gridRows: number;
  gridGapPx: number;
  marginPx: number;
}): PageGrid {
  return {
    widthPx: PRINT_WIDTH_PX,
    heightPx: PRINT_HEIGHT_PX,
    gridColumns: page.gridColumns,
    gridRows: page.gridRows,
    boxInsetPx: page.gridGapPx / 2,
    marginPx: page.marginPx,
  };
}

// Minimum resize size for a module, in grid rows — see the identical
// client-side copy (NativePlannerEditor.tsx's getMinRowSpanForSlug) for
// the full reasoning ("make them have a min height of the title and one
// row below," requested directly) and why this can't just import that
// copy across the "use server" boundary. This is the authoritative
// version; the client's own copy is only ever a live-preview mirror of
// it.
const MIN_ROW_SPAN = 2;
// columnSpan: needed for habit-tracker only — its compact (sidebar)
// layout's own nominal row is a name row plus a day-letter square, whose
// size depends on the actual allocated width, unlike the wide layout's
// fixed ROW_HEIGHT_PT (see getHabitTrackerRowMetricsPx's own comment).
// todo-checklist and every other slug ignore it — a checkbox+line row's
// height doesn't change with how many of them sit side by side.
function getMinRowSpanForSlug(slug: string, pageGrid: PageGrid, columnSpan: number): number {
  let targetPx: number | null = null;
  if (slug === "todo-checklist") {
    const m = getTodoChecklistRowMetricsPx();
    targetPx = m.headerHeightPx + m.nominalRowHeightPx;
  } else if (slug === "habit-tracker") {
    const widthPx = gridCellToPixels(pageGrid, { columnStart: 0, rowStart: 0, columnSpan, rowSpan: 1 }).width;
    const m = getHabitTrackerRowMetricsPx(widthPx);
    // Compact (sidebar) placement needs room for at least 2 full habit
    // pairs, not just 1 — requested directly: "can the habits side
    // module have a minimum vertical height of two habits (4 rows)."
    // Verified by direct computation against this app's real page
    // geometry before writing this, same as every other minimum here:
    // header + 2 compact pairs lands at exactly 4 grid rows. The wide
    // layout keeps its original "header + 1 row" floor.
    const pairsNeeded = isHabitTrackerCompact(widthPx) ? 2 : 1;
    targetPx = m.headerHeightPx + m.nominalRowHeightPx * pairsNeeded;
  }
  if (targetPx === null) return MIN_ROW_SPAN;
  return Math.max(MIN_ROW_SPAN, pixelHeightToRowSpan(pageGrid, targetPx));
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
const WEEK_SIDEBAR_TEMPLATE_BOXES: Array<{
  heading: string;
  rowStart: number;
  rowSpan: number;
}> = [
  // Starts at row 2 — week-title occupies rows 0-1 at the 30-row grid
  // resolution. Same 2:3:4 visual ratio as before.
  { heading: "Things I'm Grateful For", rowStart: 3, rowSpan: 7 },
  { heading: "Reminders", rowStart: 10, rowSpan: 11 },
  { heading: "Notes", rowStart: 21, rowSpan: 15 },
];

// The "TO - DO" checklist below the hourly grid, on BOTH pages of the
// reference PDF's weekly spread — confirmed directly against
// hourlyjournal.pdf's own extracted text (pymupdf), which has this
// exact label as the last text block on both page 3 (left) and page 4
// (right) of week 1, right after the hourly grid's own time labels.
// columnStart/columnSpan mirror each page's own hourly-grid-core exactly
// (see ensureHourlyGridCore's own call sites). rowStart 20 leaves row 19
// — the row directly below hourly-grid-core's own rowSpan of 19 — empty
// as a 1-row gap, requested directly; rowSpan 10 fills the rest of the
// 30-row grid from there. Shared between getOrCreatePlanner (the
// initial seed) and resetPlannerToTemplate (the debug reset), same
// reasoning as WEEK_SIDEBAR_TEMPLATE_BOXES above — the two can't
// independently drift on what "the original layout" is.
// Where each page's locked hourly block sits. Shared by the initial seed
// and by resetPlannerToTemplate for the same reason the two constants
// above are shared - and this one was missing, so the reset restored the
// block's rowSpan but never its columns, leaving it at its pre-migration
// width on every reset.
const WEEK_HOURLY_TEMPLATE = {
  left: { columnStart: 6, columnSpan: 18 },
  right: { columnStart: 0, columnSpan: 24 },
} as const;

const WEEK_TODO_TEMPLATE: Array<{
  page: "left" | "right";
  columnStart: number;
  columnSpan: number;
  rowStart: number;
  rowSpan: number;
  dayCount: number;
}> = [
  { page: "left", columnStart: 6, columnSpan: 18, rowStart: 21, rowSpan: 15, dayCount: 3 },
  { page: "right", columnStart: 0, columnSpan: 24, rowStart: 21, rowSpan: 15, dayCount: 4 },
];

export async function getOrCreatePlanner() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  let planner = await prisma.planner.findFirst({
    where: { ownerId: userId, isTemplate: false },
    include: {
      pages: {
        orderBy: { position: "asc" },
        include: {
          moduleInstances: { include: { moduleType: true } },
        },
      },
    },
  });

  if (!planner) {
    planner = await prisma.planner.create({
      data: {
        ownerId: userId,
        title: "My First Planner",
        baseType: "WEEK",
        // gridColumns/gridRows/gridGapPx are left unset here — Page's
        // schema defaults (4x30 grid, matching ModuleType's
        // defaultColumnSpan/RowSpan in prisma/seed.mts) apply.
        // Two pages: a week spread is a 2-page spread when the book is
        // open flat (position 0 = left/Sun-Tue, position 1 = right/Wed-Sat).
        pages: {
          create: [{ position: 0 }, { position: 1 }],
        },
      },
      include: {
        pages: {
          orderBy: { position: "asc" },
          include: {
            moduleInstances: { include: { moduleType: true } },
          },
        },
      },
    });
  }

  let needsRefetch = false;

  // Auto-heal: a planner created before the second page existed only has
  // one. Add it rather than requiring a fresh planner.
  if (planner.pages.length < 2) {
    await prisma.page.create({
      data: { plannerId: planner.id, position: 1 },
    });
    needsRefetch = true;
    planner = await prisma.planner.findUniqueOrThrow({
      where: { id: planner.id },
      include: {
        pages: {
          orderBy: { position: "asc" },
          include: { moduleInstances: { include: { moduleType: true } } },
        },
      },
    });
  }

  // A stable const, not the `let planner` binding, for the type below —
  // `typeof planner.pages` re-reads planner's declared (nullable) type
  // rather than its narrowed type at this point, since planner is
  // reassigned across branches above.
  const pages = planner.pages;
  const [leftPage, rightPage] = pages;

  const ensureHourlyGridCore = async (
    page: (typeof pages)[number],
    dayLabels: Array<{ name: string; date: number }>,
    placement: { columnStart: number; columnSpan: number },
    events: Array<{
      day: number;
      startTime: string;
      endTime: string;
      label: string;
      source: "manual" | "google-calendar";
    }> = []
  ) => {
    const hasCore = page.moduleInstances.some(
      (mi) => mi.moduleType.slug === "hourly-grid-core"
    );
    if (hasCore) return;
    const coreType = await prisma.moduleType.findUniqueOrThrow({
      where: { slug: "hourly-grid-core" },
    });
    await prisma.moduleInstance.create({
      data: {
        pageId: page.id,
        moduleTypeId: coreType.id,
        placementMode: "GRID",
        locked: true,
        columnStart: placement.columnStart,
        rowStart: 0,
        columnSpan: placement.columnSpan,
        rowSpan: coreType.defaultRowSpan,
        propValues: {
          dayCount: dayLabels.length,
          dayLabels,
          startTime: "05:30",
          endTime: "23:30",
          intervalMinutes: 30,
          hourLineStyle: "full",
          dayBorder: false,
          events,
        },
      },
    });
    needsRefetch = true;
  };

  // Left page reserves column 0 for the sidebar (Gratitude/Reminders/
  // Notes). Right page has no sidebar content yet (To-Do/Habits don't
  // have renderers), so its 4 day-columns take the full width instead
  // of leaving a matching gap for a sidebar that isn't there.
  await ensureHourlyGridCore(
    leftPage,
    [
      { name: "SUNDAY", date: 1 },
      { name: "MONDAY", date: 2 },
      { name: "TUESDAY", date: 3 },
    ],
    WEEK_HOURLY_TEMPLATE.left
  );
  await ensureHourlyGridCore(
    rightPage,
    [
      { name: "WEDNESDAY", date: 4 },
      { name: "THURSDAY", date: 5 },
      { name: "FRIDAY", date: 6 },
      { name: "SATURDAY", date: 7 },
    ],
    WEEK_HOURLY_TEMPLATE.right
  );

  // todo-checklist and habit-tracker used to be auto-placed here as
  // locked singletons; both were changed to regular, draggable/deletable
  // user-placed modules instead (addable via the palette like
  // labeled-box — see PlannerEditorCanvas.tsx's PALETTE_MODULES and
  // addPaletteModuleAt below), with no auto-heal step for either. That's
  // still true for habit-tracker. todo-checklist gets its own auto-heal
  // again below, further down (WEEK_TODO_TEMPLATE) — non-locked, still
  // fully editable/deletable same as before, just seeded by default now
  // to match what hourlyjournal.pdf's own weekly spread actually shows
  // on both pages (a "TO - DO" checklist below the hourly grid), the
  // same content resetPlannerToTemplate puts back on a reset.

  // week-title and the sidebar boxes only exist on the left page — the
  // reference's right page has no week-title (it only appears once per
  // spread), and its column 0 is part of the same full-width hourly-grid-
  // core/habit-tracker columns rather than a separate sidebar.
  const hasWeekTitle = leftPage.moduleInstances.some(
    (mi) => mi.moduleType.slug === "week-title"
  );
  if (!hasWeekTitle) {
    const titleType = await prisma.moduleType.findUniqueOrThrow({
      where: { slug: "week-title" },
    });
    await prisma.moduleInstance.create({
      data: {
        pageId: leftPage.id,
        moduleTypeId: titleType.id,
        placementMode: "GRID",
        locked: true,
        columnStart: 0,
        rowStart: 0,
        columnSpan: titleType.defaultColumnSpan,
        rowSpan: titleType.defaultRowSpan,
        propValues: {
          weekNumber: 1,
          weekTotal: 52,
          dateRangeLabel: "DEC 31 - JAN 6",
        },
      },
    });
    needsRefetch = true;
  }

  // Default sidebar content: the 3 labeled boxes from the reference PDF,
  // sized in the same rough proportions (Notes gets the most room). Only
  // seeded once — if the sidebar already has any labeled-box instances,
  // leave it alone rather than fighting with content the user's added.
  const hasSidebarContent = leftPage.moduleInstances.some(
    (mi) => mi.moduleType.slug === "labeled-box" && mi.columnStart === 0
  );
  if (!hasSidebarContent) {
    const boxType = await prisma.moduleType.findUniqueOrThrow({
      where: { slug: "labeled-box" },
    });
    await prisma.moduleInstance.createMany({
      data: WEEK_SIDEBAR_TEMPLATE_BOXES.map((box) => ({
        pageId: leftPage.id,
        moduleTypeId: boxType.id,
        placementMode: "GRID" as const,
        columnStart: 0,
        rowStart: box.rowStart,
        columnSpan: boxType.defaultColumnSpan,
        rowSpan: box.rowSpan,
        // templateHeading: the "full reset" target (see NativeModule's
        // own reset-button comment) — captured here, at the one point
        // this instance's heading is ever set to something meaningful
        // by the app itself rather than by a user typing into it, and
        // never touched again afterward (updateModuleConfig's callers
        // always carry it through unchanged in the propValues they
        // send — see handleUpdateHeading's own comment).
        propValues: { heading: box.heading, ruled: false, templateHeading: box.heading },
      })),
    });
    needsRefetch = true;
  }

  // TO-DO checklist below the hourly grid, on both pages — matches
  // hourlyjournal.pdf's own weekly spread (see WEEK_TODO_TEMPLATE's own
  // comment for the exact PDF evidence). Same "seed once, don't fight
  // user content" rule as the sidebar above: each page is checked (and
  // seeded) independently, so moving/deleting/resizing one page's
  // checklist doesn't cause the other page's to be touched, and neither
  // gets recreated once either already has one.
  const missingChecklistPages = WEEK_TODO_TEMPLATE.filter((todo) => {
    const page = todo.page === "left" ? leftPage : rightPage;
    return !page.moduleInstances.some((mi) => mi.moduleType.slug === "todo-checklist");
  });
  if (missingChecklistPages.length > 0) {
    const checklistType = await prisma.moduleType.findUniqueOrThrow({
      where: { slug: "todo-checklist" },
    });
    await prisma.moduleInstance.createMany({
      data: missingChecklistPages.map((todo) => ({
        pageId: (todo.page === "left" ? leftPage : rightPage).id,
        moduleTypeId: checklistType.id,
        placementMode: "GRID" as const,
        columnStart: todo.columnStart,
        rowStart: todo.rowStart,
        columnSpan: todo.columnSpan,
        rowSpan: todo.rowSpan,
        propValues: { dayCount: todo.dayCount },
      })),
    });
    needsRefetch = true;
  }

  if (needsRefetch) {
    planner = await prisma.planner.findUniqueOrThrow({
      where: { id: planner.id },
      include: {
        pages: {
          orderBy: { position: "asc" },
          include: {
            moduleInstances: { include: { moduleType: true } },
          },
        },
      },
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
export async function resetPlannerToTemplate() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const planner = await prisma.planner.findFirst({
    where: { ownerId: userId, isTemplate: false, baseType: "WEEK" },
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
          propValues: {
            ...(hourly.propValues as object),
            startTime: "05:30",
            endTime: "23:30",
            intervalMinutes: 30,
            intervalMode: "on",
            compactHourRows: false,
          } as Prisma.InputJsonValue,
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
      data: WEEK_SIDEBAR_TEMPLATE_BOXES.map((box) => ({
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
      data: WEEK_TODO_TEMPLATE.map((todo) => ({
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

// Parallel to getOrCreatePlanner above, not a generalization of it into a
// multi-baseType dispatcher — that generalization is better deferred
// until the native editor's own requirements for "how does a user pick/
// switch a planner's baseType" are known; guessing that shape now risks
// redoing it (see the migration plan). Same "one Planner = one 2-page
// spread of a given baseType" model as the WEEK planner: this seeds one
// specific month (January 2024, matching the reference PDF exactly, for
// easy visual comparison — see the migration plan's verification step),
// not a full 12-month year. A later pass can generalize to an arbitrary
// year/month once there's a real UI for picking one.
export async function getOrCreateMonthPlanner() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  // baseType filter matters here in a way it doesn't for
  // getOrCreatePlanner's WEEK lookup above — a user can have both a WEEK
  // and a MONTH planner, and findFirst without this filter would happily
  // return whichever one it found first.
  let planner = await prisma.planner.findFirst({
    where: { ownerId: userId, isTemplate: false, baseType: "MONTH" },
    include: {
      pages: {
        orderBy: { position: "asc" },
        include: { moduleInstances: { include: { moduleType: true } } },
      },
    },
  });

  if (!planner) {
    planner = await prisma.planner.create({
      data: {
        ownerId: userId,
        title: "My First Month",
        baseType: "MONTH",
        // Two pages, same "book open flat" convention as the WEEK
        // planner: position 0 = left (Sun/Mon/Tue columns), position 1 =
        // right (Wed/Thu/Fri/Sat columns).
        pages: { create: [{ position: 0 }, { position: 1 }] },
      },
      include: {
        pages: {
          orderBy: { position: "asc" },
          include: { moduleInstances: { include: { moduleType: true } } },
        },
      },
    });
  }

  let needsRefetch = false;

  if (planner.pages.length < 2) {
    await prisma.page.create({ data: { plannerId: planner.id, position: 1 } });
    needsRefetch = true;
    planner = await prisma.planner.findUniqueOrThrow({
      where: { id: planner.id },
      include: {
        pages: {
          orderBy: { position: "asc" },
          include: { moduleInstances: { include: { moduleType: true } } },
        },
      },
    });
  }

  const pages = planner.pages;
  const [leftPage, rightPage] = pages;

  // January 2024 — see this function's own header comment for why a
  // fixed month rather than "the current month."
  const calendar = computeMonthCalendar(2024, 1);
  const dayNames = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

  const ensureMonthGridCore = async (
    page: (typeof pages)[number],
    startColumn: number,
    dayCount: number,
    placement: { columnStart: number; columnSpan: number }
  ) => {
    const hasCore = page.moduleInstances.some((mi) => mi.moduleType.slug === "month-grid-core");
    if (hasCore) return;
    const coreType = await prisma.moduleType.findUniqueOrThrow({
      where: { slug: "month-grid-core" },
    });
    await prisma.moduleInstance.create({
      data: {
        pageId: page.id,
        moduleTypeId: coreType.id,
        placementMode: "GRID",
        locked: true,
        columnStart: placement.columnStart,
        rowStart: 0,
        columnSpan: placement.columnSpan,
        rowSpan: coreType.defaultRowSpan,
        propValues: {
          dayCount,
          dayLabels: dayNames.slice(startColumn, startColumn + dayCount).map((name) => ({ name })),
          weekCount: calendar.weekCount,
          cells: calendar.weeks.map((week) => week.slice(startColumn, startColumn + dayCount)),
        },
      },
    });
    needsRefetch = true;
  };

  // Same column convention as hourly-grid-core: left page reserves
  // column 0 for the sidebar, right page's day columns take the full
  // width since it has no sidebar.
  await ensureMonthGridCore(leftPage, 0, 3, { columnStart: 6, columnSpan: 18 });
  await ensureMonthGridCore(rightPage, 3, 4, { columnStart: 0, columnSpan: 24 });

  // NOTES sits below month-grid-core on *both* pages (unlike the weekly
  // layout's todo-checklist/habit-tracker, which only occupy whichever
  // page needs them) — confirmed directly against the reference: both
  // page 2 and page 3 have their own NOTES box under the calendar grid,
  // sized to that page's own day-column width. Same rows-below-the-core
  // convention as the weekly layout's below-hourly-grid zone, including
  // the explicit 1-row gap (month-grid-core's own rowSpan is 17, Notes
  // starts at 18, not flush against it) — the weekly layout's
  // hourly-grid-core/todo-checklist gap was requested and fixed the same
  // way (see the corresponding data fix for the already-seeded weekly
  // planner; this seed just gets a fresh monthly planner right from the
  // start instead of needing the same fix after the fact).
  const ensureNotesBox = async (
    page: (typeof pages)[number],
    placement: { columnStart: number; columnSpan: number }
  ) => {
    const hasNotes = page.moduleInstances.some(
      (mi) => mi.moduleType.slug === "labeled-box" && mi.rowStart === 18 && mi.columnStart === placement.columnStart
    );
    if (hasNotes) return;
    const boxType = await prisma.moduleType.findUniqueOrThrow({ where: { slug: "labeled-box" } });
    await prisma.moduleInstance.create({
      data: {
        pageId: page.id,
        moduleTypeId: boxType.id,
        placementMode: "GRID",
        columnStart: placement.columnStart,
        rowStart: 23,
        columnSpan: placement.columnSpan,
        rowSpan: 13,
        propValues: { heading: "Notes", ruled: false },
      },
    });
    needsRefetch = true;
  };
  await ensureNotesBox(leftPage, { columnStart: 6, columnSpan: 18 });
  await ensureNotesBox(rightPage, { columnStart: 0, columnSpan: 24 });

  const hasMonthTitle = leftPage.moduleInstances.some((mi) => mi.moduleType.slug === "month-title");
  if (!hasMonthTitle) {
    const titleType = await prisma.moduleType.findUniqueOrThrow({ where: { slug: "month-title" } });
    await prisma.moduleInstance.create({
      data: {
        pageId: leftPage.id,
        moduleTypeId: titleType.id,
        placementMode: "GRID",
        locked: true,
        columnStart: 0,
        rowStart: 0,
        columnSpan: titleType.defaultColumnSpan,
        rowSpan: titleType.defaultRowSpan,
        propValues: { monthName: "JANUARY" },
      },
    });
    needsRefetch = true;
  }

  // Default sidebar content: the 4 labeled boxes from the reference
  // PDF's monthly layout, proportioned the same way as their measured
  // heights in the reference (Tentative Dates gets the most room, same
  // "measure, don't guess" discipline as the weekly sidebar's own
  // rowSpans). Only seeded once, same "don't fight user content" rule as
  // the weekly sidebar.
  const hasSidebarContent = leftPage.moduleInstances.some(
    (mi) => mi.moduleType.slug === "labeled-box" && mi.columnStart === 0
  );
  if (!hasSidebarContent) {
    const boxType = await prisma.moduleType.findUniqueOrThrow({ where: { slug: "labeled-box" } });
    const defaultBoxes: Array<{ heading: string; rowStart: number; rowSpan: number }> = [
      // Starts at row 2 — month-title occupies rows 0-1, same convention
      // as week-title.
      { heading: "Monthly Mantra", rowStart: 2, rowSpan: 4 },
      { heading: "Priorities", rowStart: 6, rowSpan: 6 },
      { heading: "Reminders", rowStart: 12, rowSpan: 7 },
      { heading: "Tentative Dates", rowStart: 19, rowSpan: 11 },
    ];
    await prisma.moduleInstance.createMany({
      data: defaultBoxes.map((box) => ({
        pageId: leftPage.id,
        moduleTypeId: boxType.id,
        placementMode: "GRID" as const,
        columnStart: 0,
        rowStart: box.rowStart,
        columnSpan: boxType.defaultColumnSpan,
        rowSpan: box.rowSpan,
        // See getOrCreatePlanner's identical field for why.
        propValues: { heading: box.heading, ruled: false, templateHeading: box.heading },
      })),
    });
    needsRefetch = true;
  }

  if (needsRefetch) {
    planner = await prisma.planner.findUniqueOrThrow({
      where: { id: planner.id },
      include: {
        pages: {
          orderBy: { position: "asc" },
          include: { moduleInstances: { include: { moduleType: true } } },
        },
      },
    });
  }

  return planner;
}

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
      const hourlyGrid = page.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");

      let effectiveColumnStart = columnStart;
      let effectiveColumnSpan = moduleType.defaultColumnSpan;
      let effectiveRowSpan = moduleType.defaultRowSpan;
      // The caller's own requested row, passed straight through. Nothing
      // reassigns this any more - see the sidebar branch below.
      const effectiveRowStart = rowStart;
      const configOverrides: Record<string, unknown> = {};
      if (moduleTypeSlug === "todo-checklist" || moduleTypeSlug === "habit-tracker" || moduleTypeSlug === "labeled-box") {
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
        const inBottomZone =
          hourlyGrid && hourlyGrid.columnStart !== null && columnStart >= hourlyGrid.columnStart && columnStart < hourlyGrid.columnStart + hourlyGrid.columnSpan;
        if (inBottomZone && hourlyGrid && hourlyGrid.columnStart !== null) {
          effectiveColumnStart = hourlyGrid.columnStart;
          effectiveColumnSpan = hourlyGrid.columnSpan;
          if (moduleTypeSlug === "todo-checklist") {
            const hourlyProps = hourlyGrid.propValues as { dayCount?: number };
            configOverrides.dayCount = hourlyProps.dayCount ?? hourlyGrid.columnSpan;
          }

          // This branch used to also force effectiveRowStart to the
          // zone's own bottom edge, appending the new module below
          // everything already there and ignoring the requested row.
          // See the sidebar branch below for why that is gone.
        } else if (moduleTypeSlug === "todo-checklist" || moduleTypeSlug === "habit-tracker") {
          // Sidebar (side-zone) compact placement — see this block's own
          // top comment for the full reasoning, including why labeled-box
          // doesn't reach this branch at all (a plain `else`, not `else if`,
          // would have). columnStart is left as the caller's own request
          // (in practice always 0, the sidebar's one column).
          effectiveColumnSpan = 1;
          if (moduleTypeSlug === "todo-checklist") {
            configOverrides.dayCount = 1;
          }

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
      effectiveRowSpan = getMinRowSpanForSlug(moduleTypeSlug, pageGrid, effectiveColumnSpan);
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
        occupied.push({
          id: "__hourlygridgap__",
          locked: true,
          columnStart: hourlyGrid.columnStart,
          rowStart: hourlyGrid.rowStart + hourlyGrid.rowSpan,
          columnSpan: hourlyGrid.columnSpan,
          rowSpan: 1,
        });
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
        paletteMinRowSpanById[o.id] = getMinRowSpanForSlug(otherMi.moduleType.slug, pageGrid, effectiveColumnSpan);
      }
      const { placement: resolvedPlacement, reflow: paletteReflow } = resolveModulePlacement(
        pageGrid,
        { ...candidate, columnStart: effectiveColumnStart, columnSpan: effectiveColumnSpan, rowSpan: effectiveRowSpan },
        occupied,
        undefined,
        paletteMinRowSpanById
      );

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
  const hourlyGrid = targetPage.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
  const inBottomZone =
    !!hourlyGrid &&
    hourlyGrid.columnStart !== null &&
    columnStart >= hourlyGrid.columnStart &&
    columnStart < hourlyGrid.columnStart + hourlyGrid.columnSpan;

  let effectiveColumnStart: number;
  let effectiveColumnSpan: number;
  const configOverrides: Record<string, unknown> = {};
  if (inBottomZone && hourlyGrid && hourlyGrid.columnStart !== null) {
    effectiveColumnStart = hourlyGrid.columnStart;
    effectiveColumnSpan = hourlyGrid.columnSpan;
    if (slug === "todo-checklist") {
      const hourlyProps = hourlyGrid.propValues as { dayCount?: number };
      configOverrides.dayCount = hourlyProps.dayCount ?? hourlyGrid.columnSpan;
    }
  } else {
    // Side zone. Reached by every zone-crossing type now, labeled-box
    // included — see canCrossZones (grid.ts) for why that used to throw
    // here instead, and why the asymmetry was a bug.
    effectiveColumnStart = 0;
    effectiveColumnSpan = 1;
    if (slug === "todo-checklist") {
      configOverrides.dayCount = 1;
    }
  }
  const effectiveRowSpan = getMinRowSpanForSlug(slug, targetPageGrid, effectiveColumnSpan);

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
  let hourlyGridRect: { columnStart: number; rowStart: number; columnSpan: number; rowSpan: number } | null = null;
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
    if (mi.moduleType.slug === "hourly-grid-core") {
      hourlyGridRect = { columnStart: mi.columnStart, rowStart: mi.rowStart, columnSpan: mi.columnSpan, rowSpan: mi.rowSpan };
    }
  }
  // Same synthetic 1-row breathing-gap reservation below hourly-grid-core
  // as resolveDrag's own identical block (NativePlannerEditor.tsx) and
  // addPaletteModuleAt above — keeps a landing flush against the hourly
  // grid unreachable here too, not just on a same-zone drag. Reserved
  // against the TARGET page's own hourly grid, same as resolveDrag.
  if (hourlyGridRect) {
    targetOthers.push({
      id: "__hourlygridgap__",
      locked: true,
      columnStart: hourlyGridRect.columnStart,
      rowStart: hourlyGridRect.rowStart + hourlyGridRect.rowSpan,
      columnSpan: hourlyGridRect.columnSpan,
      rowSpan: 1,
    });
  }

  const candidate = { columnStart: effectiveColumnStart, rowStart, columnSpan: effectiveColumnSpan, rowSpan: effectiveRowSpan };
  const minRowSpanById: Record<string, number> = {};
  for (const o of targetOthers) {
    if (o.locked || o.columnStart !== candidate.columnStart || o.columnSpan !== candidate.columnSpan) continue;
    const otherMi = targetPage.moduleInstances.find((mi) => mi.id === o.id);
    if (!otherMi) continue;
    minRowSpanById[o.id] = getMinRowSpanForSlug(otherMi.moduleType.slug, targetPageGrid, candidate.columnSpan);
  }

  const { placement: resolved, reflow } = resolveModulePlacement(
    targetPageGrid,
    candidate,
    targetOthers,
    instance.rowStart,
    minRowSpanById
  );

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
    const hourlyGrid = instance.page.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
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
      include: { page: { include: { planner: { select: { theme: true } } } }, moduleType: true },
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
  const topMinRowSpan = getMinRowSpanForSlug(top.moduleType.slug, pageGrid, top.columnSpan);
  const bottomMinRowSpan = getMinRowSpanForSlug(bottom.moduleType.slug, pageGrid, bottom.columnSpan);
  const clampedDelta = Math.max(
    -(top.rowSpan - topMinRowSpan),
    Math.min(bottom.rowSpan - bottomMinRowSpan, deltaRows)
  );
  if (clampedDelta === 0) {
    throw new Error("Nothing to resize");
  }

  const newTopRowSpan = top.rowSpan + clampedDelta;
  const newBottomRowStart = bottom.rowStart + clampedDelta;
  const newBottomRowSpan = bottom.rowSpan - clampedDelta;

  const [updatedTop, updatedBottom] = await prisma.$transaction([
    prisma.moduleInstance.update({
      where: { id: top.id },
      data: { rowSpan: newTopRowSpan },
    }),
    prisma.moduleInstance.update({
      where: { id: bottom.id },
      data: { rowStart: newBottomRowStart, rowSpan: newBottomRowSpan },
    }),
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
  type StackMember = { id: string; rowStart: number; rowSpan: number; slug: string };
  const stack: StackMember[] = [{ id: bottom.id, rowStart: bottomRowStart, rowSpan: bottom.rowSpan, slug: bottom.moduleType.slug }];
  let topCursor = bottomRowStart;
  for (;;) {
    const above = siblings.find((mi) => mi.rowStart + mi.rowSpan === topCursor);
    if (!above) break;
    stack.unshift({ id: above.id, rowStart: above.rowStart, rowSpan: above.rowSpan, slug: above.moduleType.slug });
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
  const minSpans = stack.map((mi) => getMinRowSpanForSlug(mi.slug, pageGrid, bottom.columnSpan));
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
    where: { ownerId: userId, isTemplate: false },
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
    where: { ownerId: userId, isTemplate: false },
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
  // Only meaningful at intervalMinutes:60 — see getRowHeightPx's own
  // comment (hourlyGridCore.ts) for why 1-hour rows double their height
  // by default, and what opting into this reverts to. Harmless to send
  // even at 30min/off; just ignored wherever row height doesn't depend
  // on it.
  compactHourRows: boolean;
  weekStartDay: number; // 0=Sun..6=Sat
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
    where: { ownerId: userId, isTemplate: false },
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

  if (settings.intervalMode === "off") {
    for (const page of planner.pages) {
      const hourly = page.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
      if (!hourly) continue;
      updates.push(
        prisma.moduleInstance.update({
          where: { id: hourly.id },
          data: {
            propValues: {
              ...(hourly.propValues as object),
              startTime: settings.startTime,
              endTime: settings.endTime,
              intervalMinutes: settings.intervalMinutes,
              intervalMode: "off",
              compactHourRows: settings.compactHourRows,
            } as Prisma.InputJsonValue,
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
    });

    // Same 1-row breathing gap convention enforced elsewhere in this
    // file (addPaletteModuleAt's synthetic reservation rect, resolveDrag's
    // virtual lock) — kept local rather than a shared constant, matching
    // how every other site here just inlines the literal 1.
    const GAP_ROWS = 1;

    type PerPage = {
      hourlyId: string;
      hourlyPropValues: unknown;
      hourlyRowStart: number;
      newRowSpan: number;
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
      const belowMembers = page.moduleInstances.filter(
        (mi): mi is typeof mi & { rowStart: number } =>
          !mi.locked &&
          mi.rowStart !== null &&
          mi.columnStart === hourly.columnStart &&
          mi.columnSpan === hourly.columnSpan &&
          mi.rowStart >= hourly.rowStart! + hourly.rowSpan
      );
      // Checked against each member's CURRENT rowSpan, not its own minimum
      // floor — this repack (packStackFromTop, below) only ever moves a
      // member's rowStart, it never shrinks a member's own rowSpan to fit.
      // Checking against the floor instead would let this guard pass while
      // the repack that follows still pushes an unshrunk module past the
      // page's own bottom edge (confirmed against this app's real dev data:
      // a full-day range needs 25 of 30 rows, leaving 4 for the below zone
      // — comfortably above the existing todo-checklist's own 2-row floor,
      // but well under its actual current 10-row size).
      const belowCurrentTotal = belowMembers.reduce((sum, mi) => sum + mi.rowSpan, 0);
      const availableForBelow = pageGrid.gridRows - newRowSpan - GAP_ROWS;
      if (belowMembers.length > 0 && availableForBelow < belowCurrentTotal) {
        throw new Error(
          "This time range needs more room than the page has — shrink or remove a module below the hourly grid first"
        );
      }

      perPage.push({
        hourlyId: hourly.id,
        hourlyPropValues: hourly.propValues,
        hourlyRowStart: hourly.rowStart,
        newRowSpan,
        belowMembers: belowMembers.map((mi) => ({ id: mi.id, rowStart: mi.rowStart, rowSpan: mi.rowSpan })),
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
            propValues: {
              ...(p.hourlyPropValues as object),
              startTime: settings.startTime,
              endTime: settings.endTime,
              intervalMinutes: settings.intervalMinutes,
              intervalMode: "on",
              compactHourRows: settings.compactHourRows,
            } as Prisma.InputJsonValue,
          },
        })
      );
      const newBottom = p.hourlyRowStart + p.newRowSpan + 1;
      for (const move of packStackFromTop(newBottom, p.belowMembers)) {
        updates.push(prisma.moduleInstance.update({ where: { id: move.id }, data: { rowStart: move.rowStart } }));
      }
    }
  }

  const nextTheme: PlannerTheme = { ...(planner.theme as PlannerTheme | null), weekStartDay: settings.weekStartDay };
  await prisma.$transaction([
    ...updates,
    prisma.planner.update({ where: { id: planner.id }, data: { theme: nextTheme as Prisma.InputJsonValue } }),
  ]);
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
  if (instance.moduleType.slug !== "hourly-grid-core") {
    throw new Error("Not an hourly grid instance");
  }
  if (instance.columnStart === null || instance.rowStart === null) {
    throw new Error("Module isn't grid-placed");
  }
  const props = instance.propValues as { intervalMode?: "on" | "off" };
  if (props.intervalMode !== "off") {
    throw new Error("Can only drag-resize the hourly grid while increments are off");
  }

  const pageGrid = pageGridFor(instance.page);
  // "around the same minimum size as modules," requested directly —
  // getHourlyGridCoreOffModeMinHeightPx's own comment explains why
  // header+gap alone (no extra row) already lands at exactly
  // MIN_ROW_SPAN on this app's real page geometry; still clamped
  // through the same Math.max as every other slug's own floor, in case
  // that geometry ever changes.
  const minRowSpan = Math.max(MIN_ROW_SPAN, pixelHeightToRowSpan(pageGrid, getHourlyGridCoreOffModeMinHeightPx()));

  const stackBottomRowEnd = instance.rowStart + instance.rowSpan;
  // The below-zone "followers" — every unlocked instance sharing
  // hourly-grid-core's own exact column range, sitting at or below its
  // current bottom, sorted top to bottom. All of them move together,
  // preserving their own relative spacing (they're already gravity-
  // packed by every other path that places/moves them).
  const followers = instance.page.moduleInstances
    .filter(
      (mi) =>
        !mi.locked &&
        mi.id !== instance.id &&
        mi.columnStart === instance.columnStart &&
        mi.columnSpan === instance.columnSpan &&
        mi.rowStart !== null &&
        mi.rowStart >= stackBottomRowEnd
    )
    .sort((a, b) => (a.rowStart as number) - (b.rowStart as number));

  // Growing is bounded by whatever's beyond the *followers'* own
  // combined extent (they move as a rigid block, so their own tail is
  // what actually risks running into something) — checked against
  // everything below them, locked or not: hourly-grid-core is never
  // itself a member of the below-zone's own stack, so an unlocked
  // sibling further down would already be part of `followers` above
  // (same test, over the whole page), not something a locked-only check
  // would still need to catch separately.
  const tailRowEnd =
    followers.length > 0
      ? Math.max(...followers.map((mi) => (mi.rowStart as number) + mi.rowSpan))
      : stackBottomRowEnd;
  const followerIds = new Set(followers.map((mi) => mi.id));
  let boundBelowTail = pageGrid.gridRows;
  for (const mi of instance.page.moduleInstances) {
    if (mi.id === instance.id || followerIds.has(mi.id) || mi.rowStart === null) continue;
    const sameColumn = mi.columnStart === instance.columnStart && mi.columnSpan === instance.columnSpan;
    if (mi.rowStart < tailRowEnd || !sameColumn) continue;
    boundBelowTail = Math.min(boundBelowTail, mi.rowStart);
  }
  const maxGrow = Math.max(0, boundBelowTail - tailRowEnd);

  const clampedDelta = Math.max(-(instance.rowSpan - minRowSpan), Math.min(maxGrow, deltaRows));
  if (clampedDelta === 0) {
    throw new Error("Nothing to resize");
  }

  const fontFamily = fontFamilyFromTheme(instance.page.planner.theme);
  const [updatedInstance, ...updatedFollowers] = await prisma.$transaction([
    prisma.moduleInstance.update({
      where: { id: instance.id },
      data: { rowSpan: instance.rowSpan + clampedDelta },
    }),
    ...followers.map((mi) =>
      prisma.moduleInstance.update({
        where: { id: mi.id },
        data: { rowStart: (mi.rowStart as number) + clampedDelta },
      })
    ),
  ]);

  const followerSlugById = new Map(followers.map((mi) => [mi.id, mi.moduleType.slug]));
  return [updatedInstance, ...updatedFollowers].map((row) => ({
    id: row.id,
    rowStart: row.rowStart as number,
    rowSpan: row.rowSpan,
    elements: renderInstanceElements(row, followerSlugById.get(row.id) ?? "hourly-grid-core", pageGrid, fontFamily),
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
