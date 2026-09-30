// The module-edits list (2026-09-30): each option draws what it says, and
// the default draws what it always did. moduleHouseStyle.test.mts runs the
// same options through the lattice and text rules; this checks the options
// themselves.
//
// Run with: npx tsx src/lib/moduleEdits.test.mts

import { renderModuleInstance, type RenderedPolotnoElement } from "./renderModuleInstance";
import { PROOF_PAGE as PAGE, flatten } from "./proofSvg";
import { cellHeightPx } from "./grid";
import { hourlyPropsFromSettings, DEFAULT_HOURLY_SETTINGS } from "./modules/hourlyGridCore";
import { getMinRowSpanForSlug } from "./moduleMinRowSpan";
import { wholeCellColumns } from "./modules/columnTable";
import { withCurrentSettings } from "./moduleRegistry";
import { textWidthPx } from "./modules/textFit";
import { GLYPH_SHAPES, glyphElement } from "./modules/glyphs";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL ${message}`);
  }
}
process.on("exit", () => {
  if (failures > 0) {
    console.error(`\n${failures} module-edit check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("All module-edit checks passed (every new option draws what it says; every default draws what it did).");
  }
});

const PITCH = cellHeightPx(PAGE);
function draw(slug: string, props: Record<string, unknown>, columnSpan = 6, rowSpan = 8): RenderedPolotnoElement[] {
  return flatten(
    renderModuleInstance(
      { id: "m", locked: false, columnStart: 0, rowStart: 0, columnSpan, rowSpan, propValues: props, moduleType: { slug } },
      PAGE
    )
  );
}
const ids = (elements: RenderedPolotnoElement[], pattern: RegExp) => elements.filter((e) => pattern.test(String(e.id)));
const texts = (elements: RenderedPolotnoElement[], pattern: RegExp) => ids(elements, pattern).map((e) => String(e.text));
const onColumn = (x: number) => Math.abs(((x - PAGE.marginPx) / PITCH) % 1) < 1e-6 || Math.abs(((x - PAGE.marginPx) / PITCH) % 1) > 1 - 1e-6;

// --- note box --------------------------------------------------------------
{
  const lined = draw("labeled-box", { heading: "Notes", rule: "lined" });
  const rules = ids(lined, /-rule\d+$/).length;
  const graph = draw("labeled-box", { heading: "Notes", rule: "graph" });
  check(ids(graph, /-grid-h\d+$/).length === rules, `graph has a horizontal line on every lined row (${ids(graph, /-grid-h\d+$/).length} vs ${rules})`);
  const verticals = ids(graph, /-grid-v\d+$/);
  check(verticals.length === 5, `a 6-cell graph box has 5 interior verticals (got ${verticals.length})`);
  check(verticals.every((v) => onColumn((v.x ?? 0) + (v.width ?? 0) / 2)), "every graph vertical sits on a lattice column");

  // DIVIDERS DOWN THE DAY COLUMNS - a day is six cells, a quarter of the
  // page, so a box three days wide has two, each where a day ends.
  const dayEdge = (x: number) => Math.abs(((x - PAGE.marginPx) / (6 * PITCH)) % 1) < 1e-6;
  const three = draw("labeled-box", { heading: "Notes", rule: "lined", dividers: true }, 18, 6);
  const dividers = ids(three, /-divider\d$/).map((e) => (e.x ?? 0) + (e.width ?? 0) / 2);
  check(dividers.length === 2, `a box three days wide has two dividers (got ${dividers.length})`);
  check(dividers.every(dayEdge), "each on a day column's edge");
  check(ids(draw("labeled-box", { heading: "Notes", rule: "lined", dividers: true }, 12, 6), /-divider\d$/).length === 1, "two days wide, one");
  check(ids(draw("labeled-box", { heading: "Notes", rule: "lined", dividers: true }, 6, 6), /-divider\d$/).length === 0, "one day wide, none");
  check(ids(draw("labeled-box", { heading: "Notes", rule: "lined" }, 18, 6), /-divider\d$/).length === 0, "off by default");
  check(ids(draw("labeled-box", { heading: "Notes", rule: "lined", columns: 2 }, 18, 6), /-divider\d$/).length === 2, "a box saved with two columns keeps its dividers");
  check(withCurrentSettings("labeled-box", { columns: 2 }).dividers === true, "and opens with the switch on");
  const two = draw("labeled-box", { heading: "Notes", rule: "lined", dividers: true }, 12, 6);
  check(ids(two, /-c0-rule\d+$/).length > 0 && ids(two, /-c1-rule\d+$/).length === ids(two, /-c0-rule\d+$/).length, "each column is ruled alike");

  const numbered = draw("labeled-box", { heading: "Notes", rule: "lined", lineStart: "numbers" });
  const numbers = texts(numbered, /-start\d+$/);
  check(numbers.length === rules && numbers[0] === "1" && numbers[numbers.length - 1] === String(rules), `a number on every line, 1 to ${rules} (got ${numbers.join(",")})`);
  check(ids(draw("labeled-box", { heading: "Notes", rule: "lined", lineStart: "bullets" }), /-start\d+$/).length === rules, "a bullet on every line");
  check(ids(draw("labeled-box", { heading: "Notes", rule: "none", lineStart: "numbers" }), /-start\d+$/).length === 0, "a blank box has no lines to start");
  check(ids(draw("labeled-box", { heading: "Notes", rule: "graph", lineStart: "numbers" }), /-start\d+$/).length === 0, "nor does graph paper");

  // Heading off: the band is the first row, so a lined box gains a line and
  // every rule stays on its dot. On by default - the palette card shows NOTES.
  const bare = draw("labeled-box", { heading: "Notes", rule: "lined", showHeading: false });
  check(ids(bare, /-(heading|header-rule)$/).length === 0, "no heading and no band when it is off");
  check(ids(bare, /-rule\d+$/).length === rules + 1, `the band becomes a writing line (${ids(bare, /-rule\d+$/).length} vs ${rules})`);
  check(ids(draw("labeled-box", { heading: "Notes" }), /-heading$/).length === 1, "on by default");

  // What it always drew, unchanged.
  const legacy = draw("labeled-box", { heading: "Notes", ruled: true });
  check(ids(legacy, /-rule\d+$/).length === rules, "the old ruled boolean still rules the box");
  check(ids(draw("labeled-box", { heading: "Notes" }), /-(rule\d+|dot\d+-\d+|grid-[hv]\d+|start\d+)$/).length === 0, "the default is blank");
}

