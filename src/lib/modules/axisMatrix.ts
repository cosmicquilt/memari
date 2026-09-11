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
 * HALF a cell for the across-axis words, not the full cell a head band
 * normally takes.
 *
 * The full-cell rule exists so that a band between the header and a
 * module's ROWS leaves a whole number of cells beneath it - otherwise the
 * remainder shows up as a last row half again as tall as the others (see
 * columnTable.ts, where that is spelled out, and the two reports behind
 * it). This module has no rows. Nothing below this band is measured in
 * cells: the cross is snapped to the nearest lattice line explicitly, and
 * the quadrant labels hang off the cross.
 *
 * So the band can be the size the type actually needs, and at a full cell
 * it was not - 6.5pt type in 75px left about 21px of air above and below,
 * half again what the heading above it gets. Reported as "there can be
 * less vertical above and below padding for the 'less' 'more' in the
 * matrix". Half a cell brings it in line, and matches the quadrant label
 * band, which is already half a cell.
 */
const AXIS_FONT_PT = 6.5;
/**
 * The air above and below the across-axis words.
 *
 * Matched to what the heading band gives its own heading - about 14 print
 * px each side - which is what "similar to the space for the matrix"
 * asked for. The band was a full cell, which left 21px: half again the
 * heading's, on smaller type, so the axis read as the loosest thing in
 * the module.
 */
const AXIS_BAND_PADDING_PT = 3.4;
/**
 * ...and so the band is the type plus that air, rather than a round
 * fraction of a cell.
 *
 * Bands elsewhere are whole cells because a whole number of cells has to
 * remain BELOW them for the rows to tile (see columnTable.ts, and the two
 * reports behind it). This module has no rows: the cross is snapped to
 * the nearest lattice line explicitly and the quadrant labels hang off
 * the cross, so nothing under this band is measured in cells and the band
 * is free to be the size the type needs. Derived from AXIS_FONT_PT so the
 * two cannot drift - changing the point size moves the band with it.
 */
const AXIS_BAND_HEIGHT_PT = AXIS_FONT_PT * 1.2 + AXIS_BAND_PADDING_PT * 2;
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
/**
 * Letters of a stacked label, as a multiple of their own size.
 *
 * 1.2, which is exactly the line height a text element is given - so the
 * advance a letter takes and the box it draws in are the same number. At
 * 1.15 they were not, and the last letter of a stack poked 3px below the
 * module's own border: a stack that fit by its advance did not fit by its
 * ink. Found by moduleHouseStyle.test.mts's "nothing leaves its box".
 */
const AXIS_LETTER_PITCH = 1.2;
/**
 * The advance the longest DEFAULT down-axis label needs, in letter slots.
 *
 * Stated here rather than measured off the schema because the
 * minimum-height rule may not read propValues (see getMinRowSpanForSlug's
 * comment on why), so it has to size for the module a fresh drop creates.
 *
 * The defaults were "Above the line" / "Below the line" - fourteen
 * characters, thirteen slots - and sizing the module to print that
 * vertically at the nominal size put its MINIMUM at 13 rows. That is a
 * third of a page for an empty module, and it showed: the palette card
 * renders at the minimum, so the matrix card came out 451px tall against
 * 96-197 for everything else, and a sidebar with 13 free rows is a rare
 * thing to find. Reported as the matrix not dropping at all.
 *
 * Sizing a module for its LABEL was the mistake. The label shrinks to fit
 * and never truncates now, so the minimum only has to keep the four
 * quadrants writable and the label legible at a short default.
 *
 * Five slots: "Above" / "Below", which Andrew asked for over the first
 * shortening to "High" / "Low" - it names the axis the way a quadrant
 * chart usually does, and costs one row over four slots.
 */
