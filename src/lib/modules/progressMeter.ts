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
// row off the lattice. That is the meter at its smallest; given more room
// it FILLS its module, the rows sharing the height - see progressMeterLayout.
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
  /**
   * How many segments on a row - a week of seven, a hundred days as ten
   * tens. 0 or absent: as many as fit half a cell wide. More than fit is as
   * many as fit. Asked 2026-10-01.
   */
  perRow?: number;
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
/** The line between two segments: the house hairline, faint - and at full
 *  ink at a milestone, where it used to be a rule twice as heavy (asked for
 *  "a normal opacity line instead of that thicker one", 2026-09-30). */
const DIVIDER_OPACITY = 0.3;
// Small enough to read as an index in the corner of a square rather than
// as something written in it: at 5.5pt the digits nearly filled the
// half-cell segment and the block read as clutter.
const MILESTONE_FONT_PT = 4.5;
// The start and end labels: the smallest size this planner prints text at
// that is meant to be read, not ticked beside.
const END_LABEL_FONT_PT = 6;

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
export function progressMeterColumns(widthPx: number, perRow = 0): number {
  // The whole width: the meter runs side to side (see renderProgressMeter).
  // As many as fit half a cell wide, or as many as were asked for if fewer.
  const fit = Math.max(1, Math.floor(widthPx / ptToPx(SEGMENT_PT) + 1e-6));
  const asked = Math.floor(Number(perRow)) || 0;
  return asked > 0 ? Math.min(asked, fit) : fit;
}

/**
 * HOW THE COUNT IS LAID OUT: how many segments on a row, and how tall a row
 * is, in a body `heightPx` tall.
 *
 * THE COUNT FILLS ITS MODULE: the rows SHARE THE HEIGHT, so the meter meets
 * the module's foot as it meets its sides - "fill the whole module the amount
 * even as close to a grid of squares", and then "default fill module ... and
 * remove the switch" (both 2026-10-01): it was a "Fill the module" switch for
 * an afternoon. At its smallest a row is half a cell - the graph-paper tile,
 * every line on the lattice. The filled rows first kept to whole half cells,
 * and a survey of 3,576 sizes found 448 leaving far more of the module
 * empty than they had to: ten rows fill exactly only where the height is a
 * multiple of ten half cells. "Fill the whole module" (2026-10-01) is the
 * ask, so the rows land where the height puts them - on the lattice where it
 * divides, between dots where it does not.
 *
 * With a number per row, those rows share it. On Auto, every column count
 * that fits half a cell wide and half a cell tall is tried and the cheapest
 * kept, adding up:
 *  - how far a segment is from square, as a ratio's log, so twice too wide
 *    costs what twice too tall does;
 *  - three times the share of the meter a short last row leaves empty, and a
 *    quarter more for being short at all - it reads as unfinished;
 *  - rows that do not keep to the milestones - a hundred days with a rule
 *    every ten is ten rows of ten, not seven of fifteen with the rules
 *    staggered (the first version chose that).
 */
export function progressMeterLayout(
  total: number,
  widthPx: number,
  heightPx: number,
  options: { perRow?: number; milestoneEvery?: number }
): { columns: number; rowHeight: number } {
  const half = ptToPx(SEGMENT_PT);
  const count = Math.max(1, Math.floor(total) || 1);
  const asked = Math.floor(Number(options.perRow)) || 0;
  // Never under half a cell: below its minimum height the meter is the tile.
  const shared = (columns: number) => Math.max(half, heightPx / Math.ceil(count / columns));
  if (asked > 0) {
    const columns = progressMeterColumns(widthPx, asked);
    return { columns, rowHeight: shared(columns) };
  }
  const fit = progressMeterColumns(widthPx);
  const milestone = Math.max(0, Math.floor(Number(options.milestoneEvery)) || 0);
  let best = { columns: fit, rowHeight: half, score: Infinity };
  for (let columns = 1; columns <= Math.min(fit, count); columns++) {
    const rows = Math.ceil(count / columns);
    if (rows * half > heightPx + 0.5) continue;
    const rowHeight = heightPx / rows;
    const offMilestones = milestone > 1 && milestone < count && columns % milestone !== 0 && milestone % columns !== 0;
    const score =
      Math.abs(Math.log(widthPx / columns / rowHeight)) +
      3 * (1 - count / (rows * columns)) +
      (count % columns !== 0 && rows > 1 ? 0.25 : 0) +
      (offMilestones ? 0.3 : 0);
    if (score < best.score - 1e-9) best = { columns, rowHeight, score };
  }
  return { columns: best.columns, rowHeight: best.rowHeight };
}

