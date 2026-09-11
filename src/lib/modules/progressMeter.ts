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
  HEADER_HEIGHT_PT,
  NEAR_BLACK,
  borderElement,
  contentTopPx,
  headerElements,
  type FrameLattice,
} from "@/lib/modules/moduleFrame";

export type ProgressMeterConfig = {
  heading: string;
  /** How many segments in total - days, pages, dollars, sessions. */
  total: number;
  /** A heavier rule after every Nth segment. 0 or absent for none. */
  milestoneEvery?: number;
  /** Print the running count at each milestone. */
  numbered?: boolean;
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
const SEGMENT_STROKE_PT = 0.35;
/** The rule that marks a milestone, against the segment's own hairline. */
const MILESTONE_STROKE_PT = 0.7;
// Small enough to read as an index in the corner of a square rather than
// as something written in it: at 5.5pt the digits nearly filled the
// half-cell segment and the block read as clutter.
const MILESTONE_FONT_PT = 4.5;
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

    elements.push({
      id: id(`seg${n}`),
      type: "figure",
      subType: "rect",
      x: blockLeft + column * segment,
      y: top,
      width: segment,
      height: segment,
      fill: "transparent",
      stroke: NEAR_BLACK,
      strokeWidth: ptToPx(SEGMENT_STROKE_PT),
      opacity: 0.75,
    });

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
      if (config.numbered) {
        elements.push({
          id: id(`mile${count}-label`),
          type: "text",
          x: blockLeft + (column + 1) * segment - segment,
          y: top + (segment - milestoneFontSize * 1.2) / 2,
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

  return elements;
}
