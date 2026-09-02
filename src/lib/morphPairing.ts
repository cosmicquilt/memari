// Pairing one render's rectangles with another's, so a resize can MORPH
// as much of the drawing as possible and only fade the remainder.
//
// The animation rule this serves: the first frame of a resize must look
// like the module did before it, and the last frame like the module
// after. Requested directly, after four separate reports that were all
// one of those two endpoints being violated:
//
//   "the beginning of the resize animation [should] be the same as the
//   module looks prior, and the end of the animation to look like the
//   final positions, prioritizing overflow hidden sweeping when possible
//   and then if needed fading in lines... greatly prefer morphing, only
//   fade in elements and specific line[s] that it is impossible for them
//   to be morphed in but if there is a horizontal line at a similar
//   vertical height and can be morphed then morph."
//
// So this is deliberately generous: a pair is made whenever one can be
// justified, and fading is the fallback for what genuinely has no
// counterpart. A habit-tracker crossing into the sidebar goes from 33
// elements to 116 - most of its rules DO have a counterpart at a similar
// height and should travel there; only the extra rows the compact layout
// introduces have nothing to come from.

/** The subset of a rendered rect this pairing reasons about. */
export type PairableRect = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
};

export type RectRole = "hrule" | "vrule" | "box";

// A rect this much longer than it is thick reads as a rule, not a box.
// Same ratio the renderer already uses to decide what to apply its
// legibility floor to, so the two agree about what a hairline is.
const HAIRLINE_ASPECT_RATIO = 0.2;

/**
 * How far apart two rects may sit, as a fraction of the larger render's
 * size, and still be considered the same mark moving.
 */
const MAX_RELATIVE_DISTANCE = 0.25;

export function rectRole(rect: PairableRect): RectRole {
  const width = rect.width ?? 0;
  const height = rect.height ?? 0;
  if (height > 0 && width > 0 && height < width * HAIRLINE_ASPECT_RATIO) return "hrule";
  if (width > 0 && height > 0 && width < height * HAIRLINE_ASPECT_RATIO) return "vrule";
  return "box";
}

/** Whether two rects are made of the same kind of ink. A filled hairline
 *  and a stroked outline are different marks and morphing one into the
 *  other reads as a glitch, however close together they sit. */
function sameInk(a: PairableRect, b: PairableRect): boolean {
  const filled = (r: PairableRect) => !!r.fill && r.fill !== "transparent";
  const stroked = (r: PairableRect) => !!r.stroke && r.stroke !== "none" && (r.strokeWidth ?? 0) > 0;
  return filled(a) === filled(b) && stroked(a) === stroked(b);
}

/**
 * How far apart two marks are, as a fraction of the larger box, using the
 * measure appropriate to what the mark IS.
 *
 * Horizontal rules are measured ABSOLUTELY, down from the top. A ruled
 * box has a fixed pitch: making it taller adds rules below the last one
 * and leaves the rest where they were, so a rule 90px down is the same
 * rule whatever the box height. Measuring those proportionally paired the
 * old bottom rule with a new one two thirds down and slid a row that
 * should not have moved - "if i dragged a tall todo from side bar to
 * bottom then back it should expand and reveal rows from where they
 * weren't".
 *
 * Vertical rules are measured RELATIVELY, across the width. They divide a
 * box into day columns, so they genuinely do respread when it is resized:
 * a habit-tracker's separators sit at fractions of the width, not at a
 * pitch from the left.
 *
 * Boxes take the same treatment on each axis for the same reasons.
 */
function markDistance(
  a: PairableRect,
  b: PairableRect,
  role: RectRole,
  fromSize: { width: number; height: number },
  toSize: { width: number; height: number }
): number {
  const centre = (r: PairableRect) => ({
    x: (r.x ?? 0) + (r.width ?? 0) / 2,
    y: (r.y ?? 0) + (r.height ?? 0) / 2,
  });
  const ca = centre(a);
  const cb = centre(b);
  const refHeight = Math.max(fromSize.height, toSize.height, 1);
  const dyAbsolute = Math.abs(ca.y - cb.y) / refHeight;
  const dxRelative = Math.abs(
    ca.x / Math.max(fromSize.width, 1) - cb.x / Math.max(toSize.width, 1)
  );
  if (role === "hrule") return dyAbsolute;
  if (role === "vrule") return dxRelative;
  return Math.hypot(dxRelative, Math.abs(ca.y - cb.y) / refHeight);
}

