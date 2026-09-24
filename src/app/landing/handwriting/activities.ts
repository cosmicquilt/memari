// Activity doodles: one little person doing the fun things in a week -
// surfing, running, skating, D&D, a film on the sofa - for the calendar
// feature (Andrew, 2026-09-23: recurring classes and shifts printed as faint
// boxes, "doodles around them like surfing with a stick figure surfing ...
// drawing in the fun stuff around the mundane").
//
// One figure, posed: a head with a curl of hair and a face that looks where
// it is going, a torso, and limbs that bend smoothly at elbow and knee
// rather than hinging like a mannequin's. Each activity is a pose - eleven
// points in the doodle's unit box - and the props that name it (a board, a
// ball, a leash), drawn with the same Sketch as the object doodles, so they
// share one hand. Props in front hide what is behind them (Sketch.cover).
//
// The Gemini report (2026-09-24) suggested Quick, Draw! sketches and poses
// from MediaPipe; these are drawn in code instead, to keep the house style -
// see memari-landing-page memory for why.

import { DETAIL, Sketch, type DoodleStroke, type Pt } from "./doodles";
import { rng as makeRng } from "./rng";

const TAU = Math.PI * 2;
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const unit = (a: Pt, b: Pt): Pt => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
};
const circle = (c: Pt, r: number, n = 20): Pt[] => Array.from({ length: n }, (_, i) => [c[0] + Math.cos((i / n) * TAU) * r, c[1] + Math.sin((i / n) * TAU) * r] as Pt);
const rect = (u0: number, v0: number, u1: number, v1: number): Pt[] => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

/** Round the corners of a polyline, keeping its ends (Chaikin). */
function rounded(pts: Pt[], times = 2): Pt[] {
  let p = pts;
  for (let k = 0; k < times; k++) {
    const next: Pt[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      if (i > 0) next.push(lerp(p[i], p[i + 1], 0.25));
      if (i < p.length - 2) next.push(lerp(p[i], p[i + 1], 0.75));
    }
    next.push(p[p.length - 1]);
    p = next;
  }
  return p;
}

/** A limb from `a` through the joint `b` to `c`, bending smoothly there. */
const limb = (a: Pt, b: Pt, c: Pt): Pt[] => rounded([a, lerp(a, b, 0.5), b, lerp(b, c, 0.5), c]);

type Pose = {
  head: Pt;
  neck: Pt;
  hip: Pt;
  /** [elbow, hand] for each arm, the far one first; null for an arm hidden
   *  or drawn apart. */
  arms: Array<[Pt, Pt] | null>;
  /** [knee, foot] for each leg, the far one first. */
  legs: Array<[Pt, Pt] | null>;
  /** Which way the face looks: 1 right, -1 left, 0 at us, null from behind. */
  facing: 1 | -1 | 0 | null;
  /** Draw the shirt (a robe or a sofa may stand in for it). */
  torso?: boolean;
  /** Shoes on the feet. */
  feet?: boolean;
  headR?: number;
};

const HEAD = 0.064;

/**
 * An outlined limb along a centre line: `w0` wide at its start tapering to
 * `w1`, its end rounded (and its start too, if `startCap`). Hides what is
 * behind it and draws its outline. A sleeve or trouser leg is `wider` up to
 * `cuffAt` (a fraction of its length), with a line across there.
 */
function tube(k: Sketch, center: Pt[], w0: number, w1: number, { startCap = false, weight = 1, shade = false, cuffAt = -1, wider = 1 } = {}): Pt[] {
  const n = center.length;
  const lengths = [0];
  for (let i = 1; i < n; i++) lengths.push(lengths[i - 1] + Math.hypot(center[i][0] - center[i - 1][0], center[i][1] - center[i - 1][1]));
  const total = lengths[n - 1] || 1;
  const halfAt = (i: number) => {
    const f = lengths[i] / total;
    return ((w0 + (w1 - w0) * f) * (cuffAt > 0 && f < cuffAt ? wider : 1)) / 2;
  };
  const normal = (i: number): Pt => {
    const t = unit(center[Math.max(0, i - 1)], center[Math.min(n - 1, i + 1)]);
    return [-t[1], t[0]];
  };
  const left = center.map((p, i) => add(p, [normal(i)[0] * halfAt(i), normal(i)[1] * halfAt(i)]));
  const right = center.map((p, i) => add(p, [-normal(i)[0] * halfAt(i), -normal(i)[1] * halfAt(i)]));
  const endDir = unit(center[n - 2], center[n - 1]);
  const endAngle = Math.atan2(endDir[1], endDir[0]);
  const cap = k.arc(center[n - 1][0], center[n - 1][1], halfAt(n - 1), halfAt(n - 1), endAngle - Math.PI / 2, endAngle + Math.PI / 2, 8);
  const startDir = unit(center[1], center[0]);
  const startAngle = Math.atan2(startDir[1], startDir[0]);
  const startCapPts = startCap ? k.arc(center[0][0], center[0][1], halfAt(0), halfAt(0), startAngle - Math.PI / 2, startAngle + Math.PI / 2, 8) : [];
  const shape: Pt[] = [...left, ...cap, ...right.slice().reverse(), ...startCapPts];
  k.cover(shape);
  k.line(startCap ? [...shape, shape[0]] : [...left, ...cap, ...right.slice().reverse()], weight);
  if (shade) k.hatch(shape, 0.9, 0.013);
  if (cuffAt > 0) {
    const i = lengths.findIndex((l) => l / total >= cuffAt);
    if (i > 0) k.line([left[i], right[i]], DETAIL);
  }
  return shape;
}

/** A hand: a small mitten carrying on from the arm, and a thumb. */
function hand(k: Sketch, at: Pt, from: Pt) {
  const d = unit(from, at);
  const c = add(at, [d[0] * 0.01, d[1] * 0.01]);
  const angle = Math.atan2(d[1], d[0]);
  const mitten = k.arc(c[0], c[1], 0.022, 0.017, 0, TAU, 16, angle);
  k.cover(mitten);
  k.line([...mitten, mitten[1]]);
  k.line([add(c, [-d[1] * 0.012 - d[0] * 0.006, d[0] * 0.012 - d[1] * 0.006]), add(c, [-d[1] * 0.024 + d[0] * 0.004, d[0] * 0.024 + d[1] * 0.004])], DETAIL, 0.2);
}

/** A shoe at a foot, pointing `dir` (1 right, -1 left), with its sole. */
function shoe(k: Sketch, at: Pt, dir: number) {
  const c = add(at, [dir * 0.014, 0.004]);
  const shape = k.arc(c[0], c[1], 0.032, 0.017, 0, TAU, 18);
  k.cover(shape);
  k.line([...shape, shape[1]]);
  k.line([add(c, [-0.028, 0.009]), add(c, [0.028, 0.009])], DETAIL);
}

/**
 * The person: trousers and shoes, arms with sleeves and hands, a striped
 * T-shirt, and a head with the same hair every time - this is one person's
 * week. Drawn back to front, the far limbs shaded, each part hiding what is
 * behind it. (Andrew, 2026-09-24, of the first stick figures: "more
 * detailed".)
 */
