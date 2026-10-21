// Writing lines are one style. 2026-10-21: "change the ruled lines (within
// all modules that allow it ex. the note box) to have the same style as the
// response lines in the prompt response modules". A prompt's answer lines
// are the reference; every other line ruled for writing on must match them
// in ink and weight, and the free writing spaces (a note box, a month's
// lined days, a matrix's quarters) in how far short of each side they stop.
// The note box's lines were full ink and the month's 0.5 until then.
//
// Run as part of: npm test

import { renderModuleInstance, type RenderedPolotnoElement } from "./renderModuleInstance";
import { WRITING_LINE_OPACITY } from "./modules/moduleFrame";
import type { PageGrid } from "./grid";
import { moduleSchemaDefaults } from "./moduleRegistry";

const PAGE: PageGrid = { widthPx: 2175, heightPx: 3075, gridColumns: 24, gridRows: 36, boxInsetPx: 6, marginPx: 187.5 };

const flatten = (elements: RenderedPolotnoElement[]): RenderedPolotnoElement[] =>
  elements.flatMap((e) => (e.type === "group" ? flatten(e.children ?? []) : [e]));

function render(slug: string, columnSpan: number, rowSpan: number, propValues: Record<string, unknown>) {
  const elements = flatten(
    renderModuleInstance({ id: "t", locked: true, columnStart: 0, rowStart: 2, columnSpan, rowSpan, propValues: { ...moduleSchemaDefaults(slug), ...propValues }, moduleType: { slug } }, PAGE)
  );
  const left = Math.min(...elements.map((e) => Number(e.x ?? Infinity)));
  const right = Math.max(...elements.map((e) => Number(e.x ?? -Infinity) + Number(e.width ?? 0)));
  return { elements, left, right };
}

type Case = { name: string; slug: string; span: [number, number]; props: Record<string, unknown>; line: RegExp; inset: boolean };
const CASES: Case[] = [
  { name: "a prompt's answers (the reference)", slug: "prompted-lines", span: [12, 12], props: { prompts: ["What went well?", "What next?"], answers: "lined" }, line: /-p\d+-line\d+$/, inset: true },
  { name: "a note box", slug: "labeled-box", span: [12, 10], props: { heading: "Notes", rule: "lined", ruled: true }, line: /-(c\d+-)?rule\d+$/, inset: true },
  { name: "a note box preset (numbered)", slug: "gratitude-three", span: [12, 10], props: {}, line: /-(c\d+-)?rule\d+$/, inset: true },
  { name: "a matrix's lined quarters", slug: "axis-matrix", span: [24, 18], props: { inside: "lined" }, line: /-q-[\w-]+-rule\d+$/, inset: true },
  { name: "a month's lined days", slug: "month-grid-core", span: [24, 16], props: { inside: "lined" }, line: /-w\d+-d\d+-rule\d+$/, inset: true },
  { name: "a to-do's rows", slug: "todo-checklist", span: [12, 10], props: { dayCount: 1, lineStyle: "lined" }, line: /-d\d+-row\d+$/, inset: false },
  { name: "a table's rows", slug: "column-table", span: [12, 10], props: { rows: "lined", totalsRow: false }, line: /-row\d+-rule$/, inset: false },
];

let failures = 0;
const fail = (message: string) => {
  console.error(`FAIL ${message}`);
  failures++;
};

const lines = CASES.map((c) => {
  const { elements, left, right } = render(c.slug, c.span[0], c.span[1], c.props);
  const found = elements.filter((e) => typeof e.id === "string" && c.line.test(e.id) && e.type === "figure");
  return { c, found, left, right };
});

const reference = lines[0].found[0];
if (!reference) throw new Error("the prompt drew no answer lines to compare with");
const refInk = Number(reference.opacity ?? 1);
const refWeight = Number(reference.height);
const refInset = Number(reference.x) - lines[0].left;
if (Math.abs(refInk - WRITING_LINE_OPACITY) > 1e-9) fail(`the prompt's answer lines are at ${refInk}, not WRITING_LINE_OPACITY (${WRITING_LINE_OPACITY})`);

for (const { c, found, left, right } of lines) {
  // Not passed by drawing nothing.
  if (found.length === 0) {
    fail(`${c.name} (${c.slug}) drew no writing lines`);
    continue;
  }
  for (const e of found) {
    const ink = Number(e.opacity ?? 1);
    if (Math.abs(ink - refInk) > 1e-9) {
      fail(`${c.name}: ${e.id} at ${ink} ink, the answer lines' is ${refInk}`);
      break;
    }
    if (Math.abs(Number(e.height) - refWeight) > 0.01) {
      fail(`${c.name}: ${e.id} is ${Number(e.height).toFixed(2)}px thick, the answer lines' ${refWeight.toFixed(2)}px`);
      break;
    }
  }
  if (c.inset) {
    // The first line in each region stops the same distance short of the
    // module's sides as an answer line does.
    const first = found[0];
    const inset = Number(first.x) - left;
    const endInset = right - (Number(first.x) + Number(first.width));
    if (c.slug !== "axis-matrix" && c.slug !== "month-grid-core" && (Math.abs(inset - refInset) > 0.5 || Math.abs(endInset - refInset) > 0.5)) {
      fail(`${c.name}: its lines stop ${inset.toFixed(1)}px and ${endInset.toFixed(1)}px short of the sides, the answer lines ${refInset.toFixed(1)}px`);
    }
  }
}

if (failures > 0) {
  console.error(`${failures} writing line check(s) failed.`);
  process.exit(1);
}
console.log(`All writing line checks passed (${lines.reduce((n, l) => n + l.found.length, 0)} lines in ${CASES.length} kinds of module, each at ${refInk} ink and ${refWeight.toFixed(2)}px, as a prompt's answers are).`);
