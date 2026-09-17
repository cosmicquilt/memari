// Sequence generation: the order of the book, and which layout each
// occurrence prints.
//
// Built on a SYNTHETIC planner rather than the database, so the checks are
// about the rule and not about whatever happens to be seeded. check:book
// does the other half - it generates the real one and writes the PDF.
//
// The three things that can be silently wrong here, and are what this pins:
//
//   1. THE ORDER. A book runs front matter, then each month with the weeks
//      inside it, then back matter. Sorting each level separately and
//      concatenating gives twelve monthlies followed by fifty-two weeklies -
//      a filing system, not a book - and the page COUNT is identical either
//      way, so nothing but an order check catches it.
//   2. WHICH LAYOUT. A customised month must print its own pages and every
//      other month the default. Getting it backwards still produces the
//      right number of pages.
//   3. THE DATES. Every occurrence must get its own, and the day columns of
//      a spread must run in order - see pageLevels.test.mts for the second,
//      which is where the rule lives.
import { generateBook, type BookSource } from "./generateBook.js";
import { flatten } from "./proofSvg.js";

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

let nextId = 0;
function page(
  level: BookSource["pages"][number]["level"],
  position: number,
  variantKey: string | null,
  slugs: string[]
): BookSource["pages"][number] {
  return {
    id: `p${nextId++}`,
    level,
    variantKey,
    position,
    widthPx: 2175,
    heightPx: 3075,
    gridColumns: 24,
    gridRows: 36,
    gridGapPx: 12,
    marginPx: 187.5,
    moduleInstances: slugs.map((slug, i) => ({
      id: `m${nextId++}`,
      columnStart: 0,
      rowStart: i * 4,
      columnSpan: 24,
      rowSpan: 3,
      locked: true,
      zIndex: i,
      propValues:
        slug === "week-title"
          ? { weekNumber: null, weekTotal: null, dateRangeLabel: "" }
          : slug === "month-title"
          ? { monthName: "" }
          : { heading: `${slug} ${variantKey ?? "default"}`, ruled: false },
      moduleType: { slug },
    })),
  };
}

const book = (over: Partial<BookSource> = {}): BookSource => ({
  title: "Test book",
  dated: true,
  theme: { weekStartDay: 0 },
  startDate: utc(2026, 1, 4), // a Sunday, so weeks need no snapping here
  endDate: utc(2026, 2, 28),
  pages: [
    page("FRONT_MATTER", 0, null, ["labeled-box"]),
    page("MONTHLY", 0, null, ["month-title"]),
    page("WEEKLY", 0, null, ["week-title"]),
    page("BACK_MATTER", 0, null, ["labeled-box"]),
  ],
  ...over,
});

const FONT = "Newsreader";
const textOf = (elements: unknown[]) =>
  flatten(elements as never)
    .filter((e) => e.type === "text")
    .map((e) => String(e.text ?? ""))
    .filter(Boolean);

// --- the order --------------------------------------------------------

const ordered = generateBook(book(), FONT);
const shape = ordered.pages.map((p) => `${p.level}:${p.occurrenceLabel}`);

eq(shape[0], "FRONT_MATTER:Once", "front matter opens the book");
eq(shape[shape.length - 1], "BACK_MATTER:Once", "back matter closes it");

// THE INTERLEAVING. January's own page, then the weeks inside January, then
// February's page. Concatenating by level would put both monthlies first.
eq(shape[1], "MONTHLY:January 2026", "the month comes before its weeks");
eq(shape[2], "WEEKLY:Week of 4 Jan", "then the first week of that month");
const february = shape.indexOf("MONTHLY:February 2026");
const lastJanWeek = shape.lastIndexOf("WEEKLY:Week of 25 Jan");
check(
  lastJanWeek > 0 && lastJanWeek < february,
  `January's last week comes before February's page (week at ${lastJanWeek}, February at ${february})`
);

// A month's page sits with the first week that BEGINS on or after it, never
// after the whole month has gone by.
const firstFebWeek = shape.indexOf("WEEKLY:Week of 1 Feb");
check(february < firstFebWeek, "February's page precedes February's first week");

// --- which layout -----------------------------------------------------

const customised = generateBook(
  book({
    pages: [
      ...book().pages,
      page("MONTHLY", 0, "2026-02", ["month-title"]),
    ],
  }),
  FONT
);
const monthlies = customised.pages.filter((p) => p.level === "MONTHLY");
eq(monthlies.length, 2, "two months, two monthly pages");
eq(monthlies[0].customised, false, "January takes the default layout");
eq(monthlies[1].customised, true, "February prints its own");
// And it is genuinely a DIFFERENT page, not the default relabelled.
check(
  monthlies[0].sourcePageId !== monthlies[1].sourcePageId,
  "the customised month prints a different source page"
);
// Every other month still takes the default - the whole point of
// "customise by exception".
eq(
  customised.pages.filter((p) => p.level === "MONTHLY" && !p.customised).length,
  1,
  "the uncustomised month is untouched"
);

// --- the dates --------------------------------------------------------

const weeklies = ordered.pages.filter((p) => p.level === "WEEKLY");
const titles = weeklies.map((p) => textOf(p.elements).find((t) => t.startsWith("WEEK ")) ?? "");
eq(titles[0], `WEEK 1/${weeklies.length}`, "the first week knows which it is, and of how many");
eq(
  titles[titles.length - 1],
  `WEEK ${weeklies.length}/${weeklies.length}`,
  "and so does the last"
);
// Every week is numbered exactly once. A generator that reused one context
// would print "WEEK 1/9" nine times and still have the right page count.
eq(new Set(titles).size, titles.length, "no two weeks carry the same number");

const ranges = weeklies.map((p) => textOf(p.elements).find((t) => / - /.test(t)) ?? "");
eq(ranges[0], "JAN 4 - JAN 10", "the first week's range is its own seven days");
eq(new Set(ranges).size, ranges.length, "no two weeks carry the same range");

const monthNames = ordered.pages
  .filter((p) => p.level === "MONTHLY")
  .map((p) => textOf(p.elements)[0]);
eq(monthNames.join(","), "JANUARY,FEBRUARY", "each month names itself");

// --- undated stays undated -------------------------------------------
//
// A book of blank templates to write into is a real product - it is the free
// tier - and generating it must not quietly date it.
const blank = generateBook(book({ dated: false }), FONT);
const blankWeek = blank.pages.find((p) => p.level === "WEEKLY")!;
eq(
  textOf(blankWeek.elements).find((t) => t.startsWith("WEEK")),
  "WEEK",
  "an undated book's weeks carry the label and no number"
);
eq(blank.pages.length, ordered.pages.length, "an undated book is the same length");

// --- what contributes nothing ----------------------------------------

// A level with no pages simply has none: leave the dailies out and the book
// gets cheaper, which is the price dial working rather than a fault.
eq(
  ordered.pages.filter((p) => p.level === "DAILY").length,
  0,
  "a level with no template prints nothing"
);

// No term means the repeating levels cannot be counted, so they print
// nothing - but the matter still does, because it is not a function of the
// calendar.
const termless = generateBook(book({ startDate: null, endDate: null }), FONT);
eq(
  termless.pages.map((p) => p.level).join(","),
  "FRONT_MATTER,BACK_MATTER",
  "with no term, only the matter prints"
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(
    `All book generation checks passed (${ordered.pages.length} pages in binding order, ` +
      `months before their weeks, each occurrence dated once, customised months printing ` +
      `their own layout, undated books staying undated).`
  );
}
