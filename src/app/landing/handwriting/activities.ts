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

type Scene = (k: Sketch) => void;

const SCENES = {
  running: (k) => {
    const hip: Pt = [0.46, 0.55];
    const neck: Pt = [0.53, 0.34];
    ground(k, 0.1, 0.9, 0.82);
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
    // A drop of effort.
    k.line([...k.bez([0.66, 0.16], [0.64, 0.19], [0.64, 0.22], [0.66, 0.22], 5), ...k.bez([0.66, 0.22], [0.68, 0.22], [0.68, 0.19], [0.66, 0.16], 5).slice(1)], DETAIL);
  },

  surfing: (k) => {
    // The wave curling behind, its barrel shaded; the water under the board.
    const crest: Pt[] = [...k.bez([0.02, 0.86], [0.04, 0.56], [0.08, 0.26], [0.24, 0.18], 14), ...k.bez([0.24, 0.18], [0.36, 0.14], [0.4, 0.28], [0.32, 0.33], 10).slice(1), ...k.bez([0.32, 0.33], [0.26, 0.36], [0.2, 0.3], [0.25, 0.26], 8).slice(1)];
    k.line(crest);
    k.line(k.bez([0.32, 0.33], [0.3, 0.5], [0.34, 0.66], [0.42, 0.8], 12), DETAIL);
    k.hatch([[0.1, 0.42], [0.2, 0.3], [0.3, 0.36], [0.32, 0.6], [0.36, 0.78], [0.12, 0.8]], -0.75, 0.045);
    k.line(k.bez([0.06, 0.62], [0.1, 0.5], [0.14, 0.42], [0.2, 0.38], 8), DETAIL);
    for (const [u, v] of [[0.28, 0.12], [0.34, 0.1], [0.4, 0.16], [0.42, 0.1]] as Pt[]) k.dot(u, v, 0.009, DETAIL);
    waterLine(k, 0.36, 0.98, 0.86, 0.012, 4);
    waterLine(k, 0.5, 0.92, 0.93, 0.01, 3);
    // The board: nose up to the right; the surfer crouched on it, arms out.
    const c: Pt = [0.6, 0.76];
    const ang = -0.14;
    const [dx, dy] = [Math.cos(ang), Math.sin(ang)];
    const L = 0.3;
    const W = 0.042;
    const at = (t: number, side: number): Pt => [c[0] + dx * t * L + dy * -side * W, c[1] + dy * t * L - dx * -side * W];
    const boardShape: Pt[] = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * TAU;
      const t = Math.cos(a);
      const w = Math.sin(a) * (1 - 0.5 * Math.max(0, t) ** 3);
      return at(t, w);
    });
    const hip: Pt = [0.6, 0.5];
    const neck: Pt = [0.63, 0.32];
    figure(k, {
      head: headOn(neck, hip),
      neck,
      hip,
      arms: [[[0.52, 0.36], [0.43, 0.3]], [[0.72, 0.37], [0.82, 0.41]]],
      legs: [[[0.51, 0.61], at(-0.4, -1)], [[0.71, 0.58], at(0.38, -1)]],
      facing: 1,
      feet: false,
    });
    k.cover(boardShape);
    k.line([...boardShape, boardShape[0]]);
    k.line([at(-0.8, 0), at(0.78, 0)], DETAIL);
    k.line([at(-0.72, 1), add(at(-0.8, 1), [0.01, 0.05]), at(-0.62, 1)], DETAIL);
    for (const [u, v] of [[0.3, 0.78], [0.26, 0.72], [0.33, 0.7]] as Pt[]) k.dot(u, v, 0.01, DETAIL);
  },

  skateboarding: (k) => {
    ground(k, 0.08, 0.92, 0.86);
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
    // The deck with its kicked-up tail and nose, trucks and wheels.
    const deck: Pt[] = [...k.bez([0.26, 0.72], [0.28, 0.75], [0.3, 0.755], [0.34, 0.755], 6), [0.66, 0.755], ...k.bez([0.66, 0.755], [0.7, 0.755], [0.72, 0.75], [0.74, 0.72], 6).slice(1)];
    k.cover([...deck, [0.74, 0.74], [0.26, 0.74]]);
    k.line(deck);
    k.line([[0.3, 0.77], [0.7, 0.77]], DETAIL);
    for (const u of [0.37, 0.63]) {
      k.line([[u - 0.02, 0.775], [u, 0.79], [u + 0.02, 0.775]], DETAIL);
      k.ring(u, 0.815, 0.025, 0.025);
      k.dot(u, 0.815, 0.006, DETAIL);
    }
  },

  // D&D: the week's wizard, hat and staff, a d20 at their feet.
  dnd: (k) => {
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
    // Robe from the shoulders to a wavy hem, feet peeking out.
    const robe: Pt[] = [[0.4, 0.42], ...k.bez([0.4, 0.42], [0.36, 0.55], [0.33, 0.7], [0.3, 0.82], 10).slice(1), [0.36, 0.84], [0.42, 0.81], [0.48, 0.84], [0.54, 0.82], ...k.bez([0.54, 0.82], [0.5, 0.66], [0.47, 0.54], [0.44, 0.42], 10).slice(1)];
    k.line(robe);
    k.line([[0.42, 0.44], [0.42, 0.8]], DETAIL * 0.8);
    k.line([[0.37, 0.845], [0.34, 0.85]]);
    k.line([[0.47, 0.845], [0.51, 0.85]]);
    // The hat hides the top of the head.
    const hat: Pt[] = [[0.33, 0.29], ...k.bez([0.36, 0.28], [0.39, 0.17], [0.44, 0.1], [0.53, 0.07], 10), ...k.bez([0.53, 0.07], [0.49, 0.13], [0.49, 0.2], [0.5, 0.28], 8).slice(1), [0.53, 0.29]];
    k.cover([...hat, [0.53, 0.3], [0.33, 0.3]]);
    k.line(hat);
    k.line(k.arc(0.43, 0.29, 0.1, 0.018, 0, TAU * 1.03, 24));
    k.sparkle(0.44, 0.19, 0.022, DETAIL);
    k.dot(0.47, 0.13, 0.006, DETAIL);
    // The staff, its orb, and magic from the other hand.
    k.line([[0.29, 0.18], [0.28, 0.86]]);
    k.ring(0.29, 0.15, 0.03, 0.03);
    k.sparkle(0.64, 0.24, 0.035, DETAIL);
    k.sparkle(0.7, 0.32, 0.02, DETAIL);
    k.dot(0.66, 0.34, 0.006, DETAIL);
    k.prop("d20", 0.6, 0.58, 0.3);
  },

  // Film night on the sofa, from the front: popcorn beside, a hand to the mouth.
  movie: (k) => {
    const back: Pt[] = [[0.16, 0.7], ...k.bez([0.15, 0.52], [0.14, 0.42], [0.2, 0.4], [0.3, 0.4], 8), [0.7, 0.4], ...k.bez([0.7, 0.4], [0.8, 0.4], [0.86, 0.42], [0.85, 0.7], 8).slice(1)];
    k.line(back);
    k.line([[0.5, 0.44], [0.5, 0.7]], DETAIL);
    for (const [u0, u1] of [[0.05, 0.19], [0.81, 0.95]]) {
      const arm: Pt[] = [[u0, 0.84], ...k.bez([u0, 0.6], [u0, 0.53], [u1, 0.53], [u1, 0.6], 10), [u1, 0.84]];
      k.line(arm);
    }
    k.line([[0.19, 0.72], [0.81, 0.72]]);
    k.line([[0.19, 0.84], [0.81, 0.84]]);
    k.line([[0.08, 0.84], [0.08, 0.89]], DETAIL);
    k.line([[0.92, 0.84], [0.92, 0.89]], DETAIL);
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

  // Bouldering, from behind: reaching for the next hold, chalk in the air.
  climbing: (k) => {
    const holds: Pt[] = [[0.64, 0.13], [0.32, 0.27], [0.63, 0.75], [0.42, 0.79], [0.2, 0.5], [0.8, 0.44], [0.78, 0.9], [0.15, 0.14], [0.86, 0.18]];
    for (const [i, [u, v]] of holds.entries()) {
      const r = k.r.range(0.028, 0.04);
      const blob: Pt[] = Array.from({ length: 12 }, (_, j) => {
        const a = (j / 12) * TAU;
        const rr = r * (0.8 + 0.3 * Math.sin(a * 3 + i));
        return [u + Math.cos(a) * rr * 1.2, v + Math.sin(a) * rr] as Pt;
      });
      k.line([...blob, blob[0], blob[1]], i < 4 ? 1 : DETAIL);
      if (i % 2 === 0) k.hatch(blob, 0.8, 0.014);
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
    puff(k, 0.74, 0.1, 0.04);
  },

  // Yoga: tree pose on a mat.
  yoga: (k) => {
    const mat: Pt[] = rect(0.2, 0.82, 0.8, 0.86);
    k.line([...mat, mat[0]]);
    k.hatch(mat, 0.4, 0.03);
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
    k.sparkle(0.24, 0.26, 0.03, DETAIL);
    k.sparkle(0.78, 0.4, 0.022, DETAIL);
  },

  cycling: (k) => {
    ground(k, 0.06, 0.94, 0.87);
    speedLines(k, 0.12, 0.44, 0.62, 1, 3);
    const back: Pt = [0.28, 0.72];
    const front: Pt = [0.74, 0.72];
    for (const w of [back, front]) {
      k.ring(w[0], w[1], 0.14, 0.14);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI + k.r.range(0, 0.3);
        k.line([[w[0] - Math.cos(a) * 0.12, w[1] - Math.sin(a) * 0.12], [w[0] + Math.cos(a) * 0.12, w[1] + Math.sin(a) * 0.12]], DETAIL * 0.7, 0.2);
      }
    }
    const crank: Pt = [0.48, 0.72];
    const head: Pt = [0.67, 0.49];
    k.line([back, crank, [0.44, 0.52]]);
    k.line([back, [0.44, 0.52], head, crank]);
    k.line([head, front]);
    k.line([[0.39, 0.495], [0.47, 0.495]]);
    k.line([head, [0.66, 0.43], [0.61, 0.42]]);
    k.ring(crank[0], crank[1], 0.022, 0.022, DETAIL);
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

  // Front crawl: the head turned to breathe, an arm coming over, splashes.
  swimming: (k) => {
    waterLine(k, 0.04, 0.96, 0.62, 0.016, 5, 1);
    waterLine(k, 0.1, 0.9, 0.72, 0.012, 4);
    waterLine(k, 0.2, 0.8, 0.8, 0.01, 3);
    k.line([[0.66, 0.66], [0.44, 0.68], [0.24, 0.66], [0.12, 0.64]], DETAIL * 0.7, 0.6);
    // The arm coming over, then the head turned up to breathe - the same
    // head as everywhere, goggles on.
    tube(k, limb([0.6, 0.63], [0.5, 0.32], [0.79, 0.39]), 0.042, 0.032, { startCap: true, cuffAt: -1 });
    hand(k, [0.79, 0.39], [0.5, 0.32]);
    const up = unit([0, 0], [0.55, -1]);
    head(k, [0.72, 0.56], HEAD, 1, up);
    k.ring(0.765, 0.545, 0.018, 0.014, DETAIL);
    k.line([[0.748, 0.545], [0.68, 0.53]], DETAIL, 0.2);
    for (const [u, v] of [[0.84, 0.36], [0.88, 0.42], [0.82, 0.3], [0.14, 0.56], [0.1, 0.5], [0.18, 0.52]] as Pt[]) k.dot(u, v, 0.01, DETAIL);
    k.line(k.arc(0.14, 0.6, 0.06, 0.04, Math.PI * 1.1, Math.PI * 1.9, 8), DETAIL);
    k.ring(0.9, 0.52, 0.014, 0.014, DETAIL);
    k.ring(0.93, 0.46, 0.01, 0.01, DETAIL);
  },

  guitar: (k) => {
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
    // The guitar across the body: two bouts, a sound hole, the neck to the left.
    const tail: Pt = [0.63, 0.69];
    const axis = unit(tail, [0.14, 0.37]);
    const across: Pt = [-axis[1], axis[0]];
    const G = (t: number, w: number): Pt => [tail[0] + axis[0] * t + across[0] * w, tail[1] + axis[1] * t + across[1] * w];
    const width = (t: number) => {
      const x = t / 0.26;
      const bout = (c: number, r: number) => Math.max(0, 1 - ((x - c) / r) ** 2);
      return Math.max(0.1 * Math.sqrt(bout(0.33, 0.34)), 0.075 * Math.sqrt(bout(0.76, 0.25)), x > 0.05 && x < 0.95 ? 0.058 : 0);
    };
    const side = Array.from({ length: 25 }, (_, i) => (i / 24) * 0.26);
    const bodyOutline: Pt[] = [...side.map((t) => G(t, width(t))), ...side.slice().reverse().map((t) => G(t, -width(t)))];
    k.cover(bodyOutline);
    k.line([...bodyOutline, bodyOutline[0], bodyOutline[1]]);
    const hole = G(0.155, 0);
    k.ring(hole[0], hole[1], 0.026, 0.026, DETAIL);
    k.line([G(0.05, -0.03), G(0.05, 0.03)], DETAIL);
    const neckShape: Pt[] = [G(0.25, 0.016), G(0.52, 0.013), G(0.52, -0.013), G(0.25, -0.016)];
    k.line([...neckShape, neckShape[0]]);
    k.line([G(0.52, 0.013), G(0.6, 0.022), G(0.6, -0.022), G(0.52, -0.013)]);
    for (const t of [0.32, 0.39, 0.46]) k.line([G(t, 0.014), G(t, -0.014)], DETAIL * 0.7, 0.2);
    k.line([G(0.05, 0), G(0.52, 0)], DETAIL * 0.6, 0.2);
    k.line(limb([0.44, 0.41], [0.34, 0.5], G(0.44, 0.02)));
    k.prop("music", 0.64, 0.1, 0.3);
  },

  // Walking the dog: a leash, a wagging tail.
  dogwalk: (k) => {
    ground(k, 0.06, 0.94, 0.84);
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
    // The dog: a long low body, a big head with a snout and a floppy ear,
    // short legs, its tail up and wagging.
    const body = k.arc(0.72, 0.7, 0.12, 0.055, 0, TAU, 30);
    k.cover(body);
    k.line([...body, body[1]]);
    // Patches on its coat, a tuft of fur on its chest, paws.
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
    const headC: Pt = [0.85, 0.6];
    const headShape: Pt[] = [...k.arc(headC[0], headC[1], 0.05, 0.047, Math.PI * 0.6, Math.PI * 2.05, 18), [0.935, 0.615], [0.94, 0.645], [0.89, 0.65]];
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
    // The leash, sagging from hand to collar.
    k.line(k.bez([0.48, 0.5], [0.58, 0.64], [0.7, 0.66], [0.81, 0.63], 16), DETAIL);
    // The collar, with a tag.
    k.line(k.arc(0.815, 0.635, 0.022, 0.034, Math.PI * 0.35, Math.PI * 1.35, 8));
    k.ring(0.822, 0.675, 0.008, 0.008, DETAIL);
  },

  // Reading in an armchair, legs crossed, book up, a mug on the side table.
  reading: (k) => {
    ground(k, 0.04, 0.96, 0.86);
    // The chair's back and seat, behind the reader.
    k.line([...k.bez([0.3, 0.64], [0.2, 0.62], [0.12, 0.44], [0.16, 0.3], 10), ...k.bez([0.16, 0.3], [0.2, 0.2], [0.3, 0.22], [0.3, 0.32], 8).slice(1), [0.31, 0.6]]);
    k.line([[0.2, 0.66], [0.66, 0.66], [0.68, 0.72], [0.2, 0.72]]);
    k.line([[0.24, 0.72], [0.23, 0.85]]);
    k.line([[0.63, 0.72], [0.64, 0.85]]);
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
    // The arm of the chair, in front.
    const arm: Pt[] = [[0.26, 0.66], ...k.bez([0.26, 0.58], [0.3, 0.56], [0.36, 0.56], [0.52, 0.56], 6), ...k.bez([0.52, 0.56], [0.58, 0.56], [0.58, 0.64], [0.52, 0.64], 6).slice(1), [0.52, 0.66]];
    k.cover([...arm, [0.26, 0.66]]);
    k.line(arm);
    // The open book, held up.
    const book: Pt[] = [[0.49, 0.47], [0.52, 0.33], [0.6, 0.3], [0.62, 0.42]];
    k.cover(book);
    k.line([[0.49, 0.47], [0.52, 0.33], [0.56, 0.34], [0.6, 0.3], [0.62, 0.42], [0.56, 0.45], [0.49, 0.47]]);
    k.line([[0.56, 0.34], [0.56, 0.45]], DETAIL);
    for (const v of [0.37, 0.4]) k.line([[0.575, v - 0.01], [0.605, v - 0.02]], DETAIL * 0.7, 0.2);
    // A side table with a mug, and a heart floating up from the story.
    k.line([[0.76, 0.6], [0.94, 0.6]]);
    k.line([[0.85, 0.6], [0.85, 0.85]]);
    k.line([[0.8, 0.85], [0.9, 0.85]]);
    k.prop("cup", 0.77, 0.43, 0.17);
    k.prop("heart", 0.6, 0.12, 0.13);
  },
} satisfies Record<string, Scene>;

export type ActivityName = keyof typeof SCENES;
export const ACTIVITY_NAMES = Object.keys(SCENES) as ActivityName[];

/** An activity, stroke by stroke with each stroke's weight, in an s x s box at (x, y). */
export function activity(name: ActivityName, x: number, y: number, s: number, seed: number): DoodleStroke[] {
  const k = new Sketch(x, y, s, makeRng(seed * 7919 + name.length * 31), seed);
  SCENES[name](k);
  return k.out;
}
