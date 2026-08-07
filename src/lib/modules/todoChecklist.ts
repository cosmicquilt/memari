// "TO-DO" checklist block, matching the reference's full-height variant
// (pages 10/11, 14/15 — both sides get one when there's no habit tracker
// on that page) and short variant (page 24, sharing space with a habit
// tracker). Same renderer either way — row count is however many fit in
// whatever height it's given, not hardcoded, so "full height" and
// "short, paired with habit-tracker" are just different allocations.
//
// Measured from hourlyjournal.pdf (page 10, get_drawings()): one
// checkbox+line segment per day-column, same width/pitch as the hourly
// grid's own day columns and reusing its exact 14.1pt checkbox width.

import { ptToPx } from "@/lib/print-spec";

export type TodoChecklistConfig = {
  dayCount: number; // matches the hourly-grid-core above it (3 or 4)
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

const FONT_FAMILY = "PT Serif";
const NEAR_BLACK = "#231F20";
const HEADER_HEIGHT_PT = 16.7;
const HEADER_FONT_PT = 12;
const HEADER_BORDER_WIDTH_PT = 0.5;
const ROW_HEIGHT_PT = 13.45;
const ROW_LINE_WIDTH_PT = 0.35;
const CHECKBOX_WIDTH_PT = 14.1; // same as hourlyGridCore's time-label box
const COLUMN_GUTTER_PT = 4.5; // same convention as hourlyGridCore
// Gap between hourly-grid-core's last ruled row line and this block's own
// top border — measured directly (get_drawings(), not text) from every
// "single full-height module, no habit-tracker sharing the page" sample
// in hourlyjournal.pdf (pages 3/4, 9/10, 13/14): row line at y=459.60,
// block top border at y=478.11, a consistent 18.51pt gap across all of
// them regardless of 3-day/4-day side. Applied as an internal offset
// (like weekTitle's topOffset) rather than tuned via grid row count, so
// it's exact regardless of row-quantization slack above this block.
const TOP_GAP_PT = 18.5;

export function renderTodoChecklist(
  geometry: { x: number; y: number; width: number; height: number },
  config: TodoChecklistConfig,
  idPrefix: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  let idCounter = 0;
  const nextId = () => `${idPrefix}-${idCounter++}`;

  const topGap = ptToPx(TOP_GAP_PT);
  const contentY = geometry.y + topGap;
  const contentHeight = geometry.height - topGap;

  const headerHeight = ptToPx(HEADER_HEIGHT_PT);
  const nominalRowHeight = ptToPx(ROW_HEIGHT_PT);
  const rowLineWidth = ptToPx(ROW_LINE_WIDTH_PT);
  const checkboxWidth = ptToPx(CHECKBOX_WIDTH_PT);
  const columnGutter = ptToPx(COLUMN_GUTTER_PT);
  const segmentWidth =
    (geometry.width - columnGutter * (config.dayCount - 1)) / config.dayCount;

  const rowCount = Math.max(
    0,
    Math.floor((contentHeight - headerHeight) / nominalRowHeight)
  );
  // Stretch the actual row height a hair beyond the nominal measured
  // value so rowCount whole rows exactly fill the allocated box, rather
  // than floor-rounding leaving unused space below the last row. This is
  // what makes this block's bottom edge land exactly on
  // geometry.y + geometry.height — matching labeledBox.ts's Notes box,
  // which always renders its border at the full allocated height with no
  // equivalent rounding gap. The stretch is sub-pixel in practice (a
  // rounding remainder spread across ~10 rows).
  const rowHeight =
    rowCount > 0 ? (contentHeight - headerHeight) / rowCount : nominalRowHeight;

  // Outer border around the whole block — reaches the full allocated
  // height exactly (see rowHeight comment above).
  elements.push({
    id: nextId(),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: contentY,
    width: geometry.width,
    height: contentHeight,
    fill: "transparent",
    stroke: NEAR_BLACK,
    strokeWidth: ptToPx(HEADER_BORDER_WIDTH_PT),
  });

  // "TO - DO" header, centered across the full width. Manually centered
  // vertically rather than relying on verticalAlign, which hasn't
  // reliably centered text elsewhere in this codebase.
  const headerFontSize = ptToPx(HEADER_FONT_PT);
  const headerTextHeight = headerFontSize * 1.2;
  elements.push({
    id: nextId(),
    type: "text",
    x: geometry.x,
    y: contentY + (headerHeight - headerTextHeight) / 2,
    width: geometry.width,
    height: headerTextHeight,
    text: "TO - DO",
    fontSize: headerFontSize,
    fontFamily: FONT_FAMILY,
    align: "center",
  });

  // Divider between the header band and the checklist grid.
  elements.push({
    id: nextId(),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: contentY + headerHeight - rowLineWidth / 2,
    width: geometry.width,
    height: rowLineWidth,
    fill: NEAR_BLACK,
    stroke: "none",
  });

  const gridTop = contentY + headerHeight;

  // Per-day-column checkbox+line segments, repeated for each row.
  for (let d = 0; d < config.dayCount; d++) {
    const segX = geometry.x + d * (segmentWidth + columnGutter);

    // Left edge of the checkbox column.
    elements.push({
      id: nextId(),
      type: "figure",
      subType: "rect",
      x: segX - rowLineWidth / 2,
      y: gridTop,
      width: rowLineWidth,
      height: rowCount * rowHeight,
      fill: NEAR_BLACK,
      stroke: "none",
    });

    // Vertical divider between checkbox and task line.
    elements.push({
      id: nextId(),
      type: "figure",
      subType: "rect",
      x: segX + checkboxWidth - rowLineWidth / 2,
      y: gridTop,
      width: rowLineWidth,
      height: rowCount * rowHeight,
      fill: NEAR_BLACK,
      stroke: "none",
    });

    for (let i = 0; i < rowCount; i++) {
      const rowY = gridTop + i * rowHeight;
      // Row line under both the checkbox and task-line cells.
      elements.push({
        id: nextId(),
        type: "figure",
        subType: "rect",
        x: segX,
        y: rowY + rowHeight - rowLineWidth / 2,
        width: segmentWidth,
        height: rowLineWidth,
        fill: NEAR_BLACK,
        stroke: "none",
        opacity: 0.6,
      });
    }
  }

  return elements;
}