function figure(k: Sketch, p: Pose) {
  if (figureStyle === "stick") return stickFigure(k, p);
  if (figureStyle === "bean") return beanFigure(k, p);
  const r = p.headR ?? HEAD;
  const facing = p.facing ?? 0;
  const side = p.facing === 1 || p.facing === -1;
  const spine = unit(p.neck, p.hip);
  const across: Pt = [-spine[1], spine[0]];
  const shoulderAt = lerp(p.neck, p.hip, 0.12);
  const shoulderW = side ? 0.1 : 0.135;
  const hemW = side ? 0.095 : 0.12;
  const offset = (pt: Pt, w: number): Pt => add(pt, [across[0] * w, across[1] * w]);
  // Front on, each arm hangs from the shoulder on its own side.
  const armFrom = (arm: [Pt, Pt]): Pt => {
    if (side) return shoulderAt;
    const a = offset(shoulderAt, shoulderW * 0.5 - 0.016);
    const b = offset(shoulderAt, -(shoulderW * 0.5 - 0.016));
    return Math.hypot(arm[0][0] - a[0], arm[0][1] - a[1]) < Math.hypot(arm[0][0] - b[0], arm[0][1] - b[1]) ? a : b;
  };
  // Legs: trousers to a hem, shoes on - the far leg shaded.
  p.legs.forEach((leg, i) => {
    if (!leg) return;
    tube(k, limb(p.hip, leg[0], leg[1]), 0.062, 0.046, { shade: i === 0 && side, cuffAt: 0.9, wider: 1 });
    if (p.feet !== false) shoe(k, leg[1], side ? facing : leg[1][0] < p.hip[0] ? -1 : 1);
  });
  // In profile the far arm is behind the body.
  const arms = p.arms;
  const far = side ? arms[0] : null;
  if (far) {
    tube(k, limb(armFrom(far), far[0], far[1]), 0.042, 0.032, { shade: true, cuffAt: 0.32, wider: 1.25 });
    hand(k, far[1], far[0]);
  }
  // The shirt: shoulders to a hem just over the waist, a collar, stripes.
  if (p.torso !== false) {
    const S = (t: number, w: number): Pt => offset(lerp(p.neck, p.hip, t), w);
    // Sloped shoulders, a little in at the waist, out again to a hem with
    // rounded corners.
    const hem = 1.07;
    const half = (sign: number): Pt[] => [
      ...k.bez(S(0.03, sign * shoulderW * 0.18), S(0.05, sign * shoulderW * 0.36), S(0.06, sign * shoulderW * 0.52), S(0.15, sign * shoulderW * 0.53), 6),
      ...k.bez(S(0.15, sign * shoulderW * 0.53), S(0.45, sign * shoulderW * 0.5), S(0.65, sign * hemW * 0.42), S(0.9, sign * hemW * 0.5), 8).slice(1),
      ...k.bez(S(0.9, sign * hemW * 0.5), S(hem, sign * hemW * 0.54), S(hem + 0.02, sign * hemW * 0.4), S(hem + 0.02, sign * hemW * 0.2), 5).slice(1),
    ];
    const shirt: Pt[] = [...half(1), S(hem + 0.025, 0), ...half(-1).reverse()];
    k.cover(shirt);
    k.line([...shirt, shirt[0]]);
    k.line(k.bez(S(0.02, shoulderW * 0.2), S(0.12, shoulderW * 0.12), S(0.12, -shoulderW * 0.12), S(0.02, -shoulderW * 0.2), 8), DETAIL);
    for (const t of [0.5, 0.72]) k.line([S(t, hemW * 0.46), S(t, -hemW * 0.46)], DETAIL, 0.4);
  }
  // The near arms, over the shirt: a sleeve to a cuff, then the bare forearm.
  for (const arm of arms) {
    if (!arm || arm === far) continue;
    tube(k, limb(armFrom(arm), arm[0], arm[1]), 0.042, 0.032, { startCap: true, cuffAt: 0.32, wider: 1.25 });
    hand(k, arm[1], arm[0]);
  }
  // A neck, and the head over it.
  const up = unit(p.neck, p.head);
  k.line([p.neck, add(p.head, [-up[0] * r * 0.8, -up[1] * r * 0.8])], DETAIL);
  head(k, p.head, r, p.facing, up);
}

/** Which person the scenes draw - see ActivityOptions. */
let figureStyle: FigureStyle = "full";
export type FigureStyle = "full" | "stick" | "bean";

/** The first figure: single lines, a curl of hair, dots for eyes. */
function stickFigure(k: Sketch, p: Pose) {
  const r = p.headR ?? HEAD;
  const shoulder = lerp(p.neck, p.hip, 0.14);
  for (const arm of p.arms) if (arm) k.line(limb(shoulder, arm[0], arm[1]));
  if (p.torso !== false) k.line(rounded([p.neck, add(lerp(p.neck, p.hip, 0.5), [0.006, 0]), p.hip], 1));
  const facing = p.facing ?? 0;
  for (const leg of p.legs) {
    if (!leg) continue;
    k.line(limb(p.hip, leg[0], leg[1]));
    if (p.feet !== false) {
      const dir = facing !== 0 ? facing : leg[1][0] < p.hip[0] ? -1 : 1;
      k.line([leg[1], add(leg[1], [dir * 0.035, 0.002])]);
    }
  }
  simpleHead(k, p, r);
}

/** A round head with a curl of hair and a dot-and-smile face. */
function simpleHead(k: Sketch, p: Pose, r: number) {
  const facing = p.facing ?? 0;
  k.cover(circle(p.head, r * 1.05));
  k.ring(p.head[0], p.head[1], r, r * 1.02);
  const up = unit(p.neck, p.head);
  const top = add(p.head, [up[0] * r, up[1] * r]);
  const back: Pt = [-(facing || 0.4) * r * 0.5, 0];
  k.line(k.bez(add(top, [back[0] * 0.2, 0]), add(top, [back[0] * 0.6 + up[0] * r * 0.5, up[1] * r * 0.5]), add(top, [back[0] * 1.6 + up[0] * r * 0.7, up[1] * r * 0.3]), add(top, [back[0] * 1.3, up[1] * -0.1 * r]), 8), DETAIL);
  if (p.facing === null) return;
  const eyes: Pt[] = facing === 0 ? [[-0.32, -0.12], [0.32, -0.12]] : [[facing * 0.42, -0.14]];
  for (const [ex, ey] of eyes) k.dot(p.head[0] + ex * r, p.head[1] + ey * r, r * 0.13, DETAIL);
  const sc: Pt = [p.head[0] + facing * 0.4 * r, p.head[1] + 0.28 * r];
  k.line(k.arc(sc[0], sc[1], r * 0.28, r * 0.2, Math.PI * 0.15, Math.PI * 0.85, 8), DETAIL, 0.3);
}

/** A softer figure: a pill of a body, thick noodle limbs, a round head. */
function beanFigure(k: Sketch, p: Pose) {
  const r = (p.headR ?? HEAD) * 1.1;
  const side = p.facing === 1 || p.facing === -1;
  const spine = unit(p.neck, p.hip);
  const across: Pt = [-spine[1], spine[0]];
  const w = side ? 0.05 : 0.065;
  const shoulder = lerp(p.neck, p.hip, 0.2);
  const noodle = 1.6;
  p.legs.forEach((leg) => {
    if (!leg) return;
    k.line(limb(p.hip, leg[0], leg[1]), noodle);
    const dir = side ? (p.facing as number) : leg[1][0] < p.hip[0] ? -1 : 1;
    if (p.feet !== false) k.line(k.arc(leg[1][0] + dir * 0.012, leg[1][1] + 0.004, 0.022, 0.012, 0, TAU, 10), 1);
  });
  if (p.torso !== false) {
    const top = add(p.neck, [spine[0] * 0.01, spine[1] * 0.01]);
    const bottom = add(p.hip, [spine[0] * 0.02, spine[1] * 0.02]);
    const a0 = Math.atan2(across[1], across[0]);
    const pill: Pt[] = [...k.arc(top[0], top[1], w, w, a0 + Math.PI, a0 + TAU, 10), ...k.arc(bottom[0], bottom[1], w, w, a0, a0 + Math.PI, 10)];
    k.cover(pill);
    k.line([...pill, pill[0], pill[1]]);
  }
  for (const arm of p.arms) if (arm) k.line(limb(shoulder, arm[0], arm[1]), noodle);
  simpleHead(k, p, r);
}

/**
 * The head: the hair (a fringe and a shaded mass, the same on every
 * drawing), an ear, and a face - brows, eyes, a nose, a smile, a little
 * blush - turned the way the figure looks; none from behind.
 */