export type MorphPairing<T> = {
  /** Present in both renders: animate from the first to the second. */
  pairs: Array<{ from: T; to: T }>;
  /** Outgoing, and lying beyond the final bounds: the closing box wipes
   *  it. Draw it and let the clip do the work - no fade. */
  sweepOut: T[];
  /** Outgoing, with no counterpart, but still inside the box at the end -
   *  nothing removes it, so it has to fade. */
  fadeOut: T[];
  /** Incoming, and lying beyond the starting bounds: the opening box
   *  uncovers it. Draw it and let the clip do the work - no fade. */
  revealIn: T[];
  /** Incoming, with no counterpart, and already inside the box at the
   *  start - it would pop into existence, so it has to fade. */
  fadeIn: T[];
};

/** Whether a rect begins past an edge of the given bounds, so that the
 *  clip window alone will hide or expose it. Content is anchored to the
 *  box's top-left, so a box only ever gains or loses along its right and
 *  bottom edges. */
function beyond(rect: PairableRect, bounds: { width: number; height: number }): boolean {
  return (rect.x ?? 0) >= bounds.width - 0.5 || (rect.y ?? 0) >= bounds.height - 0.5;
}

/**
 * Pairs the rects of an outgoing render with those of an incoming one.
 *
 * `fromSize` and `toSize` are the two renders' own box sizes, which is
 * what makes the comparison relative — see MAX_RELATIVE_DISTANCE.
 *
 * Greedy nearest-neighbour within a role. Not optimal assignment: the
 * inputs are ordered lists of rules down a box, so nearest-first already
 * produces the ordering-preserving matching an optimal solver would, and
 * a few dozen elements do not justify the machinery.
 */
export function pairRectsForMorph<T extends PairableRect>(
  from: T[],
  to: T[],
  fromSize: { width: number; height: number },
  toSize: { width: number; height: number }
): MorphPairing<T> {
  const pairs: Array<{ from: T; to: T }> = [];
  const takenTo = new Set<number>();
  const pairedFrom = new Set<number>();

  from.forEach((f, fi) => {
    const role = rectRole(f);
    let best = -1;
    let bestDistance = Infinity;
    to.forEach((t, ti) => {
      if (takenTo.has(ti)) return;
      if (rectRole(t) !== role) return;
      if (!sameInk(f, t)) return;
      const distance = markDistance(f, t, role, fromSize, toSize);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = ti;
      }
    });
    if (best >= 0 && bestDistance <= MAX_RELATIVE_DISTANCE) {
      takenTo.add(best);
      pairedFrom.add(fi);
      pairs.push({ from: f, to: to[best] });
    }
  });

  // Unpaired rects are NOT automatically faded. The clip window is the
  // preferred mechanism and it already handles most of them: anything
  // that ends up beyond the final bounds is wiped by the closing box, and
  // anything that started beyond the old bounds is uncovered by the
  // opening one. Requested directly - "with something like a todo bottom
  // to sidebar it should just overflow hidden sweep everything away,
  // there shouldn't be any fading", and "if i dragged a tall todo from
  // side bar to bottom then back it should expand and reveal rows from
  // where they weren't".
  //
  // Fading is only for what neither the pairing nor the clip can account
  // for: a mark that is inside the box at both ends and has no
  // counterpart, which would otherwise pop in or out.
  const unpairedFrom = from.filter((_, fi) => !pairedFrom.has(fi));
  const unpairedTo = to.filter((_, ti) => !takenTo.has(ti));
  return {
    pairs,
    sweepOut: unpairedFrom.filter((r) => beyond(r, toSize)),
    fadeOut: unpairedFrom.filter((r) => !beyond(r, toSize)),
    revealIn: unpairedTo.filter((r) => beyond(r, fromSize)),
    fadeIn: unpairedTo.filter((r) => !beyond(r, fromSize)),
  };
}
