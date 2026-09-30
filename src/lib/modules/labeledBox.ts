// The one reusable "bordered box with a heading" pattern that covers
// Monthly Mantra, Priorities, Reminders, Notes, Tentative Dates, and
// Things I'm Grateful For in the reference PDF — same visual element,
// different heading text and ruled/blank body.
//
// Measurements pulled from hourlyjournal.pdf's vector path data
// (pymupdf get_drawings()): the outer box border is pure black, the
// header divider is near-black (matching hourlyGridCore's LINE_COLOR),
// and the header band is ~13.7pt tall — same convention as the
// day-header tabs in the hourly grid.

/**
 * How the body of the box is ruled.
 *
 * Widened from a boolean, which could only say lined-or-not. A dot grid is
 * the third thing people actually want, and the page already has one - see
 * `rule === "dotted"` below, where the dots are the page's OWN lattice
 * showing through rather than a second grid invented for the box.
 */
export type BoxRule = FillStyle;

export type LabeledBoxConfig = {
  heading: string;
  /** "none" | "lined" | "dotted" | "graph". */
  rule?: BoxRule;
  /** What each writing line starts with - see rowMarkerElement. */
  lineStart?: RowMarker;
  /** One column, or two with a divider on the lattice. */
  columns?: 1 | 2;
  /**
   * The heading and its band, or none - a box that is only writing space.
   * On by default, so the palette shows the box as NOTES; turned off, the
   * band becomes the first row and every rule stays on its dot. Asked
   * 2026-09-30: "they can toggle it off but in the palette it should show
   * with the heading notes".
   */
  showHeading?: boolean;
  /** THE OLD BOOLEAN. Read only when `rule` is absent, so a box saved before
   *  this existed still draws its lines. Nothing writes it any more; the
   *  editor writes `rule`. Same shape of change as quote-block's text->body
   *  rename, and kept for the same reason: a stored value nobody migrated
   *  must not silently become something else. */
  ruled?: boolean;
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
import { latticeFill, latticeRowsIn, rowMarkerElement, rowMarkerOf, type FillStyle, type RowMarker } from "./latticeFill";

const NEAR_BLACK = "#231F20";
const OUTER_BORDER_WIDTH_PT = 0.5;
// The header divider is a rule INSIDE the box, so it takes the house
// interior weight like every other one - it was 0.5, the weight of the
// border right above it. See moduleFrame's RULE_WIDTH_PT.
const DIVIDER_WIDTH_PT = RULE_WIDTH_PT;
const HEADER_HEIGHT_SINGLE_LINE_PT = 13.7;
// Extra room for a wrapped second line at 7pt.
const HEADER_HEIGHT_TWO_LINE_PT = 24.7;
// Horizontal inset for the heading text from the box's side borders —
// measured from the reference: "THINGS I'M GRATEFUL" bbox sits 8.0pt
// inside the box's left edge, 8.1pt inside the right.
const HEADING_HORIZONTAL_PADDING_PT = 8;
// The ruled-line spacing is the lattice cell itself now - see the ruled
// body below. It was written as 75 here, "~0.25in at 300 DPI... kept as a
// reasonable notebook-line spacing", which is the right number arrived at
// independently; taking it from the lattice means it cannot drift from it.

import { capCentredTextY } from "@/lib/modules/textFit";
import {
  RULE_WIDTH_PT,
  contentTopAtLeastPx,
  fitHeading,
  rowHeightPx,
  type FrameLattice,
} from "@/lib/modules/moduleFrame";

/**
 * How a heading is set: the size it is drawn at, and whether the header
 * band has to be the taller two-line one.
 *
 * THE HOUSE HEADING RULE, fitHeading: the largest of 8, 7, 6 and 5pt at
 * which it sets on one line, measured. It was this module's own rule - a
 * flat 0.55 advance, 8pt or 7pt, then wrap - and the 0.55 was measured at
 * 100px, where Newsreader's optical size gives its narrow display cut: at a
 * heading's size "THINGS I'M GRATEFUL FOR" is 389px, not the 369 it
 * predicted, so it printed 18px out of its 371px box at 7pt and was clipped
 * in the editor. It fits at 6pt, which is where it now sits (asked for,
 * 2026-09-29: "make the gratitude heading 6pt so it fits").
 *
 * Wrapping is now only for a heading stored before the editor stopped
 * taking letters past the smallest size, so nothing that exists loses
 * words. The size and the wrap are still decided together - deciding them
 * apart once gave a two-line band with one line in it.
 */
function headingLayout(
  heading: string,
  availableWidthPx: number,
  fontFamily: string
): { fontSizePx: number; wraps: boolean } {
  const { fontSizePx, fits } = fitHeading(heading, availableWidthPx, fontFamily);
  return { fontSizePx, wraps: !fits };
}

// Exposed separately from renderLabeledBox so the native editor's inline
// heading-edit overlay (NativePlannerEditor.tsx) can size itself to
// match the box's *actual* rendered header band instead of guessing a
// fixed height — a mismatch was reported live ("the header gets taller")
// once a fixed-height overlay didn't line up with a real single-line
// header's true, shorter height. Deliberately re-derives wraps here
// rather than having renderLabeledBox call this internally and return it
// alongside its elements — that would mean threading an extra return
// value through a function whose return shape (a flat RenderedElement[])
// every other caller (renderModuleInstance.ts) already depends on being
// exactly that; a few duplicated lines here is cheaper than restructuring
// that.
export function computeLabeledBoxHeaderHeightPx(heading: string, boxWidthPx: number, fontFamily: string): number {
  const headingPadding = ptToPx(HEADING_HORIZONTAL_PADDING_PT);
  const headingAvailableWidth = boxWidthPx - headingPadding * 2;
  const { wraps } = headingLayout(heading ?? "", headingAvailableWidth, fontFamily);
  // Must agree with renderLabeledBox's own band to the pixel - this is what
  // the editor's inline heading-edit overlay sizes itself to, and a
  // mismatch was reported live as "the header gets taller". Same snap,
  // via the same helper.
  return (
    contentTopAtLeastPx(
      { x: 0, y: 0, width: boxWidthPx, height: 0 },
      ptToPx(wraps ? HEADER_HEIGHT_TWO_LINE_PT : HEADER_HEIGHT_SINGLE_LINE_PT)
    ) - 0
  );
}

// Same reasoning and same duplicated wrap-check as the height function
// just above — exposed so the native editor's inline heading-edit
// <input> can render text at the *actual* size the committed heading
// renders at (ptToPx(7 or 8)), instead of a plain CSS px guess. That
// guess (18) was correct-looking in isolation but tiny next to
// everything else on the canvas, which is all sized in this same
// print-pixel space (ptToPx(8) is ~33px) and scaled down together by
// the canvas's own zoom transform — reported live as "the font turns
// very small" while editing.
export function computeLabeledBoxHeadingFontSizePx(heading: string, boxWidthPx: number, fontFamily: string): number {
  const headingPadding = ptToPx(HEADING_HORIZONTAL_PADDING_PT);
  const headingAvailableWidth = boxWidthPx - headingPadding * 2;
  return headingLayout(heading, headingAvailableWidth, fontFamily).fontSizePx;
}

export function renderLabeledBox(
  geometry: { x: number; y: number; width: number; height: number },
  config: LabeledBoxConfig,
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

  const headingPadding = ptToPx(HEADING_HORIZONTAL_PADDING_PT);
  const headingAvailableWidth = geometry.width - headingPadding * 2;
  // Total in its config: a ModuleInstance whose propValues lost its
  // heading - a row written before the schema had one, a preset that
  // forgot it - drew nothing at all here, because `undefined.length`
  // inside headingLayout throws and a throw inside a render takes down the
  // whole PAGE, not one module. Found by moduleHouseStyle.test.mts, which
  // renders every registered module with no props.
  const heading = config.heading ?? "";
  const { fontSizePx: headingFontSize, wraps } = headingLayout(heading, headingAvailableWidth, FONT_FAMILY);
  // The measured band, rounded UP to the lattice so its divider lands on a
  // dot row - one cell for a single-line heading, two for a wrapped one.
  // The reference's own 13.7pt/24.7pt are what the TEXT needs; the lattice
  // decides where the rule may sit. Reported as "lined notes also not
  // aligned with dots", which was the body rules, and this is the same
  // rule one band higher.
  const headed = config.showHeading !== false;
  const headerHeight = !headed ? 0 :
    contentTopAtLeastPx(
      geometry,
      ptToPx(wraps ? HEADER_HEIGHT_TWO_LINE_PT : HEADER_HEIGHT_SINGLE_LINE_PT),
      lattice
    ) - geometry.y;

  // Outer border — pure black, distinct from the near-black used for
  // finer lines elsewhere.
  elements.push({
    id: id("border"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    fill: "transparent",
    stroke: "#000000",
    strokeWidth: ptToPx(OUTER_BORDER_WIDTH_PT),
  });

  if (headed) {
    // Header divider line. A filled thin rect, not a zero-height stroked
    // one — Polotno doesn't reliably render sub-2px strokes on degenerate
    // (zero-height) shapes at the exact requested color.
    const dividerWidth = ptToPx(DIVIDER_WIDTH_PT);
    elements.push({
      id: id("header-rule"),
      type: "figure",
      subType: "rect",
      x: geometry.x,
      y: geometry.y + headerHeight - dividerWidth / 2,
      width: geometry.width,
      height: dividerWidth,
      fill: NEAR_BLACK,
      stroke: "none",
    });

    // Heading text, centered, inset from the side borders. Single-line
    // headings are manually vertically centered — verticalAlign wasn't
    // reliably centering text in a box much taller than the text itself.
    // Two-line headings instead get the full (taller) header box and are
    // left to wrap+center naturally within it, since their true wrapped
    // height isn't something we can predict precisely up front.
    if (wraps) {
      elements.push({
        id: id("heading"),
        type: "text",
        x: geometry.x + headingPadding,
        y: geometry.y,
        width: headingAvailableWidth,
        height: headerHeight,
        text: heading.toUpperCase(),
        fontSize: headingFontSize,
        fontFamily: FONT_FAMILY,
        align: "center",
        verticalAlign: "middle",
      });
    } else {
      const headingTextHeight = headingFontSize * 1.2;
      elements.push({
        id: id("heading"),
        type: "text",
        x: geometry.x + headingPadding,
        y: capCentredTextY(geometry.y, headerHeight, headingFontSize, FONT_FAMILY),
        width: headingAvailableWidth,
        height: headingTextHeight,
        text: heading.toUpperCase(),
        fontSize: headingFontSize,
        fontFamily: FONT_FAMILY,
        align: "center",
      });
    }
  }

  // The body: blank (the default, and the reference - the sidebar boxes are
  // blank writing space), lined, dotted or graph, drawn by the shared fill so
  // a note box agrees with every other filled module. See latticeFill.ts.
  //
  // `rule` if it is there, the old `ruled` boolean if it is not. A box saved
  // before the setting existed keeps drawing exactly what it drew.
  //
  // Anchored to the lattice, not to the heading: the first rule is the first
  // dot row clear of the header ("lined notes also not aligned with dots"),
  // and not ON the header rule ("omit the dots that coincide with the line
  // below the title of the box", 2026-09-29) - both now latticeFill's rules.
  const rule: BoxRule = config.rule ?? (config.ruled ? "lined" : "none");
  const bodyTop = geometry.y + headerHeight;
  const bottom = geometry.y + geometry.height;
  const left = geometry.x;
  const right = geometry.x + geometry.width;
  // Two columns: a divider on the lattice column nearest the middle, each
  // half filled on its own. Asked in the module-edits list: a note box under
  // the hours is 4.5in wide, and its lines were longer than anyone writes.
  const pitch = rowHeightPx(lattice);
  const originX = lattice ? geometry.x - lattice.insetPx : geometry.x;
  const twoColumns = config.columns === 2 && geometry.width >= pitch * 4;
  const divider = twoColumns ? originX + Math.round((geometry.x + geometry.width / 2 - originX) / pitch) * pitch : null;
  if (divider !== null) {
    elements.push({
      id: id("column-rule"),
      type: "figure",
      subType: "rect",
      x: divider - ptToPx(RULE_WIDTH_PT) / 2,
      y: bodyTop,
      width: ptToPx(RULE_WIDTH_PT),
      height: bottom - bodyTop,
      fill: NEAR_BLACK,
      stroke: "none",
      opacity: 0.6,
    });
  }
  const halves =
    divider === null
      ? [{ tag: "", left, right }]
      : [
          { tag: rule === "lined" || rule === "graph" ? "c0-" : "", left, right: divider },
          { tag: rule === "lined" || rule === "graph" ? "c1-" : "", left: divider, right },
        ];
  for (const half of halves) {
    elements.push(
      ...latticeFill({
        style: rule,
        region: { left: half.left, top: bodyTop, right: half.right, bottom },
        geometry,
        lattice,
        id,
        tag: half.tag,
      })
    );
  }

  // What each line starts with: a number, a bullet or a box to tick - a
  // lined box turned into a list without becoming a to-do. Only on lined or
  // dotted writing rows; graph paper and a blank box have no lines to start.
  const marker = rowMarkerOf(config.lineStart);
  if (marker !== "none" && (rule === "lined" || rule === "dotted")) {
    let count = 0;
    for (const half of halves) {
      for (const row of latticeRowsIn(geometry, lattice, bodyTop, bottom)) {
        count++;
        const element = rowMarkerElement({
          marker,
          number: count,
          id: id(`${half.tag}start${row.index}`),
          x: half.left + 12,
          bandTop: row.y - pitch,
          bandHeight: pitch,
          fontFamily: FONT_FAMILY,
          textY: capCentredTextY,
        });
        if (element) elements.push(element);
      }
    }
  }

  return elements;
}