// --- hours -----------------------------------------------------------------
{
  const props = hourlyPropsFromSettings({ dayCount: 3, dayLabels: [{ name: "SUNDAY" }, { name: "MONDAY" }, { name: "TUESDAY" }], events: [] }, DEFAULT_HOURLY_SETTINGS);
  const times = (extra: Record<string, unknown>) => texts(draw("hourly-grid-core", { ...props, ...extra }, 18, 20), /-time$/);
  const twelve = times({});
  check(twelve.includes("1:00") && !twelve.includes("13:00"), "12-hour by default, as the reference");
  const twentyFour = times({ timeFormat: "24" });
  check(twentyFour.includes("13:00") && twentyFour.includes("05:30"), `24-hour reads 05:30 and 13:00 (got ${twentyFour.slice(0, 3).join(",")}...)`);
  check(twentyFour.every((t) => t.length === 5), "every 24-hour label is five characters, so they set at one size");
  const borders = ids(draw("hourly-grid-core", { ...props, dayBorder: true }, 18, 20), /-border$/).length;
  check(borders === 3, `a border round each of three days (got ${borders})`);
  check(ids(draw("hourly-grid-core", props, 18, 20), /^m-d\d-border$/).length === 0, "none by default");
  const settings = hourlyPropsFromSettings({}, { ...DEFAULT_HOURLY_SETTINGS, hourLineStyle: "gone", dayBorder: true, timeFormat: "24" });
  check(settings.hourLineStyle === "gone" && settings.dayBorder === true && settings.timeFormat === "24", "the journal-wide settings write all three to every grid");
}

