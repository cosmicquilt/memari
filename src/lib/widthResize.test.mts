// Run: npx tsx src/lib/widthResize.test.mts
//
// The horizontal resize rule - see widthResize.ts. Andrew's own example
// first, then each stop, then a random sweep for the invariants no single
// case pins down.
import { resolveWidthResize, widthResizeRange, type WidthResizeInput } from "./widthResize";
import type { GridRect } from "./grid";

let failures = 0;
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

if (failures > 0) {
  console.error(`\n${failures} width resize check(s) failed.`);
  process.exit(1);
}
console.log("All width resize checks passed (his to-do and Reminders, a day a step, a hard stop that is never jumped, the hours, the content floor, and 8000 random resizes that never overlap, leave the page, go under a day or move the other edge).");
