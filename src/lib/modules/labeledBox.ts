// The one reusable "bordered box with a heading" pattern that covers
// Monthly Mantra, Priorities, Reminders, Notes, Tentative Dates, and
// Things I'm Grateful For in the reference PDF — same visual element,
// different heading text and ruled/blank body.

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
const HEADER_HEIGHT_RATIO = 0.12;
// ~0.25in at 300 DPI — matches typical ruled-notebook line spacing.
const RULED_LINE_SPACING_PX = 75;

export function renderLabeledBox(
  geometry: { x: number; y: number; width: number; height: number },
  config: LabeledBoxConfig,
  idPrefix: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  let idCounter = 0;
  const nextId = () => `${idPrefix}-${idCounter++}`;

  const headerHeight = Math.max(
    ptToPx(16),
    geometry.height * HEADER_HEIGHT_RATIO
  );

  // Outer border.
  elements.push({
    id: nextId(),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    fill: "transparent",
    stroke: "#333333",
    strokeWidth: 1,
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
    stroke: "#333333",
    strokeWidth: 1,
  });

  // Heading text, centered.
  elements.push({
    id: nextId(),
    type: "text",
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: headerHeight,
    text: config.heading.toUpperCase(),
    // Measured from the reference PDF: sidebar box headings are 8pt.
    fontSize: ptToPx(8),
    fontFamily: FONT_FAMILY,
    align: "center",
    verticalAlign: "middle",
  });

  // Ruled body lines, if requested.
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
        stroke: "#cccccc",
        strokeWidth: 0.5,
      });
    }
  }

  return elements;
}
