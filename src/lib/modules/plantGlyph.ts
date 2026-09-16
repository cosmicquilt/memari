// The potted-plant glyph: five blades in a planter, layered.
//
// It has its own file because it is a different kind of shape from the
// others in glyphs.ts. Those are each one closed outline described by a
// handful of curves. This one is six overlapping pieces whose visible
// outline depends on which piece is in FRONT of which, and working that
// out needs real geometry: curve-curve intersection and curve splitting.
//
// WHY THE OCCLUSION IS IN THE PATH rather than done with fills. Drawing
// the leaves back to front, each filled with the paper colour, is the
// obvious way to get one leaf to hide another - and it costs six elements
// a glyph instead of one, paints over the dot lattice, and bakes a paper
// colour into a glyph. Instead each back leaf is CUT where a leaf in front
// of it crosses, so the drawing already looks layered with no fill at all.
// Suggested by Andrew as "it can also just be traced to have that
// appearance if easier", and it is both easier and better.
//
// The shape is traced from a reference icon, with its aspect preserved:
// the reference is 382 wide by 324 tall, and mapping that onto a square
// glyph box stretched it 18% vertically - leaves too long and thin, pot
// too shallow. So x spans the full width and y is centred into 0.848 of
// the height. Every measured point below is in the reference's own pixels
// with the mapping beside it, so the arithmetic can be checked.

type P = [number, number];
type Cubic = [P, P, P, P];
type Chain = Cubic[];
/** A subpath ready to emit: a start point, then a run of cubics. */
type SubPath = { start: P; cubics: Array<[P, P, P]>; closed: boolean };

const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const reverseCubic = (c: Cubic): Cubic => [c[3], c[2], c[1], c[0]];
const reverseChain = (ch: Chain): Chain => ch.slice().reverse().map(reverseCubic);

