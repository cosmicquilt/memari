"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { clampGridPlacement, type PageGrid } from "@/lib/grid";
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";
import { renderModuleInstance } from "@/lib/renderModuleInstance";

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

  // Below-zone: full-height todo-checklist on the left page, full-height
  // habit-tracker on the right — one or the other per page, not both, so
  // each page's below-zone is fully used by a single module rather than
  // splitting it (that's what the reference's short-todo+habit pairing
  // does; this deliberately doesn't replicate that, to leave the split
  // layout open for other module types later). Both sit in rows 22-29 —
  // right after hourly-grid-core's 22-row allocation ends — using the
  // same column placement as that page's hourly-grid-core.
  const hasTodo = leftPage.moduleInstances.some(
    (mi) => mi.moduleType.slug === "todo-checklist"
  );
  if (!hasTodo) {
    const todoType = await prisma.moduleType.findUniqueOrThrow({
      where: { slug: "todo-checklist" },
    });
    await prisma.moduleInstance.create({
      data: {
        pageId: leftPage.id,
        moduleTypeId: todoType.id,
        placementMode: "GRID",
        locked: true,
        columnStart: 1,
        rowStart: 19,
        columnSpan: 3,
        rowSpan: 11,
        propValues: { dayCount: 3 },
      },
    });
    needsRefetch = true;
  }

  const hasHabitTracker = rightPage.moduleInstances.some(
    (mi) => mi.moduleType.slug === "habit-tracker"
  );
  if (!hasHabitTracker) {
    const habitType = await prisma.moduleType.findUniqueOrThrow({
      where: { slug: "habit-tracker" },
    });
    await prisma.moduleInstance.create({
      data: {
        pageId: rightPage.id,
        moduleTypeId: habitType.id,
        placementMode: "GRID",
        locked: true,
        columnStart: 0,
        rowStart: 19,
        columnSpan: 4,
        rowSpan: 11,
        propValues: { habits: [] },
      },
    });
    needsRefetch = true;
  }

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

  const page = await prisma.page.findFirst({
    where: { id: pageId, planner: { ownerId: userId } },
  });
  if (!page) {
    throw new Error("Page not found or not owned by this user");
  }

  const moduleType = await prisma.moduleType.findUniqueOrThrow({
    where: { slug: moduleTypeSlug },
  });

  const pageGrid: PageGrid = {
    widthPx: PRINT_WIDTH_PX,
    heightPx: PRINT_HEIGHT_PX,
    gridColumns: page.gridColumns,
    gridRows: page.gridRows,
    gridGapPx: page.gridGapPx,
    marginPx: page.marginPx,
  };
  const clamped = clampGridPlacement(pageGrid, {
    columnStart,
    rowStart,
    columnSpan: moduleType.defaultColumnSpan,
    rowSpan: moduleType.defaultRowSpan,
  });

  // Pull each config field's declared default out of the JSON Schema,
  // so a freshly-added instance starts in a sensible state.
  const schema = moduleType.configSchema as {
    properties?: Record<string, { default?: unknown }>;
  };
  const defaultConfig = Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([key, def]) => [
      key,
      def.default,
    ])
  );

  const created = await prisma.moduleInstance.create({
    data: {
      pageId,
      moduleTypeId: moduleType.id,
      placementMode: "GRID",
      columnStart: clamped.columnStart,
      rowStart: clamped.rowStart,
      columnSpan: moduleType.defaultColumnSpan,
      rowSpan: moduleType.defaultRowSpan,
      propValues: defaultConfig as Prisma.InputJsonValue,
    },
  });

  const [element] = renderModuleInstance(
    {
      id: created.id,
      locked: created.locked,
      columnStart: created.columnStart,
      rowStart: created.rowStart,
      columnSpan: created.columnSpan,
      rowSpan: created.rowSpan,
      propValues: created.propValues,
      moduleType: { slug: moduleTypeSlug },
    },
    pageGrid
  );

  return {
    instanceId: created.id,
    columnSpan: created.columnSpan,
    rowSpan: created.rowSpan,
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

  const pageGrid: PageGrid = {
    widthPx: PRINT_WIDTH_PX,
    heightPx: PRINT_HEIGHT_PX,
    gridColumns: instance.page.gridColumns,
    gridRows: instance.page.gridRows,
    gridGapPx: instance.page.gridGapPx,
    marginPx: instance.page.marginPx,
  };
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
