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

export function renderMonthTitle(
  geometry: { x: number; y: number; width: number; height: number },
  config: MonthTitleConfig,
  idPrefix: string,
  fontFamily: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  let idCounter = 0;
  const nextId = () => `${idPrefix}-${idCounter++}`;
  const FONT_FAMILY = fontFamily;

  // Measured from the reference: 19pt, letter-spaced ("J A N U A R Y"
  // spans a full 107.7pt for a 7-letter word — a deliberately wide
  // tracking, not just the font's natural width). Tried reproducing that
  // via Polotno's own `letterSpacing` text property (which does exist —
  // checked node_modules/polotno/model/text-model.js), but verified
  // empirically in the polotno-test sandbox that it badly breaks this
  // renderer's own width-constrained text box: with letterSpacing set,
  // Polotno's height/wrap calculation dramatically under-measures the
  // available width regardless of how wide the box actually is (an
  // 80px-wide box and a 506px-wide box produced almost the same
  // wildly-oversized wrapped height, ~1800-1900px for one short line),
  // wrapping the text to roughly one character per line — exactly the
  // "displays vertically" bug this produced in the real app. Removing
  // letterSpacing entirely (confirmed in the same sandbox test: a real
  // multi-word string at the real box width renders as a clean single
  // line, height exactly fontSize*1.2) fixes it outright. The reference's
  // exact tracking wasn't going to carry over precisely anyway — its
  // font (MinionPro-Regular) isn't the one this app renders with (PT
  // Serif, same substitution every other renderer here already makes) —
  // so this trades a cosmetic flourish for a renderer that actually
  // displays the month name horizontally, which matters more.
  const fontSize = ptToPx(19);
  const textHeight = fontSize * 1.2;

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
    align: "left",
  });

  return elements;
}
