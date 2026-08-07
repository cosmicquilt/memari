"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

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
        // schema defaults (6x10 grid, matching ModuleType's
        // defaultColumnSpan/RowSpan in prisma/seed.mts) apply.
        pages: {
          create: [{ position: 0 }],
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

  // Auto-heal: the first page should always have its locked
  // hourly-grid-core block. Covers both brand-new planners and ones
  // created before this module type existed.
  const firstPage = planner.pages[0];
  const hasCore = firstPage.moduleInstances.some(
    (mi) => mi.moduleType.slug === "hourly-grid-core"
  );
  if (!hasCore) {
    const coreType = await prisma.moduleType.findUniqueOrThrow({
      where: { slug: "hourly-grid-core" },
    });
    await prisma.moduleInstance.create({
      data: {
        pageId: firstPage.id,
        moduleTypeId: coreType.id,
        placementMode: "GRID",
        locked: true,
        columnStart: 1,
        rowStart: 0,
        columnSpan: coreType.defaultColumnSpan,
        rowSpan: coreType.defaultRowSpan,
        propValues: {
          dayCount: 3,
          dayLabels: [
            { name: "SUNDAY", date: 1 },
            { name: "MONDAY", date: 2 },
            { name: "TUESDAY", date: 3 },
          ],
          startTime: "05:30",
          endTime: "23:30",
          intervalMinutes: 30,
          hourLineStyle: "full",
          dayBorder: false,
          events: [
            {
              day: 1,
              startTime: "09:00",
              endTime: "10:00",
              label: "Team sync",
              source: "manual",
            },
          ],
        },
      },
    });
    // Re-fetch so the caller gets the instance we just created.
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

// Adds a module to the next open cell in the sidebar column (column 0).
// First-pass placement mechanism — click-to-add rather than drag-to-cell,
// which is a separate, bigger interaction to build later.
export async function addPaletteModule(pageId: string, moduleTypeSlug: string) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Not signed in");
  }

  const page = await prisma.page.findFirst({
    where: { id: pageId, planner: { ownerId: userId } },
    include: { moduleInstances: true },
  });
  if (!page) {
    throw new Error("Page not found or not owned by this user");
  }

  const moduleType = await prisma.moduleType.findUniqueOrThrow({
    where: { slug: moduleTypeSlug },
  });

  const sidebarInstances = page.moduleInstances.filter(
    (mi) => mi.placementMode === "GRID" && mi.columnStart === 0
  );
  const nextRowStart = sidebarInstances.reduce(
    (max, mi) => Math.max(max, (mi.rowStart ?? 0) + mi.rowSpan),
    0
  );

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

  await prisma.moduleInstance.create({
    data: {
      pageId,
      moduleTypeId: moduleType.id,
      placementMode: "GRID",
      columnStart: 0,
      rowStart: nextRowStart,
      columnSpan: moduleType.defaultColumnSpan,
      rowSpan: moduleType.defaultRowSpan,
      propValues: defaultConfig,
    },
  });
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
        propValues: { polotnoElement: el },
      })),
    }),
  ]);
}
