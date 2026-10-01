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
import { progressMeterColumns, progressMeterLayout } from "./modules/progressMeter";
import { habitTrackerWideColumns, isHabitTrackerCompact } from "./modules/habitTracker";

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

  // ROOM TO WRITE (2026-10-01, for horizontal resizing): the sidebar layout
  // only when the wide one's name column would be under an inch. A week at
  // one day is the sidebar layout; at two days it is the wide one, with an
  // inch and more for names - it was two rows a habit there, a 3in name
  // line over seven oversized squares.
  const inch = 300;
  const widthAt = (days: number) => days * 6 * PITCH - 12;
  check(isHabitTrackerCompact(widthAt(1)), "a week at one day is the sidebar layout");
  for (const days of [2, 3, 4]) {
    const name = habitTrackerWideColumns(widthAt(days)).nameColumnWidth;
    check(!isHabitTrackerCompact(widthAt(days)) && name >= inch, `a week at ${days} days is the wide layout, ${(name / inch).toFixed(2)}in for names`);
  }
  const twoDays = draw("habit-tracker", { heading: "Habits", habits }, 12, 6);
  check(ids(twoDays, /-pair\d+-/).length === 0 && ids(twoDays, /^m-row\d+$/).length > 0, "and draws it: a row a habit, the week beside the names");
  // The test is the column, so labels that need wider columns tip a tracker
  // into the sidebar layout sooner: five prayers by name at two days.
  const prayers = { columns: ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] };
  check(habitTrackerWideColumns(widthAt(2), prayers).nameColumnWidth < inch && isHabitTrackerCompact(widthAt(2), prayers), "five named prayers at two days leave under an inch, so the sidebar layout");
  check(!isHabitTrackerCompact(widthAt(3), prayers), "and at three days, the wide one");
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
  // THE BOX IS THE DAY'S CELL (2026-10-01): a box round every day of the
  // month with its date inside, touching the next on every side, and no
  // line anywhere else - not over a neighbouring month's faint day, not on
  // the module's own sides, and no edge drawn twice.
  const boxed = draw("mini-month", { ...jan, mark: "box" }, 6, 12);
  const edges = ids(boxed, /-grid-[hv]\d+-\d+$/);
  check(edges.length > 0 && ids(boxed, /-box$/).length === 0, "a grid of edges, not a small box under each date");
  const border = ids(boxed, /-border$/)[0];
  const left = border.x ?? 0;
  const right = left + (border.width ?? 0);
  const col = (border.width ?? 0) / 7;
  const covers = (horizontal: boolean, at: number, from: number, to: number) =>
    edges.some((e) => {
      const isH = (e.width ?? 0) > (e.height ?? 0);
      if (isH !== horizontal) return false;
      const pos = horizontal ? (e.y ?? 0) + (e.height ?? 0) / 2 : (e.x ?? 0) + (e.width ?? 0) / 2;
      const start = horizontal ? e.x ?? 0 : e.y ?? 0;
      const end = start + (horizontal ? e.width ?? 0 : e.height ?? 0);
      return Math.abs(pos - at) < 0.5 && start <= from + 0.5 && end >= to - 0.5;
    });
  const january = ids(boxed, /-w\d-d\d-date$/).filter((e) => (e.opacity ?? 1) === 1);
  check(january.length === 31, `January's 31 days (got ${january.length})`);
  const closed = january.every((d) => {
    const x0 = d.x ?? 0;
    const x1 = x0 + (d.width ?? 0);
    const w = Number(/-w(\d)-/.exec(String(d.id))![1]);
    const top = edges.filter((e) => (e.width ?? 0) > (e.height ?? 0)).map((e) => (e.y ?? 0) + (e.height ?? 0) / 2).sort((a, b) => a - b);
    const rows = [...new Set(top.map((y) => Math.round(y * 10) / 10))];
    const y0 = rows[w];
    const y1 = rows[w + 1];
    const sideL = Math.abs(x0 - left) < 0.5 || covers(false, x0, y0, y1);
    const sideR = Math.abs(x1 - right) < 0.5 || covers(false, x1, y0, y1);
    return y0 !== undefined && y1 !== undefined && covers(true, y0, x0, x1) && covers(true, y1, x0, x1) && sideL && sideR;
  });
  check(closed, "every day of the month is closed on all four sides");
  const firstRowTop = Math.min(...edges.filter((e) => (e.width ?? 0) > (e.height ?? 0)).map((e) => (e.y ?? 0) + (e.height ?? 0) / 2));
  check(!covers(true, firstRowTop, left, left + col * 4), "no line over the last days of December (1 January 2026 is a Thursday)");
  check(edges.every((e) => (e.width ?? 0) > (e.height ?? 0) || (Math.abs((e.x ?? 0) - left) > 1 && Math.abs((e.x ?? 0) + (e.width ?? 0) - right) > 1)), "none on the module's own sides");
  const twice = edges.some((a, i) =>
    edges.some((b, j) => {
      if (j <= i) return false;
      const aH = (a.width ?? 0) > (a.height ?? 0);
      if (aH !== (b.width ?? 0) > (b.height ?? 0)) return false;
      const pa = aH ? a.y ?? 0 : a.x ?? 0;
      const pb = aH ? b.y ?? 0 : b.x ?? 0;
      if (Math.abs(pa - pb) > 0.5) return false;
      const [s1, e1] = aH ? [a.x ?? 0, (a.x ?? 0) + (a.width ?? 0)] : [a.y ?? 0, (a.y ?? 0) + (a.height ?? 0)];
      const [s2, e2] = aH ? [b.x ?? 0, (b.x ?? 0) + (b.width ?? 0)] : [b.y ?? 0, (b.y ?? 0) + (b.height ?? 0)];
      return s1 < e2 - 0.5 && s2 < e1 - 0.5;
    })
  );
  check(!twice, "no edge is drawn twice");
  check(ids(draw("mini-month", { heading: "", mark: "box" }, 6, 12), /-grid-v\d+-\d+$/).length === 6, "an undated month boxes every place: six full-height column lines");
  check(ids(draw("mini-month", { ...jan, markable: true }, 6, 12), /-grid-/).length > 0, "the old markable draws the grid");
  check(ids(draw("mini-month", { ...jan, markable: true, mark: "none" }, 6, 12), /-grid-/).length === 0, "and mark wins over it");
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
  // Twenty at 12x4 fill it as two rows of ten (the meter fills its module,
  // 2026-10-01): a bar a row, ticked faintly, a full line at the milestone
  // inside each row - 10 is where the second row starts.
  check(ids(bar, /-bar\d+$/).length === 2 && ids(bar, /-seg\d+$/).length === 0 && ids(bar, /-tick\d+$/).length === 16 && ids(bar, /-div\d+$/).length === 2, `a bar a row, ticked faintly, with a full line at each milestone (got ${ids(bar, /-bar\d+$/).length} bars, ${ids(bar, /-tick\d+$/).length} ticks, ${ids(bar, /-div\d+$/).length} lines)`);

  // BOXES: one outline per row, a faint line between segments and a full-ink
  // one - no heavier - at each milestone (asked 2026-09-30).
  const boxes = draw("progress-meter", base, 12, 4);
  const dividers = ids(boxes, /-div\d+$/);
  check(ids(boxes, /-row\d+-box$/).length === 2 && ids(boxes, /-seg\d+$/).length === 0, "each row is one outlined strip");
  check(dividers.length === 18, `a line between neighbours on a row, two rows of ten (got ${dividers.length})`);
  const milestoneLines = dividers.filter((d) => (d.opacity ?? 1) === 1).map((d) => Number(String(d.id).replace(/^.*-div/, "")));
  check(milestoneLines.join(",") === "5,15", `full ink at 5 and 15, 10 being the second row's start (got ${milestoneLines.join(",")})`);
  check(dividers.filter((d) => (d.opacity ?? 1) < 1).every((d) => (d.opacity ?? 1) <= 0.35), "and faint between");
  const widths = new Set(dividers.map((d) => Number(d.width).toFixed(3)));
  check(widths.size === 1, "a milestone line is no thicker than the others");
  const ends = texts(draw("progress-meter", { ...base, startLabel: "$0", endLabel: "Goal" }, 12, 4), /-(start|end)-label$/);
  check(ends.join(",") === "$0,Goal", `start and end labels (got ${ends.join(",")})`);
  check(withCurrentSettings("progress-meter", { numbered: false }).numbers === "none", "the editor opens an old unnumbered meter on None");
  // SIDE TO SIDE (2026-10-01): no gap between the meter and the module's
  // sides, whichever way it is drawn.
  for (const style of ["boxes", "bar", "circles"] as const) {
    const drawn = draw("progress-meter", { heading: "Goal", total: 40, segments: style }, 12, 6);
    const border = ids(drawn, /-border$/)[0];
    const left = border.x ?? 0;
    const right = left + (border.width ?? 0);
    const marks = ids(drawn, style === "circles" ? /-seg\d+$/ : style === "bar" ? /-bar\d+$/ : /-row\d+-box$/);
    const minX = Math.min(...marks.map((m) => m.x ?? 0));
    const maxX = Math.max(...marks.map((m) => (m.x ?? 0) + (m.width ?? 0)));
    if (style === "circles") {
      // A circle sits centred in its segment, and the segments run side to side.
      const centres = [...new Set(marks.map((m) => Number(((m.x ?? 0) + (m.width ?? 0) / 2).toFixed(2))))].sort((a, b) => a - b);
      const segment = centres[1] - centres[0];
      const lastCentre = Math.max(...centres);
      check(Math.abs(centres[0] - left - segment / 2) < 0.5 && Math.abs(right - lastCentre - segment / 2) < 0.5, `circles: centred in segments that run side to side (${(centres[0] - left).toFixed(1)} and ${(right - lastCentre).toFixed(1)}px in, half a segment ${(segment / 2).toFixed(1)})`);
    } else {
      check(minX - left <= 0.5 && right - maxX <= 0.5, `${style}: the meter meets both sides (gaps ${(minX - left).toFixed(1)} and ${(right - maxX).toFixed(1)}px)`);
    }
  }

  // PER ROW AND FILL (2026-10-01): "settings for how many per row or it can
  // fill the whole module the amount even as close to a grid of squares".
  const rowBoxes = (drawn: RenderedPolotnoElement[]) => ids(drawn, /-row\d+-box$/);
  const counted = (drawn: RenderedPolotnoElement[]) => rowBoxes(drawn).length + ids(drawn, /-div\d+$/).length;
  // The line kept under the rows for the start and end labels, set or not:
  // a 1.5pt gap and a line of 6pt type (1.2 of it), at 300 px to the inch.
  const LABEL_STRIP = ((1.5 + 6 * 1.2) * 300) / 72;
  const gapAtFoot = (drawn: RenderedPolotnoElement[]) => {
    const border = ids(drawn, /-border$/)[0];
    return (border.y ?? 0) + (border.height ?? 0) - Math.max(...rowBoxes(drawn).map((r) => (r.y ?? 0) + (r.height ?? 0)));
  };
  const perRowOf = (drawn: RenderedPolotnoElement[]) => {
    const first = rowBoxes(drawn)[0];
    return ids(drawn, /-div\d+$/).filter((d) => Math.abs((d.y ?? 0) - (first.y ?? 0)) < 0.5).length + 1;
  };
  // Per row: that many on each row, still side to side.
  const seven = draw("progress-meter", { heading: "Pages", total: 30, perRow: 7 }, 12, 6);
  check(rowBoxes(seven).length === 5 && perRowOf(seven) === 7 && counted(seven) === 30, `30 at 7 a row: five rows of seven (got ${rowBoxes(seven).length} rows of ${perRowOf(seven)}, ${counted(seven)} in all)`);
  const sevenBorder = ids(seven, /-border$/)[0];
  check(rowBoxes(seven).slice(0, 4).every((r) => Math.abs((r.x ?? 0) - (sevenBorder.x ?? 0)) < 0.5 && Math.abs((r.width ?? 0) - (sevenBorder.width ?? 0)) < 0.5), "each full row of seven runs side to side");
  const sevenHeights = rowBoxes(seven).map((r) => r.height ?? 0);
  check(sevenHeights.every((h) => Math.abs(h - sevenHeights[0]) < 0.01) && Math.abs(gapAtFoot(seven) - LABEL_STRIP) < 0.5, "rows of seven share the height down to the labels' strip");
  // More than fit at half a cell wide is as many as fit.
  const many = draw("progress-meter", { heading: "Pages", total: 60, perRow: 100 }, 6, 8);
  check(perRowOf(many) === progressMeterColumns(6 * PITCH - 12), `100 a row on a narrow meter is as many as fit (${perRowOf(many)} vs ${progressMeterColumns(6 * PITCH - 12)})`);
  // Fill: the count spread over the whole module, as near square as it goes.
  const filled = draw("progress-meter", { heading: "Days", total: 30 }, 12, 6);
  check(rowBoxes(filled).length === 3 && perRowOf(filled) === 10 && counted(filled) === 30, `30 filling a 12x6 meter: three rows of ten (got ${rowBoxes(filled).length} of ${perRowOf(filled)}, ${counted(filled)} in all)`);
  check(Math.abs(gapAtFoot(filled) - LABEL_STRIP) < 0.5, `and they reach the labels' strip at the foot (${gapAtFoot(filled).toFixed(1)}px short, the strip ${LABEL_STRIP.toFixed(1)})`);
  // The rows are the same whether or not the labels have words - so the
  // editor's faint "Start" and "Goal" show where their words will print, not
  // over the last row (they did, the afternoon the meter first filled).
  const worded = draw("progress-meter", { heading: "Days", total: 30, startLabel: "Day 1", endLabel: "Day 30" }, 12, 6);
  const rowsAt = (drawn: RenderedPolotnoElement[]) => rowBoxes(drawn).map((r) => `${(r.y ?? 0).toFixed(2)}+${(r.height ?? 0).toFixed(2)}`).join(" ");
  check(rowsAt(worded) === rowsAt(filled), `labels set or not, the rows do not move (${rowsAt(filled)} vs ${rowsAt(worded)})`);
  const lastFoot = Math.max(...rowBoxes(worded).map((r) => (r.y ?? 0) + (r.height ?? 0)));
  check(ids(worded, /-(start|end)-label$/).every((l) => (l.y ?? 0) >= lastFoot - 0.01), "and the labels print below the last row, clear of its numbers");
  const filledHeights = rowBoxes(filled).map((r) => r.height ?? 0);
  check(filledHeights.every((h) => Math.abs(h - filledHeights[0]) < 0.01 && h >= PITCH / 2), `the rows share the height evenly (${filledHeights.map((h) => h.toFixed(1)).join(", ")})`);
  // At the many heights a row count does not divide in half cells - the
  // first version kept to them and left as much as half the module empty.
  for (const rowSpan of [9, 10, 11, 13]) {
    const drawn = draw("progress-meter", { heading: "100 days", total: 100, milestoneEvery: 10 }, 6, rowSpan);
    check(Math.abs(gapAtFoot(drawn) - LABEL_STRIP) < 0.5 && counted(drawn) === 100, `100 filling a 6x${rowSpan} meter reaches the labels' strip (${gapAtFoot(drawn).toFixed(1)}px short, ${counted(drawn)} drawn)`);
  }
  // A hundred days with a rule every ten fills as ten rows of ten - the first
  // version chose seven rows of fifteen, the rules staggered and the last
  // row short.
  const hundred = draw("progress-meter", { heading: "100 days", total: 100, milestoneEvery: 10 }, 16, 12);
  check(rowBoxes(hundred).length === 10 && perRowOf(hundred) === 10, `100 filling a 16x12 meter, a rule every ten: ten rows of ten (got ${rowBoxes(hundred).length} of ${perRowOf(hundred)})`);
  // Where nothing else decides, the rule does: a narrow meter of a hundred
  // keeps to tens with a rule every ten, and need not without one.
  const narrow = (every: number) => progressMeterLayout(100, 6 * PITCH - 12, 732.5, { milestoneEvery: every }).columns;
  check(narrow(10) === 10 && narrow(0) !== 10, `a narrow hundred keeps to its tens (${narrow(10)} a row with a rule every ten, ${narrow(0)} without)`);
  const plain = draw("progress-meter", { heading: "100 days", total: 100, milestoneEvery: 0 }, 16, 12);
  check(100 % perRowOf(plain) === 0, `and with no rule, still no short last row (${perRowOf(plain)} a row)`);
  // A milestone at a row's end is numbered like any other.
  const tens = texts(draw("progress-meter", { heading: "100 days", total: 100, milestoneEvery: 10, perRow: 10, numbers: "milestones" }, 16, 12), /-mile\d+-label$/);
  check(tens.join(",") === "10,20,30,40,50,60,70,80,90,100", `ten a row numbers every row's end (got ${tens.join(",")})`);
  // Fill with a number per row: those columns, the rows sharing the height.
  const tenFill = draw("progress-meter", { heading: "Days", total: 40, perRow: 10 }, 12, 8);
  check(rowBoxes(tenFill).length === 4 && perRowOf(tenFill) === 10 && (rowBoxes(tenFill)[0].height ?? 0) > PITCH / 2, `40 at 10 a row, filling: four taller rows of ten (got ${rowBoxes(tenFill).length} of ${perRowOf(tenFill)})`);
  // The end labels keep their room.
  const labelled = draw("progress-meter", { heading: "Days", total: 30, startLabel: "Start", endLabel: "Goal" }, 12, 6);
  const labelBorder = ids(labelled, /-border$/)[0];
  const endLabels = ids(labelled, /-(start|end)-label$/);
  check(endLabels.length === 2 && endLabels.every((l) => (l.y ?? 0) + (l.height ?? 0) <= (labelBorder.y ?? 0) + (labelBorder.height ?? 0) + 0.5), "filling, the start and end labels still print, inside the box");
  // At the smallest height it may take, a filled meter draws its whole count.
  for (const props of [{ total: 100 }, { total: 52, perRow: 13 }, { total: 45, perRow: 9 }]) {
    const rowSpan = getMinRowSpanForSlug("progress-meter", PAGE, 6, { heading: "Days", ...props });
    const drawn = draw("progress-meter", { heading: "Days", ...props }, 6, rowSpan);
    check(counted(drawn) === props.total, `${JSON.stringify(props)} at its smallest (6x${rowSpan}) draws all ${props.total} (got ${counted(drawn)})`);
  }
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
