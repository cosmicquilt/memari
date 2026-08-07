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

const FONT_FAMILY = "PT Serif";
const NEAR_BLACK = "#231F20";
const OUTER_BORDER_WIDTH_PT = 0.5;
const DIVIDER_WIDTH_PT = 0.5;
const HEADER_HEIGHT_PT = 13.7;
// Horizontal inset for the heading text from the box's side borders —
// measured from the reference: "THINGS I'M GRATEFUL" bbox sits 8.0pt
// inside the box's left edge, 8.1pt inside the right.
const HEADING_HORIZONTAL_PADDING_PT = 8;
// ~0.25in at 300 DPI — not directly isolated from the PDF's vector data
// (its ruled-line paths are bundled in a way this extraction couldn't
// cleanly separate), kept as a reasonable notebook-line spacing.
const RULED_LINE_SPACING_PX = 75;

// The reference sizes long headings down to keep them on one line
// ("Things I'm Grateful For" measured at 7pt vs. 8pt for shorter
// headings like "Reminders"/"Notes") rather than letting them wrap and
// collide with the divider below. A length threshold was too coarse —
// it doesn't account for available width after padding — so this
// estimates actual rendered width per candidate size and picks the
// largest that fits, same idea PT Serif's own metrics would give.
const AVG_CHAR_WIDTH_RATIO = 0.52;
function fittingHeadingFontSizePt(heading: string, availableWidthPx: number): number {
  const candidates = [8, 7, 6, 5];
  for (const pt of candidates) {
    const estimatedWidthPx = heading.length * ptToPx(pt) * AVG_CHAR_WIDTH_RATIO;
    if (estimatedWidthPx <= availableWidthPx) return pt;
  }
  return candidates[candidates.length - 1];
}

export function renderLabeledBox(
  geometry: { x: number; y: number; width: number; height: number },
  config: LabeledBoxConfig,
  idPrefix: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  let idCounter = 0;
  const nextId = () => `${idPrefix}-${idCounter++}`;

  const headerHeight = ptToPx(HEADER_HEIGHT_PT);

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

  // Heading text, centered, inset from the side borders. Positioned
  // with a manually-computed vertical center rather than relying on
  // verticalAlign — that wasn't reliably centering text in a box much
  // taller than the text itself.
  const headingPadding = ptToPx(HEADING_HORIZONTAL_PADDING_PT);
  const headingAvailableWidth = geometry.width - headingPadding * 2;
  const headingFontSize = ptToPx(
    fittingHeadingFontSizePt(config.heading, headingAvailableWidth)
  );
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
