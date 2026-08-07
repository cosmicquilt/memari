// "WEEK 1/52" + date range, top of the sidebar column. Locked/core like
// hourly-grid-core — its content is structural (driven by which week this
// page actually is), not something a user drags around.

export type WeekTitleConfig = {
  weekNumber: number;
  weekTotal: number;
  dateRangeLabel: string; // e.g. "DEC 31 - JAN 6"
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

import { ptToPx } from "@/lib/print-spec";

const FONT_FAMILY = "PT Serif";

export function renderWeekTitle(
  geometry: { x: number; y: number; width: number; height: number },
  config: WeekTitleConfig,
  idPrefix: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  let idCounter = 0;
  const nextId = () => `${idPrefix}-${idCounter++}`;

  // Measured from the reference PDF's embedded text metadata: "WEEK
  // 1/52" is 8pt, "DEC 31 - JAN 6" is 13pt.
  const smallLineHeight = ptToPx(8) * 1.4;
  // The day-of-week headers (hourly-grid-core) sit at the very top of
  // the page; "WEEK 1/52" starts 16.4pt lower than that — measured as
  // the gap between the header box's top (y=18.2pt) and this text's
  // top (y=34.6pt) in the reference. Both blocks start at the same
  // grid row, so that offset has to be applied here explicitly.
  const topOffset = ptToPx(16.4);

  elements.push({
    id: nextId(),
    type: "text",
    x: geometry.x,
    y: geometry.y + topOffset,
    width: geometry.width,
    height: smallLineHeight,
    text: `WEEK ${config.weekNumber}/${config.weekTotal}`,
    fontSize: ptToPx(8),
    fontFamily: FONT_FAMILY,
    fill: "#555555",
    align: "left",
  });

  // Capped to its own natural line height rather than filling the rest
  // of the allocated cell — that was leaving no visible gap before the
  // next box, since the text box itself extended right to the boundary.
  const dateRangeLineHeight = ptToPx(13) * 1.3;
  elements.push({
    id: nextId(),
    type: "text",
    x: geometry.x,
    y: geometry.y + topOffset + smallLineHeight,
    width: geometry.width,
    height: dateRangeLineHeight,
    text: config.dateRangeLabel,
    fontSize: ptToPx(13),
    fontFamily: FONT_FAMILY,
    align: "left",
  });

  return elements;
}
