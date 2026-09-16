// "HABITS" tracker — a wide habit-name column plus 7 day-letter columns
// (S M T W T F S, always all 7 days of the week regardless of which 3-4
// days the hourly grid above happens to show — habits get checked off
// daily, not scoped to half a spread). Re-measured from hourlyjournal.pdf
// page index 23 via get_drawings() (the earlier pass had measured off the
// wrong page/rect and got the header height wrong — see below): header
// row (top border to header/body divider) is 587.02-604.14 = 17.12pt
// tall, and each of the 7 day-letter columns is a fixed ~17.3pt wide
// (351.85-369.14, 369.14-386.42, etc.) — nearly identical to the header
// height, which is what makes them square in the reference. The name
// column (136.00-351.85 = 215.85pt) is what actually varies: it's
// whatever's left after 7 fixed-width square day-letter columns, not
// the other way around. Same renderer for the short (paired with
// todo-checklist) and full-height (this page's own new variant) uses —
// row count is just whatever fits in the given height.
//
// A second, genuinely different layout (renderHabitTrackerCompact, below)
// exists for a narrow, single-grid-column placement — requested directly,
// once dragging a habit tracker into the sidebar became possible. The
// side-by-side layout above physically cannot fit there: 7 fixed
// DAY_COLUMN_WIDTH_PT columns alone need ~121pt, already more than this
// app's own single sidebar column (~119pt on its actual grid), before any
// room for a name column at all. The compact layout instead stacks each
// habit into two rows — a name row, then a row of 7 day-letter squares
// below it — so the day cells can stay square without needing a wide name
// column beside them. Which one renders is decided purely by the
// allocated width (see COMPACT_LAYOUT_MAX_WIDTH_PX below), not by a
// passed-in flag — this module type is placed at exactly two widths in
// practice (a single sidebar column or 3-4 hourly-grid columns), and
// keying off the real allocated size means both this renderer and
// getHabitTrackerRowMetricsPx's own min-size floor (NativePlannerEditor.
// tsx/actions.ts's getMinRowSpanForSlug) stay correct automatically
// regardless of which zone a given instance ends up in.

import { estimateTextWidthPx, fitLabel, fitLabelSet } from "./textFit";
import { ptToPx } from "@/lib/print-spec";
import {
  RULE_WIDTH_PT, HEADING_SIZES_PT, contentTopPx,
  HEADER_HEIGHT_PT as FRAME_HEADER_HEIGHT_PT,
  type FrameLattice } from "@/lib/modules/moduleFrame";