function head(k: Sketch, c: Pt, r: number, facing: 1 | -1 | 0 | null, up: Pt) {
  k.cover(circle(c, r * 1.08, 24));
  k.ring(c[0], c[1], r, r * 1.03);
  const f = facing ?? 0;
  // Head-local coordinates: x across the face, y down it, in head radii.
  const tilt = Math.atan2(up[1], up[0]) + Math.PI / 2;
  const [cs, sn] = [Math.cos(tilt), Math.sin(tilt)];
  const P = (x: number, y: number): Pt => [c[0] + (x * cs - y * sn) * r, c[1] + (x * sn + y * cs) * r];
  // Hair: an outer edge just over the skull, a little tufted, and an inner
  // edge that is the fringe - shaded.
  let from: number;
  let to: number;
  let inner: Pt[];
  if (facing === null) {
    from = Math.PI * 0.95;
    to = Math.PI * 2.05;
    inner = [P(0.95, 0.25), P(0.5, 0.45), P(0, 0.5), P(-0.5, 0.45), P(-0.95, 0.25)];
  } else if (f === 0) {
    from = Math.PI * 0.92;
    to = Math.PI * 2.08;
    inner = [P(1.0, 0.1), P(0.75, -0.3), P(0.4, -0.38), P(0.15, -0.28), P(-0.1, -0.42), P(-0.45, -0.36), P(-0.8, -0.25), P(-1.0, 0.1)];
  } else {
    // In profile the hair runs from the forehead over the crown to the nape.
    from = f === 1 ? Math.PI * 0.62 : Math.PI * 1.3;
    to = f === 1 ? Math.PI * 1.7 : Math.PI * 2.38;
    inner = f === 1 ? [P(0.45, -0.55), P(0.1, -0.35), P(-0.35, 0.05), P(-0.85, 0.5)] : [P(0.85, 0.5), P(0.35, 0.05), P(-0.1, -0.35), P(-0.45, -0.55)];
  }
  const outer: Pt[] = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps + tilt;
    const bump = 1.1 + 0.05 * Math.sin(i * 1.9);
    outer.push([c[0] + Math.cos(a) * r * bump, c[1] + Math.sin(a) * r * bump]);
  }
  const hair: Pt[] = [...outer, ...inner];
  k.cover(hair);
  k.line([...hair, hair[0]]);
  k.hatch(hair, 0.9, 0.017);
  if (facing === null) return;
  const ink = DETAIL;
  if (f === 0) {
    for (const x of [-0.34, 0.34]) {
      const e = P(x, 0.04);
      k.dot(e[0], e[1], r * 0.1, ink);
      k.line([P(x - 0.14, -0.14), P(x + 0.14, -0.16)], ink, 0.2);
      k.line([P(x * 1.4 - 0.08, 0.36), P(x * 1.4 + 0.08, 0.32)], ink * 0.7, 0.2);
    }
    k.line([P(0.02, 0.14), P(0.07, 0.27), P(-0.02, 0.29)], ink, 0.2);
    const m = P(0, 0.42);
    k.line(k.arc(m[0], m[1], r * 0.24, r * 0.15, Math.PI * 0.1 + tilt, Math.PI * 0.9 + tilt, 8), ink, 0.2);
    for (const x of [-1, 1]) {
      const e = P(x * 1.02, 0.12);
      k.line(k.arc(e[0], e[1], r * 0.14, r * 0.2, (x > 0 ? -Math.PI * 0.5 : Math.PI * 0.5) + tilt, (x > 0 ? Math.PI * 0.5 : Math.PI * 1.5) + tilt, 6), ink);
    }
    return;
  }
  // In profile: one eye and brow, a nose past the outline, a smile, an ear.
  const e = P(f * 0.5, 0.02);
  k.dot(e[0], e[1], r * 0.1, ink);
  k.line([P(f * 0.36, -0.18), P(f * 0.64, -0.22)], ink, 0.2);
  k.line([P(f * 0.97, 0.04), P(f * 1.16, 0.2), P(f * 0.96, 0.26)], ink, 0.2);
  const m = P(f * 0.6, 0.46);
  k.line(k.arc(m[0], m[1], r * 0.18, r * 0.12, Math.PI * 0.05 + tilt, Math.PI * 0.95 + tilt, 6), ink, 0.2);
  k.line([P(f * 0.3, 0.32), P(f * 0.44, 0.28)], ink * 0.7, 0.2);
  const ear = P(-f * 0.12, 0.14);
  k.line(k.arc(ear[0], ear[1], r * 0.14, r * 0.2, (f > 0 ? Math.PI * 0.5 : -Math.PI * 0.5) + tilt, (f > 0 ? Math.PI * 1.5 : Math.PI * 0.5) + tilt, 6), ink);
}

/** Head centre above a neck, along the spine. */
const headOn = (neck: Pt, hip: Pt, r = HEAD): Pt => {
  const up = unit(hip, neck);
  return add(neck, [up[0] * (r + 0.012), up[1] * (r + 0.012)]);
};

/** Short lines streaming behind something moving `dir` (1 right). */
function speedLines(k: Sketch, u: number, v0: number, v1: number, dir: 1 | -1, n = 3) {
  for (let i = 0; i < n; i++) {
    const v = v0 + ((v1 - v0) * i) / Math.max(1, n - 1);
    const len = k.r.range(0.07, 0.12);
    const u0 = u - dir * k.r.range(0, 0.04);
    k.line([[u0, v], [u0 - dir * len, v]], DETAIL, 0.3);
  }
}

/** A ground line in two or three pieces, as a quick hand draws one. */
function ground(k: Sketch, u0: number, u1: number, v: number) {
  let u = u0;
  while (u < u1) {
    const len = Math.min(u1 - u, k.r.range(0.14, 0.3));
    k.line([[u, v + k.r.range(-0.004, 0.004)], [u + len, v + k.r.range(-0.004, 0.004)]], DETAIL, 0.5);
    u += len + k.r.range(0.02, 0.04);
  }
}

/** A wavy line of water. */
function waterLine(k: Sketch, u0: number, u1: number, v: number, amp = 0.018, waves = 4, weight = DETAIL) {
  const pts: Pt[] = [];
  const n = waves * 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([u0 + (u1 - u0) * t, v + Math.sin(t * waves * TAU) * amp]);
  }
  k.line(pts, weight);
}

/** A little puff of dust or chalk: three bumps. */
function puff(k: Sketch, u: number, v: number, r: number) {
  k.line([...k.arc(u - r * 0.6, v, r * 0.5, r * 0.45, Math.PI * 0.6, Math.PI * 1.7, 6), ...k.arc(u, v - r * 0.3, r * 0.55, r * 0.5, Math.PI * 1.2, Math.PI * 1.95, 6).slice(1), ...k.arc(u + r * 0.6, v, r * 0.5, r * 0.45, Math.PI * 1.3, Math.PI * 2.4, 6).slice(1)], DETAIL);
}

/** A tuft of grass: three blades. */
function grass(k: Sketch, u: number, v: number) {
  k.line([[u - 0.012, v], [u - 0.02, v - 0.028]], DETAIL, 0.2);
  k.line([[u, v], [u + 0.003, v - 0.04]], DETAIL, 0.2);
  k.line([[u + 0.012, v], [u + 0.022, v - 0.026]], DETAIL, 0.2);
}

/**
 * A wave breaking to the right: a broad back sloping up out of the water
 * to the crest, the lip thrown forward and rolling down into the barrel, a
 * concave face sweeping down from under it; foam clawing off the crest,
 * the water's roll drawn along the curl and down the face, the barrel
 * shaded, spray, foam at its foot. `c` is the curl's centre, `R` its outer
 * radius, `base` the water it rises from, `u0` where its back starts.
 * (Andrew, 2026-09-24: the wave "needs to look better".)
 */
function curlingWave(k: Sketch, c: Pt, R: number, base: number, u0: number) {
  // The curl: a spiral shrinking to a sixth of R over a turn and a quarter.
  const decay = Math.log(1 / 0.16) / (2.5 * Math.PI);
  const P = (th: number, scale = 1): Pt => {
    const r = R * Math.exp(-decay * (th - Math.PI)) * scale;
    return [c[0] + Math.cos(th) * r, c[1] + Math.sin(th) * r];
  };
  const spiral = (th0: number, th1: number, scale = 1, n = 48): Pt[] => Array.from({ length: n + 1 }, (_, i) => P(th0 + ((th1 - th0) * i) / n, scale));
  const join = Math.PI * 1.25;
  const tangent = (th: number): Pt => unit(P(th - 0.02), P(th + 0.02));
  const tj = tangent(join);
  const J = P(join);
  // The back rises out of the water, arriving at the crest along the curl.
  const backAt = (inset: number, n = 14): Pt[] =>
    k.bez([u0 + inset * R, base], [u0 + R * (0.5 + inset), base - (base - J[1]) * (0.45 - inset * 0.3)], [J[0] - tj[0] * R * 0.9 + inset * R * 0.5, J[1] - tj[1] * R * 0.9 + inset * R * 0.8], lerp(J, c, inset * 0.9), n);
  const back = backAt(0);
  const crest = spiral(join, Math.PI * 3.45);
  // The face sweeps down from inside the curl to the water ahead.
  const F = P(Math.PI * 2.75);
  const foot: Pt = [c[0] + R * 2.1, base];
  const faceAt = (inset: number, n = 14): Pt[] => k.bez(lerp(F, c, inset * 0.3), [F[0] - R * (0.1 - inset * 0.4), F[1] + R * (1.1 - inset * 0.3)], [foot[0] - R * (1.4 + inset * 0.2), base - R * (0.08 + inset * 0.25)], [foot[0] - R * inset * 0.9, base - R * inset * 0.12], n);
  const face = faceAt(0);
  const body: Pt[] = [...back, ...spiral(join, Math.PI * 2.75).slice(1), ...face.slice(1)];
  k.cover(body);
  k.line([...back, ...crest.slice(1)]);
  k.line(face);
  // The water's roll: along the curl, down the back and the face.
  k.line(spiral(Math.PI * 1.3, Math.PI * 2.3, 0.8, 30), DETAIL);
  k.line(spiral(Math.PI * 1.45, Math.PI * 2.55, 0.62, 30), DETAIL * 0.8);
  k.line(backAt(0.28, 10).slice(1, -2), DETAIL * 0.7, 0.3);
  k.line(backAt(0.55, 10).slice(2, -3), DETAIL * 0.6, 0.3);
  k.line(faceAt(0.3, 10).slice(1, -1), DETAIL * 0.7, 0.3);
  k.line(faceAt(0.6, 10).slice(2, -2), DETAIL * 0.6, 0.3);
  // The barrel: dark inside the curl, and in the shadow under the lip.
  k.hatch(spiral(Math.PI * 2.45, Math.PI * 3.45, 1, 24), 0.9, R * 0.09);
  k.hatch([...spiral(Math.PI * 2.05, Math.PI * 2.75, 1, 16), ...face.slice(0, 6)], 1.1, R * 0.11);
  // Foam clawing forward off the crest.
  for (let i = 0; i < 9; i++) {
    const th = Math.PI * (1.32 + i * 0.1);
    const p = P(th);
    const n = unit(c, p);
    const t = tangent(th);
    const len = R * (0.26 + 0.08 * Math.sin(i * 2.3));
    k.line(k.bez(p, add(p, [n[0] * len * 0.6, n[1] * len * 0.6]), add(p, [n[0] * len + t[0] * len * 0.5, n[1] * len + t[1] * len * 0.5]), add(p, [n[0] * len * 0.55 + t[0] * len * 0.95, n[1] * len * 0.55 + t[1] * len * 0.95]), 6), DETAIL);
  }
  // Spray flung off the lip.
  for (let i = 0; i < 8; i++) {
    const th = Math.PI * (1.6 + i * 0.07);
    const p = P(th, 1.38 + (i % 3) * 0.13);
    k.dot(p[0] + R * 0.12, p[1], 0.006 + (i % 2) * 0.004, DETAIL);
  }
  // Foam where the wave meets the water, and a few bubbles.
  const froth: Pt[] = [];
  for (let u = u0; u < foot[0] + R * 0.5; u += R * 0.32) froth.push(...k.arc(u + R * 0.16, base, R * 0.16, R * 0.09, Math.PI, TAU, 5));
  k.line(froth, DETAIL);
  for (const [du, dv] of [[0.1, -0.35], [0.9, -0.5], [1.5, -0.25], [-0.8, -0.4]] as Pt[]) k.ring(c[0] + du * R, base + dv * R, R * 0.05, R * 0.05, DETAIL);
}

