// What a page's modules are drawn with, and that every drawing gets it.
//
// The defect this guards: the page load drew modules dated (the daily page's
// hours say THURSDAY 1 on 1 January 2026) while every LATER drawing - a live
// resize, a drop, the render a server action sends back - started from the
// stored template and said MONDAY 1. The context is now one function, so the
// checks here are (a) that it computes what the load always computed, and
// (b) that nothing draws a page's module without it.
import { readFileSync } from "node:fs";
import { propsForRender, renderContextForPage, renderOnPage, type RenderContextBook } from "./renderContext.js";
import { renderModuleInstance } from "./renderModuleInstance.js";
import { pageThumbnail } from "../app/planner/loadPlannerPages.js";
import type { PageGrid } from "./grid.js";
import { monthLayout } from "./pageLayouts.js";
import { flatten } from "./proofSvg.js";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    failures++;
  }
}

const hours = (dayLabels: Array<{ name: string; date: number | null }>) => ({
  moduleType: { slug: "hourly-grid-core" },
  propValues: { dayLabels, dayCount: dayLabels.length, events: [], startTime: "05:30", endTime: "23:30", intervalMinutes: 30 },
});
const labelsOf = (props: unknown) =>
  ((props as { dayLabels: Array<{ name: string; date: number | null }> }).dayLabels ?? [])
    .map((d) => `${d.name} ${d.date}`)
    .join(", ");

// The daily page as the template stores it, in a book whose term starts on
// Thursday 1 January 2026.
const book: RenderContextBook = {
  dated: true,
  startDate: new Date("2026-01-01T00:00:00Z"),
  endDate: new Date("2026-03-31T00:00:00Z"),
  theme: { weekStartDay: 0 },
  pages: [
    { id: "day", level: "DAILY", variantKey: null, position: 0, moduleInstances: [hours([{ name: "MONDAY", date: 1 }])] },
    {
      id: "wk-left",
      level: "WEEKLY",
      variantKey: null,
      position: 0,
      moduleInstances: [hours([{ name: "SUNDAY", date: 28 }, { name: "MONDAY", date: 29 }, { name: "TUESDAY", date: 30 }])],
    },
    {
      id: "wk-right",
      level: "WEEKLY",
      variantKey: null,
      position: 1,
      moduleInstances: [
        hours([
          { name: "WEDNESDAY", date: 31 },
          { name: "THURSDAY", date: 1 },
          { name: "FRIDAY", date: 2 },
          { name: "SATURDAY", date: 3 },
        ]),
      ],
    },
    { id: "feb-day", level: "DAILY", variantKey: "2026-01-05", position: 0, moduleInstances: [hours([{ name: "MONDAY", date: 1 }])] },
    { id: "month", level: "MONTHLY", variantKey: null, position: 0, moduleInstances: [] },
  ],
};
const stored = (id: string) => book.pages.find((p) => p.id === id)!.moduleInstances[0].propValues;

// --- the context -----------------------------------------------------------
{
  const context = renderContextForPage(book, "day");
  check(!!context && context.dated, "a dated book's page is dated");
  check(context?.occurrence?.start.toISOString().slice(0, 10) === "2026-01-01", "the default layout is edited as the term's first day");
  const drawn = labelsOf(propsForRender("hourly-grid-core", stored("day"), context));
  check(drawn === "THURSDAY 1", `the daily page's hours draw its first day, not the template's (got ${drawn})`);
  check(labelsOf(stored("day")) === "MONDAY 1", "the stored template is left alone");
}
{
  const drawn = labelsOf(propsForRender("hourly-grid-core", stored("feb-day"), renderContextForPage(book, "feb-day")));
  check(drawn === "MONDAY 5", `a variant is edited as its own occurrence (got ${drawn})`);
}
{
  // A week that starts on Monday: the seven days are rotated across the
  // spread, left three and right four, before they are dated.
  const monday = { ...book, theme: { weekStartDay: 1 } };
  const left = labelsOf(propsForRender("hourly-grid-core", stored("wk-left"), renderContextForPage(monday, "wk-left")));
  const right = labelsOf(propsForRender("hourly-grid-core", stored("wk-right"), renderContextForPage(monday, "wk-right")));
  check(left.startsWith("MONDAY") && left.split(", ").length === 3, `left page takes the first three days from Monday (got ${left})`);
  check(right.endsWith("SUNDAY 4") && right.split(", ").length === 4, `right page ends on the Sunday (got ${right})`);
}
{
  const undated = renderContextForPage({ ...book, dated: false }, "day");
  const drawn = labelsOf(propsForRender("hourly-grid-core", stored("day"), undated));
  check(drawn === "MONDAY null", `an undated book draws no date (got ${drawn})`);
}
{
  const noTerm = renderContextForPage({ ...book, startDate: null, endDate: null }, "day");
  check(noTerm?.occurrence === null, "no term, no occurrence");
  check(labelsOf(propsForRender("hourly-grid-core", stored("day"), noTerm)) === "MONDAY 1", "and the stored values stand");
}
{
  check(renderContextForPage(book, "month")?.dayLabels === null, "a page without hours has no day columns to rotate");
  check(renderContextForPage(book, "missing") === null, "an unknown page has no context");
  check(propsForRender("hourly-grid-core", stored("day"), null) === stored("day"), "a null context draws the stored values");
}

