// A strip of repeated marks to fill in, one lattice cell tall.
//
// The thing a water tracker is: eight rings under a small label, repeated
// once per day across the week. Asked for from a reference where the rings
// sit directly under the week spine's day headers with no box of their
// own, and specified as "the text above the icons in a header at the
// smallest legible such that the total height is 1 cell".
//
// THE STRIP IS THE UNIT, and it is exactly one cell. That is the whole
// shape of this module: a heading band and a row of glyphs that together
// come to 75px, the same 1/4in cell every rule in this planner lands on.
// A module cannot BE one cell - MIN_ROW_SPAN is 2 - so the module stacks
// one strip per cell of its box instead, and the smallest placement is two
// strips. A four-cell box is four weeks.
//
// WHY NOT A RATING STRIP. They print the same rings and are different
// geometries: a rating strip is items x a numbered scale, with the label
// at the LEFT of each row, a scale head above, and one row per item. This
// is groups x count, with the label ABOVE, no scale, no label column and
// no frame. Folding both into one renderer means a layout flag that moves
// nearly every coordinate, which is the defect class this codebase has
// paid for twice. They share the glyph and nothing else - see glyphs.ts.
//
// WHAT THE ICON CAN BE. Circle, square, rounded square, droplet, heart,
// star, moon, flame, leaf - see glyphs.ts. This started as the first three
// on the reasoning that a droplet needs a path and the renderer emits only
// rectangles and text. That was true of the ELEMENT vocabulary and not of
// the renderer, which is already an SVG: a <path> cost one branch in it and
// one in the proof sheet. The shape is carried as an extra field on a rect
// rather than a new subType, so a consumer that has not heard of it still
// draws the box.

import { ptToPx } from "@/lib/print-spec";
import { GLYPH_SHAPES, glyphElement, glyphSizeToFit, type GlyphShape } from "@/lib/modules/glyphs";
import { estimateTextWidthPx, fitLabel, textInkBand } from "@/lib/modules/textFit";
import { weekdayInitials, weekdayShortNames } from "@/lib/weekDays";
import {
  NEAR_BLACK,
  borderElement,
  rowHeightPx,
  type FrameLattice,
} from "@/lib/modules/moduleFrame";

