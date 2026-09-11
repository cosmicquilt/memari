// Four boxes made by crossing two axes, each with room to write in.
//
// Eisenhower (urgent/important), SWOT, a start-stop-continue-change grid,
// a decision matrix, a pros-and-cons-and-risks-and-mitigations square, an
// effort/impact plot. The catalogue names half a dozen of these and they
// differ only in the four words in the corners and the two words on each
// axis.
//
// A quadrant grid is not a table: a table's columns carry a list and this
// carries a POSITION - where a thing sits relative to the two axes is the
// content. So the cross is drawn as a single pair of rules through the
// whole body rather than as cell borders, and the quadrant names sit at
// the corners rather than in a heading row, which leaves the middle of
// each quadrant clear to write across.
//
// The across axis is named in a band along the top and the down axis in a
// gutter at the left, one letter per line. Both were bands at first, top
// and bottom, and two words side by side under a grid whose top band is
// two words side by side reads as a second set of COLUMN labels - see
// AXIS_GUTTER_WIDTH_PT.
//
// The body is a whole number of cells, because the header is one cell less
// the box inset at both ends (see todoChecklist.ts). The cross sits at the
// midpoint of that, so it lands on a whole cell when the body is an even
// number of them and on a half cell when it is odd - both of which divide
// the cell, so the pitch rule holds either way.

import { ptToPx } from "@/lib/print-spec";
import { fitLabelSet } from "@/lib/modules/textFit";
import {
  HEADER_HEIGHT_PT,
  NEAR_BLACK,
  borderElement,
  contentTopPx,
  headerElements,
  rowHeightPx,
  type FrameLattice,
} from "@/lib/modules/moduleFrame";

