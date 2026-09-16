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
import { glyphElement, type GlyphShape } from "@/lib/modules/glyphs";
import { fitLabel } from "@/lib/modules/textFit";
import {
  NEAR_BLACK,
  borderElement,
  rowHeightPx,
  type FrameLattice,
} from "@/lib/modules/moduleFrame";

export type IconStripConfig = {
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
/** Air above the heading, between heading and glyphs, and below. */
const AIR_PX = 3;
/** A glyph never fills its whole share of the width, or the row reads as a
 *  solid bar. */
const GLYPH_WIDTH_SHARE = 0.84;
/** Each group keeps a little of its own width clear so a week reads as
 *  seven clusters rather than one long run. */
const GROUP_PAD_SHARE = 0.06;
const GROUP_PAD_MAX_PX = 8;

/** One strip, which is the module's minimum: a heading and a row of
 *  glyphs, one lattice cell tall. */
export function getIconStripMinHeightPx(): number {
  return rowHeightPx();
}

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
  const glyphBandTop = AIR_PX + (heading ? headingHeight + AIR_PX : 0);
  const glyphBandHeight = pitch - glyphBandTop - AIR_PX;

  const groupWidth = geometry.width / groups;
  const groupPad = Math.min(GROUP_PAD_MAX_PX, groupWidth * GROUP_PAD_SHARE);
  const glyphPitch = (groupWidth - groupPad * 2) / count;
  const glyphSize = Math.max(
    1,
    Math.min(glyphBandHeight, glyphPitch * GLYPH_WIDTH_SHARE)
  );

  // One size for the heading, fixed at the smallest legible - so the only
  // thing left when it will not fit is to cut it. See textFit.ts.
  const label = heading
    ? fitLabel(heading.toUpperCase(), geometry.width - ptToPx(4) * 2, [
        ptToPx(HEADING_FONT_PT),
      ])
    : null;

  for (let s = 0; s < stripCount; s++) {
    const stripTop = allocationTop + s * pitch;

    if (label && label.text) {
      elements.push({
        id: id(`s${s}-heading`),
        type: "text",
        x: geometry.x + ptToPx(4),
        y: stripTop + AIR_PX,
        width: geometry.width - ptToPx(4) * 2,
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

    const glyphTop = stripTop + glyphBandTop + (glyphBandHeight - glyphSize) / 2;
    for (let g = 0; g < groups; g++) {
      const groupLeft = geometry.x + g * groupWidth + groupPad;
      for (let i = 0; i < count; i++) {
        const centre = groupLeft + glyphPitch * (i + 0.5);
        elements.push(
          glyphElement({
            id: id(`s${s}-g${g}-i${i}`),
            x: centre - glyphSize / 2,
            y: glyphTop,
            sizePx: glyphSize,
            shape,
          })
        );
      }
    }
  }

  return elements;
}
