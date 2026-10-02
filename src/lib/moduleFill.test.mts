// NOTHING EMPTY UNDER THE LAST ROW (2026-10-02). Andrew: "theres white space
// at bottom, other modules have it too btw do a sweep". A module whose body
// is rows fills its box with them at every height - the rating strip with
// blank rows to write more in, a mini month with its weeks spread to the
// border, prompted lines with the spare lines shared among the prompts, a
// day chart with its levels spread (dayChart.test has its own rules).
//
// Expected values are STATED here, not imported - a test that asks the code
// for its answer only checks the code equals itself.
//
// Run with: npx tsx src/lib/moduleFill.test.mts

import { renderModuleInstance, type RenderedPolotnoElement } from "./renderModuleInstance";
import { PROOF_PAGE as PAGE, flatten } from "./proofSvg";
import { getMinRowSpanForSlug } from "./moduleMinRowSpan";
import { gridCellToPixels } from "./grid";
import { slugsDrawnBy, moduleDefinition } from "./moduleRegistry";
import { promptLineCounts } from "./modules/promptedLines";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL ${message}`);
  }
}
process.on("exit", () => {
  if (failures > 0) {
    console.error(`\n${failures} fill check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("All fill checks passed (rating strips, mini months, prompted lines, day charts: nothing empty under the last row).");
  }
});

const CELL = 75;
function draw(slug: string, props: Record<string, unknown>, columnSpan: number, rowSpan: number): RenderedPolotnoElement[] {
  return flatten(
    renderModuleInstance(
      { id: "m", locked: false, columnStart: 0, rowStart: 0, columnSpan, rowSpan, propValues: props, moduleType: { slug } },
      PAGE
    )
  );
}
const boxOf = (columnSpan: number, rowSpan: number) => gridCellToPixels(PAGE, { columnStart: 0, rowStart: 0, columnSpan, rowSpan });
const ids = (elements: RenderedPolotnoElement[], pattern: RegExp) => elements.filter((e) => pattern.test(String(e.id)));
const bottomOf = (e: RenderedPolotnoElement) => (e.y ?? 0) + (e.height ?? 0);
const centreY = (e: RenderedPolotnoElement) => (e.y ?? 0) + (e.height ?? 0) / 2;

// --- every module that fills ---------------------------------------------------
// Under the lowest mark there is at most one row - a writing line whose rule
// is the border, or a row's own air under its marks - at the floor and as the
// box grows. Before this, a strip showed its items and then nothing, a
// calendar its weeks and then nothing, for as many rows as the box had.
{
  const filling = slugsDrawnBy("rating-strip", "mini-month", "prompted-lines", "day-chart");
  for (const slug of filling) {
    const props = moduleDefinition(slug)?.previewProps ?? {};
    for (const columnSpan of [6, 12, 24]) {
      const floor = getMinRowSpanForSlug(slug, PAGE, columnSpan, props);
      for (const rowSpan of [floor, floor + 1, floor + 2, floor + 5]) {
        const box = boxOf(columnSpan, rowSpan);
        const marks = draw(slug, props, columnSpan, rowSpan).filter(
          (e) => !/-border$/.test(String(e.id)) && Number(e.height) > 0 && (e.type !== "text" || String(e.text ?? "").trim() !== "")
        );
        const lowest = Math.max(...marks.map(bottomOf));
        const empty = (box.y + box.height - lowest) / CELL;
        check(empty < 1.2, `${slug} ${columnSpan}x${rowSpan}: ${empty.toFixed(2)} cells empty under the lowest mark`);
      }
    }
  }
}

// --- the rating strip --------------------------------------------------------------
{
  for (const n of [1, 3, 7]) {
    const props = { heading: "R", items: Array.from({ length: n }, (_, i) => `Item ${i + 1}`), scaleMin: 1, scaleMax: 5 };
    // The header, the scale and every item: a strip missing its last items
    // is a wrong strip, not a short one.
    const floor = getMinRowSpanForSlug("rating-strip", PAGE, 6, props);
    check(floor === n + 2, `a ${n}-item strip's least is ${n + 2} rows (got ${floor})`);
    const atFloor = draw("rating-strip", props, 6, floor);
    check(ids(atFloor, /-i\d+-v1$/).length === n, `at its least, all ${n} items (got ${ids(atFloor, /-i\d+-v1$/).length})`);
    // Taller: blank rows to write in, marks and all, and only the items named.
    const taller = draw("rating-strip", props, 6, floor + 2);
    check(ids(taller, /-i\d+-v1$/).length === n + 2, `two rows taller, two blank rows to write in (got ${ids(taller, /-i\d+-v1$/).length - n})`);
    check(ids(taller, /-i\d+-label$/).filter((e) => String(e.text ?? "").trim()).length === n, "only the items are named");
    const box = boxOf(6, floor + 2);
    check(ids(taller, /-i\d+-rule$/).every((e) => centreY(e) < box.y + box.height - 1), "no rule under the last row: the border is its rule");
    // The last row is the box inset short of a cell, and its circles centre
    // in what is there: as much air under them as over them ("there is very
    // little space below the last circles in the rating strip", 2026-10-02).
    for (const [what, drawing, rowSpan] of [["at its least", atFloor, floor], ["taller", taller, floor + 2]] as const) {
      const foot = boxOf(6, rowSpan).y + boxOf(6, rowSpan).height;
      const rules = ids(drawing, /-(head-rule|i\d+-rule)$/).map(centreY).sort((a, b) => a - b);
      const last = ids(drawing, /-i\d+-v1$/).sort((a, b) => (a.y ?? 0) - (b.y ?? 0)).pop()!;
      const above = (last.y ?? 0) - rules[rules.length - 1];
      const below = foot - bottomOf(last);
      check(Math.abs(above - below) < 0.5, `${n} items ${what}: the last circles have as much air below as above (${above.toFixed(1)} over, ${below.toFixed(1)} under)`);
    }
  }
}

