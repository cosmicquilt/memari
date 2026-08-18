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
// Day-tab text insets from the box border: "SUNDAY" bbox starts 4.4pt
// inside the box's left edge; "31" bbox ends 6.9pt inside the right edge.
const DAY_NAME_LEFT_INSET_PT = 4.4;
const DATE_RIGHT_INSET_PT = 6.9;
// Small thin box wrapping each time label, bottom edge flush with the
// row's ruled line — measured from a sample vector rect: ~14pt wide,
// ~8.9pt tall, 0.1pt near-black stroke.
const TIME_LABEL_BOX_WIDTH_PT = 14;
const TIME_LABEL_BOX_HEIGHT_PT = 8.9;
const TIME_LABEL_BOX_WIDTH_STROKE_PT = 0.1;

export function renderHourlyGridCore(
  geometry: { x: number; y: number; width: number; height: number },
  config: HourlyGridCoreConfig,
  idPrefix: string,
  fontFamily: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  let idCounter = 0;
  const nextId = () => `${idPrefix}-${idCounter++}`;
  // Page Settings' font switch (Planner.theme) — aliased to the name
  // already used everywhere below rather than touching every reference.
  const FONT_FAMILY = fontFamily;

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
      // Manually centered rather than relying on verticalAlign, which
      // wasn't reliably centering text in a box taller than the text.
      const dateWidth = ptToPx(26);
      const nameLeftInset = ptToPx(DAY_NAME_LEFT_INSET_PT);
      const dateRightInset = ptToPx(DATE_RIGHT_INSET_PT);

      const nameFontSize = ptToPx(8);
      const nameTextHeight = nameFontSize * 1.2;
      elements.push({
        id: nextId(),
        type: "text",
        x: dayX + nameLeftInset,
        y: geometry.y + (headerHeight - nameTextHeight) / 2,
        width: dayColumnWidth - nameLeftInset - dateWidth,
        height: nameTextHeight,
        text: label.name,
        fontSize: nameFontSize,
        fontFamily: FONT_FAMILY,
        align: "left",
      });

      // Bumped a hair past the reference's own measured 5pt for
      // legibility, requested directly — same kind of deliberate
      // departure from the literal measurement as habitTracker.ts's
      // own DAY_LETTER_FONT_PT (see its comment).
      const dateFontSize = ptToPx(5.5);
      const dateTextHeight = dateFontSize * 1.2;
      elements.push({
        id: nextId(),
        type: "text",
        x: dayX + dayColumnWidth - dateWidth - dateRightInset,
        y: geometry.y + (headerHeight - dateTextHeight) / 2,
        width: dateWidth,
        height: dateTextHeight,
        text: String(label.date),
        fontSize: dateFontSize,
        fontFamily: FONT_FAMILY,
        fill: "#555555",
        align: "right",
      });
    }

    // Ruled rows + time labels. The main row line is a single line at
    // the row's bottom edge, not a bordered box — a box-per-row would
    // draw phantom vertical dividers the reference doesn't have. The
    // time label itself sits inside a small separate box whose bottom
    // edge is flush with that line, per the reference's own structure.
    const labelBoxWidth = ptToPx(TIME_LABEL_BOX_WIDTH_PT);
    const labelBoxHeight = ptToPx(TIME_LABEL_BOX_HEIGHT_PT);
    for (let i = 0; i < rowCount; i++) {
      const rowY = gridTop + i * rowHeight;
      const rowMinutes = startMinutes + i * config.intervalMinutes;
      const lineY = rowY + rowHeight;
      const labelBoxTop = lineY - labelBoxHeight;

      if (lineOpacity > 0) {
        elements.push({
          id: nextId(),
          type: "figure",
          subType: "rect",
          x: dayX,
          y: labelBoxTop,
          width: labelBoxWidth,
          height: labelBoxHeight,
          fill: "transparent",
          stroke: LINE_COLOR,
          strokeWidth: ptToPx(TIME_LABEL_BOX_WIDTH_STROKE_PT),
          opacity: lineOpacity,
        });
      }

      // Centered, not left-aligned — left alignment made shorter
      // strings ("8:00") look off relative to longer ones ("10:30")
      // sharing the same fixed-width box. Manually positioned near the
      // bottom (not flush) for the same reason verticalAlign was
      // dropped elsewhere — a small gap off the line reads better than
      // touching it exactly.
      // 5pt -> 5.5pt legibility bump (dateFontSize above got the same
      // one) crowded the box specifically for a two-digit hour
      // ("10:00"/"10:30"/"11:00"/"11:30"/"12:00"/"12:30" — 4 digits
      // once the colon's stripped out, vs. 3 for a single-digit hour
      // like "9:00") — the box's own fixed width was always sized for
      // the *shorter* strings. Eased down twice (5.3pt, then 5.1pt),
      // still crowded either way — back to the original 5pt
      // measurement for these specifically, requested directly.
      // Single-digit-hour times keep the 5.5pt bump.
      const timeLabelText = formatHour12NoMeridiem(rowMinutes);
      const timeLabelDigitCount = timeLabelText.replace(/\D/g, "").length;
      const timeLabelFontSize = ptToPx(timeLabelDigitCount >= 4 ? 5 : 5.5);
      const timeLabelTextHeight = timeLabelFontSize * 1.2;
      const timeLabelBottomGap = ptToPx(1);
      elements.push({
        id: nextId(),
        type: "text",
        x: dayX + 2,
        y: labelBoxTop + labelBoxHeight - timeLabelTextHeight - timeLabelBottomGap,
        width: labelBoxWidth - 4,
        height: timeLabelTextHeight,
        text: timeLabelText,
        fontSize: timeLabelFontSize,
        fontFamily: FONT_FAMILY,
        fill: "#666666",
        align: "center",
      });

      if (lineOpacity > 0) {
        // Filled thin rect, not a zero-height stroked one — Polotno
        // doesn't reliably render sub-2px strokes on degenerate shapes
        // at the exact requested color (this rendered blue instead of
        // the specified near-black).
        const lineWidth = ptToPx(ROW_LINE_WIDTH_PT);
        elements.push({
          id: nextId(),
          type: "figure",
          subType: "rect",
          x: dayX,
          y: lineY - lineWidth / 2,
          width: dayColumnWidth,
          height: lineWidth,
          fill: LINE_COLOR,
          stroke: "none",
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
