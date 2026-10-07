// Hand-drawn fills: what a person draws into a box when they fill it in with
// a pen rather than tick it (2026-10-07: "hand drawn filling of random styles
// ... pen patterns like henna type inspired, or other interesting tiling,
// kolam ... other simpler doodling type tiles and make it realistic not
// perfect like it was drawn in different styles").
//
// Each pattern draws over a box (print px) as pen paths, cut to the box - or
// to the ellipse inside it, for a round thing (a bubble, a week's circle) -
// and never exactly: spacing drifts, lines lean and stop short or run on,
// loops do not quite close, a dot lands off its grid. `loose` (0 neat to 1
// loose) is how much, the drawer's own; `over` is how far past the edge a
// stroke may run, as a quick hand's do.
//
// The henna and kolam ones are inspired by those traditions' motifs - a
// petalled flower, a paisley, a jaali lattice, a vine, scallops; a pulli
// grid of dots with lines looped round them - drawn small, as a doodle.

import { rng, type Rng } from "./rng";
import { wobble, type Path } from "./strokes";

export type Box = [number, number, number, number];

export const STROKE_PATTERNS = ["hatch", "crosshatch", "dashes", "stipple"] as const;
export const HENNA_PATTERNS = ["henna-flower", "paisley", "jaali", "vine", "scallops", "pearls"] as const;
export const KOLAM_PATTERNS = ["kolam-lattice", "kolam-flower", "pearls", "rings"] as const;
export const TILE_PATTERNS = ["scales", "waves", "zigzag", "bricks", "checker", "triangles", "plus", "polka"] as const;
export const DOODLE_PATTERNS = ["spiral", "rings", "stars", "hearts", "leaf", "sunburst"] as const;
export type PatternName =
  | (typeof STROKE_PATTERNS)[number]
  | (typeof HENNA_PATTERNS)[number]
  | (typeof KOLAM_PATTERNS)[number]
  | (typeof TILE_PATTERNS)[number]
  | (typeof DOODLE_PATTERNS)[number];

/** Patterns that run along a bar as well as filling a box. */
export const BAND_PATTERNS: PatternName[] = ["hatch", "dashes", "waves", "zigzag", "scales", "vine", "scallops", "pearls", "kolam-lattice", "triangles", "bricks"];

export type PatternHand = {
  /** 0 neat ... 1 loose. */
  loose: number;
  /** How far a stroke may run past the edge, print px. */
  over: number;
  /** The hand's own slant for hatching, radians. */
  slant: number;
};

type Gen = (b: Box, r: Rng, u: number, hand: PatternHand) => Path[];

// ------------------------------------------------------------- geometry

const TAU = Math.PI * 2;

/** Points along a path, about `step` apart. */
function resample(path: Path, step: number): Path {
  if (path.length < 4) return path;
  const out: Path = [path[0], path[1]];
  for (let i = 2; i < path.length; i += 2) {
    const [x0, y0, x1, y1] = [path[i - 2], path[i - 1], path[i], path[i + 1]];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) out.push(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
  }
  return out;
}

