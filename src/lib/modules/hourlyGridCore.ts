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
  // "off" replaces the ruled hour-rows with blank, height-adjustable
  // space (see renderHourlyGridCore's own branch below) — a materially
  // different layout from hourLineStyle:"gone", which still allocates
  // the same rowCount*rowHeight content and still draws each row's time
  // label, just with the ruled lines themselves faded to invisible.
  // Optional/defaults to "on" so existing stored instances (seeded
  // before this field existed) keep rendering exactly as before.
  intervalMode?: "on" | "off";
  // Opts a 1-hour interval back into rendering each row at the same
  // height a 30-min row gets, instead of the default doubled height —
  // see getRowHeightPx's own comment. Ignored at 30-min intervals (there's
  // nothing to make "compact" relative to). Optional/defaults to false
  // so existing stored instances keep the new doubled-height default.
  compactHourRows?: boolean;
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
// Gap between the bottom of the header box and the first ruled row.
// Measured from the reference at 22.6pt (row 0 at y≈54.5pt, header bottom
// at y≈31.9pt), trimmed by 0.3pt so the whole header band is exactly two
// 1/4in dots: 13.7 + 22.3 = 36.0pt = 0.500in. Without the trim the band is
// 36.3pt, the block rounds to 21 dots instead of 20, and a quarter inch
// comes off the bottom zone for the sake of three tenths of a point.
const HEADER_TO_GRID_GAP_PT = 22.3;
// One half-hour slot. The reference measures 11.3pt across 24+ consecutive
// row labels, but that does not divide the 1/4in dot pitch (18pt), so the
// rules drift off the lattice down the page. 9pt is two slots per dot, and
// it lands: 36 slots = 324pt = 18 dots exactly, plus the 2-dot header band
// makes the block 20 dots = 5.000in.
//
// The type is untouched - still 5pt/5.5pt PT Serif - so this takes 1.3pt
// of dead space out of the label box rather than shrinking anything that
// is read. Writing height goes 3.986mm to 3.175mm. Confirmed against a
// true-size print before it was written: see the row-height test sheet.
//
// It also costs nothing: the block goes 6.154in to 5.000in, so the bottom
// zone GAINS, 3.250in to 3.750in.
const ROW_HEIGHT_PT = 9.0;
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

// The dot field drawn when increments are off. Same size and grey as the
// add-zone's field in NativePlannerEditor, so one lattice looks like one
// lattice wherever it appears.
const DOT_RADIUS_PX = 2.8;
const DOT_COLOR = "#9aa2a8";

// The vertical bars between day columns in increments-off mode. Greyer
// than LINE_COLOR, the near-black used for ruled lines and box borders:
// with the dot field behind them these read as structure rather than as
// content, and near-black made them the heaviest thing in an area that is
// meant to be open. Sits between the dots and the ruled lines in weight.
const DAY_DIVIDER_COLOR = "#a0a6ab";

// A 1-hour row renders at double a 30-min row's own measured height by
// default — requested directly: "make the hour increment setting be
// double the height of the 30 min [rows]." Without this, switching from
// 30min to 1hr increments over the same time range halves rowCount but
// leaves each row the same physical height, so the whole grid's visual
// size shrinks by half along with it — doubling the row height keeps the
// total content height roughly the same, trading row count for row
// height instead. compactHourRows opts back into the original
// single-height behavior for anyone who prefers the shorter, more
// compact hourly view instead — requested directly, same turn: "also
// have a setting to make the hour setting compact." Only 1-hour
// intervals are affected either way; 30-min rows always render at the
// one measured ROW_HEIGHT_PT.
function getRowHeightPx(intervalMinutes: number, compactHourRows: boolean | undefined): number {
  const base = ptToPx(ROW_HEIGHT_PT);
  return intervalMinutes === 60 && !compactHourRows ? base * 2 : base;
}