/** A sneaker in profile, its heel at (u, v) on the ground, `s` long,
 *  pointing `dir`: sole, toe cap, laces, a stripe on the side. */
function sneaker(k: Sketch, u: number, v: number, s: number, dir = 1, shade = false) {
  const X = (t: number, y: number): Pt => [u + dir * t * s, v - y * s];
  const shape: Pt[] = [X(0, 0), X(0.9, 0), ...k.bez(X(0.9, 0), X(1.02, 0), X(1.02, 0.2), X(0.9, 0.26), 6).slice(1), X(0.62, 0.36), X(0.42, 0.52), ...k.bez(X(0.42, 0.52), X(0.34, 0.5), X(0.24, 0.44), X(0.1, 0.5), 5).slice(1), ...k.bez(X(0.1, 0.5), X(0.0, 0.46), X(-0.02, 0.2), X(0, 0), 6).slice(1)];
  k.cover(shape);
  k.line([...shape, shape[0]]);
  k.line([X(0.02, 0.1), X(0.96, 0.1)], DETAIL);
  k.line(k.bez(X(0.72, 0.1), X(0.72, 0.2), X(0.82, 0.26), X(0.92, 0.25), 5), DETAIL);
  for (const t of [0.46, 0.54, 0.62]) k.line([X(t - 0.03, 0.42 - (t - 0.46) * 0.8), X(t + 0.05, 0.4 - (t - 0.46) * 0.8)], DETAIL, 0.2);
  k.line(k.bez(X(0.14, 0.2), X(0.3, 0.3), X(0.45, 0.22), X(0.6, 0.18), 6), DETAIL);
  if (shade) k.hatch(shape, 0.9, 0.012);
}

/** A helmet resting at (u, v): a vented dome, a brim, its strap. */
function helmet(k: Sketch, u: number, v: number, r: number) {
  const dome: Pt[] = [...k.arc(u, v, r, r * 0.85, Math.PI, TAU, 18), [u - r, v]];
  k.cover(dome);
  k.line(dome);
  k.line(k.arc(u, v - r * 0.02, r * 1.05, r * 0.14, 0, Math.PI, 10), DETAIL);
  for (const a of [1.25, 1.5, 1.75]) {
    const p: Pt = [u + Math.cos(a * Math.PI) * r * 0.6, v + Math.sin(a * Math.PI) * r * 0.55];
    k.line([p, add(p, [Math.cos(a * Math.PI) * r * 0.22, Math.sin(a * Math.PI) * r * 0.2])], DETAIL);
  }
  k.line(k.bez([u - r * 0.6, v], [u - r * 0.5, v + r * 0.35], [u + r * 0.2, v + r * 0.4], [u + r * 0.4, v + r * 0.05], 8), DETAIL);
}

/** A cat, curled up asleep at (u, v): a round back with stripes, ears,
 *  closed eyes, the tail wrapped round. */
function sleepingCat(k: Sketch, u: number, v: number, s: number) {
  const body = k.arc(u, v, s, s * 0.55, Math.PI * 0.95, Math.PI * 2.05, 18);
  k.cover([...body, [u + s, v + s * 0.1], [u - s, v + s * 0.1]]);
  k.line([...body, [u + s * 0.9, v + s * 0.12]]);
  for (const t of [0.35, 0.5, 0.65]) {
    const a = Math.PI * (1 + t);
    k.line([[u + Math.cos(a) * s * 0.9, v + Math.sin(a) * s * 0.5], [u + Math.cos(a) * s * 0.6, v + Math.sin(a) * s * 0.33]], DETAIL, 0.2);
  }
  const hc: Pt = [u - s * 0.8, v - s * 0.08];
  k.cover(circle(hc, s * 0.32, 14));
  k.ring(hc[0], hc[1], s * 0.32, s * 0.29);
  for (const d of [-1, 1]) k.line([add(hc, [d * s * 0.26 - s * 0.05, -s * 0.18]), add(hc, [d * s * 0.2 - s * 0.05, -s * 0.44]), add(hc, [d * s * 0.05 - s * 0.03, -s * 0.28])]);
  for (const d of [-1, 1]) k.line(k.arc(hc[0] + d * s * 0.12, hc[1], s * 0.07, s * 0.05, Math.PI * 0.1, Math.PI * 0.9, 5), DETAIL, 0.2);
  k.line(k.bez([u + s * 0.9, v + s * 0.1], [u + s * 0.4, v + s * 0.34], [u - s * 0.4, v + s * 0.34], [u - s * 0.7, v + s * 0.22], 10));
}

/** Swim goggles lying at (u, v): two lenses, the bridge, the strap. */
function goggles(k: Sketch, u: number, v: number, s: number) {
  for (const d of [-1, 1]) {
    const lens = k.arc(u + d * s * 0.55, v, s * 0.42, s * 0.3, 0, TAU, 12);
    k.cover(lens);
    k.line([...lens, lens[1]]);
    k.line(k.arc(u + d * s * 0.55, v, s * 0.26, s * 0.16, Math.PI * 1.1, Math.PI * 1.5, 4), DETAIL, 0.2);
  }
  k.line([[u - s * 0.13, v], [u + s * 0.13, v]]);
  k.line(k.bez([u - s * 0.97, v], [u - s * 1.4, v + s * 0.5], [u + s * 1.4, v + s * 0.6], [u + s * 0.97, v], 12), DETAIL);
}

/** A splash: a crown of droplets thrown up from a point on the water. */
function splash(k: Sketch, u: number, v: number, s: number) {
  for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
    const [dx, dy] = [Math.sin(a), -Math.cos(a)];
    k.line([[u + dx * s * 0.25, v + dy * s * 0.25], [u + dx * s * 0.6, v + dy * s * 0.7]], DETAIL, 0.2);
    k.dot(u + dx * s * 0.85, v + dy * s * 0.95, 0.006, DETAIL);
  }
  k.line(k.arc(u, v, s * 0.5, s * 0.14, Math.PI, TAU, 8), DETAIL);
}

/** A surfboard centred at `c`, turned `ang`: `at(t, side)` gives a point
 *  along it (t -1 to 1) and across it (side -1 to 1); `draw` draws it, its
 *  stringer, a stripe and the fin. */
function surfboard(k: Sketch, c: Pt, ang: number, L: number, W: number) {
  const [dx, dy] = [Math.cos(ang), Math.sin(ang)];
  const at = (t: number, side: number): Pt => [c[0] + dx * t * L + dy * -side * W, c[1] + dy * t * L - dx * -side * W];
  const shape: Pt[] = Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * TAU;
    const t = Math.cos(a);
    return at(t, Math.sin(a) * (1 - 0.5 * Math.max(0, t) ** 3));
  });
  const draw = () => {
    k.cover(shape);
    k.line([...shape, shape[0]]);
    k.line([at(-0.8, 0), at(0.78, 0)], DETAIL);
    k.line([at(0.2, 0.55), at(0.5, 0.45)], DETAIL * 0.7);
    k.line([at(-0.72, 1), add(at(-0.8, 1), [0.01, 0.05]), at(-0.62, 1)], DETAIL);
  };
  return { at, draw };
}

/** The skateboard: a deck with its kicked-up tail and nose and its grip
 *  tape, trucks, wheels with bearings. */
function skateboard(k: Sketch) {
  const deck: Pt[] = [...k.bez([0.26, 0.72], [0.28, 0.75], [0.3, 0.755], [0.34, 0.755], 6), [0.66, 0.755], ...k.bez([0.66, 0.755], [0.7, 0.755], [0.72, 0.75], [0.74, 0.72], 6).slice(1)];
  k.cover([...deck, [0.74, 0.74], [0.26, 0.74]]);
  k.line(deck);
  k.line([[0.3, 0.77], [0.7, 0.77]], DETAIL);
  for (const u of [0.37, 0.63]) {
    k.line([[u - 0.02, 0.775], [u, 0.79], [u + 0.02, 0.775]], DETAIL);
    k.ring(u, 0.815, 0.025, 0.025);
    k.ring(u, 0.815, 0.01, 0.01, DETAIL);
  }
}

