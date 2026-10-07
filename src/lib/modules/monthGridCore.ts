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
import { RULE_WIDTH_PT, contentTopPx, type FrameLattice } from "@/lib/modules/moduleFrame";
import type { MonthCalendarCell } from "@/lib/monthCalendar";
import { capCentredTextY, textInkBand, textWidthPx } from "@/lib/modules/textFit";
import { latticeFill } from "./latticeFill";
import { glyphElement } from "./glyphs";
import type { DayIconMark } from "@/lib/dayIcons";

export type MonthGridCoreConfig = {
  dayCount: number; // 3 or 4, matching which half of the spread (same convention as hourly-grid-core)
  dayLabels: Array<{ name: string }>; // length === dayCount, e.g. "SUNDAY"/"MONDAY"/"TUESDAY"
  weekCount: 4 | 5 | 6;
  // weekCount rows x dayCount columns, already sliced to this page's day
  // range — see monthCalendar.ts's computeMonthCalendar, which produces
  // the full 7-column week that this gets sliced from.
  //
  // `icons`: the journal's day icons on that day - set at render time from
  // the dates (renderContext's withDayIcons), never stored.
  cells: Array<Array<MonthCalendarCell & { icons?: DayIconMark[] }>>;
  /** The journal's week start, 0 = Sunday - set at render time, never
   *  stored. Read by the registry's `dated` hook, which computes `cells`
   *  from it; the drawing itself only ever sees the cells. */
  weekStartDay?: number;
  /** What each day holds under its date: nothing, lines or the lattice's
   *  dots. Journal-wide, like the hours' settings - module-edits list. */
  inside?: "none" | "lined" | "dotted";
  /** How each day's date is set - see MonthDateStyle. Absent: the strip. */
  dateStyle?: MonthDateStyle;
  /** The strip's height in quarter cells, 2 (half a cell, the reference's)
   *  to 6 - dragged by its line on the editor's preview. Strip only. */
  stripQuarters?: number;
  /** Where a large faint date sits in its day. */
  numberCorner?: "top-left" | "bottom-right";
  /** Where a day's icons go - dragged on the editor's preview. */
  iconPlace?: MonthIconPlace;
};

/**
 * HOW A DAY'S DATE IS SET (2026-10-06, the day icons wanted room). The
 * reference's STRIP - a band across the top of the day with the number boxed
 * at its left - which can now be taller, so its icons grow with it. Or a
 * LARGE FAINT number in a corner of the day with no strip at all, the whole
 * day to write in and the icons wherever they are put.
 */
export type MonthDateStyle = "strip" | "faint";

/** Where a day's icons sit: in the strip beside the date, or in a corner of
 *  the day's writing space. */
export type MonthIconPlace = "strip" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
export const MONTH_ICON_PLACES: readonly MonthIconPlace[] = ["strip", "top-left", "top-right", "bottom-left", "bottom-right"];

/** A quarter of a lattice cell: the step the strip's height is dragged in. */
export const STRIP_QUARTER_PT = 4.5;
export const STRIP_QUARTERS_MIN = 2;
export const STRIP_QUARTERS_MAX = 6;
/** The faint date: large enough to read across a room, light enough to
 *  write over. 18% ink; a day from the next or last month at 60% of that. */
const FAINT_DATE_PT = 20;
const FAINT_DATE_OPACITY = 0.18;
const FAINT_DATE_INSET_PT = 2.5;
/** Icons in the writing space: 12pt, 4.2mm - room to colour in. */
const CELL_ICON_PT = 12;
const CELL_ICON_INSET_PT = 3;

/**
 * WHERE EVERYTHING IN A MONTH GRID SITS - the one description the renderer
 * and the editor's drag handles both read, so a handle is always on the line
 * it moves.
 *
 * A week row's height does not depend on the strip: the strip only divides
 * the row between the date and the writing under it.
 */
