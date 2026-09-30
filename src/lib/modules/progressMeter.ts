// One long count, drawn as a block of squares to fill in.
//
// A hundred days sober, ninety days of a habit, three hundred pages of a
// book, fifty-two weeks of a savings jar, thirty workouts. The catalogue
// calls these different things; they are one drawing with a different
// total and a different word above it.
//
// The distinguishing shape is that a meter is ONE count that WRAPS. A
// rating strip has one row per item and a fixed short scale; this has a
// single run of segments that flows across the box and continues on the
// next line, so how many rows it needs is a consequence of its width. The
// two look similar and behave completely differently under resize, which
// is why they are separate primitives rather than one with a flag.
//
// Segments are half a cell square and packed at a half-cell pitch, so the
// meter is a block of graph paper: half a cell divides the cell, which is
// the pitch rule (see moduleRegistry and the check:behaviour classifier) -
// widening the box changes how many squares are on a row but never moves a
// row off the lattice.
//
// milestoneEvery draws a heavier rule at each multiple, which is what
// turns a field of identical squares into something countable: every ten
// days, every hundred pages, every four weeks.

import { ptToPx } from "@/lib/print-spec";
import {
  RULE_WIDTH_PT,
  HEADER_HEIGHT_PT,
  NEAR_BLACK,
  borderElement,
  contentTopPx,
  headerElements,
  type FrameLattice,
} from "@/lib/modules/moduleFrame";
import { capCentredTextY, fitLabel } from "@/lib/modules/textFit";