// --- to-do -------------------------------------------------------------------
{
  const items = ["Passport", "Tickets", "Chargers"];
  const one = draw("todo-checklist", { heading: "Packing", dayCount: 1, items }, 6, 8);
  check(texts(one, /-row\d+-item$/).join(",") === items.join(","), `printed items print in order (got ${texts(one, /-row\d+-item$/).join(",")})`);
  const two = draw("todo-checklist", { heading: "Routine", dayCount: 2, items }, 12, 8);
  check(ids(two, /^m-d1-row\d+-item$/).length === 3, "each day column prints the same list");
  const numbered = draw("todo-checklist", { heading: "Six Tasks", dayCount: 1, numbered: true }, 6, 7);
  const numbers = texts(numbered, /-row\d+-number$/);
  check(numbers.join(",") === "1,2,3,4,5,6", `Ivy Lee's six are numbered 1 to 6 (got ${numbers.join(",")})`);
  const both = draw("todo-checklist", { heading: "Six", dayCount: 1, numbered: true, items: ["One"] }, 6, 7);
  const number = ids(both, /-row0-number$/)[0];
  const item = ids(both, /-row0-item$/)[0];
  check(!!number && !!item && (item.x ?? 0) > (number.x ?? 0), "a numbered item sets after its number");
  check(ids(draw("todo-checklist", { heading: "To - Do", dayCount: 1 }, 6, 8), /-(item|number)$/).length === 0, "the default prints neither");
  // Dashed rows print their items and numbers too - they skipped them.
  const dashed = draw("todo-checklist", { heading: "Packing", dayCount: 1, lineStyle: "crosses", items, numbered: true }, 6, 8);
  check(texts(dashed, /-row\d+-item$/).join(",") === items.join(",") && ids(dashed, /-row\d+-number$/).length > 0, "dashed rows print items and numbers");

  // The tick mark: the column by default; a square or a circle in its place.
  const column = draw("todo-checklist", { heading: "To - Do", dayCount: 1 }, 6, 6);
  check(ids(column, /-checkbox-right$/).length === 1 && ids(column, /-tick$/).length === 0, "a ruled tick column by default");
  for (const shape of ["square", "circle"]) {
    const marked = draw("todo-checklist", { heading: "To - Do", dayCount: 1, tickMark: shape }, 6, 6);
    const ticks = ids(marked, /-row\d+-tick$/);
    const rows = ids(column, /-row\d+$/).length;
    check(ids(marked, /-checkbox-right$/).length === 0 && ticks.length >= rows, `a ${shape} on every row instead (${ticks.length})`);
    const border = ids(marked, /-border$/)[0];
    const cellRight = ids(column, /-checkbox-right$/)[0];
    const centre = (ticks[0].x ?? 0) + (ticks[0].width ?? 0) / 2;
    check(Math.abs(centre - ((border.x ?? 0) + (cellRight.x ?? 0)) / 2) < 1.5, `centred in the cell it replaces (${centre.toFixed(1)})`);
  }
  check(ids(draw("todo-checklist", { heading: "To - Do", dayCount: 1, lineStyle: "crosses", tickMark: "circle" }, 6, 6), /-checkbox-right-/).length === 0, "dashed marks no tick column either");
  const floor = (props: Record<string, unknown>) => getMinRowSpanForSlug("todo-checklist", PAGE, 6, props);
  check(floor({ items: ["a", "b", "c", "d", "e", "f"] }) > floor({}), "six printed items need more rows than a blank list");
  check(floor({ items: ["a", " ", ""] }) === floor({ items: ["a"] }), "blank items do not count");
}

// --- habits ------------------------------------------------------------------
{
  const habits = ["Read", "Walk", "Water"];
  const grid = draw("habit-tracker", { heading: "Habits", habits }, 18, 6);
  check(ids(grid, /-day\d-rule$/).length === 6, "the grid rules every day column");
  check(ids(grid, /-mark$/).length === 0, "and marks nothing");
  const circles = draw("habit-tracker", { heading: "Habits", habits, cells: "circles" }, 18, 6);
  check(ids(circles, /-day\d-rule$/).length === 0, "circles take the column rules away");
  const rings = ids(circles, /^m-row\d+-day\d-mark$/);
  check(rings.length > 0 && rings.length % 7 === 0 && rings.every((r) => Number(r.cornerRadius ?? 0) > 0), `a circle in every day cell (${rings.length})`);
  check(ids(circles, /^m-row\d+$/).length === ids(grid, /^m-row\d+$/).length, "the row rules stay");
  const dots = draw("habit-tracker", { heading: "Habits", habits, cells: "dots" }, 18, 6);
  check(ids(dots, /-mark$/).length === 0 && ids(dots, /-day\d-rule$/).length === 6, "dots were turned down: anything but circles is the grid");
  const compact = draw("habit-tracker", { heading: "Habits", habits, cells: "circles" }, 6, 8);
  check(ids(compact, /-pair\d+-day\d-mark$/).length > 0 && ids(compact, /-pair\d+-day\d-rule$/).length === 0, "the sidebar layout rings its letters too");

  const total = draw("habit-tracker", { heading: "Habits", habits, totalColumn: true }, 18, 6);
  const label = ids(total, /-total-letter$/)[0];
  check(label?.text === "TOTAL", `a TOTAL column (got ${label?.text})`);
  const letters = ids(total, /-day\d-letter$/);
  check(letters.length === 7 && letters.every((l) => Math.abs((l.width ?? 0) - (ids(grid, /-day0-letter$/)[0].width ?? 0)) < 0.5), "the week keeps its one-cell columns");
  check((label?.width ?? 0) >= 2 * PITCH - 0.5, "the total is two cells wide");
  check(ids(draw("habit-tracker", { heading: "Habits", habits, totalColumn: true }, 6, 8), /-total-/).length === 0, "not in the sidebar layout");
}

