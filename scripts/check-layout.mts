// Applies a layout to a real, throwaway planner and checks what lands in
// the database.
//
// pageLayouts.test.mts checks the layout as DATA - the right placements,
// idempotent, fits both trims - with no database at all. That is most of
// it, but it cannot catch the half that only exists once rows are written:
// module types resolved by slug, null spans filled in from each type's own
// defaults, propValues surviving the round trip as JSON.
//
// So this creates a planner nobody owns, applies the layout to it exactly
// as getOrCreatePlanner does, reads the rows back, compares them against
// the arrangement a seeded planner is known to have, and deletes it again.
// It leaves nothing behind, including when it fails.
//
//   npx tsx scripts/check-layout.mts        # both layouts
//   npx tsx scripts/check-layout.mts WEEK   # just one
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("../src/generated/prisma/client.js");
const { weekLayout, monthLayout, missingPlacements } = await import("../src/lib/pageLayouts.js");
type ExistingInstance = import("../src/lib/pageLayouts.js").ExistingInstance;
type PageLayout = import("../src/lib/pageLayouts.js").PageLayout;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** An owner id no human has, so a stray row is obvious and harmless. */
const THROWAWAY_OWNER = "layout-check-throwaway";

type Row = [string, number, number, number, number, number, boolean];

/** The same arrangement pageLayouts.test.mts pins, checked here through
 *  the database rather than in memory. */
const BASELINE: Record<string, Row[]> = {
  WEEK: [
    ["week-title", 0, 0, 0, 6, 3, true],
    ["hourly-grid-core", 0, 6, 0, 18, 20, true],
    ["labeled-box", 0, 0, 3, 6, 7, false],
    ["labeled-box", 0, 0, 10, 6, 11, false],
    ["labeled-box", 0, 0, 21, 6, 15, false],
    ["todo-checklist", 0, 6, 21, 18, 15, false],
    ["hourly-grid-core", 1, 0, 0, 24, 20, true],
    ["todo-checklist", 1, 0, 21, 24, 15, false],
  ],
  MONTH: [
    ["month-title", 0, 0, 0, 6, 3, true],
    ["month-grid-core", 0, 6, 0, 18, 16, true],
    ["labeled-box", 0, 0, 2, 6, 4, false],
    ["labeled-box", 0, 0, 6, 6, 6, false],
    ["labeled-box", 0, 0, 12, 6, 7, false],
    ["labeled-box", 0, 6, 17, 18, 19, false],
    ["labeled-box", 0, 0, 19, 6, 17, false],
    ["month-grid-core", 1, 0, 0, 24, 16, true],
    ["labeled-box", 1, 0, 17, 24, 19, false],
  ],
};

const sortRows = (rows: Row[]) =>
  [...rows].sort((a, b) => a[1] - b[1] || a[3] - b[3] || a[2] - b[2] || a[0].localeCompare(b[0]));

let problems = 0;
const bad = (message: string) => {
  console.error(`  FAIL  ${message}`);
  problems++;
};

/** Exactly what actions.ts's applyLayout does, against a given planner. */
async function applyLayout(layout: PageLayout, pageIds: string[]) {
  const pages = await prisma.page.findMany({
    where: { id: { in: pageIds } },
    orderBy: { position: "asc" },
    include: { moduleInstances: { include: { moduleType: true } } },
  });
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
  if (missing.length === 0) return 0;
  const types = await prisma.moduleType.findMany({
    where: { slug: { in: [...new Set(missing.map((m) => m.slug))] } },
  });
  const bySlug = new Map(types.map((t) => [t.slug, t]));
  await prisma.moduleInstance.createMany({
    data: missing.map((placement) => {
      const type = bySlug.get(placement.slug);
      if (!type) throw new Error(`${layout.key} places unregistered "${placement.slug}"`);
      return {
        pageId: pages[placement.page].id,
        moduleTypeId: type.id,
        placementMode: "GRID" as const,
        locked: placement.locked,
        columnStart: placement.columnStart,
        rowStart: placement.rowStart,
        columnSpan: placement.columnSpan ?? type.defaultColumnSpan,
        rowSpan: placement.rowSpan ?? type.defaultRowSpan,
        propValues: placement.propValues as object,
      };
    }),
  });
  return missing.length;
}

