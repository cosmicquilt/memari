// Does the resize animation start where the module was, and end where it
// lands? Andrew's rule, stated as a measurement:
//
//   "the beginning of the resize animation [should] be the same as the
//   module looks prior, and the end of the animation to look like the
//   final positions"
//
// Both frames are computable without running the animation. For a given
// resize we know the outgoing render, the incoming render, and - via
// easingRectSource, the renderer's own decision, imported rather than
// re-stated - which of the two is actually shown for the length of the
// ease. Comparing that against each endpoint says whether the rule holds.
//
// What this CANNOT see is the middle: whether marks travel smoothly,
// whether hairlines change weight, whether anything flickers. It measures
// exactly the rule as stated, which is the two endpoints, and stays quiet
// about everything else.
//
// A report rather than a pass/fail suite: the current design shows one
// render for the whole ease, so it necessarily violates one endpoint or
// the other, and the useful output is HOW MUCH per case, not a red X.
//
// Run with: npm run check:animation
import { renderModuleInstance } from "./renderModuleInstance";
import { gridCellToPixels, type PageGrid } from "./grid";
import { easingRectSource } from "@/app/planner/PolotnoJsonRenderer";

const PAGE: PageGrid = {
  widthPx: 2175, heightPx: 3075, gridColumns: 24, gridRows: 36, boxInsetPx: 6, marginPx: 187.5,
};

type Rect = { x?: number; y?: number; width?: number; height?: number };

function rectsOf(slug: string, columnSpan: number, rowSpan: number, propValues: Record<string, unknown>) {
  const elements = renderModuleInstance(
    { id: "probe", locked: false, columnStart: 0, rowStart: 0, columnSpan, rowSpan, propValues,
      moduleType: { slug } } as Parameters<typeof renderModuleInstance>[0],
    PAGE,
    "PT Serif"
  );
  const flatten = (list: unknown[]): Record<string, unknown>[] =>
    list.flatMap((e) => {
      const el = e as Record<string, unknown>;
      return el.children ? [el, ...flatten(el.children as unknown[])] : [el];
    });
  return flatten(elements as unknown[]).filter(
    (e) => e.type === "figure" && e.subType === "rect"
  ) as Rect[];
}

const size = (columnSpan: number, rowSpan: number) =>
  gridCellToPixels(PAGE, { columnStart: 0, rowStart: 0, columnSpan, rowSpan });

/** A mark's identity for comparison: where it is and how big, rounded to a
 *  tenth of a print pixel (1/3000 inch) so float noise is not a difference. */
const key = (r: Rect) =>
  [r.x ?? 0, r.y ?? 0, r.width ?? 0, r.height ?? 0].map((n) => n.toFixed(1)).join(",");

/** How many marks differ between two drawings, counted symmetrically:
 *  present in one and not the other, either way round. */
function marksDiffering(a: Rect[], b: Rect[]): number {
  const bKeys = new Map<string, number>();
  for (const r of b) bKeys.set(key(r), (bKeys.get(key(r)) ?? 0) + 1);
  let onlyInA = 0;
  for (const r of a) {
    const k = key(r);
    const n = bKeys.get(k) ?? 0;
    if (n > 0) bKeys.set(k, n - 1);
    else onlyInA++;
  }
  let onlyInB = 0;
  for (const n of bKeys.values()) onlyInB += n;
  return onlyInA + onlyInB;
}

type Case = {
  name: string;
  slug: string;
  from: [number, number];
  to: [number, number];
  fromProps?: Record<string, unknown>;
  toProps?: Record<string, unknown>;
};

// The crossings and resizes that actually happen in the editor.
const CASES: Case[] = [
  { name: "todo: resize taller in place", slug: "todo-checklist", from: [18, 8], to: [18, 15],
    fromProps: { dayCount: 3 }, toProps: { dayCount: 3 } },
  { name: "todo: resize shorter in place", slug: "todo-checklist", from: [18, 15], to: [18, 8],
    fromProps: { dayCount: 3 }, toProps: { dayCount: 3 } },
  { name: "todo: 3 days -> 4 days", slug: "todo-checklist", from: [18, 15], to: [24, 15],
    fromProps: { dayCount: 3 }, toProps: { dayCount: 4 } },
  { name: "todo: bottom -> sidebar", slug: "todo-checklist", from: [18, 15], to: [6, 15],
    fromProps: { dayCount: 3 }, toProps: { dayCount: 1 } },
  { name: "todo: sidebar -> bottom", slug: "todo-checklist", from: [6, 15], to: [18, 15],
    fromProps: { dayCount: 1 }, toProps: { dayCount: 3 } },
  { name: "habit: 4 units -> 3 units", slug: "habit-tracker", from: [24, 13], to: [18, 13] },
  { name: "habit: bottom -> sidebar", slug: "habit-tracker", from: [18, 13], to: [6, 13] },
  { name: "habit: sidebar -> bottom", slug: "habit-tracker", from: [6, 13], to: [18, 13] },
  { name: "notes: resize shorter", slug: "labeled-box", from: [6, 15], to: [6, 8],
    fromProps: { heading: "Notes" }, toProps: { heading: "Notes" } },
  { name: "notes: resize taller", slug: "labeled-box", from: [6, 8], to: [6, 15],
    fromProps: { heading: "Notes" }, toProps: { heading: "Notes" } },
];

const rows = CASES.map((c) => {
  const fromRects = rectsOf(c.slug, c.from[0], c.from[1], c.fromProps ?? {});
  const toRects = rectsOf(c.slug, c.to[0], c.to[1], c.toProps ?? c.fromProps ?? {});
  const fromSize = size(c.from[0], c.from[1]);
  const toSize = size(c.to[0], c.to[1]);
  const source = easingRectSource(fromRects.length, toRects.length, fromSize, toSize);
  const drawn = source === "from" ? fromRects : toRects;
  return {
    name: c.name,
    marks: `${fromRects.length}->${toRects.length}`,
    source,
    firstFrame: marksDiffering(drawn, fromRects),
    lastFrame: marksDiffering(drawn, toRects),
  };
});

const pad = (s: string, n: number) => s.padEnd(n);
console.log("Resize endpoint check - marks differing from what the module actually looks like\n");
console.log(
  `${pad("case", 30)}${pad("marks", 12)}${pad("shows", 7)}${pad("FIRST frame", 13)}LAST frame`
);
console.log("-".repeat(78));
for (const r of rows) {
  console.log(
    pad(r.name, 30) + pad(r.marks, 12) + pad(r.source, 7) +
    pad(r.firstFrame === 0 ? "ok" : String(r.firstFrame), 13) +
    (r.lastFrame === 0 ? "ok" : String(r.lastFrame))
  );
}

const firstBad = rows.filter((r) => r.firstFrame > 0).length;
const lastBad = rows.filter((r) => r.lastFrame > 0).length;
const worst = rows.reduce((a, r) => Math.max(a, r.firstFrame, r.lastFrame), 0);
console.log("-".repeat(78));
console.log(
  `${rows.length} cases: ${firstBad} violate the first frame, ${lastBad} violate the last, worst case ${worst} marks.`
);
console.log(
  "\nOne render is shown for the whole ease, so every case with a changing\n" +
  "drawing necessarily breaks one endpoint or the other. This says which,\n" +
  "and by how much, so a fix can be aimed rather than guessed at."
);