export function monthGridLayout(
  geometry: { x: number; y: number; width: number; height: number },
  config: Pick<MonthGridCoreConfig, "dayCount" | "weekCount" | "dateStyle" | "stripQuarters" | "numberCorner" | "iconPlace">,
  lattice?: FrameLattice
) {
  const style: MonthDateStyle = config.dateStyle === "faint" ? "faint" : "strip";
  const quarters =
    style === "strip"
      ? Math.min(STRIP_QUARTERS_MAX, Math.max(STRIP_QUARTERS_MIN, Math.round(Number(config.stripQuarters) || STRIP_QUARTERS_MIN)))
      : 0;
  const stripHeight = quarters * ptToPx(STRIP_QUARTER_PT);
  const contentTop = contentTopPx(geometry, lattice);
  const contentBottom = geometry.y + geometry.height + (lattice?.insetPx ?? 0);
  const weekCount = Math.max(1, config.weekCount);
  const rowHeight = Math.max(stripHeight, (contentBottom - contentTop) / weekCount);
  const placeWanted = MONTH_ICON_PLACES.includes(config.iconPlace as MonthIconPlace) ? (config.iconPlace as MonthIconPlace) : "strip";
  return {
    style,
    quarters,
    stripHeight,
    /** The date box is square: as wide as the strip is tall. */
    boxWidth: stripHeight,
    contentTop,
    rowHeight,
    dayColumnWidth: geometry.width / Math.max(1, config.dayCount),
    rowTop: (w: number) => contentTop + w * rowHeight,
    /** The row's last band ends at the box, as every module's last band does. */
    rowBottom: (w: number) => Math.min(contentTop + (w + 1) * rowHeight, geometry.y + geometry.height),
    /** With no strip there is nothing to sit in: the icons go by the date. */
    iconPlace: style === "faint" && placeWanted === "strip" ? ("top-left" as MonthIconPlace) : placeWanted,
    numberCorner: config.numberCorner === "bottom-right" ? ("bottom-right" as const) : ("top-left" as const),
  };
}

export type RenderedElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
};

const LINE_COLOR = "#231F20"; // same near-black as hourlyGridCore/todoChecklist

// 15.12pt is exactly 63 print px: one lattice cell less the box inset at
// both ends. That is the header height for which everything below it is a
// whole number of cells at every span, which is what lets a week row be a
// whole number of cells too. Same value and same reason as
// todoChecklist.ts and habitTracker.ts. Measured from the reference at
// 13.37pt, so the band is 1.75pt deeper.
const HEADER_HEIGHT_PT = 15.12;
const HEADER_BORDER_WIDTH_PT = 0.5;
// The DATE STRIP is fixed per row regardless of week count — see file-level
// comment. Half a cell by default: 9pt, 37.5 print px, two STRIP_QUARTER_PTs.
// Measured at 10.8pt; on the lattice it becomes the half-cell it was always
// approximating. It can be dragged taller now - see monthGridLayout - and
// the small box the number sits in, at its left, stays square with it.
// DAY ICONS (dayIcons.ts) in the date strip, beside the date box, as big as
// the strip holds with a point of air above and below: 7pt, 2.5mm, in the
// half-cell strip - and never smaller.
const DAY_ICON_PT = 7;
const DAY_ICON_GAP_PT = 1.5;
// The house interior rule weight - see moduleFrame's RULE_WIDTH_PT.
const ROW_LINE_WIDTH_PT = RULE_WIDTH_PT;

