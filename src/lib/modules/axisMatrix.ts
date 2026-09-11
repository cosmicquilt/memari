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
  RULE_WIDTH_PT,
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
 * Tight - about 6 print px each side.
 *
 * This went 21px (a full cell band) -> 14px (matched to the heading, asked
 * for as "similar to the space for the matrix") -> 6px, asked for again as
 * "'more' 'less' can have less above and below padding". The axis words
 * are a caption on the plot rather than a heading of their own, so they
 * can sit closer to it than the module's title sits to its rule; and every
 * pixel taken out of this band goes to the plot, which is what makes the
 * quadrants squarer.
 */
const AXIS_BAND_PADDING_PT = 1.5;
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
 * Air each end of a stacked label, so the two of them cannot meet.
 *
 * Each stack is centred in its own half, and the halves share an edge at
 * the cross - so a label long enough to fill its half runs right up to the
 * horizontal arm, and the last letter of one sits directly above the first
 * letter of the other. Reported as "'above' and 'below' also overlap",
 * then corrected to "almost overlap", which is exactly the case: they
 * touch rather than collide, and touching reads as one word.
 */
const AXIS_STACK_PADDING_PT = 4;
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
// There was a SQUARE_PLOT flag here, advertised as the way to let the plot
// fill its box again. The construction that followed made it dead - the
// plot is now sized from the lattice rather than from a branch - and a
// switch that cannot switch is worse than no switch, because it gets
// believed. Same mistake as the LATTICE_ALIGNED_CONTENT flag in
// moduleFrame, retired for the same reason. To un-square this, the change
// is in the renderer: take plotWidth/plotHeight from the available area
// instead of from `side`.
/**
 * Half a cell, counted into the module's MINIMUM height as the room a
 * quadrant's name needs.
 *
 * No longer a band the name is drawn in - the name is centred in its
 * quadrant now - but a quadrant still has to be tall enough to hold one
 * without crowding whatever is written around it, and that is what this
 * reserves. See getAxisMatrixMinHeightPx.
 */
const QUADRANT_LABEL_HEIGHT_PT = 9;
const QUADRANT_FONT_PT = 11;
/**
 * The cross is an INTERIOR RULE, at the interior rule weight.
 *
 * It was 0.5pt, which is the weight of a box BORDER - and the codebase is
 * consistent about the difference: 0.5 for an outer edge, 0.35 for a rule
 * inside it (todoChecklist, habitTracker and moduleFrame all say so). A
 * module whose only interior lines are the cross had nothing next to it to
 * make the mismatch obvious, so it read simply as heavy. Reported as "the
 * interior crossed lines within the matrix look too thick".
 *
 * Taken from moduleFrame rather than written as 0.35 here, so there is one
 * description of what an interior rule weighs.
 *
 * Worth knowing when judging this on screen: the renderer grows any
 * fill-only hairline to MIN_ONSCREEN_RECT_PX device pixels, so below about
 * 45% zoom this and a 0.5pt rule are clamped to the same width and look
 * identical. The difference is real at higher zoom and in print.
 */
