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
  /** [elbow, hand] for each arm; null for an arm hidden or drawn apart. */
  arms: Array<[Pt, Pt] | null>;
  /** [knee, foot] for each leg. */
  legs: Array<[Pt, Pt] | null>;
  /** Which way the face looks: 1 right, -1 left, 0 at us, null from behind. */
  facing: 1 | -1 | 0 | null;
  /** Draw the torso (a robe or a sofa may stand in for it). */
  torso?: boolean;
  /** Short strokes for feet, pointing the way the figure faces. */
  feet?: boolean;
  headR?: number;
};

const HEAD = 0.062;

/**
 * The figure. Limbs, then torso, then the head - which hides what is behind
 * it - with its curl of hair and, unless seen from behind, a face.
 */
function figure(k: Sketch, p: Pose) {
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
  k.cover(circle(p.head, r * 1.05));
  k.ring(p.head[0], p.head[1], r, r * 1.02);
  // The same curl of hair on every drawing: this is one person's week.
  const up = unit(p.neck, p.head);
  const top = add(p.head, [up[0] * r, up[1] * r]);
  const back: Pt = [-(facing || 0.4) * r * 0.5, 0];
  k.line(k.bez(add(top, [back[0] * 0.2, 0]), add(top, [back[0] * 0.6 + up[0] * r * 0.5, up[1] * r * 0.5]), add(top, [back[0] * 1.6 + up[0] * r * 0.7, up[1] * r * 0.3]), add(top, [back[0] * 1.3, up[1] * -0.1 * r]), 8), DETAIL);
  if (p.facing === null) return;
  // The face, turned the way it looks: eyes and a smile.
  const f = facing;
  const eyes: Pt[] = f === 0 ? [[-0.32, -0.12], [0.32, -0.12]] : [[f * 0.42, -0.14]];
  for (const [ex, ey] of eyes) k.dot(p.head[0] + ex * r, p.head[1] + ey * r, r * 0.13, DETAIL);
  const sc: Pt = [p.head[0] + f * 0.4 * r, p.head[1] + 0.28 * r];
  k.line(k.arc(sc[0], sc[1], r * 0.28, r * 0.2, Math.PI * 0.15, Math.PI * 0.85, 8), DETAIL, 0.3);
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
    const head: Pt = [0.72, 0.56];
    k.cover(circle(head, 0.065));
    k.ring(head[0], head[1], 0.062, 0.062);
    k.line(k.arc(head[0], head[1], 0.064, 0.064, Math.PI * 1.05, Math.PI * 1.55, 10), DETAIL);
    k.ring(0.76, 0.545, 0.016, 0.012, DETAIL);
    k.line(k.arc(0.75, 0.585, 0.02, 0.014, Math.PI * 0.1, Math.PI * 0.9, 6), DETAIL, 0.3);
    k.line(limb([0.62, 0.62], [0.5, 0.3], [0.8, 0.4]));
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
    for (const u of [0.64, 0.68, 0.76, 0.8]) k.line([[u, 0.74], [u + k.r.range(-0.008, 0.008), 0.83]]);
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
    k.line([[0.8, 0.6], [0.82, 0.655]], DETAIL);
  },

  // Reading on the floor, propped on elbows, feet up, a mug to hand.
  reading: (k) => {
    ground(k, 0.04, 0.96, 0.8);
    const hip: Pt = [0.42, 0.775];
    const neck: Pt = [0.61, 0.63];
    figure(k, {
      head: [0.675, 0.555],
      neck,
      hip,
      arms: [[[0.635, 0.785], [0.74, 0.655]], [[0.59, 0.79], [0.72, 0.67]]],
      legs: [[[0.22, 0.785], [0.27, 0.58]], [[0.24, 0.79], [0.23, 0.6]]],
      facing: 1,
      feet: false,
    });
    // The open book, held up to the face.
    const book: Pt[] = [[0.72, 0.68], [0.76, 0.56], [0.84, 0.54], [0.8, 0.66]];
    k.cover(book);
    k.line([[0.72, 0.68], [0.75, 0.57], [0.83, 0.55], [0.8, 0.67], [0.72, 0.68]]);
    k.line([[0.72, 0.68], [0.73, 0.58], [0.75, 0.57]], DETAIL);
    k.line([[0.76, 0.63], [0.8, 0.62]], DETAIL * 0.7, 0.2);
    k.line([[0.765, 0.6], [0.81, 0.59]], DETAIL * 0.7, 0.2);
    // Crossed feet, and a heart floating up from the story.
    k.line([[0.27, 0.58], [0.3, 0.56]]);
    k.line([[0.23, 0.6], [0.26, 0.575]]);
    k.prop("heart", 0.5, 0.26, 0.14);
    k.prop("cup", 0.86, 0.62, 0.14);
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