// --- table -----------------------------------------------------------------
{
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const cells = wholeCellColumns([1, 1.6, 1], 10)!;
  check(sum(cells) === 10 && cells.every((c) => c >= 1), `whole cells summing to the table (got ${cells})`);
  check(wholeCellColumns([2, 5, 3], 10)!.join() === "2,5,3", "dragged cells come back as they were");
  check(wholeCellColumns([2, 5, 3], 20)!.join() === "4,10,6", "and scale with the table");
  check(wholeCellColumns([1, 1, 1, 1], 3) === null, "more columns than cells cannot land on the lattice");
  check(wholeCellColumns([100, 1, 1], 6)!.every((c) => c >= 1), "every column keeps at least one cell");

  const props = { heading: "Log", columns: ["Date", "Item", "Amount"], weights: [1, 1.6, 1] };
  const divX = (elements: RenderedPolotnoElement[]) =>
    ids(elements, /-c\d-divider$/).map((e) => ((e.x ?? 0) + (e.width ?? 0) / 2 - PAGE.marginPx) / PITCH);
  const auto = divX(draw("column-table", props, 10, 7));
  check(auto.every((x) => Math.abs(x - Math.round(x)) < 1e-6), `every divider on a lattice column (got ${auto.map((x) => x.toFixed(2))})`);
  const dragged = divX(draw("column-table", { ...props, cellWidths: [2, 5, 3] }, 10, 7));
  check(dragged.map((x) => Math.round(x)).join() === "2,7", `dragged widths put the dividers at 2 and 7 cells (got ${dragged})`);
  const wide = divX(draw("column-table", { ...props, cellWidths: [2, 5, 3] }, 20, 7));
  check(wide.map((x) => Math.round(x)).join() === "4,14", `and at 4 and 14 when the table is twice as wide (got ${wide})`);
  const stale = divX(draw("column-table", { ...props, cellWidths: [2, 8] }, 10, 7));
  check(stale.join() === auto.join(), "widths for a different number of columns are ignored");

  const rowsOf = (extra: Record<string, unknown>) => draw("column-table", { ...props, ...extra }, 10, 7);
  const lined = ids(rowsOf({}), /-row\d+-rule$/).length;
  check(lined > 0, "lined by default");
  const dotted = rowsOf({ rows: "dotted" });
  check(ids(dotted, /-row\d+-rule$/).length === 0 && ids(dotted, /-dot\d+-\d+$/).length > 0, "dotted rows are dots, not rules");
  const dividers = ids(dotted, /-c\d-divider$/).map((e) => (e.x ?? 0) + (e.width ?? 0) / 2);
  check(ids(dotted, /-dot\d+-\d+$/).every((d) => dividers.every((x) => Math.abs((d.x ?? 0) + (d.width ?? 0) / 2 - x) > 1)), "no dot on a divider");
  check(ids(rowsOf({ rows: "none" }), /-(row\d+-rule|dot\d+-\d+)$/).length === 0, "blank rows are blank");
  const totals = rowsOf({ rows: "none", totalsRow: true });
  check(ids(totals, /-row\d+-rule$/).length === 1, "a totals row stays ruled off in a blank table");

  const numbered = draw("column-table", { ...props, rowNumbers: true }, 10, 7);
  const numbers = texts(numbered, /-row\d+-number$/);
  check(numbers[0] === "1" && numbers.length >= 4, `rows numbered from 1 (got ${numbers.join(",")})`);
  check(ids(numbered, /-number-divider$/).length === 0, "the number column draws no line of its own");
  const firstDivider = ids(numbered, /-c1-divider$/)[0];
  const unnumbered = ids(draw("column-table", props, 10, 7), /-c1-divider$/)[0];
  check(!!firstDivider && !!unnumbered && (firstDivider.x ?? 0) > (unnumbered.x ?? 0), "but keeps its cell: the table's own columns start one cell in");
  const one = ids(numbered, /-row0-number$/)[0];
  check(!!one && Math.abs((one.x ?? 0) + (one.width ?? 0) / 2 - (PAGE.marginPx + PITCH / 2)) < PITCH / 2, "the numbers sit in that first cell");
  check(ids(numbered, /-c0-head$/)[0]?.text === "Date", "the table's own columns keep their heads");
}

