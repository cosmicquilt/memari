// Renders the "core" monthly calendar-grid block: a day-of-week header
// row + N week-rows of dated cells (each cell: a small date-number strip
// over a taller blank notes area), matching the reference's monthly
// layout (pages 2/3 of hourlyjournal.pdf — the January spread). Pure
// function, no Polotno/React dependency, same convention as
// hourlyGridCore.ts.
//
// Every constant below is measured directly from the reference PDF
// (pymupdf get_text('dict') / get_drawings() on pages 2 and 22 — January,
// a 5-row month, and March, a 6-row month), not eyeballed:
//
// - Header height (day-of-week band) and each row's date-number-strip
//   height are FIXED regardless of week count — confirmed identical
//   (~13.37pt header, ~10.7-10.9pt per date-strip) on both the 5-row
//   January page and the 6-row March page.
// - Only the per-row BODY height (the blank notes area under the date
//   number) stretches to absorb whatever's left — 5-row body rows
//   averaged ~63.8pt, 6-row averaged ~51.2pt, against a near-identical
//   total content budget (~373-374pt) on both pages. Same "N rows must
//   exactly fill an allocated height" family of math as
//   todoChecklist.ts/habitTracker.ts, just applied to one sub-component
//   of the row instead of the whole thing.
// - Day columns share borders with zero gutter between them (unlike
//   hourlyGridCore's 4.5pt COLUMN_GUTTER_PT) — confirmed via the
//   measured column boundaries landing exactly adjacent (137.67 ->
//   245.92 -> 353.93 -> 462.19, no gap).
// - Day-of-week header text is centered (unlike hourlyGridCore's
//   left-aligned day name), and carries no date number of its own — the
//   date number lives in each row's own date-strip instead, since a
//   month grid needs many rows of dates per column, not hourlyGridCore's
//   fixed one-per-column.

import { ptToPx } from "@/lib/print-spec";
import type { MonthCalendarCell } from "@/lib/monthCalendar";

