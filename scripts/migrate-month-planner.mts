// Repairs MONTH planners seeded before the dot-lattice migration, and
// removes the week modules that leaked onto them.
//
// Two faults, one script.
//
// The month planner was seeded on a 4-column, 30-row page and never
// restretched when the grid became 24 x 36. Its stored spans are still
// the old ones - month-grid-core at 3x17 and 4x17, sidebar boxes one
// column wide - which on the lattice renders as a sliver a few cells
// across. The SEEDING code is already correct (ensureMonthGridCore uses
// columnSpan 18 and 24, every defaultColumnSpan in prisma/seed.mts is a
// lattice value), but every step of it is guarded by "create only if
// missing", so an existing planner can never correct itself.
//
// Separately, getOrCreatePlanner used to look up findFirst({ ownerId,
// isTemplate: false }) with no baseType while CREATING with baseType
// WEEK. Once a month planner existed the lookup could return it, and the
// week editor then seeded a full week spine - hourly grid, week title,
// to-do - onto its pages. Reported as a month layout overlaying the week
// spread. The lookup is filtered now; this clears up what it left behind.
//
// PLACEMENT ONLY. propValues are never touched, so headings and anything
// attached to an instance survive, and any module this does not recognise
// is left exactly as it is - which is the point, since freeform content
// (stickers, icons marking bin days) is expected to live on these pages.
// Re-applying the canonical layout by ROLE rather than rescaling spans
// arithmetically also makes it idempotent: running it twice is a no-op,
// and running it on an already-correct planner changes nothing.
//
//   npx tsx scripts/migrate-month-planner.mts            # report only
//   npx tsx scripts/migrate-month-planner.mts --apply    # write
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("../src/generated/prisma/client.js");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const apply = process.argv.includes("--apply");

/** Slugs that belong to a week spread and cannot mean anything on a month
 *  page. Anything else is left alone, recognised or not. */
const WEEK_ONLY = new Set(["hourly-grid-core", "week-title", "todo-checklist", "habit-tracker"]);

/** The month layout, as the seeding code lays it out. Left page keeps a
 *  sidebar; the right page's grid spans the full width and has none. */
const GRID = [
  { columnStart: 6, columnSpan: 18 },
  { columnStart: 0, columnSpan: 24 },
];
// Must match ensureMonthGridCore's own span, and for the same reason: with
// the header at one cell less the insets, 1 + weekCount * n gives every
// week row a whole number of cells. Notes then starts one clear cell below
// and runs to the foot of the page.
const GRID_ROW_SPAN = 16;
const PAGE_ROWS = 36;
const SIDEBAR_BOXES = [
  { heading: "Monthly Mantra", rowStart: 2, rowSpan: 4 },
  { heading: "Priorities", rowStart: 6, rowSpan: 6 },
  { heading: "Reminders", rowStart: 12, rowSpan: 7 },
  { heading: "Tentative Dates", rowStart: 19, rowSpan: 11 },
];

const planners = await prisma.planner.findMany({
  where: { baseType: "MONTH" },
  include: {
    pages: {
      orderBy: { position: "asc" },
      include: { moduleInstances: { include: { moduleType: true } } },
    },
  },
});

const deletes: string[] = [];
const moves: Array<{ id: string; label: string; from: string; to: string; data: Record<string, number> }> = [];

for (const planner of planners) {
  for (const [pageIndex, page] of planner.pages.entries()) {
    const grid = GRID[pageIndex];
    if (!grid) continue;

    for (const instance of page.moduleInstances) {
      const slug = instance.moduleType.slug;
      const heading = (instance.propValues as { heading?: string } | null)?.heading;
      const at = `${instance.columnStart},${instance.rowStart} ${instance.columnSpan}x${instance.rowSpan}`;
      const label = `p${pageIndex} ${slug}${heading ? ` "${heading}"` : ""}`;

      if (WEEK_ONLY.has(slug)) {
        deletes.push(`${label} (${at})`);
        continue;
      }

      // Where this module belongs, by what it IS rather than where it
      // currently sits - a stale position cannot be used to work out the
      // position it should have had.
      let target: Record<string, number> | null = null;
      if (slug === "month-grid-core") {
        target = {
          columnStart: grid.columnStart,
          rowStart: 0,
          columnSpan: grid.columnSpan,
          rowSpan: GRID_ROW_SPAN,
        };
      } else if (slug === "month-title") {
        target = { columnStart: 0, rowStart: 0, columnSpan: 6, rowSpan: 2 };
      } else if (slug === "labeled-box" && heading === "Notes") {
        target = {
          columnStart: grid.columnStart,
          rowStart: GRID_ROW_SPAN + 1,
          columnSpan: grid.columnSpan,
          rowSpan: PAGE_ROWS - (GRID_ROW_SPAN + 1),
        };
      } else if (slug === "labeled-box") {
        const box = SIDEBAR_BOXES.find((b) => b.heading === heading);
        if (box) target = { columnStart: 0, rowStart: box.rowStart, columnSpan: 6, rowSpan: box.rowSpan };
      }
      if (!target) continue;

      const same =
        instance.columnStart === target.columnStart &&
        instance.rowStart === target.rowStart &&
        instance.columnSpan === target.columnSpan &&
        instance.rowSpan === target.rowSpan;
      if (same) continue;

      moves.push({
        id: instance.id,
        label,
        from: at,
        to: `${target.columnStart},${target.rowStart} ${target.columnSpan}x${target.rowSpan}`,
        data: target,
      });
    }
  }
}

console.log(`${planners.length} month planner(s).\n`);
console.log(`Week modules to remove (${deletes.length}):`);
for (const d of deletes) console.log(`  - ${d}`);
console.log(`\nModules to re-place (${moves.length}):`);
for (const m of moves) console.log(`  ~ ${m.label.padEnd(38)} ${m.from.padEnd(16)} -> ${m.to}`);

if (!apply) {
  console.log("\nReport only. Re-run with --apply to write.");
} else {
  // One transaction: a half-applied repair would leave the page in a
  // state neither the old layout nor the new one.
  await prisma.$transaction([
    ...planners.flatMap((planner) =>
      planner.pages.flatMap((page) =>
        page.moduleInstances
          .filter((mi) => WEEK_ONLY.has(mi.moduleType.slug))
          .map((mi) => prisma.moduleInstance.delete({ where: { id: mi.id } }))
      )
    ),
    ...moves.map((m) => prisma.moduleInstance.update({ where: { id: m.id }, data: m.data })),
  ]);
  console.log("\nApplied.");
}

await prisma.$disconnect();