const only = process.argv[2]?.toUpperCase();

for (const baseType of ["WEEK", "MONTH"] as const) {
  if (only && only !== baseType) continue;
  const layout = baseType === "WEEK" ? weekLayout(36) : monthLayout(36);
  const planner = await prisma.planner.create({
    data: {
      ownerId: THROWAWAY_OWNER,
      title: `layout check ${baseType}`,
      baseType,
      // The level this cadence's pages belong to. A throwaway planner, but
      // it still has to be a real one - a layout checked at the wrong level
      // is not the layout anybody ships.
      pages: {
        create: [
          { position: 0, level: baseType === "WEEK" ? "WEEKLY" : "MONTHLY" },
          { position: 1, level: baseType === "WEEK" ? "WEEKLY" : "MONTHLY" },
        ],
      },
    },
    include: { pages: { orderBy: { position: "asc" } } },
  });
  const pageIds = planner.pages.map((p) => p.id);

  try {
    const created = await applyLayout(layout, pageIds);

    // Applying twice must add nothing. getOrCreatePlanner runs on every
    // load, so anything re-proposed here is a module that would be
    // duplicated each time the editor opened.
    const again = await applyLayout(layout, pageIds);
    if (again !== 0) bad(`${baseType}: a second run added ${again} more module(s)`);

    const pages = await prisma.page.findMany({
      where: { id: { in: pageIds } },
      orderBy: { position: "asc" },
      include: { moduleInstances: { include: { moduleType: true } } },
    });
    const got: Row[] = [];
    pages.forEach((page, index) => {
      for (const mi of page.moduleInstances) {
        got.push([
          mi.moduleType.slug,
          index,
          mi.columnStart ?? -1,
          mi.rowStart ?? -1,
          mi.columnSpan,
          mi.rowSpan,
          mi.locked,
        ]);
      }
    });

    const want = sortRows(BASELINE[baseType]);
    const have = sortRows(got);
    console.log(`\n${baseType}: created ${created}, read back ${have.length}`);
    for (let i = 0; i < Math.max(want.length, have.length); i++) {
      const a = have[i];
      const b = want[i];
      if (!a || !b || JSON.stringify(a) !== JSON.stringify(b)) {
        bad(`${baseType} row ${i}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
      } else {
        console.log(
          `  ok    ${a[0].padEnd(18)} page ${a[1]}  col ${String(a[2]).padStart(2)}+${String(a[4]).padStart(2)}` +
            `  row ${String(a[3]).padStart(2)}+${String(a[5]).padStart(2)}${a[6] ? "  locked" : ""}`
        );
      }
    }

    // propValues have to survive the round trip, not just the geometry.
    const spine = pages[0].moduleInstances.find((mi) =>
      mi.moduleType.slug.endsWith("-grid-core")
    );
    const props = (spine?.propValues ?? {}) as { dayCount?: number; dayLabels?: unknown[] };
    if (props.dayCount !== 3 || (props.dayLabels ?? []).length !== 3) {
      bad(`${baseType}: left spine came back with dayCount ${props.dayCount} and ` +
        `${(props.dayLabels ?? []).length} labels, expected 3 and 3`);
    }
  } finally {
    // Cascade removes the pages and their instances with it.
    await prisma.planner.delete({ where: { id: planner.id } });
  }
}

// Nothing of ours should be left, even from an earlier failed run.
const strays = await prisma.planner.count({ where: { ownerId: THROWAWAY_OWNER } });
if (strays > 0) bad(`${strays} throwaway planner(s) left behind`);

await prisma.$disconnect();
if (problems > 0) {
  console.error(`\n${problems} problem(s).`);
  process.exit(1);
}
console.log("\nLayouts apply cleanly, match the baseline, and adding twice adds nothing.");