function splitCubic(c: Cubic, t: number) {
  const a = lerp(c[0], c[1], t), b = lerp(c[1], c[2], t), d = lerp(c[2], c[3], t);
  const e = lerp(a, b, t), g = lerp(b, d, t), h = lerp(e, g, t);
  return { before: [c[0], a, e, h] as Cubic, after: [h, g, d, c[3]] as Cubic };
}
const cubicAt = (c: Cubic, t: number): P => {
  const m = 1 - t;
  return [
    m * m * m * c[0][0] + 3 * m * m * t * c[1][0] + 3 * m * t * t * c[2][0] + t * t * t * c[3][0],
    m * m * m * c[0][1] + 3 * m * m * t * c[1][1] + 3 * m * t * t * c[2][1] + t * t * t * c[3][1],
  ];
};
function segCross(a1: P, a2: P, b1: P, b2: P): number | null {
  const rx = a2[0] - a1[0], ry = a2[1] - a1[1];
  const sx = b2[0] - b1[0], sy = b2[1] - b1[1];
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const qpx = b1[0] - a1[0], qpy = b1[1] - a1[1];
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/**
 * Every t at which this cubic crosses any of `others`, by flattening both
 * to polylines. Numeric rather than analytic: cubic-cubic intersection is
 * a ninth-degree problem, and this only has to be right to a fraction of a
 * print pixel.
 */
function crossings(edge: Cubic, others: Cubic[], steps = 140): number[] {
  const out: number[] = [];
  const flat = others.map((o) => Array.from({ length: steps + 1 }, (_, j) => cubicAt(o, j / steps)));
  let prev = cubicAt(edge, 0);
  for (let i = 1; i <= steps; i++) {
    const cur = cubicAt(edge, i / steps);
    for (const poly of flat) {
      for (let j = 1; j < poly.length; j++) {
        const s = segCross(prev, cur, poly[j - 1], poly[j]);
        if (s !== null) out.push((i - 1 + s) / steps);
      }
    }
    prev = cur;
  }
  return out.sort((a, b) => a - b);
}

// --- the traced measurements -------------------------------------------
// Reference content box, in the reference's own pixels.
const IMG = { x0: 58, y0: 128, w: 382, h: 324 };
const ASPECT = IMG.h / IMG.w;
const YPAD = (1 - ASPECT) / 2;
const ux = (px: number) => (px - IMG.x0) / IMG.w;
const uy = (py: number) => YPAD + ASPECT * ((py - IMG.y0) / IMG.h);

const TIP_CENTRE = { x: ux(248), y: uy(130) };
const TIP_INNER = { x: ux(137), y: uy(192) };
const TIP_OUTER = { x: ux(65), y: uy(240) };
const BASE = { x: ux(248), y: uy(375) };
const RIM_Y = uy(378), RIM_L = ux(105), RIM_R = ux(395);
const POT_Y = uy(450), POT_L = ux(62), POT_R = ux(437);

// --- the chosen shape --------------------------------------------------
/** How far apart the blade bases sit along the rim. All five starting at
 *  one point put five outlines through the same spot and tangled. */
const SPREAD = 0.105;
const HALF_BASE = 0.066;
const BELLY = 0.14;
/** The outer pair bends perpendicular to its own axis - a real curl at any
 *  blade angle, where a horizontal push mostly just lengthens a blade
 *  already lying at 54 degrees. */
const CURL = 0.09;
/** Where the outward edge of an outer blade turns from convex to concave,
 *  along the blade. */
const TURN = 0.62;
/** How far past the axis that last stretch hooks in. Gentle on purpose. */
const HOOK = 0.14;

type Blade = { left: Chain; right: Chain };

function bladeEdges(
  cx: number, tipX: number, tipY: number,
  opts: { outwardIsLeft?: boolean; curlP?: number; inflect?: boolean } = {}
): Blade {
  const { outwardIsLeft = true, curlP = 0, inflect = false } = opts;
  const mx = tipX - cx, my = tipY - RIM_Y;
  const len = Math.hypot(mx, my);
  const px = -my / len, py = mx / len;
  const at = (t: number, w: number): P => [
    cx + t * mx + w * px + curlP * t * t * px,
    RIM_Y + t * my + w * py + curlP * t * t * py,
  ];
  const tip: P = [tipX + curlP * px, tipY + curlP * py];

  const edge = (sign: number, bend: boolean): Chain => {
    const corner: P = [cx + sign * HALF_BASE, RIM_Y];
    if (!bend) return [[corner, at(0.22, sign * BELLY), at(0.6, sign * BELLY * 0.78), tip]];
    const beforeControl = at(TURN * 0.74, sign * BELLY * 0.99);
    const meet = at(TURN, sign * BELLY * 0.68);
    const rest = 1 - TURN;
    // A SMOOTH JOIN: the second segment's first control is the reflection
    // of the first segment's last control through the meeting point, so
    // the two share a tangent. Without it the curve changes direction at
    // the join and reads as a corner - which is what made the turn look
    // abrupt however gentle the hook was. The visible break was the
    // tangent, not the concavity.
    const dir: P = [meet[0] - beforeControl[0], meet[1] - beforeControl[1]];
    const afterControl: P = [meet[0] + dir[0] * 0.85, meet[1] + dir[1] * 0.85];
    return [
      [corner, at(0.22, sign * BELLY), beforeControl, meet],
      [meet, afterControl, at(1 - rest * 0.3, -sign * BELLY * HOOK), tip],
    ];
  };

  return {
    left: edge(-1, outwardIsLeft && inflect),
    right: reverseChain(edge(1, !outwardIsLeft && inflect)),
  };
}

const allCubics = (b: Blade): Cubic[] => [...b.left, ...b.right];
const asSub = (start: P, cubics: Cubic[], closed: boolean): SubPath => ({
  start,
  cubics: cubics.map((c) => [c[1], c[2], c[3]] as [P, P, P]),
  closed,
});

/**
 * A back blade with the parts a blade in front of it covers left undrawn.
 *
 * Its left edge runs base to tip, so anything hidden is at the START: cut
 * at the LAST crossing and keep what follows. Its right edge runs tip to
 * base, so anything hidden is at the END: cut at the FIRST crossing and
 * keep what precedes. With the middle gone the two no longer join, so this
 * returns two open subpaths rather than one.
 */
function occludedSubs(b: Blade, fronts: Blade[]): SubPath[] {
  const edges = fronts.flatMap(allCubics);
  const L = b.left[0], R = b.right[0];
  const lc = crossings(L, edges);
  const rc = crossings(R, edges);
  const left = lc.length ? splitCubic(L, lc[lc.length - 1]).after : L;
  const right = rc.length ? splitCubic(R, rc[0]).before : R;
  return [asSub(left[0], [left], false), asSub(right[0], [right], false)];
}

function potSub(): SubPath {
  const mid = RIM_Y + (POT_Y - RIM_Y) * 0.42;
  // A straight run along the base, then each side bowing up to a flat rim.
  // Emitted as cubics throughout so one code path draws everything.
  const line = (a: P, b: P): Cubic => [a, lerp(a, b, 1 / 3), lerp(a, b, 2 / 3), b];
  const cubics: Cubic[] = [
    line([POT_L, POT_Y], [POT_R, POT_Y]),
    [[POT_R, POT_Y], [POT_R, mid], [POT_R - 0.04, RIM_Y], [RIM_R, RIM_Y]],
    line([RIM_R, RIM_Y], [RIM_L, RIM_Y]),
    [[RIM_L, RIM_Y], [POT_L + 0.04, RIM_Y], [POT_L, mid], [POT_L, POT_Y]],
  ];
  return asSub([POT_L, POT_Y], cubics, true);
}

/**
 * The whole glyph in UNIT coordinates, built once.
 *
 * The intersection search is far too expensive to run per mark - a strip
 * can carry fifty of these - but the shape is the same at every size, so
 * the crossings are scale-invariant and this only has to be solved once.
 * Emitting is then just an affine map over the stored points.
 */
let unitCache: SubPath[] | null = null;

function plantUnit(): SubPath[] {
  if (unitCache) return unitCache;
  const blade = (offset: number, tip: { x: number; y: number }, mirror: boolean, outer: boolean) =>
    bladeEdges(
      BASE.x + offset,
      mirror ? 1 - tip.x : tip.x,
      tip.y,
      {
        outwardIsLeft: !mirror,
        curlP: outer ? (mirror ? 1 : -1) * CURL : 0,
        inflect: outer,
      }
    );
  const centre = blade(0, TIP_CENTRE, false, false);
  const innerL = blade(-SPREAD, TIP_INNER, false, false);
  const innerR = blade(SPREAD, TIP_INNER, true, false);
  const outerL = blade(-SPREAD * 1.8, TIP_OUTER, false, true);
  const outerR = blade(SPREAD * 1.8, TIP_OUTER, true, true);

  // Back to front: centre, then the inner pair, then the outer pair. Each
  // back blade is cut against whatever sits in front of it.
  unitCache = [
    ...occludedSubs(centre, [innerL, innerR]),
    ...occludedSubs(innerL, [outerL]),
    ...occludedSubs(innerR, [outerR]),
    asSub(outerL.left[0][0], allCubics(outerL), true),
    asSub(outerR.left[0][0], allCubics(outerR), true),
    potSub(),
  ];
  return unitCache;
}

/** The plant, at a position and size, as one path `d`. */
export function plantPathD(x: number, y: number, sizePx: number): string {
  const m = (p: P) => `${(x + p[0] * sizePx).toFixed(2)} ${(y + p[1] * sizePx).toFixed(2)}`;
  return plantUnit()
    .map(
      (sub) =>
        `M ${m(sub.start)} ` +
        sub.cubics.map(([c1, c2, end]) => `C ${m(c1)} ${m(c2)} ${m(end)}`).join(" ") +
        (sub.closed ? " Z" : "")
    )
    .join(" ");
}
