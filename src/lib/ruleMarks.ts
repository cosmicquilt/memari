// What counts as a RULE in a drawing.
//
// A rule is a drawn hairline that divides a module - an hour row, a line to
// write on, a column separator. It is not the module's own border, and not a
// small filled shape like a checkbox or a date box. Two checks need to pick
// them out of an element list, and until now each described them its own way:
//
//   moduleHouseStyle.test.mts   flat, and wider than half the module's box
//   check-week-page.mts         flat, filled not outlined, and >= one cell
//
// TWO DESCRIPTIONS OF ONE THING, which is this project's oldest defect class,
// and they disagreed in both directions. Measured across 2032 module/size
// combinations:
//
//   the house-style definition looked at    16144 marks
//   the page definition looked at           22406 marks
//   only the house-style one looked at        240 - every one a `t-border`,
//                                                 the module's OWN OUTLINE,
//                                                 flat only because a wide
//                                                 short box is flat
//   only the page one looked at              6502 - real 1.25px hairlines,
//                                                 a to-do's per-column row
//                                                 segments among them
//
// So the house style was measuring a module's border against the lattice -
// which is meaningless, the border IS the box - while never looking at
// thousands of the hairlines the rule was written for. The page check had
// already been fixed once (2026-09-18) after it took the daily page's
// day-name box for a rule and failed it over 2.96px. This is the same fix,
// finished: one description, in one place, for both.
//
// Adopting it across both checks changed no result - every one of those 6502
// marks is already on the lattice - so this buys coverage rather than fixing
// a live fault. Which is the point: the next mark that is NOT on the lattice
// will now be seen by both.

import type { RenderedPolotnoElement } from "./renderModuleInstance";

/**
 * How much longer than thick a mark must be to be a rule.
 *
 * Four, and it is a ratio rather than a size because a rule is a rule at any
 * length: a 1.25px hairline across one day column and one across the whole
 * spread are the same kind of mark. Comfortably clear of anything in this
 * app's modules that is genuinely two-dimensional - every checkbox, date box
 * and dot is nearer square than 1:4.
 */
export const RULE_ASPECT_RATIO = 4;

export type RuleAxis = "horizontal" | "vertical";

/**
 * A shape drawn as an outline: it has a stroke and no fill.
 *
 * A module's own border is the case that matters. It is flat whenever the
 * module is wide and short, so an aspect test alone calls it a rule, and then
 * a lattice check measures a box against the lattice its box is defined by.
 */
export function isOutlineOnly(element: RenderedPolotnoElement): boolean {
  const stroked = (element.strokeWidth ?? 0) > 0;
  const fill = element.fill;
  const unfilled = !fill || fill === "none" || fill === "transparent";
  return stroked && unfilled;
}

/**
 * Which axis this element is a rule on, or null if it is not one.
 *
 * Returning the axis rather than a boolean is deliberate: a caller that asked
 * "is it horizontal?" and "is it vertical?" separately could be told yes
 * twice, and then the two answers need reconciling somewhere. One call, one
 * answer.
 *
 * @param pitchPx the lattice cell size. A mark shorter than one cell is a
 *   tick or a fragment, not a rule that has to land on anything.
 */
export function ruleAxisOf(
  element: RenderedPolotnoElement,
  pitchPx: number
): RuleAxis | null {
  if (element.type !== "figure" || element.subType !== "rect") return null;
  if (isOutlineOnly(element)) return null;

  const width = Number(element.width ?? 0);
  const height = Number(element.height ?? 0);
  if (!(width > 0) || !(height > 0)) return null;

  if (height < width / RULE_ASPECT_RATIO) {
    return width >= pitchPx ? "horizontal" : null;
  }
  if (width < height / RULE_ASPECT_RATIO) {
    return height >= pitchPx ? "vertical" : null;
  }
  return null;
}
