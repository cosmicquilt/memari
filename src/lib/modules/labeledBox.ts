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
export type BoxRule = "none" | "lined" | "dotted";

export type LabeledBoxConfig = {
  heading: string;
  /** "none" | "lined" | "dotted". */
  rule?: BoxRule;
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

// The average character advance for this planner's serif, and the story
// of how it was measured, now live in textFit.ts - a fact about a
// typeface belongs somewhere the other modules can reach it, and they
// need it: nothing here can measure a string, so every module that has to
// keep a label inside a box works from this same number.
import { SAFE_CHAR_WIDTH_RATIO } from "@/lib/modules/textFit";
import {
  RULE_WIDTH_PT,
  contentTopAtLeastPx,
  rowHeightPx,
  type FrameLattice,
} from "@/lib/modules/moduleFrame";

/**
 * How a heading is set: the point size it is drawn at, and whether the
 * header band has to be the taller two-line one.
 *
 * The size and the wrap decision have to be made together, because the
 * fallback to 7pt can itself remove the need to wrap. They were made
 * separately - the wrap was decided at 8pt and the text then drawn at 7pt
 * whenever that said "wraps" - so a heading between the two widths got a
 * two-line band with a single 7pt line sitting at the top of it. That is
 * the "title box is too large and the text is at the top touching" case,
 * and it was dormant until the sidebar narrowed from 497px to 438px on
 * the dot lattice.
 *
 * Measured against real Newsreader in the browser rather than reasoned
 * about: "THINGS I'M GRATEFUL FOR" at 8pt is 421.3px against 371.3px of
 * available width, and at 7pt is 368.6px - so it fits on one line, at the
 * smaller size, and never needed the tall band. The 0.55 ratio itself
 * measured true to four decimal places (0.5495), so it stays.
 */
function headingLayout(heading: string, availableWidthPx: number): { fontPt: 7 | 8; wraps: boolean } {
  const fitsAt = (pt: 7 | 8) => heading.length * ptToPx(pt) * SAFE_CHAR_WIDTH_RATIO <= availableWidthPx;
  if (fitsAt(8)) return { fontPt: 8, wraps: false };
  if (fitsAt(7)) return { fontPt: 7, wraps: false };
  return { fontPt: 7, wraps: true };
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
export function computeLabeledBoxHeaderHeightPx(heading: string, boxWidthPx: number): number {
  const headingPadding = ptToPx(HEADING_HORIZONTAL_PADDING_PT);
  const headingAvailableWidth = boxWidthPx - headingPadding * 2;
  const { wraps } = headingLayout(heading ?? "", headingAvailableWidth);
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
export function computeLabeledBoxHeadingFontSizePx(heading: string, boxWidthPx: number): number {
  const headingPadding = ptToPx(HEADING_HORIZONTAL_PADDING_PT);
  const headingAvailableWidth = boxWidthPx - headingPadding * 2;
  return ptToPx(headingLayout(heading, headingAvailableWidth).fontPt);
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
  const { fontPt: headingFontPt, wraps } = headingLayout(heading, headingAvailableWidth);
  // The measured band, rounded UP to the lattice so its divider lands on a
  // dot row - one cell for a single-line heading, two for a wrapped one.
  // The reference's own 13.7pt/24.7pt are what the TEXT needs; the lattice
  // decides where the rule may sit. Reported as "lined notes also not
  // aligned with dots", which was the body rules, and this is the same
  // rule one band higher.
  const headerHeight =
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
  const headingFontSize = ptToPx(headingFontPt);
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
      y: geometry.y + (headerHeight - headingTextHeight) / 2,
      width: headingAvailableWidth,
      height: headingTextHeight,
      text: heading.toUpperCase(),
      fontSize: headingFontSize,
      fontFamily: FONT_FAMILY,
      align: "center",
    });
  }

  // Ruled body, if explicitly requested — default is blank, no marks inside
  // the box (matches the reference: the sidebar boxes are blank writing
  // space, not a ruled notebook).
  //
  // `rule` if it is there, the old `ruled` boolean if it is not. A box saved
  // before the three-state setting existed keeps drawing exactly what it drew.
  const rule: BoxRule = config.rule ?? (config.ruled ? "lined" : "none");
  if (rule !== "none") {
    // Ruled ON the dot lattice, not at a fixed offset below the heading.
    //
    // The lines used to start one spacing below the header band, and the
    // band is 13.7pt or 24.7pt depending on whether the heading wraps -
    // neither a lattice quantity - so the rules landed 11.9px above the
    // dots, and moved when the heading got longer. Reported as "lined
    // notes also not aligned with dots".
    //
    // Anchored to the lattice instead: the first rule is the first dot row
    // clear of the header, and every one after it is a whole cell down. A
    // heading that wraps now changes where the rules START and never where
    // they SIT, and two ruled boxes side by side line up with each other
    // whatever their headings say.
    const pitch = rowHeightPx(lattice);
    const bodyTop = geometry.y + headerHeight;
    const origin = lattice ? geometry.y - lattice.insetPx : geometry.y;
    const first = origin + Math.ceil((bodyTop - origin) / pitch) * pitch;
    // The lines a user actually writes on, and they were the heaviest
    // interior marks in the planner: a bare 0.5 written inline here, the
    // same weight as the box's own border, where the hours beside them are
    // 0.3. Nobody decided that; it was never stated anywhere to disagree
    // with. See moduleFrame's RULE_WIDTH_PT.
    const ruledLineWidth = ptToPx(RULE_WIDTH_PT);
    const bottom = geometry.y + geometry.height;
    // Numbered by which lattice row it is, not by which line it happens to
    // be - see this file's own note on semantic ids. A box whose heading
    // grows keeps the ids of the rules that did not move.
    // A DOT is the rule broken into pieces on the lattice's own columns, not
    // a dashed line at some invented spacing: the page is a 1/4in dot grid,
    // and a dotted box should be that grid showing through. Three times the
    // rule's own weight so a dot reads as a dot rather than as a speck - a
    // 0.3pt square at 300dpi is barely over one printed pixel.
    const dotSize = ruledLineWidth * 3;
    const columnPitch = pitch;
    const originX = lattice ? geometry.x - lattice.insetPx : geometry.x;
    const left = geometry.x + 8;
    const right = geometry.x + geometry.width - 8;

    for (let row = 0; ; row++) {
      const y = first + row * pitch;
      if (y > bottom - pitch / 4) break;
      // Numbered by which lattice row it is, not by which line it happens to
      // be - see this file's own note on semantic ids. A box whose heading
      // grows keeps the ids of the rules that did not move.
      const rowIndex = Math.round((y - origin) / pitch);
      if (rule === "lined") {
        elements.push({
          id: id(`rule${rowIndex}`),
          type: "figure",
          subType: "rect",
          x: left,
          y: y - ruledLineWidth / 2,
          width: geometry.width - 16,
          height: ruledLineWidth,
          fill: NEAR_BLACK,
          stroke: "none",
        });
        continue;
      }
      // Dotted: one dot per lattice COLUMN that falls inside the box, so
      // the dots of two boxes side by side line up with each other and with
      // every other mark on the page.
      const firstColumn = Math.ceil((left - originX) / columnPitch);
      for (let column = firstColumn; ; column++) {
        const x = originX + column * columnPitch;
        if (x > right) break;
        elements.push({
          id: id(`dot${rowIndex}-${column}`),
          type: "figure",
          subType: "rect",
          x: x - dotSize / 2,
          y: y - dotSize / 2,
          width: dotSize,
          height: dotSize,
          fill: NEAR_BLACK,
          stroke: "none",
        });
      }
    }
  }

  return elements;
}
