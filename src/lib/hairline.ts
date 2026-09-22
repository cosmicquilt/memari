// The one description of what happens to a rule too thin for the screen.
//
// A rule in this app is a FILLED RECT - a figure with `height:
// ruledLineWidth` - not a stroke. 1.25 print px is 0.3pt on paper, which is
// correct there. On screen at a sixth of size it is a fifth of a device
// pixel, and below one device pixel a rasteriser cannot draw a line; it can
// only tint pixels. How much of which pixel it tints depends on where the
// rule's edges land on the grid, so identical rules on a regular pitch each
// arrive at a different sub-pixel PHASE and come out different - some crisp,
// some split across two rows so faintly that sRGB's gamma curve washes them
// out entirely.
//
// PHASE IS THE WHOLE DEFECT, and until 2026-09-22 this file treated it as a
// brightness problem. It widened a thin rule to one device pixel and took
// the ink back out in proportion, on the PostScript/Figma precedent of
// pinning a hairline to one physical pixel. That is the right instinct for a
// UI, and it was measured here and found to do the opposite of its job.
//
// MEASURED, 19 real hairlines from todo-checklist at 75 print px pitch,
// rasterised through Canvas 2D (the previews' own path) and read back pixel
// by pixel. Peak darkness of a rule, how many pixel rows it lit, and the
// coefficient of variation of peak across the 19 - that last number IS the
// complaint, because a set of rules that vary is a set where some look
// skinny and some look thick:
//
//   dpr 1, 37% zoom     peak    rows lit    CV across rules
//     widened           0.341     1.74          0.218
//     left alone        0.404     1.26          0.226
//     SNAPPED           0.463     1.00          0.000
//
// Widening came out FAINTER than doing nothing (0.341 against 0.404), TWICE
// as wide (1.74 rows against 1.26), and no more even (0.218 against 0.226).
// It failed at the one thing it was for at every zoom and every pixel ratio
// tested. Reported exactly as it measures: "some lines when at further zooms
// look blurry because they are wider versions that are grey while other
// lines show at skinny detailed lines" - the blurry grey ones are the rules
// this file widened, and the skinny detailed ones are the stroked outlines
// it correctly left alone.
//
// SNAPPING instead: put the rule on a whole device pixel and give it the ink
// it really has. One row lit, every rule identical, and darker than either of
// the others because none of its ink is spilled into a neighbour.
//
// Snapping to FULL ink was measured too and rejected: uniform, but a rule at
// 20% zoom came out solid black where the true rule is a quarter of a pixel
// of coverage, so a page zoomed out reads far heavier than the paper it is a
// preview of. Proportional ink keeps the page looking like the page.
//
// The ink FLOOR survives all of this - see MIN_ONSCREEN_INK, and note that
// deleting it was the first thing this rewrite did and was wrong. It is the
// widening that blurred, not the floor.
//
// What the widening floor was originally invented for is worth recording,
// because it is fixed and it is not this: each rule used to be its own
// absolutely-positioned <div> inside a `transform: scale()`, so the
// rasteriser rounded every element's device rect INDEPENDENTLY and a 0.4px
// rule landed on 0, 1 or 2 device pixels by luck. Drawing the whole module
// as ONE <svg> retired that - see PolotnoJsonRenderer's own comment. The
// floor outlived the bug it was written for.

/**
 * The finest mark a display can make, and the unit a rule is snapped to.
 *
 * `scale` is therefore DEVICE pixels per print pixel, from every caller: the
 * editor's zoom times devicePixelRatio, a canvas's backing store over the
 * page. This comment once said the editor's SVG "can only address CSS px" -
 * which was wrong, and licensed a 3x display flooring every rule at three
 * device pixels of grey.
 */
export const MIN_ONSCREEN_RECT_PX = 1.0;

/**
 * How faint a snapped rule may get before it is held up.
 *
 * KEPT, AND NEARLY LOST. Snapping alone carries a rule's true ink, and at
 * editor zooms that is right - at 37% a 1.25px rule is 46% of a pixel, which
 * is a line you can see. A TIMELINE CARD IS NOT AN EDITOR ZOOM: at rest it
 * draws a 2175px page into 72 CSS px, a scale of 0.033, where the same rule
 * is 4% of a pixel. True ink there is an invisible rule, and "0 of 54 rules
 * resolvable at a resting card" is the exact defect the canvas preview work
 * was done to fix.
 *
 * So the floor stays, on the INK only. It was the WIDENING that produced the
 * blurry grey lines - a rule spread across two pixel rows at reduced
 * strength - and widening is what snapping replaced. A floor on the ink of a
 * rule that occupies exactly one whole pixel cannot blur anything; it can
 * only make that one pixel darker than scale strictly warrants, which is
 * what a thumbnail needs and what every map that draws a road wider than its
 * true width is doing.
 *
 * Below about a third, coverage washes out against white through the sRGB
 * gamma curve, which is where the number comes from.
 */