/** The bike: wheels with tyres and spokes, frame, chainring and chain,
 *  saddle and bars. */
function bicycle(k: Sketch) {
  const back: Pt = [0.28, 0.72];
  const front: Pt = [0.74, 0.72];
  for (const w of [back, front]) {
    k.ring(w[0], w[1], 0.14, 0.14);
    k.ring(w[0], w[1], 0.122, 0.122, DETAIL);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI + k.r.range(0, 0.3);
      k.line([[w[0] - Math.cos(a) * 0.115, w[1] - Math.sin(a) * 0.115], [w[0] + Math.cos(a) * 0.115, w[1] + Math.sin(a) * 0.115]], DETAIL * 0.6, 0.2);
    }
    k.ring(w[0], w[1], 0.014, 0.014, DETAIL);
  }
  const crank: Pt = [0.48, 0.72];
  const head: Pt = [0.67, 0.49];
  k.line([back, crank, [0.44, 0.52]]);
  k.line([back, [0.44, 0.52], head, crank]);
  k.line([head, front]);
  k.ring(crank[0], crank[1], 0.04, 0.04, DETAIL);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    k.dot(crank[0] + Math.cos(a) * 0.046, crank[1] + Math.sin(a) * 0.046, 0.003, DETAIL);
  }
  k.line([[0.48, 0.68], [0.28, 0.7]], DETAIL * 0.7, 0.2);
  k.line([[0.48, 0.76], [0.28, 0.74]], DETAIL * 0.7, 0.2);
  k.line([[0.48, 0.72], [0.52, 0.78], [0.55, 0.78]], DETAIL);
  k.line([...k.bez([0.38, 0.49], [0.4, 0.47], [0.46, 0.47], [0.48, 0.49], 6), [0.46, 0.505], [0.4, 0.505], [0.38, 0.49]]);
  k.line([head, [0.66, 0.43], [0.61, 0.42]]);
}

/** An acoustic guitar from `tail` (the bottom of its body) toward `toward`:
 *  two bouts, a sound hole with its rosette, a bridge, frets, pegs.
 *  Returns points along it (t from the tail, w across) for hands and
 *  stands. */
function guitar(k: Sketch, tail: Pt, toward: Pt) {
  const axis = unit(tail, toward);
  const across: Pt = [-axis[1], axis[0]];
  const G = (t: number, w: number): Pt => [tail[0] + axis[0] * t + across[0] * w, tail[1] + axis[1] * t + across[1] * w];
  const width = (t: number) => {
    const x = t / 0.26;
    const bout = (cc: number, r: number) => Math.max(0, 1 - ((x - cc) / r) ** 2);
    return Math.max(0.1 * Math.sqrt(bout(0.33, 0.34)), 0.075 * Math.sqrt(bout(0.76, 0.25)), x > 0.05 && x < 0.95 ? 0.058 : 0);
  };
  const side = Array.from({ length: 25 }, (_, i) => (i / 24) * 0.26);
  const outline: Pt[] = [...side.map((t) => G(t, width(t))), ...side.slice().reverse().map((t) => G(t, -width(t)))];
  const neckShape: Pt[] = [G(0.25, 0.016), G(0.52, 0.013), G(0.52, -0.013), G(0.25, -0.016)];
  const headShape: Pt[] = [G(0.52, 0.013), G(0.6, 0.022), G(0.6, -0.022), G(0.52, -0.013)];
  k.cover(neckShape);
  k.cover(headShape);
  k.cover(outline);
  k.line([...outline, outline[0], outline[1]]);
  const hole = G(0.155, 0);
  k.ring(hole[0], hole[1], 0.026, 0.026, DETAIL);
  k.ring(hole[0], hole[1], 0.034, 0.034, DETAIL * 0.6);
  k.line([G(0.05, -0.03), G(0.05, 0.03)], DETAIL);
  k.line([...neckShape, neckShape[0]]);
  k.line(headShape);
  for (const t of [0.54, 0.57]) for (const w of [0.026, -0.026]) k.dot(G(t, w)[0], G(t, w)[1], 0.004, DETAIL);
  for (const t of [0.32, 0.39, 0.46]) k.line([G(t, 0.014), G(t, -0.014)], DETAIL * 0.7, 0.2);
  k.line([G(0.05, 0), G(0.52, 0)], DETAIL * 0.6, 0.2);
  return G;
}

/** The wizard's hat: a floppy cone on a wide brim, a band, stars. `at` is
 *  the brim's centre. */
function wizardHat(k: Sketch, at: Pt, scale = 1) {
  const P = (u: number, v: number): Pt => [at[0] + (u - 0.43) * scale, at[1] + (v - 0.29) * scale];
  const hat: Pt[] = [P(0.33, 0.29), ...k.bez(P(0.36, 0.28), P(0.39, 0.17), P(0.44, 0.1), P(0.53, 0.07), 10), ...k.bez(P(0.53, 0.07), P(0.49, 0.13), P(0.49, 0.2), P(0.5, 0.28), 8).slice(1), P(0.53, 0.29)];
  k.cover([...hat, P(0.53, 0.3), P(0.33, 0.3)]);
  k.line(hat);
  const brim = k.arc(at[0], at[1], 0.1 * scale, 0.018 * scale, 0, TAU * 1.03, 24);
  k.cover(brim);
  k.line(brim);
  k.line([P(0.37, 0.25), P(0.49, 0.245)], DETAIL);
  k.hatch([P(0.37, 0.25), P(0.49, 0.245), P(0.495, 0.27), P(0.365, 0.275)], 0.9, 0.009 * scale);
  const s = P(0.44, 0.18);
  k.sparkle(s[0], s[1], 0.022 * scale, DETAIL);
  const d = P(0.47, 0.12);
  k.dot(d[0], d[1], 0.006 * scale, DETAIL);
}

/** A climbing hold: a lumpy blob with a bolt, shaded or not. */
function hold(k: Sketch, u: number, v: number, r: number, i: number, weight: number, shade: boolean) {
  const blob: Pt[] = Array.from({ length: 12 }, (_, j) => {
    const a = (j / 12) * TAU;
    const rr = r * (0.8 + 0.3 * Math.sin(a * 3 + i));
    return [u + Math.cos(a) * rr * 1.2, v + Math.sin(a) * rr] as Pt;
  });
  k.cover(blob);
  k.line([...blob, blob[0], blob[1]], weight);
  if (shade) k.hatch(blob.slice(3, 10), 0.8, 0.012);
  k.ring(u - r * 0.1, v - r * 0.1, r * 0.2, r * 0.2, DETAIL);
}

type Scene = (k: Sketch, person: boolean) => void;

