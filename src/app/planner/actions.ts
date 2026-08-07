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

// Starting grid for new pages. 6x10 is a placement grid for arranging
// whole modules (weekly-grid, habit-tracker, etc.) against each other,
// not a fine bullet-journal-dot density — a module's own internal content
// (e.g. 7 day-columns) is drawn within whatever cells it occupies, it
// doesn't need to line up 1:1 with this grid. Adjust freely; ModuleType's
// defaultColumnSpan/RowSpan values in prisma/seed.mts assume this size.
const DEFAULT_GRID = { gridColumns: 6, gridRows: 10, gridGapPx: 8 };

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
        pages: {
          create: [{ position: 0, ...DEFAULT_GRID }],
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

  return planner;
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

  await prisma.$transaction([
    prisma.moduleInstance.deleteMany({ where: { pageId } }),
    prisma.moduleInstance.createMany({
      data: elements.map((el, index) => ({
        pageId,
        moduleTypeId: freeform.id,
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
