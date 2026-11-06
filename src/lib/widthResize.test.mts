// Run: npx tsx src/lib/widthResize.test.mts
//
// The horizontal resize rule - see widthResize.ts. Andrew's own example
// first, then each stop, then a random sweep for the invariants no single
// case pins down.
import { resolveWidthResize, widthResizeRange, type WidthResizeInput } from "./widthResize";
import { gridCellToPixels, type GridRect, type PageGrid } from "./grid";
import { MODULE_REGISTRY, moduleContentIsLive } from "./moduleRegistry";
import { renderModuleInstance, type RenderedPolotnoElement } from "./renderModuleInstance";
import { easeLayers } from "@/app/planner/PolotnoJsonRenderer";

let failures = 0;
let easeSummary = "";
function check(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error("FAIL", message);
  }
}

const rect = (columnStart: number, rowStart: number, columnSpan: number, rowSpan: number): GridRect => ({ columnStart, rowStart, columnSpan, rowSpan });
const STEP = 6;
const input = (target: GridRect, others: GridRect[], minRowSpanAt?: (span: number) => number): WidthResizeInput => ({
  target,
  others,
  gridColumns: 24,
  step: STEP,
  minRowSpanAt,
});

// --- his weekly left page ----------------------------------------------------------
{
  const title = rect(0, 0, 6, 3);
  const hours = rect(6, 0, 18, 13);
  const grateful = rect(0, 3, 6, 9);
  const water = rect(6, 15, 18, 2);
  const todo = rect(6, 17, 18, 19);
  const reminders = (rows: number) => rect(0, 12, 6, rows);
  const page = (rows: number) => input(todo, [title, hours, grateful, reminders(rows), water]);

  const blocked = widthResizeRange(page(6), "left");
  check(blocked.min === 6, `the to-do may not widen left while Reminders reaches its top row (min ${blocked.min})`);
  check(resolveWidthResize(page(6), "left", 0).columnStart === 6, "dragged all the way left, it stays where it is");
  const free = widthResizeRange(page(5), "left");
  check(free.min === 0, `one row shorter, it may (min ${free.min})`);
  const widened = resolveWidthResize(page(5), "left", 0.4);
  check(widened.columnStart === 0 && widened.columnSpan === 24, `and does: four days (${JSON.stringify(widened)})`);
  // Narrowing from the left: a day at a time, never under one day.
  check(widthResizeRange(page(6), "left").max === 18, `narrowing from the left stops at one day (max ${widthResizeRange(page(6), "left").max})`);
  check(resolveWidthResize(page(6), "left", 23).columnSpan === 6, "dragged past its right edge, it is one day wide");
  // The right edge is at the page's side: it can only come in.
  const right = widthResizeRange(page(6), "right");
  check(right.max === 24 && right.min === 12, `the right edge: in to one day, out no further than the page (${JSON.stringify(right)})`);
}

// --- a day a step ----------------------------------------------------------------------
{
  const open = input(rect(6, 20, 12, 4), []);
  check(resolveWidthResize(open, "right", 20.9).columnSpan === 12, "short of halfway to the next day line, it stays");
  check(resolveWidthResize(open, "right", 21.1).columnSpan === 18, "past halfway, a whole day more");
  check(resolveWidthResize(open, "left", 3.2).columnStart === 6 && resolveWidthResize(open, "left", 2.8).columnStart === 0, "the left edge the same way");
  check(resolveWidthResize(open, "right", 99).columnSpan === 18, "never past the page");
}

// --- a hard stop, and no jumping an obstacle ------------------------------------------------
{
  const target = rect(12, 10, 6, 6);
  const near = rect(6, 12, 6, 2); // in the next day to the left, inside the target's rows
  check(widthResizeRange(input(target, [near]), "left").min === 12, "a module in the next day stops it");
  const far = rect(0, 12, 6, 2); // two days left; the day between is free
  check(widthResizeRange(input(target, [far]), "left").min === 6, "a module two days out lets it take the free day between, and no more");
  const notInRows = rect(0, 2, 12, 4); // to the left, but above its rows
  check(widthResizeRange(input(target, [notInRows]), "left").min === 0, "a module beside it but not in its rows is no obstacle");
  // The hours are locked, and count like anything else.
  const sidebar = rect(0, 2, 6, 6);
  const hours = rect(6, 0, 18, 13);
  check(widthResizeRange(input(sidebar, [hours]), "right").max === 6, "a sidebar module beside the hours cannot widen into them");
}

