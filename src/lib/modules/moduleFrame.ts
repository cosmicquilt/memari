// The parts every boxed module draws the same way: its border, its
// heading, and where its content starts.
//
// Written because seven modules arrived at once and each had its own copy
// of "a 12pt centred heading in a 63px band", which is how a house style
// stops being one. Everything here was read off the modules that already
// existed rather than invented - see HEADING_SIZES_PT and CONTENT_TOP.

import { ptToPx } from "@/lib/print-spec";

export type FrameGeometry = { x: number; y: number; width: number; height: number };
export type FrameLattice = {
  pitchPx: number;
  originX: number;
  originY: number;
  insetPx: number;
};

export type FrameElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
};

export const NEAR_BLACK = "#231F20";
export const BORDER_WIDTH_PT = 0.5;
export const RULE_WIDTH_PT = 0.35;

/**
 * The heading sizes, largest first - labeled-box's own ladder.
 *
 * labeled-box is the module there are most of on a page (Notes,
 * Priorities, Reminders, Tentative Dates), so its heading IS the house
 * style: UPPERCASE, centred, 8pt dropping to 7pt rather than wrapping.
 * The new modules were written at 12pt in sentence case, which reads as a
 * different family of thing sitting on the same page. Reported as "the
 * title text looks a bit large" and "the module headers are not all caps
 * like the current modules".
 *
 * to-do and habit-tracker do use 12pt, and they are the exception rather
 * than the rule: their headings are fixed short strings ("TO - DO"), not
 * user-set names that have to survive being long.
 */
export const HEADING_SIZES_PT = [8, 7, 6];

/**
 * WHERE A MODULE'S CONTENT STARTS: the first lattice line below its top
 * edge.
 *
 * This is the one real trade-off in the frame, so it is worth stating in
 * full.
 *
 * A module's box is inset 6px inside its allocation on every side, for
 * visual separation from its neighbours. A header of one cell less BOTH
 * insets (63px) therefore leaves exactly (rowSpan - 1) whole cells below
 * it, and rows of one cell tile that perfectly: uniform rows, and the last
 * row's rule lands exactly on the bottom border. That is what every module
 * did, and it is why the row-pitch fight ended where it did.
 *
 * What it costs is that the content starts 6px ABOVE a lattice line, so
 * every rule in the module sits 6px off the dots - all the way down the
 * page, in every module at once. Reported as "the lines dont align with
 * the dots... in log and reflection, and eisenhower and spending, actually
 * most of them", and measured at exactly -6.0px for every full-width rule
 * in every module including the to-do.
 *
 * A rule 6px off a dot reads as a failed attempt to hit it. So the content
 * starts on the lattice line instead, which makes the header band one cell
 * less the TOP inset only (69px) and puts every row rule exactly on a dot.
 *
 * The 6px has to go somewhere, and it goes to the LAST band, which comes
 * out 69px against the 75px of the rows above it. That is a real cost and
 * the same species as the defect this project has fought twice - but 8%
 * short on one band is not the 50% the old remainder produced, and it buys
 * dot alignment on every rule in the module. modulePitch.test.mts knows
 * about this band by name and still rejects anything else.
 *
 * To re-take the trade, change the LATTICE BRANCH of contentTopPx below to
 * `geometry.y + ptToPx(15.12)` - 63px, one cell less the inset at both
 * ends. Every real caller supplies a lattice, so that branch is the one
 * that runs and HEADER_HEIGHT_PT is only the fallback beside it.
 *
 * Two wrong versions of this note preceded it, both worth keeping as a
 * warning. First a LATTICE_ALIGNED_CONTENT flag advertised as the switch,
 * whose "off" branch fell back to HEADER_HEIGHT_PT - which is now 16.56,
 * so both branches produced the same 69px and the switch could not switch.
 * Then HEADER_HEIGHT_PT itself, which only moves the fallback. Both were
 * caught the same way: by making the change and watching
 * moduleHouseStyle.test.mts pass anyway.
 */

/**
 * The header band: 69 print px, one cell less the box's TOP inset.
 *
 * 16.56pt is exactly 69px the way 15.12pt was exactly 63px - and 63 was
 * one cell less the inset at BOTH ends, which is the version that put
 * every rule 6px off the dots. Stated once here so a module's minimum
 * height and its drawing cannot disagree about how tall its header is,
 * which is this codebase's favourite bug.
 */
export const HEADER_HEIGHT_PT = 16.56;

