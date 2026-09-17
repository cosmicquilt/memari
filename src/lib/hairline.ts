// The one description of what happens to a rule too thin for the screen.
//
// A rule in this app is a FILLED RECT - a figure with `height:
// ruledLineWidth` - not a stroke. 1.25 print px is 0.3pt on paper, which is
// correct there. On screen at a sixth of size it is a fifth of a device
// pixel, and below one device pixel a rasteriser cannot draw a line; it can
// only tint pixels. How much of which pixel it tints depends on where the
// rule's edges land on the grid, so identical rules on a regular pitch each
// arrive at a different sub-pixel phase and come out different - some
// crisp, some split across two rows so faintly that sRGB's gamma curve
// washes them out entirely. Reported twice, from two different surfaces:
// "horizontal lines start disapearing sooner at around <37%" on the editor
// canvas, and "the lines look like they are varying in size/disappearing as
// i resize" on the timeline previews.
//
// THE FLOOR BELONGS ON THE INK, NOT ON THE WIDTH - or rather, on both, in
// opposite directions. Forcing a hairline to a whole pixel and leaving it at
// full strength makes it heavy, which is the complaint that a width clamp
// was invented to fix, and the clamp is what let lines start vanishing
// again. PostScript and PDF reserve width 0 to mean "the thinnest the device
// can draw"; Figma pins a hairline to one physical pixel however far you
// zoom out. Both drop the OPACITY in proportion, and that is what keeps it
// reading as a hairline: a rule at 4x its weight and a quarter of the ink is
// the same amount of ink, spread thin enough for the screen to show it.
//
// Extracted from PolotnoJsonRenderer, which owned the only copy while the
// editor canvas was the only surface that needed it. The timeline previews
// need the identical rule now, and TWO DESCRIPTIONS OF ONE GEOMETRY is the
// defect class this project keeps meeting - a preview whose hairlines fade
// at a different zoom from the canvas's is a preview that disagrees with the
// page it is a preview of.

/** The floor, in OUTPUT units - whatever unit `scale` converts print px
 *  into. The editor's SVG can only address CSS px, so it passes a CSS-px
 *  scale and the floor is one CSS px. A canvas owns its backing store, so it
 *  passes a device-px scale and the floor is one DEVICE px - genuinely the
 *  finest mark the display can make, and on a 2x screen half as heavy as the
 *  editor has to draw it. */
export const MIN_ONSCREEN_RECT_PX = 1.0;

/** How faint the widened rule may get. Coverage below about a third washes
 *  out against white through the sRGB gamma curve, which is the very
 *  disappearance this exists to stop. */
export const MIN_ONSCREEN_INK = 0.35;

/** A rect this much thinner than it is long (either axis) is a rule, not a
 *  small filled shape - comfortably below any checkbox or date box in this
 *  app's modules, all of which are closer to square. */
export const HAIRLINE_ASPECT_RATIO = 0.15;

export type HairlineBox = { x: number; y: number; width: number; height: number };
export type WidenedHairline = HairlineBox & {
  /** The fraction of its own ink the rule keeps after being widened. 1 for
   *  anything left alone. Multiply the mark's own opacity by this. */
  ink: number;
};

/**
 * Widen a fill-only rule to the thinnest mark the output can draw, and take
 * the ink back out of it.
 *
 * CALL THIS ONLY FOR A FILL-ONLY MARK. A stroked box is already a stroke and
 * the rasteriser's own hairline handling applies to it; running this over one
 * would widen a border that was never at risk.
 *
 * @param box   the mark, in print px.
 * @param scale output units per print px - CSS px for the editor's SVG,
 *              device px for a canvas. Zero or less leaves the box alone.
 */
export function widenHairline(box: HairlineBox, scale: number): WidenedHairline {
  const { x, y, width, height } = box;
  if (!(scale > 0)) return { x, y, width, height, ink: 1 };

  const needed = MIN_ONSCREEN_RECT_PX / scale;

  // Grown outward from the rule's own CENTRE, so widening it does not move
  // it. A rule that shifts half a pixel as it thickens is off the lattice,
  // and the lattice is the thing the pitch rule exists to protect.
  if (height > 0 && height < width * HAIRLINE_ASPECT_RATIO && needed > height) {
    return {
      x,
      y: y - (needed - height) / 2,
      width,
      height: needed,
      ink: Math.max(MIN_ONSCREEN_INK, height / needed),
    };
  }
  if (width > 0 && width < height * HAIRLINE_ASPECT_RATIO && needed > width) {
    return {
      x: x - (needed - width) / 2,
      y,
      width: needed,
      height,
      ink: Math.max(MIN_ONSCREEN_INK, width / needed),
    };
  }
  return { x, y, width, height, ink: 1 };
}
