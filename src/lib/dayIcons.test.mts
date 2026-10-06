// Day icons: an icon on the days something happens - trash day, payday -
// on the weekly and daily pages' day tabs and in the month calendar's cells.
//
// What this pins:
//
//   1. THE SCHEDULE is the calendar engine's: one-offs, "every other
//      Tuesday", "the first Monday", skipped days. A second scheduler would
//      be the "two descriptions of one thing" defect - so these are checked
//      through iconsOnDates, the only door.
//   2. THE DAY each icon lands on is read off the date the page prints: the
//      hours' columnDates, and the number in each month cell - including the
//      cells from the months either side.
//   3. THE BOOK prints them as the editor shows them (one context function),
//      and an undated book prints none.
//   4. THE TAB never lets an icon cover the day's name or its date.
import { cleanDayIcons, iconsOnDates, monthCellDates, type DayIcon } from "./dayIcons.js";
import { generateBook, type BookSource } from "./generateBook.js";
import { propsForRender, renderContextForPage } from "./renderContext.js";
import { renderHourlyGridCore } from "./modules/hourlyGridCore.js";
import { textWidthPx } from "./modules/textFit.js";
import { flatten } from "./proofSvg.js";
import { ptToPx } from "./print-spec.js";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    failures++;
  }
}
function eq(actual: unknown, expected: unknown, message: string) {
  check(actual === expected, `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const icon = (over: Partial<DayIcon> & Pick<DayIcon, "id" | "start">): DayIcon => ({
  icon: "circle",
  rrule: null,
  skips: [],
  ...over,
});
/** Which of `dates` carry an icon, as the dates. */
const on = (icons: DayIcon[], dates: string[]) =>
  iconsOnDates(icons, dates)
    .map((list, i) => (list.length ? dates[i] : null))
    .filter(Boolean)
    .join(" ");
const daysOf = (from: string, count: number) =>
  Array.from({ length: count }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

// --- 1. the schedule -------------------------------------------------------
{
  const jan = daysOf("2026-01-01", 59); // January and February 2026
  eq(on([icon({ id: "a", start: "2026-01-14" })], jan), "2026-01-14", "a one-off is on its day and no other");
  eq(
    on([icon({ id: "a", start: "2026-01-06", rrule: "FREQ=WEEKLY;BYDAY=TU" })], daysOf("2026-01-01", 21)),
    "2026-01-06 2026-01-13 2026-01-20",
    "every Tuesday"
  );
  eq(
    on([icon({ id: "a", start: "2026-01-06", rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU" })], daysOf("2026-01-01", 35)),
    "2026-01-06 2026-01-20 2026-02-03",
    "every other Tuesday - the bins on alternate weeks"
  );
  eq(
    on([icon({ id: "a", start: "2026-01-01", rrule: "FREQ=MONTHLY;BYDAY=1MO" })], jan),
    "2026-01-05 2026-02-02",
    "the first Monday of each month"
  );
  eq(
    on([icon({ id: "a", start: "2026-01-01", rrule: "FREQ=MONTHLY;BYDAY=-1FR" })], jan),
    "2026-01-30 2026-02-27",
    "the last Friday - payday"
  );
  eq(
    on([icon({ id: "a", start: "2026-01-06", rrule: "FREQ=WEEKLY;BYDAY=TU", skips: ["2026-01-13"] })], daysOf("2026-01-01", 21)),
    "2026-01-06 2026-01-20",
    "a skipped Tuesday is left off - the bank holiday week"
  );
  eq(
    on([icon({ id: "a", start: "2026-01-06", rrule: "FREQ=WEEKLY;BYDAY=TU;COUNT=2" })], daysOf("2026-01-01", 21)),
    "2026-01-06 2026-01-13",
    "a series with an end stops there"
  );
  eq(on([icon({ id: "a", start: "2026-01-20", rrule: "FREQ=WEEKLY;BYDAY=TU" })], daysOf("2026-01-01", 21)), "2026-01-20", "nothing before it starts");
  // Two on one day print in the list's order, which is the editor's order.
  const both = iconsOnDates(
    [icon({ id: "trash", icon: "square", start: "2026-01-06" }), icon({ id: "recycle", icon: "star", start: "2026-01-06" })],
    ["2026-01-06", null]
  );
  eq(both[0].join(), "square,star", "two on one day, in the list's order");
  eq(both[1].length, 0, "a column with no date gets none");
}

// --- cleaning: what a public action can be sent ----------------------------
{
  const kept = cleanDayIcons([
    { id: "ok", icon: "star", start: "2026-01-06", rrule: "RRULE:FREQ=WEEKLY;BYDAY=TU", skips: ["2026-01-13", "nope", "2026-01-13"], name: "  Bins " },
    { id: "bad-icon", icon: "dragon", start: "2026-01-06" },
    { id: "bad-day", icon: "star", start: "2026-13-45" },
    { id: "no-freq", icon: "star", start: "2026-01-06", rrule: "BYDAY=TU" },
    "junk",
  ]);
  eq(kept.map((k) => k.id).join(), "ok,no-freq", "an unknown icon, an impossible date and junk are dropped");
  eq(kept[0].rrule, "FREQ=WEEKLY;BYDAY=TU", "the RRULE: prefix is taken off");
  eq(kept[0].skips.join(), "2026-01-13", "skips are real days, once each");
  eq(kept[0].name, "Bins", "the name is trimmed");
  eq(kept[1].rrule, null, "a rule with no FREQ is a one-off, not a guess");
  eq(cleanDayIcons(Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, icon: "circle", start: "2026-01-01" }))).length, 12, "capped at twelve");
  eq(cleanDayIcons(null).length, 0, "no list is an empty one");
}

// --- 2. a month cell's day is the number it prints -------------------------
{
  // January 2026 from a Sunday: its first row runs 28 Dec to 3 Jan, and the
  // first three cells are December's. December 2026's last row runs into
  // January 2027.
  const jan = monthCellDates(
    [
      [{ date: 28, inCurrentMonth: false }, { date: 1, inCurrentMonth: true }],
      [{ date: 31, inCurrentMonth: true }, { date: 1, inCurrentMonth: false }],
    ],
    new Date("2026-01-01T00:00:00Z")
  );
  eq(jan.flat().join(" "), "2025-12-28 2026-01-01 2026-01-31 2026-02-01", "the first row's spill is last month, a later row's is next month - across a year");
  eq(monthCellDates([[{ date: 31, inCurrentMonth: false }]], new Date("2027-01-01T00:00:00Z"))[0][0], "2026-12-31", "into last year");
  eq(monthCellDates([[{ inCurrentMonth: true }]], new Date("2026-01-01T00:00:00Z"))[0][0], null, "an undated cell is no day");
}

// --- 3. the book ----------------------------------------------------------
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
let nextId = 0;
const page = (
  level: BookSource["pages"][number]["level"],
  position: number,
  instance: { slug: string; propValues: unknown }
): BookSource["pages"][number] => ({
  id: `p${nextId++}`,
  level,
  variantKey: null,
  position,
  widthPx: 2175,
  heightPx: 3075,
  gridColumns: 24,
  gridRows: 36,
  gridGapPx: 12,
  marginPx: 187.5,
  moduleInstances: [
    {
      id: `m${nextId++}`,
      columnStart: 0,
      rowStart: 0,
      columnSpan: 24,
      rowSpan: 22,
      locked: true,
      zIndex: 0,
      propValues: instance.propValues,
      moduleType: { slug: instance.slug },
    },
  ],
});
const hours = (names: string[]) => ({
  slug: "hourly-grid-core",
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
});
const month = (names: string[]) => ({
  slug: "month-grid-core",
  propValues: { dayCount: names.length, dayLabels: names.map((name) => ({ name })), weekCount: 5, cells: [] },
});
const LEFT = ["SUNDAY", "MONDAY", "TUESDAY"];
const RIGHT = ["WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const trash = icon({ id: "trash", icon: "square", start: "2025-12-30", rrule: "FREQ=WEEKLY;BYDAY=TU", skips: ["2026-01-13"] });
const payday = icon({ id: "pay", icon: "star", start: "2026-01-01", rrule: "FREQ=MONTHLY;BYDAY=1MO" });
const source = (over: Partial<BookSource> = {}): BookSource => ({
  title: "Day icons",
  dated: true,
  theme: { weekStartDay: 0, dayIcons: [trash, payday] },
  startDate: utc(2026, 1, 4), // a Sunday
  endDate: utc(2026, 1, 31),
  pages: [page("MONTHLY", 0, month(LEFT)), page("MONTHLY", 1, month(RIGHT)), page("WEEKLY", 0, hours(LEFT)), page("WEEKLY", 1, hours(RIGHT))],
  ...over,
});
const iconsIn = (elements: unknown[]) =>
  flatten(elements as never)
    .filter((e) => /-dayicon\d+$/.test(String(e.id)))
    .map((e) => String(e.id).replace(/^.*?-((w\d+-)?d\d+-dayicon\d+)$/, "$1"));
{
  const book = generateBook(source(), "Newsreader");
  const weeks = book.pages.filter((p) => p.level === "WEEKLY");
  const months = book.pages.filter((p) => p.level === "MONTHLY");
  // Week of 4 January: Sun 4, Mon 5 (the first Monday), Tue 6 (trash).
  eq(iconsIn(weeks[0].elements).join(" "), "d1-dayicon0 d2-dayicon0", "week one's left page: payday on Monday 5th, trash on Tuesday 6th");
  eq(iconsIn(weeks[1].elements).length, 0, "nothing on its right page");
  eq(iconsIn(weeks[2].elements).length, 0, "the week of the 13th: trash skipped");
  eq(iconsIn(weeks[4].elements).join(" "), "d2-dayicon0", "the week of the 20th: trash again");
  const glyph = flatten(weeks[0].elements as never).find((e) => /-d2-dayicon0$/.test(String(e.id)));
  check(typeof glyph?.pathD !== "string" && glyph?.subType === "rect", "the square prints as the box it is");
  // January's calendar, left page (Sun-Tue): Tuesdays 30 Dec (December's,
  // but its cell shows it), 6th, 13th skipped, 20th, 27th; the first Monday
  // is the 5th, in the second row.
  eq(
    iconsIn(months[0].elements).sort().join(" "),
    ["w0-d2-dayicon0", "w1-d1-dayicon0", "w1-d2-dayicon0", "w3-d2-dayicon0", "w4-d2-dayicon0"].join(" "),
    "the month: every trash Tuesday but the skipped one, December's included, and the first Monday"
  );
  eq(iconsIn(months[1].elements).length, 0, "nothing on its Wednesday-to-Saturday page");

  const undated = generateBook(source({ dated: false }), "Newsreader");
  eq(undated.pages.flatMap((p) => iconsIn(p.elements)).length, 0, "an undated book prints none: it has no days for them to fall on");
  const none = generateBook(source({ theme: { weekStartDay: 0 } }), "Newsreader");
  eq(none.pages.flatMap((p) => iconsIn(p.elements)).length, 0, "a journal with none prints none");
}

// --- the editor's pages: the same context ---------------------------------
{
  const book = source();
  const weekly = book.pages[2];
  const context = renderContextForPage({ ...book, pages: book.pages }, weekly.id);
  const drawn = propsForRender("hourly-grid-core", weekly.moduleInstances[0].propValues, context) as { dayIcons?: string[][] };
  eq(JSON.stringify(drawn.dayIcons), JSON.stringify([[], ["star"], ["square"]]), "the editor's week draws what the book prints");
  const stored = weekly.moduleInstances[0].propValues as { dayIcons?: unknown };
  eq(stored.dayIcons, undefined, "and nothing is written into the stored template");
}

// --- 4. the tab holds them clear of its name and its date ------------------
{
  // Two columns about the width of the weekly page's.
  const geometry = { x: 0, y: 0, width: 1200, height: 900 };
  const names = ["WEDNESDAY", "MON"];
  const elements = renderHourlyGridCore(
    geometry,
    {
      dayCount: 2,
      dayLabels: names.map((name) => ({ name, date: 28 })),
      startTime: "09:00",
      endTime: "12:00",
      intervalMinutes: 30,
      hourLineStyle: "full",
      dayBorder: false,
      events: [],
      dayIcons: [Array(12).fill("heart"), ["heart", "star"]],
    },
    "h",
    "Newsreader"
  );
  const byId = (re: RegExp) => elements.filter((e) => re.test(e.id));
  for (let d = 0; d < 2; d++) {
    const box = byId(new RegExp(`^h-d${d}-header-box$`))[0];
    const name = byId(new RegExp(`^h-d${d}-name$`))[0];
    const date = byId(new RegExp(`^h-d${d}-date$`))[0];
    const nameRight = name.x + textWidthPx(String(name.text), Number(name.fontSize), "Newsreader");
    const dateLeft = date.x + date.width - textWidthPx(String(date.text), Number(date.fontSize), "Newsreader");
    const icons = byId(new RegExp(`^h-d${d}-dayicon\\d+$`));
    check(icons.length > 0, `day ${d} draws its icons`);
    for (const g of icons) {
      check(g.x >= nameRight + ptToPx(2) && g.x + g.width <= dateLeft - ptToPx(2), `day ${d}'s ${g.id} sits between the name and the date`);
      check(g.y >= box.y && g.y + g.height <= box.y + box.height, `day ${d}'s ${g.id} is inside the tab`);
    }
    for (let i = 1; i < icons.length; i++) {
      check(icons[i].x + icons[i].width <= icons[i - 1].x, `day ${d}'s icons do not overlap`);
    }
  }
  const crowded = byId(/^h-d0-dayicon\d+$/).length;
  check(crowded < 12, `twelve on one narrow day are cut to what fits (drew ${crowded})`);
  eq(byId(/^h-d1-dayicon\d+$/).length, 2, "two on a short name both fit");
  // The first is next to the date, so the one that matters most is the one
  // that is never cut.
  check(byId(/^h-d1-dayicon0$/)[0].x > byId(/^h-d1-dayicon1$/)[0].x, "the first is next to the date");
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("All day icon checks passed (one-offs, every other week, first Monday, last Friday, skips; the month's spill days; book = editor; undated prints none; the tab keeps its name and date clear).");
}