/**
 * The y at which a module's content begins, and the header band's height
 * is the difference between this and the box top.
 *
 * Falls back to the fixed band when no lattice is supplied - the report
 * harnesses and any caller that does not have one.
 */
export function contentTopPx(geometry: FrameGeometry, lattice?: FrameLattice): number {
  // The fallback is the SAME 69px, not a different rule - a module drawn
  // without a lattice must not land somewhere else. See HEADER_HEIGHT_PT.
  if (!lattice) return geometry.y + ptToPx(HEADER_HEIGHT_PT);
  // geometry.y - insetPx is the allocation's own top edge, which is a
  // lattice line by construction; one pitch down is the next one.
  return geometry.y - lattice.insetPx + lattice.pitchPx;
}

/**
 * Like contentTopPx, but for a header band that needs a stated minimum -
 * a two-line heading, say. Snaps UP to the next lattice line rather than
 * taking the first one, so the band is always deep enough AND its rule
 * still lands on a dot.
 *
 * labeled-box is the case: its heading drops to 7pt and wraps rather than
 * being cut, and a wrapped one needs about 103px where a single line needs
 * 57. One cell (69px) holds the first, two cells (144px) the second, and
 * both put the divider on the lattice.
 */
export function contentTopAtLeastPx(
  geometry: FrameGeometry,
  minBandPx: number,
  lattice?: FrameLattice
): number {
  const pitch = lattice?.pitchPx ?? ptToPx(18);
  const inset = lattice?.insetPx ?? pitch - ptToPx(HEADER_HEIGHT_PT);
  const origin = geometry.y - inset;
  const cells = Math.max(1, Math.ceil((minBandPx + inset) / pitch));
  return origin + cells * pitch;
}

/** A module's row height: one lattice cell. */
export function rowHeightPx(lattice?: FrameLattice): number {
  return lattice?.pitchPx ?? ptToPx(18);
}

/** The box's own border - identical in all of them. */
export function borderElement(geometry: FrameGeometry, id: (n: string) => string): FrameElement {
  return {
    id: id("border"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    fill: "transparent",
    stroke: NEAR_BLACK,
    strokeWidth: ptToPx(BORDER_WIDTH_PT),
  };
}

/**
 * The heading, set the way labeled-box sets one, plus the rule under it.
 *
 * Vertically centred by hand rather than with verticalAlign, which has not
 * reliably centred text anywhere in this codebase - todoChecklist and
 * labeledBox both say so in their own comments.
 */
export function headerElements(
  geometry: FrameGeometry,
  heading: string,
  id: (n: string) => string,
  fontFamily: string,
  contentTop: number,
  options: { rule?: boolean } = {}
): FrameElement[] {
  const elements: FrameElement[] = [];
  const bandHeight = contentTop - geometry.y;
  const text = (heading ?? "").toUpperCase();

  if (text) {
    // Shrink rather than overrun. Nothing clips a text node, so a long
    // heading in a narrow box prints straight over the module beside it -
    // reported as "text gets cut of in headers such as log".
    const padding = ptToPx(8);
    const available = geometry.width - padding * 2;
    const sizes = HEADING_SIZES_PT.map(ptToPx);
    const fontSize =
      sizes.find((size) => text.length * size * 0.55 <= available) ?? sizes[sizes.length - 1];
    elements.push({
      id: id("heading"),
      type: "text",
      x: geometry.x + padding,
      y: geometry.y + (bandHeight - fontSize * 1.2) / 2,
      width: available,
      height: fontSize * 1.2,
      text,
      fontSize,
      fontFamily,
      fill: NEAR_BLACK,
      align: "center",
      // NO letterSpacing, deliberately, however much a short uppercase
      // heading wants it. monthTitle.ts measured the reference at a wide
      // tracking, tried to reproduce it, and had to take it back out: with
      // letterSpacing set, the legacy Polotno route's width-constrained
      // text box badly under-measures its own available width and wraps to
      // about one character per line - the "displays vertically" bug. The
      // native renderer handles it fine; these elements go to both.
    });
  }

  if (options.rule !== false) {
    const ruleWidth = ptToPx(RULE_WIDTH_PT);
    elements.push({
      id: id("header-rule"),
      type: "figure",
      subType: "rect",
      x: geometry.x,
      y: contentTop - ruleWidth / 2,
      width: geometry.width,
      height: ruleWidth,
      fill: NEAR_BLACK,
      stroke: "none",
    });
  }

  return elements;
}
