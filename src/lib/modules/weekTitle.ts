// "WEEK 1/52" + date range, top of the sidebar column. Locked/core like
// hourly-grid-core — its content is structural (driven by which week this
// page actually is), not something a user drags around.
//
// UNDATED. A planner can have no dates at all: you write them in, or a
// generated sequence fills them later (see the business model - the book is
// derived from templates, and a template has no dates in it). That state is
// NOT a flag threaded down to here. It is simply the absence of the values:
// weekNumber/weekTotal unset and dateRangeLabel empty. A renderer that draws
// what it was given needs no second description of what "undated" means, and
// the stored data stops carrying dates that are fiction.
//
// WHAT GOES IN THE SPACE was a design question, and three candidates were
// drawn at true size and compared (undatedProof.mts, which still draws the
// dated and the undated block side by side). Chosen: the label stays and a
// real hairline takes the date's place. The two rejected were printed
// underscores - which sit on the font's baseline, break between characters,
// and cannot be aligned to anything - and drawing nothing at all, which
// leaves a reader no idea what the page is or where to date it.

export type WeekTitleConfig = {
  /** Absent on an undated planner. */
  weekNumber?: number | null;
  weekTotal?: number | null;
  /** e.g. "DEC 31 - JAN 6". Empty on an undated planner. */
  dateRangeLabel: string;
};

export type RenderedElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
};

import { ptToPx } from "@/lib/print-spec";
import { fitFontSizePx } from "@/lib/modules/textFit";
import {
  NEAR_BLACK,
  RULE_WIDTH_PT,
  nearestLatticeYPx,
  type FrameLattice,
} from "@/lib/modules/moduleFrame";

export function renderWeekTitle(
  geometry: { x: number; y: number; width: number; height: number },
  config: WeekTitleConfig,
  idPrefix: string,
  fontFamily: string,
  lattice?: FrameLattice
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic, not positional — see todoChecklist.ts. An id names one mark
  // for the life of the module, so a change in element count does not
  // renumber every mark after it.
  const id = (name: string) => `${idPrefix}-${name}`;
  const FONT_FAMILY = fontFamily;

  // Measured from the reference PDF's embedded text metadata: "WEEK
  // 1/52" is 8pt, "DEC 31 - JAN 6" is 13pt.
  const smallLineHeight = ptToPx(8) * 1.4;
  // The day-of-week headers (hourly-grid-core) sit at the very top of
  // the page; "WEEK 1/52" starts 16.4pt lower than that — measured as
  // the gap between the header box's top (y=18.2pt) and this text's
  // top (y=34.6pt) in the reference. Both blocks start at the same
  // grid row, so that offset has to be applied here explicitly.
  const topOffset = ptToPx(16.4);

  // A number of 0 is a real week number, so this asks whether there IS one
  // rather than whether it is truthy.
  const dated =
    typeof config.weekNumber === "number" && typeof config.weekTotal === "number";

  elements.push({
    id: id("week-label"),
    type: "text",
    x: geometry.x,
    y: geometry.y + topOffset,
    width: geometry.width,
    height: smallLineHeight,
    // The word stays either way. It is what tells a reader the page is a
    // week rather than anything else, and it is not a date.
    text: dated ? `WEEK ${config.weekNumber}/${config.weekTotal}` : "WEEK",
    fontSize: ptToPx(8),
    fontFamily: FONT_FAMILY,
    fill: "#555555",
    align: "left",
  });

  // Capped to its own natural line height rather than filling the rest
  // of the allocated cell — that was leaving no visible gap before the
  // next box, since the text box itself extended right to the boundary.
  const dateRangeLineHeight = ptToPx(13) * 1.3;
  const dateRangeY = geometry.y + topOffset + smallLineHeight;

  if (dated) {
    // 13pt as measured - UNLESS the range is wider than the title's column.
    // "DEC 31 - JAN 6" (the reference's) fits; a week with two-digit dates
    // at both ends, "SEP 24 - SEP 30", is 13px too wide and ran into the
    // hours beside it in print, and wrapped in the editor. Reported
    // 2026-09-22: "the weeks dates on the top left overlap into the
    // adjacent columns of hours". It steps down half a point at a time, so
    // most weeks lose half a point and none lose the date.
    const dateRangeSizes = [13, 12.5, 12, 11.5, 11, 10.5, 10].map(ptToPx);
    const dateRangeSize = fitFontSizePx(config.dateRangeLabel, geometry.width, dateRangeSizes);
    elements.push({
      id: id("date-range"),
      type: "text",
      x: geometry.x,
      y: dateRangeY,
      width: geometry.width,
      height: dateRangeLineHeight,
      text: config.dateRangeLabel,
      fontSize: dateRangeSize,
      fontFamily: FONT_FAMILY,
      align: "left",
    });
    return elements;
  }

  // A real hairline where the date range would have been, at the house
  // interior weight so it reads as part of the same drawing as every other
  // rule on the page.
  //
  // SNAPPED TO THE LATTICE, not left on the baseline the date sat on.
  // Placing it at the baseline is the obvious thing and it is wrong:
  // moduleHouseStyle caught it in 32 cases, because a rule off the pitch
  // reads wrong against the dots and moves whenever the box resizes. The
  // mark gives way, not the lattice - see nearestLatticeYPx.
  const ruleWidth = ptToPx(RULE_WIDTH_PT);
  const ruleY = nearestLatticeYPx(geometry, dateRangeY + ptToPx(13), lattice);
  elements.push({
    id: id("date-rule"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: ruleY - ruleWidth / 2,
    width: geometry.width,
    height: ruleWidth,
    fill: NEAR_BLACK,
  });

  return elements;
}