// --- the drawing -----------------------------------------------------------
{
  const pageGrid: PageGrid = { widthPx: 2175, heightPx: 3075, gridColumns: 24, gridRows: 36, boxInsetPx: 6, marginPx: 75 };
  const instance = {
    id: "h",
    locked: true,
    columnStart: 6,
    rowStart: 0,
    columnSpan: 18,
    rowSpan: 20,
    propValues: stored("day"),
    moduleType: { slug: "hourly-grid-core" },
  };
  const texts = (elements: unknown) => JSON.stringify(elements);
  const onPage = texts(renderOnPage(instance, pageGrid, "serif", renderContextForPage(book, "day")));
  check(onPage.includes("THURSDAY") && !onPage.includes("MONDAY"), "renderOnPage draws the page's day");
  check(texts(renderModuleInstance(instance, pageGrid, "serif")).includes("MONDAY"), "a raw render would have drawn the template");
}

// --- nothing draws a page's module without its context ----------------------
//
// Every drawing of a module that sits on a page goes through renderOnPage.
// A raw renderModuleInstance there draws the template - which is the bug.
// The palette's own card preview is the one legitimate raw call in the
// editor: it belongs to no page.
{
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const actions = source("../app/planner/actions.ts");
  check(!/renderModuleInstance\(/.test(actions), "actions.ts renders only through renderOnPage");
  const editor = source("../app/planner/NativePlannerEditor.tsx");
  const raw = editor.match(/renderModuleInstance\(/g)?.length ?? 0;
  check(raw === 1, `NativePlannerEditor renders raw only for the palette card (found ${raw} raw calls)`);
  const moduleEditor = source("../app/planner/ModuleEditor.tsx");
  check(!/renderModuleInstance\(/.test(moduleEditor), "the module editor's preview is drawn as its page");
  const load = source("../app/planner/loadPlannerPages.ts");
  check(/renderOnPage\(instance, pageGrid, fontFamily, renderContext\)/.test(load), "the page load draws through renderOnPage");
  // AND NOTHING RAW BESIDE IT. Checking only that renderOnPage appears is
  // what let the thumbnail slip: pageThumbnail sat in this same file calling
  // renderModuleInstance directly, so the positive check passed while every
  // timeline card drew its page as the seed left it.
  check(
    !/renderModuleInstance\(/.test(load),
    "loadPlannerPages draws no page module raw - the thumbnail did, and showed the seed's January"
  );
}

// --- a thumbnail says what its page says ------------------------------------
//
// THE INVARIANT THE SOURCE CHECK IS A PROXY FOR. A page drawn small is the
// same page: if the canvas reads "DEC 28 - JAN 3" and the card under it reads
// "DEC 31 - JAN 6", one of them is lying about what will print. Measured on a
// real book when this was reported, those were the exact two strings.
{
  const pageGrid: PageGrid = { widthPx: 2175, heightPx: 3075, gridColumns: 24, gridRows: 36, boxInsetPx: 6, marginPx: 75 };
  const instance = {
    id: "h",
    locked: true,
    columnStart: 6,
    rowStart: 0,
    columnSpan: 18,
    rowSpan: 20,
    propValues: stored("day"),
    moduleType: { slug: "hourly-grid-core" },
  };
  const source = { ...pageGrid, gridGapPx: 12, moduleInstances: [instance] };
  const context = renderContextForPage(book, "day");
  const onCanvas = JSON.stringify(renderOnPage(instance, pageGrid, "serif", context));
  const asThumbnail = JSON.stringify(pageThumbnail(source as never, "serif", context));
  check(onCanvas.includes("THURSDAY"), "the canvas draws the page's own day");
  check(
    asThumbnail.includes("THURSDAY") && !asThumbnail.includes("MONDAY"),
    "the thumbnail draws the same day as the canvas, not the stored template"
  );
  // With NO context it still draws the stored values, which is what a saved
  // page - belonging to no term - has to keep doing.
  const loose = JSON.stringify(pageThumbnail(source as never, "serif", null));
  check(loose.includes("MONDAY"), "a thumbnail with no context draws the stored values, as a saved page must");
}


// --- the week start reaches every module that prints weekdays -------------
// It used to reach only the hours (2026-09-30): a Monday journal drew a
// Sunday-first mini month, habit tracker and month calendar.
{
  const month = monthLayout(36);
  const placement = (slug: string, index: number) => {
    for (const group of month.groups)
      for (const p of group.placements as Array<Record<string, unknown>>)
        if (p.slug === slug && p.page === index) return p;
    throw new Error(`${slug} on page ${index}`);
  };
  const calendar = (index: number) => ({ moduleType: { slug: "month-grid-core" }, propValues: placement("month-grid-core", index).propValues });
  const monthBook = (weekStartDay: number, over: Partial<RenderContextBook> = {}): RenderContextBook => ({
    ...book,
    theme: { weekStartDay },
    pages: [
      { id: "m-left", level: "MONTHLY", variantKey: null, position: 0, moduleInstances: [calendar(0)] },
      { id: "m-right", level: "MONTHLY", variantKey: null, position: 1, moduleInstances: [calendar(1)] },
    ],
    ...over,
  });
  type Cell = { date?: number | null };
  const drawn = (b: RenderContextBook, id: string) =>
    propsForRender("month-grid-core", b.pages.find((p) => p.id === id)!.moduleInstances[0].propValues, renderContextForPage(b, id)) as {
      dayLabels: Array<{ name: string }>;
      cells: Cell[][];
    };
  const names = (props: { dayLabels: Array<{ name: string }> }) => props.dayLabels.map((d) => d.name).join(" ");
  const firstRow = (props: { cells: Cell[][] }) => props.cells[0].map((c) => c.date).join(" ");

  const mon = monthBook(1);
  check(names(drawn(mon, "m-left")) === "MONDAY TUESDAY WEDNESDAY", `a Monday journal's calendar opens on Monday (got ${names(drawn(mon, "m-left"))})`);
  check(names(drawn(mon, "m-right")) === "THURSDAY FRIDAY SATURDAY SUNDAY", `and closes on Sunday (got ${names(drawn(mon, "m-right"))})`);
  // January 2026 begins on a Thursday: Mon 29 Dec, Tue 30, Wed 31 | Thu 1 .. Sun 4.
  check(firstRow(drawn(mon, "m-left")) === "29 30 31", `its dates follow the days (left got ${firstRow(drawn(mon, "m-left"))})`);
  check(firstRow(drawn(mon, "m-right")) === "1 2 3 4", `(right got ${firstRow(drawn(mon, "m-right"))})`);
  const sun = monthBook(0);
  check(names(drawn(sun, "m-left")) === "SUNDAY MONDAY TUESDAY" && firstRow(drawn(sun, "m-left")) === "28 29 30", "a Sunday journal is as it was");
  // With no term there is nothing to recompute the cells from, so the
  // stored month keeps its stored order rather than turn its names alone.
  const noTerm = monthBook(1, { startDate: null, endDate: null });
  check(names(drawn(noTerm, "m-left")) === "SUNDAY MONDAY TUESDAY", "a calendar with no term keeps the order its cells are stored in");

  const context = renderContextForPage(mon, "m-left");
  const pageGrid: PageGrid = { widthPx: 2175, heightPx: 3075, gridColumns: 24, gridRows: 36, boxInsetPx: 6, marginPx: 75 };
  const draw = (slug: string, propValues: unknown, columnSpan = 6, rowSpan = 10) =>
    renderOnPage({ id: "x", locked: false, columnStart: 0, rowStart: 0, columnSpan, rowSpan, propValues, moduleType: { slug } }, pageGrid, "serif", context);
  const initials = (elements: unknown, pattern: RegExp) =>
    flatten(elements as never).filter((e) => pattern.test(String(e.id))).map((e) => e.text).join("");
  const mini = draw("mini-month", { year: 2026, month: 1, heading: "", markable: false });
  check(initials(mini, /-weekday\d$/) === "MTWTFSS", `the mini month's letters start Monday (got ${initials(mini, /-weekday\d$/)})`);
  const habits = draw("habit-tracker", { heading: "Habits", habits: ["Read"] }, 24, 4);
  check(initials(habits, /-day\d-letter$/) === "MTWTFSS", `the habit tracker's week starts Monday (got ${initials(habits, /-day\d-letter$/)})`);
  const salah = propsForRender("salah-tracker", { habits: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], columns: ["Fajr"] }, renderContextForPage(sun, "m-left")) as { habits: string[] };
  check(salah.habits[0] === "Sun", `a preset that types its week turns with the journal (got ${salah.habits[0]})`);
  const mood = propsForRender("mood-tracker", { items: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] }, renderContextForPage(sun, "m-left")) as { items: string[] };
  check(mood.items[0] === "Sun", "the mood tracker's rows too");
}

if (failures > 0) {
  console.error(`\n${failures} render context check(s) failed.`);
  process.exit(1);
}
console.log(
  "All render context checks passed (the page's occurrence, rotation and undated rule computed once; every drawing of a page's module goes through it)."
);