// --- prompts -----------------------------------------------------------------
{
  const base = { heading: "Reflection", prompts: ["What went well?", "What would I change?"], linesPerPrompt: 2 };
  const lines = (props: Record<string, unknown>, p: number) => ids(draw("prompted-lines", props, 6, 12), new RegExp(`-p${p}-line\\d+$`)).length;
  check(lines(base, 0) === 2 && lines(base, 1) === 2, "every prompt takes the default");
  const set = { ...base, promptLines: [1, 4] };
  check(lines(set, 0) === 1 && lines(set, 1) === 4, `each prompt its own count (got ${lines(set, 0)} and ${lines(set, 1)})`);
  const second = ids(draw("prompted-lines", set, 6, 12), /-p1-prompt$/)[0];
  const secondDefault = ids(draw("prompted-lines", base, 6, 12), /-p1-prompt$/)[0];
  check(!!second && !!secondDefault && Math.abs((secondDefault.y ?? 0) - (second.y ?? 0) - PITCH) < 0.5, "the next prompt moves up by exactly the cell given back");
  check(lines({ ...base, promptLines: [3] }, 1) === 2, "a prompt with no count of its own takes the default");
  const dotted = draw("prompted-lines", { ...base, answers: "dotted" }, 6, 12);
  check(ids(dotted, /-line\d+$/).length === 0 && ids(dotted, /-p\d-dot\d+-\d+$/).length > 0, "dotted answers are dots");
  check(ids(draw("prompted-lines", { ...base, answers: "none" }, 6, 12), /-(line\d+|dot\d+-\d+)$/).length === 0, "blank answers are blank");
  const numbered = draw("prompted-lines", { ...base, numbered: true }, 6, 12);
  check(texts(numbered, /-p\d-number$/).join(",") === "1,2", "numbered 1 and 2");
  const n = ids(numbered, /-p0-number$/)[0];
  const q = ids(numbered, /-p0-prompt$/)[0];
  check(!!n && !!q && (q.x ?? 0) > (n.x ?? 0), "each prompt sets after its number");
  const floor = (props: Record<string, unknown>) => getMinRowSpanForSlug("prompted-lines", PAGE, 6, props);
  check(floor({ linesPerPrompt: 2, promptLines: [5] }) > floor({ linesPerPrompt: 2 }), "the floor follows the first prompt's own count");
}

// --- mini month --------------------------------------------------------------
{
  const jan = { year: 2026, month: 1, heading: "" };
  const plain = draw("mini-month", jan, 6, 8);
  check(ids(plain, /-(box|ring)$/).length === 0, "no marks by default");
  const rings = ids(draw("mini-month", { ...jan, mark: "ring" }, 6, 8), /-ring$/);
  check(rings.length === ids(plain, /-date$/).length, `a ring round every date (${rings.length})`);
  check(ids(draw("mini-month", { ...jan, mark: "box" }, 6, 12), /-box$/).length > 0, "boxes as before");
  check(ids(draw("mini-month", { ...jan, markable: true }, 6, 12), /-box$/).length > 0, "the old markable still draws boxes");
  check(ids(draw("mini-month", { ...jan, markable: true, mark: "none" }, 6, 12), /-box$/).length === 0, "and mark wins over it");
  const hidden = draw("mini-month", { ...jan, neighbours: false }, 6, 8);
  check(texts(hidden, /-date$/).length === 31, `hiding the neighbours leaves January's 31 (got ${texts(hidden, /-date$/).length})`);
  check(texts(plain, /-date$/).length > 31, "they show by default");
  const floor = (props: Record<string, unknown>) => getMinRowSpanForSlug("mini-month", PAGE, 6, props);
  check(floor({ mark: "ring" }) === floor({ mark: "box" }) && floor({ mark: "ring" }) > floor({}), "a ring takes a whole row per week, as a box does");
  // THE DATE FITS IN ITS RING: two digits, measured, inside the ring's
  // inner diameter with room either side.
  const ringed = draw("mini-month", { ...jan, mark: "ring" }, 6, 12);
  const ring = ids(ringed, /-w2-d\d-ring$/)[0];
  const date = ids(ringed, /-w2-d\d-date$/).find((d) => String(d.text).length === 2);
  if (ring && date) {
    const inner = (ring.width ?? 0) - 2 * Number(ring.strokeWidth ?? 0);
    const inkWidth = textWidthPx(String(date.text), Number(date.fontSize), String(date.fontFamily));
    check(inkWidth < inner * 0.8, `a two-digit date fits its ring (${inkWidth.toFixed(0)}px in ${inner.toFixed(0)}px)`);
  } else check(false, "a ringed month draws rings and dates");
  check(withCurrentSettings("mini-month", { markable: true }).mark === "box", "the editor opens an old boxed month on Box");
  check(withCurrentSettings("labeled-box", { ruled: true }).rule === "lined", "and an old ruled note box on Lined");
}

