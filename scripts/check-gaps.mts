// No column ends with a gap too small to put anything in.
//
// The rule, asked for directly: "there should only be a minimum two cell
// height gap below the last module in any scenario". A gap below a stack is
// either nothing at all or at least MIN_ROW_SPAN rows - because no module
// may be shorter than that, so anything in between is page nobody can ever
// use, and worse, the editor offers it as a drop target and the module that
// lands there overlaps.
//
// The resize paths enforce it themselves: resizeStackFromBottom has since
// its own "resize bottom side module and leave a small gap then add a new
// side module, the new overlaps" report, and resolvePairResize does now.
// This checks the RESULT rather than any one path, so a gap opened by
// something neither of them owns - a palette drop, a cross-zone move, the
// hours growing, a deletion - is still caught.
//
//   npm run check:gaps          # report
//   npm run check:gaps -- --fix # close them
//
// --fix grows the LOWEST module in the column by the size of the gap, which
// is what dragging that stack's own bottom edge would now do. It is opt-in
// because it edits a real planner: the rows are unusable either way, but
// which module gets them is a layout decision.
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("../src/generated/prisma/client.js");
const { MIN_ROW_SPAN } = await import("../src/lib/moduleRegistry.js");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const pages = await prisma.page.findMany({
  include: { moduleInstances: { include: { moduleType: true } }, planner: true },
  orderBy: [{ plannerId: "asc" }, { position: "asc" }],
});

const fix = process.argv.includes("--fix");
let problems = 0;
let fixed = 0;
let columns = 0;

for (const page of pages) {
  const placed = page.moduleInstances.filter(
    (mi): mi is typeof mi & { columnStart: number; rowStart: number } =>
      mi.columnStart !== null && mi.rowStart !== null
  );
  if (placed.length === 0) continue;

  // A column stack, exactly as the resize handles recognise one: unlocked
  // modules sharing a column start AND span. A locked spine is not part of
  // any stack, but it does bound one.
  const byColumn = new Map<string, typeof placed>();
  for (const mi of placed) {
    if (mi.locked) continue;
    const key = `${mi.columnStart}:${mi.columnSpan}`;
    byColumn.set(key, [...(byColumn.get(key) ?? []), mi]);
  }

  for (const [key, group] of byColumn) {
    columns++;
    const [columnStart, columnSpan] = key.split(":").map(Number);
    const stackEnd = group.reduce((low, mi) => Math.max(low, mi.rowStart + mi.rowSpan), 0);
    const overlaps = (o: { columnStart: number; columnSpan: number }) =>
      o.columnStart < columnStart + columnSpan && o.columnStart + o.columnSpan > columnStart;
    const inStack = new Set(group.map((mi) => mi.id));
    // Anything below that shares any part of this column range bounds it,
    // locked or not: a module cannot slide through another one.
    let bound = page.gridRows;
    for (const other of placed) {
      if (inStack.has(other.id)) continue;
      if (other.rowStart < stackEnd || !overlaps(other)) continue;
      bound = Math.min(bound, other.rowStart);
    }
    const gap = Math.max(0, bound - stackEnd);
    if (gap === 0 || gap >= MIN_ROW_SPAN) continue;

    const lowest = group.reduce((a, b) =>
      a.rowStart + a.rowSpan > b.rowStart + b.rowSpan ? a : b
    );
    // The LEVEL as well as the position. Positions are per level now - a
    // book has a weekly page 0 and a monthly page 0 - so "page 0" on its own
    // no longer names anything.
    const where =
      `"${page.planner.title}" ${page.level} page ${page.position}, ` +
      `column ${columnStart}+${columnSpan}`;

    if (fix) {
      await prisma.moduleInstance.update({
        where: { id: lowest.id },
        data: { rowSpan: lowest.rowSpan + gap },
      });
      fixed++;
      console.log(
        `  fixed  ${where}: ${lowest.moduleType.slug} ${lowest.rowSpan} -> ${lowest.rowSpan + gap} rows`
      );
      continue;
    }

    problems++;
    console.error(
      `  FAIL  ${where}: ${gap} row(s) free below row ${stackEnd} (bound ${bound}).\n` +
        `        Nothing fits: the shortest module allowed is ${MIN_ROW_SPAN} rows.\n` +
        `        Lowest module is ${lowest.moduleType.slug} at ${lowest.rowStart}+${lowest.rowSpan}.\n` +
        `        Close it with:  npm run check:gaps -- --fix`
    );
  }
}

await prisma.$disconnect();

if (fixed > 0) console.log(`\n${fixed} gap(s) closed.`);
if (problems > 0) {
  console.error(
    `\n${problems} column(s) of ${columns} end in a gap smaller than ${MIN_ROW_SPAN} rows.`
  );
  process.exit(1);
}
console.log(
  `No unusable gaps: all ${columns} column stack(s) end flush against their bound or leave ` +
    `at least ${MIN_ROW_SPAN} rows.`
);
