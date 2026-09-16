// The layouts must describe EXACTLY the arrangement the bootstrap used to
// build by hand, and must stay idempotent.
//
// The baseline below was read off a real seeded planner before the
// bootstrap was changed - `prisma.planner.findFirst` on each baseType,
// every instance with its slug, columns and rows. That is the definition
// of "no change": a fresh planner has to come out identical to one seeded
// by the old code, or existing planners and the ones made tomorrow stop
// matching each other.
//
// Idempotency matters as much as the arrangement. getOrCreatePlanner runs
// on EVERY load, not just the first, so a layout that re-proposes
// something already on the page adds a duplicate every time someone opens
// the editor. That is not hypothetical either: the month's Notes box was
// guarded by a row number the create had since moved off, and added a
// second box on every run.
import { weekLayout, monthLayout, missingPlacements, type ExistingInstance } from "./pageLayouts";
import { moduleDefinition } from "./moduleRegistry";

const GRID_ROWS = 36;

/** slug, page, columnStart, rowStart, columnSpan, rowSpan, locked */
type Row = [string, number, number, number, number, number, boolean];

const WEEK_BASELINE: Row[] = [
  ["week-title", 0, 0, 0, 6, 3, true],
  ["hourly-grid-core", 0, 6, 0, 18, 20, true],
  ["labeled-box", 0, 0, 3, 6, 7, false],
  ["labeled-box", 0, 0, 10, 6, 11, false],
  ["labeled-box", 0, 0, 21, 6, 15, false],
  ["todo-checklist", 0, 6, 21, 18, 15, false],
  ["hourly-grid-core", 1, 0, 0, 24, 20, true],
  ["todo-checklist", 1, 0, 21, 24, 15, false],
];

const MONTH_BASELINE: Row[] = [
  // 3, not the 2 the live planner carries: that row was seeded before
  // month-title's own default span changed, and the bootstrap has always
  // taken the span from the module type. The layout is right and the
  // planner in the database is a row out of date - which is exactly what
  // "reset to template" is for.
  ["month-title", 0, 0, 0, 6, 3, true],
  ["month-grid-core", 0, 6, 0, 18, 16, true],
  ["labeled-box", 0, 0, 2, 6, 4, false],
  ["labeled-box", 0, 0, 6, 6, 6, false],
  ["labeled-box", 0, 0, 12, 6, 7, false],
  ["labeled-box", 0, 6, 17, 18, 19, false],
  ["labeled-box", 0, 0, 19, 6, 17, false],
  ["month-grid-core", 1, 0, 0, 24, 16, true],
  ["labeled-box", 1, 0, 17, 24, 19, false],
];

let failures = 0;
const fail = (message: string) => {
  console.error(`  ${message}`);
  failures++;
};

/** A placement with its nulls resolved the way the bootstrap resolves
 *  them: from the module type's own defaults. */
function resolved(layout: ReturnType<typeof weekLayout>): Row[] {
  return missingPlacements(layout, [[], []])
    .map((p): Row => {
      const db = moduleDefinition(p.slug)?.db;
      if (!db) {
        fail(`${layout.key}: placement names an unregistered module "${p.slug}"`);
        return [p.slug, p.page, p.columnStart, p.rowStart, 0, 0, p.locked];
      }
      return [
        p.slug,
        p.page,
        p.columnStart,
        p.rowStart,
        p.columnSpan ?? db.defaultColumnSpan,
        p.rowSpan ?? db.defaultRowSpan,
        p.locked,
      ];
    })
    .sort(
      (a, b) => a[1] - b[1] || a[3] - b[3] || a[2] - b[2] || a[0].localeCompare(b[0])
    );
}

function compare(name: string, got: Row[], want: Row[]) {
  const sortedWant = [...want].sort(
    (a, b) => a[1] - b[1] || a[3] - b[3] || a[2] - b[2] || a[0].localeCompare(b[0])
  );
  if (got.length !== sortedWant.length) {
    fail(`${name}: ${got.length} placements, expected ${sortedWant.length}`);
  }
  const rows = Math.max(got.length, sortedWant.length);
  for (let i = 0; i < rows; i++) {
    const a = got[i];
    const b = sortedWant[i];
    if (!a || !b || JSON.stringify(a) !== JSON.stringify(b)) {
      fail(`${name}: row ${i} is ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
    }
  }
}

compare("week", resolved(weekLayout(GRID_ROWS)), WEEK_BASELINE);
compare("month", resolved(monthLayout(GRID_ROWS)), MONTH_BASELINE);

// --- idempotency ------------------------------------------------------
//
// Feed each layout's own output back as what is already on the page. A
// correct layout then asks for nothing.
for (const layout of [weekLayout(GRID_ROWS), monthLayout(GRID_ROWS)]) {
  const all = missingPlacements(layout, [[], []]);
  const pages: [ExistingInstance[], ExistingInstance[]] = [[], []];
  for (const p of all) {
    pages[p.page].push({
      slug: p.slug,
      columnStart: p.columnStart,
      heading: (p.propValues as { heading?: string }).heading,
    });
  }
  const again = missingPlacements(layout, pages);
  if (again.length > 0) {
    fail(
      `${layout.key}: re-proposes ${again.length} placement(s) that are already there ` +
        `(${again.map((p) => `${p.slug}@${p.page}:${p.rowStart}`).join(", ")}) - ` +
        `this would add a duplicate on every editor load`
    );
  }
}

// --- the sidebar is all-or-nothing ------------------------------------
//
// One box the user put in column 0 means the template adds none of its
// own beside it, rather than three on top of whatever is there.
for (const layout of [weekLayout(GRID_ROWS), monthLayout(GRID_ROWS)]) {
  const userBox: ExistingInstance[] = [{ slug: "labeled-box", columnStart: 0, heading: "Mine" }];
  const got = missingPlacements(layout, [userBox, []]);
  // Page 0 only. The right page's Notes box also sits at column 0 and is
  // not a sidebar box - counting it made this assertion fail on a layout
  // that was behaving correctly.
  const sidebar = got.filter(
    (p) => p.slug === "labeled-box" && p.page === 0 && p.columnStart === 0
  );
  if (sidebar.length > 0) {
    fail(`${layout.key}: added ${sidebar.length} sidebar box(es) on top of the user's own`);
  }
}

// --- the trims -------------------------------------------------------
//
// 36 rows on 7x10, 34 on Letter. The difference has to land on the boxes
// that run to the foot of the page, and nothing may hang off the bottom.
for (const rows of [36, 34]) {
  for (const layout of [weekLayout(rows), monthLayout(rows)]) {
    for (const p of missingPlacements(layout, [[], []])) {
      const span = p.rowSpan ?? moduleDefinition(p.slug)?.db.defaultRowSpan ?? 0;
      if (p.rowStart + span > rows) {
        fail(
          `${layout.key} at ${rows} rows: ${p.slug} runs to row ${p.rowStart + span}, past the page`
        );
      }
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} layout problem(s).`);
  process.exit(1);
}
console.log(
  "All page layout checks passed (both layouts match the seeded baseline, " +
    "are idempotent, leave a user's sidebar alone, and fit both trims)."
);
