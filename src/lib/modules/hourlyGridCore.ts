// Renders the "core" weekly hourly-grid block: day-header tabs + a
// half-hour ruled grid per day, with optional synced calendar events
// drawn at their correct time. Pure function — no Polotno/React
// dependency — so it can be reused both by the live editor (converting
// its output into real Polotno elements) and later by the server-side
// print export pipeline, which needs the exact same layout logic.
//
// Every constant below is a measured value pulled directly from
// hourlyjournal.pdf's embedded text metadata and vector path data
// (pymupdf get_text('dict') / get_drawings() on page 4 of the source
// PDF), not an eyeballed guess — see the comments on each one.

import { ptToPx } from "@/lib/print-spec";

export type HourlyGridEvent = {
  day: number; // 0-indexed within this block's dayCount
  startTime: string; // "HH:MM", 24-hour
  endTime: string; // "HH:MM", 24-hour
  label: string;
  source: "manual" | "google-calendar";
};

export type HourlyGridCoreConfig = {
  dayCount: number; // 3 or 4, matching which half of the spread
  dayLabels: Array<{ name: string; date: number }>; // length === dayCount
  startTime: string; // "05:30"
  endTime: string; // "23:30"
  intervalMinutes: number; // 30
  hourLineStyle: "full" | "low-transparency" | "gone";
  dayBorder: boolean;
  events: HourlyGridEvent[];
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

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// 12-hour label with no AM/PM, matching the reference design — position
// in the day (before/after the 12:00 row) carries that meaning instead.
function formatHour12NoMeridiem(minutesSinceMidnight: number): string {
  const totalMinutes = ((minutesSinceMidnight % 1440) + 1440) % 1440;
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")}`;
}

const FONT_FAMILY = "PT Serif";
// Near-black, not pure black — matches the reference's actual stroke
// color for box borders and ruled lines (RGB 0.137/0.122/0.125).
const LINE_COLOR = "#231F20";

// The day-header tab box, measured from its actual vector rect in the
// PDF: (136.2, 18.2, 240.2, 31.9) → 13.7pt tall. This is its own
// measurement, separate from the gap below it — conflating the two was
// the bug in the previous pass.
const HEADER_HEIGHT_PT = 13.7;
const HEADER_BORDER_WIDTH_PT = 0.5;
// Gap between the bottom of the header box and the first ruled row,
// derived from row-position extrapolation: row 0 sits at y≈54.5pt,
// header bottom is at y≈31.9pt.
const HEADER_TO_GRID_GAP_PT = 22.6;
// Consistent step measured across 24+ consecutive row labels.
const ROW_HEIGHT_PT = 11.3;
const ROW_LINE_WIDTH_PT = 0.3;
// Gap between adjacent day-tab boxes: 244.7 - 240.2 = 4.5pt.
const COLUMN_GUTTER_PT = 4.5;

export function renderHourlyGridCore(
  geometry: { x: number; y: number; width: number; height: number },
  config: HourlyGridCoreConfig,
  idPrefix: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  let idCounter = 0;
  const nextId = () => `${idPrefix}-${idCounter++}`;

  const startMinutes = timeToMinutes(config.startTime);
  const endMinutes = timeToMinutes(config.endTime);
  const totalMinutes = endMinutes - startMinutes;
  const rowCount = Math.max(1, Math.round(totalMinutes / config.intervalMinutes));

  const headerHeight = ptToPx(HEADER_HEIGHT_PT);
  const headerToGridGap = ptToPx(HEADER_TO_GRID_GAP_PT);
  const rowHeight = ptToPx(ROW_HEIGHT_PT);
  const gridTop = geometry.y + headerHeight + headerToGridGap;
  const columnGutter = ptToPx(COLUMN_GUTTER_PT);

  const dayColumnWidth =
    (geometry.width - columnGutter * (config.dayCount - 1)) / config.dayCount;

  const lineOpacity =
    config.hourLineStyle === "full" ? 1 : config.hourLineStyle === "low-transparency" ? 0.25 : 0;

  for (let d = 0; d < config.dayCount; d++) {
    const dayX = geometry.x + d * (dayColumnWidth + columnGutter);
    const label = config.dayLabels[d];

    // Header tab: bordered box, day name at the left edge, date at the
    // right edge — measured directly from the reference, not centered.
    elements.push({
      id: nextId(),
      type: "figure",
      subType: "rect",
      x: dayX,
      y: geometry.y,
      width: dayColumnWidth,
      height: headerHeight,
      fill: "transparent",
      stroke: LINE_COLOR,
      strokeWidth: ptToPx(HEADER_BORDER_WIDTH_PT),
    });
    if (label) {
      elements.push({
        id: nextId(),
        type: "text",
        x: dayX + 4,
        y: geometry.y,
        width: dayColumnWidth - 34,
        height: headerHeight,
        text: label.name,
        fontSize: ptToPx(8),
        fontFamily: FONT_FAMILY,
        align: "left",
        verticalAlign: "middle",
      });
      elements.push({
        id: nextId(),
        type: "text",
        x: dayX + dayColumnWidth - 30,
        y: geometry.y,
        width: 26,
        height: headerHeight,
        text: String(label.date),
        fontSize: ptToPx(5),
        fontFamily: FONT_FAMILY,
        fill: "#555555",
        align: "right",
        verticalAlign: "middle",
      });
    }

    // Ruled rows + time labels. Each row is a single line at its bottom
    // edge, not a bordered box — a box-per-row would draw phantom
    // vertical dividers the reference doesn't have.
    for (let i = 0; i < rowCount; i++) {
      const rowY = gridTop + i * rowHeight;
      const rowMinutes = startMinutes + i * config.intervalMinutes;

      elements.push({
        id: nextId(),
        type: "text",
        x: dayX + 4,
        y: rowY + 1,
        width: dayColumnWidth - 8,
        height: rowHeight,
        text: formatHour12NoMeridiem(rowMinutes),
        fontSize: ptToPx(5),
        fontFamily: FONT_FAMILY,
        fill: "#666666",
        align: "left",
      });

      if (lineOpacity > 0) {
        elements.push({
          id: nextId(),
          type: "figure",
          subType: "rect",
          x: dayX,
          y: rowY + rowHeight,
          width: dayColumnWidth,
          height: 0,
          stroke: LINE_COLOR,
          strokeWidth: ptToPx(ROW_LINE_WIDTH_PT),
          opacity: lineOpacity,
        });
      }
    }

    // Optional solid border around the whole day column (header + body),
    // independent of the ruled-line style above.
    if (config.dayBorder) {
      elements.push({
        id: nextId(),
        type: "figure",
        subType: "rect",
        x: dayX,
        y: geometry.y,
        width: dayColumnWidth,
        height: headerHeight + headerToGridGap + rowCount * rowHeight,
        fill: "transparent",
        stroke: "#222222",
        strokeWidth: 1.5,
      });
    }

    // Synced/manual events for this day, positioned by time.
    for (const event of config.events.filter((e) => e.day === d)) {
      const evStart = timeToMinutes(event.startTime);
      const evEnd = timeToMinutes(event.endTime);
      const evY = gridTop + ((evStart - startMinutes) / config.intervalMinutes) * rowHeight;
      const evHeight = ((evEnd - evStart) / config.intervalMinutes) * rowHeight;

      elements.push({
        id: nextId(),
        type: "figure",
        subType: "rect",
        x: dayX + 2,
        y: evY,
        width: dayColumnWidth - 4,
        height: Math.max(evHeight, 4),
        fill: event.source === "google-calendar" ? "#cfe3ff" : "#ffe9b3",
        stroke: "none",
        opacity: 0.8,
      });
      elements.push({
        id: nextId(),
        type: "text",
        x: dayX + 6,
        y: evY + 1,
        width: dayColumnWidth - 12,
        height: Math.max(evHeight, 4),
        text: event.label,
        fontSize: ptToPx(6),
        fontFamily: FONT_FAMILY,
        fill: "#333333",
        align: "left",
      });
    }
  }

  return elements;
}