export type HabitTrackerConfig = {
  habits?: string[]; // pre-filled habit names, optional
  /** Printed in the header band. Defaults to "HABITS". */
  heading?: string;
  /**
   * The column headings across the top. Defaults to a week.
   *
   * This is what makes the module a row-BY-COLUMN tracker rather than a
   * habit-by-week one: a chore chart's columns are people, a bill
   * tracker's are months, a salah tracker's are the five prayers. The
   * geometry is identical - named rows down the left, marks in the grid.
   */
  columns?: string[];
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

const NEAR_BLACK = "#231F20";
// The header band the renderer actually draws.
//
// Taken from moduleFrame rather than restated, because the renderers here
// do not use a constant at all - they call contentTopPx, which lands the
// band on the next lattice line down (pitch 75 less the box inset 6 = 69)
// and falls back to exactly this constant when there is no lattice.
//
// This file used to keep its own 15.12pt, i.e. 63px, described as "one dot
// pitch less the box inset at BOTH ends". That double-counted the inset:
// the band starts at the ink box's own top, which is already inset once.
// The number was six pixels short of the drawing and only ever reached the
// minimum-height rule, where six pixels is a whole row - so every named
// tracker's floor came out one row below what its rows actually need, and
// the last row was silently dropped at the minimum. See
// minRowSpanFloors.test.mts.
// The house heading size, from moduleFrame - the same 8pt labeled-box and
// the seven drawing primitives use.
//
// This was 12pt, and it was the last thing on a page still saying a
// module heading is 12pt: "the module headers are not all caps like the
// current modules" was about the NEW modules, and fixing those left the
// to-do and the habit tracker as the visible outliers instead. Asked for
// directly - "make the to-do and habit headers 8pt too".
//
// Taken from the frame rather than written as 8 here, so there is one
// description of the house heading and not three. Only the size changes:
// the header BAND stays 15.12pt, so no row count moves.
const HEADER_FONT_PT = HEADING_SIZES_PT[0];
// Bumped from the reference's measured ~6.7pt (bbox-height-derived) for
// legibility — Newsreader renders a hair smaller than the reference's
// MinionPro at the same nominal size.
const DAY_LETTER_FONT_PT = 8;
const BORDER_WIDTH_PT = 0.5;
// One row is one dot: 18pt, 75 print px, a quarter inch. Measured at
// 13.45pt, but that pitch does not divide the cell, so it always left a
// remainder that had to be stretched away — see the rowHeight comment
// below. Rows are a third taller as a result and a given box holds
// correspondingly fewer of them.
const ROW_HEIGHT_PT = 18;
// The house interior rule weight - see moduleFrame's RULE_WIDTH_PT.
const ROW_LINE_WIDTH_PT = RULE_WIDTH_PT;
// One dot wide, matching ROW_HEIGHT_PT, so every checkable cell in the
// body grid is exactly one lattice cell square. Fixed rather than derived
// from leftover width — the name column absorbs the remainder instead (see
// below), which is what stops the day cells stretching into rectangles in
// a wider allocation.
//
// This used to track the header height so the HEADER row's day-letter
// cells were square. It cannot do both: the header is the frame's own band
// (69px, one lattice line down) while the body cells have to be 75px to be
// one cell. The body grid wins, so the seven letter cells in the header
// band are slightly wide (75 x 69) rather than square.
const DAY_COLUMN_WIDTH_PT = 18;
// Sun/Mon/Tue/Wed/Thu/Fri/Sat — 7 entries. Reported directly: "missing
// a t for thursday" — this had dropped straight to Friday, only 6
// columns wide, off by exactly one weekday. Every downstream layout
// value (nameColumnWidth, each day column's own x position, the
// vertical dividers) is derived from this array's own .length, not a
// separately hardcoded count, so fixing it here is the whole fix —
// nothing else needed touching, at any size the module renders at
// (including a live-resized one — see renderHabitTracker's own
// contentIsLive caller, NativePlannerEditor.tsx, which calls this
// exact function during a resize preview too).
/**
 * The columns a tracker shows when its config does not name any.
 *
 * A week, which is what this module was built for. The catalogue needs
 * other sets against the same geometry - people for a chore chart, months
 * for a bill tracker, five prayers for a salah tracker - so the columns
 * are configurable and these are only the default. The primitive is a
 * row-by-column tracker; it was a week-by-habit one by accident of being
 * written once.
 */
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

// Below this allocated width, renderHabitTracker switches to the compact
// (stacked name-row + square-row) layout instead of the side-by-side one.
// 250pt is a wide safety margin on either side of this app's two actual
// placements — a single sidebar column is ~119pt, 3-4 hourly-grid columns
// are ~363-486pt — not a value tuned to sit close to either.
const COMPACT_LAYOUT_MAX_WIDTH_PX = ptToPx(250);
// Exposed so getMinRowSpanForSlug (both copies) can key its own compact-
// vs-wide floor off the exact same test this file's own render/metrics
// functions already use internally, instead of a second, independently-
// tuned width check that could drift out of sync with this one.
export function isHabitTrackerCompact(widthPx: number): boolean {
  return widthPx <= COMPACT_LAYOUT_MAX_WIDTH_PX;
}
// Compact layout only: height of each habit's own name/placeholder row.
// Shorter than ROW_HEIGHT_PT (a wide-layout row is also the checkable
// cell's own height, which has to match the square day cells there) —
// this row holds one short line of text and nothing else, so it only
// needs to comfortably fit that text.
const NAME_ROW_HEIGHT_PT = 12;
// Opacity for a row's NAME, placeholder or real.
//
// It began as the compact layout's "HABIT" placeholder only. Asked to
// extend to real names too - "for things that are drawn by habit tracker
// use the format for the text where 'habit' is grey and all caps" - so a
// prefilled row now reads the same way the empty one does: a pale
// uppercase label for the row, not writing already in it. Used by both
// layouts.
//
// Originally: opacity for the "HABIT" placeholder label a row
// shows when no real name has been filled in for it — a side-placed
// habit tracker has nowhere else to indicate what each row is for, since
// the compact layout has no separate name column left to leave blank.
// "Low opacity... a little darker" per direct request/follow-up
// (started at 0.35). A real, user-set name still renders at full
// opacity like the wide layout's own prefilled names do.
const PLACEHOLDER_OPACITY = 0.45;

// See todoChecklist.ts's identical getTodoChecklistRowMetricsPx for the
// full reasoning — same minimum-resize-height need, same "nominal only,
// not the render function's own stretch-to-fit adjustment" tradeoff.
// widthPx is optional only for callers that genuinely don't know it yet;
// every real caller today (getMinRowSpanForSlug, both copies) passes it,
// since the compact layout's own nominal row (a name row + a square,
// whose size depends on the allocated width) is a different height than
// the wide layout's fixed ROW_HEIGHT_PT.
export function getHabitTrackerRowMetricsPx(
  widthPx?: number,
  // How many columns this tracker actually has. The compact row is a name
  // row plus ONE SQUARE CELL, and a cell is width/columns, so a tracker of
  // twelve months has a shorter row than a tracker of seven days. This
  // divided by DAY_LETTERS.length unconditionally, from back when a
  // tracker was always a week - which over-stated the floor for a bill
  // tracker (harmless) and UNDER-stated it for a five-prayer one, letting
  // it be placed too short for the two pairs the floor is meant to
  // guarantee. The floor rule passes the real count now; the default is
  // for a tracker that names no columns, which is a week.
  columnCount: number = DAY_LETTERS.length
): {
  headerHeightPx: number;
  nominalRowHeightPx: number;
  rowLineWidthPx: number;
} {
  const isCompact = widthPx !== undefined && isHabitTrackerCompact(widthPx);
  const nominalRowHeightPx = isCompact
    ? ptToPx(NAME_ROW_HEIGHT_PT) + widthPx! / Math.max(1, columnCount)
    : ptToPx(ROW_HEIGHT_PT);
  return {
    headerHeightPx: ptToPx(FRAME_HEADER_HEIGHT_PT),
    nominalRowHeightPx,
    rowLineWidthPx: ptToPx(ROW_LINE_WIDTH_PT),
  };
}

export function renderHabitTracker(
  geometry: { x: number; y: number; width: number; height: number },
  config: HabitTrackerConfig,
  idPrefix: string,
  fontFamily: string,
  lattice?: FrameLattice
): RenderedElement[] {
  if (isHabitTrackerCompact(geometry.width)) {
    return renderHabitTrackerCompact(geometry, config, idPrefix, fontFamily);
  }

  const elements: RenderedElement[] = [];
  // Semantic, not positional — see todoChecklist.ts for the whole story.
  // An id names one mark for the life of the module, so adding a row does
  // not renumber every mark after it and force a remount of the drawing.
  const id = (name: string) => `${idPrefix}-${name}`;
  const FONT_FAMILY = fontFamily;

  // Renders flush with its own allocated cell (contentY === geometry.y)
  // — see the identical comment in todoChecklist.ts. This used to push
  // content down by a fixed 18.5pt to match the reference PDF's gap
  // below the hourly grid, back when this block was always auto-placed
  // directly beneath one; now that it's freely user-placed, that
  // assumption doesn't hold everywhere else it might land.
  const contentY = geometry.y;
  // The columns this tracker actually has - its own, or a week.
  const columns = (config.columns ?? []).length > 0 ? config.columns! : DAY_LETTERS;
  const contentHeight = geometry.height;

  // The header band ends on the first LATTICE line - same change, same
  // reason, and the same cost as the to-do's: see contentTopPx, and
  // todoChecklist.ts for the report that prompted it.
  const headerHeight = contentTopPx({ ...geometry, y: contentY }, lattice) - contentY;
  const nominalRowHeight = ptToPx(ROW_HEIGHT_PT);
  const rowLineWidth = ptToPx(ROW_LINE_WIDTH_PT);
  // Day-letter columns are fixed-width (square against the header
  // height); the name column takes whatever's left, growing to fill a
  // wider allocation rather than the day-letter columns stretching to
  // fill it (which was making them wide rectangles, not squares).
  // A column is DAY_COLUMN_WIDTH_PT wide - a checkable cell, sized for one
  // letter - unless its own label needs more than that.
  //
  // Fixed at 18pt it was right for the week this primitive was written
  // for and wrong for every catalogue set that is not initials: a salah
  // tracker printed "Magh…" for Maghrib and a future log "Even…" for
  // Events, both at full page width, with a name column taking half the
  // box beside them. Growing the column instead leaves a week exactly
  // where it was - one letter at 8pt is about 34px against the 75px cell -
  // and takes the space from the name column, which is the one holding
  // slack it does not need.
  //
  // Capped so the labels can never squeeze the names out entirely; past
  // that cap fitLabelSet shrinks and, in the last resort, truncates.
  const labelWidthNeeded = Math.max(
    ...columns.map((label) => estimateTextWidthPx(label, ptToPx(DAY_LETTER_FONT_PT)) + ptToPx(4))
  );
  const dayColumnWidth = Math.min(
    Math.max(ptToPx(DAY_COLUMN_WIDTH_PT), labelWidthNeeded),
    (geometry.width * 0.72) / columns.length
  );
  const nameColumnWidth = geometry.width - dayColumnWidth * columns.length;

  const rowCount = Math.max(
    0,
    Math.floor((contentHeight - headerHeight) / nominalRowHeight)
  );
  // The pitch is fixed, and since it divides the remaining height exactly
  // there is no remainder to stretch away. This used to divide the box by
  // rowCount instead, which made the row height a function of the box
  // height — so a short habit tracker and a tall one on the same page had
  // visibly different rows, and growing one moved every line in it rather
  // than adding lines at the bottom. `npm run check:behaviour` measured
  // that as 39 marks moving against 3 staying put.
  const rowHeight = nominalRowHeight;

  // Outer border — reaches the full allocated height exactly.
  elements.push({
    id: id("border"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: contentY,
    width: geometry.width,
    height: contentHeight,
    fill: "transparent",
    stroke: NEAR_BLACK,
    strokeWidth: ptToPx(BORDER_WIDTH_PT),
  });

  // "HABITS" label, centered within the name column. Manually centered
  // vertically rather than relying on verticalAlign, which hasn't
  // reliably centered text elsewhere in this codebase.
  const headerFontSize = ptToPx(HEADER_FONT_PT);
  const headerTextHeight = headerFontSize * 1.2;
  elements.push({
    id: id("heading"),
    type: "text",
    x: geometry.x,
    y: contentY + (headerHeight - headerTextHeight) / 2,
    width: nameColumnWidth,
    height: headerTextHeight,
    text: (config.heading ?? "HABITS").toUpperCase(),
    fontSize: headerFontSize,
    fontFamily: FONT_FAMILY,
    align: "center",
  });

  // Divider between the header row and the habit-name grid.
  elements.push({
    id: id("header-rule"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: contentY + headerHeight - rowLineWidth / 2,
    width: geometry.width,
    height: rowLineWidth,
    fill: NEAR_BLACK,
    stroke: "none",
  });

  // Vertical divider between name column and day-letter columns.
  elements.push({
    id: id("name-col-rule"),
    type: "figure",
    subType: "rect",
    x: geometry.x + nameColumnWidth - rowLineWidth / 2,
    y: contentY,
    width: rowLineWidth,
    // Down to the border. With a fixed pitch the last row line and the
    // bottom edge are no longer necessarily the same place, and a divider
    // stopping at the former would hang short of the frame.
    height: contentHeight,
    fill: NEAR_BLACK,
    stroke: "none",
  });

  // Day-letter headers + their column dividers.
  //
  // Fitted rather than fixed at 8pt: a column label is "S" for a week but
  // the catalogue also hands this primitive "Rent", "Fajr" and twelve
  // month initials, and nothing clips a text node - a label wider than its
  // column prints straight over the next one. One size for the whole set,
  // for the reason fitLabelSet exists.
  const dayLetters = fitLabelSet(
    columns.map((text) => ({ text, widthPx: dayColumnWidth - ptToPx(2) })),
    [ptToPx(DAY_LETTER_FONT_PT), ptToPx(7), ptToPx(6), ptToPx(5)]
  );
  const dayLetterFontSize = dayLetters.fontSizePx;
  const dayLetterTextHeight = dayLetterFontSize * 1.2;
  columns.forEach((_letter, i) => {
    const letter = dayLetters.texts[i];
    const colX = geometry.x + nameColumnWidth + i * dayColumnWidth;
    elements.push({
      id: id(`day${i}-letter`),
      type: "text",
      x: colX,
      y: contentY + (headerHeight - dayLetterTextHeight) / 2,
      width: dayColumnWidth,
      height: dayLetterTextHeight,
      text: letter,
      fontSize: dayLetterFontSize,
      fontFamily: FONT_FAMILY,
      align: "center",
    });
    if (i > 0) {
      elements.push({
        id: id(`day${i}-rule`),
        type: "figure",
        subType: "rect",
        x: colX - rowLineWidth / 2,
        y: contentY,
        width: rowLineWidth,
        // Down to the border. With a fixed pitch the last row line and the
    // bottom edge are no longer necessarily the same place, and a divider
    // stopping at the former would hang short of the frame.
    height: contentHeight,
        fill: NEAR_BLACK,
        stroke: "none",
        opacity: 0.6,
      });
    }
  });

  const gridTop = contentY + headerHeight;

  // Habit-name rows + optional pre-filled names.
  for (let i = 0; i < rowCount; i++) {
    const rowY = gridTop + i * rowHeight;
    // Pinned to the bottom border on the last row. Under the current
    // geometry that is exactly where the pitch puts it anyway; it is here
    // so a future change to the header, inset or cell pitch degrades to a
    // slightly deep last row rather than to a thin abandoned strip.
    const rowBottom =
rowY + rowHeight;
    // The bottom border already draws this line, and draws it better: it
    // is 0.5pt with its outer edge flush to the box, where a row
    // separator is a 0.35pt fill centred on its own position. Drawing
    // both put a lighter, thinner, half-overhanging line across part of
    // the border — reported as the bottom edge appearing to alternate
    // thick and thin along its length, because the separator only spans
    // each column and the gutters between them showed the border alone.
    if (Math.abs(rowBottom - (contentY + contentHeight)) < 0.5) continue;
    elements.push({
      id: id(`row${i}`),
      type: "figure",
      subType: "rect",
      x: geometry.x,
      y: rowBottom - rowLineWidth / 2,
      width: geometry.width,
      height: rowLineWidth,
      fill: NEAR_BLACK,
      stroke: "none",
      opacity: 0.6,
    });

    const habitName = config.habits?.[i];
    if (habitName) {
      // Shrunk and, in the last resort, cut - nothing in the renderer
      // clips a text node, so a long row name in a narrow name column
      // prints out of the module and over its neighbour.
      const fitted = fitLabel(habitName.toUpperCase(), nameColumnWidth - 12, [
        ptToPx(7),
        ptToPx(6),
        ptToPx(5),
      ]);
      const nameFontSize = fitted.fontSizePx;
      const nameTextHeight = nameFontSize * 1.2;
      elements.push({
        id: id(`row${i}-name`),
        type: "text",
        x: geometry.x + 6,
        y: rowY + (rowHeight - nameTextHeight) / 2,
        width: nameColumnWidth - 12,
        height: nameTextHeight,
        text: fitted.text,
        fontSize: nameFontSize,
        fontFamily: FONT_FAMILY,
        fill: NEAR_BLACK,
        opacity: PLACEHOLDER_OPACITY,
        align: "left",
      });
    }
  }

  return elements;
}

// Compact layout — see this file's own top-of-file comment for why this
// exists and when it's chosen. "Comes in rows of two" per direct request:
// each habit gets a name row ("habit," low opacity, when no real name has
// been filled in) directly above its own row of 7 day-letter squares,
// instead of the wide layout's single row with the name and day-letters
// side by side.
function renderHabitTrackerCompact(
  geometry: { x: number; y: number; width: number; height: number },
  config: HabitTrackerConfig,
  idPrefix: string,
  fontFamily: string,
  lattice?: FrameLattice
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic, not positional — see todoChecklist.ts for the whole story.
  // An id names one mark for the life of the module, so adding a row does
  // not renumber every mark after it and force a remount of the drawing.
  const id = (name: string) => `${idPrefix}-${name}`;
  const FONT_FAMILY = fontFamily;

  const contentY = geometry.y;
  // The columns this tracker actually has - its own, or a week.
  const columns = (config.columns ?? []).length > 0 ? config.columns! : DAY_LETTERS;
  const contentHeight = geometry.height;
  // The header band ends on the first LATTICE line - same change, same
  // reason, and the same cost as the to-do's: see contentTopPx, and
  // todoChecklist.ts for the report that prompted it.
  const headerHeight = contentTopPx({ ...geometry, y: contentY }, lattice) - contentY;
  const rowLineWidth = ptToPx(ROW_LINE_WIDTH_PT);
  const nameRowHeight = ptToPx(NAME_ROW_HEIGHT_PT);
  // Each day square's own width doubles as its own height (a real square,
  // same spirit as the wide layout's fixed-width day columns) — derived
  // from the actual allocated width rather than pinned to
  // DAY_COLUMN_WIDTH_PT, since a sidebar column's real width depends on
  // this page's own grid config, not one fixed measurement.
  const squareSize = geometry.width / columns.length;
  const nominalPairHeight = nameRowHeight + squareSize;

  const pairCount = Math.max(0, Math.floor((contentHeight - headerHeight) / nominalPairHeight));
  // Stretched a hair so pairCount whole pairs exactly fill the allocated
  // box, same "no rounding gap at the bottom" convention as the wide
  // layout's own rowHeight — but only the name row absorbs the
  // remainder; the square row can't, or its cells would stop being
  // square.
  const pairHeight = pairCount > 0 ? (contentHeight - headerHeight) / pairCount : nominalPairHeight;
  const actualNameRowHeight = pairHeight - squareSize;

  // Outer border — reaches the full allocated height exactly.
  elements.push({
    id: id("border"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: contentY,
    width: geometry.width,
    height: contentHeight,
    fill: "transparent",
    stroke: NEAR_BLACK,
    strokeWidth: ptToPx(BORDER_WIDTH_PT),
  });

  // "HABITS" header, centered across the full width — no name/day-letter
  // column split to center within anymore.
  const headerFontSize = ptToPx(HEADER_FONT_PT);
  const headerTextHeight = headerFontSize * 1.2;
  elements.push({
    id: id("heading"),
    type: "text",
    x: geometry.x,
    y: contentY + (headerHeight - headerTextHeight) / 2,
    width: geometry.width,
    height: headerTextHeight,
    text: (config.heading ?? "HABITS").toUpperCase(),
    fontSize: headerFontSize,
    fontFamily: FONT_FAMILY,
    align: "center",
  });

  // Divider between the header and the first pair.
  elements.push({
    id: id("header-rule"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: contentY + headerHeight - rowLineWidth / 2,
    width: geometry.width,
    height: rowLineWidth,
    fill: NEAR_BLACK,
    stroke: "none",
  });

  // The letter has to fit the SQUARE it sits in, which here is a measured
  // quantity rather than a chosen one: squareSize is width/columns, so a
  // sidebar week gets a roomy cell and a twelve-month bill tracker gets
  // 36.5px - against a 40px line box at 8pt, which put the last row's
  // letters through the bottom border. Height first (the binding
  // constraint), then width through the usual set fit.
  const letterCapPx = Math.min(ptToPx(DAY_LETTER_FONT_PT), squareSize / 1.2);
  const dayLetters = fitLabelSet(
    columns.map((text) => ({ text, widthPx: squareSize - ptToPx(1) })),
    [letterCapPx, letterCapPx * 0.85, letterCapPx * 0.7]
  );
  const dayLetterFontSize = dayLetters.fontSizePx;
  const dayLetterTextHeight = dayLetterFontSize * 1.2;
  const nameFontSize = ptToPx(7); // same size the wide layout's own prefilled habit names use
  const nameTextHeight = nameFontSize * 1.2;

  for (let i = 0; i < pairCount; i++) {
    const pairTop = contentY + headerHeight + i * pairHeight;
    const squareRowTop = pairTop + actualNameRowHeight;

    // Habit-name row: the real name if one was pre-filled, otherwise a
    // low-opacity "habit" placeholder. Every row needs its own label here
    // even while empty — unlike the wide layout, there's no separate name
    // column left in the header to hint at what a blank row is for.
    // The placeholder ("no real name yet") case is centered across the
    // full row width, all caps, same styling language as the "HABITS"
    // header above it — requested directly. A real, filled-in name
    // keeps the wide layout's own inset-from-the-left convention
    // instead (x/width padded by 6px each side), unaffected.
    // The placeholder is for a tracker with NO names at all - the blank
    // sidebar one, where every row needs a hint about what it is for. Once
    // some rows are named the pattern is established, and a catalogue
    // preset with three named rows printed a fourth reading "HABIT": wrong
    // in a bill tracker, wrong in a rest-day tracker, and wrong anywhere
    // the word is not the module's own. A spare row is left blank instead.
    const named = (config.habits ?? []).some((name) => (name ?? "").trim().length > 0);
    const habitName = config.habits?.[i] ?? (named ? "" : undefined);
    const rowName = fitLabel(
      (habitName ?? "HABIT").toUpperCase(),
      geometry.width - 12,
      [nameFontSize, ptToPx(6), ptToPx(5)]
    );
    elements.push({
      id: id(`pair${i}-name`),
      type: "text",
      x: geometry.x + 6,
      y: pairTop + (actualNameRowHeight - nameTextHeight) / 2,
      width: geometry.width - 12,
      height: nameTextHeight,
      text: rowName.text,
      fontSize: rowName.fontSizePx,
      fontFamily: FONT_FAMILY,
      // Exactly the placeholder's treatment now, alignment included: pale,
      // uppercase and CENTRED.
      //
      // A named row was left-inset and only the empty one centred, so a
      // tracker with some rows filled had its labels stepping between two
      // alignments down the same column. This layout has no separate name
      // column - the name row spans the whole module, with the day cells
      // under it - so there is no left edge for a label to belong to, and
      // centred is what the row's own width asks for. The WIDE layout
      // keeps its names left: there the name really is a column, and a
      // column of labels reads down its left edge.
      fill: NEAR_BLACK,
      opacity: PLACEHOLDER_OPACITY,
      align: "center",
    });

    // Divider between this pair's name row and its own square row.
    elements.push({
      id: id(`pair${i}-name-rule`),
      type: "figure",
      subType: "rect",
      x: geometry.x,
      y: squareRowTop - rowLineWidth / 2,
      width: geometry.width,
      height: rowLineWidth,
      fill: NEAR_BLACK,
      stroke: "none",
      opacity: 0.6,
    });

    // 7 day-letter squares, plus the vertical dividers between them (the
    // outer border above already closes off the leftmost and rightmost
    // edges).
    columns.forEach((_letter, d) => {
      const letter = dayLetters.texts[d];
      const colX = geometry.x + d * squareSize;
      elements.push({
        id: id(`pair${i}-day${d}-letter`),
        type: "text",
        x: colX,
        y: squareRowTop + (squareSize - dayLetterTextHeight) / 2,
        width: squareSize,
        height: dayLetterTextHeight,
        text: letter,
        fontSize: dayLetterFontSize,
        fontFamily: FONT_FAMILY,
        align: "center",
      });
      if (d > 0) {
        elements.push({
          id: id(`pair${i}-day${d}-rule`),
          type: "figure",
          subType: "rect",
          x: colX - rowLineWidth / 2,
          y: squareRowTop,
          width: rowLineWidth,
          height: squareSize,
          fill: NEAR_BLACK,
          stroke: "none",
          opacity: 0.6,
        });
      }
    });

    // Divider below this pair's square row — between this habit and the
    // next, or redundant with the outer border for the last one (same
    // harmless overlap the wide layout's own last-row divider already
    // has).
    elements.push({
      id: id(`pair${i}-rule`),
      type: "figure",
      subType: "rect",
      x: geometry.x,
      y: squareRowTop + squareSize - rowLineWidth / 2,
      width: geometry.width,
      height: rowLineWidth,
      fill: NEAR_BLACK,
      stroke: "none",
      opacity: 0.6,
    });
  }

  return elements;
}