export const MIN_ONSCREEN_INK = 0.35;

/** A rect this much thinner than it is long (either axis) is a rule, not a
 *  small filled shape - comfortably below any checkbox or date box in this
 *  app's modules, all of which are closer to square. */
export const HAIRLINE_ASPECT_RATIO = 0.15;

export type HairlineBox = { x: number; y: number; width: number; height: number };
export type SnappedHairline = HairlineBox & {
  /** The fraction of its own ink the rule keeps. 1 for anything left alone.
   *  Multiply the mark's own opacity by this. */
  ink: number;
};

/**
 * Put a fill-only rule on the device pixel grid, carrying its true ink.
 *
 * CALL THIS ONLY FOR A FILL-ONLY MARK. A stroked box is already a stroke and
 * the rasteriser's own hairline handling applies to it; snapping one would
 * move a border that was never at risk.
 *
 * The box is in PAGE SPACE, and the caller subtracts its own origin
 * afterwards.
 *
 * WHAT THIS ACTUALLY BUYS, measured on the running editor at 1x rather than
 * argued: 869 rules across 81 modules on a weekly spread, every one exactly
 * 1.000 device pixel thick, and WITHIN a module the phase spread is 0.0001
 * on average and 0.0005 at worst - 69 of the 81 modules perfectly uniform,
 * the rest float noise. That is the reported defect gone: "the lines under
 * each time slot", "todo interior" are rules inside ONE module, and they now
 * agree with each other.
 *
 * WHAT IT DOES NOT BUY, same measurement: 56 distinct phases ACROSS the 81
 * modules. Each module's <svg> is placed by CSS Grid, which lands it at its
 * own fractional device offset, and no arithmetic in here can see that. An
 * earlier draft of this comment claimed page space made "every rule in every
 * module land on the same grid" - the measurement says otherwise, and page
 * space and module space in fact come out identical because the container's
 * offset swamps both. Page space is kept because it is the frame the marks
 * are already in, not because it wins anything.
 *
 * So a module whose container sits near a whole device pixel draws crisper
 * rules than one sitting near a half. Uniform within each box, varying
 * between boxes - much milder than the per-rule unevenness this replaced,
 * and NOT yet fixed. Fixing it means cancelling each module's own fractional
 * offset, which needs a layout read per module, so it is a separate change
 * with its own measurement.
 *
 * A caller that owns its output surface has no such problem and should round
 * its own offset away - drawPreview does.
 *
 * @param box   the mark, in page-space print px.
 * @param scale DEVICE px per print px. Zero or less leaves the box alone.
 */
export function snapHairline(box: HairlineBox, scale: number): SnappedHairline {
  const { x, y, width, height } = box;
  if (!(scale > 0)) return { x, y, width, height, ink: 1 };

  const horizontal = height > 0 && height < width * HAIRLINE_ASPECT_RATIO;
  const vertical = width > 0 && width < height * HAIRLINE_ASPECT_RATIO;
  if (!horizontal && !vertical) return { x, y, width, height, ink: 1 };

  // The thin axis: how thick the rule really is on this screen, and the whole
  // number of device pixels nearest to it - never below one, because a rule
  // that rounds to nothing is a rule that vanished.
  const thickness = horizontal ? height : width;
  const trueDevice = thickness * scale;
  const wholeDevice = Math.max(MIN_ONSCREEN_RECT_PX, Math.round(trueDevice));
  // Total ink preserved: a quarter-pixel rule drawn across a whole pixel is
  // that pixel at a quarter strength. Held up at MIN_ONSCREEN_INK, without
  // which a timeline card's rules come out at 4% and vanish. Capped at solid
  // because a rule ROUNDED DOWN (1.9 device px to 2 is up, but 2.4 to 2 is
  // down) would otherwise ask for more ink than a pixel has.
  const ink = Math.min(1, Math.max(MIN_ONSCREEN_INK, trueDevice / wholeDevice));

  const near = horizontal ? y : x;
  const snappedNear = Math.round(near * scale) / scale;
  const snappedThickness = wholeDevice / scale;

  return horizontal
    ? { x, y: snappedNear, width, height: snappedThickness, ink }
    : { x: snappedNear, y, width: snappedThickness, height, ink };
}