const CROSS_WIDTH_PT = RULE_WIDTH_PT;
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
  const crossWidth = ptToPx(CROSS_WIDTH_PT);
  const padding = ptToPx(PADDING_PT);

  elements.push(borderElement(geometry, id));
  elements.push(...headerElements(geometry, config.heading ?? "", id, fontFamily, bandTop));

  const axisFontSize = ptToPx(AXIS_FONT_PT);
  // A SQUARE PLOT, SITTING ON THE BOTTOM BORDER, WITH ITS CENTRE ON THE
  // LATTICE - all three at once, which takes choosing the side rather
  // than taking whatever is available.
  //
  // Those three pull against each other. A square plot centred in a tall
  // box leaves the vertical arm stopping short of the border ("vertical
  // line in matrix doesn't reach bottom"), and snapping the cross to the
  // nearest lattice line after the fact pushes it up to half a cell off
  // the plot's own centre, so the four quadrants come out unequal -
  // measured at 293/331 across and 330/294 down, which is what "still
  // doesn't look like cross is square" was seeing. Squaring the PLOT was
  // never enough on its own; the CROSS has to land in the middle of it.
  //
  // The construction: the box's bottom edge is 6px above a lattice line
  // (that is the box inset), so a square whose bottom sits on that edge
  // has its centre ON the half-cell pitch exactly when its side is
  // 75k - 12 for a whole k. Pick the largest such side that fits, put its
  // bottom on the border and its centre on that pitch, and everything
  // follows - equal quadrants, a square plot, an arm reaching the bottom,
  // and both arms on the pitch, with no snapping anywhere.
  //
  // HALF cells, not whole ones. Requiring the centre on a whole cell
  // means side = 150m - 12, which is one step in every 150px, and at a
  // sidebar's 387px of width the largest that fits is 288 - a quarter of
  // the module thrown away, with the slack piling up as a gap under the
  // axis words. Reported against the palette card, which draws the module
  // at its minimum and so shows this at its worst: "gap below 'less'
  // 'more' is very large".
  //
  // A half cell is still on the pitch - it divides the cell, which is the
  // rule the whole lattice is built on - and this project has already
  // settled that a rule must be ON a dot or CLEARLY BETWEEN two, never a
  // near-miss. Halving the step to 75px takes that sidebar case from 288
  // to 363 of the 387 available.
  const gutter = ptToPx(AXIS_GUTTER_WIDTH_PT);
  const pitch = lattice?.pitchPx ?? ptToPx(18);
  const availableTop = bandTop + axisBand;
  const boxBottom = geometry.y + geometry.height;
  const boxRight = geometry.x + geometry.width;
  // The lattice column nearest the box's middle. For the even column
  // spans a page actually uses this IS the middle; for an odd one the
  // plot sits a fraction off-centre in the box, which is invisible, and
  // the quadrants stay equal either way because both halves are side/2.
  const midX = lattice
    ? lattice.originX +
      Math.round((geometry.x + geometry.width / 2 - lattice.originX) / pitch) * pitch
    : geometry.x + geometry.width / 2;

  let side = 0;
  for (let k = Math.ceil((boxBottom - availableTop + 12) / pitch); k >= 1; k--) {
    const candidate = pitch * k - 12;
    if (candidate > boxBottom - availableTop) continue;
    if (midX - candidate / 2 < geometry.x + gutter) continue;
    if (midX + candidate / 2 > boxRight) continue;
    side = candidate;
    break;
  }
  // Nothing in the sequence fits - only reachable below the module's own
  // minimum. Fall back to filling what there is rather than drawing
  // nothing.
  const squared = side > 0;
  const plotWidth = squared ? side : boxRight - (geometry.x + gutter);
  const plotHeight = squared ? side : boxBottom - availableTop;
  const plotLeft = squared ? midX - side / 2 : geometry.x + gutter;
  const gridTop = boxBottom - plotHeight;
  const gridBottom = boxBottom;
  const midY = gridTop + plotHeight / 2;

  // Both halves are side/2 by construction, so this is exact rather than
  // a correction for a snapped cross.
  const halfWidth = Math.min(midX - plotLeft, plotLeft + plotWidth - midX);
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
  const stackPadding = ptToPx(AXIS_STACK_PADDING_PT);
  const tightest = Math.min(
    ...downEnds.map(([, text, , height]) =>
      text
        ? Math.max(0, height - stackPadding * 2) / Math.max(1, advanceUnits(text))
        : Number.POSITIVE_INFINITY
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
  const letterPitch = letterSize * AXIS_LETTER_PITCH;

  for (const [name, text, top, height] of downEnds) {
    if (!text) continue;
    const letters = [...text];
    const units = advanceUnits(text);
    // Centred on its own half, measured in the advance it actually uses.
    let cursor = top + Math.max(stackPadding, (height - units * letterPitch) / 2);

    letters.forEach((letter, i) => {
      const advance = letter === " " ? letterPitch * 0.5 : letterPitch;
      // Past the bottom of its half: stop rather than run into the other
      // label. Only reachable when even the floor size is too big.
      if (cursor + advance > top + height - stackPadding + 0.5) return;
      const at = cursor;
      cursor += advance;
      // A space advances the stack and draws nothing.
      if (letter === " ") return;
      elements.push({
        id: id(`${name}-l${i}`),
        type: "text",
        // Immediately left of the PLOT, not at the module's own edge.
        // Now that the plot is centred, those are different places, and a
        // label stranded against the border reads as belonging to the box
        // rather than to the axis.
        x: plotLeft - gutter,
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

  // Centred in the quadrant, large and pale - a name for the box rather
  // than a label on its corner.
  //
  // They sat top-left at 7pt in full black, which reads as a heading the
  // writing has to start under. Asked for as "schedule do delete delegate
  // to be centered within quadrant larger font light gray": pale enough to
  // write straight over, which is what a quadrant's own name is for.
  const quadrantFontSize = ptToPx(QUADRANT_FONT_PT);
  const quadrants = config.quadrants ?? ["", "", "", ""];
  const halfHeightPlot = plotHeight / 2;
  const corners: Array<[string, number, number]> = [
    ["tl", plotLeft, gridTop],
    ["tr", midX, gridTop],
    ["bl", plotLeft, midY],
    ["br", midX, midY],
  ];
  // All four names at one size - see fitLabelSet.
  const quadrantLabels = fitLabelSet(
    corners.map((_, q) => ({ text: quadrants[q] ?? "", widthPx: halfWidth - padding * 2 })),
    [quadrantFontSize, ptToPx(9), ptToPx(8), ptToPx(7)]
  );
  corners.forEach(([name, x, y], q) => {
    if (!quadrants[q]) return;
    const fitted = { text: quadrantLabels.texts[q], fontSizePx: quadrantLabels.fontSizePx };
    const textHeight = fitted.fontSizePx * 1.2;
    elements.push({
      id: id(`q-${name}`),
      type: "text",
      x: x + padding,
      // Centred both ways in the quadrant it names.
      y: y + (halfHeightPlot - textHeight) / 2,
      width: halfWidth - padding * 2,
      height: textHeight,
      text: fitted.text,
      fontSize: fitted.fontSizePx,
      fontFamily,
      fill: NEAR_BLACK,
      align: "center",
      // Pale. The same near-black at low opacity rather than a second
      // grey, so it stays one ink - see habitTracker's PLACEHOLDER_OPACITY
      // for the established treatment of "printed, but meant to be written
      // over".
      opacity: 0.38,
    });
  });

  return elements;
}
