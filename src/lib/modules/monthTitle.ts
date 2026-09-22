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
  /** e.g. "JANUARY" - display text, already formatted/uppercased by the
   *  caller. EMPTY on an undated planner: see weekTitle.ts on why undated
   *  is the absence of the value rather than a flag threaded down here. */
  monthName: string;
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
import { estimateTextWidthPx, truncateToWidth } from "@/lib/modules/textFit";
import {
  NEAR_BLACK,
  RULE_WIDTH_PT,
  nearestLatticeYPx,
  type FrameLattice,
} from "@/lib/modules/moduleFrame";

/** The title's size when the name fits, measured from the reference PDF. */
const TITLE_PT = 19;
/** How small it may get before the name is cut instead. */
const TITLE_MIN_PT = 11;

export function renderMonthTitle(
  geometry: { x: number; y: number; width: number; height: number },
  config: MonthTitleConfig,
  idPrefix: string,
  fontFamily: string,
  lattice?: FrameLattice
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic, not positional — see todoChecklist.ts. An id names one mark
  // for the life of the module, so a change in element count does not
  // renumber every mark after it.
  const id = (name: string) => `${idPrefix}-${name}`;
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
  // The size when the name fits. The dated branch scales DOWN from here when
  // it does not; the undated branch uses it to place its rule, which must not
  // move with a month name that is not there.
  const fontSize = ptToPx(TITLE_PT);

  // Undated: the month name gives way to a rule, exactly as week-title's
  // date range does. See that file for why a rule and not underscores.
  //
  // `?? ""`, not `config.monthName.trim()`: a renderer must be TOTAL in its
  // config - see the registry's integrity check, which is what caught this.
  // An undated planner reaches here with the key absent, not merely empty.
  const dated = (config.monthName ?? "").trim().length > 0;

  if (dated) {
    // SCALED TO THE COLUMN, and centred over it.
    //
    // Asked for 2026-09-22: "the month should scale so that it doesn't over
    // lap into the adjacent column, (which happens with november)". Measured
    // against the shipped sidebar - 438 print px at a 24-column 7x10 page -
    // FOUR of the twelve names ran past it at a flat 19pt:
    //
    //   FEBRUARY  462.3 px   24.3 over   (6%)
    //   SEPTEMBER 520.1 px   82.1 over  (19%)
    //   NOVEMBER  462.3 px   24.3 over   (6%)
    //   DECEMBER  462.3 px   24.3 over   (6%)
    //
    // September is the worst and was not the one reported; November is
    // simply the month it was noticed in.
    //
    // PER MONTH, NOT ONE SIZE FOR ALL TWELVE. Fitting every month to
    // SEPTEMBER's requirement would put the whole book at about 15pt,
    // shrinking the eight that were already fine. This keeps each title as
    // large as its own name allows - so eight months are untouched at 19pt,
    // three drop about a point, and only September moves visibly. The trade
    // is that title size is no longer identical month to month; if that
    // reads as sloppy when flipping through, the other choice is one size
    // for the set and it belongs here rather than at the call site.
    const estimated = estimateTextWidthPx(config.monthName, fontSize);
    const scaled = estimated > geometry.width ? fontSize * (geometry.width / estimated) : fontSize;
    // A floor, so narrowing the module cannot shrink the month to nothing.
    // Below it the name is cut rather than scaled - at the shipped width
    // this never binds, since September needs 15.4pt.
    const titleFontSize = Math.max(ptToPx(TITLE_MIN_PT), scaled);
    const text =
      titleFontSize > scaled ? truncateToWidth(config.monthName, geometry.width, titleFontSize) : config.monthName;
    elements.push({
      id: id("title"),
      type: "text",
      x: geometry.x,
      y: geometry.y,
      // CENTRED over the sidebar, not ranged left against its edge - asked
      // for in the same breath ("dont seem to be centered in the ... side
      // bar"). This is a deliberate departure from the reference PDF, whose
      // title starts flush at the column's left edge; see the note at the
      // top of this file on what was measured there.
      width: geometry.width,
      height: titleFontSize * 1.2,
      text,
      fontSize: titleFontSize,
      fontFamily: FONT_FAMILY,
      align: "center",
    });
    return elements;
  }

  const ruleWidth = ptToPx(RULE_WIDTH_PT);
  // On the lattice, not on the month name's own baseline - see weekTitle.
  const ruleY = nearestLatticeYPx(geometry, geometry.y + fontSize, lattice);
  elements.push({
    id: id("title-rule"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: ruleY - ruleWidth / 2,
    width: geometry.width,
    height: ruleWidth,
    fill: NEAR_BLACK,
  });

  return elements;
}
