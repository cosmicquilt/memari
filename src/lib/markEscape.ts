// How far a drawn mark lies outside its module's box, and how far it may.
//
// Two checks ask this: check-week-page.mts of every mark on a real page,
// moduleHouseStyle.test.mts of every module at every size. Each answered it
// its own way. A registry-wide sweep (2026-10-05) found three modules
// "outside their boxes", and two of the three were the measure, not the
// drawing:
//
//   - bill-tracker, 6 columns: its month letters' LINE BOXES ran 3.65px past
//     the bottom. Their capitals are centred in their squares and the ink is
//     inside. Most of a line box is empty (leading above, the whole descent
//     under a capital); the house-style test already judged text by its ink,
//     and the page check did not.
//   - quote-block, rules frame: its top and bottom rules are the border's own
//     edges, centred on the box edge, so half their 0.5pt weight (1.04px)
//     lies outside. A stroked border paints exactly as far out and is never
//     counted, because its box is the box. The slack was a hand-picked 1px.
//
// The third, the week title at two rows, was real - see its own floor.

import type { RenderedPolotnoElement } from "./renderModuleInstance";
import { textInkBand } from "@/lib/modules/textFit";
import { BORDER_WIDTH_PT } from "@/lib/modules/moduleFrame";
import { ptToPx } from "@/lib/print-spec";
import { ALLOCATION_FRAME } from "./allocationFrame";

type Box = { x: number; y: number; width: number; height: number };

/**
 * How far past the box the mark reaches, in px; zero or less is inside.
 * Text is judged by its ink vertically and by the width it was laid out
 * against horizontally - the renderer places the string at that position
 * whatever its own width, and textFit keeps the string inside that layout.
 */
export function markEscapePx(element: RenderedPolotnoElement, box: Box): number {
  let x = element.x ?? 0;
  let width = element.width ?? 0;
  let top = element.y ?? 0;
  let bottom = top + (element.height ?? 0);
  if (element.type === "text") {
    const ink = textInkBand(top, Number(element.fontSize ?? 0), String(element.fontFamily ?? ""), String(element.text ?? ""));
    top = ink.top;
    bottom = ink.bottom;
  }
  // AN ICON BY ITS INK, as text is (2026-10-06): its box is a square, and a
  // tall drawing - a spoon is a third as wide as it is tall - sits in the
  // middle of one as wide as the row is high. Given the whole row behind a
  // faint label, the first spoon's SQUARE reached 9px past its strip while
  // the spoon was well inside it.
  const ink = typeof element.pathD === "string" ? pathExtent(element.pathD) : null;
  if (ink) {
    const half = element.stroke && element.stroke !== "none" ? Number(element.strokeWidth ?? 0) / 2 : 0;
    x = ink.left - half;
    width = ink.right - ink.left + half * 2;
    top = ink.top - half;
    bottom = ink.bottom + half;
  }
  return Math.max(box.x - x, x + width - (box.x + box.width), box.y - top, bottom - (box.y + box.height));
}

/**
 * Where a path's curves actually go - each cubic sampled along its length,
 * since its control points can lie well outside it. Absolute M, L, C and Z
 * only, which is what every drawn glyph and face is; anything else returns
 * null and the box stands, as before.
 */
function pathExtent(d: string): { left: number; right: number; top: number; bottom: number } | null {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  const see = (px: number, py: number) => {
    left = Math.min(left, px); right = Math.max(right, px);
    top = Math.min(top, py); bottom = Math.max(bottom, py);
  };
  let cx = 0, cy = 0;
  for (let i = 0; i < tokens.length; ) {
    const op = tokens[i];
    const n = (k: number) => Number(tokens[i + k]);
    if (op === "M" || op === "L") {
      cx = n(1); cy = n(2); see(cx, cy); i += 3;
    } else if (op === "C") {
      const [x1, y1, x2, y2, x3, y3] = [n(1), n(2), n(3), n(4), n(5), n(6)];
      for (let s = 1; s <= 16; s++) {
        const t = s / 16, u = 1 - t;
        see(u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
      cx = x3; cy = y3; i += 7;
    } else if (op === "Z" || op === "z") {
      i += 1;
    } else return null;
  }
  return Number.isFinite(left) ? { left, right, top, bottom } : null;
}

/**
 * How far a mark of this module may reach past its box: half the border's
 * weight, which every border paints outside its edge - plus, for a module
 * laid out in the allocation frame, the box inset (see allocationFrame.ts).
 * A hair over, so a mark exactly that far is not failed by a float.
 */
export function escapeSlackPx(slug: string, insetPx: number): number {
  return (ALLOCATION_FRAME.has(slug) ? insetPx : 0) + ptToPx(BORDER_WIDTH_PT) / 2 + 0.01;
}
