// "HABITS" tracker — a wide habit-name column plus 6 day-letter columns
// (S M T W F S, always all 7 days of the week regardless of which 3-4
// days the hourly grid above happens to show — habits get checked off
// daily, not scoped to half a spread). Measured from hourlyjournal.pdf
// page 24 (get_drawings() + get_text('dict')): "HABITS" and the day
// letters share one header row, name column ~215.7pt wide, day-letter
// columns ~17.3pt each. Same renderer for the short (paired with
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
const HEADER_HEIGHT_PT = 23.3;
const HEADER_FONT_PT = 12;
const DAY_LETTER_FONT_PT = 6;
const BORDER_WIDTH_PT = 0.5;
const ROW_HEIGHT_PT = 13.45;
const ROW_LINE_WIDTH_PT = 0.35;
const NAME_COLUMN_WIDTH_PT = 215.7;
const DAY_LETTERS = ["S", "M", "T", "W", "F", "S"];

export function renderHabitTracker(
  geometry: { x: number; y: number; width: number; height: number },
  config: HabitTrackerConfig,
  idPrefix: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  let idCounter = 0;
  const nextId = () => `${idPrefix}-${idCounter++}`;

  const headerHeight = ptToPx(HEADER_HEIGHT_PT);
  const rowHeight = ptToPx(ROW_HEIGHT_PT);
  const rowLineWidth = ptToPx(ROW_LINE_WIDTH_PT);
  // Name column is a fixed measured width; day-letter columns split
  // whatever's left evenly (rather than also hardcoding 17.3pt each,
  // so the block still looks right if it's ever placed somewhere
  // narrower or wider than the reference's exact column width).
  const nameColumnWidth = ptToPx(NAME_COLUMN_WIDTH_PT);
  const dayColumnsWidth = geometry.width - nameColumnWidth;
  const dayColumnWidth = dayColumnsWidth / DAY_LETTERS.length;

  const rowCount = Math.max(
    0,
    Math.floor((geometry.height - headerHeight) / rowHeight)
  );

  // Outer border.
  elements.push({
    id: nextId(),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: headerHeight + rowCount * rowHeight,
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
    y: geometry.y + (headerHeight - headerTextHeight) / 2,
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
    y: geometry.y + headerHeight - rowLineWidth / 2,
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
    y: geometry.y,
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
      y: geometry.y + (headerHeight - dayLetterTextHeight) / 2,
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
        y: geometry.y,
        width: rowLineWidth,
        height: headerHeight + rowCount * rowHeight,
        fill: NEAR_BLACK,
        stroke: "none",
        opacity: 0.6,
      });
    }
  });

  const gridTop = geometry.y + headerHeight;

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