export function renderMonthGridCore(
  geometry: { x: number; y: number; width: number; height: number },
  config: MonthGridCoreConfig,
  idPrefix: string,
  fontFamily: string,
  lattice?: FrameLattice
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic, not positional — see todoChecklist.ts. Ids name a weekday
  // column or a week/day cell, so a month with a different number of
  // weeks does not renumber every mark in the grid.
  const id = (name: string) => `${idPrefix}-${name}`;
  const FONT_FAMILY = fontFamily;

  const headerHeight = ptToPx(HEADER_HEIGHT_PT);
  const layout = monthGridLayout(geometry, config, lattice);
  const dateStripHeight = layout.stripHeight;
  const dateBoxWidth = layout.boxWidth;
  const lineWidth = ptToPx(ROW_LINE_WIDTH_PT);

  const dayColumnWidth = layout.dayColumnWidth;

  // Each week row takes an equal share of what is left under the header.
  //
  // With the header at one cell less the insets, that leftover is exactly
  // (rowSpan - 1) cells, so a span of 1 + weekCount * n gives every week
  // row exactly n cells - a half of which is the date strip and the rest
  // the writing area. Those are the spans the resize handle offers, so the
  // division below comes out whole rather than merely filling.
  //
  // Deliberately still a division rather than a fixed pitch: a month grid
  // dragged to some other height should fill it rather than leave a ragged
  // strip at the bottom, and unlike a to-do there is no row COUNT to
  // change - the weeks in a month are what they are.
  // Measured from the ALLOCATION, like hourly-grid-core's rows and
  // todoChecklist's day columns - the last module still laying itself out
  // from the ink box.
  //
  // The height does not change: the content ran from the ink top plus a
  // 63px header (one cell less the inset at BOTH ends) to the ink bottom,
  // which is 75 x (rowSpan - 1); it now runs from the first lattice line
  // to the allocation's bottom edge, which is the same 75 x (rowSpan - 1).
  // Only the ORIGIN moves, by the 6px inset - and that is the whole
  // difference between every week rule sitting 6px off the dots and every
  // week rule sitting on them. It is what month-grid-core has been
  // carrying in moduleHouseStyle's LATTICE_DEBT.
  //
  // Nothing is drawn at the very bottom of the last week (the separator
  // loop stops at weekCount - 1, the border closes it instead), so running
  // to the allocation edge costs no mark outside the box.
  const contentTop = layout.contentTop;
  const rowHeight = layout.rowHeight;

  // Outer border around the whole block.
  elements.push({
    id: id("border"),
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
      id: id(`head-d${d}`),
      type: "text",
      x: dayX,
      y: capCentredTextY(geometry.y, headerHeight, fontSize, FONT_FAMILY),
      width: dayColumnWidth,
      height: textHeight,
      text: label.name,
      fontSize,
      fontFamily: FONT_FAMILY,
      align: "center",
    });
  }

  // Column dividers within the header band — missed in the first pass
  // (only the week-rows below got them), but the reference has these
  // too: confirmed via a vertical line segment measured at
  // (137.92, 41.77)-(137.92, 54.64), squarely inside the header's own
  // y-range (41.52-54.89).
  for (let d = 1; d < config.dayCount; d++) {
    const dividerX = geometry.x + d * dayColumnWidth;
    elements.push({
      id: id(`head-d${d}-rule`),
      type: "figure",
      subType: "rect",
      x: dividerX - lineWidth / 2,
      y: geometry.y,
      width: lineWidth,
      height: headerHeight,
      fill: LINE_COLOR,
      stroke: "none",
    });
  }

  // Header/body divider.
  elements.push({
    id: id("header-rule"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: contentTop - lineWidth / 2,
    width: geometry.width,
    height: lineWidth,
    fill: LINE_COLOR,
    stroke: "none",
  });

  const gridTop = contentTop;

  for (let w = 0; w < config.weekCount; w++) {
    const rowY = gridTop + w * rowHeight;
    const week = config.cells[w] ?? [];

    for (let d = 0; d < config.dayCount; d++) {
      const cell = week[d];
      const cellX = geometry.x + d * dayColumnWidth;

      // Date-number box: a small box in the top-left corner of the cell's
      // date-strip, matching the reference's own structure.
      //
      // ITS RIGHT SIDE ONLY. Its top, left and bottom are the week's rule,
      // the column's rule and the strip's rule, already drawn - and drawing
      // them again as an outlined box doubled every one on screen: the rules
      // are filled hairlines snapped to the device grid, an outline's stroke
      // lands half a pixel inside them, and each shared side showed as a
      // two-pixel band (reported 2026-10-06, "not create a double thick line
      // around it"). On paper they coincided, which is why the PDF never
      // showed it. Now each line is drawn once, as the rules are drawn.
      const rowBottom = layout.rowBottom(w);
      const cellRight = cellX + dayColumnWidth;
      // Where the date's ink is, for icons that share its corner.
      let dateSpan: { left: number; right: number } | null = null;
      if (cell && layout.style === "strip") {
        elements.push({
          id: id(`w${w}-d${d}-date-edge`),
          type: "figure",
          subType: "rect",
          x: cellX + dateBoxWidth - lineWidth / 2,
          y: rowY,
          width: lineWidth,
          height: dateStripHeight,
          fill: LINE_COLOR,
          stroke: "none",
        });

        // Centered, not left-aligned — left alignment measured close
        // enough against the reference's own 2-digit sample ("31") but
        // left single-digit dates (1-9, much narrower glyphs) sitting
        // visibly off to one side of the box instead of centered in it.
        // 5pt in the reference's half-cell strip, growing with a taller one.
        const dateFontSize = ptToPx(Math.max(5, (dateStripHeight / ptToPx(1)) * 0.5));
        const dateTextHeight = dateFontSize * 1.2;
        // Undated: the box (its edge above) stays, the number does not. A month grid
        // you write the dates into is exactly what an undated monthly is.
        if (typeof cell.date === "number") elements.push({
          id: id(`w${w}-d${d}-date`),
          type: "text",
          x: cellX,
          y: capCentredTextY(rowY, dateStripHeight, dateFontSize, FONT_FAMILY),
          width: dateBoxWidth,
          height: dateTextHeight,
          text: String(cell.date),
          fontSize: dateFontSize,
          fontFamily: FONT_FAMILY,
          fill: "#555555",
          align: "center",
        });
      } else if (cell && typeof cell.date === "number") {
        // LARGE AND FAINT, in its corner, with no box and no strip: the whole
        // day is writing space and the number is there to be read through.
        const size = ptToPx(FAINT_DATE_PT);
        const ink = textInkBand(0, size, FONT_FAMILY, "8");
        const inset = ptToPx(FAINT_DATE_INSET_PT);
        const text = String(cell.date);
        const width = textWidthPx(text, size, FONT_FAMILY);
        const left = layout.numberCorner === "top-left" ? cellX + inset : cellRight - inset - width;
        const capTop = layout.numberCorner === "top-left" ? rowY + inset : rowBottom - inset - (ink.bottom - ink.top);
        elements.push({
          id: id(`w${w}-d${d}-date`),
          type: "text",
          x: left,
          y: capTop - ink.top,
          width: width + 1,
          height: size * 1.2,
          text,
          fontSize: size,
          fontFamily: FONT_FAMILY,
          fill: LINE_COLOR,
          opacity: cell.inCurrentMonth === false ? FAINT_DATE_OPACITY * 0.6 : FAINT_DATE_OPACITY,
          align: "left",
        });
        dateSpan = { left, right: left + width };
      }

      // THE DAY'S ICONS, where they were put. In the strip they grow with it;
      // in a corner of the writing space they are 12pt, stepping round a
      // faint date in the same corner. As many as the day holds.
      const icons = cell?.icons ?? [];
      if (icons.length > 0) {
        const gap = ptToPx(DAY_ICON_GAP_PT);
        const writeTop = rowY + dateStripHeight;
        const place = layout.iconPlace;
        const inStrip = place === "strip";
        const stripMargin = Math.max(ptToPx(1), dateStripHeight * 0.1);
        const inset = ptToPx(CELL_ICON_INSET_PT);
        const size = inStrip
          ? Math.max(ptToPx(DAY_ICON_PT), dateStripHeight - stripMargin * 2)
          : Math.max(1, Math.min(ptToPx(CELL_ICON_PT), rowBottom - writeTop - inset * 2));
        const top = place === "bottom-left" || place === "bottom-right" ? rowBottom - inset - size : inStrip ? rowY + (dateStripHeight - size) / 2 : writeTop + inset;
        const rightward = place === "strip" || place === "top-left" || place === "bottom-left";
        const sharesCorner =
          dateSpan &&
          ((place === "top-left" && layout.numberCorner === "top-left") || (place === "bottom-right" && layout.numberCorner === "bottom-right"));
        let at = inStrip
          ? cellX + dateBoxWidth + gap
          : rightward
            ? (sharesCorner ? dateSpan!.right + ptToPx(4) : cellX + inset)
            : (sharesCorner ? dateSpan!.left - ptToPx(4) : cellRight - inset);
        icons.forEach(({ icon: shape, faces }, k) => {
          const x = rightward ? at : at - size;
          if (x < cellX + gap || x + size > cellRight - gap) return;
          elements.push(glyphElement({ id: id(`w${w}-d${d}-dayicon${k}`), x, y: top, sizePx: size, shape, faces }));
          at = rightward ? at + size + gap : at - size - gap;
        });
      }

      // Column divider (skip the leftmost — the outer border already
      // covers it).
      if (d > 0) {
        elements.push({
          id: id(`w${w}-d${d}-rule`),
          type: "figure",
          subType: "rect",
          x: cellX - lineWidth / 2,
          y: rowY,
          width: lineWidth,
          // Stopped at the border, not run to the end of the row.
          //
          // The rows reach the ALLOCATION's bottom edge so their rules
          // land on the dots, and that edge is 6px below the ink box - so
          // the last week's dividers used to carry on through the bottom
          // border and out the other side. The hourly grid can run to its
          // allocation because it draws nothing down there; this block has
          // a border to respect.
          height: Math.min(rowHeight, geometry.y + geometry.height - rowY),
          fill: LINE_COLOR,
          stroke: "none",
        });
      }
    }

    // Row divider under the date-strip, and under the body (i.e. the
    // top of the next row) — skip the very last row's bottom line, the
    // outer border already covers it.
    // Writing space in each day, below its date strip - the shared fill, on
    // the lattice's rows, clear of the day rules.
    const inside = config.inside === "lined" || config.inside === "dotted" ? config.inside : "none";
    if (inside !== "none") {
      for (let d = 0; d < config.dayCount; d++) {
        const left = geometry.x + d * dayColumnWidth;
        elements.push(
          ...latticeFill({
            style: inside,
            region: {
              left,
              right: d === config.dayCount - 1 ? geometry.x + geometry.width : left + dayColumnWidth,
              top: rowY + dateStripHeight,
              bottom: Math.min(rowY + rowHeight, geometry.y + geometry.height),
            },
            geometry,
            lattice,
            id,
            tag: `w${w}-d${d}-`,
            lineOpacity: 0.5,
          })
        );
      }
    }

    if (layout.style === "strip") elements.push({
      id: id(`w${w}-strip-rule`),
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
        id: id(`w${w}-rule`),
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
