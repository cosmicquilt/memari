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

if (failures > 0) {
  console.error(`\n${failures} render context check(s) failed.`);
  process.exit(1);
}
console.log(
  "All render context checks passed (the page's occurrence, rotation and undated rule computed once; every drawing of a page's module goes through it)."
);