// --- the content floor -----------------------------------------------------------------------
{
  // A habit tracker: its sidebar layout needs five rows, its wide one three.
  const floor = (span: number) => (span <= 6 ? 5 : 3);
  const short = input(rect(0, 20, 18, 3), [], floor);
  check(widthResizeRange(short, "right").min === 12, `three rows tall, it narrows only to two days (min ${widthResizeRange(short, "right").min})`);
  const tall = input(rect(0, 20, 18, 6), [], floor);
  check(widthResizeRange(tall, "right").min === 6, "six rows tall, to one");
  // A width it may not take in the middle is not jumped: the range ends there.
  const notTwoDays = input(rect(0, 20, 18, 4), [], (span) => (span === 12 ? 99 : 1));
  check(widthResizeRange(notTwoDays, "right").min === 18, `a width it may not take stops it, even with one beyond it may (min ${widthResizeRange(notTwoDays, "right").min})`);
  check(widthResizeRange(input(rect(12, 20, 6, 4), [], (span) => (span === 12 ? 99 : 1)), "left").min === 12, "the same growing: two days is barred, so three is out of reach");
}

// --- an edge off the day lines stays put until it can move ------------------------------------
{
  const odd = input(rect(3, 5, 9, 4), [rect(0, 5, 3, 4)]);
  const r = widthResizeRange(odd, "left");
  check(r.min === 3, `blocked beside it, an off-line edge does not move out (min ${r.min})`);
  check(resolveWidthResize(odd, "left", 3.4).columnStart === 3, "and is not snapped anywhere by a small drag");
}

// --- random layouts: the invariants --------------------------------------------------------------
{
  let seed = 7;
  const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * n); };
  let cases = 0;
  for (let trial = 0; trial < 4000; trial++) {
    const others: GridRect[] = [];
    for (let i = 0; i < 1 + rand(5); i++) others.push(rect(rand(4) * 6, rand(30), (1 + rand(3)) * 6, 1 + rand(8)));
    const target = rect(rand(4) * 6, rand(30), 6 * (1 + rand(3)), 1 + rand(6));
    if (target.columnStart + target.columnSpan > 24) continue;
    if (others.some((o) => o.columnStart < target.columnStart + target.columnSpan && target.columnStart < o.columnStart + o.columnSpan && o.rowStart < target.rowStart + target.rowSpan && target.rowStart < o.rowStart + o.rowSpan)) continue;
    // One floor per trial: drawn inside the function, the rule and this check saw different ones.
    const narrowFloor = 1 + rand(8);
    const floorAt = rand(2) ? (span: number) => (span <= 6 ? narrowFloor : 2) : undefined;
    const inp = input(target, others, floorAt);
    for (const edge of ["left", "right"] as const) {
      const out = resolveWidthResize(inp, edge, rand(25) + rand(10) / 10);
      cases++;
      const r = { ...target, ...out };
      const hit = others.find((o) => o.columnStart < r.columnStart + r.columnSpan && r.columnStart < o.columnStart + o.columnSpan && o.rowStart < r.rowStart + r.rowSpan && r.rowStart < o.rowStart + o.rowSpan);
      if (hit) check(false, `resized onto another module: ${JSON.stringify(target)} -> ${JSON.stringify(out)} hits ${JSON.stringify(hit)}`);
      if (r.columnStart < 0 || r.columnStart + r.columnSpan > 24) check(false, `off the page: ${JSON.stringify(out)}`);
      if (r.columnSpan < STEP && r.columnSpan !== target.columnSpan) check(false, `under a day: ${JSON.stringify(out)}`);
      const fixed = edge === "left" ? r.columnStart + r.columnSpan === target.columnStart + target.columnSpan : r.columnStart === target.columnStart;
      if (!fixed) check(false, `the other edge moved: ${JSON.stringify(target)} ${edge} -> ${JSON.stringify(out)}`);
      const moving = edge === "left" ? r.columnStart : r.columnStart + r.columnSpan;
      const original = edge === "left" ? target.columnStart : target.columnStart + target.columnSpan;
      if (moving !== original && moving % STEP !== 0) check(false, `off a day line: ${JSON.stringify(out)}`);
      if (floorAt && r.columnSpan !== target.columnSpan && floorAt(r.columnSpan) > r.rowSpan) check(false, `narrowed past its content's floor: ${JSON.stringify(out)}`);
    }
  }
  check(cases > 3000, `the sweep ran (${cases} resizes)`);
}

