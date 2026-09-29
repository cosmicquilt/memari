// Puts the stack under every page's spine (the hours, or a month calendar) at
// the spine's gap - spineGapRows, a row with increments off - by the rule
// the hours' edge now places it with (placeUnderSpine: the bottom module
// gives way first, each to its own floor; flush only if the gap is all that
// will not fit).
//
// For books laid out before that rule: a spread whose two stacks started on
// different rows, one flush under the hours and one a row down - "bottom
// module section un even", 2026-09-29.
//
//   npx tsx scripts/normalize-spine-gaps.mts --journal <id>           shows what would change
//   npx tsx scripts/normalize-spine-gaps.mts --journal <id> --apply   changes it
//   ... --level WEEKLY                                                  one level only
//
// Reads DATABASE_URL from .env - the DEV database unless told otherwise.

import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const journalArg = process.argv.indexOf("--journal");
const journalId = journalArg === -1 ? undefined : process.argv[journalArg + 1];
const apply = process.argv.includes("--apply");
const levelArg = process.argv.indexOf("--level");
const level = levelArg === -1 ? undefined : process.argv[levelArg + 1];
if (!journalId) {
  console.error("Usage: npx tsx scripts/normalize-spine-gaps.mts --journal <id> [--apply]");
  process.exit(1);
}

const { prisma } = await import("../src/lib/prisma.js");
const { cellHeightPx, placeUnderSpine } = await import("../src/lib/grid.js");
const { spineGapRows } = await import("../src/lib/modules/hourlyGridCore.js");
const { isSpineSlug } = await import("../src/lib/moduleRegistry.js");
const { getMinRowSpanForSlug } = await import("../src/lib/moduleMinRowSpan.js");

const pages = await prisma.page.findMany({
  where: { plannerId: journalId, ...(level ? { level: level as "WEEKLY" } : {}) },
  orderBy: [{ level: "asc" }, { position: "asc" }],
  include: { moduleInstances: { include: { moduleType: true } } },
});
if (pages.length === 0) {
  console.error(`No journal ${journalId}.`);
  process.exit(1);
}

const writes: Array<{ id: string; rowStart: number; rowSpan: number }> = [];
for (const page of pages) {
  const grid = {
    widthPx: page.widthPx,
    heightPx: page.heightPx,
    gridColumns: page.gridColumns,
    gridRows: page.gridRows,
    boxInsetPx: page.gridGapPx / 2,
    marginPx: page.marginPx,
  };
  for (const spine of page.moduleInstances.filter((mi) => isSpineSlug(mi.moduleType.slug))) {
    if (spine.rowStart === null || spine.columnStart === null) continue;
    const end = spine.rowStart + spine.rowSpan;
    const sameColumns = (mi: (typeof page.moduleInstances)[number]) =>
      mi.columnStart === spine.columnStart && mi.columnSpan === spine.columnSpan && mi.rowStart !== null;
    const followers = page.moduleInstances
      .filter((mi) => mi.id !== spine.id && !mi.locked && sameColumns(mi) && (mi.rowStart as number) >= end)
      .sort((a, b) => (a.rowStart as number) - (b.rowStart as number));
    if (followers.length === 0) continue;
    const tail = Math.max(...followers.map((mi) => (mi.rowStart as number) + mi.rowSpan));
    const bound = Math.min(
      page.gridRows,
      ...page.moduleInstances
        .filter((mi) => mi.locked && mi.id !== spine.id && sameColumns(mi) && (mi.rowStart as number) >= tail)
        .map((mi) => mi.rowStart as number)
    );
    const members = followers.map((mi) => ({
      rowStart: mi.rowStart as number,
      rowSpan: mi.rowSpan,
      minRowSpan: getMinRowSpanForSlug(mi.moduleType.slug, grid, mi.columnSpan, (mi.propValues as Record<string, unknown>) ?? {}),
    }));
    const gap = spineGapRows(spine.moduleType.slug, cellHeightPx(grid), spine.propValues, spine.rowSpan);
    let placed = placeUnderSpine(members, end + gap, bound);
    if (placed.unmet > 0) placed = placeUnderSpine(members, Math.max(end, end + gap - placed.unmet), bound);
    const label = `${page.level}${page.variantKey ? `:${page.variantKey}` : ""} page ${page.position}`;
    const before = followers.map((mi) => `${mi.moduleType.slug}@${mi.rowStart}+${mi.rowSpan}`).join(", ");
    const after = followers.map((mi, i) => `${mi.moduleType.slug}@${placed.rows[i].rowStart}+${placed.rows[i].rowSpan}`).join(", ");
    const gapNow = (followers[0].rowStart as number) - end;
    if (before === after) {
      console.log(`  ${label}: gap ${gapNow}, as it should be`);
      continue;
    }
    console.log(`  ${label}: gap ${gapNow} -> ${placed.rows[0].rowStart - end}; ${before}  ->  ${after}`);
    followers.forEach((mi, i) => writes.push({ id: mi.id, ...placed.rows[i] }));
  }
}

if (writes.length === 0) console.log("Nothing to change.");
else if (!apply) console.log(`${writes.length} module(s) would move. Run again with --apply to change them.`);
else {
  await prisma.$transaction(writes.map((w) => prisma.moduleInstance.update({ where: { id: w.id }, data: { rowStart: w.rowStart, rowSpan: w.rowSpan } })));
  console.log(`Moved ${writes.length} module(s).`);
}
await prisma.$disconnect();