// --- meter ---------------------------------------------------------------------
{
  const base = { heading: "Progress", total: 20, milestoneEvery: 5 };
  const labels = (props: Record<string, unknown>) => texts(draw("progress-meter", { ...base, ...props }, 12, 4), /-label$/);
  check(labels({ numbered: true }).join(",") === "5,10,15,20", `milestones as before (got ${labels({ numbered: true }).join(",")})`);
  check(labels({ numbers: "none" }).length === 0, "none");
  const every = labels({ numbers: "every" });
  check(every.length === 20 && every[0] === "1" && every[19] === "20", `every segment numbered 1 to 20 (got ${every.length})`);
  check(labels({ numbered: false, numbers: "every" }).length === 20, "numbers wins over the old numbered");
  const circles = ids(draw("progress-meter", { ...base, segments: "circles" }, 12, 4), /-seg\d+$/);
  check(circles.length === 20 && circles.every((c) => Number(c.cornerRadius ?? 0) > 0), "twenty circles");
  const bar = draw("progress-meter", { ...base, segments: "bar" }, 12, 4);
  check(ids(bar, /-bar\d+$/).length === 1 && ids(bar, /-seg\d+$/).length === 0 && ids(bar, /-tick\d+$/).length === 16 && ids(bar, /-div\d+$/).length === 3, "one bar, ticked faintly, with a full line at each milestone");

  // BOXES: one outline per row, a faint line between segments and a full-ink
  // one - no heavier - at each milestone (asked 2026-09-30).
  const boxes = draw("progress-meter", base, 12, 4);
  const dividers = ids(boxes, /-div\d+$/);
  check(ids(boxes, /-row\d+-box$/).length === 1 && ids(boxes, /-seg\d+$/).length === 0, "the row is one outlined strip");
  check(dividers.length === 19, `a line between each of twenty segments (got ${dividers.length})`);
  const milestoneLines = dividers.filter((d) => (d.opacity ?? 1) === 1).map((d) => Number(String(d.id).replace(/^.*-div/, "")));
  check(milestoneLines.join(",") === "5,10,15", `full ink at 5, 10 and 15 (got ${milestoneLines.join(",")})`);
  check(dividers.filter((d) => (d.opacity ?? 1) < 1).every((d) => (d.opacity ?? 1) <= 0.35), "and faint between");
  const widths = new Set(dividers.map((d) => Number(d.width).toFixed(3)));
  check(widths.size === 1, "a milestone line is no thicker than the others");
  const ends = texts(draw("progress-meter", { ...base, startLabel: "$0", endLabel: "Goal" }, 12, 4), /-(start|end)-label$/);
  check(ends.join(",") === "$0,Goal", `start and end labels (got ${ends.join(",")})`);
  check(withCurrentSettings("progress-meter", { numbered: false }).numbers === "none", "the editor opens an old unnumbered meter on None");
}

