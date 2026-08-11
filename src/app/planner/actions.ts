"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  clampGridPlacement,
  findNearestFreeCell,
  rectsOverlap,
  moduleInstancesToRects,
  type PageGrid,
} from "@/lib/grid";
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";
import { renderModuleInstance } from "@/lib/renderModuleInstance";
import { computeMonthCalendar } from "@/lib/monthCalendar";

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
    gridGapPx: page.gridGapPx,
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
  pageGrid: PageGrid
) {
  const [element] = renderModuleInstance({ ...row, moduleType: { slug } }, pageGrid);
  return element;
}

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
    { columnStart: 1, columnSpan: 3 },
    [
      {
        day: 1,
        startTime: "09:00",
        endTime: "10:00",
        label: "Team sync",
        source: "manual",
      },
    ]
  );
  await ensureHourlyGridCore(
    rightPage,
    [
      { name: "WEDNESDAY", date: 4 },
      { name: "THURSDAY", date: 5 },
      { name: "FRIDAY", date: 6 },
      { name: "SATURDAY", date: 7 },
    ],
    { columnStart: 0, columnSpan: 4 }
  );

  // todo-checklist and habit-tracker used to be auto-placed here (locked
  // singletons, one todo on the left page, one habit-tracker on the
  // right). They're now regular user-placed modules instead — draggable,
  // deletable, addable via the palette like labeled-box — so there's no
  // auto-heal step for them any more; a fresh planner starts without
  // either until the user drags one in. See PlannerEditorCanvas.tsx's
  // PALETTE_MODULES and addPaletteModuleAt below.

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
    const defaultBoxes: Array<{
      heading: string;
      rowStart: number;
      rowSpan: number;
    }> = [
      // Starts at row 2 — week-title occupies rows 0-1 at the 30-row
      // grid resolution. Same 2:3:4 visual ratio as before.
      { heading: "Things I'm Grateful For", rowStart: 2, rowSpan: 6 },
      { heading: "Reminders", rowStart: 8, rowSpan: 9 },
      { heading: "Notes", rowStart: 17, rowSpan: 13 },
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
        propValues: { heading: box.heading, ruled: false },
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
  await ensureMonthGridCore(leftPage, 0, 3, { columnStart: 1, columnSpan: 3 });
  await ensureMonthGridCore(rightPage, 3, 4, { columnStart: 0, columnSpan: 4 });

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
        rowStart: 18,
        columnSpan: placement.columnSpan,
        rowSpan: 12,
        propValues: { heading: "Notes", ruled: false },
      },
    });
    needsRefetch = true;
  };
  await ensureNotesBox(leftPage, { columnStart: 1, columnSpan: 3 });
  await ensureNotesBox(rightPage, { columnStart: 0, columnSpan: 4 });

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
        propValues: { heading: box.heading, ruled: false },
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
  const { page, created } = await prisma.$transaction(
    async (tx) => {
      const page = await tx.page.findFirst({
        where: { id: pageId, planner: { ownerId: userId } },
        include: { moduleInstances: { include: { moduleType: true } } },
      });
      if (!page) {
        throw new Error("Page not found or not owned by this user");
      }

      const moduleType = await tx.moduleType.findUniqueOrThrow({
        where: { slug: moduleTypeSlug },
      });

      // todo-checklist and habit-tracker size themselves to match
      // whichever page they land on — 3 day-columns wide on the left
      // (3-day) page, 4 wide on the right (4-day) page — by reading that
      // page's own hourly-grid-core instance, rather than always using
      // the module type's fixed default. Without this, a checklist
      // dropped on the 4-day page would still only draw 3 day segments
      // (the schema default), out of step with the hourly grid it's
      // sitting under.
      let effectiveColumnSpan = moduleType.defaultColumnSpan;
      const configOverrides: Record<string, unknown> = {};
      if (moduleTypeSlug === "todo-checklist" || moduleTypeSlug === "habit-tracker") {
        const hourlyGrid = page.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
        if (hourlyGrid) {
          effectiveColumnSpan = hourlyGrid.columnSpan;
          if (moduleTypeSlug === "todo-checklist") {
            const hourlyProps = hourlyGrid.propValues as { dayCount?: number };
            configOverrides.dayCount = hourlyProps.dayCount ?? hourlyGrid.columnSpan;
          }
        }
      }

      const pageGrid = pageGridFor(page);
      const candidate = clampGridPlacement(pageGrid, {
        columnStart,
        rowStart,
        columnSpan: effectiveColumnSpan,
        rowSpan: moduleType.defaultRowSpan,
      });
      // Don't drop a new module on top of something already there — find
      // the nearest free cell instead of just clamping to the page edge.
      // Plain relocation rather than the drag-reposition path's stack
      // reflow (see PlannerEditorCanvas) — reasonable for a fresh drop,
      // which doesn't have "siblings it was already part of" to reorder
      // among.
      const occupied = moduleInstancesToRects(page.moduleInstances);
      const clamped = findNearestFreeCell(
        pageGrid,
        { ...candidate, columnSpan: effectiveColumnSpan, rowSpan: moduleType.defaultRowSpan },
        occupied
      );

      // Pull each config field's declared default out of the JSON
      // Schema, so a freshly-added instance starts in a sensible state,
      // then layer the page-specific overrides (dayCount, above) on top.
      const schema = moduleType.configSchema as {
        properties?: Record<string, { default?: unknown }>;
      };
      const defaultConfig = {
        ...Object.fromEntries(
          Object.entries(schema.properties ?? {}).map(([key, def]) => [key, def.default])
        ),
        ...configOverrides,
      };

      const created = await tx.moduleInstance.create({
        data: {
          pageId,
          moduleTypeId: moduleType.id,
          placementMode: "GRID",
          columnStart: clamped.columnStart,
          rowStart: clamped.rowStart,
          columnSpan: effectiveColumnSpan,
          rowSpan: moduleType.defaultRowSpan,
          propValues: defaultConfig as Prisma.InputJsonValue,
        },
      });

      return { page, moduleType, effectiveColumnSpan, created };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  const pageGrid = pageGridFor(page);
  const element = renderInstance(created, moduleTypeSlug, pageGrid);

  return {
    instanceId: created.id,
    columnSpan: created.columnSpan,
    rowSpan: created.rowSpan,
    propValues: created.propValues,
    element,
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
    include: { page: true, moduleType: true },
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
  const element = renderInstance(updated, instance.moduleType.slug, pageGrid);

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
      page: { include: { moduleInstances: { include: { moduleType: true } } } },
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

  const element = renderInstance(updated, instance.moduleType.slug, pageGrid);

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
      include: { page: true, moduleType: true },
    }),
    prisma.moduleInstance.findFirst({
      where: { id: bottomInstanceId, page: { planner: { ownerId: userId } } },
      include: { page: true, moduleType: true },
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

  // Neither module may shrink below 2 rows (not 1) — a single-row
  // sidebar box reads as barely more than a sliver, all header/border
  // chrome with no real writing space left. Authoritative here since
  // this is what actually persists; useEdgeResize.ts and
  // NativePlannerEditor.tsx mirror the same MIN_ROW_SPAN client-side so
  // a drag never visually promises a size the server would then further
  // clamp.
  const MIN_ROW_SPAN = 2;
  const clampedDelta = Math.max(-(top.rowSpan - MIN_ROW_SPAN), Math.min(bottom.rowSpan - MIN_ROW_SPAN, deltaRows));
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

  const pageGrid = pageGridFor(top.page);

  return {
    top: {
      element: renderInstance(updatedTop, top.moduleType.slug, pageGrid),
      rowSpan: updatedTop.rowSpan,
    },
    bottom: {
      element: renderInstance(updatedBottom, bottom.moduleType.slug, pageGrid),
      rowStart: updatedBottom.rowStart,
      rowSpan: updatedBottom.rowSpan,
    },
  };
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