/** A path cut to a shape: the runs of it inside, each ended at the edge. */
function clip(path: Path, inside: (x: number, y: number) => boolean): Path[] {
  const pts = resample(path, 2.5);
  const out: Path[] = [];
  let cur: Path = [];
  for (let i = 0; i < pts.length; i += 2) {
    if (inside(pts[i], pts[i + 1])) cur.push(pts[i], pts[i + 1]);
    else if (cur.length) {
      if (cur.length >= 4) out.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 4) out.push(cur);
  return out;
}

/** A loop round (cx, cy), started anywhere and closed loosely - a hand's. */
function loop(r: Rng, cx: number, cy: number, rx: number, ry: number, loose: number, points = 24): Path {
  const a0 = r.range(0, TAU);
  const turns = 1 + r.range(0.02, 0.1 + 0.12 * loose);
  const out: Path = [];
  for (let i = 0; i <= points; i++) {
    const a = a0 + (i / points) * TAU * turns;
    const k = 1 + 0.05 * loose * Math.sin(i * 1.7) + (0.04 * i) / points;
    out.push(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
  }
  return out;
}

/** A dot: a pen touched down and nudged. */
const dot = (r: Rng, x: number, y: number, size: number): Path => {
  const a = r.range(0, TAU);
  return [x, y, x + Math.cos(a) * size, y + Math.sin(a) * size];
};

/** Turn a path about (cx, cy). */
function turn(path: Path, cx: number, cy: number, a: number): Path {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const out: Path = [];
  for (let i = 0; i < path.length; i += 2) {
    const [dx, dy] = [path[i] - cx, path[i + 1] - cy];
    out.push(cx + dx * c - dy * s, cy + dx * s + dy * c);
  }
  return out;
}

/** Straight lines across a box at angle `a`, `gap` apart - each leaning
 *  its own little way, and some stopping short. */
function lines(b: Box, r: Rng, a: number, gap: number, loose: number): Path[] {
  const [x, y, w, h] = b;
  const [cx, cy] = [x + w / 2, y + h / 2];
  const R = Math.hypot(w, h) / 2 + 4;
  const out: Path[] = [];
  for (let d = -R + gap * r.range(0.1, 0.9); d <= R; d += gap * r.range(1 - 0.28 * loose, 1 + 0.28 * loose)) {
    const la = a + r.range(-1, 1) * 0.07 * (0.3 + loose);
    const [ux, uy] = [Math.cos(la), Math.sin(la)];
    const [px, py] = [cx - Math.sin(a) * d, cy + Math.cos(a) * d];
    const s0 = -R * (1 - r.range(0, 0.3 * loose));
    const s1 = R * (1 - r.range(0, 0.3 * loose));
    out.push([px + ux * s0, py + uy * s0, px + ux * s1, py + uy * s1]);
  }
  return out;
}

/** A teardrop, round end at the origin's left and point at +x, `len`
 *  long and `fat` wide; `curl` bends its point up (a paisley's). */
function teardrop(len: number, fat: number, curl = 0, points = 28): Path {
  const out: Path = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * TAU;
    const px = Math.cos(t);
    const py = Math.sin(t) * Math.pow(Math.abs(Math.sin(t / 2)), 1.4);
    let [x, y] = [((px + 1) / 2) * len, py * fat];
    if (curl) {
      const k = Math.pow(Math.max(0, px), 3) * curl;
      [x, y] = [x * Math.cos(k) - y * Math.sin(k) * 0.3, y + x * Math.sin(k) * 0.35];
    }
    out.push(x, y);
  }
  return out;
}

const move = (p: Path, dx: number, dy: number): Path => p.map((v, i) => (i % 2 ? v + dy : v + dx));

/** A petal on a flower at (cx, cy), along angle `a`: its point `from` the
 *  middle, its round end out at `to`, `fat` wide. */
function petal(cx: number, cy: number, a: number, from: number, to: number, fat: number): Path {
  const drop = turn(teardrop(to - from, fat), 0, 0, Math.PI);
  return turn(move(drop, cx + to, cy), cx, cy, a);
}

// ------------------------------------------------------------- patterns

const GENS: Record<PatternName, Gen> = {
  hatch: (b, r, u, hand) => lines(b, r, hand.slant + r.range(-0.12, 0.12) * hand.loose, u * 0.3, hand.loose),
  crosshatch: (b, r, u, hand) => [...lines(b, r, hand.slant, u * 0.32, hand.loose), ...lines(b, r, hand.slant + Math.PI / 2 + r.range(-0.2, 0.2), u * 0.36, hand.loose)],
  dashes: (b, r, u, hand) =>
    lines(b, r, hand.slant + r.range(-0.1, 0.1), u * 0.3, hand.loose).flatMap((l) => {
      // A line broken into short strokes, the pen lifted between.
      const [x0, y0, x1, y1] = l;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const out: Path[] = [];
      for (let s = r.range(0, u * 0.3); s < len; ) {
        const d = u * r.range(0.22, 0.42);
        const e = Math.min(len, s + d);
        out.push([x0 + ((x1 - x0) * s) / len, y0 + ((y1 - y0) * s) / len, x0 + ((x1 - x0) * e) / len, y0 + ((y1 - y0) * e) / len]);
        s = e + u * r.range(0.1, 0.22);
      }
      return out;
    }),
  stipple: (b, r, u) => {
    const [x, y, w, h] = b;
    // Close enough to read as a tone: about a dot every tenth of the unit.
    const space = u * r.range(0.1, 0.14);
    const n = Math.round((w * h) / (space * space));
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < n * 4 && pts.length < n; i++) {
      const p: [number, number] = [x + r.range(0, w), y + r.range(0, h)];
      if (pts.every(([qx, qy]) => Math.hypot(qx - p[0], qy - p[1]) > space * 0.7)) pts.push(p);
    }
    return pts.map(([px, py]) => dot(r, px, py, r.range(0.6, 1.6)));
  },
  scales: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const t = u * r.range(0.32, 0.42);
    const out: Path[] = [];
    let row = 0;
    for (let cy = y - t * 0.2; cy < y + h + t; cy += t * 0.55, row++) {
      for (let cx = x - t + (row % 2) * (t / 2) + r.range(-1, 1) * hand.loose; cx < x + w + t; cx += t) {
        const arc: Path = [];
        for (let i = 0; i <= 10; i++) {
          const a = (i / 10) * Math.PI;
          arc.push(cx + Math.cos(a) * t * 0.5, cy + Math.sin(a) * t * 0.5);
        }
        out.push(arc);
      }
    }
    return out;
  },
  waves: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const gap = u * r.range(0.24, 0.32);
    const amp = gap * r.range(0.25, 0.4);
    const lambda = u * r.range(0.4, 0.6);
    const out: Path[] = [];
    for (let cy = y + gap * r.range(0.2, 0.8); cy < y + h; cy += gap * r.range(1 - 0.2 * hand.loose, 1 + 0.2 * hand.loose)) {
      const phase = r.range(0, TAU);
      const p: Path = [];
      for (let px = x - 4; px <= x + w + 4; px += 3) p.push(px, cy + Math.sin((px / lambda) * TAU + phase) * amp);
      out.push(p);
    }
    return out;
  },
  zigzag: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const gap = u * r.range(0.26, 0.34);
    const tooth = u * r.range(0.18, 0.26);
    const out: Path[] = [];
    for (let cy = y + gap * 0.5; cy < y + h; cy += gap * r.range(0.9, 1.1)) {
      const p: Path = [];
      for (let i = 0, px = x - tooth; px <= x + w + tooth; i++, px += tooth) p.push(px + r.range(-1, 1) * hand.loose, cy + (i % 2 ? -1 : 1) * tooth * 0.45);
      out.push(p);
    }
    return out;
  },
  bricks: (b, r, u) => {
    const [x, y, w, h] = b;
    const gap = u * r.range(0.24, 0.3);
    const len = gap * r.range(1.6, 2.2);
    const out: Path[] = [];
    let row = 0;
    for (let cy = y + gap * r.range(0.3, 0.7); cy < y + h; cy += gap, row++) {
      out.push([x - 3, cy + r.range(-0.8, 0.8), x + w + 3, cy + r.range(-0.8, 0.8)]);
      for (let px = x + (row % 2) * (len / 2) + r.range(0, len * 0.3); px < x + w; px += len * r.range(0.9, 1.1)) out.push([px, cy, px + r.range(-0.8, 0.8), cy + gap]);
    }
    return out;
  },
  checker: (b, r, u) => {
    const [x, y, w, h] = b;
    const t = u * r.range(0.3, 0.42);
    const out: Path[] = [];
    for (let row = 0, cy = y; cy < y + h; cy += t, row++) {
      for (let col = 0, cx = x; cx < x + w; cx += t, col++) {
        if ((row + col) % 2) continue;
        // A dark square: hatched close, the way a pen fills one.
        out.push(...lines([cx, cy, t, t], r, Math.PI / 4, 2.6, 0.2).flatMap((l) => clip(l, (px, py) => px >= cx && px <= cx + t && py >= cy && py <= cy + t)));
      }
    }
    return out;
  },
  triangles: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const t = u * r.range(0.3, 0.4);
    const tall = t * 0.85;
    const out: Path[] = [];
    for (let row = 0, by = y + tall; by < y + h + tall; by += tall, row++) {
      const x0 = x - (row % 2) * (t / 2);
      const p: Path = [];
      for (let i = 0, px = x0; px <= x + w + t; i++, px += t / 2) p.push(px, i % 2 ? by - tall : by);
      out.push(p, [x - 3, by, x + w + 3, by + r.range(-1, 1) * hand.loose]);
      // Every other tooth shaded: lines across it, parallel to its base.
      for (let apex = x0 + t / 2 + (row % 2 ? t : 0); apex < x + w + t; apex += t * 2) {
        for (let f = 0.22; f < 0.9; f += r.range(0.18, 0.24)) {
          const half = (t / 2) * (1 - f);
          out.push([apex - half, by - tall * f, apex + half, by - tall * f]);
        }
      }
    }
    return out;
  },
  plus: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const t = u * r.range(0.3, 0.38);
    const k = t * 0.22;
    const out: Path[] = [];
    let row = 0;
    for (let cy = y + t / 2; cy < y + h; cy += t, row++) {
      for (let cx = x + t / 2 + (row % 2) * (t / 2); cx < x + w; cx += t) {
        const [jx, jy] = [r.range(-1, 1) * hand.loose * 2, r.range(-1, 1) * hand.loose * 2];
        out.push([cx - k + jx, cy + jy, cx + k + jx, cy + jy], [cx + jx, cy - k + jy, cx + jx, cy + k + jy]);
      }
    }
    return out;
  },
  polka: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const t = u * r.range(0.3, 0.4);
    const out: Path[] = [];
    let row = 0;
    for (let cy = y + t / 2; cy < y + h + t / 2; cy += t * 0.87, row++) {
      for (let cx = x + (row % 2) * (t / 2); cx < x + w + t / 2; cx += t) {
        const rr = t * r.range(0.14, 0.22);
        out.push(loop(r, cx, cy, rr, rr, hand.loose, 12));
        if (r.chance(0.35)) out.push(loop(r, cx, cy, rr * 0.45, rr * 0.45, hand.loose, 8));
      }
    }
    return out;
  },
  pearls: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const t = u * r.range(0.2, 0.26);
    const out: Path[] = [];
    // A string or two of beads across the box, as henna borders have.
    const strings = Math.max(1, Math.round(h / (t * 2.4)));
    for (let k = 0; k < strings; k++) {
      const cy = y + (h * (k + 0.5)) / strings + r.range(-1, 1) * hand.loose;
      for (let cx = x + t * 0.5; cx < x + w; cx += t * r.range(0.95, 1.1)) out.push(loop(r, cx, cy, t * 0.42, t * 0.42, hand.loose, 12));
      out.push([x - 2, cy + t * 0.75, x + w + 2, cy + t * 0.75 + r.range(-1, 1)]);
    }
    return out;
  },
  spiral: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const [cx, cy] = [x + w / 2 + r.range(-1, 1) * w * 0.08, y + h / 2 + r.range(-1, 1) * h * 0.08];
    const gap = u * r.range(0.12, 0.16);
    const R = Math.hypot(w, h) * 0.6;
    const a0 = r.range(0, TAU);
    const p: Path = [];
    for (let a = 0; (a / TAU) * gap < R; a += 0.25) {
      const rr = (a / TAU) * gap * (1 + 0.04 * hand.loose * Math.sin(a * 3));
      p.push(cx + Math.cos(a + a0) * rr, cy + Math.sin(a + a0) * rr);
    }
    return [p];
  },
  rings: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // Concentric arcs - from a corner, a rainbow; or round the middle.
    const corner = r.chance(0.5);
    const [cx, cy] = corner ? [x + (r.chance(0.5) ? 0 : w), y + h] : [x + w / 2, y + h / 2];
    const gap = u * r.range(0.13, 0.18);
    const out: Path[] = [];
    for (let rr = gap * 0.7; rr < Math.hypot(w, h); rr += gap * r.range(0.85, 1.15)) out.push(loop(r, cx, cy, rr, rr, hand.loose * 0.6, 40));
    return out;
  },
  stars: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const n = r.int(1, Math.max(1, Math.round((w * h) / (u * u * 0.6))));
    const out: Path[] = [];
    const placed: Array<[number, number, number]> = [];
    for (let i = 0; i < n; i++) {
      const s = u * r.range(0.2, 0.32) * (n === 1 ? 1.6 : 1);
      let at: [number, number] | null = n === 1 ? [x + w / 2, y + h / 2] : null;
      for (let k = 0; !at && k < 30; k++) {
        const c: [number, number] = [x + r.range(s, Math.max(s, w - s)), y + r.range(s, Math.max(s, h - s))];
        if (placed.every(([px, py, ps]) => Math.hypot(px - c[0], py - c[1]) > (ps + s) * 0.9)) at = c;
      }
      if (!at) continue;
      placed.push([...at, s]);
      const [cx, cy] = at;
      const a0 = -Math.PI / 2 + r.range(-0.2, 0.2);
      const p: Path = [];
      for (let k = 0; k <= 10; k++) {
        const a = a0 + (k / 10) * TAU;
        const rr = (k % 2 ? 0.42 : 1) * s * (1 + r.range(-0.08, 0.08) * hand.loose);
        p.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      out.push(p);
    }
    return out;
  },
  hearts: (b, r, u) => {
    const [x, y, w, h] = b;
    const n = r.int(1, Math.max(1, Math.round((w * h) / (u * u * 0.7))));
    const out: Path[] = [];
    const placed: Array<[number, number, number]> = [];
    for (let i = 0; i < n; i++) {
      const s = u * r.range(0.16, 0.24) * (n === 1 ? 1.7 : 1);
      let at: [number, number] | null = n === 1 ? [x + w / 2, y + h / 2] : null;
      for (let k = 0; !at && k < 30; k++) {
        const c: [number, number] = [x + r.range(s, Math.max(s, w - s)), y + r.range(s, Math.max(s, h - s))];
        if (placed.every(([px, py, ps]) => Math.hypot(px - c[0], py - c[1]) > (ps + s) * 1.1)) at = c;
      }
      if (!at) continue;
      placed.push([...at, s]);
      const [cx, cy] = at;
      const p: Path = [];
      for (let k = 0; k <= 28; k++) {
        const t = (k / 28) * TAU;
        // The heart curve, scaled to s.
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        p.push(cx + (hx / 17) * s, cy + (hy / 17) * s);
      }
      out.push(turn(p, cx, cy, r.range(-0.3, 0.3)));
    }
    return out;
  },
  leaf: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const [cx, cy] = [x + w / 2, y + h / 2];
    const len = Math.min(w, h) * r.range(0.75, 0.95);
    const a = r.range(-1.2, -0.4);
    const outline = move(teardrop(len, len * 0.28, 0.25 * hand.loose), -len / 2, 0);
    const rib: Path = [-len / 2 + len * 0.06, 0, len / 2, 0];
    const veins: Path[] = [];
    for (let k = 1; k <= 3; k++) {
      const vx = -len / 2 + (len * k) / 4.3;
      veins.push([vx, 0, vx + len * 0.12, -len * 0.12], [vx, 0, vx + len * 0.12, len * 0.12]);
    }
    return [outline, rib, ...veins].map((p) => turn(move(p, cx, cy), cx, cy, a));
  },
  sunburst: (b, r, u) => {
    const [x, y, w, h] = b;
    const [cx, cy] = [x + (r.chance(0.5) ? 0 : w), y + h];
    const out: Path[] = [loop(r, cx, cy, u * 0.18, u * 0.18, 0.2, 20)];
    const R = Math.hypot(w, h);
    for (let a = -Math.PI; a <= 0; a += r.range(0.14, 0.2)) out.push([cx + Math.cos(a) * u * 0.28, cy + Math.sin(a) * u * 0.28, cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    return out;
  },
  "henna-flower": (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const [cx, cy] = [x + w / 2 + r.range(-1, 1) * w * 0.04, y + h / 2 + r.range(-1, 1) * h * 0.04];
    const R = Math.min(w, h) * 0.46;
    const r0 = R * r.range(0.2, 0.26);
    const n = r.int(5, 8);
    const a0 = r.range(0, TAU);
    const out: Path[] = [loop(r, cx, cy, r0, r0, hand.loose, 16), dot(r, cx, cy, 1.4)];
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * TAU + r.range(-0.08, 0.08) * hand.loose;
      // A petal, round end out and point in at the middle's ring; a line
      // down its middle on some; a dot between it and the next.
      out.push(petal(cx, cy, a, r0 * 1.05, R, (R - r0) * r.range(0.28, 0.36)));
      if (r.chance(0.5)) out.push(turn([cx + r0 * 1.5, cy, cx + R * 0.7, cy], cx, cy, a));
      const da = a + Math.PI / n;
      out.push(dot(r, cx + Math.cos(da) * R * 0.85, cy + Math.sin(da) * R * 0.85, 1.4));
    }
    return out;
  },
  paisley: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const [cx, cy] = [x + w / 2, y + h / 2];
    const len = Math.max(w, h) * r.range(0.62, 0.78);
    const fat = Math.min(w, h) * r.range(0.26, 0.32);
    const a = r.range(-2.4, -2.0);
    const out: Path[] = [move(teardrop(len, fat, 0.9), -len / 2, 0), move(teardrop(len * 0.66, fat * 0.62, 0.7), -len / 2 + len * 0.08, 0)];
    // Inside: a small loop at the round end, and dots along the curl.
    out.push(loop(r, -len / 2 + fat * 0.75, 0, fat * 0.24, fat * 0.24, hand.loose, 12));
    for (let k = 0; k < 3; k++) out.push(dot(r, -len / 2 + len * (0.45 + k * 0.14), fat * 0.05, 1.3));
    return out.map((p) => turn(move(p, cx, cy), cx, cy, a));
  },
  jaali: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const t = u * r.range(0.34, 0.44);
    const out = [...lines(b, r, Math.PI / 4, t * 0.71, hand.loose * 0.5), ...lines(b, r, -Math.PI / 4, t * 0.71, hand.loose * 0.5)];
    // A small ring where the lines cross.
    for (let row = 0, cy = y; cy <= y + h; cy += t / 2, row++) {
      for (let cx = x + (row % 2) * (t / 2); cx <= x + w; cx += t) out.push(loop(r, cx, cy, t * 0.12, t * 0.12, hand.loose, 10));
    }
    return out;
  },
  vine: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const along = w >= h;
    const L = along ? w : h;
    const amp = Math.min(along ? h : w, u) * 0.18;
    const lambda = u * r.range(0.7, 0.9);
    const phase = r.range(0, TAU);
    const at = (s: number): [number, number] => {
      const off = Math.sin((s / lambda) * TAU + phase) * amp;
      return along ? [x + s, y + h / 2 + off] : [x + w / 2 + off, y + s];
    };
    const stem: Path = [];
    for (let s = -4; s <= L + 4; s += 3) stem.push(...at(s));
    const out: Path[] = [stem];
    // Leaves off the stem at each crest, alternately either side; a dot
    // or a small curl between.
    for (let s = lambda * 0.25; s < L; s += lambda / 2) {
      const [px, py] = at(s);
      const side = Math.sin((s / lambda) * TAU + phase) > 0 ? 1 : -1;
      const leaf = teardrop(u * 0.3, u * 0.1, 0.4 * hand.loose);
      const a = (along ? Math.PI / 2 : 0) * side + (along ? 0 : side > 0 ? 0 : Math.PI) + r.range(-0.4, 0.4);
      out.push(turn(move(leaf, px, py), px, py, along ? side * (Math.PI / 2 + 0.5) : a));
      const [qx, qy] = at(s + lambda / 4);
      out.push(dot(r, qx + (along ? 0 : -side * amp * 1.6), qy + (along ? -side * amp * 1.6 : 0), 1.4));
    }
    return out;
  },
  scallops: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const t = u * r.range(0.28, 0.36);
    const out: Path[] = [];
    // A henna border: scallops hung from a line, a dot in each, along
    // the top and (if there is room) the bottom.
    const edges = h > t * 2.2 ? [y, y + h] : [y];
    for (const [k, ey] of edges.entries()) {
      const dir = k ? -1 : 1;
      const base = ey + dir * t * 0.12;
      out.push([x - 3, base, x + w + 3, base + r.range(-1, 1)]);
      for (let cx = x + t / 2 + r.range(0, t * 0.2); cx < x + w; cx += t * r.range(0.95, 1.05)) {
        const arc: Path = [];
        for (let i = 0; i <= 10; i++) {
          const a = (i / 10) * Math.PI;
          arc.push(cx + Math.cos(a) * t * 0.5, base + dir * Math.sin(a) * t * 0.5);
        }
        out.push(arc, dot(r, cx, base + dir * t * 0.22, 1.3));
        if (r.chance(0.5)) out.push(dot(r, cx, base + dir * t * (0.7 + 0.1 * hand.loose), 1.1));
      }
    }
    return out;
  },
  "kolam-lattice": (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // The pulli: a grid of dots; round each, a rounded diamond, its points
    // meeting its neighbours' - one line looping through the grid.
    const d = u * r.range(0.32, 0.4);
    const out: Path[] = [];
    for (let cy = y + d / 2 + r.range(-1, 1) * d * 0.1; cy < y + h + d / 2; cy += d) {
      for (let cx = x + d / 2; cx < x + w + d / 2; cx += d) {
        out.push(dot(r, cx + r.range(-1, 1) * hand.loose, cy + r.range(-1, 1) * hand.loose, 1.5));
        const p: Path = [];
        const a0 = r.range(0, TAU);
        for (let k = 0; k <= 24; k++) {
          const a = a0 + (k / 24) * TAU * 1.04;
          const [ca, sa] = [Math.cos(a), Math.sin(a)];
          // A superellipse: a diamond with rounded corners.
          const rr = (d / 2) * 0.96 / Math.pow(Math.pow(Math.abs(ca), 1.25) + Math.pow(Math.abs(sa), 1.25), 1 / 1.25);
          p.push(cx + ca * rr, cy + sa * rr);
        }
        out.push(p);
      }
    }
    return out;
  },
  "kolam-flower": (b, r, u, hand) => {
    const [x, y, w, h] = b;
    const [cx, cy] = [x + w / 2, y + h / 2];
    const d = Math.min(w, h) * 0.3;
    const a0 = r.chance(0.5) ? 0 : Math.PI / 4;
    const out: Path[] = [dot(r, cx, cy, 1.5)];
    for (let k = 0; k < 4; k++) {
      const a = a0 + (k * Math.PI) / 2;
      const [px, py] = [cx + Math.cos(a) * d, cy + Math.sin(a) * d];
      out.push(dot(r, px + r.range(-1, 1) * hand.loose, py + r.range(-1, 1) * hand.loose, 1.5));
      // A petal from the middle out round the outer dot and back.
      out.push(petal(cx, cy, a, d * 0.08, d * 1.38, d * 0.44));
    }
    // A loop round the middle, through the petals' roots.
    out.push(loop(r, cx, cy, d * 0.35, d * 0.35, hand.loose, 16));
    return out;
  },
};

