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

  const two = draw("labeled-box", { heading: "Notes", rule: "lined", columns: 2 }, 12, 6);
  const divider = ids(two, /-column-rule$/)[0];
  check(!!divider, "two columns draw a divider");
  if (divider) {
    const x = (divider.x ?? 0) + (divider.width ?? 0) / 2;
    check(onColumn(x), "on a lattice column");
    const box = ids(two, /-border$/)[0];
    check(Math.abs(x - ((box.x ?? 0) + (box.width ?? 0) / 2)) <= PITCH / 2, "nearest the middle");
  }
  check(ids(two, /-c0-rule\d+$/).length > 0 && ids(two, /-c1-rule\d+$/).length === ids(two, /-c0-rule\d+$/).length, "both halves are ruled alike");
  check(ids(draw("labeled-box", { heading: "Notes", rule: "lined", columns: 2 }, 3, 6), /-column-rule$/).length === 0, "too narrow for two columns draws one");

  const numbered = draw("labeled-box", { heading: "Notes", rule: "lined", lineStart: "numbers" });
  const numbers = texts(numbered, /-start\d+$/);
  check(numbers.length === rules && numbers[0] === "1" && numbers[numbers.length - 1] === String(rules), `a number on every line, 1 to ${rules} (got ${numbers.join(",")})`);
  check(ids(draw("labeled-box", { heading: "Notes", rule: "lined", lineStart: "bullets" }), /-start\d+$/).length === rules, "a bullet on every line");
  check(ids(draw("labeled-box", { heading: "Notes", rule: "none", lineStart: "numbers" }), /-start\d+$/).length === 0, "a blank box has no lines to start");
  check(ids(draw("labeled-box", { heading: "Notes", rule: "graph", lineStart: "numbers" }), /-start\d+$/).length === 0, "nor does graph paper");

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
  check(ids(dots, /-mark$/).length === rings.length, "a dot where each circle would be");
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
  const numberDivider = ids(numbered, /-number-divider$/)[0];
  check(!!numberDivider && Math.abs(((numberDivider.x ?? 0) + (numberDivider.width ?? 0) / 2 - PAGE.marginPx) / PITCH - 1) < 1e-6, "in a one-cell column on the lattice");
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
  check(floor({ mark: "box" }) > floor({ mark: "ring" }), "a box needs its row; a ring does not");
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
  check(ids(bar, /-bar\d+$/).length === 1 && ids(bar, /-seg\d+$/).length === 0 && ids(bar, /-tick\d+$/).length === 19, "one bar, ticked at the other nineteen");
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
