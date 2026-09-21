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
  WEEKDAY_NAMES,
  byLevel,
  dayNamed,
  inSpreads,
  occurrences,
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
// FOURTEEN, not thirteen: weeks are snapped back to the week-start day, so
// Jan 1 2026 (a Thursday) sits in the week beginning Sun Dec 28, and the term
// touches 14 of them. See the block below for why snapping is right.
eq(printedCount("WEEKLY", utc(2026, 1, 1), utc(2026, 3, 31)), 14, "Jan-Mar touches 14 weeks");
eq(printedCount("MONTHLY", utc(2026, 1, 1), utc(2026, 3, 31)), 3, "Jan-Mar is 3 months");

// THE CASE days/30 GETS WRONG. Six days, spanning two calendar months, and
// a monthly page is needed for each - you cannot print half of February.
eq(printedCount("DAILY", utc(2026, 1, 28), utc(2026, 2, 2)), 6, "Jan 28 to Feb 2 is 6 days");
eq(printedCount("MONTHLY", utc(2026, 1, 28), utc(2026, 2, 2)), 2, "Jan 28 to Feb 2 touches 2 months");
eq(printedCount("WEEKLY", utc(2026, 1, 28), utc(2026, 2, 2)), 2, "Jan 28 to Feb 2 touches 2 weeks");

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

// Whole CALENDAR weeks touched, not days divided by seven. Jan 1 2026 is a
// Thursday, so even one day of it pulls in the week that began the previous
// Sunday - which is exactly what a printed planner does.
eq(printedCount("WEEKLY", utc(2026, 1, 1), utc(2026, 1, 8)), 2, "Jan 1-8 touches 2 weeks");
eq(printedCount("WEEKLY", utc(2026, 1, 4), utc(2026, 1, 10)), 1, "a Sun-to-Sat term is one week");
// Starting the week on MONDAY instead moves the boundary, and the count with
// it: Sun Jan 4 now belongs to the week that began Mon Dec 29.
eq(
  printedCount("WEEKLY", utc(2026, 1, 4), utc(2026, 1, 10), 1),
  2,
  "with a Monday start, Sun Jan 4 falls in the previous week"
);

// --- occurrences, which is what a per-month layout attaches to ---------
//
// The KEYS matter as much as the count: a key is stored in Page.variantKey,
// so one that changed shape would orphan every layout somebody had made.

const janToMar = occurrences("MONTHLY", utc(2026, 1, 1), utc(2026, 3, 31));
eq(janToMar?.map((o) => o.key).join(","), "2026-01,2026-02,2026-03", "month keys are YYYY-MM");
eq(janToMar?.[1].label, "February 2026", "a month labels itself by name and year");

// Across a year boundary, where a naive month subtraction goes negative and
// a naive key would wrap to month 13.
const decToJan = occurrences("MONTHLY", utc(2026, 12, 15), utc(2027, 1, 15));
eq(decToJan?.map((o) => o.key).join(","), "2026-12,2027-01", "month keys roll into the next year");

// WEEKS SNAP BACK to the week-start day. A term beginning on Wed Jan 7 has
// its first week begin Sun Jan 4.
const wed = occurrences("WEEKLY", utc(2026, 1, 7), utc(2026, 1, 20));
eq(wed?.map((o) => o.key).join(","), "W2026-01-04,W2026-01-11,W2026-01-18", "weeks snap to Sunday");
eq(
  occurrences("WEEKLY", utc(2026, 1, 7), utc(2026, 1, 20), 1)?.[0].key,
  "W2026-01-05",
  "a Monday-start week snaps to the Monday"
);