/**
 * A pattern drawn into a box: `name`'s shapes, cut to the box (or the
 * ellipse in it, if `round`), each stroke wobbled a little as a hand does.
 * `u` is the pattern's unit - about the box's smaller side; `seed` makes the
 * same box draw the same way every time.
 */
export function pattern(name: PatternName, box: Box, seed: number, hand: PatternHand, round = false): Path[] {
  const r = rng(seed);
  const [x, y, w, h] = box;
  const u = Math.max(18, Math.min(Math.min(w, h), 90));
  const inside = round
    ? (px: number, py: number) => {
        const [dx, dy] = [(px - (x + w / 2)) / (w / 2 + hand.over), (py - (y + h / 2)) / (h / 2 + hand.over)];
        return dx * dx + dy * dy <= 1;
      }
    : (px: number, py: number) => px >= x - hand.over && px <= x + w + hand.over && py >= y - hand.over && py <= y + h + hand.over;
  // A loose hand's lines wander: up to 3px at print size, a fine pen's
  // width or so.
  const amp = 0.4 + 2.6 * hand.loose;
  return GENS[name](box, r, u, hand)
    .flatMap((p) => clip(p, inside))
    .map((p, i) => (p.length <= 4 ? p : wobble(p, amp, seed * 31 + i, 6)));
}