// --- the mini month ------------------------------------------------------------------
// The month's own weeks share the box's height, so the last week ends at the
// border - four, five or six of them, or an undated month's.
{
  const months: Array<[string, Record<string, unknown>, number]> = [
    ["February 2026 (four weeks)", { year: 2026, month: 2 }, 4],
    ["October 2026 (five)", { year: 2026, month: 10 }, 5],
    ["August 2026 (six)", { year: 2026, month: 8 }, 6],
    ["an undated month", { year: 0, month: 0 }, 5],
  ];
  for (const slug of slugsDrawnBy("mini-month")) {
    const base = moduleDefinition(slug)?.previewProps ?? {};
    for (const [what, month, weeks] of months) {
      const props = { ...base, ...month };
      const floor = getMinRowSpanForSlug(slug, PAGE, 6, props);
      for (const rowSpan of [floor, floor + 3]) {
        const box = boxOf(6, rowSpan);
        const chart = draw(slug, props, 6, rowSpan);
        const sundays = ids(chart, /-w\d-d0-date$/);
        const rows = [...new Set(ids(chart, /-w\d-d\d-date$/).map((e) => String(e.id).match(/-w(\d)-/)?.[1]))].length;
        const dated = Number(month.year) > 0;
        if (dated) check(rows === weeks, `${slug}, ${what}, ${rowSpan} rows: ${weeks} weeks drawn (got ${rows})`);
        // Evenly spaced, and the last ends at the border: its centre is half
        // a week's pitch above it.
        const ys = sundays.map(centreY);
        if (ys.length >= 2) {
          const pitch = ys[1] - ys[0];
          const even = ys.slice(1).every((y, i) => Math.abs(y - ys[i] - pitch) < 0.5);
          check(even, `${slug}, ${what}, ${rowSpan} rows: the weeks are evenly spaced`);
          const lastEnd = ys[ys.length - 1] + pitch / 2;
          check(Math.abs(lastEnd - (box.y + box.height)) < pitch * 0.15, `${slug}, ${what}, ${rowSpan} rows: the last week reaches the border (${(box.y + box.height - lastEnd).toFixed(1)}px short)`);
        }
      }
    }
  }
}

// --- prompted lines ------------------------------------------------------------------
{
  // Three prompts of two lines, a block each of a prompt's cell and its lines.
  const three = { prompts: ["A", "B", "C"], linesPerPrompt: 2 };
  check(promptLineCounts(three, 9).join() === "2,2,2", `exactly their blocks: as set (got ${promptLineCounts(three, 9)})`);
  check(promptLineCounts(three, 12).join() === "3,3,3", `three cells over: a line more each (got ${promptLineCounts(three, 12)})`);
  check(promptLineCounts(three, 10).join() === "3,2,2", `one over: the first takes it (got ${promptLineCounts(three, 10)})`);
  check(promptLineCounts(three, 7).join() === "3,2", `room for two blocks and a line: the two shown share it (got ${promptLineCounts(three, 7)})`);
  // Lines set per prompt keep their differences: SOAP's one and four.
  const soap = { prompts: ["S", "O", "A"], linesPerPrompt: 3, promptLines: [1, 4, 3] };
  check(promptLineCounts(soap, 14).join() === "2,5,4", `per-prompt counts each grow by the share (got ${promptLineCounts(soap, 14)})`);
  check(promptLineCounts({ prompts: [] }, 10).length === 0, "no prompts, no lines");

  // Drawn: the floor is the first block exactly, and every line of every
  // prompt is ruled but the last, whose rule is the border.
  const props = { heading: "Review", prompts: ["What went well?", "What did not?"], linesPerPrompt: 2 };
  const floor = getMinRowSpanForSlug("prompted-lines", PAGE, 12, props);
  check(floor === 4, `the least is the heading, a prompt and its two lines (got ${floor} rows)`);
  for (const rowSpan of [7, 9, 12]) {
    const chart = draw("prompted-lines", props, 12, rowSpan);
    const counts = promptLineCounts(props, rowSpan - 1);
    const lines = ids(chart, /-p\d-line\d+$/).length;
    const total = counts.reduce((a, b) => a + b, 0);
    check(lines === total - 1, `${rowSpan} rows: ${total} lines across ${counts.length} prompts, all ruled but the last (got ${lines} rules)`);
  }
}
