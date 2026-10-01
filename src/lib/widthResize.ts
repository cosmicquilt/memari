// HORIZONTAL RESIZE: where a module's left or right edge may go.
//
// Asked 2026-10-01: "it should allow you to horizontal resize until you will
// overlap with an adjacent module", decided as "a day step size" and a "hard
// stop". His example: the weekly page's bottom-left to-do (rows 17-36) may not
// widen left into the empty sidebar while Reminders reaches row 18, and may as
// soon as Reminders is one row shorter.
//
// One description, imported by BOTH the editor's live preview and the
// server's save - see stackResize.ts and memari-layout-architecture for why
// this project keeps a rule like this in one pure function: two copies of it
// is the "preview lied" defect every time.
//
// An edge moves a day (dayUnitColumns) at a time, on day lines counted from
// the page's first column. It stops - hard, nothing highlighted - at:
//   - any other module whose rows it would reach, locked or not (the hours
//     are the commonest);
//   - the page's side;
//   - one day wide;
//   - a width at which the module's content needs more rows than it has
//     (a habit tracker's sidebar layout stacks each habit on two rows, so
//     narrowing one that is only three rows tall stops at two days).
// The range is CONTIGUOUS from where the edge is: it walks out a day at a
// time and stops at the first day it may not take, so a gap beyond an
// obstacle is never reachable by jumping it.

import type { GridRect } from "./grid";

export type WidthEdge = "left" | "right";

export type WidthResizeInput = {
  /** The module being resized, as it is now. */
  target: GridRect;
  /** Every OTHER module on the page, locked or not. */
  others: GridRect[];
  gridColumns: number;
  /** Columns per day - dayUnitColumns(page). */
  step: number;
  /** The module's own content floor, in rows, at a width in columns. */
  minRowSpanAt?: (columnSpan: number) => number;
};

const overlaps = (a: GridRect, b: GridRect) =>
  a.columnStart < b.columnStart + b.columnSpan &&
  b.columnStart < a.columnStart + a.columnSpan &&
  a.rowStart < b.rowStart + b.rowSpan &&
  b.rowStart < a.rowStart + a.rowSpan;

/** Whether the module may be this wide, from these columns, on this page. */
function allowed(input: WidthResizeInput, columnStart: number, columnSpan: number): boolean {
  const { target, others, gridColumns, step } = input;
  if (columnStart < 0 || columnStart + columnSpan > gridColumns) return false;
  if (columnSpan < step) return false;
  const rect = { columnStart, columnSpan, rowStart: target.rowStart, rowSpan: target.rowSpan };
  if (others.some((o) => overlaps(rect, o))) return false;
  if (input.minRowSpanAt && input.minRowSpanAt(columnSpan) > target.rowSpan) return false;
  return true;
}

/**
 * The column lines the dragged edge may sit on, nearest the module's middle
 * to farthest out: [min, max], both on day lines unless one is where the edge
 * already is.
 */
export function widthResizeRange(input: WidthResizeInput, edge: WidthEdge): { min: number; max: number } {
  const { target, step } = input;
  const left = target.columnStart;
  const right = target.columnStart + target.columnSpan;
  if (edge === "left") {
    // Out (left) to the first day line it may not take, in (right) likewise.
    let min = left;
    for (let e = Math.ceil(left / step) * step - step; e >= 0; e -= step) {
      if (!allowed(input, e, right - e)) break;
      min = e;
    }
    let max = left;
    for (let e = Math.floor(left / step) * step + step; e < right; e += step) {
      if (!allowed(input, e, right - e)) break;
      max = e;
    }
    return { min, max };
  }
  let max = right;
  for (let e = Math.floor(right / step) * step + step; e <= input.gridColumns; e += step) {
    if (!allowed(input, left, e - left)) break;
    max = e;
  }
  let min = right;
  for (let e = Math.ceil(right / step) * step - step; e > left; e -= step) {
    if (!allowed(input, left, e - left)) break;
    min = e;
  }
  return { min, max };
}

/**
 * Where the module is once its edge is asked to be at `edgeColumn` (any
 * column, fractional is fine - a pointer's position): the nearest day line,
 * kept inside the range. The other edge does not move.
 */
export function resolveWidthResize(
  input: WidthResizeInput,
  edge: WidthEdge,
  edgeColumn: number
): { columnStart: number; columnSpan: number } {
  const { target, step } = input;
  const left = target.columnStart;
  const right = target.columnStart + target.columnSpan;
  const { min, max } = widthResizeRange(input, edge);
  // The nearest of the day lines in range and the edge's own place - which
  // is a line it may stay on even when it is not a day line (a module laid
  // out before days were the unit), so a small drag does not jump it to one.
  const original = edge === "left" ? left : right;
  const candidates = [original];
  for (let e = Math.ceil(min / step) * step; e <= max; e += step) candidates.push(e);
  const at = candidates.reduce((best, e) =>
    Math.abs(e - edgeColumn) < Math.abs(best - edgeColumn) - 1e-9 ? e : best
  );
  return edge === "left" ? { columnStart: at, columnSpan: right - at } : { columnStart: left, columnSpan: at - left };
}
