// A small reference calendar: a month's dates in seven columns.
//
// Not month-grid-core, which is a spine - a whole page of writing space
// with the dates as its headings. This is the opposite: the dates ARE the
// content, printed small, to look at rather than write in. Year at a
// glance, a term planner's month column, "next month" beside a week
// spread, and - with `markable` - the dot calendars, where each date gets
// a small square to tick: habit dot calendar, period tracker, mood
// calendar, streak chart.
//
// Dates come from computeMonthCalendar, the same function the spine uses,
// rather than from stored cells. A mini month is a fact about a year and a
// month; storing the grid would be a second description of it, and the
// month a page is FOR is already known.
//
// Vertical bands are lattice quantities. The header is one cell less the
// box inset at both ends (see todoChecklist.ts), the weekday strip is half
// a cell, and a date row is half a cell - the same half cell that
// monthGridCore prints its own date numbers in, so the two agree about how
// much room a printed date takes. `markable` doubles a row to a full cell:
// the half for the number plus a half-cell square to tick.
//
// Columns are seven, and seven does not divide the 24-column lattice.
// That is fine and deliberate: the columns here carry no writing, so
// nothing needs to land on a dot, and there are no horizontal rules to
// misalign either.

/** Rows an undated mini month draws, having no month to count. Five is
 *  the count that covers most months; six is the exception and would leave
 *  a visibly empty row on a page that is never dated at all. */
const UNDATED_WEEK_COUNT = 5;

import { ptToPx } from "@/lib/print-spec";
import { computeMonthCalendar } from "@/lib/monthCalendar";
import { weekdayInitials, weekdayOfColumn } from "@/lib/weekDays";
import {
  RULE_WIDTH_PT,
  HEADER_HEIGHT_PT,
  NEAR_BLACK,
  borderElement,
  contentTopPx,
  headerElements,
  type FrameLattice,
} from "@/lib/modules/moduleFrame";
import { capCentredTextY, textBaselineY } from "@/lib/modules/textFit";