const SCENES = {
  // Running: a path, speed lines, a puff of dust. Without the runner: their
  // sneakers, kicked off on the path.
  running: (k, person) => {
    ground(k, 0.08, 0.92, 0.82);
    for (const u of [0.14, 0.52, 0.86]) grass(k, u, 0.82);
    if (!person) {
      sneaker(k, 0.28, 0.82, 0.22, 1);
      sneaker(k, 0.58, 0.8, 0.21, 1, true);
      k.line(k.bez([0.37, 0.72], [0.3, 0.64], [0.24, 0.72], [0.31, 0.76], 8), DETAIL);
      return;
    }
    const hip: Pt = [0.46, 0.55];
    const neck: Pt = [0.53, 0.34];
    figure(k, {
      head: headOn(neck, hip),
      neck,
      hip,
      arms: [[[0.43, 0.45], [0.38, 0.53]], [[0.61, 0.42], [0.67, 0.34]]],
      legs: [[[0.37, 0.67], [0.26, 0.62]], [[0.59, 0.63], [0.64, 0.8]]],
      facing: 1,
    });
    speedLines(k, 0.24, 0.32, 0.46, 1);
    puff(k, 0.2, 0.72, 0.05);
    puff(k, 0.12, 0.77, 0.035);
    k.line([...k.bez([0.66, 0.16], [0.64, 0.19], [0.64, 0.22], [0.66, 0.22], 5), ...k.bez([0.66, 0.22], [0.68, 0.22], [0.68, 0.19], [0.66, 0.16], 5).slice(1)], DETAIL);
  },

  // Surfing: the wave curling behind, the water. Without the surfer: the
  // board floating in front of the wave, its leash trailing.
  surfing: (k, person) => {
    curlingWave(k, [0.3, 0.36], 0.22, 0.86, 0.0);
    waterLine(k, 0.5, 0.98, 0.86, 0.012, 3);
    waterLine(k, 0.56, 0.92, 0.93, 0.01, 2);
    if (!person) {
      const board = surfboard(k, [0.68, 0.82], -0.08, 0.26, 0.04);
      board.draw();
      const tail = board.at(-0.95, 0);
      k.line(k.bez(tail, add(tail, [-0.06, 0.04]), add(tail, [-0.1, -0.02]), add(tail, [-0.16, 0.03]), 10), DETAIL);
      k.line(k.arc(0.68, 0.86, 0.2, 0.02, Math.PI * 0.1, Math.PI * 0.9, 10), DETAIL * 0.7, 0.3);
      return;
    }
    const board = surfboard(k, [0.6, 0.76], -0.14, 0.3, 0.042);
    const hip: Pt = [0.6, 0.5];
    const neck: Pt = [0.63, 0.32];
    figure(k, {
      head: headOn(neck, hip),
      neck,
      hip,
      arms: [[[0.52, 0.36], [0.43, 0.3]], [[0.72, 0.37], [0.82, 0.41]]],
      legs: [[[0.51, 0.61], board.at(-0.4, -1)], [[0.71, 0.58], board.at(0.38, -1)]],
      facing: 1,
      feet: false,
    });
    board.draw();
    // The leash from the tail to the back ankle; spray off the rail.
    const tail = board.at(-0.92, 0);
    const ankle = board.at(-0.4, -1);
    k.line(k.bez(tail, add(tail, [-0.04, -0.06]), add(ankle, [-0.08, -0.02]), add(ankle, [-0.01, -0.02]), 10), DETAIL * 0.8);
    for (const [u, v] of [[0.3, 0.78], [0.26, 0.72], [0.33, 0.7]] as Pt[]) k.dot(u, v, 0.01, DETAIL);
  },

  // Skateboarding: the ground, speed lines. Without the skater: the board
  // with a helmet resting on it.
  skateboarding: (k, person) => {
    ground(k, 0.08, 0.92, 0.86);
    for (const u of [0.3, 0.7]) k.line([[u, 0.86], [u - 0.01, 0.89], [u + 0.008, 0.91]], DETAIL * 0.6, 0.3);
    if (!person) {
      skateboard(k);
      helmet(k, 0.5, 0.75, 0.085);
      return;
    }
    speedLines(k, 0.2, 0.46, 0.7, 1, 3);
    const hip: Pt = [0.5, 0.52];
    const neck: Pt = [0.53, 0.32];
    figure(k, {
      head: headOn(neck, hip),
      neck,
      hip,
      arms: [[[0.43, 0.37], [0.34, 0.33]], [[0.61, 0.4], [0.69, 0.46]]],
      legs: [[[0.44, 0.64], [0.41, 0.745]], [[0.59, 0.63], [0.6, 0.745]]],
      facing: 1,
      feet: false,
    });
    skateboard(k);
  },

  // D&D: the wizard with hat and staff, magic from the other hand, a d20.
  // Without the wizard: the hat and staff left by the die.
  dnd: (k, person) => {
    if (!person) {
      k.line([[0.26, 0.86], [0.36, 0.2]]);
      k.ring(0.365, 0.17, 0.03, 0.03);
      k.line(k.arc(0.365, 0.17, 0.045, 0.045, Math.PI * 1.2, Math.PI * 1.6, 5), DETAIL * 0.7, 0.2);
      wizardHat(k, [0.42, 0.82], 1.3);
      k.prop("d20", 0.6, 0.58, 0.3);
      k.sparkle(0.58, 0.3, 0.03, DETAIL);
      k.sparkle(0.68, 0.4, 0.018, DETAIL);
      return;
    }
    const hip: Pt = [0.42, 0.6];
    const neck: Pt = [0.42, 0.4];
    figure(k, {
      head: [0.42, 0.33],
      neck,
      hip,
      arms: [[[0.35, 0.49], [0.29, 0.45]], [[0.52, 0.4], [0.58, 0.31]]],
      legs: [null, null],
      facing: 1,
      torso: false,
    });
    // Robe from the shoulders to a wavy hem, a sash, a few stars.
    const robe: Pt[] = [[0.4, 0.42], ...k.bez([0.4, 0.42], [0.36, 0.55], [0.33, 0.7], [0.3, 0.82], 10).slice(1), [0.36, 0.84], [0.42, 0.81], [0.48, 0.84], [0.54, 0.82], ...k.bez([0.54, 0.82], [0.5, 0.66], [0.47, 0.54], [0.44, 0.42], 10).slice(1)];
    k.line(robe);
    k.line([[0.42, 0.44], [0.42, 0.8]], DETAIL * 0.8);
    k.line([[0.37, 0.56], [0.47, 0.56]], DETAIL);
    k.line([[0.44, 0.56], [0.46, 0.64], [0.43, 0.66]], DETAIL);
    for (const [u, v] of [[0.36, 0.7], [0.48, 0.74]] as Pt[]) k.sparkle(u, v, 0.012, DETAIL * 0.7);
    k.line([[0.37, 0.845], [0.34, 0.85]]);
    k.line([[0.47, 0.845], [0.51, 0.85]]);
    wizardHat(k, [0.43, 0.29]);
    k.line([[0.29, 0.18], [0.28, 0.86]]);
    k.ring(0.29, 0.15, 0.03, 0.03);
    k.line(k.arc(0.29, 0.15, 0.045, 0.045, Math.PI * 1.2, Math.PI * 1.6, 5), DETAIL * 0.7, 0.2);
    const swirl: Pt[] = Array.from({ length: 26 }, (_, i) => {
      const t = i / 25;
      const a = t * TAU * 1.4;
      const rr = 0.012 + t * 0.05;
      return [0.6 + t * 0.08 + Math.cos(a) * rr * 0.6, 0.28 - t * 0.08 + Math.sin(a) * rr * 0.6] as Pt;
    });
    k.line(swirl, DETAIL);
    k.sparkle(0.72, 0.16, 0.03, DETAIL);
    k.sparkle(0.74, 0.3, 0.02, DETAIL);
    k.prop("d20", 0.6, 0.58, 0.3);
  },

  // Film night: the sofa - back cushions buttoned, a throw over the arm -
  // popcorn beside. Without the watcher: popcorn and the remote on the seat.
  movie: (k, person) => {
    const back: Pt[] = [[0.16, 0.7], ...k.bez([0.15, 0.52], [0.14, 0.42], [0.2, 0.4], [0.3, 0.4], 8), [0.7, 0.4], ...k.bez([0.7, 0.4], [0.8, 0.4], [0.86, 0.42], [0.85, 0.7], 8).slice(1)];
    k.line(back);
    for (const [u0, u1] of [[0.2, 0.49], [0.51, 0.8]]) {
      const cushion: Pt[] = [...k.bez([u0, 0.7], [u0 - 0.01, 0.5], [u0, 0.45], [u0 + 0.05, 0.45], 6), [u1 - 0.05, 0.45], ...k.bez([u1 - 0.05, 0.45], [u1, 0.45], [u1 + 0.01, 0.5], [u1, 0.7], 6).slice(1)];
      k.line(cushion, DETAIL);
      for (const du of [0.33, 0.67]) k.dot(u0 + (u1 - u0) * du, 0.55, 0.006, DETAIL);
    }
    for (const [u0, u1] of [[0.05, 0.19], [0.81, 0.95]]) {
      const arm: Pt[] = [[u0, 0.84], ...k.bez([u0, 0.6], [u0, 0.53], [u1, 0.53], [u1, 0.6], 10), [u1, 0.84]];
      k.line(arm);
    }
    k.line([[0.19, 0.72], [0.81, 0.72]]);
    k.line([[0.19, 0.84], [0.81, 0.84]]);
    k.line([[0.5, 0.72], [0.5, 0.84]], DETAIL);
    k.line([[0.08, 0.84], [0.08, 0.89]], DETAIL);
    k.line([[0.92, 0.84], [0.92, 0.89]], DETAIL);
    const throwShape: Pt[] = [[0.04, 0.56], ...k.bez([0.08, 0.52], [0.16, 0.52], [0.2, 0.56], [0.21, 0.6], 6), [0.19, 0.78], [0.05, 0.8]];
    k.cover(throwShape);
    k.line([...throwShape, throwShape[0]], DETAIL);
    for (const v of [0.64, 0.7]) k.line([[0.05, v], [0.2, v - 0.01]], DETAIL * 0.8, 0.2);
    k.hatch([[0.05, 0.64], [0.2, 0.63], [0.195, 0.69], [0.05, 0.7]], 0.9, 0.012);
    for (let i = 0; i < 6; i++) k.line([[0.06 + i * 0.025, 0.795], [0.058 + i * 0.025, 0.82]], DETAIL * 0.7, 0.2);
    if (!person) {
      k.prop("popcorn", 0.35, 0.43, 0.3);
      const remote: Pt[] = rect(0.6, 0.69, 0.74, 0.72);
      k.cover(remote);
      k.line([...remote, remote[0]]);
      for (const u of [0.63, 0.66, 0.69]) k.dot(u, 0.705, 0.004, DETAIL);
      return;
    }
    const hip: Pt = [0.46, 0.66];
    const neck: Pt = [0.46, 0.45];
    figure(k, {
      head: headOn(neck, hip),
      neck,
      hip,
      arms: [[[0.37, 0.54], [0.45, 0.39]], [[0.56, 0.56], [0.63, 0.6]]],
      legs: [[[0.34, 0.735], [0.35, 0.9]], [[0.58, 0.735], [0.57, 0.9]]],
      facing: 0,
    });
    k.cover([[0.6, 0.54], [0.8, 0.54], [0.78, 0.74], [0.62, 0.74]]);
    k.prop("popcorn", 0.56, 0.44, 0.3);
    k.dot(0.53, 0.26, 0.01, DETAIL);
    k.dot(0.58, 0.3, 0.008, DETAIL);
  },

  // Bouldering: holds with their bolts, the rope through a quickdraw,
  // chalk in the air. The climber from behind, chalk bag at the waist -
  // or, without them, the rope hanging and the chalk bag on a hold.
  climbing: (k, person) => {
    const holds: Pt[] = [[0.64, 0.13], [0.32, 0.27], [0.63, 0.75], [0.42, 0.79], [0.2, 0.5], [0.8, 0.44], [0.78, 0.9], [0.15, 0.14], [0.86, 0.18]];
    for (const [i, [u, v]] of holds.entries()) hold(k, u, v, k.r.range(0.028, 0.04), i, i < 4 ? 1 : DETAIL, i % 2 === 0);
    k.line(k.arc(0.52, 0.07, 0.012, 0.02, 0, TAU * 1.02, 10), DETAIL);
    k.line([[0.515, 0.09], [0.515, 0.13], [0.525, 0.13], [0.525, 0.09]], DETAIL);
    k.line(k.arc(0.52, 0.15, 0.012, 0.02, 0, TAU * 1.02, 10), DETAIL);
    if (!person) {
      k.line(k.bez([0.52, 0.02], [0.52, 0.4], [0.5, 0.7], [0.54, 0.95], 16), DETAIL * 0.8, 0.6);
      const bag: Pt[] = [[0.74, 0.5], [0.84, 0.5], [0.85, 0.58], [0.83, 0.6], [0.75, 0.6], [0.73, 0.58]];
      k.line([[0.8, 0.44], [0.78, 0.5]], DETAIL);
      k.cover(bag);
      k.line([...bag, bag[0]]);
      k.hatch(bag, 0.9, 0.012);
      k.line(k.arc(0.79, 0.5, 0.05, 0.012, 0, TAU, 12), DETAIL);
      puff(k, 0.8, 0.36, 0.03);
      return;
    }
    k.line([[0.52, 0.02], [0.52, 0.52]], DETAIL * 0.8, 0.6);
    const hip: Pt = [0.52, 0.56];
    const neck: Pt = [0.5, 0.36];
    figure(k, {
      head: headOn(neck, hip),
      neck,
      hip,
      arms: [[[0.38, 0.37], [0.33, 0.29]], [[0.6, 0.26], [0.63, 0.15]]],
      legs: [[[0.38, 0.64], [0.42, 0.77]], [[0.65, 0.6], [0.63, 0.73]]],
      facing: null,
      feet: false,
    });
    const bag: Pt[] = [[0.55, 0.57], [0.6, 0.57], [0.605, 0.63], [0.59, 0.645], [0.56, 0.645], [0.545, 0.63]];
    k.cover(bag);
    k.line([...bag, bag[0]], DETAIL);
    k.hatch(bag, 0.9, 0.01);
    puff(k, 0.74, 0.1, 0.04);
  },

  // Yoga: the mat, its end rolled, sparkles. The tree pose - or, without
  // the person, a block on the mat.
  yoga: (k, person) => {
    const mat: Pt[] = rect(0.22, 0.82, 0.8, 0.86);
    k.line([...mat, mat[0]]);
    k.hatch(mat, 0.4, 0.03);
    k.ring(0.21, 0.84, 0.025, 0.028);
    k.ring(0.21, 0.84, 0.012, 0.014, DETAIL);
    k.sparkle(0.24, 0.26, 0.03, DETAIL);
    k.sparkle(0.78, 0.4, 0.022, DETAIL);
    if (!person) {
      const block: Pt[] = rect(0.42, 0.72, 0.56, 0.81);
      k.cover([...block, [0.58, 0.7], [0.44, 0.7]]);
      k.line([...block, block[0]]);
      k.line([[0.42, 0.72], [0.44, 0.7], [0.58, 0.7], [0.56, 0.72]], DETAIL);
      k.line([[0.58, 0.7], [0.58, 0.79], [0.56, 0.81]], DETAIL);
      k.hatch([[0.56, 0.72], [0.58, 0.7], [0.58, 0.79], [0.56, 0.81]], 1.3, 0.008);
      return;
    }
    const hip: Pt = [0.5, 0.55];
    const neck: Pt = [0.5, 0.35];
    figure(k, {
      head: headOn(neck, hip),
      neck,
      hip,
      arms: [[[0.39, 0.25], [0.49, 0.1]], [[0.61, 0.25], [0.51, 0.1]]],
      legs: [[[0.5, 0.68], [0.5, 0.815]], [[0.64, 0.64], [0.52, 0.67]]],
      facing: 0,
      feet: false,
    });
    k.line([[0.5, 0.815], [0.46, 0.818]]);
  },

  // Cycling: the ground, speed lines, the bike - ridden, or parked on its
  // stand with the helmet on the bars.
  cycling: (k, person) => {
    ground(k, 0.06, 0.94, 0.87);
    if (!person) {
      bicycle(k);
      k.line([[0.48, 0.72], [0.54, 0.87]]);
      helmet(k, 0.6, 0.42, 0.06);
      return;
    }
    speedLines(k, 0.12, 0.44, 0.62, 1, 3);
    bicycle(k);
    const hip: Pt = [0.43, 0.47];
    const neck: Pt = [0.55, 0.3];
    figure(k, {
      head: headOn(neck, hip),
      neck,
      hip,
      arms: [[[0.6, 0.38], [0.62, 0.43]]],
      legs: [[[0.52, 0.55], [0.5, 0.78]], [[0.5, 0.6], [0.44, 0.67]]],
      facing: 1,
      feet: false,
    });
  },

  // Swimming: the water, splashes, bubbles. The swimmer's arm coming over
  // and head turned up to breathe - or, without them, goggles floating.
  swimming: (k, person) => {
    waterLine(k, 0.04, 0.96, 0.62, 0.016, 5, 1);
    waterLine(k, 0.1, 0.9, 0.72, 0.012, 4);
    waterLine(k, 0.2, 0.8, 0.8, 0.01, 3);
    if (!person) {
      goggles(k, 0.5, 0.6, 0.12);
      for (const [u, v, r] of [[0.7, 0.66, 0.012], [0.74, 0.7, 0.009], [0.3, 0.68, 0.01]] as Array<[number, number, number]>) k.ring(u, v, r, r, DETAIL);
      return;
    }
    k.line([[0.66, 0.66], [0.44, 0.68], [0.24, 0.66], [0.12, 0.64]], DETAIL * 0.7, 0.6);
    tube(k, limb([0.6, 0.63], [0.5, 0.32], [0.79, 0.39]), 0.042, 0.032, { startCap: true, cuffAt: -1 });
    hand(k, [0.79, 0.39], [0.5, 0.32]);
    head(k, [0.72, 0.56], HEAD, 1, unit([0, 0], [0.55, -1]));
    k.ring(0.765, 0.545, 0.018, 0.014, DETAIL);
    k.line([[0.748, 0.545], [0.68, 0.53]], DETAIL, 0.2);
    splash(k, 0.84, 0.44, 0.1);
    splash(k, 0.14, 0.6, 0.12);
    for (const [u, v, r] of [[0.9, 0.58, 0.014], [0.93, 0.52, 0.01], [0.3, 0.75, 0.01], [0.34, 0.7, 0.008]] as Array<[number, number, number]>) k.ring(u, v, r, r, DETAIL);
  },

  // Guitar: music notes rising; the guitar played - or on its stand.
  guitar: (k, person) => {
    k.prop("music", 0.64, 0.1, 0.3);
    if (!person) {
      const G = guitar(k, [0.46, 0.84], [0.44, 0.1]);
      k.line([[0.4, 0.88], [0.44, 0.74], [0.48, 0.88]], DETAIL);
      k.line([G(0.36, 0.03), [0.44, 0.74]], DETAIL);
      k.line([[0.36, 0.88], [0.54, 0.88]], DETAIL * 0.7);
      return;
    }
    const hip: Pt = [0.44, 0.6];
    const neck: Pt = [0.44, 0.38];
    figure(k, {
      head: headOn(neck, hip),
      neck,
      hip,
      arms: [null, [[0.62, 0.48], [0.56, 0.6]]],
      legs: [[[0.4, 0.72], [0.38, 0.87]], [[0.5, 0.72], [0.52, 0.87]]],
      facing: 1,
    });
    const G = guitar(k, [0.63, 0.69], [0.14, 0.37]);
    k.line(limb([0.44, 0.41], [0.34, 0.5], G(0.44, 0.02)));
  },

  // Walking the dog: the ground, a few tufts of grass, the dog with its
  // patches and collar, tail wagging - on the leash, or waiting with it
  // trailing.
  dogwalk: (k, person) => {
    ground(k, 0.06, 0.94, 0.84);
    for (const u of [0.12, 0.56, 0.92]) grass(k, u, 0.84);
    if (person) {
      const hip: Pt = [0.34, 0.55];
      const neck: Pt = [0.36, 0.35];
      figure(k, {
        head: headOn(neck, hip),
        neck,
        hip,
        arms: [[[0.29, 0.45], [0.26, 0.53]], [[0.42, 0.45], [0.48, 0.5]]],
        legs: [[[0.3, 0.67], [0.25, 0.81]], [[0.4, 0.67], [0.43, 0.81]]],
        facing: 1,
      });
    }
    const body = k.arc(0.72, 0.7, 0.12, 0.055, 0, TAU, 30);
    k.cover(body);
    k.line([...body, body[1]]);
    for (const [u, v, ru, rv] of [[0.7, 0.68, 0.035, 0.022], [0.79, 0.715, 0.022, 0.016]] as Array<[number, number, number, number]>) {
      const patch = k.arc(u, v, ru, rv, 0, TAU, 14, 0.2);
      k.line([...patch, patch[1]], DETAIL);
      k.hatch(patch, 0.9, 0.011);
    }
    k.line([[0.83, 0.7], [0.845, 0.715], [0.835, 0.73], [0.85, 0.745]], DETAIL, 0.2);
    for (const u of [0.64, 0.68, 0.76, 0.8]) {
      const x = u + k.r.range(-0.006, 0.006);
      k.line([[u, 0.745], [x, 0.825]]);
      k.line([[x - 0.004, 0.83], [x + 0.018, 0.83]], DETAIL);
    }
    const headShape: Pt[] = [...k.arc(0.85, 0.6, 0.05, 0.047, Math.PI * 0.6, Math.PI * 2.05, 18), [0.935, 0.615], [0.94, 0.645], [0.89, 0.65]];
    k.cover(headShape);
    k.line([...headShape, headShape[0]]);
    k.dot(0.935, 0.63, 0.008);
    k.dot(0.865, 0.59, 0.006, DETAIL);
    const ear: Pt[] = [[0.82, 0.57], ...k.bez([0.8, 0.58], [0.78, 0.62], [0.79, 0.66], [0.82, 0.66], 8), [0.83, 0.6]];
    k.line(ear, DETAIL);
    k.hatch(ear, 1.2, 0.012);
    k.line(k.bez([0.6, 0.68], [0.56, 0.64], [0.55, 0.58], [0.57, 0.55], 8));
    k.line(k.arc(0.56, 0.6, 0.05, 0.05, Math.PI * 1.05, Math.PI * 1.35, 5), DETAIL, 0.2);
    k.line(k.arc(0.56, 0.6, 0.07, 0.07, Math.PI * 1.05, Math.PI * 1.35, 5), DETAIL, 0.2);
    if (person) k.line(k.bez([0.48, 0.5], [0.58, 0.64], [0.7, 0.66], [0.81, 0.63], 16), DETAIL);
    else {
      // The leash trailing from the collar to a loop on the ground; the dog
      // waiting, tongue out.
      k.line(k.bez([0.81, 0.63], [0.7, 0.9], [0.5, 0.8], [0.4, 0.83], 16), DETAIL);
      k.line(k.arc(0.36, 0.83, 0.04, 0.012, 0, TAU * 1.02, 12), DETAIL);
      k.line([[0.915, 0.645], [0.92, 0.67], [0.93, 0.672], [0.93, 0.648]], DETAIL, 0.2);
    }
    k.line(k.arc(0.815, 0.635, 0.022, 0.034, Math.PI * 0.35, Math.PI * 1.35, 8));
    k.ring(0.822, 0.675, 0.008, 0.008, DETAIL);
  },

  // Reading: the armchair, piped and buttoned, a side table with a mug.
  // The reader curled up with the book and a heart floating up - or the cat
  // asleep in the chair and the book left open on its arm.
  reading: (k, person) => {
    ground(k, 0.04, 0.96, 0.86);
    k.line([...k.bez([0.3, 0.64], [0.2, 0.62], [0.12, 0.44], [0.16, 0.3], 10), ...k.bez([0.16, 0.3], [0.2, 0.2], [0.3, 0.22], [0.3, 0.32], 8).slice(1), [0.31, 0.6]]);
    k.line(k.bez([0.28, 0.6], [0.2, 0.58], [0.15, 0.44], [0.18, 0.33], 8), DETAIL * 0.7);
    for (const [u, v] of [[0.21, 0.36], [0.2, 0.46], [0.23, 0.54]] as Pt[]) k.dot(u, v, 0.005, DETAIL);
    k.line([[0.2, 0.66], [0.66, 0.66], [0.68, 0.72], [0.2, 0.72]]);
    k.line([[0.24, 0.72], [0.23, 0.85]]);
    k.line([[0.63, 0.72], [0.64, 0.85]]);
    if (person) {
      const hip: Pt = [0.37, 0.61];
      const neck: Pt = [0.33, 0.41];
      figure(k, {
        head: headOn(neck, hip),
        neck,
        hip,
        arms: [[[0.44, 0.52], [0.52, 0.44]], [[0.47, 0.54], [0.55, 0.46]]],
        legs: [[[0.58, 0.62], [0.6, 0.83]], [[0.6, 0.56], [0.73, 0.7]]],
        facing: 1,
      });
    } else sleepingCat(k, 0.36, 0.52, 0.1);
    const arm: Pt[] = [[0.26, 0.66], ...k.bez([0.26, 0.58], [0.3, 0.56], [0.36, 0.56], [0.52, 0.56], 6), ...k.bez([0.52, 0.56], [0.58, 0.56], [0.58, 0.64], [0.52, 0.64], 6).slice(1), [0.52, 0.66]];
    k.cover([...arm, [0.26, 0.66]]);
    k.line(arm);
    k.line([[0.3, 0.6], [0.5, 0.6]], DETAIL * 0.6, 0.2);
    if (person) {
      const book: Pt[] = [[0.49, 0.47], [0.52, 0.33], [0.6, 0.3], [0.62, 0.42]];
      k.cover(book);
      k.line([[0.49, 0.47], [0.52, 0.33], [0.56, 0.34], [0.6, 0.3], [0.62, 0.42], [0.56, 0.45], [0.49, 0.47]]);
      k.line([[0.56, 0.34], [0.56, 0.45]], DETAIL);
      for (const v of [0.37, 0.4]) k.line([[0.575, v - 0.01], [0.605, v - 0.02]], DETAIL * 0.7, 0.2);
      k.prop("heart", 0.6, 0.12, 0.13);
    } else {
      // The book left open, face down over the arm of the chair.
      const book: Pt[] = [[0.46, 0.565], [0.52, 0.5], [0.58, 0.565]];
      k.cover([...book, [0.58, 0.57], [0.46, 0.57]]);
      k.line(book);
      k.line([[0.46, 0.565], [0.58, 0.565]], DETAIL);
      k.line([[0.52, 0.5], [0.52, 0.565]], DETAIL * 0.7);
      k.hatch([[0.47, 0.56], [0.52, 0.505], [0.57, 0.56]], 0.9, 0.012);
    }
    k.line([[0.76, 0.6], [0.94, 0.6]]);
    k.line([[0.85, 0.6], [0.85, 0.85]]);
    k.line([[0.8, 0.85], [0.9, 0.85]]);
    k.prop("cup", 0.77, 0.43, 0.17);
  },
} satisfies Record<string, Scene>;