export type ProgressMeterConfig = {
  heading: string;
  /** How many segments in total - days, pages, dollars, sessions. */
  total: number;
  /** A heavier rule after every Nth segment. 0 or absent for none. */
  milestoneEvery?: number;
  /** Print the running count at each milestone. The old setting - see
   *  `numbers`, which is read first. */
  numbered?: boolean;
  /**
   * The count printed on the meter: none, at each milestone (the old
   * `numbered`), or in every segment - counting the Omer is saying which
   * day it is. Module-edits list, 2026-09-30.
   */
  numbers?: "none" | "milestones" | "every";
  /** Boxes to tick (the default), circles to fill like beads, or one bar to
   *  shade towards a goal - a hundred boxes say the wrong thing about money. */
  segments?: "boxes" | "circles" | "bar";
  /** Printed under the two ends: "$0" and the goal, page 1 and the last. */
  startLabel?: string;
  endLabel?: string;
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

/** Half a cell each way. */
const SEGMENT_PT = 9;
// The house interior rule weight - see moduleFrame's RULE_WIDTH_PT.
const SEGMENT_STROKE_PT = RULE_WIDTH_PT;
/** The rule that marks a milestone, against the segment's own hairline. */
// Twice the interior rule, so a milestone reads as heavier than the
// segments it divides however the house weight moves.
const MILESTONE_STROKE_PT = RULE_WIDTH_PT * 2;
// Small enough to read as an index in the corner of a square rather than
// as something written in it: at 5.5pt the digits nearly filled the
// half-cell segment and the block read as clutter.
const MILESTONE_FONT_PT = 4.5;
// The start and end labels: the smallest size this planner prints text at
// that is meant to be read, not ticked beside.
const END_LABEL_FONT_PT = 6;
const EDGE_PADDING_PT = 4;

export function getProgressMeterRowMetricsPx() {
  return {
    headerHeightPx: ptToPx(HEADER_HEIGHT_PT),
    segmentPx: ptToPx(SEGMENT_PT),
  };
}

/**
 * How many segments fit across a box of this width.
 *
 * Exported because it is the fact the row count depends on, and the
 * minimum height needs it: a meter is as tall as its total divided by
 * this, and both numbers have to come from the same place or they drift -
 * which is the defect this codebase keeps meeting.
 */
export function progressMeterColumns(widthPx: number): number {
  const usable = widthPx - ptToPx(EDGE_PADDING_PT) * 2;
  return Math.max(1, Math.floor(usable / ptToPx(SEGMENT_PT) + 1e-6));
}

/** Header and every segment the total asks for - a meter that cannot show
 *  its whole count is not showing a count. */
export function getProgressMeterMinHeightPx(total: number, widthPx: number): number {
  const m = getProgressMeterRowMetricsPx();
  const columns = progressMeterColumns(widthPx);
  const rows = Math.max(1, Math.ceil(Math.max(1, Math.floor(total) || 1) / columns));
  return m.headerHeightPx + m.segmentPx * rows;
}

export function renderProgressMeter(
  geometry: { x: number; y: number; width: number; height: number },
  config: ProgressMeterConfig,
  idPrefix: string,
  fontFamily: string,
  lattice?: FrameLattice
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic: a segment is named by its own number in the count, not by
  // where it happens to sit. Segment 47 is the same mark whether the box
  // is wide enough to put it on row two or row four, so it travels when
  // the box resizes instead of being remounted. See todoChecklist.ts.
  const id = (name: string) => `${idPrefix}-${name}`;

  const bodyTop = contentTopPx(geometry, lattice);
  const segment = ptToPx(SEGMENT_PT);
  // Total in its config - see columnTable.ts for why.
  const total = Math.max(1, Math.floor(config.total) || 1);
  const milestone = Math.max(0, Math.floor(config.milestoneEvery ?? 0));

  elements.push(borderElement(geometry, id));
  elements.push(...headerElements(geometry, config.heading ?? "", id, fontFamily, bodyTop));

  const columns = progressMeterColumns(geometry.width);
  const numbers = progressMeterNumbers(config);
  const segments = config.segments === "circles" || config.segments === "bar" ? config.segments : "boxes";
  let lastRowBottom = bodyTop;
  let lastRight = 0;
  const bodyBottom = geometry.y + geometry.height;
  // Centred in whatever the width leaves over, so a short final row and a
  // full one share the same left edge and the block reads as a block.
  const blockLeft = geometry.x + (geometry.width - columns * segment) / 2;
  const milestoneFontSize = ptToPx(MILESTONE_FONT_PT);

  for (let n = 0; n < total; n++) {
    const row = Math.floor(n / columns);
    const column = n % columns;
    const top = bodyTop + row * segment;
    // A segment with nowhere to go is not drawn. getProgressMeterMinHeightPx
    // sizes the box so this does not happen, but a renderer takes the
    // geometry it is given.
    if (top + segment > bodyBottom + 0.5) break;

    const segX = blockLeft + column * segment;
    if (segments === "circles") {
      const r = segment / 2 - ptToPx(1);
      elements.push({
        id: id(`seg${n}`),
        type: "figure",
        subType: "rect",
        x: segX + segment / 2 - r,
        y: top + segment / 2 - r,
        width: r * 2,
        height: r * 2,
        cornerRadius: r,
        fill: "transparent",
        stroke: NEAR_BLACK,
        strokeWidth: ptToPx(SEGMENT_STROKE_PT),
        opacity: 0.75,
      });
    } else if (segments === "bar") {
      // ONE bar per row, ticked at each segment from below: an amount to
      // shade in, still counted.
      if (column === 0) {
        const inRow = Math.min(columns, total - n);
        elements.push({
          id: id(`bar${row}`),
          type: "figure",
          subType: "rect",
          x: segX,
          y: top,
          width: inRow * segment,
          height: segment,
          fill: "transparent",
          stroke: NEAR_BLACK,
          strokeWidth: ptToPx(SEGMENT_STROKE_PT),
          opacity: 0.75,
        });
      } else {
        const tick = segment / 3;
        elements.push({
          id: id(`tick${n}`),
          type: "figure",
          subType: "rect",
          x: segX - ptToPx(SEGMENT_STROKE_PT) / 2,
          y: top + segment - tick,
          width: ptToPx(SEGMENT_STROKE_PT),
          height: tick,
          fill: NEAR_BLACK,
          stroke: "none",
          opacity: 0.6,
        });
      }
    } else {
      elements.push({
        id: id(`seg${n}`),
        type: "figure",
        subType: "rect",
        x: segX,
        y: top,
        width: segment,
        height: segment,
        fill: "transparent",
        stroke: NEAR_BLACK,
        strokeWidth: ptToPx(SEGMENT_STROKE_PT),
        opacity: 0.75,
      });
    }
    if (numbers === "every") {
      elements.push({
        id: id(`n${n + 1}-label`),
        type: "text",
        x: segX,
        y: capCentredTextY(top, segment, milestoneFontSize, fontFamily),
        width: segment,
        height: milestoneFontSize * 1.2,
        text: String(n + 1),
        fontSize: milestoneFontSize,
        fontFamily,
        fill: NEAR_BLACK,
        align: "center",
        opacity: 0.5,
      });
    }
    lastRowBottom = top + segment;
    lastRight = segX + segment;

    // The milestone rule sits on the segment's RIGHT edge - after the
    // tenth day, not before it - so the count reads as complete up to the
    // line rather than starting at it.
    const count = n + 1;
    if (milestone > 0 && count % milestone === 0 && column < columns - 1) {
      const ruleWidth = ptToPx(MILESTONE_STROKE_PT);
      elements.push({
        id: id(`mile${count}`),
        type: "figure",
        subType: "rect",
        x: blockLeft + (column + 1) * segment - ruleWidth / 2,
        y: top,
        width: ruleWidth,
        height: segment,
        fill: NEAR_BLACK,
        stroke: "none",
      });
      if (numbers === "milestones") {
        elements.push({
          id: id(`mile${count}-label`),
          type: "text",
          x: blockLeft + (column + 1) * segment - segment,
          y: capCentredTextY(top, segment, milestoneFontSize, fontFamily),
          width: segment,
          height: milestoneFontSize * 1.2,
          text: String(count),
          fontSize: milestoneFontSize,
          fontFamily,
          fill: NEAR_BLACK,
          align: "center",
          opacity: 0.5,
        });
      }
    }
  }

  // The two ends named, under the first segment and the last.
  const ends = [
    { key: "start", text: (config.startLabel ?? "").trim(), x: blockLeft, align: "left" },
    { key: "end", text: (config.endLabel ?? "").trim(), x: lastRight, align: "right" },
  ];
  const endSize = ptToPx(END_LABEL_FONT_PT);
  if (lastRowBottom + endSize * 1.4 <= geometry.y + geometry.height + 0.5) {
    for (const end of ends) {
      if (!end.text) continue;
      const width = Math.max(segment * 4, (lastRight - blockLeft) / 2 - segment / 2);
      const fitted = fitLabel(end.text, width, [endSize, ptToPx(5)]);
      elements.push({
        id: id(`${end.key}-label`),
        type: "text",
        x: end.align === "left" ? end.x : end.x - width,
        y: lastRowBottom + ptToPx(1.5),
        width,
        height: fitted.fontSizePx * 1.2,
        text: fitted.text,
        fontSize: fitted.fontSizePx,
        fontFamily,
        fill: NEAR_BLACK,
        align: end.align,
        opacity: 0.65,
      });
    }
  }

  return elements;
}

/** The numbers a meter prints: `numbers`, or the old `numbered` boolean. */
export function progressMeterNumbers(config: { numbers?: unknown; numbered?: unknown }): "none" | "milestones" | "every" {
  if (config.numbers === "none" || config.numbers === "milestones" || config.numbers === "every") return config.numbers;
  return config.numbered === false ? "none" : config.numbered === true ? "milestones" : "none";
}

