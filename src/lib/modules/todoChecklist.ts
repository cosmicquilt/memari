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

// Exposes just the height constants a live-resize preview needs to draw
// an approximate row grid client-side (NativePlannerEditor.tsx) without
// a server round trip on every row crossing — see that file's own
// comment on why a resize's real content stays frozen mid-drag
// otherwise (reported directly: the frozen rows visibly stop lining up
// with the live-resizing box edge). Deliberately only the nominal row
// height, not the render function's own stretch-to-fit adjustment
// (rowHeight in renderTodoChecklist, which nudges rowCount whole rows
// to exactly fill the final committed height) — that adjustment is a
// sub-pixel correction against one specific, known final height; a
// live preview has no single height to correct against while the drag
// is still moving, so it isn't worth reproducing here. Close enough for
// a transient drag-time approximation; the real renderer takes over
// with pixel-exact spacing the moment the drag actually commits.
export function getTodoChecklistRowMetricsPx(): {
  headerHeightPx: number;
  nominalRowHeightPx: number;
  rowLineWidthPx: number;
} {
  return {
    headerHeightPx: ptToPx(HEADER_HEIGHT_PT),
    nominalRowHeightPx: ptToPx(ROW_HEIGHT_PT),
    rowLineWidthPx: ptToPx(ROW_LINE_WIDTH_PT),
  };
}

export function renderTodoChecklist(
  geometry: { x: number; y: number; width: number; height: number },
  config: TodoChecklistConfig,
  idPrefix: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  let idCounter = 0;
  const nextId = () => `${idPrefix}-${idCounter++}`;

  // Renders flush with its own allocated cell (contentY === geometry.y)
  // — this used to push its content down by a fixed 18.5pt to match the
  // reference PDF's gap below the hourly grid, back when this block was
  // always auto-placed directly beneath one. Now that it's a freely
  // user-placed module (drag/drop, any position), that assumption no
  // longer holds — baking in a gap meant for one specific relative
  // position would leave dead space at the top everywhere else instead.
  // Any desired gap now comes from the grid position itself (rowStart),
  // same as every other freely-placed module.
  const contentY = geometry.y;
  const contentHeight = geometry.height;

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