// --- icon strip --------------------------------------------------------------
{
  const base = { heading: "Water", icon: "droplet", count: 8 };
  check(ids(draw("icon-strip", base, 12, 2), /-border$/).length === 0, "open by default");
  check(ids(draw("icon-strip", { ...base, border: true }, 12, 2), /-border$/).length === 1, "boxed when asked");
  const labels = texts(draw("icon-strip", { ...base, stripLabels: ["Water", "Tea"] }, 12, 3), /-s\d-heading$/);
  check(labels.join(",") === "WATER,TEA,WATER", `each strip its own label, the heading where it has none (got ${labels.join(",")})`);
  const days = texts(draw("icon-strip", { ...base, groupLabels: "days" }, 18, 2), /-g\d-day$/);
  check(days.join(",") === "SUN,MON,TUE", `day names over the groups (got ${days.join(",")})`);
  const monday = texts(draw("icon-strip", { ...base, groupLabels: "days", weekStartDay: 1 }, 18, 2), /-g\d-day$/);
  check(monday[0] === "MON", "in the journal's week order");
  check(ids(draw("icon-strip", { ...base, groupLabels: "days" }, 18, 2), /-s1-.*day$/).length === 0, "on the first strip only");
  // THE DAY NAME GIVES WAY BEFORE THE ROW'S LABEL: three days in a sidebar
  // cut "WATER" to "WA..." beside a full SUN (2026-09-30).
  const line = (props: Record<string, unknown>, columns: number) =>
    texts(draw("icon-strip", { ...base, count: 2, groupLabels: "days", ...props }, columns, 2), /-s0-heading$|-g\d-day$/).join(",");
  check(line({ groups: 3 }, 6) === "WATER,S,M,T", `three days in a sidebar keep WATER whole, as initials (got ${line({ groups: 3 }, 6)})`);
  check(line({ groups: 1 }, 6) === "WATER,SUN", `one day in a sidebar keeps its short name (got ${line({ groups: 1 }, 6)})`);
  check(line({ groups: 3 }, 18) === "WATER,SUN,MON,TUE", `wide days keep their short names (got ${line({ groups: 3 }, 18)})`);

  // An icon for each row and each day. Which shape a mark is, is read back
  // by drawing every shape in its place and seeing which one it is.
  const shapeOf = (e: RenderedPolotnoElement) =>
    GLYPH_SHAPES.find((shape) => {
      const again = glyphElement({ id: "", x: e.x ?? 0, y: e.y ?? 0, sizePx: e.width ?? 0, shape }) as { pathD?: string; cornerRadius?: number };
      const mark = e as { pathD?: string; cornerRadius?: number };
      return again.pathD === mark.pathD && again.cornerRadius === mark.cornerRadius;
    }) ?? "?";
  const shapes = (elements: RenderedPolotnoElement[], pattern: RegExp) => ids(elements, pattern).map(shapeOf);
  const plain = draw("icon-strip", base, 18, 3);
  check(shapes(plain, /-i\d+$/).every((shape) => shape === "droplet"), "without either, every icon is the module's");
  const rows = draw("icon-strip", { ...base, stripIcons: ["", "leaf"] }, 18, 3);
  check(shapes(rows, /-s0-g\d+-i\d+$/).every((shape) => shape === "droplet"), "a blank row falls through to the module's icon");
  check(shapes(rows, /-s1-g\d+-i\d+$/).every((shape) => shape === "leaf"), `a row's own icon across the row (got ${[...new Set(shapes(rows, /-s1-/))].join(",")})`);
  check(shapes(rows, /-s2-g\d+-i\d+$/).every((shape) => shape === "droplet"), "a row past the list keeps the module's icon");
  const both = draw("icon-strip", { ...base, stripIcons: ["", "leaf"], groupIcons: ["star", "", "nonsense"] }, 18, 3);
  check(shapes(both, /-s\d-g0-i\d+$/).every((shape) => shape === "star"), "a day's own icon wins down its column, over a row's");
  check(shapes(both, /-s1-g1-i\d+$/).every((shape) => shape === "leaf"), "a blank day keeps the row's");
  check(shapes(both, /-s0-g2-i\d+$/).every((shape) => shape === "droplet"), "a name that is not a shape is ignored");
  check(ids(both, /-i\d+$/).length === ids(plain, /-i\d+$/).length, "the icons change shape, never number or place");
}

// --- ratings -----------------------------------------------------------------
{
  const base = { heading: "Ratings", items: ["Mood", "Energy"], scaleMin: 1, scaleMax: 5 };
  const hearts = ids(draw("rating-strip", { ...base, shape: "heart" }, 6, 6), /-i\d-v\d$/);
  check(hearts.length === 10 && hearts.every((h) => typeof h.pathD === "string"), "hearts are drawn as the glyph");
  check(ids(draw("rating-strip", { ...base, shape: "nonsense" }, 6, 6), /-i\d-v\d$/).every((m) => Number(m.cornerRadius ?? 0) > 0), "an unknown mark is a circle");
  const numbers = texts(draw("rating-strip", base, 6, 6), /-scale\d+$/);
  check(numbers.join(",") === "1,2,3,4,5", "numbers above by default");
  const words = draw("rating-strip", { ...base, scaleHead: "words", lowLabel: "awful", highLabel: "great" }, 6, 6);
  check(texts(words, /-scale\d+$/).length === 0 && texts(words, /-scale-(low|high)$/).join(",") === "awful,great", "words at the ends instead");
  check(texts(draw("rating-strip", { ...base, scaleHead: "words" }, 6, 6), /-scale-(low|high)$/).join(",") === "low,high", "low and high when none are given");
  const inside = draw("rating-strip", { ...base, scaleHead: "inside" }, 6, 6);
  check(texts(inside, /-scale\d+$/).length === 0 && texts(inside, /-i0-v\d-number$/).join(",") === "1,2,3,4,5", "or the numbers inside the marks");
}

