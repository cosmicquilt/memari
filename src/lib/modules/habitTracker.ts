// "HABITS" tracker — a wide habit-name column plus 6 day-letter columns
// (S M T W F S, always all 7 days of the week regardless of which 3-4
// days the hourly grid above happens to show — habits get checked off
// daily, not scoped to half a spread). Re-measured from hourlyjournal.pdf
// page index 23 via get_drawings() (the earlier pass had measured off the
// wrong page/rect and got the header height wrong — see below): header
// row (top border to header/body divider) is 587.02-604.14 = 17.12pt
// tall, and each of the 6 day-letter columns is a fixed ~17.3pt wide
// (351.85-369.14, 369.14-386.42, etc.) — nearly identical to the header
// height, which is what makes them square in the reference. The name
// column (136.00-351.85 = 215.85pt) is what actually varies: it's
// whatever's left after 6 fixed-width square day-letter columns, not
// the other way around. Same renderer for the short (paired with
// todo-checklist) and full-height (this page's own new variant) uses —
// row count is just whatever fits in the given height.

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
const DAY_LETTERS = ["S", "M", "T", "W", "F", "S"];
// Gap between hourly-grid-core's last ruled row line and this block's
// own top border — see the identical constant/comment in
// todoChecklist.ts; same 18.51pt measurement, applies uniformly to
// whichever below-zone module sits directly under the hourly grid.
const TOP_GAP_PT = 18.5;

export function renderHabitTracker(
  geometry: { x: number; y: number; width: number; height: number },
  config: HabitTrackerConfig,
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
