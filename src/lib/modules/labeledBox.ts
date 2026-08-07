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
// Horizontal inset for the heading text from the box's side borders.
const HEADING_HORIZONTAL_PADDING_PT = 6;
// ~0.25in at 300 DPI — not directly isolated from the PDF's vector data
// (its ruled-line paths are bundled in a way this extraction couldn't
// cleanly separate), kept as a reasonable notebook-line spacing.
const RULED_LINE_SPACING_PX = 75;

// The reference sizes long headings down to keep them on one line
// ("Things I'm Grateful For" measured at 7pt vs. 8pt for shorter
// headings like "Reminders"/"Notes") rather than letting them wrap and
// collide with the divider below — replicate that behavior by length.
function headingFontSizePt(heading: string): number {
  return heading.length > 15 ? 7 : 8;
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

  // Header divider line.
  elements.push({
    id: nextId(),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: geometry.y + headerHeight,
    width: geometry.width,
    height: 0,
    stroke: NEAR_BLACK,
    strokeWidth: ptToPx(DIVIDER_WIDTH_PT),
  });

  // Heading text, centered, inset from the side borders.
  const headingPadding = ptToPx(HEADING_HORIZONTAL_PADDING_PT);
  elements.push({
    id: nextId(),
    type: "text",
    x: geometry.x + headingPadding,
    y: geometry.y,
    width: geometry.width - headingPadding * 2,
    height: headerHeight,
    text: config.heading.toUpperCase(),
    fontSize: ptToPx(headingFontSizePt(config.heading)),
    fontFamily: FONT_FAMILY,
    align: "center",
    verticalAlign: "middle",
  });

  // Ruled body lines, if explicitly requested — default is blank, no
  // horizontal lines inside the box (matches the reference: the sidebar
  // boxes are blank writing space, not a ruled notebook).
  if (config.ruled) {
    const bodyTop = geometry.y + headerHeight;
    const bodyHeight = geometry.height - headerHeight;
    const lineCount = Math.floor(bodyHeight / RULED_LINE_SPACING_PX);
    for (let i = 1; i <= lineCount; i++) {
      elements.push({
        id: nextId(),
        type: "figure",
        subType: "rect",
        x: geometry.x + 8,
        y: bodyTop + i * RULED_LINE_SPACING_PX,
        width: geometry.width - 16,
        height: 0,
        stroke: NEAR_BLACK,
        strokeWidth: 0.5,
      });
    }
  }

  return elements;
}