// --- a module widened sideways is drawn live ---------------------------------
// A module whose content is drawn once and clipped while its box moves has its
// frame hidden behind the box's outline for the whole drag, and faded back in
// when it ends: "top border of module faded in and out when horizontally
// resizing" (the mini month, 2026-10-15). Every module that can be widened is
// drawn live, so its frame travels with the box.
//
// "Can be widened" is every module a person places, not only the
// resizableWidth ones: that flag is the properties panel's stepper, while the
// side handles go on EVERY unlocked module - the to-do and the habit tracker
// included.
{
  const frozen = Object.entries(MODULE_REGISTRY)
    .filter(([, definition]) => definition.inPalette || definition.resizableWidth)
    .filter(([slug, definition]) => !moduleContentIsLive(slug, definition.previewProps ?? {}))
    .map(([slug]) => slug);
  check(frozen.length === 0, `width-resizable modules drawn frozen, which fade their frame: ${frozen.join(", ")}`);
}

// --- the last frame of a width step is the drawing it lands on ----------------
// "the top line of it would fade out and in during its resizing animation"
// (2026-11-06), on every framed module, but only when it was NARROWED FROM THE
// LEFT. A step is drawn as two renders: the union of the two widths (the
// content, for the moving edge to cut) and the final width (the frame, the
// text, and the rects when they travel). The final one was placed by the
// union's corner. Narrowing from the left is the one step whose union does
// not start where the box ends, so the frame was a day off its corner, not
// taken for the frame, and not drawn: gone for the ease, faded back after it.
// The heading sat a day right of where it landed, and jumped.
//
// Each step of every placeable module, at every width and both edges, is
// drawn as the editor draws it - before, during the ease, after - and held to:
//   - a frame before or after is a frame during (never dropped mid-ease);
//   - what the ease draws from the final render sits, relative to the box,
//     where the committed drawing puts it - the frame, the text (unless the
//     step changes layout, whose text holds still by design), and the rects
//     when they travel. At the last frame the box is where it lands, so this
//     is "the last frame looks like after".
{
  const PAGE: PageGrid = { widthPx: 2175, heightPx: 3075, gridColumns: 24, gridRows: 36, boxInsetPx: 6, marginPx: 187.5 };
  const ROWS = { rowStart: 21, rowSpan: 15 };
  const draw = (slug: string, props: Record<string, unknown>, columnStart: number, columnSpan: number) =>
    renderModuleInstance(
      { id: "probe", locked: false, columnStart, columnSpan, ...ROWS, propValues: props, moduleType: { slug } } as Parameters<typeof renderModuleInstance>[0],
      PAGE
    );
  type Layers = ReturnType<typeof easeLayers>;
  const local = (element: RenderedPolotnoElement, origin: { x: number; y: number }) =>
    [(element.x ?? 0) - origin.x, (element.y ?? 0) - origin.y, element.width ?? 0, element.height ?? 0];
  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 0.01);
  // Every element of `during` that shares an id with `after` sits where `after` puts it.
  const misplaced = (during: RenderedPolotnoElement[], duringOrigin: { x: number; y: number }, after: RenderedPolotnoElement[], afterOrigin: { x: number; y: number }) => {
    const landed = new Map(after.map((element) => [element.id, local(element, afterOrigin)]));
    return during.filter((element) => landed.has(element.id) && !near(local(element, duringOrigin), landed.get(element.id)!)).map((element) => element.id);
  };

  // Every one-day step on a 24-column page: both edges, both directions.
  const steps: Array<{ name: string; from: [number, number]; to: [number, number] }> = [];
  for (let left = 0; left < 24; left += STEP) {
    for (let right = left + STEP; right <= 24; right += STEP) {
      for (const [name, l, r] of [
        ["narrow from the left", left + STEP, right],
        ["widen to the left", left - STEP, right],
        ["narrow from the right", left, right - STEP],
        ["widen to the right", left, right + STEP],
      ] as const) {
        if (l < 0 || r > 24 || r - l < STEP) continue;
        steps.push({ name, from: [left, right - left], to: [l, r - l] });
      }
    }
  }

  const slugs = Object.entries(MODULE_REGISTRY).filter(([, definition]) => definition.inPalette).map(([slug]) => slug);
  let eased = 0;
  let framed = 0;
  const failed = new Map<string, string[]>();
  const fail = (step: string, what: string) => failed.set(step, [...(failed.get(step) ?? []), what]);
  for (const slug of slugs) {
    const props = (MODULE_REGISTRY[slug].previewProps ?? {}) as Record<string, unknown>;
    for (const step of steps) {
      const [fromStart, fromSpan] = step.from;
      const [toStart, toSpan] = step.to;
      const unionStart = Math.min(fromStart, toStart);
      const unionSpan = Math.max(fromStart + fromSpan, toStart + toSpan) - unionStart;
      const fromBox = gridCellToPixels(PAGE, { columnStart: fromStart, columnSpan: fromSpan, ...ROWS });
      const toBox = gridCellToPixels(PAGE, { columnStart: toStart, columnSpan: toSpan, ...ROWS });
      const unionBox = gridCellToPixels(PAGE, { columnStart: unionStart, columnSpan: unionSpan, ...ROWS });
      const at = (box: { x: number; y: number }) => ({ x: box.x, y: box.y });
      const settled = (columnStart: number, columnSpan: number, box: { x: number; y: number }): Layers =>
        easeLayers({ elements: draw(slug, props, columnStart, columnSpan), origin: at(box), textElements: null, textBox: null, textEaseMs: 0, suppressOuterBorderSize: null });
      const before = settled(fromStart, fromSpan, fromBox);
      const after = settled(toStart, toSpan, toBox);
      // As NativePlannerEditor draws a module for WIDTH_EASE_MS after a step.
      const during = easeLayers({
        elements: draw(slug, props, unionStart, unionSpan),
        origin: at(unionBox),
        textElements: draw(slug, props, toStart, toSpan),
        textBox: toBox,
        textEaseMs: 140,
        suppressOuterBorderSize: { width: unionBox.width, height: unionBox.height },
      });
      eased++;
      const where = `${slug} ${step.name} ${fromStart}+${fromSpan} -> ${toStart}+${toSpan}`;
      if ((before.frame || after.frame) && !during.frame) fail(where, "no frame during the ease (the top line fades out and back in)");
      if (after.frame && during.frame) {
        framed++;
        if (!near(local(during.frame, during.frameOrigin), local(after.frame, after.frameOrigin)))
          fail(where, `the frame eases to ${local(during.frame, during.frameOrigin).map(Math.round)} but lands at ${local(after.frame, after.frameOrigin).map(Math.round)}`);
      }
      if (!during.differentDrawings) {
        const text = misplaced(during.text, during.textOrigin, after.text, after.textOrigin);
        if (text.length) fail(where, `${text.length} text mark(s) end the ease off where they land (${text.slice(0, 3).join(", ")})`);
      }
      if (during.animateRects) {
        const rects = misplaced(during.rects, during.rectsOrigin, after.rects, after.rectsOrigin);
        if (rects.length) fail(where, `${rects.length} travelling rect(s) end the ease off where they land (${rects.slice(0, 3).join(", ")})`);
      }
    }
  }
  for (const [where, whats] of [...failed].slice(0, 12)) check(false, `${where}: ${whats.join("; ")}`);
  if (failed.size > 12) check(false, `...and ${failed.size - 12} more width steps`);
  check(slugs.length > 100 && eased > slugs.length * 20, `the steps ran (${slugs.length} modules, ${eased} steps)`);
  check(framed > 1000, `the frame was compared on framed modules (${framed} steps)`);
  easeSummary = `${eased} eased steps over ${slugs.length} modules, ${framed} of them framed`;
}

if (failures > 0) {
  console.error(`\n${failures} width resize check(s) failed.`);
  process.exit(1);
}
console.log(`All width resize checks passed (his to-do and Reminders, a day a step, a hard stop that is never jumped, the hours, the content floor, and 8000 random resizes that never overlap, leave the page, go under a day or move the other edge; ${easeSummary}, each ending where it lands).`);
