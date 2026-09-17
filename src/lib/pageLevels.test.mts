// The levels of a book, and how many times each one prints.
//
// printedCount is arithmetic that decides what a book COSTS - a per-day page
// prints about 90 times in a quarter where a per-month page prints 3 - so it
// gets the same treatment as the rest of the geometry here: real numbers,
// checked against dates worked out by hand, and every check sabotaged to
// prove it bites.
//
// The cases that matter are the boundaries, not the middles: a term that
// starts and ends on the same day, a term that crosses a month boundary with
// only a few days in it, a term that crosses a year.
import {
  LEVELS_IN_BINDING_ORDER,
  LEVEL_LABELS,
  byLevel,
  printedCount,
  repeats,
} from "./pageLevels.js";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    failures++;
  }
}
function eq(actual: unknown, expected: unknown, message: string) {
  check(
    actual === expected,
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

// --- binding order ----------------------------------------------------
//
// Pinned rather than derived, and this is the one place a second list is
// worth having: the order comes from the Prisma enum's declaration order,
// which is also what Postgres sorts by, so reordering it silently reorders
// the printed book. A test that only asked "are all five present" would not
// notice.
eq(
  LEVELS_IN_BINDING_ORDER.join(" "),
  "FRONT_MATTER MONTHLY WEEKLY DAILY BACK_MATTER",
  "levels are in binding order"
);
check(
  LEVELS_IN_BINDING_ORDER.every((l) => typeof LEVEL_LABELS[l] === "string" && LEVEL_LABELS[l]),
  "every level has a display label"
);

// --- what repeats -----------------------------------------------------
eq(repeats("FRONT_MATTER"), false, "front matter does not repeat");
eq(repeats("BACK_MATTER"), false, "back matter does not repeat");
eq(repeats("MONTHLY"), true, "monthly repeats");
eq(repeats("WEEKLY"), true, "weekly repeats");
eq(repeats("DAILY"), true, "daily repeats");

// --- printed counts ---------------------------------------------------

// Matter prints once whether or not the book has a term. It is not a
// function of the calendar, so a missing term must not make it unknown.
eq(printedCount("FRONT_MATTER", null, null), 1, "front matter prints once with no term");
eq(printedCount("BACK_MATTER", utc(2026, 1, 1), utc(2026, 3, 31)), 1, "back matter prints once");

// A repeating level with no term is UNKNOWN, not zero. Zero reads as free.
eq(printedCount("DAILY", null, null), null, "daily with no term is unknown");
eq(printedCount("WEEKLY", utc(2026, 1, 1), null), null, "half a term is still unknown");

// One day is one day - inclusive of both ends, which is the thing an
// exclusive subtraction gets wrong and nobody notices until the last page
// of the book is missing.
eq(printedCount("DAILY", utc(2026, 1, 1), utc(2026, 1, 1)), 1, "a one-day term is one daily");
eq(printedCount("WEEKLY", utc(2026, 1, 1), utc(2026, 1, 1)), 1, "a one-day term is one weekly");
eq(printedCount("MONTHLY", utc(2026, 1, 1), utc(2026, 1, 1)), 1, "a one-day term is one monthly");

// A real quarter, counted by hand: Jan 31 + Feb 28 + Mar 31 = 90 days in
// 2026, which is not a leap year.
eq(printedCount("DAILY", utc(2026, 1, 1), utc(2026, 3, 31)), 90, "Jan-Mar 2026 is 90 days");
eq(printedCount("WEEKLY", utc(2026, 1, 1), utc(2026, 3, 31)), 13, "90 days is 13 weeks");
eq(printedCount("MONTHLY", utc(2026, 1, 1), utc(2026, 3, 31)), 3, "Jan-Mar is 3 months");

// THE CASE days/30 GETS WRONG. Six days, spanning two calendar months, and
// a monthly page is needed for each - you cannot print half of February.
eq(printedCount("DAILY", utc(2026, 1, 28), utc(2026, 2, 2)), 6, "Jan 28 to Feb 2 is 6 days");
eq(printedCount("MONTHLY", utc(2026, 1, 28), utc(2026, 2, 2)), 2, "Jan 28 to Feb 2 touches 2 months");
eq(printedCount("WEEKLY", utc(2026, 1, 28), utc(2026, 2, 2)), 1, "6 days is one week");

// Across a year boundary, where a naive month subtraction goes negative.
eq(
  printedCount("MONTHLY", utc(2026, 12, 15), utc(2027, 1, 15)),
  2,
  "Dec to Jan across a year is 2 months"
);
eq(
  printedCount("DAILY", utc(2026, 12, 15), utc(2027, 1, 15)),
  32,
  "Dec 15 to Jan 15 is 32 days"
);

// A leap day has to be counted, not assumed away.
eq(printedCount("DAILY", utc(2028, 2, 1), utc(2028, 2, 29)), 29, "Feb 2028 has 29 days");

// Backwards is zero, not negative. A negative page count would propagate
// into a price.
eq(printedCount("DAILY", utc(2026, 3, 31), utc(2026, 1, 1)), 0, "an inverted term prints nothing");

// A week that does not divide evenly rounds UP: 8 days needs 2 weekly pages,
// because the 8th day is in a second week and has to have somewhere to be.
eq(printedCount("WEEKLY", utc(2026, 1, 1), utc(2026, 1, 8)), 2, "8 days needs 2 weeklies");
eq(printedCount("WEEKLY", utc(2026, 1, 1), utc(2026, 1, 7)), 1, "7 days needs 1 weekly");

// --- grouping ---------------------------------------------------------

const pages = [
  { level: "WEEKLY" as const, position: 1, id: "w1" },
  { level: "FRONT_MATTER" as const, position: 0, id: "f0" },
  { level: "WEEKLY" as const, position: 0, id: "w0" },
];
const grouped = byLevel(pages);

// EVERY level, including the empty ones. A level with no pages is a real
// state and the timeline still has to offer it as somewhere to add one, so a
// grouping that dropped it would make it invisible and unreachable.
eq(grouped.length, LEVELS_IN_BINDING_ORDER.length, "every level is present, empty or not");
eq(
  grouped.map((g) => g.level).join(" "),
  LEVELS_IN_BINDING_ORDER.join(" "),
  "groups come back in binding order"
);
eq(grouped.find((g) => g.level === "DAILY")?.pages.length, 0, "an unused level is empty");
eq(
  grouped.find((g) => g.level === "WEEKLY")?.pages.map((p) => p.id).join(","),
  "w0,w1",
  "pages within a level are in position order"
);
eq(
  grouped.reduce((n, g) => n + g.pages.length, 0),
  pages.length,
  "no page is lost or duplicated by grouping"
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(
    `All page level checks passed (${LEVELS_IN_BINDING_ORDER.length} levels in binding order; ` +
      `printed counts exact at one-day, month-boundary, year-boundary and leap-day terms).`
  );
}