export type AxisMatrixConfig = {
  heading: string;
  /** The two ends of the horizontal axis, printed left and right. */
  xLeft: string;
  xRight: string;
  /** The two ends of the vertical axis, printed top and bottom. */
  yTop: string;
  yBottom: string;
  /**
   * Names for the four boxes, reading top-left, top-right, bottom-left,
   * bottom-right. Any of them may be empty - a SWOT names all four, an
   * effort/impact plot names none and relies on the axes.
   */
  quadrants?: string[];
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

/**
 * ONE CELL, not the half cell a printed head visually wants.
 *
 * The header above is one cell less the box inset at both ends, so what
 * remains is exactly (rowSpan - 1) whole cells. Anything this band takes
 * out of that has to be a whole cell too, or the plotted area below is a
 * whole number of cells plus a remainder - and the remainder shows up as a
 * last row half again as tall as the others, with no rule under it because
 * the border is still half a cell away.
 *
 * That is not a hypothetical: it is the defect reported twice on the
 * to-do, first as "instead of one row, there a little bit of a second row"
 * and then as "with more rows it still looks messed up, the last row is
 * large". A half-cell band reintroduces it exactly.
 */
const AXIS_BAND_HEIGHT_PT = 18;
const AXIS_FONT_PT = 6.5;
/**
 * Half a cell of gutter down the left, for the down axis.
 *
 * The down axis was first printed in a second band along the BOTTOM, on
 * the reasoning that the renderer draws upright type and nothing else, so
 * there was nowhere to set it sideways. It reads as a second pair of
 * COLUMN labels - two words side by side under a grid whose top band is
 * two words side by side - which is worse than not labelling the axis at
 * all, because it is confidently wrong.
 *
 * So it goes where it belongs, down the left edge, set one letter per
 * line. That is what a printed form does when it cannot rotate type, and
 * it cannot be mistaken for anything else.
 */
const AXIS_GUTTER_WIDTH_PT = 9;
const AXIS_LETTER_FONT_PT = 6;
/** Letters of a stacked label, as a multiple of their own size. */
const AXIS_LETTER_PITCH = 1.15;
/** Half a cell for a quadrant's own name, at the top of its box. */
const QUADRANT_LABEL_HEIGHT_PT = 9;
const QUADRANT_FONT_PT = 7;
const CROSS_WIDTH_PT = 0.5;
const PADDING_PT = 4;

export function getAxisMatrixRowMetricsPx() {
  return {
    headerHeightPx: ptToPx(HEADER_HEIGHT_PT),
    axisBandHeightPx: ptToPx(AXIS_BAND_HEIGHT_PT),
    axisGutterWidthPx: ptToPx(AXIS_GUTTER_WIDTH_PT),
    quadrantLabelHeightPx: ptToPx(QUADRANT_LABEL_HEIGHT_PT),
  };
}

/**
 * Header, the across-axis band, and one cell of writing room in each of
 * the four boxes on top of their names.
 *
 * Four boxes is what this module IS - a matrix squeezed until the bottom
 * two are slivers is not a short matrix, it is a broken one - so the
 * minimum sizes the whole cross rather than one row of it.
 */
export function getAxisMatrixMinHeightPx(): number {
  const m = getAxisMatrixRowMetricsPx();
  const quadrant = m.quadrantLabelHeightPx + rowHeightPx();
  // One axis band, not two: the down axis moved to a gutter at the side,
  // which costs width rather than height.
  return m.headerHeightPx + m.axisBandHeightPx + quadrant * 2;
}

export function renderAxisMatrix(
  geometry: { x: number; y: number; width: number; height: number },
  config: AxisMatrixConfig,
  idPrefix: string,
  fontFamily: string,
  lattice?: FrameLattice
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic: marks are named by which axis or which quadrant they belong
  // to. Nothing here is counted, so nothing here can be renumbered - which
  // is the whole point of naming marks rather than indexing them. See
  // todoChecklist.ts.
  const id = (name: string) => `${idPrefix}-${name}`;

  const bandTop = contentTopPx(geometry, lattice);
  const axisBand = ptToPx(AXIS_BAND_HEIGHT_PT);
  const labelBand = ptToPx(QUADRANT_LABEL_HEIGHT_PT);
  const crossWidth = ptToPx(CROSS_WIDTH_PT);
  const padding = ptToPx(PADDING_PT);

  elements.push(borderElement(geometry, id));
  elements.push(...headerElements(geometry, config.heading ?? "", id, fontFamily, bandTop));

  const axisFontSize = ptToPx(AXIS_FONT_PT);
  const gutter = ptToPx(AXIS_GUTTER_WIDTH_PT);
  const gridTop = bandTop + axisBand;
  const gridBottom = geometry.y + geometry.height;
  // The plot area starts after the gutter; the gutter itself carries the
  // down axis and nothing else.
  const plotLeft = geometry.x + gutter;
  const plotWidth = geometry.x + geometry.width - plotLeft;
  const halfWidth = plotWidth / 2;
  const midX = plotLeft + halfWidth;
  // The cross goes on the nearest LATTICE line to the middle, not on the
  // exact middle.
  //
  // The plotted area is a whole number of cells less the box's bottom
  // inset, so its true midpoint lands on a half cell minus 3px - measured
  // at -3.0 from the nearest dot row, which is the same near-miss that
  // made every other rule here look wrong. Being up to 3px off centre in a
  // box hundreds of pixels tall is invisible; being 3px off a dot is not.
  const exactMid = gridTop + (gridBottom - gridTop) / 2;
  const midY = lattice
    ? lattice.originY +
      Math.round((exactMid - lattice.originY) / lattice.pitchPx) * lattice.pitchPx
    : exactMid;

  // The across axis: its two ends over the two halves they name.
  const acrossEnds: Array<[string, string, number]> = [
    ["x-left", config.xLeft ?? "", plotLeft],
    ["x-right", config.xRight ?? "", midX],
  ];
  // Both ends of the axis at one size - see fitLabelSet.
  const across = fitLabelSet(
    acrossEnds.map(([, text]) => ({ text, widthPx: halfWidth - padding * 2 })),
    [axisFontSize, ptToPx(6), ptToPx(5)]
  );
  acrossEnds.forEach(([name, text, x], i) => {
    if (!text) return;
    const fitted = { text: across.texts[i], fontSizePx: across.fontSizePx };
    elements.push({
      id: id(name),
      type: "text",
      x: x + padding,
      y: bandTop + (axisBand - fitted.fontSizePx * 1.2) / 2,
      width: halfWidth - padding * 2,
      height: fitted.fontSizePx * 1.2,
      text: fitted.text,
      fontSize: fitted.fontSizePx,
      fontFamily,
      fill: NEAR_BLACK,
      align: "center",
      opacity: 0.75,
      letterSpacing: fitted.fontSizePx * 0.06,
    });
  });

  // The down axis, one letter per line in the gutter, centred in the half
  // it names. Each letter is its own text element - there is no other way
  // to stack them, since the renderer draws a text node as one unbroken
  // line - and each is named by its label and its position in it, so a
  // reworded axis replaces only the letters that actually changed.
  const halfHeight = (gridBottom - gridTop) / 2;
  const downEnds: Array<[string, string, number]> = [
    ["y-top", config.yTop ?? "", gridTop],
    ["y-bottom", config.yBottom ?? "", midY],
  ];
  for (const [name, text, top] of downEnds) {
    if (!text) continue;
    const letters = [...text];
    // Shrink until the stack fits its half, then cut - the same
    // shrink-then-truncate order as every other label here, just measured
    // down the page instead of across it.
    let letterSize = ptToPx(AXIS_LETTER_FONT_PT);
    for (const candidate of [ptToPx(AXIS_LETTER_FONT_PT), ptToPx(5), ptToPx(4.5)]) {
      letterSize = candidate;
      if (letters.length * candidate * AXIS_LETTER_PITCH <= halfHeight - padding * 2) break;
    }
    const pitch = letterSize * AXIS_LETTER_PITCH;
    const room = Math.max(0, Math.floor((halfHeight - padding * 2) / pitch));
    const shown = letters.slice(0, room);
    const stackTop = top + (halfHeight - shown.length * pitch) / 2;

    shown.forEach((letter, i) => {
      // A space still advances the stack - it is the word break - but
      // there is nothing to draw for it.
      if (letter === " ") return;
      elements.push({
        id: id(`${name}-l${i}`),
        type: "text",
        x: geometry.x,
        y: stackTop + pitch * i,
        width: gutter,
        height: letterSize * 1.2,
        text: letter,
        fontSize: letterSize,
        fontFamily,
        fill: NEAR_BLACK,
        align: "center",
        opacity: 0.75,
      });
    });
  }

  elements.push({
    id: id("cross-v"),
    type: "figure",
    subType: "rect",
    x: midX - crossWidth / 2,
    y: gridTop,
    width: crossWidth,
    height: gridBottom - gridTop,
    fill: NEAR_BLACK,
    stroke: "none",
  });
  elements.push({
    id: id("cross-h"),
    type: "figure",
    subType: "rect",
    x: plotLeft,
    y: midY - crossWidth / 2,
    width: plotWidth,
    height: crossWidth,
    fill: NEAR_BLACK,
    stroke: "none",
  });

  const quadrantFontSize = ptToPx(QUADRANT_FONT_PT);
  const quadrants = config.quadrants ?? ["", "", "", ""];
  const corners: Array<[string, number, number]> = [
    ["tl", plotLeft, gridTop],
    ["tr", midX, gridTop],
    ["bl", plotLeft, midY],
    ["br", midX, midY],
  ];
  // All four names at one size - see fitLabelSet.
  const quadrantLabels = fitLabelSet(
    corners.map((_, q) => ({ text: quadrants[q] ?? "", widthPx: halfWidth - padding * 2 })),
    [quadrantFontSize, ptToPx(6), ptToPx(5)]
  );
  corners.forEach(([name, x, y], q) => {
    if (!quadrants[q]) return;
    const fitted = { text: quadrantLabels.texts[q], fontSizePx: quadrantLabels.fontSizePx };
    elements.push({
      id: id(`q-${name}`),
      type: "text",
      x: x + padding,
      y: y + (labelBand - fitted.fontSizePx * 1.2) / 2,
      width: halfWidth - padding * 2,
      height: fitted.fontSizePx * 1.2,
      text: fitted.text,
      fontSize: fitted.fontSizePx,
      fontFamily,
      fill: NEAR_BLACK,
      align: "left",
    });
  });

  return elements;
}