export type ActivityName = keyof typeof SCENES;
export const ACTIVITY_NAMES = Object.keys(SCENES) as ActivityName[];

export type ActivityOptions = {
  /** Draw the person doing it; without, the scene is a still life of its
   *  things (Andrew, 2026-09-24: a version without the figure "for all"). */
  person?: boolean;
  /** Which person: "full" (clothes, hair, a face), "stick" or "bean". */
  figure?: FigureStyle;
};

/** An activity's strokes, and its solid shapes back to front - for styles
 *  that fill them - in an s x s box at (x, y). */
export function activityDrawing(name: ActivityName, x: number, y: number, s: number, seed: number, { person = true, figure = "full" }: ActivityOptions = {}) {
  const k = new Sketch(x, y, s, makeRng(seed * 7919 + name.length * 31), seed);
  figureStyle = figure;
  try {
    SCENES[name](k, person);
  } finally {
    figureStyle = "full";
  }
  return { strokes: k.out, solids: k.solids };
}

/** An activity, stroke by stroke with each stroke's weight, in an s x s box at (x, y). */
export function activity(name: ActivityName, x: number, y: number, s: number, seed: number, options: ActivityOptions = {}): DoodleStroke[] {
  return activityDrawing(name, x, y, s, seed, options).strokes;
}