export type IconStripConfig = {
  /** The icons drawn with a little face - see glyphElement. */
  faces?: boolean;
  /** Printed above the glyphs. Empty for none. */
  heading?: string;
  /** The repeated mark. Only what the renderer can draw - see glyphs.ts. */
  icon?: GlyphShape;
  /** How many glyphs in each group. */
  count?: number;
  /**
   * How many groups across the width, or unset to take ONE PER COLUMN.
   *
   * Derived by default, the way todoChecklist derives its day columns from
   * its width, and for the same reason: a fixed count is a second
   * description of the geometry and goes wrong the moment the box is
   * resized. Seven groups was the old default, and on a page whose day
   * columns come three or four to a side it put seven clusters where there
   * were four days - and squeezed into one sidebar column it drew seven
   * groups of eight marks six pixels across.
   *
   * One group per sidebar column means the clusters line up with the day
   * columns above them, at every width, without anyone setting a number.
   * Set it explicitly only to override that.
   */
  groups?: number;
  /** A box around the whole module. Off by default - the reference has the
   *  glyphs sitting on the page, not in a frame. */
  border?: boolean;
  /**
   * A label for each strip, top down - water, tea, vitamins; one plant per
   * row. A strip with no label of its own takes the heading, which is what
   * every strip printed before. Module-edits list, 2026-09-30.
   */
  stripLabels?: string[];
  /** Day names over the groups of the first strip, in the journal's week
   *  order - the groups line up with the day columns already. */
  groupLabels?: "none" | "days";
  /** Set at render time from the journal - see the registry's weekStart. */
  weekStartDay?: number;
  /**
   * THE DAY UNDER EACH GROUP, left to right - 0 Sunday to 6 Saturday, or
   * null for a group under no day. Set at render time from where the strip
   * sits against the page's day columns. Without it the groups are named in
   * week order from the first, which is right only for a strip that starts
   * under the week's first day: a Water strip under Wednesday to Saturday
   * printed SUN to WED. And widened past the hours (horizontal resizing,
   * 2026-10-01) a strip gains a group under no day - "fourth column" - which
   * is left unnamed.
   */
  groupDays?: Array<number | null>;
  /**
   * The icon of each row, top down, and of each day (group), left to right -
   * picked from previews in the editor (2026-09-30). A day's own icon wins in
   * its column, since it is the more particular choice (a rest day, say);
   * then the row's; then `icon`. Blank entries fall through.
   */
  stripIcons?: string[];
  groupIcons?: string[];
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

/**
 * The heading size: the smallest legible, and fixed there.
 *
 * Asked for in those words, and it is what makes the one-cell budget work.
 * A cell is 75px; a 5pt line box is 25px of it, which leaves 41px for the
 * glyphs after the air above and below - about 0.14in, a mark you can
 * comfortably ring. At 7pt the heading would take 35px and the glyphs
 * would be down to 31px, which starts to read as a row of dots.
 *
 * 5pt is 0.069in cap height in print - small, and legible in a serif at
 * 300dpi. Below this is a decision about printing, not about drawing; see
 * RULE_WIDTH_PT, which has the same kind of floor for the same reason.
 */
/** A sidebar column, in lattice cells - the unit a group is one of. */
const COLUMN_CELLS = 6;
const HEADING_FONT_PT = 5;
/** Air above the heading's capitals and below the glyphs. */
const AIR_PX = 3;
/** Between the heading's capitals and the top of the glyphs. */
const LABEL_GAP_PX = 4;
/** A glyph never fills its whole share of the width, or the row reads as a
 *  solid bar. */
const GLYPH_WIDTH_SHARE = 0.84;
/** Each group keeps a little of its own width clear so a week reads as
 *  seven clusters rather than one long run. */
const GROUP_PAD_SHARE = 0.06;
const GROUP_PAD_MAX_PX = 8;

/** One strip, which is the module's minimum: a heading and a row of
 *  glyphs, one lattice cell tall - so ONE ROW, whatever that row's drawn
 *  height (its cell less the inset). Stated in rows rather than as the
 *  cell's 75px: the floor rule measures a height against a row's DRAWN box,
 *  which is inset inside the cell, so 75px came out as two rows and the
 *  strip could never be one row tall. */
export const ICON_STRIP_MIN_ROWS = 1;

export function renderIconStrip(
  geometry: { x: number; y: number; width: number; height: number },
  config: IconStripConfig,
  idPrefix: string,
  fontFamily: string,
  lattice?: FrameLattice
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic, not positional - see todoChecklist.ts. An id names one mark
  // for the life of the module, so adding a strip does not renumber every
  // mark after it.
  const id = (name: string) => `${idPrefix}-${name}`;

  // Every renderer here is total in its config: a ModuleInstance whose
  // propValues lost a key draws a plain empty strip rather than throwing,
  // because a throw inside a render takes the whole PAGE down.
  const heading = config.heading ?? "";
  const shape: GlyphShape = config.icon ?? "circle";
  const count = Math.max(1, Math.round(config.count ?? 8));

  if (config.border) elements.push(borderElement(geometry, id));

  const pitch = rowHeightPx(lattice);
  const inset = lattice?.insetPx ?? 0;
  // Set, or one per sidebar column - see IconStripConfig.groups.
  const groups =
    config.groups && config.groups > 0
      ? Math.max(1, Math.round(config.groups))
      : Math.max(1, Math.round((geometry.width + inset * 2) / (COLUMN_CELLS * pitch)));
  // Measured in the ALLOCATION frame, not the ink box.
  //
  // This is the one fault every lattice bug in this project has turned out
  // to be: the box is inset 6px inside its allocation, so a strip measured
  // from the box top starts 6px off the dots and stays off all the way
  // down. The allocation's own top edge IS a lattice line by construction,
  // so strips measured from it land on the dots - and a strip is exactly
  // one cell, so every strip after the first does too.
  const allocationTop = geometry.y - inset;
  const allocationHeight = geometry.height + inset * 2;
  const stripCount = Math.max(1, Math.round(allocationHeight / pitch));

  const headingHeight = ptToPx(HEADING_FONT_PT) * 1.2;
  // THE GLYPHS START UNDER THE LABEL'S CAPITALS, not under its line box.
  // A 5pt line box is 25px of the 75px cell and the capitals are about 14 of
  // it: the rest was empty air above the icons - "the icons could take up
  // more space above them" (2026-10-06). So the label is set with its
  // capitals at the top of the cell, and the glyph band begins a few pixels
  // under them: 52px of a 75px cell where it was 41.
  const capBand = textInkBand(0, ptToPx(HEADING_FONT_PT), fontFamily, "A");
  const labelY = AIR_PX - capBand.top;
  const glyphBandTop = heading || (config.stripLabels ?? []).some((label) => typeof label === "string" && label.trim())
    ? AIR_PX + (capBand.bottom - capBand.top) + LABEL_GAP_PX
    : AIR_PX;
  const glyphBandHeight = pitch - glyphBandTop - AIR_PX;

  const groupWidth = geometry.width / groups;
  const groupPad = Math.min(GROUP_PAD_MAX_PX, groupWidth * GROUP_PAD_SHARE);
  const glyphPitch = (groupWidth - groupPad * 2) / count;
  // Each glyph fitted by its DRAWING, not its square - see glyphSizeToFit: a
  // spoon is a third as wide as it is tall, and sized by its square it came
  // out a third of the height it had.
  const sizeOf = (glyph: GlyphShape) =>
    glyphSizeToFit(glyph, config.faces === true, glyphPitch * GLYPH_WIDTH_SHARE, glyphBandHeight);

  const stripLabels = (config.stripLabels ?? []).map((text) => (typeof text === "string" ? text.trim() : ""));
  const labelSizePx = ptToPx(HEADING_FONT_PT);
  const labelInsetPx = ptToPx(4);

  // Day names over the first strip's groups, in the journal's week order,
  // right-aligned at each group's end so the strip's own label keeps the
  // left - and so the first strip's label runs only as far as the first
  // day's name. THE DAY NAME GIVES WAY FIRST: short names ("SUN") where the
  // label fits whole beside them and they fit their groups, initials ("S")
  // where not. Asked 2026-09-30, after three days in a sidebar cut "WATER"
  // to "WA..." beside a SUN measured as wide as WED. Initials and still no
  // room is the one case left to cut, since the label is already at the
  // smallest legible size.
  const firstLabel = (stripLabels[0] || heading).toUpperCase();
  const groupRight = (g: number) => geometry.x + (g + 1) * groupWidth - groupPad;
  const roomBeside = (names: string[]) =>
    groupRight(0) - estimateTextWidthPx(names[0], labelSizePx) - labelInsetPx - (geometry.x + labelInsetPx);
  // Each group's name: from groupDays where the page says which day is
  // under it (null - no day - names nothing), else in week order.
  const dayOf = (g: number): number | null =>
    Array.isArray(config.groupDays) ? (Number.isInteger(config.groupDays[g]) ? (config.groupDays[g] as number) : null) : null;
  const dayNames = (() => {
    if (config.groupLabels !== "days") return null;
    const named = (names: string[]) =>
      Array.isArray(config.groupDays)
        ? Array.from({ length: groups }, (_, g) => (dayOf(g) === null ? "" : names[(dayOf(g)! - (config.weekStartDay ?? 0) + 14) % 7]))
        : Array.from({ length: groups }, (_, g) => names[g % 7]);
    const forms = [named(weekdayShortNames(config.weekStartDay)), named(weekdayInitials(config.weekStartDay))];
    const fits = (names: string[]) =>
      names.every((name) => estimateTextWidthPx(name, labelSizePx) <= groupWidth - groupPad * 2) &&
      // Whole AT the strip's own size - asked directly, not through fitLabel,
      // which now shrinks a label rather than cutting it (2026-10-05), so
      // "came back uncut" no longer means "fits".
      (!firstLabel || estimateTextWidthPx(firstLabel, labelSizePx) <= roomBeside(names) + 0.01);
    return forms.find(fits) ?? forms[forms.length - 1];
  })();
  const dayLabelWidth = (name: string) => estimateTextWidthPx(name, labelSizePx) + ptToPx(2);

  const glyphAt = (list: unknown, index: number): GlyphShape | null => {
    const value = Array.isArray(list) ? list[index] : undefined;
    return GLYPH_SHAPES.includes(value as GlyphShape) ? (value as GlyphShape) : null;
  };
  const iconFor = (s: number, g: number): GlyphShape => glyphAt(config.groupIcons, g) ?? glyphAt(config.stripIcons, s) ?? shape;
  for (let s = 0; s < stripCount; s++) {
    const stripTop = allocationTop + s * pitch;
    // One size for a label, fixed at the smallest legible - so the only
    // thing left when it will not fit is to cut it. See textFit.ts. Each
    // strip its own, or the heading.
    const labelText = stripLabels[s] || heading;
    const labelWidth = dayNames && s === 0 ? roomBeside(dayNames) : geometry.width - labelInsetPx * 2;
    const label = labelText ? fitLabel(labelText.toUpperCase(), labelWidth, [labelSizePx]) : null;

    if (label && label.text) {
      elements.push({
        id: id(`s${s}-heading`),
        type: "text",
        x: geometry.x + labelInsetPx,
        y: stripTop + labelY,
        width: labelWidth,
        height: headingHeight,
        text: label.text,
        fontSize: label.fontSizePx,
        fontFamily,
        fill: NEAR_BLACK,
        // LEFT, not centred, which is the one place this departs from the
        // house heading style and does it deliberately. A module heading is
        // centred because it sits in its own band over the whole module;
        // this one shares a single cell with seven groups of glyphs, and
        // centred put "WATER" in the middle of the strip, over Thursday,
        // reading as a label for that group rather than for the row. At
        // the left edge it reads as what it is - the row's name - which is
        // also how a ledger labels a line.
        //
        // NO letterSpacing, deliberately - see headerElements, where
        // setting it wrapped the legacy route's text to one character a
        // line.
        align: "left",
      });
    }

    if (dayNames && s === 0) {
      for (let g = 0; g < groups; g++) {
        const name = dayNames[g];
        if (!name) continue;
        elements.push({
          id: id(`g${g}-day`),
          type: "text",
          x: groupRight(g) - dayLabelWidth(name),
          y: stripTop + labelY,
          width: dayLabelWidth(name),
          height: headingHeight,
          text: name,
          fontSize: labelSizePx,
          fontFamily,
          fill: NEAR_BLACK,
          align: "right",
          opacity: 0.55,
        });
      }
    }

    for (let g = 0; g < groups; g++) {
      const groupLeft = geometry.x + g * groupWidth + groupPad;
      const glyph = iconFor(s, g);
      const glyphSize = sizeOf(glyph);
      // Centred in the band, each at its own size: one row may hold a day's
      // own icon beside the strip's.
      const glyphTop = stripTop + glyphBandTop + (glyphBandHeight - glyphSize) / 2;
      for (let i = 0; i < count; i++) {
        const centre = groupLeft + glyphPitch * (i + 0.5);
        elements.push(
          glyphElement({
            id: id(`s${s}-g${g}-i${i}`),
            x: centre - glyphSize / 2,
            y: glyphTop,
            sizePx: glyphSize,
            shape: glyph,
            faces: config.faces === true,
          })
        );
      }
    }
  }

  return elements;
}
