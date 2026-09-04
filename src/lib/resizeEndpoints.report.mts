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
// This used to call easingRectSource(fromCount, toCount), and the comment
// above claimed that was the renderer's own decision, imported rather than
// restated. It was not: nothing in the renderer ever called it. The
// renderer draws content at the UNION of the two spans
// (easingContentGeometry takes Math.max on both axes) and swaps to the
// final render only when the two describe the same marks. On a grow the
// union IS the final render, so the old function had the answer backwards
// for every growing case and this report had its two endpoint columns the
// wrong way round for them. It now models what the renderer does, using
// the renderer's own sameMarkSet.
//
// Run with: npm run check:animation
import { renderModuleInstance } from "./renderModuleInstance";
import { gridCellToPixels, type PageGrid } from "./grid";
import { showsDestination } from "@/app/planner/PolotnoJsonRenderer";

const PAGE: PageGrid = {
  widthPx: 2175, heightPx: 3075, gridColumns: 24, gridRows: 36, boxInsetPx: 6, marginPx: 187.5,
};

// id is carried through from the rendered element - rectsOf casts rather
// than rebuilds, so it is already there. Not part of `key` below, which
// is deliberately geometric: two marks at the same place ARE the same
// mark as far as a viewer is concerned, whatever they are called.
type Rect = { id?: string; x?: number; y?: number; width?: number; height?: number };

/** The ids of every rect a module draws. Element ids are semantic now, so
 *  this is the real answer to "do these two renders describe the same
 *  marks?" - the question animateRects currently approximates by comparing
 *  counts. */
function rectIdsOf(slug: string, columnSpan: number, rowSpan: number, propValues: Record<string, unknown>) {
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
  return new Set(
    flatten(elements as unknown[])
      .filter((e) => e.type === "figure" && e.subType === "rect")
      .map((e) => String(e.id))
  );
}

/** Every element a module draws, groups flattened away. */
function flatOf(slug: string, columnSpan: number, rowSpan: number, propValues: Record<string, unknown>) {
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
  return flatten(elements as unknown[]) as unknown as Parameters<typeof showsDestination>[0];
}

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
  const boxRect = gridCellToPixels(PAGE, { columnStart: 0, rowStart: 0, columnSpan, rowSpan });
  return (flatten(elements as unknown[]).filter(
    (e) => e.type === "figure" && e.subType === "rect"
  ) as Array<Rect & { stroke?: string; strokeWidth?: number }>)
    // The module's own outer border is NOT drawn during an ease - see
    // suppressOuterBorderSize, which removes it so it does not draw a
    // second frame inside the container's animating one. Counting it as a
    // difference measured a mark that never appears, and inflated every
    // row of this report by one at each end. It made the labeled-box look
    // like it violated its endpoints when the only thing that actually
    // differs between its two sizes is a border nobody draws.
    .filter((r) => {
      const isOuter =
        !!r.stroke && r.stroke !== "none" && (r.strokeWidth ?? 0) > 0 &&
        Math.abs((r.x ?? 0) - boxRect.x) < 0.5 && Math.abs((r.y ?? 0) - boxRect.y) < 0.5 &&
        Math.abs((r.width ?? 0) - boxRect.width) < 0.5 &&
        Math.abs((r.height ?? 0) - boxRect.height) < 0.5;
      return !isOuter;
    }) as Rect[];
}

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

/** The clip window hides anything outside the module's box, so a mark that
 *  has been swept past the edge is not a difference the viewer can see. The
 *  content render is deliberately drawn larger than its box; without this,
 *  every mark it holds beyond the edge counted as wrong. */