export type MonthGridCoreConfig = {
  dayCount: number; // 3 or 4, matching which half of the spread (same convention as hourly-grid-core)
  dayLabels: Array<{ name: string }>; // length === dayCount, e.g. "SUNDAY"/"MONDAY"/"TUESDAY"
  weekCount: 4 | 5 | 6;
  // weekCount rows x dayCount columns, already sliced to this page's day
  // range — see monthCalendar.ts's computeMonthCalendar, which produces
  // the full 7-column week that this gets sliced from.
  cells: MonthCalendarCell[][];
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
const LINE_COLOR = "#231F20"; // same near-black as hourlyGridCore/todoChecklist

const HEADER_HEIGHT_PT = 13.37;
const HEADER_BORDER_WIDTH_PT = 0.5;
// Fixed per row regardless of week count — see file-level comment.
const DATE_STRIP_HEIGHT_PT = 10.8;
// The small bordered box the date number sits in, at the left edge of
// each cell's date-strip.
const DATE_BOX_WIDTH_PT = 9.8;
const ROW_LINE_WIDTH_PT = 0.5;

export function renderMonthGridCore(
  geometry: { x: number; y: number; width: number; height: number },
  config: MonthGridCoreConfig,
  idPrefix: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  let idCounter = 0;
  const nextId = () => `${idPrefix}-${idCounter++}`;

  const headerHeight = ptToPx(HEADER_HEIGHT_PT);
  const dateStripHeight = ptToPx(DATE_STRIP_HEIGHT_PT);
  const dateBoxWidth = ptToPx(DATE_BOX_WIDTH_PT);
  const lineWidth = ptToPx(ROW_LINE_WIDTH_PT);

  const dayColumnWidth = geometry.width / config.dayCount;

  // Stretch each row's body height so weekCount whole rows (each
  // header-fixed date-strip + a stretched body) exactly fill the
  // allocated height, rather than floor-rounding leaving unused space
  // below the last row — same reasoning as todoChecklist.ts's rowHeight.
  const contentHeight = geometry.height - headerHeight;
  const bodyHeight = Math.max(
    0,
    (contentHeight - config.weekCount * dateStripHeight) / config.weekCount
  );
  const rowHeight = dateStripHeight + bodyHeight;

  // Outer border around the whole block.
  elements.push({
    id: nextId(),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    fill: "transparent",
    stroke: LINE_COLOR,
    strokeWidth: ptToPx(HEADER_BORDER_WIDTH_PT),
  });

  // Day-of-week header row: centered text per column, no date number
  // (unlike hourlyGridCore's day-tab) — dates live in each row below.
  for (let d = 0; d < config.dayCount; d++) {
    const dayX = geometry.x + d * dayColumnWidth;
    const label = config.dayLabels[d];
    if (!label) continue;

    const fontSize = ptToPx(8);
    const textHeight = fontSize * 1.2;
    elements.push({
      id: nextId(),
      type: "text",
      x: dayX,
      y: geometry.y + (headerHeight - textHeight) / 2,
      width: dayColumnWidth,
      height: textHeight,
      text: label.name,
      fontSize,
      fontFamily: FONT_FAMILY,
      align: "center",
    });
  }

  // Header/body divider.
  elements.push({
    id: nextId(),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: geometry.y + headerHeight - lineWidth / 2,
    width: geometry.width,
    height: lineWidth,
    fill: LINE_COLOR,
    stroke: "none",
  });

  const gridTop = geometry.y + headerHeight;

  for (let w = 0; w < config.weekCount; w++) {
    const rowY = gridTop + w * rowHeight;
    const week = config.cells[w] ?? [];

    for (let d = 0; d < config.dayCount; d++) {
      const cell = week[d];
      const cellX = geometry.x + d * dayColumnWidth;

      // Date-number box: a small bordered box in the top-left corner of
      // the cell's date-strip, matching the reference's own structure.
      if (cell) {
        elements.push({
          id: nextId(),
          type: "figure",
          subType: "rect",
          x: cellX,
          y: rowY,
          width: dateBoxWidth,
          height: dateStripHeight,
          fill: "transparent",
          stroke: LINE_COLOR,
          strokeWidth: lineWidth,
        });

        const dateFontSize = ptToPx(5);
        const dateTextHeight = dateFontSize * 1.2;
        elements.push({
          id: nextId(),
          type: "text",
          x: cellX + ptToPx(2),
          y: rowY + (dateStripHeight - dateTextHeight) / 2,
          width: dateBoxWidth - ptToPx(4),
          height: dateTextHeight,
          text: String(cell.date),
          fontSize: dateFontSize,
          fontFamily: FONT_FAMILY,
          fill: "#555555",
          align: "left",
        });
      }

      // Column divider (skip the leftmost — the outer border already
      // covers it).
      if (d > 0) {
        elements.push({
          id: nextId(),
          type: "figure",
          subType: "rect",
          x: cellX - lineWidth / 2,
          y: rowY,
          width: lineWidth,
          height: rowHeight,
          fill: LINE_COLOR,
          stroke: "none",
        });
      }
    }

    // Row divider under the date-strip, and under the body (i.e. the
    // top of the next row) — skip the very last row's bottom line, the
    // outer border already covers it.
    elements.push({
      id: nextId(),
      type: "figure",
      subType: "rect",
      x: geometry.x,
      y: rowY + dateStripHeight - lineWidth / 2,
      width: geometry.width,
      height: lineWidth,
      fill: LINE_COLOR,
      stroke: "none",
    });
    if (w < config.weekCount - 1) {
      elements.push({
        id: nextId(),
        type: "figure",
        subType: "rect",
        x: geometry.x,
        y: rowY + rowHeight - lineWidth / 2,
        width: geometry.width,
        height: lineWidth,
        fill: LINE_COLOR,
        stroke: "none",
      });
    }
  }

  return elements;
}
