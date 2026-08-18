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

export type LabeledBoxConfig = {
  heading: string;
  ruled: boolean;
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
const DIVIDER_WIDTH_PT = 0.5;
const HEADER_HEIGHT_SINGLE_LINE_PT = 13.7;
// Extra room for a wrapped second line at 7pt.
const HEADER_HEIGHT_TWO_LINE_PT = 24.7;
// Horizontal inset for the heading text from the box's side borders —
// measured from the reference: "THINGS I'M GRATEFUL" bbox sits 8.0pt
// inside the box's left edge, 8.1pt inside the right.
const HEADING_HORIZONTAL_PADDING_PT = 8;
// ~0.25in at 300 DPI — not directly isolated from the PDF's vector data
// (its ruled-line paths are bundled in a way this extraction couldn't
// cleanly separate), kept as a reasonable notebook-line spacing.
const RULED_LINE_SPACING_PX = 75;

// The "0.525 still wrapped" data point that motivated bumping this to
// 0.68 turned out to be a red herring — that measurement was taken on
// the old 6x9in page's narrower sidebar column. Now that the page is
// 7x10in (wider sidebar), 0.525 correctly predicts a one-line fit and
// 0.68 was overcorrecting, forcing the taller 2-line box on headings
// that actually fit fine. Back to the measured value, with a small
// margin (not the bare 0.525) since this is still an estimate for a
// font (PT Serif) we don't measure directly against.
const SAFE_CHAR_WIDTH_RATIO = 0.55;
function headingNeedsTwoLines(heading: string, availableWidthPx: number): boolean {
  const estimatedWidthAt8pt = heading.length * ptToPx(8) * SAFE_CHAR_WIDTH_RATIO;
  return estimatedWidthAt8pt > availableWidthPx;
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
  const wraps = headingNeedsTwoLines(heading, headingAvailableWidth);
  return ptToPx(wraps ? HEADER_HEIGHT_TWO_LINE_PT : HEADER_HEIGHT_SINGLE_LINE_PT);
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
  const wraps = headingNeedsTwoLines(heading, headingAvailableWidth);
  return ptToPx(wraps ? 7 : 8);
}

export function renderLabeledBox(
  geometry: { x: number; y: number; width: number; height: number },
  config: LabeledBoxConfig,
  idPrefix: string,
  fontFamily: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  let idCounter = 0;
  const nextId = () => `${idPrefix}-${idCounter++}`;
  const FONT_FAMILY = fontFamily;

  const headingPadding = ptToPx(HEADING_HORIZONTAL_PADDING_PT);
  const headingAvailableWidth = geometry.width - headingPadding * 2;
  const wraps = headingNeedsTwoLines(config.heading, headingAvailableWidth);
  const headerHeight = ptToPx(
    wraps ? HEADER_HEIGHT_TWO_LINE_PT : HEADER_HEIGHT_SINGLE_LINE_PT
  );

  // Outer border — pure black, distinct from the near-black used for
  // finer lines elsewhere.
  elements.push({
    id: nextId(),
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
    id: nextId(),
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
  const headingFontSize = ptToPx(wraps ? 7 : 8);
  if (wraps) {
    elements.push({
      id: nextId(),
      type: "text",
      x: geometry.x + headingPadding,
      y: geometry.y,
      width: headingAvailableWidth,
      height: headerHeight,
      text: config.heading.toUpperCase(),
      fontSize: headingFontSize,
      fontFamily: FONT_FAMILY,
      align: "center",
      verticalAlign: "middle",
    });
  } else {
    const headingTextHeight = headingFontSize * 1.2;
    elements.push({
      id: nextId(),
      type: "text",
      x: geometry.x + headingPadding,
      y: geometry.y + (headerHeight - headingTextHeight) / 2,
      width: headingAvailableWidth,
      height: headingTextHeight,
      text: config.heading.toUpperCase(),
      fontSize: headingFontSize,
      fontFamily: FONT_FAMILY,
      align: "center",
    });
  }

  // Ruled body lines, if explicitly requested — default is blank, no
  // horizontal lines inside the box (matches the reference: the sidebar
  // boxes are blank writing space, not a ruled notebook).
  if (config.ruled) {
    const bodyTop = geometry.y + headerHeight;
    const bodyHeight = geometry.height - headerHeight;
    const lineCount = Math.floor(bodyHeight / RULED_LINE_SPACING_PX);
    const ruledLineWidth = ptToPx(0.5);
    for (let i = 1; i <= lineCount; i++) {
      elements.push({
        id: nextId(),
        type: "figure",
        subType: "rect",
        x: geometry.x + 8,
        y: bodyTop + i * RULED_LINE_SPACING_PX - ruledLineWidth / 2,
        width: geometry.width - 16,
        height: ruledLineWidth,
        fill: NEAR_BLACK,
        stroke: "none",
      });
    }
  }

  return elements;
}
