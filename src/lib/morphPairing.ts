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
 * How far apart two rects may sit, as a fraction of their own render's
 * size, and still be considered the same line moving.
 *
 * Position has to be compared RELATIVELY, not absolutely: a rule halfway
 * down a 1000px box is halfway down a 600px box after the resize, and
 * those are the same rule even though they are 200px apart. Comparing
 * absolute coordinates would refuse to morph anything on a large resize,
 * which is the opposite of what is wanted.
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

/** The coordinate that decides whether two rects are "the same one":
 *  a horizontal rule is identified by its height up the box, a vertical
 *  rule by its position across it, a box by both. */
function position(rect: PairableRect, role: RectRole, size: { width: number; height: number }) {
  const cx = (rect.x ?? 0) + (rect.width ?? 0) / 2;
  const cy = (rect.y ?? 0) + (rect.height ?? 0) / 2;
  return {
    u: role === "vrule" ? cx / Math.max(size.width, 1) : cy / Math.max(size.height, 1),
    v: role === "box" ? cx / Math.max(size.width, 1) : 0,
  };
}

export type MorphPairing<T> = {
  /** Present in both renders: animate from the first to the second. */
  pairs: Array<{ from: T; to: T }>;
  /** Only in the outgoing render: fade out. */
  fadeOut: T[];
  /** Only in the incoming render: fade in. */
  fadeIn: T[];
};

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
    const fp = position(f, role, fromSize);
    let best = -1;
    let bestDistance = Infinity;
    to.forEach((t, ti) => {
      if (takenTo.has(ti)) return;
      if (rectRole(t) !== role) return;
      if (!sameInk(f, t)) return;
      const tp = position(t, role, toSize);
      const du = Math.abs(fp.u - tp.u);
      const dv = Math.abs(fp.v - tp.v);
      const distance = role === "box" ? Math.hypot(du, dv) : du;
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

  return {
    pairs,
    fadeOut: from.filter((_, fi) => !pairedFrom.has(fi)),
    fadeIn: to.filter((_, ti) => !takenTo.has(ti)),
  };
}