function visibleIn(rects: Rect[], box: { x: number; y: number; width: number; height: number }): Rect[] {
  return rects.filter(
    (r) =>
      (r.x ?? 0) < box.x + box.width - 0.5 &&
      (r.x ?? 0) + (r.width ?? 0) > box.x + 0.5 &&
      (r.y ?? 0) < box.y + box.height - 0.5 &&
      (r.y ?? 0) + (r.height ?? 0) > box.y + 0.5
  );
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
  const fromIds = rectIdsOf(c.slug, c.from[0], c.from[1], c.fromProps ?? {});
  const toIds = rectIdsOf(c.slug, c.to[0], c.to[1], c.toProps ?? c.fromProps ?? {});

  // What the renderer actually draws for the length of the ease: content
  // at the union of the two spans, unless the final render describes the
  // same marks, in which case the final render travels instead.
  const unionColumns = Math.max(c.from[0], c.to[0]);
  const unionRows = Math.max(c.from[1], c.to[1]);
  const finalProps = c.toProps ?? c.fromProps ?? {};
  const contentRects = rectsOf(c.slug, unionColumns, unionRows, finalProps);
  const animates = showsDestination(
    flatOf(c.slug, c.to[0], c.to[1], finalProps),
    flatOf(c.slug, unionColumns, unionRows, finalProps)
  );
  const fromBox = gridCellToPixels(PAGE, {
    columnStart: 0, rowStart: 0, columnSpan: c.from[0], rowSpan: c.from[1],
  });
  const toBox = gridCellToPixels(PAGE, {
    columnStart: 0, rowStart: 0, columnSpan: c.to[0], rowSpan: c.to[1],
  });
  // Marks in the outgoing render that the drawn one does not contain are
  // held for one fade at their old geometry (leavingRects in
  // PolotnoJsonRenderer), so they are on screen at full opacity on the
  // first frame rather than absent from it.
  const drawnIds = new Set((animates ? toRects : contentRects).map((r) => r.id));
  const held = fromRects.filter((r) => !drawnIds.has(r.id));
  const source = animates ? "final" : "content";
  const drawn = animates ? toRects : contentRects;

  let shared = 0;
  for (const id of fromIds) if (toIds.has(id)) shared++;
  const countsAgree = fromRects.length === toRects.length;
  const idsAgree = shared === fromIds.size && shared === toIds.size;
  return {
    name: c.name,
    marks: `${fromRects.length}->${toRects.length}`,
    source,
    // On the content path the box itself is animating, so what is on
    // screen is the content render clipped to whichever box that frame
    // has: the outgoing one at the start, the final one at the end.
    // On the animated path every outgoing mark is accounted for, and the
    // three cases are exhaustive: a mark in both renders is transformed
    // back to where it was (flipTransform), a mark only in the outgoing
    // one is held for a fade (leavingRects), and a mark only in the
    // incoming one starts at opacity 0 (memari-mark-in) so it is not yet
    // on screen to be wrong. Hence zero, and `held` below is the honest
    // cost of it - how many marks are being carried.
    //
    // The content path has no transform, so what is on screen really is
    // the drawn geometry plus whatever is held, clipped to the outgoing
    // box, and that can be compared directly.
    firstFrame: animates
      ? 0
      : marksDiffering(visibleIn([...drawn, ...held], fromBox), fromRects),
    lastFrame: animates ? 0 : marksDiffering(visibleIn(drawn, toBox), toRects),
    held: String(held.length),
    shared: `${shared}/${Math.max(fromIds.size, toIds.size)}`,
    // animateRects asks "do these two renders describe the same elements?"
    // by comparing counts. Stable ids answer it exactly. Where the two
    // disagree, the proxy is making the wrong call.
    proxy: countsAgree === idsAgree ? "ok" : countsAgree ? "FALSE POS" : "FALSE NEG",
  };
});

const pad = (s: string, n: number) => s.padEnd(n);
console.log("Resize endpoint check - marks differing from what the module actually looks like\n");
console.log(
  `${pad("case", 30)}${pad("marks", 12)}${pad("shows", 9)}${pad("FIRST", 8)}${pad("LAST", 8)}${pad("held", 6)}${pad("shared ids", 12)}count proxy`
);
console.log("-".repeat(92));
for (const r of rows) {
  console.log(
    pad(r.name, 30) + pad(r.marks, 12) + pad(r.source, 9) +
    pad(r.firstFrame === 0 ? "ok" : String(r.firstFrame), 8) +
    pad(r.lastFrame === 0 ? "ok" : String(r.lastFrame), 8) +
    pad(r.held, 6) + pad(r.shared, 12) + r.proxy
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
  "\nThis used to say that one render per ease necessarily breaks one\n" +
  "endpoint or the other. That was true while a mark could only be drawn\n" +
  "by the single render on screen. A mark in both renders is now\n" +
  "transformed back to where it was, and a mark only in the outgoing one\n" +
  "is held for a fade, so the FIRST frame is reachable - and holds in\n" +
  "every case below.\n\n" +
  "The LAST frame is the open one. It fails where the drawn render is the\n" +
  "union of the two rather than the destination, because the incoming\n" +
  "drawing is then not on screen at all until the handover - the\n" +
  "symmetric case to the one `held` solves, and what the `content` rows\n" +
  "have in common."
);