export type MiniMonthConfig = {
  year: number;
  /** 1-12, matching computeMonthCalendar and the dayLabels-style config
   *  used elsewhere rather than JS's own 0-indexed months. NULL on an
   *  undated planner, which draws the grid with no numbers in it - see
   *  weekTitle.ts on why undated is the absence of the value. */
  month: number | null;
  /** Printed above the grid. Empty prints the month's own name. */
  heading?: string;
  /** Give every date a square to tick - the dot-calendar trackers. */
  markable?: boolean;
  /**
   * What each date gets to mark it: nothing, a box round it (the old
   * `markable`, which put a small box under it), or a ring round the number - how a cycle is usually
   * tracked, and it needs no extra row. Read first; `markable` only when
   * this is absent. Module-edits list, 2026-09-30.
   */
  mark?: "none" | "box" | "ring";
  /** The days of the months either side: shown faint (the default), or
   *  left out - a mark on 30 December means nothing on a tracker. */
  neighbours?: boolean;
  /** Keep real dates even when the planner itself is undated. Read by the
   *  registry's `undated` hook, not by this renderer, which only ever sees
   *  the month it was given. */
  keepDates?: boolean;
  /** The journal's week start, 0 = Sunday - set at render time by the
   *  registry's weekStart hook, never stored. Column 0 is this day. */
  weekStartDay?: number;
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

/** Half a cell, for the S M T W T F S strip. */
const WEEKDAY_STRIP_HEIGHT_PT = 9;
const WEEKDAY_FONT_PT = 6;
/** Half a cell: what monthGridCore's own date strip gives a printed date. */
const DATE_ROW_HEIGHT_PT = 9;
/** A full cell when there is a box to tick: the half for the number, and
 *  a half-cell square beneath it. */
const MARKABLE_ROW_HEIGHT_PT = 18;
const DATE_FONT_PT = 7;
// The house interior rule weight - see moduleFrame's RULE_WIDTH_PT.
const MARK_BOX_STROKE_PT = RULE_WIDTH_PT;

const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

export function getMiniMonthRowMetricsPx(markable: boolean) {
  return {
    headerHeightPx: ptToPx(HEADER_HEIGHT_PT),
    weekdayStripHeightPx: ptToPx(WEEKDAY_STRIP_HEIGHT_PT),
    dateRowHeightPx: ptToPx(markable ? MARKABLE_ROW_HEIGHT_PT : DATE_ROW_HEIGHT_PT),
  };
}

/**
 * Header, weekday strip and SIX date rows - never fewer.
 *
 * The other modules' minimums are "the least this can be and still be the
 * thing it is", and for most of them that is one row, because a checklist
 * with three lines is a short checklist. A calendar missing its last week
 * is not a short calendar, it is a wrong one. Six is the most rows a
 * Gregorian month can need on a Sunday-aligned grid - monthCalendar.ts
 * verifies that exhaustively for 1900-2100 - so sizing for six means every
 * month fits and none of them silently loses a week.
 */
/** The mark a mini month prints: `mark`, or the old `markable` boolean. */
export function miniMonthMark(config: { mark?: unknown; markable?: unknown }): "none" | "box" | "ring" {
  if (config.mark === "none" || config.mark === "box" || config.mark === "ring") return config.mark;
  return config.markable === true ? "box" : "none";
}

export function getMiniMonthMinHeightPx(markable: boolean): number {
  const m = getMiniMonthRowMetricsPx(markable);
  return m.headerHeightPx + m.weekdayStripHeightPx + m.dateRowHeightPx * 6;
}

export function renderMiniMonth(
  geometry: { x: number; y: number; width: number; height: number },
  config: MiniMonthConfig,
  idPrefix: string,
  fontFamily: string,
  lattice?: FrameLattice
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic ids: a date names its week and weekday, so a month with five
  // weeks and one with six share the marks they have in common instead of
  // renumbering from the top. See todoChecklist.ts.
  const id = (name: string) => `${idPrefix}-${name}`;

  // Total in its config - see columnTable.ts for why every renderer here
  // is. computeMonthCalendar THROWS on a year or month it cannot make a
  // grid from, by design (it would rather fail loudly than hand back a
  // malformed calendar), so the guard has to be on this side of the call:
  // a module whose propValues lost a key must draw an empty box, not take
  // the page down with it.
  const year = Number.isFinite(config.year) ? Math.round(config.year) : 0;
  const month = Number.isFinite(config.month) ? Math.round(config.month as number) : 0;
  const drawable = year >= 1900 && year <= 2100 && month >= 1 && month <= 12;
  const weekStartDay = config.weekStartDay ?? 0;
  const calendar = drawable ? computeMonthCalendar(year, month, weekStartDay) : null;
  // No month, so no dates - the undated planner, where you write them in.
  // FIVE rows, because five is the count that covers most months and the
  // grid has to commit to one without a month to ask. The weekday strip
  // above still says which column is which, so a written-in month lands in
  // the right place.
  const blankWeeks = calendar ? 0 : UNDATED_WEEK_COUNT;
  const mark = miniMonthMark(config);
  const markable = mark === "box";
  const stripTop = contentTopPx(geometry, lattice);
  const stripHeight = ptToPx(WEEKDAY_STRIP_HEIGHT_PT);
  // The least a week's row takes - see rowPitch for what it does take.
  const rowHeight = ptToPx(mark !== "none" ? MARKABLE_ROW_HEIGHT_PT : DATE_ROW_HEIGHT_PT);
  const columnWidth = geometry.width / 7;

  elements.push(borderElement(geometry, id));
  elements.push(
    ...headerElements(
      geometry,
      // Blank heading prints the month's own name - the module knows it,
      // so the user should not have to type it.
      config.heading || MONTH_NAMES[month - 1] || "",
      id,
      fontFamily,
      stripTop
    )
  );

  const gridTop = stripTop + stripHeight;
  const weekdayFontSize = ptToPx(WEEKDAY_FONT_PT);
  weekdayInitials(weekStartDay).forEach((initial, c) => {
    elements.push({
      // Named by weekday, not by "the nth label" - Sunday's initial is the
      // same mark whichever month is drawn, and whichever column it is in.
      id: id(`weekday${weekdayOfColumn(c, weekStartDay)}`),
      type: "text",
      x: geometry.x + columnWidth * c,
      y: capCentredTextY(stripTop, stripHeight, weekdayFontSize, fontFamily),
      width: columnWidth,
      height: weekdayFontSize * 1.2,
      text: initial,
      fontSize: weekdayFontSize,
      fontFamily,
      fill: NEAR_BLACK,
      align: "center",
      opacity: 0.7,
    });
  });

  const dateFontSize = ptToPx(DATE_FONT_PT);
  const bodyBottom = geometry.y + geometry.height;

  // THE WEEKS FILL THE BOX (2026-10-02: "theres white space at bottom ...
  // do a sweep"). The box is never less than six weeks of rows - see
  // getMiniMonthMinHeightPx - so a five-week month left a row empty under
  // it, and a box made taller left more. Now the month's own weeks share
  // whatever height the box has, as a day chart's levels do, and nothing is
  // left under the last.
  const weekCount = calendar ? calendar.weekCount : blankWeeks;
  const rowPitch = weekCount > 0 ? Math.max(rowHeight, (bodyBottom - gridTop) / weekCount) : rowHeight;
  // A RING TAKES A WHOLE ROW, as a box does: in the half-cell row a plain
  // month uses, a ring small enough to fit could not hold a two-digit date -
  // "the numbers dont fit within the ring" (2026-09-30). The date centres in
  // the row and the ring round it - and, since 2026-10-01, the box round it
  // too: the box IS the day's cell.
  const dateBandHeight = rowPitch;
  const ringRadius = Math.min(columnWidth, rowPitch) * 0.38;

  // THE BOX MARK IS A GRID OF THE MONTH'S OWN DAYS. Asked 2026-10-01: "the
  // dates are inside the box and theres no gap between adjacent boxes or
  // days above or below", and "to the side of where the days numbers are
  // there shouldnt be extra lines or grids". So each of the month's days is
  // a box with its date inside, touching the next on every side; a day of
  // the months either side keeps its faint number and gets no box (a mark on
  // 30 December means nothing here); an undated month boxes every place,
  // for dates written in. Drawn as edges, each once - two boxes' outlines
  // laid side by side print a shared edge twice, darker - and merged into
  // runs; none where the module's own border already is.
  const weeksShown = (() => {
    let n = 0;
    while (n < weekCount && gridTop + rowPitch * (n + 1) <= bodyBottom + 0.5) n++;
    return n;
  })();
  if (markable) {
    const boxed = (w: number, c: number) => {
      if (w < 0 || w >= weeksShown || c < 0 || c > 6) return false;
      const cell = calendar?.weeks[w][c];
      return calendar ? !!cell?.inCurrentMonth : true;
    };
    const stroke = ptToPx(MARK_BOX_STROKE_PT);
    const line = (name: string, x: number, y: number, width: number, height: number) =>
      elements.push({ id: id(name), type: "figure", subType: "rect", x, y, width, height, fill: NEAR_BLACK, stroke: "none", opacity: 0.8 });
    // Across: the boundary above row k, wherever a day lies on either side.
    for (let k = 0; k <= weeksShown; k++) {
      const y = gridTop + rowPitch * k;
      if (Math.abs(y - bodyBottom) < 0.5) continue;
      for (let c = 0; c < 7; c++) {
        if (!(boxed(k - 1, c) || boxed(k, c)) || (c > 0 && (boxed(k - 1, c - 1) || boxed(k, c - 1)))) continue;
        let end = c;
        while (end + 1 < 7 && (boxed(k - 1, end + 1) || boxed(k, end + 1))) end++;
        line(`grid-h${k}-${c}`, geometry.x + columnWidth * c, y - stroke / 2, columnWidth * (end - c + 1), stroke);
      }
    }
    // Down: the boundary left of column j, inside the module's own sides.
    for (let j = 1; j < 7; j++) {
      const x = geometry.x + columnWidth * j;
      for (let w = 0; w < weeksShown; w++) {
        if (!(boxed(w, j - 1) || boxed(w, j)) || (w > 0 && (boxed(w - 1, j - 1) || boxed(w - 1, j)))) continue;
        let end = w;
        while (end + 1 < weeksShown && (boxed(end + 1, j - 1) || boxed(end + 1, j))) end++;
        line(`grid-v${j}-${w}`, x - stroke / 2, gridTop + rowPitch * w, stroke, rowPitch * (end - w + 1));
      }
    }
  }

  for (let w = 0; w < weeksShown; w++) {
    const rowTop = gridTop + rowPitch * w;

    for (let c = 0; c < 7; c++) {
      const cell = calendar?.weeks[w][c];
      // Days belonging to the neighbouring months are drawn faintly rather
      // than left blank: the shape of the grid is what makes a calendar
      // readable at a glance, and a gap at either end breaks it.
      const opacity = !cell || cell.inCurrentMonth ? 1 : 0.3;
      const columnX = geometry.x + columnWidth * c;
      // Left out entirely, box and ring included, when asked.
      if (cell && !cell.inCurrentMonth && config.neighbours === false) continue;

      if (typeof cell?.date === "number") {
        elements.push({
          id: id(`w${w}-d${weekdayOfColumn(c, weekStartDay)}-date`),
          type: "text",
          x: columnX,
          y: capCentredTextY(rowTop, dateBandHeight, dateFontSize, fontFamily),
          width: columnWidth,
          height: dateFontSize * 1.2,
          text: String(cell.date),
          fontSize: dateFontSize,
          fontFamily,
          fill: NEAR_BLACK,
          align: "center",
          opacity,
        });
      }

      if (mark === "ring") {
        // Round the number, centred on its ink rather than on its line box:
        // a figure's middle is half its cap height above the baseline.
        const baseline = textBaselineY(capCentredTextY(rowTop, dateBandHeight, dateFontSize, fontFamily), dateFontSize, fontFamily);
        const cy = baseline - dateFontSize * 0.34;
        elements.push({
          id: id(`w${w}-d${weekdayOfColumn(c, weekStartDay)}-ring`),
          type: "figure",
          subType: "rect",
          x: columnX + columnWidth / 2 - ringRadius,
          y: cy - ringRadius,
          width: ringRadius * 2,
          height: ringRadius * 2,
          cornerRadius: ringRadius,
          fill: "transparent",
          stroke: NEAR_BLACK,
          strokeWidth: ptToPx(MARK_BOX_STROKE_PT),
          opacity: opacity * 0.8,
        });
      }
    }
  }

  return elements;
}
