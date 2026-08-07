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

  const smallLineHeight = ptToPx(9) * 1.4;

  elements.push({
    id: nextId(),
    type: "text",
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: smallLineHeight,
    text: `WEEK ${config.weekNumber}/${config.weekTotal}`,
    fontSize: ptToPx(9),
    fontFamily: FONT_FAMILY,
    fill: "#555555",
    align: "left",
  });

  elements.push({
    id: nextId(),
    type: "text",
    x: geometry.x,
    y: geometry.y + smallLineHeight,
    width: geometry.width,
    height: geometry.height - smallLineHeight,
    text: config.dateRangeLabel,
    fontSize: ptToPx(18),
    fontFamily: FONT_FAMILY,
    align: "left",
    verticalAlign: "top",
  });

  return elements;
}
