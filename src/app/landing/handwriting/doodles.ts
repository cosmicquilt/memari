// Doodles: the little drawings a person adds around a week - in the landing
// page's journal (plan.ts) and in its margins (ink/pen.ts).
//
// Andrew, 2026-09-23: "I want the doodles to be better, better style and a
// bit more intricate." The first set was one closed line apiece - a
// pentagram, a circle with spokes - and read as clip art. These are drawn
// the way a person sketches: an outline in the pen's full weight, then the
// details in a lighter hand - veins, steam, snow on the peaks, a latte heart
// - and shading as quick parallel hatching that stops short of the edges.
// Lines overshoot a little where they close, and tremble.
//
// Every doodle is drawn into an s x s box whose top-left is (x, y), in
// whatever units the caller draws in (print px on the journal's pages, a
// 100-unit box in the margins). Each stroke carries a weight: 1 for the
// outline, less for detail - the caller turns it into a pen width.

import { noise1, rng as makeRng, type Rng } from "./rng";

/** A polyline: x0, y0, x1, y1, ... */
export type Path = number[];
export type DoodleStroke = { path: Path; weight: number };

export type Pt = [number, number];

/** The weight of a doodle's detail lines against its outline's 1. */
export const DETAIL = 0.55;
const TAU = Math.PI * 2;

/** A doodle's pen: unit coordinates in, strokes out, with the hand's tremor. */
export class Sketch {
  private n = 0;
  constructor(
    private readonly x: number,
    private readonly y: number,
    private readonly s: number,
    readonly r: Rng,
    private readonly seed: number,
    readonly out: DoodleStroke[] = []
  ) {}

  /** A pen for the box at (u, v), `size` across, inside this one - its
   *  strokes join this sketch's. */
  within(u: number, v: number, size: number): Sketch {
    return new Sketch(this.x + u * this.s, this.y + v * this.s, size * this.s, this.r, this.seed * 7 + ++this.n, this.out);
  }

  /** Another doodle, drawn in the box at (u, v), `size` across. */
  prop(name: DoodleName, u: number, v: number, size: number) {
    DRAW[name](this.within(u, v, size));
  }