// WHY SNAPPING IS NOT OPTIONAL, and the check that would have caught the
// first version. A weekly spread lays its day columns out in weekday order,
// so the dates a module derives for SUNDAY..SATURDAY have to come out as
// seven consecutive days ASCENDING. Counting weeks forward from an arbitrary
// term start broke exactly this: a week beginning on a Thursday put the
// dates on the page as 4, 5, 6, 7, 1, 2, 3 - across a spread somebody reads
// left to right. Found by generating a real book and looking at it.
for (const startDay of [0, 1]) {
  const first = occurrences("WEEKLY", utc(2026, 1, 1), utc(2026, 3, 31), startDay)![0];
  const order = [...WEEKDAY_NAMES.slice(startDay), ...WEEKDAY_NAMES.slice(0, startDay)];
  const dates = order.map((name) => dayNamed(first.start, name)!);
  check(
    dates.every((d, i) => i === 0 || d.getTime() - dates[i - 1].getTime() === 86_400_000),
    `week columns run in consecutive days with weekStartDay ${startDay} ` +
      `(got ${dates.map((d) => d.getUTCDate()).join(",")})`
  );
}

// A weekday this does not recognise gives null rather than a wrong date - a
// module free-texting its own column heads must not silently date them.
eq(dayNamed(utc(2026, 1, 4), "SOMEDAY"), null, "an unknown weekday has no date");

const threeDays = occurrences("DAILY", utc(2026, 2, 27), utc(2026, 3, 1));
eq(threeDays?.map((o) => o.key).join(","), "2026-02-27,2026-02-28,2026-03-01", "days cross a month end");

// Matter has exactly one occurrence and it is the DEFAULT one - a null key,
// because there is nothing to distinguish it from.
eq(occurrences("FRONT_MATTER", null, null)?.length, 1, "front matter occurs once with no term");
eq(occurrences("FRONT_MATTER", null, null)?.[0].key, null, "matter has no variant key");

// Unknown, not empty. Offering zero months to customise would be a lie about
// a book whose term simply has not been set.
eq(occurrences("WEEKLY", null, null), null, "a repeating level with no term is unknown");

// THE POINT OF DERIVING ONE FROM THE OTHER: the number of pages printed and
// the number of occurrences offered for customisation must be the same
// number. Written separately they would drift, and a book that printed 13
// weeks while offering 12 to customise loses a week silently.
for (const level of LEVELS_IN_BINDING_ORDER) {
  const list = occurrences(level, utc(2026, 1, 1), utc(2026, 3, 31));
  eq(
    printedCount(level, utc(2026, 1, 1), utc(2026, 3, 31)),
    list === null ? null : list.length,
    `${level}: printed count is the occurrence count`
  );
}

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

// --- the timeline's cards ------------------------------------------------
//
// A level's template spread is ONE card and every page added after it is a
// card of its own. Reported: pages added to Beginning grouped up in twos -
// "pages should be single in the timeline unless they are a part of a two
// page spread like the monthly and weekly templates".
const cards = (level: Parameters<typeof inSpreads>[1], n: number) =>
  inSpreads(Array.from({ length: n }, (_, i) => i + 1), level)
    .map((card) => card.join("-"))
    .join(" | ");
eq(cards("FRONT_MATTER", 3), "1 | 2 | 3", "pages added to Beginning stay single");
eq(cards("BACK_MATTER", 2), "1 | 2", "pages added to Ending stay single");
eq(cards("DAILY", 2), "1 | 2", "a day is one page, and so is a page added to it");
eq(cards("WEEKLY", 2), "1-2", "the week's spread is one card");
eq(cards("WEEKLY", 4), "1-2 | 3 | 4", "pages added to a week are single after its spread");
eq(cards("MONTHLY", 3), "1-2 | 3", "a month's spread, then page 3 alone");
eq(cards("WEEKLY", 1), "1", "a set shorter than its spread is still one card");
eq(cards("WEEKLY", 0), "", "and an empty set is no cards");

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(
    `All page level checks passed (${LEVELS_IN_BINDING_ORDER.length} levels in binding order; ` +
      `printed counts exact at one-day, month-boundary, year-boundary and leap-day terms; ` +
      `occurrence keys stable and equal in number to what prints).`
  );
}
