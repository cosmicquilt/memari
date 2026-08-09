// "JANUARY" — the big month-name title at the top of the sidebar column
// on a monthly page's left side. Locked/core like week-title, which this
// mirrors exactly: content is structural (which month this is), not
// something a user drags around, and it occupies the same column range
// as the sidebar box stack below it, not the calendar grid beside it —
// confirmed by measuring the reference PDF (hourlyjournal.pdf, page 2):
// the title's text spans x=20.4-128.1pt, entirely inside the sidebar
// column's own width, while the calendar grid's first column starts at
// x=176pt, well to the right and with a real gap in between. That's why
// this is its own module type (parallel to week-title) rather than
// folded into month-grid-core's header the way the day-of-week row is —
// they occupy genuinely disjoint column ranges, same precedent as
// week-title vs. hourly-grid-core.

export type MonthTitleConfig = {
  monthName: string; // e.g. "JANUARY" — display text, already formatted/uppercased by the caller
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

export function renderMonthTitle(
  geometry: { x: number; y: number; width: number; height: number },
  config: MonthTitleConfig,
  idPrefix: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  let idCounter = 0;
  const nextId = () => `${idPrefix}-${idCounter++}`;

  // Measured from the reference: 19pt, letter-spaced ("J A N U A R Y"
  // spans a full 107.7pt for a 7-letter word — a deliberately wide
  // tracking, not just the font's natural width). The reference's font
  // (MinionPro-Regular) isn't the one this app renders with (PT Serif,
  // same substitution every other renderer here already makes), so the
  // exact spacing that produced 107.7pt in the original doesn't carry
  // over precisely — this uses a reasonable approximation of the same
  // wide-tracked look rather than chasing an exact-but-meaningless
  // number against a different font's metrics.
  const fontSize = ptToPx(19);
  const textHeight = fontSize * 1.2;
  const letterSpacing = ptToPx(4);

  elements.push({
    id: nextId(),
    type: "text",
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: textHeight,
    text: config.monthName,
    fontSize,
    fontFamily: FONT_FAMILY,
    letterSpacing,
    align: "left",
  });

  return elements;
}