// Same "expose just the height math NativePlannerEditor.tsx/actions.ts
// need" convention as todoChecklist.ts's getTodoChecklistRowMetricsPx and
// habitTracker.ts's getHabitTrackerRowMetricsPx — mirrors
// renderHourlyGridCore's own header+gap+rowCount*rowHeight computation
// exactly (not calling into the renderer itself, same reasoning as those
// two: this needs just the height, not a render pass). Used by
// updateHourlySettings (actions.ts) to size hourly-grid-core's own
// rowSpan from a real requested start/end/interval, via grid.ts's
// pixelHeightToRowSpan.
export function getHourlyGridCoreContentHeightPx(
  config: Pick<HourlyGridCoreConfig, "startTime" | "endTime" | "intervalMinutes" | "compactHourRows">
): number {
  const totalMinutes = timeToMinutes(config.endTime) - timeToMinutes(config.startTime);
  const rowCount = Math.max(1, Math.round(totalMinutes / config.intervalMinutes));
  return (
    ptToPx(HEADER_HEIGHT_PT) +
    ptToPx(HEADER_TO_GRID_GAP_PT) +
    rowCount * getRowHeightPx(config.intervalMinutes, config.compactHourRows)
  );
}

// Minimum content height for the "off" (increments-off, blank-space)
// layout — just the header + its gap, deliberately NOT plus a nominal
// row like the "on" mode's own content height above. Requested directly:
// "for drag resize make a minimum size for the section as well around
// the same minimum size as modules" — header+gap alone already lands at
// exactly MIN_ROW_SPAN (2 grid rows) on this app's real page geometry,
// matching every other module's own resize floor (see actions.ts's
// getMinRowSpanForSlug, which every one of those ultimately clamps to
// at minimum); adding a nominal row on top would make this floor taller
// than everything else's, not "around the same."
export function getHourlyGridCoreOffModeMinHeightPx(): number {
  return ptToPx(HEADER_HEIGHT_PT) + ptToPx(HEADER_TO_GRID_GAP_PT);
}