// --- matrix --------------------------------------------------------------------
{
  const eis = { heading: "Eisenhower", xLeft: "Not urgent", xRight: "Urgent", yTop: "Vital", yBottom: "Minor", quadrants: ["Schedule", "Do", "Delete", "Delegate"] };
  const large = draw("axis-matrix", eis, 12, 9);
  const big = ids(large, /-q-(tl|tr|bl|br)$/);
  const small = ids(draw("axis-matrix", { ...eis, boxNames: "small" }, 12, 9), /-q-(tl|tr|bl|br)$/);
  check(small.length === 4 && small.every((q, i) => Number(q.fontSize) < Number(big[i].fontSize) && q.align === "left"), "small names sit left, smaller than the large ones");
  check(ids(draw("axis-matrix", { ...eis, boxNames: "small", quadrants: ["", "", "", ""] }, 12, 9), /-q-(tl|tr|bl|br)$/).length === 0, "an unnamed box prints no placeholder when small");
  const lined = draw("axis-matrix", { ...eis, boxNames: "small", inside: "lined" }, 12, 9);
  check(["tl", "tr", "bl", "br"].every((q) => ids(lined, new RegExp(`-q-${q}-rule\\d+$`)).length > 0), "lines in all four boxes");
  const cross = ids(lined, /-cross-h$/)[0];
  const crossY = (cross.y ?? 0) + (cross.height ?? 0) / 2;
  check(ids(lined, /-q-\w+-rule\d+$/).every((r) => Math.abs((r.y ?? 0) + (r.height ?? 0) / 2 - crossY) > 1), "never on the cross");
  check(ids(draw("axis-matrix", { ...eis, inside: "dotted" }, 12, 9), /-dot\d+-\d+$/).length > 0, "or dots");
  const bare = draw("axis-matrix", { ...eis, axisLabels: false }, 12, 9);
  check(ids(bare, /-(x-left|x-right|y-top-l\d+|y-bottom-l\d+)$/).length === 0, "axis labels hidden");
  const bareCross = ids(bare, /-cross-h$/)[0];
  const box = ids(bare, /-border$/)[0];
  check(Math.abs((bareCross.width ?? 0) - (box.width ?? 0)) < 0.5, "and the cross takes the whole width");
}

// --- text --------------------------------------------------------------------
{
  const quote = { heading: "", body: "A journey of a thousand miles begins with a single step.", attribution: "after Lao Tzu", align: "center" };
  const size = (s: string) => Number(ids(draw("text-block", { ...quote, size: s }, 12, 5), /-line0$/)[0]?.fontSize ?? 0);
  check(size("small") < size("regular") && size("regular") < size("large"), "three sizes, in order");
  check(ids(draw("text-block", quote, 12, 5), /-border$/).length === 1, "boxed by default");
  check(ids(draw("text-block", { ...quote, frame: "open" }, 12, 5), /-border(-top|-bottom)?$/).length === 0, "open");
  check(ids(draw("text-block", { ...quote, frame: "rules" }, 12, 5), /-border-(top|bottom)$/).length === 2, "or a rule above and below");
  const floor = (s: string) => getMinRowSpanForSlug("text-block", PAGE, 6, { ...quote, size: s });
  check(floor("large") > floor("small"), "large type needs more room");
}

// --- month calendar ----------------------------------------------------------
{
  const month = {
    dayCount: 3,
    dayLabels: [{ name: "SUNDAY" }, { name: "MONDAY" }, { name: "TUESDAY" }],
    weekCount: 5,
    cells: Array.from({ length: 5 }, (_, w) => Array.from({ length: 3 }, (_, d) => ({ date: w * 7 + d + 1, inCurrentMonth: true }))),
  };
  const plain = draw("month-grid-core", month, 18, 16);
  check(ids(plain, /-(rule|dot)\d+(-\d+)?$/).filter((e) => /-w\d-d\d-/.test(String(e.id))).length === 0, "blank days by default");
  const lined = draw("month-grid-core", { ...month, inside: "lined" }, 18, 16);
  const lines = ids(lined, /-w\d-d\d-rule\d+$/);
  check(lines.length > 0 && ids(lined, /^m-w0-d2-rule\d+$/).length > 0, `lines in every day (${lines.length})`);
  const strips = ids(lined, /-w\d-strip-rule$/).map((e) => (e.y ?? 0) + (e.height ?? 0) / 2);
  check(lines.every((l) => strips.every((y) => Math.abs((l.y ?? 0) + (l.height ?? 0) / 2 - y) > 1)), "never on a date strip");
  check(ids(draw("month-grid-core", { ...month, inside: "dotted" }, 18, 16), /-dot\d+-\d+$/).length > 0, "or dots");
}