const AXIS_LABEL_DEFAULT_UNITS = 5;
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
  const boxes = m.headerHeightPx + m.axisBandHeightPx + quadrant * 2;

  // ...but the four boxes are not the binding constraint. The down axis is
  // set one letter per line down half the plot, so a long label needs
  // height the quadrants do not. At the old minimum the default labels
  // came out at about 3pt, and before the floor was removed they came out
  // chopped: reported as "not important gets cut off in eisenhower".
  //
  // Sized for the SCHEMA DEFAULT label, which is the one a fresh module
  // gets, at the nominal letter size. A user who types a longer one still
  // gets all of it - it simply sets smaller.
  const units = AXIS_LABEL_DEFAULT_UNITS;
  const halfNeeded = units * ptToPx(AXIS_LETTER_FONT_PT) * AXIS_LETTER_PITCH;
  // Both halves, plus the cell the lattice snap can take off the smaller
  // of them - sizing for the nominal half alone leaves the snapped one a
  // size short.
  const plotNeeded = halfNeeded * 2 + rowHeightPx();
  return Math.max(boxes, m.headerHeightPx + m.axisBandHeightPx + plotNeeded);
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
  // BOTH arms of the cross go on the lattice, not just the horizontal one.
  //
  // Only midY was snapped at first, on the reasoning that the horizontal
  // rule is the one that reads against the dot ROWS. It reads against the
  // columns just as plainly the other way up - reported as "vertical line
  // in eisenhower not aligned".
  const exactMidX = plotLeft + plotWidth / 2;
  const midX = lattice
    ? lattice.originX +
      Math.round((exactMidX - lattice.originX) / lattice.pitchPx) * lattice.pitchPx
    : exactMidX;
  // Measured from the snapped cross, so a label centres on the half it
  // actually has rather than on a nominal one - the same correction the
  // vertical halves already needed.
  const halfWidth = Math.min(midX - plotLeft, plotLeft + plotWidth - midX);
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
      // No letterSpacing - see moduleFrame's headerElements, and
      // monthTitle.ts for the measurement behind it.
    });
  });

  // The down axis, one letter per line in the gutter, centred in the half
  // it names. Each letter is its own text element - there is no other way
  // to stack them, since the renderer draws a text node as one unbroken
  // line - and each is named by its label and its position in it, so a
  // reworded axis replaces only the letters that actually changed.
  // Each half's REAL extent, not one nominal half-height for both.
  //
  // The cross is snapped to the nearest lattice line, so the two halves
  // are not the same height - and using one figure for both let the lower
  // label's last letter run past the module's own border. Found by
  // moduleHouseStyle.test.mts's "nothing leaves its box".
  const downEnds: Array<[string, string, number, number]> = [
    ["y-top", config.yTop ?? "", gridTop, midY - gridTop],
    ["y-bottom", config.yBottom ?? "", midY, gridBottom - midY],
  ];
  // Sized to FIT, not picked off a ladder.
  //
  // A ladder of three sizes bottomed out before "NOT IMPORTANT" fit, and
  // the overflow was then silently sliced off the end - reported as "not
  // important gets cut off in eisenhower". A stack is one letter per line,
  // so the size it needs is simple arithmetic; there is no reason to guess
  // at it and then truncate.
  //
  // Both ends take the SAME size, worked out from the longer of them, or
  // an axis reads as two different labels rather than two ends of one.
  const advanceUnits = (text: string) =>
    // A space is a word gap, not a letter: half a slot. It also buys back
    // the room that made the longest real label not fit.
    [...text].reduce((sum, ch) => sum + (ch === " " ? 0.5 : 1), 0);
  // One size for both ends - an axis labelled at two sizes reads as two
  // labels. Taken from the end that has the least room for what it says,
  // so whichever is tightest is the one that fits.
  const tightest = Math.min(
    ...downEnds.map(([, text, , height]) =>
      text ? height / Math.max(1, advanceUnits(text)) : Number.POSITIVE_INFINITY
    )
  );
  // NO lower clamp, deliberately. A floor means a label that still does
  // not fit has to lose characters off the end, and a missing letter is
  // invisible as a defect - "NOT IMPORTANT" printed as "NOT IMPORTAN"
  // reads as a label, just a wrong one. Type that is too small reads as
  // too small, which is a thing the user can see and fix by growing the
  // box. So the label always fits whole, and the MINIMUM height is what
  // keeps it readable - see getAxisMatrixMinHeightPx.
  const nominal = ptToPx(AXIS_LETTER_FONT_PT);
  const letterSize = Math.min(nominal, tightest / AXIS_LETTER_PITCH);
  const pitch = letterSize * AXIS_LETTER_PITCH;

  for (const [name, text, top, height] of downEnds) {
    if (!text) continue;
    const letters = [...text];
    const units = advanceUnits(text);
    // Centred on its own half, measured in the advance it actually uses.
    let cursor = top + Math.max(0, (height - units * pitch) / 2);

    letters.forEach((letter, i) => {
      const advance = letter === " " ? pitch * 0.5 : pitch;
      // Past the bottom of its half: stop rather than run into the other
      // label. Only reachable when even the floor size is too big.
      if (cursor + advance > top + height + 0.5) return;
      const at = cursor;
      cursor += advance;
      // A space advances the stack and draws nothing.
      if (letter === " ") return;
      elements.push({
        id: id(`${name}-l${i}`),
        type: "text",
        x: geometry.x,
        y: at,
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