export function renderHourlyGridCore(
  geometry: { x: number; y: number; width: number; height: number },
  config: HourlyGridCoreConfig,
  idPrefix: string,
  fontFamily: string,
  // The page's 1/4in dot lattice. Only used when increments are off, where
  // the block becomes free space and the dots are what makes it writable -
  // see that branch. Optional so a caller without a page grid (a preview,
  // a test) still renders everything else.
  lattice?: { pitchPx: number; originX: number; originY: number; insetPx: number }
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
  const rowHeight = getRowHeightPx(config.intervalMinutes, config.compactHourRows);
  const gridTop = geometry.y + headerHeight + headerToGridGap;
  const columnGutter = ptToPx(COLUMN_GUTTER_PT);

  // Each day gets an equal share of the module's ALLOCATION, not of its
  // inked width, so the boundary between two days falls on a lattice line.
  //
  // It used to divide (width - gutter * (dayCount - 1)) by dayCount, which
  // takes the gutter out of the total and leaves each day 5.78 dots wide
  // instead of 6. The dividers then missed the dots by up to a pixel, in
  // different directions per boundary - reported exactly that way: "between
  // sun and mon line is to left, mon and tues line is to right... thurs and
  // fri line aligned, fri and sat line to right." Six of one, half a dozen
  // of the other, literally.
  //
  // The gutter now comes out of each day's own allocation instead, half on
  // each side, which centres it on the shared lattice line and leaves the
  // inked column a whole 6 dots less one gutter.
  const allocationX = lattice ? geometry.x - lattice.insetPx : geometry.x;
  const allocationWidth = lattice ? geometry.width + lattice.insetPx * 2 : geometry.width;
  const dayAllocationWidth = allocationWidth / config.dayCount;
  const dayColumnWidth = lattice
    ? dayAllocationWidth - columnGutter
    : (geometry.width - columnGutter * (config.dayCount - 1)) / config.dayCount;

  const lineOpacity =
    config.hourLineStyle === "full" ? 1 : config.hourLineStyle === "low-transparency" ? 0.25 : 0;

  for (let d = 0; d < config.dayCount; d++) {
    const dayX = lattice
      ? allocationX + d * dayAllocationWidth + columnGutter / 2
      : geometry.x + d * (dayColumnWidth + columnGutter);
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

    if (config.intervalMode === "off") {
      // Increments turned off: no ruled rows, no time labels — just a
      // blank, height-adjustable area (its own height comes straight
      // from geometry.height, i.e. from whatever rowSpan the instance
      // currently has — see the drag-resize handle in
      // NativePlannerEditor.tsx) with a vertical divider bar between
      // each pair of day columns, requested directly: "replace the
      // hours section with blank space, separated by vertical bars
      // that extend maybe 2/3 the height." Drawn once per inter-column
      // boundary (d>0, between column d-1 and d), not per row — there
      // are no rows in this mode.
      // A dot field over the blank area, on the page lattice. With no
      // rules and no time labels there is nothing to write against, and
      // this is the one place inside a module where the grid earns its
      // keep - requested directly: "i would also like dot grid to show in
      // the hours section when increments are turned off."
      //
      // Drawn once for the whole block, not per day column, so the field
      // reads continuously across the dividers the way a bullet journal's
      // does. Guarded on d === 0 for that reason.
      if (d === 0 && lattice) {
        const top = gridTop;
        const bottom = geometry.y + geometry.height;
        const firstCol = Math.ceil((geometry.x - lattice.originX) / lattice.pitchPx);
        const firstRow = Math.ceil((top - lattice.originY) / lattice.pitchPx);
        for (let cx = lattice.originX + firstCol * lattice.pitchPx; cx <= geometry.x + geometry.width; cx += lattice.pitchPx) {
          for (let cy = lattice.originY + firstRow * lattice.pitchPx; cy <= bottom; cy += lattice.pitchPx) {
            elements.push({
              id: nextId(),
              type: "figure",
              subType: "rect",
              x: cx - DOT_RADIUS_PX,
              y: cy - DOT_RADIUS_PX,
              width: DOT_RADIUS_PX * 2,
              height: DOT_RADIUS_PX * 2,
              fill: DOT_COLOR,
              stroke: "none",
              cornerRadius: DOT_RADIUS_PX,
            });
          }
        }
      }

      if (d > 0) {
        const blankHeight = geometry.y + geometry.height - gridTop;
        const dividerHeight = blankHeight * (2 / 3);
        const dividerY = gridTop + (blankHeight - dividerHeight) / 2;
        const dividerWidth = ptToPx(ROW_LINE_WIDTH_PT);
        elements.push({
          id: nextId(),
          type: "figure",
          subType: "rect",
          x: dayX - columnGutter / 2 - dividerWidth / 2,
          y: dividerY,
          width: dividerWidth,
          height: dividerHeight,
          fill: DAY_DIVIDER_COLOR,
          stroke: "none",
        });
      }
    } else {
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
    }

    // Optional solid border around the whole day column (header + body),
    // independent of the ruled-line style above. "off" mode's own body
    // height is whatever geometry.height gives it (no rowCount to derive
    // from — see the intervalMode branch above), matching how "on" mode's
    // own body height is content-derived rather than geometry-derived.
    if (config.dayBorder) {
      const bodyHeight =
        config.intervalMode === "off" ? geometry.height - headerHeight : headerToGridGap + rowCount * rowHeight;
      elements.push({
        id: nextId(),
        type: "figure",
        subType: "rect",
        x: dayX,
        y: geometry.y,
        width: dayColumnWidth,
        height: headerHeight + bodyHeight,
        fill: "transparent",
        stroke: "#222222",
        strokeWidth: 1.5,
      });
    }

    // Synced/manual events for this day, positioned by time — has no
    // well-defined position without a ruled grid to place it against, so
    // skipped entirely in "off" mode. Low-risk today (see
    // src/lib/weekDays.ts's identical note): events is always seeded
    // empty, nothing writes into it yet.
    for (const event of config.intervalMode === "off" ? [] : config.events.filter((e) => e.day === d)) {
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