  /**
   * Something solid in front: hide what has been drawn so far where `shape`
   * (unit points, closed) lies - a guitar over the legs holding it, a head
   * over the sofa behind it. Draw the shape's own outline after.
   */
  cover(shape: Pt[]) {
    const poly = shape.map((p) => this.at(p));
    const inside = (x: number, y: number) => {
      let yes = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) yes = !yes;
      }
      return yes;
    };
    const kept: DoodleStroke[] = [];
    for (const stroke of this.out) {
      let piece: Path = [];
      for (let i = 0; i < stroke.path.length; i += 2) {
        const [x, y] = [stroke.path[i], stroke.path[i + 1]];
        if (inside(x, y)) {
          if (piece.length >= 4) kept.push({ path: piece, weight: stroke.weight });
          piece = [];
        } else piece.push(x, y);
      }
      if (piece.length >= 4) kept.push({ path: piece, weight: stroke.weight });
    }
    this.out.splice(0, this.out.length, ...kept);
  }

  /** Resample evenly and push sideways by smooth noise: drawn, not plotted. */
  private tremble(pts: Pt[], amount: number): Path {
    const n = noise1(this.seed * 31 + ++this.n);
    const step = this.s / 34;
    const amp = this.s * 0.0045 * amount;
    const out: Path = [];
    let along = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0) || 1e-6;
      const nx = -(y1 - y0) / len;
      const ny = (x1 - x0) / len;
      const steps = Math.max(1, Math.round(len / step));
      for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
        const t = k / steps;
        const d = n((along + t * len) / (this.s * 0.9)) * amp;
        out.push(x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d);
      }
      along += len;
    }
    return out;
  }

  private at([u, v]: Pt): Pt {
    return [this.x + u * this.s, this.y + v * this.s];
  }

  /** A stroke through unit points. */
  line(pts: Pt[], weight = 1, tremor = 1) {
    if (pts.length < 2) return;
    this.out.push({ path: this.tremble(pts.map((p) => this.at(p)), tremor), weight });
  }

  /** A cubic Bezier, as one stroke - or as points to join into a longer one. */
  bez(p0: Pt, c1: Pt, c2: Pt, p3: Pt, n = 20): Pt[] {
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = (1 - t) ** 3;
      const b = 3 * (1 - t) ** 2 * t;
      const c = 3 * (1 - t) * t ** 2;
      const d = t ** 3;
      pts.push([a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]]);
    }
    return pts;
  }

  /** An elliptical arc's points, from a0 to a1 radians (0 = right, clockwise
   *  on screen). */
  arc(cu: number, cv: number, ru: number, rv: number, a0: number, a1: number, n = 28, turn = 0): Pt[] {
    const pts: Pt[] = [];
    const [cs, sn] = [Math.cos(turn), Math.sin(turn)];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const dx = Math.cos(a) * ru;
      const dy = Math.sin(a) * rv;
      pts.push([cu + dx * cs - dy * sn, cv + dx * sn + dy * cs]);
    }
    return pts;
  }

  /** A closed ellipse the way a hand closes one: from a random start, a
   *  little past a full turn. */
  ring(cu: number, cv: number, ru: number, rv: number, weight = 1, turn = 0) {
    const a0 = this.r.range(0, TAU);
    this.line(this.arc(cu, cv, ru, rv, a0, a0 + TAU * this.r.range(1.03, 1.1), 40, turn), weight);
  }

  /**
   * Quick parallel hatching inside a closed shape (unit points), at `angle`
   * radians, `gap` apart - each line stopping short of the outline, a little
   * uneven, the way shading is scribbled.
   */
  hatch(shape: Pt[], angle: number, gap: number, weight = DETAIL) {
    const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
    const [nx, ny] = [-dy, dx];
    const offsets = shape.map(([u, v]) => u * nx + v * ny);
    const lo = Math.min(...offsets);
    const hi = Math.max(...offsets);
    for (let o = lo + gap * 0.6; o < hi; o += gap * this.r.range(0.85, 1.15)) {
      // Where the line (points p with p.n = o) crosses the outline's edges.
      const hits: number[] = [];
      for (let i = 0; i < shape.length; i++) {
        const [u0, v0] = shape[i];
        const [u1, v1] = shape[(i + 1) % shape.length];
        const f0 = u0 * nx + v0 * ny - o;
        const f1 = u1 * nx + v1 * ny - o;
        if ((f0 < 0) === (f1 < 0)) continue;
        const t = f0 / (f0 - f1);
        const [pu, pv] = [u0 + (u1 - u0) * t, v0 + (v1 - v0) * t];
        hits.push(pu * dx + pv * dy);
      }
      hits.sort((a, b) => a - b);
      for (let i = 0; i + 1 < hits.length; i += 2) {
        const inset = (hits[i + 1] - hits[i]) * this.r.range(0.08, 0.18);
        const a = hits[i] + inset;
        const b = hits[i + 1] - inset * this.r.range(0.6, 1.4);
        if (b - a < gap * 0.8) continue;
        const at = (t: number): Pt => [nx * o + dx * t, ny * o + dy * t];
        this.line([at(a), at(b)], weight, 0.4);
      }
    }
  }

  /** A dot: a tight spiral, since a pen stroke too short to taper vanishes. */
  dot(cu: number, cv: number, size = 0.018, weight = 1) {
    const a0 = this.r.range(0, TAU);
    const pts: Pt[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const rr = size * (1 - t * 0.7);
      pts.push([cu + Math.cos(a0 + t * TAU * 1.6) * rr, cv + Math.sin(a0 + t * TAU * 1.6) * rr]);
    }
    this.line(pts, weight, 0);
  }

  /** A four-pointed sparkle: concave sides, drawn as one closed stroke. */
  sparkle(cu: number, cv: number, size: number, weight = 1) {
    const pts: Pt[] = [];
    for (let i = 0; i <= 4; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 2;
      const tip: Pt = [cu + Math.cos(a) * size, cv + Math.sin(a) * size];
      if (i === 0) pts.push(tip);
      else {
        const prev = -Math.PI / 2 + ((i - 1) * Math.PI) / 2;
        const mid = (prev + a) / 2;
        pts.push(...this.bez(pts[pts.length - 1], [cu + Math.cos(mid) * size * 0.14, cv + Math.sin(mid) * size * 0.14], [cu + Math.cos(mid) * size * 0.14, cv + Math.sin(mid) * size * 0.14], tip, 8).slice(1));
      }
    }
    this.line(pts, weight);
  }

  /** A small almond leaf from `base` pointing along `angle`, with its
   *  midrib and a few veins. */
  leaf(base: Pt, angle: number, length: number, width: number, weight = 1, veins = 3) {
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    const P = (along: number, side: number): Pt => [base[0] + c * along * length - s * side * width, base[1] + s * along * length + c * side * width];
    const upper = this.bez(P(0, 0), P(0.25, 0.9), P(0.7, 0.75), P(1, 0), 14);
    const lower = this.bez(P(1, 0), P(0.7, -0.75), P(0.25, -0.9), P(0, 0), 14);
    this.line([...upper, ...lower.slice(1)], weight);
    this.line(this.bez(P(0, 0), P(0.35, 0.08), P(0.65, 0.05), P(0.92, 0), 10), DETAIL);
    for (let i = 1; i <= veins; i++) {
      const t = i / (veins + 1);
      this.line([P(t * 0.9, 0.03), P(t * 0.9 + 0.14, 0.5)], DETAIL * 0.9, 0.5);
      this.line([P(t * 0.9, -0.03), P(t * 0.9 + 0.14, -0.5)], DETAIL * 0.9, 0.5);
    }
  }
}

