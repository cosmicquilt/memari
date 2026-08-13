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

import { ptToPx } from "@/lib/print-spec";

export type HabitTrackerConfig = {
  habits?: string[]; // pre-filled habit names, optional
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
// Corrected from an earlier 23.3 — that value was measured off the wrong
// rect. The header row (top border to header/body divider) is actually
// 587.02 to 604.14 in the reference, 17.12pt tall.
const HEADER_HEIGHT_PT = 17.1;
const HEADER_FONT_PT = 12;
// Bumped from the reference's measured ~6.7pt (bbox-height-derived) for
// legibility — PT Serif renders a hair smaller than the reference's
// MinionPro at the same nominal size.
const DAY_LETTER_FONT_PT = 8;
const BORDER_WIDTH_PT = 0.5;
const ROW_HEIGHT_PT = 13.45;
const ROW_LINE_WIDTH_PT = 0.35;
// Fixed, not derived from leftover width — matches HEADER_HEIGHT_PT
// closely by design (17.3 vs 17.1), which is what makes the header row's
// day-letter cells square. The name column absorbs whatever width is
// left over instead (see below).
const DAY_COLUMN_WIDTH_PT = 17.3;
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
// Compact layout only: opacity for the "HABIT" placeholder label a row
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
export function getHabitTrackerRowMetricsPx(widthPx?: number): {
  headerHeightPx: number;
  nominalRowHeightPx: number;
  rowLineWidthPx: number;
} {
  const isCompact = widthPx !== undefined && isHabitTrackerCompact(widthPx);
  const nominalRowHeightPx = isCompact
    ? ptToPx(NAME_ROW_HEIGHT_PT) + widthPx! / DAY_LETTERS.length
    : ptToPx(ROW_HEIGHT_PT);
  return {
    headerHeightPx: ptToPx(HEADER_HEIGHT_PT),
    nominalRowHeightPx,
    rowLineWidthPx: ptToPx(ROW_LINE_WIDTH_PT),
  };
}

export function renderHabitTracker(
  geometry: { x: number; y: number; width: number; height: number },
  config: HabitTrackerConfig,
  idPrefix: string
): RenderedElement[] {
  if (isHabitTrackerCompact(geometry.width)) {
    return renderHabitTrackerCompact(geometry, config, idPrefix);
  }

  const elements: RenderedElement[] = [];
  let idCounter = 0;
  const nextId = () => `${idPrefix}-${idCounter++}`;

  // Renders flush with its own allocated cell (contentY === geometry.y)
  // — see the identical comment in todoChecklist.ts. This used to push
  // content down by a fixed 18.5pt to match the reference PDF's gap
  // below the hourly grid, back when this block was always auto-placed
  // directly beneath one; now that it's freely user-placed, that
  // assumption doesn't hold everywhere else it might land.
  const contentY = geometry.y;
  const contentHeight = geometry.height;

  const headerHeight = ptToPx(HEADER_HEIGHT_PT);
  const nominalRowHeight = ptToPx(ROW_HEIGHT_PT);
  const rowLineWidth = ptToPx(ROW_LINE_WIDTH_PT);
  // Day-letter columns are fixed-width (square against the header
  // height); the name column takes whatever's left, growing to fill a
  // wider allocation rather than the day-letter columns stretching to
  // fill it (which was making them wide rectangles, not squares).
  const dayColumnWidth = ptToPx(DAY_COLUMN_WIDTH_PT);
  const nameColumnWidth = geometry.width - dayColumnWidth * DAY_LETTERS.length;

  const rowCount = Math.max(
    0,
    Math.floor((contentHeight - headerHeight) / nominalRowHeight)
  );
  // Stretched a hair beyond the nominal measured row height so rowCount
  // whole rows exactly fill the allocated box, matching labeledBox.ts's
  // Notes box (which always renders at its full allocated height with no
  // rounding gap) instead of leaving unused space below the last row.
  const rowHeight =
    rowCount > 0 ? (contentHeight - headerHeight) / rowCount : nominalRowHeight;

  // Outer border — reaches the full allocated height exactly.
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
    strokeWidth: ptToPx(BORDER_WIDTH_PT),
  });

  // "HABITS" label, centered within the name column. Manually centered
  // vertically rather than relying on verticalAlign, which hasn't
  // reliably centered text elsewhere in this codebase.
  const headerFontSize = ptToPx(HEADER_FONT_PT);
  const headerTextHeight = headerFontSize * 1.2;
  elements.push({
    id: nextId(),
    type: "text",
    x: geometry.x,
    y: contentY + (headerHeight - headerTextHeight) / 2,
    width: nameColumnWidth,
    height: headerTextHeight,
    text: "HABITS",
    fontSize: headerFontSize,
    fontFamily: FONT_FAMILY,
    align: "center",
  });

  // Divider between the header row and the habit-name grid.
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

  // Vertical divider between name column and day-letter columns.
  elements.push({
    id: nextId(),
    type: "figure",
    subType: "rect",
    x: geometry.x + nameColumnWidth - rowLineWidth / 2,
    y: contentY,
    width: rowLineWidth,
    height: headerHeight + rowCount * rowHeight,
    fill: NEAR_BLACK,
    stroke: "none",
  });

  // Day-letter headers + their column dividers.
  const dayLetterFontSize = ptToPx(DAY_LETTER_FONT_PT);
  const dayLetterTextHeight = dayLetterFontSize * 1.2;
  DAY_LETTERS.forEach((letter, i) => {
    const colX = geometry.x + nameColumnWidth + i * dayColumnWidth;
    elements.push({
      id: nextId(),
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
        id: nextId(),
        type: "figure",
        subType: "rect",
        x: colX - rowLineWidth / 2,
        y: contentY,
        width: rowLineWidth,
        height: headerHeight + rowCount * rowHeight,
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
    elements.push({
      id: nextId(),
      type: "figure",
      subType: "rect",
      x: geometry.x,
      y: rowY + rowHeight - rowLineWidth / 2,
      width: geometry.width,
      height: rowLineWidth,
      fill: NEAR_BLACK,
      stroke: "none",
      opacity: 0.6,
    });

    const habitName = config.habits?.[i];
    if (habitName) {
      const nameFontSize = ptToPx(7);
      const nameTextHeight = nameFontSize * 1.2;
      elements.push({
        id: nextId(),
        type: "text",
        x: geometry.x + 6,
        y: rowY + (rowHeight - nameTextHeight) / 2,
        width: nameColumnWidth - 12,
        height: nameTextHeight,
        text: habitName,
        fontSize: nameFontSize,
        fontFamily: FONT_FAMILY,
        fill: "#333333",
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
  idPrefix: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  let idCounter = 0;
  const nextId = () => `${idPrefix}-${idCounter++}`;

  const contentY = geometry.y;
  const contentHeight = geometry.height;
  const headerHeight = ptToPx(HEADER_HEIGHT_PT);
  const rowLineWidth = ptToPx(ROW_LINE_WIDTH_PT);
  const nameRowHeight = ptToPx(NAME_ROW_HEIGHT_PT);
  // Each day square's own width doubles as its own height (a real square,
  // same spirit as the wide layout's fixed-width day columns) — derived
  // from the actual allocated width rather than pinned to
  // DAY_COLUMN_WIDTH_PT, since a sidebar column's real width depends on
  // this page's own grid config, not one fixed measurement.
  const squareSize = geometry.width / DAY_LETTERS.length;
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
    id: nextId(),
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
    id: nextId(),
    type: "text",
    x: geometry.x,
    y: contentY + (headerHeight - headerTextHeight) / 2,
    width: geometry.width,
    height: headerTextHeight,
    text: "HABITS",
    fontSize: headerFontSize,
    fontFamily: FONT_FAMILY,
    align: "center",
  });

  // Divider between the header and the first pair.
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

  const dayLetterFontSize = ptToPx(DAY_LETTER_FONT_PT);
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
    const habitName = config.habits?.[i];
    elements.push({
      id: nextId(),
      type: "text",
      x: habitName ? geometry.x + 6 : geometry.x,
      y: pairTop + (actualNameRowHeight - nameTextHeight) / 2,
      width: habitName ? geometry.width - 12 : geometry.width,
      height: nameTextHeight,
      text: habitName ?? "HABIT",
      fontSize: nameFontSize,
      fontFamily: FONT_FAMILY,
      fill: habitName ? "#333333" : NEAR_BLACK,
      opacity: habitName ? 1 : PLACEHOLDER_OPACITY,
      align: habitName ? "left" : "center",
    });

    // Divider between this pair's name row and its own square row.
    elements.push({
      id: nextId(),
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
    DAY_LETTERS.forEach((letter, d) => {
      const colX = geometry.x + d * squareSize;
      elements.push({
        id: nextId(),
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
          id: nextId(),
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
      id: nextId(),
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
