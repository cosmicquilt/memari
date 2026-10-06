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
import { placePageEvents } from "./renderContext.js";
import { EVENT_PRINT_GREY } from "./modules/hourlyGridCore.js";
import { occurrences } from "./pageLevels.js";
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

// A TERM THAT DOES NOT START ON A WEEK BOUNDARY. The week containing 1
// January begins on 28 December, so sorting strictly by start date opened
// the book with a week page and put January's own page AFTER January's first
// week. Occurrences beginning before the term sort as if they began on its
// first day, which puts the coarsest thing first.
const midWeek = generateBook(
  book({ startDate: utc(2026, 1, 1), endDate: utc(2026, 2, 28) }),
  FONT
).pages.map((p) => `${p.level}:${p.occurrenceLabel}`);
eq(midWeek[0], "FRONT_MATTER:Once", "front matter still opens it");
eq(midWeek[1], "MONTHLY:January 2026", "the month opens the dated pages");
eq(midWeek[2], "WEEKLY:Week of 28 Dec", "then the week that runs into it");

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


// --- THE BOOK TURNS THE WEEK LIKE THE EDITOR -------------------------------
// It took the stored labels as they were, so a Monday journal's week printed
// SUNDAY in its first column - dated as the last day of the week - while the
// editor showed MONDAY there. Found 2026-09-30.
{
  const hoursPage = (position: number, names: string[]): BookSource["pages"][number] => ({
    ...page("WEEKLY", position, null, []),
    moduleInstances: [
      {
        id: `h${position}`,
        columnStart: 6,
        rowStart: 0,
        columnSpan: 18,
        rowSpan: 20,
        locked: true,
        zIndex: 0,
        propValues: {
          dayCount: names.length,
          dayLabels: names.map((name) => ({ name, date: null })),
          startTime: "05:30",
          endTime: "23:30",
          intervalMinutes: 30,
          hourLineStyle: "full",
          dayBorder: false,
          events: [],
        },
        moduleType: { slug: "hourly-grid-core" },
      },
    ],
  });
  const monday = generateBook(
    book({
      theme: { weekStartDay: 1 },
      startDate: utc(2026, 1, 5), // a Monday
      endDate: utc(2026, 1, 18),
      pages: [hoursPage(0, ["SUNDAY", "MONDAY", "TUESDAY"]), hoursPage(1, ["WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"])],
    }),
    FONT
  );
  const left = monday.pages[0];
  const names = flatten(left.elements as never)
    .filter((e) => /-d\d-name$/.test(String(e.id)))
    .map((e) => String(e.text));
  eq(names.join(" "), "MONDAY TUESDAY WEDNESDAY", "a Monday journal's book opens its week on Monday");
  const firstDate = flatten(left.elements as never).find((e) => /-d0-date$/.test(String(e.id)));
  eq(String(firstDate?.text), "5", "and its first column is dated the week's first day");

  // --- THE BOOK PRINTS THE OWNER'S EVENTS, IN GREY ---------------------------
  // It set `events: null` on every page, so the PDF and every printed order
  // had none while the editor drew them (2026-10-06, "apparently events arent
  // in the print?"). Grey because "colour on screen, grey on paper".
  const dentist = {
    id: "ev1",
    title: "Dentist",
    startsAt: new Date("2026-01-06T09:00:00Z"), // a Tuesday
    endsAt: new Date("2026-01-06T10:00:00Z"),
    allDay: false,
    rrule: null,
    timeZone: "UTC",
    calendar: { colour: "#ff0000", source: null },
  };
  const withEvents = generateBook(
    book({
      theme: { weekStartDay: 1 },
      startDate: utc(2026, 1, 5),
      endDate: utc(2026, 1, 18),
      timeZone: "UTC",
      events: [dentist],
      pages: [hoursPage(0, ["SUNDAY", "MONDAY", "TUESDAY"]), hoursPage(1, ["WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"])],
    }),
    FONT
  );
  const boxesOn = (pageIndex: number) =>
    flatten(withEvents.pages[pageIndex].elements as never).filter((e) => /-ev[^-]*-box$/.test(String(e.id)));
  const box = boxesOn(0);
  eq(box.map((e) => /-d(\d)-ev/.exec(String(e.id))?.[1]).join(), "1", "the book prints the event under its day: Tuesday, the left page's second column");
  eq(box[0]?.fill, EVENT_PRINT_GREY, "in print grey, not its calendar's red");
  check(textOf(withEvents.pages[0].elements).includes("Dentist"), "with its title");
  eq(boxesOn(2).length, 0, "and not in the following week");
  const without = generateBook(
    book({ theme: { weekStartDay: 1 }, startDate: utc(2026, 1, 5), endDate: utc(2026, 1, 18), timeZone: "UTC", pages: [hoursPage(0, ["SUNDAY", "MONDAY", "TUESDAY"]), hoursPage(1, ["WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"])] }),
    FONT
  );
  eq(flatten(without.pages[0].elements as never).filter((e) => /-ev[^-]*-box$/.test(String(e.id))).length, 0, "a book given no events prints none");
  // One function places them for the page and the book; only paper is grey.
  const firstWeek = occurrences("WEEKLY", utc(2026, 1, 5), utc(2026, 1, 18), 1)![0];
  const placeArgs = { level: "WEEKLY" as const, dated: true, occurrence: { ...firstWeek, level: "WEEKLY" as const, index: 0, total: 2 }, dayLabels: [{ name: "MONDAY", date: 5 }, { name: "TUESDAY", date: 6 }, { name: "WEDNESDAY", date: 7 }], hasHours: true, events: [dentist], zone: "UTC" };
  eq(placePageEvents(placeArgs).events?.[0]?.colour, "#ff0000", "on screen it keeps its calendar's colour");
  eq(placePageEvents({ ...placeArgs, print: true }).events?.[0]?.colour, EVENT_PRINT_GREY, "on paper it is grey");
}

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