/** Header and every segment the total asks for - a meter that cannot show
 *  its whole count is not showing a count. */
/** The end labels' line under the meter, gap included - kept whether or not
 *  they are set (see renderProgressMeter). One number for the renderer and
 *  the floor, which disagreed about it. */
export function progressMeterEndBandPx(): number {
  return ptToPx(1.5) + ptToPx(END_LABEL_FONT_PT) * 1.2;
}

export function getProgressMeterMinHeightPx(total: number, widthPx: number, perRow = 0): number {
  // At its smallest the meter is the tile; filling only ever spreads it.
  const m = getProgressMeterRowMetricsPx();
  const columns = progressMeterColumns(widthPx, perRow);
  const rows = Math.max(1, Math.ceil(Math.max(1, Math.floor(total) || 1) / columns));
  // And the end labels' line. Left out, a box at its floor was that line
  // short of its rows: no layout fitted, so the meter fell back to the tile -
  // eleven to a row, a short last one, the empty line under it - and the
  // palette, which draws every module at its floor, showed exactly that
  // (2026-10-01: "progress meter in palette preview should be fill module on").
  return m.headerHeightPx + m.segmentPx * rows + progressMeterEndBandPx();
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

  const numbers = progressMeterNumbers(config);
  const segments = config.segments === "circles" || config.segments === "bar" ? config.segments : "boxes";
  let lastRowBottom = bodyTop;
  let lastRight = 0;
  const bodyBottom = geometry.y + geometry.height;
  const endSize = ptToPx(END_LABEL_FONT_PT);
  // What the end labels take under the meter: their gap and their line.
  const endBand = progressMeterEndBandPx();
  // The body less the end labels' line, KEPT WHETHER OR NOT THEY ARE SET. It
  // was kept only once one had words, and the filled rows took the line
  // otherwise - so the editor's faint "Start" and "Goal", always showing
  // since 2026-10-01, sat inside the last row where neither prints, and
  // "Goal" landed on the last milestone's number and fell back to a typed
  // field in the panel. Kept, each placeholder shows where its words will.
  const { columns, rowHeight } = progressMeterLayout(total, geometry.width, bodyBottom - bodyTop - endBand, {
    perRow: config.perRow,
    milestoneEvery: milestone,
  });
  // SIDE TO SIDE: the segments share the box's whole width, so the meter
  // meets the module's border on both sides - asked 2026-10-01, "there
  // doesn't need to be a gap between the meter and the sides of the overall
  // module". They were half-cell squares centred in what the width left over,
  // a margin each side; now each is a hair wider than tall (as many as fit
  // whole at half a cell, sharing the rest), and still half a cell high, on
  // the lattice rows. A short final row keeps the same left edge.
  const blockLeft = geometry.x;
  const segmentWidth = geometry.width / columns;
  const milestoneFontSize = ptToPx(MILESTONE_FONT_PT);

  // The line between segment n-1 and segment n, a row tall.
  const divider = (n: number, x: number, top: number, opacity: number): RenderedElement => ({
    id: id(`div${n}`),
    type: "figure",
    subType: "rect",
    x: x - ptToPx(SEGMENT_STROKE_PT) / 2,
    y: top,
    width: ptToPx(SEGMENT_STROKE_PT),
    height: rowHeight,
    fill: NEAR_BLACK,
    stroke: "none",
    ...(opacity < 1 ? { opacity } : {}),
  });
  // Is the boundary before segment n a milestone - n segments complete?
  const milestoneAt = (n: number) => milestone > 0 && n > 0 && n % milestone === 0;

  for (let n = 0; n < total; n++) {
    const row = Math.floor(n / columns);
    const column = n % columns;
    const top = bodyTop + row * rowHeight;
    // A segment with nowhere to go is not drawn. getProgressMeterMinHeightPx
    // sizes the box so this does not happen, but a renderer takes the
    // geometry it is given.
    if (top + rowHeight > bodyBottom + 0.5) break;

    const segX = blockLeft + column * segmentWidth;
    if (segments === "circles") {
      const r = Math.min(rowHeight, segmentWidth) / 2 - ptToPx(1);
      elements.push({
        id: id(`seg${n}`),
        type: "figure",
        subType: "rect",
        x: segX + segmentWidth / 2 - r,
        y: top + rowHeight / 2 - r,
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
          width: inRow * segmentWidth,
          height: rowHeight,
          fill: "transparent",
          stroke: NEAR_BLACK,
          strokeWidth: ptToPx(SEGMENT_STROKE_PT),
          opacity: 0.75,
        });
      } else if (milestoneAt(n)) {
        elements.push(divider(n, segX, top, 1));
      } else {
        const tick = segment / 3;
        elements.push({
          id: id(`tick${n}`),
          type: "figure",
          subType: "rect",
          x: segX - ptToPx(SEGMENT_STROKE_PT) / 2,
          y: top + rowHeight - tick,
          width: ptToPx(SEGMENT_STROKE_PT),
          height: tick,
          fill: NEAR_BLACK,
          stroke: "none",
          opacity: DIVIDER_OPACITY,
        });
      }
    } else if (column === 0) {
      // BOXES: the row outlined once at full ink, and a line between each
      // segment - faint, so the count reads as one strip, and at full ink
      // at each milestone. Asked 2026-09-30: "make the dividers between each
      // segment a low transparency line then inbetween each five have a
      // normal opacity line instead of that thicker one." Each segment was
      // its own box before, which drew every shared edge twice.
      const inRow = Math.min(columns, total - n);
      elements.push({
        id: id(`row${row}-box`),
        type: "figure",
        subType: "rect",
        x: segX,
        y: top,
        width: inRow * segmentWidth,
        height: rowHeight,
        fill: "transparent",
        stroke: NEAR_BLACK,
        strokeWidth: ptToPx(SEGMENT_STROKE_PT),
      });
    } else {
      elements.push(divider(n, segX, top, milestoneAt(n) ? 1 : DIVIDER_OPACITY));
    }
    // Circles have no dividers; a milestone is still a line between two.
    if (segments === "circles" && column > 0 && milestoneAt(n)) elements.push(divider(n, segX, top, 1));
    if (numbers === "every") {
      elements.push({
        id: id(`n${n + 1}-label`),
        type: "text",
        x: segX,
        y: capCentredTextY(top, rowHeight, milestoneFontSize, fontFamily),
        width: segmentWidth,
        height: milestoneFontSize * 1.2,
        text: String(n + 1),
        fontSize: milestoneFontSize,
        fontFamily,
        fill: NEAR_BLACK,
        align: "center",
        opacity: 0.5,
      });
    }
    lastRowBottom = top + rowHeight;
    lastRight = segX + segmentWidth;

    // The milestone rule sits on the segment's RIGHT edge - after the
    // tenth day, not before it - so the count reads as complete up to the
    // line rather than starting at it.
    const count = n + 1;
    // Numbered in its own segment, so at a row's end too - ten a row with a
    // rule every ten numbered nothing while this skipped the last column.
    if (milestone > 0 && count % milestone === 0) {
      if (numbers === "milestones") {
        elements.push({
          id: id(`mile${count}-label`),
          type: "text",
          x: blockLeft + column * segmentWidth,
          y: capCentredTextY(top, rowHeight, milestoneFontSize, fontFamily),
          width: segmentWidth,
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

  // The two ends named: the start under the first segment, the end under the
  // last - or, once the count wraps, at the meter's right end, which every
  // full row now reaches; under a short final row of one or two it would
  // run out past the left.
  const meterRight = total > columns ? blockLeft + columns * segmentWidth : lastRight;
  // The words keep a little off the border the meter now meets.
  const inset = ptToPx(2);
  const ends = [
    { key: "start", text: (config.startLabel ?? "").trim(), x: blockLeft + inset, align: "left" },
    { key: "end", text: (config.endLabel ?? "").trim(), x: meterRight - inset, align: "right" },
  ];
  if (lastRowBottom + endBand <= geometry.y + geometry.height + 0.5) {
    for (const end of ends) {
      if (!end.text) continue;
      const width = Math.max(segment * 4, (meterRight - blockLeft) / 2 - segment / 2);
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