type Draw = (k: Sketch) => void;

const star5 = (cu: number, cv: number, outer: number, inner: number, turn = 0): Pt[] =>
  Array.from({ length: 11 }, (_, i) => {
    const a = -Math.PI / 2 + turn + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? outer : inner;
    return [cu + Math.cos(a) * rr, cv + Math.sin(a) * rr] as Pt;
  });

const heartPts = (cu: number, cv: number, size: number): Pt[] =>
  Array.from({ length: 49 }, (_, i) => {
    const t = (i / 48) * TAU;
    const hx = 16 * Math.sin(t) ** 3;
    const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    return [cu + (hx / 34) * size, cv + (hy / 34) * size] as Pt;
  });

const DRAW = {
  sun: (k) => {
    k.ring(0.5, 0.5, 0.17, 0.17);
    // The shaded side, and a highlight.
    k.hatch(k.arc(0.5, 0.5, 0.15, 0.15, -0.3, Math.PI * 0.95, 16), 0.9, 0.035);
    k.line(k.arc(0.5, 0.5, 0.1, 0.1, Math.PI * 1.1, Math.PI * 1.45, 8), DETAIL);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + k.r.range(-0.06, 0.06);
      const long = i % 2 === 0;
      const r0 = 0.24;
      const r1 = long ? k.r.range(0.4, 0.46) : k.r.range(0.31, 0.35);
      if (long) k.line([[0.5 + Math.cos(a) * r0, 0.5 + Math.sin(a) * r0], [0.5 + Math.cos(a) * r1, 0.5 + Math.sin(a) * r1]]);
      else {
        // The short rays wave.
        const pts: Pt[] = [];
        for (let j = 0; j <= 8; j++) {
          const t = j / 8;
          const rr = r0 + (r1 - r0) * t;
          const w = Math.sin(t * Math.PI * 2) * 0.018;
          pts.push([0.5 + Math.cos(a) * rr - Math.sin(a) * w, 0.5 + Math.sin(a) * rr + Math.cos(a) * w]);
        }
        k.line(pts, DETAIL);
      }
    }
  },

  cloud: (k) => {
    const outline: Pt[] = [
      ...k.bez([0.14, 0.66], [0.02, 0.64], [0.06, 0.44], [0.22, 0.47], 10),
      ...k.bez([0.22, 0.47], [0.22, 0.26], [0.46, 0.22], [0.52, 0.36], 12).slice(1),
      ...k.bez([0.52, 0.36], [0.6, 0.2], [0.86, 0.28], [0.8, 0.46], 12).slice(1),
      ...k.bez([0.8, 0.46], [0.98, 0.46], [0.98, 0.68], [0.82, 0.68], 10).slice(1),
      ...k.bez([0.82, 0.68], [0.6, 0.7], [0.36, 0.69], [0.14, 0.66], 10).slice(1),
    ];
    k.line(outline);
    // Soft inner curves, and shading along the belly.
    k.line(k.bez([0.3, 0.5], [0.33, 0.42], [0.42, 0.4], [0.47, 0.44], 8), DETAIL);
    k.line(k.bez([0.62, 0.4], [0.66, 0.35], [0.74, 0.36], [0.76, 0.42], 8), DETAIL);
    k.hatch([[0.2, 0.6], [0.8, 0.6], [0.82, 0.67], [0.16, 0.66]], -0.35, 0.03);
    // Rain, or not.
    if (k.r.chance(0.6)) {
      for (const [u, v] of [[0.3, 0.78], [0.5, 0.84], [0.7, 0.78]] as Pt[]) {
        k.line([...k.bez([u, v], [u - 0.04, v + 0.06], [u - 0.03, v + 0.1], [u, v + 0.1], 6), ...k.bez([u, v + 0.1], [u + 0.03, v + 0.1], [u + 0.04, v + 0.06], [u, v], 6).slice(1)], DETAIL);
      }
    }
  },

  flower: (k) => {
    const [cu, cv] = [0.5, 0.35];
    const petals = 9;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * TAU + 0.2;
      const spread = 0.26;
      const r0 = 0.07;
      const r1 = k.r.range(0.22, 0.27);
      const P = (ang: number, rr: number): Pt => [cu + Math.cos(ang) * rr, cv + Math.sin(ang) * rr];
      k.line([...k.bez(P(a - spread, r0), P(a - spread * 0.9, r1 * 0.8), P(a - 0.1, r1), P(a, r1), 8), ...k.bez(P(a, r1), P(a + 0.1, r1), P(a + spread * 0.9, r1 * 0.8), P(a + spread, r0), 8).slice(1)]);
      // A crease down each petal.
      k.line([P(a, r0 + 0.03), P(a, r1 * 0.7)], DETAIL * 0.8, 0.4);
    }
    k.ring(cu, cv, 0.065, 0.065);
    for (let i = 0; i < 6; i++) {
      const a = k.r.range(0, TAU);
      const rr = k.r.range(0, 0.04);
      const [u, v] = [cu + Math.cos(a) * rr, cv + Math.sin(a) * rr];
      k.line([[u, v], [u + 0.008, v + 0.006]], DETAIL, 0);
    }
    // Stem and two leaves.
    k.line(k.bez([0.5, 0.6], [0.47, 0.72], [0.54, 0.84], [0.5, 0.98], 14));
    k.leaf([0.505, 0.76], -0.75, 0.2, 0.06);
    k.leaf([0.51, 0.86], Math.PI + 0.7, 0.18, 0.055);
  },

  plant: (k) => {
    // The pot: a rim, a tapering body, a band of pattern.
    k.line([[0.24, 0.6], [0.76, 0.6], [0.75, 0.68], [0.25, 0.68], [0.24, 0.6]]);
    k.line([[0.28, 0.68], [0.33, 0.96], [0.67, 0.96], [0.72, 0.68]]);
    const band: Pt[] = [];
    for (let i = 0; i <= 12; i++) band.push([0.31 + (0.38 * i) / 12, 0.8 + (i % 2 === 0 ? -0.025 : 0.025)]);
    k.line(band, DETAIL);
    k.hatch([[0.62, 0.7], [0.7, 0.7], [0.66, 0.94], [0.6, 0.94]], 1.1, 0.03);
    // Leaves on arching stems.
    const stems: Array<[Pt, Pt, Pt, number]> = [
      [[0.5, 0.6], [0.46, 0.45], [0.36, 0.3], -2.4],
      [[0.5, 0.6], [0.52, 0.42], [0.55, 0.2], -1.5],
      [[0.5, 0.6], [0.6, 0.48], [0.72, 0.36], -0.6],
      [[0.48, 0.6], [0.38, 0.54], [0.22, 0.5], -2.9],
      [[0.52, 0.6], [0.66, 0.58], [0.8, 0.52], -0.2],
    ];
    for (const [from, via, to, angle] of stems) {
      k.line(k.bez(from, via, via, to, 10), DETAIL);
      k.leaf(to, angle, 0.17, 0.065, 1, 2);
    }
  },

  cup: (k) => {
    // Saucer, cup, handle, a latte heart and three curls of steam.
    k.line(k.arc(0.5, 0.87, 0.38, 0.075, 0, TAU * 1.04, 40));
    k.line(k.arc(0.5, 0.87, 0.24, 0.04, Math.PI * 0.05, Math.PI * 0.95, 16), DETAIL);
    k.line(k.arc(0.47, 0.46, 0.26, 0.06, 0, TAU * 1.03, 36));
    k.line([...k.bez([0.21, 0.47], [0.22, 0.66], [0.27, 0.8], [0.36, 0.84], 12), ...k.bez([0.36, 0.84], [0.43, 0.87], [0.53, 0.87], [0.59, 0.84], 8).slice(1), ...k.bez([0.59, 0.84], [0.68, 0.8], [0.72, 0.66], [0.73, 0.47], 12).slice(1)]);
    k.line(k.bez([0.72, 0.55], [0.92, 0.5], [0.92, 0.76], [0.66, 0.76], 16));
    k.line(k.bez([0.72, 0.6], [0.83, 0.58], [0.83, 0.71], [0.68, 0.71], 12), DETAIL);
    k.hatch([[0.6, 0.52], [0.7, 0.5], [0.66, 0.78], [0.56, 0.82]], 1.2, 0.028);
    k.line(heartPts(0.47, 0.455, 0.12).map(([u, v]) => [u, 0.455 + (v - 0.455) * 0.45] as Pt), DETAIL);
    for (const u of [0.38, 0.48, 0.58]) {
      const lift = k.r.range(0, 0.04);
      k.line(k.bez([u, 0.36 - lift], [u - 0.05, 0.3 - lift], [u + 0.05, 0.22 - lift], [u, 0.14 - lift], 12), DETAIL);
    }
  },

  mountains: (k) => {
    const ridge: Pt[] = [[0.04, 0.84], [0.3, 0.34], [0.44, 0.56], [0.64, 0.2], [0.96, 0.84]];
    k.line(ridge);
    // Snow on the peaks, and the shaded faces.
    k.line([[0.24, 0.46], [0.28, 0.43], [0.31, 0.48], [0.34, 0.42], [0.37, 0.47]], DETAIL);
    k.line([[0.56, 0.35], [0.6, 0.31], [0.63, 0.37], [0.67, 0.3], [0.71, 0.36]], DETAIL);
    k.hatch([[0.3, 0.34], [0.44, 0.56], [0.52, 0.84], [0.34, 0.84]], 1.05, 0.035);
    k.hatch([[0.64, 0.2], [0.96, 0.84], [0.72, 0.84]], 1.05, 0.035);
    k.line([[0.02, 0.86], [0.98, 0.86]], DETAIL);
    k.ring(0.16, 0.2, 0.07, 0.07, DETAIL);
    for (const [u, v] of [[0.44, 0.14], [0.52, 0.1]] as Pt[]) {
      k.line([...k.bez([u - 0.04, v], [u - 0.03, v - 0.025], [u - 0.01, v - 0.02], [u, v + 0.005], 5), ...k.bez([u, v + 0.005], [u + 0.01, v - 0.02], [u + 0.03, v - 0.025], [u + 0.04, v], 5).slice(1)], DETAIL);
    }
  },

  moon: (k) => {
    const outer = k.arc(0.46, 0.5, 0.34, 0.34, Math.PI * 0.35, Math.PI * 1.65, 30);
    const inner = k.arc(0.6, 0.46, 0.27, 0.29, Math.PI * 1.52, Math.PI * 0.5, 26);
    k.line([...outer, ...inner.slice(1), outer[0]]);
    k.ring(0.3, 0.38, 0.04, 0.035, DETAIL);
    k.ring(0.26, 0.58, 0.028, 0.026, DETAIL);
    k.ring(0.37, 0.72, 0.022, 0.02, DETAIL);
    k.hatch([[0.14, 0.45], [0.2, 0.3], [0.24, 0.62], [0.2, 0.72]], 0.5, 0.03);
    k.sparkle(0.78, 0.2, 0.08);
    k.sparkle(0.86, 0.58, 0.05, DETAIL);
    k.dot(0.74, 0.82, 0.014);
    k.dot(0.9, 0.36, 0.01, DETAIL);
  },

  star: (k) => {
    const turn = k.r.range(-0.12, 0.12);
    k.line(star5(0.5, 0.52, 0.4, 0.17, turn));
    k.line(star5(0.5, 0.52, 0.3, 0.13, turn).slice(0, 7), DETAIL);
    k.hatch(star5(0.5, 0.52, 0.34, 0.14, turn).slice(0, 10), 0.8, 0.045);
    k.line([[0.86, 0.2], [0.94, 0.12]], DETAIL);
    k.line([[0.88, 0.3], [0.97, 0.28]], DETAIL);
    k.line([[0.14, 0.14], [0.19, 0.2]], DETAIL);
  },

  sparkle: (k) => {
    k.sparkle(0.46, 0.52, 0.34);
    k.sparkle(0.46, 0.52, 0.16, DETAIL);
    k.sparkle(0.8, 0.2, 0.1, DETAIL);
    k.dot(0.82, 0.78, 0.016);
    k.dot(0.16, 0.2, 0.014);
    k.dot(0.9, 0.52, 0.01, DETAIL);
  },

  heart: (k) => {
    const outline = heartPts(0.5, 0.48, 0.78);
    k.line(outline);
    k.line(heartPts(0.5, 0.48, 0.62).slice(28, 44), DETAIL);
    k.hatch(heartPts(0.5, 0.48, 0.7).slice(24, 49), 0.75, 0.04);
    for (const [u, v, a] of [[0.9, 0.18, -0.6], [0.95, 0.3, -0.2], [0.84, 0.1, -1.1]] as Array<[number, number, number]>) {
      k.line([[u, v], [u + Math.cos(a) * 0.06, v + Math.sin(a) * 0.06]], DETAIL);
    }
  },

  leaf: (k) => {
    k.leaf([0.16, 0.86], -0.85, 0.95, 0.24, 1, 5);
    k.line(k.bez([0.16, 0.86], [0.12, 0.9], [0.08, 0.92], [0.04, 0.97], 6));
  },

  arrow: (k) => {
    const shaft = k.bez([0.06, 0.62], [0.3, 0.3], [0.62, 0.3], [0.9, 0.52], 18);
    k.line(shaft);
    const [tu, tv] = shaft[shaft.length - 1];
    const [bu, bv] = shaft[shaft.length - 3];
    const back = Math.atan2(bv - tv, bu - tu);
    const arm = (a: number): Pt => [tu + Math.cos(back + a) * 0.14, tv + Math.sin(back + a) * 0.14];
    k.line([arm(0.5), [tu, tv], arm(-0.5)]);
    // Fletching at the tail, and the dashes of its flight.
    for (const f of [0, 0.05]) {
      const [u, v] = shaft[1 + Math.round(f * 40)];
      k.line([[u, v], [u - 0.05, v - 0.08]], DETAIL);
      k.line([[u, v], [u - 0.09, v + 0.01]], DETAIL);
    }
    for (const v of [0.72, 0.8]) k.line([[0.1 + (v - 0.72), v], [0.2 + (v - 0.72), v - 0.04]], DETAIL, 0.3);
  },

  books: (k) => {
    const book = (u0: number, u1: number, v0: number, v1: number, lean: number) => {
      const P = (u: number, v: number): Pt => [u + (v - v1) * lean, v];
      k.line([P(u0, v1), P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)]);
      k.line([P(u0 + 0.05, v0 + 0.01), P(u0 + 0.05, v1 - 0.01)], DETAIL);
      k.line([P(u1 - 0.05, v0 + 0.01), P(u1 - 0.05, v1 - 0.01)], DETAIL);
      k.line([P((u0 + u1) / 2 - 0.1, (v0 + v1) / 2), P((u0 + u1) / 2 + 0.1, (v0 + v1) / 2)], DETAIL);
    };
    book(0.12, 0.88, 0.76, 0.92, 0);
    book(0.18, 0.8, 0.6, 0.76, 0.12);
    book(0.1, 0.78, 0.46, 0.6, -0.08);
    k.hatch([[0.13, 0.77], [0.2, 0.77], [0.2, 0.91], [0.13, 0.91]], 1.57, 0.025);
    // A ribbon, and a small plant on top.
    k.line(k.bez([0.62, 0.6], [0.63, 0.66], [0.6, 0.72], [0.64, 0.78], 8), DETAIL);
    k.line([[0.36, 0.46], [0.38, 0.36], [0.5, 0.36], [0.52, 0.46]]);
    k.leaf([0.44, 0.36], -2.2, 0.16, 0.05, DETAIL, 1);
    k.leaf([0.45, 0.36], -1.0, 0.18, 0.05, DETAIL, 1);
  },

  envelope: (k) => {
    k.line([[0.08, 0.28], [0.92, 0.28], [0.92, 0.78], [0.08, 0.78], [0.08, 0.28]]);
    k.line([[0.08, 0.3], [0.5, 0.58], [0.92, 0.3]]);
    k.line([[0.08, 0.76], [0.38, 0.52]], DETAIL);
    k.line([[0.92, 0.76], [0.62, 0.52]], DETAIL);
    k.line(heartPts(0.5, 0.59, 0.16), 1);
    k.hatch(heartPts(0.5, 0.59, 0.14), 0.8, 0.025);
    for (const v of [0.4, 0.5, 0.6]) k.line([[0.94 + (v - 0.5) * 0.1, v], [0.99 + (v - 0.5) * 0.1, v - 0.01]], DETAIL);
  },

  camera: (k) => {
    k.line([[0.1, 0.36], [0.34, 0.36], [0.38, 0.28], [0.58, 0.28], [0.62, 0.36], [0.9, 0.36], [0.9, 0.78], [0.1, 0.78], [0.1, 0.36]]);
    k.ring(0.5, 0.56, 0.16, 0.16);
    k.ring(0.5, 0.56, 0.1, 0.1, DETAIL);
    k.line(k.arc(0.5, 0.56, 0.06, 0.06, Math.PI * 1.1, Math.PI * 1.5, 8), DETAIL);
    k.hatch(k.arc(0.5, 0.56, 0.095, 0.095, 0, TAU, 24), 0.8, 0.028);
    k.line([[0.74, 0.42], [0.84, 0.42], [0.84, 0.48], [0.74, 0.48], [0.74, 0.42]], DETAIL);
    k.line([[0.18, 0.36], [0.18, 0.31], [0.26, 0.31], [0.26, 0.36]], DETAIL);
    k.line([[0.12, 0.44], [0.3, 0.44]], DETAIL);
  },

  bulb: (k) => {
    const glass = [...k.bez([0.4, 0.66], [0.3, 0.56], [0.22, 0.44], [0.3, 0.3], 10), ...k.bez([0.3, 0.3], [0.38, 0.14], [0.62, 0.14], [0.7, 0.3], 12).slice(1), ...k.bez([0.7, 0.3], [0.78, 0.44], [0.7, 0.56], [0.6, 0.66], 10).slice(1)];
    k.line(glass);
    k.line([[0.4, 0.66], [0.41, 0.78], [0.59, 0.78], [0.6, 0.66]]);
    for (const v of [0.7, 0.74]) k.line([[0.41, v], [0.59, v]], DETAIL);
    k.line([[0.46, 0.8], [0.48, 0.84], [0.52, 0.84], [0.54, 0.8]], DETAIL);
    k.line([[0.44, 0.64], [0.46, 0.46], [0.49, 0.52], [0.51, 0.44], [0.54, 0.5], [0.56, 0.46], [0.56, 0.64]], DETAIL);
    k.line(k.arc(0.5, 0.36, 0.14, 0.14, Math.PI * 1.15, Math.PI * 1.4, 8), DETAIL);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.55;
      k.line([[0.5 + Math.cos(a) * 0.34, 0.38 + Math.sin(a) * 0.34], [0.5 + Math.cos(a) * 0.44, 0.38 + Math.sin(a) * 0.44]], DETAIL);
    }
  },

  plane: (k) => {
    k.line([[0.06, 0.5], [0.94, 0.2], [0.5, 0.72], [0.4, 0.56], [0.06, 0.5]]);
    k.line([[0.4, 0.56], [0.94, 0.2]], DETAIL);
    k.line([[0.4, 0.56], [0.42, 0.72], [0.5, 0.63]], DETAIL);
    // The loop it flew.
    const trail: Pt[] = [...k.bez([0.06, 0.6], [-0.02, 0.8], [0.24, 0.94], [0.3, 0.8], 14), ...k.bez([0.3, 0.8], [0.34, 0.7], [0.2, 0.7], [0.24, 0.82], 8).slice(1), ...k.bez([0.24, 0.82], [0.28, 0.94], [0.5, 0.96], [0.62, 0.9], 12).slice(1)];
    // Dashes longer than the pen's taper, or they vanish when it is small.
    for (let i = 0; i + 3 < trail.length; i += 6) k.line(trail.slice(i, i + 4), DETAIL, 0.3);
  },

  rainbow: (k) => {
    for (const [ru, w] of [[0.36, 1], [0.28, DETAIL], [0.2, 1]] as Array<[number, number]>) k.line(k.arc(0.5, 0.72, ru, ru * 1.05, Math.PI, TAU, 26), w);
    k.hatch([...k.arc(0.5, 0.72, 0.28, 0.294, Math.PI, TAU, 16), ...k.arc(0.5, 0.72, 0.2, 0.21, TAU, Math.PI, 16)], 1.3, 0.035);
    for (const u of [0.18, 0.82]) {
      k.line([...k.arc(u - 0.07, 0.74, 0.06, 0.05, Math.PI * 0.5, Math.PI * 1.6, 10), ...k.arc(u + 0.02, 0.7, 0.07, 0.07, Math.PI * 1.1, Math.PI * 2.1, 10).slice(1), ...k.arc(u + 0.09, 0.76, 0.05, 0.045, Math.PI * 1.4, Math.PI * 2.5, 8).slice(1)]);
      k.line([[u - 0.12, 0.8], [u + 0.13, 0.8]]);
    }
  },

  music: (k) => {
    k.ring(0.28, 0.76, 0.1, 0.075, 1, -0.4);
    k.ring(0.68, 0.68, 0.1, 0.075, 1, -0.4);
    k.hatch(k.arc(0.28, 0.76, 0.09, 0.065, 0, TAU, 20, -0.4), 0.9, 0.025);
    k.hatch(k.arc(0.68, 0.68, 0.09, 0.065, 0, TAU, 20, -0.4), 0.9, 0.025);
    k.line([[0.37, 0.74], [0.37, 0.24]]);
    k.line([[0.77, 0.66], [0.77, 0.16]]);
    k.line([[0.37, 0.24], [0.77, 0.16]]);
    k.line([[0.37, 0.34], [0.77, 0.26]], DETAIL);
    k.sparkle(0.12, 0.3, 0.06, DETAIL);
  },

  // A twenty-sided die, for the game night.
  d20: (k) => {
    const hex: Pt[] = Array.from({ length: 7 }, (_, i) => {
      const a = -Math.PI / 2 + (i * TAU) / 6;
      return [0.5 + Math.cos(a) * 0.42, 0.52 + Math.sin(a) * 0.42] as Pt;
    });
    k.line(hex);
    const tri: Pt[] = [[0.5, 0.3], [0.7, 0.64], [0.3, 0.64], [0.5, 0.3]];
    k.line(tri);
    for (const [a, b] of [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [3, 2], [4, 2], [5, 2], [5, 0]] as Array<[number, number]>) k.line([hex[a], tri[b]], DETAIL);
    k.hatch([[0.7, 0.64], [0.3, 0.64], [hex[3][0], hex[3][1]]], 0.6, 0.03);
    // The 20 on its face.
    k.line([...k.bez([0.425, 0.465], [0.43, 0.42], [0.49, 0.42], [0.485, 0.47], 8), ...k.bez([0.485, 0.47], [0.48, 0.5], [0.44, 0.52], [0.425, 0.56], 6).slice(1), [0.495, 0.555]], DETAIL);
    k.ring(0.545, 0.49, 0.03, 0.05, DETAIL);
  },

  popcorn: (k) => {
    k.line([[0.24, 0.42], [0.76, 0.42], [0.68, 0.94], [0.32, 0.94], [0.24, 0.42]]);
    for (const [u0, u1] of [[0.34, 0.38], [0.5, 0.5], [0.66, 0.62]] as Array<[number, number]>) k.line([[u0, 0.44], [u1, 0.92]], DETAIL);
    k.hatch([[0.26, 0.44], [0.34, 0.44], [0.38, 0.92], [0.32, 0.92]], 1.4, 0.03);
    k.hatch([[0.5, 0.44], [0.58, 0.44], [0.56, 0.92], [0.5, 0.92]], 1.4, 0.03);
    for (const [u, v, rr] of [[0.3, 0.38, 0.07], [0.42, 0.32, 0.08], [0.56, 0.3, 0.08], [0.7, 0.37, 0.07], [0.5, 0.2, 0.07], [0.36, 0.22, 0.06], [0.64, 0.22, 0.06]] as Array<[number, number, number]>) {
      k.line([...k.arc(u, v, rr, rr * 0.85, Math.PI * 0.9, Math.PI * 1.5, 6), ...k.arc(u + rr * 0.6, v - rr * 0.2, rr * 0.55, rr * 0.5, Math.PI * 1.3, Math.PI * 2.2, 6).slice(1), ...k.arc(u + rr * 0.4, v + rr * 0.4, rr * 0.5, rr * 0.45, Math.PI * 1.8, Math.PI * 2.8, 6).slice(1)], DETAIL);
    }
  },

  smiley: (k) => {
    k.ring(0.5, 0.5, 0.4, 0.4);
    // Eyes smiling shut, a grin with a dimple at each end, blushing cheeks.
    k.line(k.arc(0.37, 0.42, 0.06, 0.05, Math.PI * 1.1, Math.PI * 1.9, 8));
    k.line(k.arc(0.63, 0.42, 0.06, 0.05, Math.PI * 1.1, Math.PI * 1.9, 8));
    const grin = k.arc(0.5, 0.52, 0.2, 0.17, Math.PI * 0.12, Math.PI * 0.88, 14);
    k.line(grin);
    for (const [u, v] of [grin[0], grin[grin.length - 1]]) k.line([[u - 0.02, v - 0.03], [u + 0.02, v + 0.03]], DETAIL, 0);
    for (const u of [0.25, 0.75]) for (const d of [-0.03, 0, 0.03]) k.line([[u + d - 0.012, 0.64], [u + d + 0.012, 0.6]], DETAIL, 0);
  },

  lightning: (k) => {
    const bolt: Pt[] = [[0.58, 0.04], [0.26, 0.54], [0.48, 0.54], [0.36, 0.96], [0.76, 0.4], [0.54, 0.4], [0.7, 0.04], [0.58, 0.04]];
    k.line(bolt);
    k.hatch(bolt.slice(0, 7), 1.2, 0.035);
  },
} satisfies Record<string, Draw>;

export type DoodleName = keyof typeof DRAW;

/** Every doodle's name. */
export const DOODLE_NAMES = Object.keys(DRAW) as DoodleName[];

/** A doodle, stroke by stroke with each stroke's weight, in an s x s box at (x, y). */
export function doodle(name: DoodleName, x: number, y: number, s: number, seed: number): DoodleStroke[] {
  const k = new Sketch(x, y, s, makeRng(seed * 7919 + name.length), seed);
  DRAW[name](k);
  return k.out;
}
