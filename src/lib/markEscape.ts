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
  const x = element.x ?? 0;
  const width = element.width ?? 0;
  let top = element.y ?? 0;
  let bottom = top + (element.height ?? 0);
  if (element.type === "text") {
    const ink = textInkBand(top, Number(element.fontSize ?? 0), String(element.fontFamily ?? ""), String(element.text ?? ""));
    top = ink.top;
    bottom = ink.bottom;
  }
  return Math.max(box.x - x, x + width - (box.x + box.width), box.y - top, bottom - (box.y + box.height));
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
