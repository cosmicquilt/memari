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
import {
  weekLayout,
  monthLayout,
  dayLayout,
  frontMatterLayout,
  backMatterLayout,
  missingPlacements,
  titleCorrections,
  type ExistingInstance,
  type StoredInstance,
} from "./pageLayouts";
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
  // 2 rows, stated by the layout (MONTH_TITLE_ROW_SPAN). This baseline once
  // said 3 and called the older 2-row planners out of date - but at 3 the
  // title lay over row 2, where Monthly Mantra starts, and every book seeded
  // that way refused to reorder its sidebar. The overlap check below is what
  // would have caught it; nothing compared placements with each other.
  ["month-title", 0, 0, 0, 6, 2, true],
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

// --- nothing overlaps ------------------------------------------------
//
// Every layout, both trims, spans resolved the way the bootstrap resolves
// them. Two placements on one page must not share a cell. This is the check
// that did not exist when the month title's default grew to 3 rows under a
// sidebar laid out for 2: the arrangement above matched its baseline, and
// the baseline had the overlap in it.
for (const rows of [36, 34]) {
  for (const layout of [
    weekLayout(rows),
    monthLayout(rows),
    dayLayout(rows),
    frontMatterLayout(rows),
    backMatterLayout(rows),
  ]) {
    const placed = missingPlacements(layout, [[], []]).map((p) => {
      const db = moduleDefinition(p.slug)?.db;
      return {
        label: `${p.slug} p${p.page} c${p.columnStart} r${p.rowStart}`,
        page: p.page,
        c: p.columnStart,
        r: p.rowStart,
        w: p.columnSpan ?? db?.defaultColumnSpan ?? 0,
        h: p.rowSpan ?? db?.defaultRowSpan ?? 0,
      };
    });
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        if (a.page !== b.page) continue;
        const overlap = a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.h && b.r < a.r + a.h;
        if (overlap) fail(`${layout.key} at ${rows} rows: ${a.label} (${a.w}x${a.h}) overlaps ${b.label} (${b.w}x${b.h})`);
      }
    }
  }
}

// --- stored titles are put back to the layout -------------------------
//
// A title is locked, so its geometry is the layout's. A book seeded with the
// 3-row month title has to come back to 2 - on the default layout and on
// every occurrence copied from it - and nothing else may be touched.
{
  const stored = (id: string, slug: string, rowSpan: number, locked = true, rowStart = 0): StoredInstance => ({
    id,
    slug,
    locked,
    columnStart: 0,
    rowStart,
    columnSpan: 6,
    rowSpan,
  });
  const fixes = titleCorrections(monthLayout(GRID_ROWS), [
    [stored("title", "month-title", 3), stored("mantra", "labeled-box", 4, false, 2)],
    [],
    [stored("feb-title", "month-title", 3)],
  ]);
  const got = fixes.map((f) => `${f.id}:${JSON.stringify(f.data)}`).join(" ");
  if (got !== 'title:{"rowSpan":2} feb-title:{"rowSpan":2}') {
    fail(`month: title corrections were ${got || "none"}, expected both titles back to 2 rows and nothing else`);
  }
  const none = titleCorrections(monthLayout(GRID_ROWS), [[stored("title", "month-title", 2)]]);
  if (none.length > 0) fail(`month: a title already at the layout's size was "corrected" (${JSON.stringify(none)})`);
  const week = titleCorrections(weekLayout(GRID_ROWS), [[stored("wt", "week-title", 3)]]);
  if (week.length > 0) fail(`week: a 3-row week title was "corrected" (${JSON.stringify(week)})`);
}

if (failures > 0) {
  console.error(`\n${failures} layout problem(s).`);
  process.exit(1);
}
console.log(
  "All page layout checks passed (both layouts match the seeded baseline, " +
    "are idempotent, leave a user's sidebar alone, fit both trims, overlap nowhere, " +
    "and a stored title is put back to the layout's size)."
);
