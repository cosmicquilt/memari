// Hand-drawn fills: what a person draws into a box when they fill it in with
// a pen rather than tick it (2026-10-07: "hand drawn filling of random styles
// ... make it realistic not perfect like it was drawn in different styles").
// Kept from the first set, as Andrew chose: hatch, crosshatch, dashes, the
// kolam lattice, rings, triangles, waves and scales. Added: Mexican-inspired
// and Southwest-inspired ones ("maybe mexican/native or western desert
// inspired"), Western ones from cowboy shirts ("i mean southwest like cowboy
// shirt patterns but you can try yours too") - and designs that run on
// across cells ("designs where multiple cells connect to make larger
// designs", "sometimes the entire module (with empty gaps for missing
// days)").
//
// Each pattern draws pen paths over a box (print px) and is cut to a cell -
// or to the ellipse inside it, for a round thing. Drawn over a WORLD box (a
// run of cells, or two by two) and cut to each cell in turn, it is one design
// across them, the printed lines between left showing. Never exact: spacing
// drifts, lines lean and stop short or run on, loops do not quite close.
// `loose` (0 neat to 1 loose) is how much, the drawer's own.
//
// Inspired by, not copies of: the kolam lattice is the pulli grid of dots
// with a loop round each; the Mexican ones are a Talavera tile's flower and
// corner rings, a Mitla-style step fret, a Tenango-style flower in satin
// stitch, serape stripes; the Southwest ones generic weaving and landscape
// geometry - a stepped diamond, stepped terraces, mesas, dunes, a saguaro;
// the Western ones a cowboy shirt's - plaid, a rope twist, a pointed yoke
// with pearl snaps, embroidered scrolls - and a bandana's border.
// Nothing ceremonial or belonging to one community, and none of the
// Aboriginal Western Desert iconography, which carries Dreaming stories.

import { rng, type Rng } from "./rng";
import { wobble, type Path } from "./strokes";

export type Box = [number, number, number, number];

export const STROKE_PATTERNS = ["hatch", "crosshatch", "dashes"] as const;
export const KOLAM_PATTERNS = ["kolam-lattice", "rings"] as const;
export const TILE_PATTERNS = ["scales", "waves", "triangles"] as const;
export const MEXICAN_PATTERNS = ["talavera", "greca", "otomi", "serape"] as const;
export const SOUTHWEST_PATTERNS = ["stepped-diamond", "terraces", "mesa", "dunes", "cactus"] as const;
export const WESTERN_PATTERNS = ["plaid", "rope", "yoke", "scroll", "bandana"] as const;
export type PatternName =
  | (typeof STROKE_PATTERNS)[number]
  | (typeof KOLAM_PATTERNS)[number]
  | (typeof TILE_PATTERNS)[number]
  | (typeof MEXICAN_PATTERNS)[number]
  | (typeof SOUTHWEST_PATTERNS)[number]
  | (typeof WESTERN_PATTERNS)[number];

/** Drawn on along a run of cells in a row as one design. */
export const RUN_PATTERNS: PatternName[] = ["hatch", "crosshatch", "dashes", "kolam-lattice", "scales", "waves", "triangles", "talavera", "greca", "serape", "terraces", "mesa", "dunes", "plaid", "rope", "yoke", "scroll"];
/** Drawn across a block of cells - two by two, up to three by three -
 *  about its middle. */
export const SQUARE_PATTERNS: PatternName[] = ["rings", "stepped-diamond", "otomi", "talavera", "kolam-lattice", "bandana", "plaid"];
/** One shape about a block's middle that reaches only its inner cells: over
 *  more than two by two, the corner cells - days done - were left blank. */
export const CENTRED_PATTERNS: PatternName[] = ["stepped-diamond", "otomi"];
/** Drawn along a bar. */
export const BAND_PATTERNS: PatternName[] = ["hatch", "dashes", "waves", "scales", "triangles", "kolam-lattice", "greca", "serape", "terraces", "mesa", "dunes", "rope", "yoke", "scroll"];
/** Bands: one strip across the middle of what they are drawn over - over
 *  a whole module, drawn again along each of its rows. */
export const BANDED_PATTERNS: PatternName[] = ["greca", "terraces", "rope", "yoke", "scroll", "mesa"];
/** Drawn over a whole module at once, every cell of it: the tilings, and
 *  the bands row by row. (A design about a middle - rings, a diamond, a
 *  flower, a bandana - left most of a wide module's cells near empty.) */
export const WHOLE_PATTERNS: PatternName[] = ["hatch", "crosshatch", "dashes", "kolam-lattice", "scales", "waves", "triangles", "talavera", "serape", "plaid", "dunes", ...BANDED_PATTERNS];

export type PatternHand = {
  /** 0 neat ... 1 loose. */
  loose: number;
  /** How far a stroke may run past the edge, print px. */
  over: number;
  /** The hand's own slant for hatching, radians. */
  slant: number;
};

/** `grid`: how many cells across and down the box spans, when it is a
 *  world of several (null: one cell). */
type Gen = (b: Box, r: Rng, u: number, hand: PatternHand, grid: [number, number] | null) => Path[];

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

/** Whether (x, y) is inside a closed polygon. */
function inPoly(poly: Path, x: number, y: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [poly[i], poly[i + 1], poly[j], poly[j + 1]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const boundsOf = (p: Path): Box => {
  const xs = p.filter((_, i) => i % 2 === 0);
  const ys = p.filter((_, i) => i % 2 === 1);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  return [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0];
};

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

const move = (p: Path, dx: number, dy: number): Path => p.map((v, i) => (i % 2 ? v + dy : v + dx));

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

/** A teardrop, round end at the origin's left and point at +x, `len` long
 *  and `fat` wide. */
function teardrop(len: number, fat: number, points = 28): Path {
  const out: Path = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * TAU;
    out.push(((Math.cos(t) + 1) / 2) * len, Math.sin(t) * Math.pow(Math.abs(Math.sin(t / 2)), 1.4) * fat);
  }
  return out;
}

/** A petal on a flower at (cx, cy), along angle `a`: its point `from` the
 *  middle, its round end out at `to`, `fat` wide. */
function petal(cx: number, cy: number, a: number, from: number, to: number, fat: number): Path {
  const drop = turn(teardrop(to - from, fat), 0, 0, Math.PI);
  return turn(move(drop, cx + to, cy), cx, cy, a);
}

/** An arc over the top from x = a to x = b, centred between them at height
 *  yy: a rounded cap, drawn in the direction a to b. */
function cap(a: number, b: number, yy: number): Path {
  const out: Path = [];
  for (let k = 0; k <= 8; k++) {
    const ang = a < b ? Math.PI + (k / 8) * Math.PI : TAU - (k / 8) * Math.PI;
    out.push((a + b) / 2 + (Math.cos(ang) * Math.abs(b - a)) / 2, yy + (Math.sin(ang) * Math.abs(b - a)) / 2);
  }
  return out;
}

/** A stepped (terraced) diamond about (cx, cy), `R` to each point, `n`
 *  steps a side - the stairs outward of the plain diamond's edges. */
function steppedDiamond(cx: number, cy: number, R: number, n: number): Path {
  const st = R / n;
  const corners: Array<[number, number]> = [[0, -R], [R, 0], [0, R], [-R, 0]];
  const out: Path = [cx, cy - R];
  corners.forEach(([px, py], q) => {
    const [nx, ny] = corners[(q + 1) % 4];
    const [dx, dy] = [Math.sign(nx - px), Math.sign(ny - py)];
    let [x, y] = [px, py];
    for (let i = 0; i < n; i++) {
      // Across then down on the top and bottom edges, down then across on
      // the sides: always out from the plain diamond.
      if (q % 2 === 0) {
        x += dx * st;
        out.push(cx + x, cy + y);
        y += dy * st;
      } else {
        y += dy * st;
        out.push(cx + x, cy + y);
        x += dx * st;
      }
      out.push(cx + x, cy + y);
    }
  });
  return out;
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
        const e = Math.min(len, s + u * r.range(0.22, 0.42));
        out.push([x0 + ((x1 - x0) * s) / len, y0 + ((y1 - y0) * s) / len, x0 + ((x1 - x0) * e) / len, y0 + ((y1 - y0) * e) / len]);
        s = e + u * r.range(0.1, 0.22);
      }
      return out;
    }),
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
          const rr = ((d / 2) * 0.96) / Math.pow(Math.pow(Math.abs(ca), 1.25) + Math.pow(Math.abs(sa), 1.25), 1 / 1.25);
          p.push(cx + ca * rr, cy + sa * rr);
        }
        out.push(p);
      }
    }
    return out;
  },
  rings: (b, r, u, hand, grid) => {
    const [x, y, w, h] = b;
    // Concentric rings: about the middle of a block of cells (so one target
    // across four), or of one cell - or a rainbow from a corner.
    const centred = grid !== null || r.chance(0.5);
    const [cx, cy] = centred ? [x + w / 2 + r.range(-1, 1) * hand.loose * 3, y + h / 2 + r.range(-1, 1) * hand.loose * 3] : [x + (r.chance(0.5) ? 0 : w), y + h];
    const gap = u * r.range(0.13, 0.18);
    const out: Path[] = [];
    for (let rr = gap * 0.7; rr < Math.hypot(w, h) * (centred ? 0.55 : 1); rr += gap * r.range(0.85, 1.15)) out.push(loop(r, cx, cy, rr, rr, hand.loose * 0.6, 40));
    return out;
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
  talavera: (b, r, u, hand, grid) => {
    const [x, y, w, h] = b;
    // A tile to a cell: a four-petal flower in its middle, and rings at its
    // corners - which, cell beside cell, close into circles round the
    // corners the cells share.
    const [cols, rows] = grid ?? [1, 1];
    const [tw, th] = [w / cols, h / rows];
    const t = Math.min(tw, th);
    const out: Path[] = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const [cx, cy] = [x + (i + 0.5) * tw, y + (j + 0.5) * th];
        out.push(loop(r, cx, cy, t * 0.07, t * 0.07, hand.loose, 10));
        const a0 = r.chance(0.5) ? Math.PI / 4 : 0;
        for (let k = 0; k < 4; k++) out.push(petal(cx, cy, a0 + (k * Math.PI) / 2 + r.range(-0.06, 0.06) * hand.loose, t * 0.1, t * 0.34, t * 0.11));
      }
    }
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const [gx, gy] = [x + i * tw, y + j * th];
        out.push(loop(r, gx, gy, t * 0.26, t * 0.26, hand.loose, 22), loop(r, gx, gy, t * 0.14, t * 0.14, hand.loose, 16));
      }
    }
    return out;
  },
  greca: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // A step fret, as on the walls at Mitla: a staircase up to a hook, over
    // and over, between two border lines.
    const H = Math.min(h * 0.62, u * 0.6);
    const top = y + (h - H) / 2 + r.range(-1, 1) * hand.loose * 2;
    const U = H * r.range(1.15, 1.35);
    const out: Path[] = [
      [x - 3, top - H * 0.2, x + w + 3, top - H * 0.2 + r.range(-1, 1) * hand.loose],
      [x - 3, top + H, x + w + 3, top + H + r.range(-1, 1) * hand.loose],
    ];
    const unit: Array<[number, number]> = [[0, 1], [0.12, 1], [0.12, 0.78], [0.26, 0.78], [0.26, 0.56], [0.4, 0.56], [0.4, 0.34], [0.54, 0.34], [0.54, 0.06], [0.94, 0.06], [0.94, 0.62], [0.72, 0.62], [0.72, 0.36]];
    for (let ux = x - U * r.range(0, 0.8); ux < x + w; ux += U * r.range(0.97, 1.03)) out.push(unit.flatMap(([fx, fy]) => [ux + fx * U, top + fy * H]));
    return out;
  },
  otomi: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // A Tenango-style flower: petals filled in close satin stitch - lines
    // across each petal, held inside its outline.
    const s = Math.min(w, h) * 0.92;
    const [cx, cy] = [x + w / 2 + r.range(-1, 1) * w * 0.04, y + h / 2 + r.range(-1, 1) * h * 0.04];
    const n = r.int(5, 7);
    const a0 = r.range(0, TAU);
    const out: Path[] = [loop(r, cx, cy, s * 0.11, s * 0.11, hand.loose, 14)];
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * TAU + r.range(-0.08, 0.08) * hand.loose;
      const p = petal(cx, cy, a, s * 0.14, s * 0.48, s * 0.16);
      out.push(p);
      const stitch = a + Math.PI / 2 + r.range(-0.15, 0.15);
      out.push(...lines(boundsOf(p), r, stitch, Math.max(3.2, s * 0.05), 0.15).flatMap((l) => clip(l, (px, py) => inPoly(p, px, py))));
    }
    return out;
  },
  serape: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // Woven stripes: a pair of fine lines, a chain of diamonds, a band of
    // ticks, a zigzag - in a seeded order, across the whole width.
    const kinds = r.shuffle(["double", "diamonds", "ticks", "zig"]);
    const out: Path[] = [];
    const j = () => r.range(-1, 1) * hand.loose;
    let yy = y + u * r.range(0.04, 0.1);
    for (let k = 0; yy < y + h - u * 0.05; k++) {
      const kind = kinds[k % kinds.length];
      if (kind === "double") {
        out.push([x - 3, yy, x + w + 3, yy + j()], [x - 3, yy + u * 0.06, x + w + 3, yy + u * 0.06 + j()]);
        yy += u * 0.06;
      } else if (kind === "diamonds") {
        const d = u * 0.22;
        for (let cx = x - d / 2 + r.range(0, d * 0.3); cx < x + w + d; cx += d * 1.15) out.push([cx, yy, cx + d * 0.55, yy + d / 2, cx, yy + d, cx - d * 0.55, yy + d / 2, cx, yy]);
        yy += d;
      } else if (kind === "ticks") {
        for (let px = x + r.range(0, u * 0.06); px < x + w; px += u * r.range(0.06, 0.08)) out.push([px, yy, px + j(), yy + u * 0.12]);
        yy += u * 0.12;
      } else {
        const p: Path = [];
        for (let i = 0, px = x - 3; px <= x + w + 3; i++, px += u * 0.1) p.push(px, yy + (i % 2 ? u * 0.13 : 0));
        out.push(p);
        yy += u * 0.13;
      }
      yy += u * r.range(0.06, 0.1);
    }
    return out;
  },
  "stepped-diamond": (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // A weaving's stepped diamond: terraced outside, a plain one inside, a
    // small hatched one at its heart - over four cells, about their corner.
    const [cx, cy] = [x + w / 2 + r.range(-1, 1) * hand.loose * 2, y + h / 2 + r.range(-1, 1) * hand.loose * 2];
    const R = Math.min(w, h) * r.range(0.44, 0.5);
    const inner = R * 0.55;
    const core = R * 0.24;
    const diamond = (s: number): Path => [cx, cy - s, cx + s, cy, cx, cy + s, cx - s, cy, cx, cy - s];
    const heart = diamond(core);
    return [
      steppedDiamond(cx, cy, R, r.int(3, 5)),
      diamond(inner),
      heart,
      ...lines(boundsOf(heart), r, hand.slant, Math.max(3, core * 0.28), 0.2).flatMap((l) => clip(l, (px, py) => inPoly(heart, px, py))),
    ];
  },
  terraces: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // Stepped terraces, rising and falling along a line.
    const H = Math.min(h * 0.6, u * 0.55);
    const base = y + h / 2 + H / 2;
    const n = 3;
    const st = H / n;
    const sw = st * r.range(0.8, 1.1);
    const p: Path = [x - 4, base];
    for (let px = x - r.range(0, sw * 4); px < x + w + 4; ) {
      for (let i = 0; i < n; i++) {
        p.push(px, base - st * (i + 1));
        px += sw;
        p.push(px, base - st * (i + 1));
      }
      px += sw * r.range(0.6, 1.4);
      p.push(px, base - H);
      for (let i = n; i > 0; i--) {
        p.push(px, base - st * (i - 1));
        px += sw;
        p.push(px, base - st * (i - 1));
      }
      px += sw * r.range(0.8, 1.6);
      p.push(px, base);
    }
    return [p, [x - 3, base + st * 0.5, x + w + 3, base + st * 0.5 + r.range(-1, 1) * hand.loose]];
  },
  mesa: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // A desert skyline - flat ground, a mesa, a narrow butte, a low hill -
    // run on across the cells it is drawn over; the sun over it, once; a
    // few strokes of ground.
    const horizon = y + h * r.range(0.66, 0.74);
    const sky: Path = [x - 4, horizon];
    for (let px = x - 4; px < x + w + 4; ) {
      const kind = r.pick(["flat", "mesa", "mesa", "butte", "hill"]);
      if (kind === "flat") px += u * r.range(0.15, 0.4);
      else if (kind === "hill") {
        const L = u * r.range(0.4, 0.7);
        const A = h * r.range(0.08, 0.14);
        for (let k = 1; k <= 8; k++) sky.push(px + (L * k) / 8, horizon - Math.sin((k / 8) * Math.PI) * A);
        px += L;
      } else {
        const tall = h * (kind === "butte" ? r.range(0.36, 0.46) : r.range(0.22, 0.34));
        const topW = u * (kind === "butte" ? r.range(0.1, 0.18) : r.range(0.3, 0.6));
        const slope = u * r.range(0.04, 0.08);
        sky.push(px + slope, horizon - tall, px + slope + topW, horizon - tall + r.range(-1, 1) * hand.loose);
        px += slope * 2 + topW;
      }
      sky.push(px, horizon + r.range(-1, 1) * hand.loose);
    }
    const out: Path[] = [sky];
    if (r.chance(0.75)) {
      const [sx, sy, sr] = [x + w * r.range(0.15, 0.85), y + h * r.range(0.16, 0.3), u * r.range(0.08, 0.12)];
      out.push(loop(r, sx, sy, sr, sr, hand.loose, 16));
      if (r.chance(0.5)) for (let a = r.range(0, 0.5); a < TAU; a += TAU / 8) out.push([sx + Math.cos(a) * sr * 1.5, sy + Math.sin(a) * sr * 1.5, sx + Math.cos(a) * sr * 2.1, sy + Math.sin(a) * sr * 2.1]);
    }
    for (let k = Math.round(w / (u * 0.35)); k > 0; k--) {
      const [gx, gy] = [x + r.range(0, w), r.range(horizon + 5, y + h)];
      out.push([gx, gy, gx + u * r.range(0.06, 0.14), gy + r.range(-1, 1)]);
    }
    return out;
  },
  dunes: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // Dune ridges, one behind another: a long rise into the wind, a short
    // steep fall.
    const out: Path[] = [];
    // From near the top, in the unit's terms: over a whole module a share
    // of its height left the first row empty.
    for (let yy = y + u * r.range(0.12, 0.28); yy < y + h + u * 0.1; yy += u * r.range(0.2, 0.28)) {
      const p: Path = [];
      let px = x - r.range(0, u * 0.5);
      p.push(px, yy);
      while (px < x + w + u) {
        const L = u * r.range(0.5, 0.85);
        const A = u * r.range(0.08, 0.15) * (1 + r.range(-0.2, 0.2) * hand.loose);
        for (let k = 1; k <= 6; k++) p.push(px + (k / 6) * 0.7 * L, yy - A * Math.sin(((k / 6) * Math.PI) / 2));
        p.push(px + 0.84 * L, yy - A * 0.35, px + L, yy);
        px += L;
      }
      out.push(p);
    }
    return out;
  },
  plaid: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // A shirt's plaid: bands of three close lines both ways, denser where
    // they cross, a single fine line between the bands.
    const P = u * r.range(0.42, 0.55);
    const g = Math.max(2.6, P * 0.09);
    const out: Path[] = [];
    const j = () => r.range(-1, 1) * hand.loose;
    for (let px = x + r.range(0, P); px < x + w + P; px += P) {
      for (let k = 0; k < 3; k++) out.push([px + k * g, y - 3, px + k * g + j(), y + h + 3]);
      out.push([px + P * 0.62, y - 3, px + P * 0.62 + j(), y + h + 3]);
    }
    for (let py = y + r.range(0, P); py < y + h + P; py += P) {
      for (let k = 0; k < 3; k++) out.push([x - 3, py + k * g, x + w + 3, py + k * g + j()]);
      out.push([x - 3, py + P * 0.62, x + w + 3, py + P * 0.62 + j()]);
    }
    return out;
  },
  rope: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // Rope trim: its two edges, and between them the strands, each a
    // slanted S from one edge to the other, laid close along it - one rope,
    // or two in a tall box.
    const out: Path[] = [];
    const R = Math.min(h * 0.6, u * 0.32);
    const ropes = h > R * 2.8 ? 2 : 1;
    const j = () => r.range(-1, 1) * hand.loose;
    for (let k = 0; k < ropes; k++) {
      const top = y + (h * (k + 0.5)) / ropes - R / 2;
      out.push([x - 3, top, x + w + 3, top + j()], [x - 3, top + R, x + w + 3, top + R + j()]);
      const p = R * r.range(0.5, 0.6);
      for (let px = x - R + r.range(0, p); px < x + w + R; px += p * r.range(0.95, 1.05)) {
        const s: Path = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          // Leaning forward, bellied one way then the other: an S.
          s.push(px + t * R * 0.75 + Math.sin(t * TAU) * R * 0.1, top + t * R);
        }
        out.push(s);
      }
    }
    return out;
  },
  yoke: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // A western yoke's piping: two lines close together, arching up between
    // points that face down; under each point an arrowhead tack, under each
    // arch a pearl snap.
    const span = u * r.range(0.75, 1);
    const top = y + h * 0.18;
    const dip = Math.min(h * 0.3, u * 0.28);
    const gap = Math.max(3, u * 0.07);
    const start = x - r.range(0, span);
    const out: Path[] = [];
    for (const off of [0, gap]) {
      const p: Path = [];
      for (let px = start; px < x + w + span; px += span) {
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          p.push(px + t * span, top + off + dip * (1 - Math.sin(Math.PI * t)));
        }
      }
      out.push(p);
    }
    for (let px = start; px < x + w + span; px += span) {
      const [tx, ty] = [px, top + dip + gap + u * 0.05];
      out.push([tx, ty, tx - u * 0.05, ty + u * 0.1, tx + u * 0.05, ty + u * 0.1, tx, ty]);
      const [sx, sy] = [px + span / 2, top + gap + dip * 0.5 + u * 0.14];
      out.push(loop(r, sx, sy, u * 0.05, u * 0.05, hand.loose, 10), loop(r, sx, sy, u * 0.02, u * 0.02, hand.loose, 8));
    }
    return out;
  },
  scroll: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // Western embroidery scrolls: a stem waving along, and at each crest a
    // curl rolled off it, up and down by turns, a leaf on some.
    const mid = y + h / 2;
    const amp = Math.min(h * 0.18, u * 0.14) * (1 + r.range(-0.2, 0.2) * hand.loose);
    const L = u * r.range(0.55, 0.75);
    const shift = r.range(0, L);
    const stem: Path = [];
    for (let px = x - 4; px <= x + w + 4; px += 3) stem.push(px, mid + Math.sin(((px - x + shift) / L) * Math.PI) * amp);
    const out: Path[] = [stem];
    for (let k = 0, cx = x - shift + L / 2; cx < x + w + L; k++, cx += L) {
      // Crests alternate: below the line, then above.
      const side = k % 2 === 0 ? 1 : -1;
      const cy = mid + side * amp;
      const R = Math.min(h * 0.24, u * 0.2) * r.range(0.8, 1.1);
      const curl: Path = [];
      for (let i = 0; i <= 22; i++) {
        const t = i / 22;
        const a = Math.PI + t * Math.PI * 2.3;
        const rr = R * (1 - 0.75 * t);
        curl.push(cx + R + Math.cos(a) * rr, cy + side * R * 0.2 + side * Math.sin(a) * rr);
      }
      out.push(curl);
      if (r.chance(0.6)) out.push(petal(cx - L * 0.22, cy, side > 0 ? 2.3 : -2.3, 0, u * 0.18, u * 0.06));
    }
    return out;
  },
  bandana: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // A bandana: a line round, a row of dots inside it, a small teardrop in
    // each corner, a ring of dots in the middle - over four cells or more,
    // the whole kerchief.
    const m = Math.min(w, h) * 0.08;
    const [x0, y0, x1, y1] = [x + m, y + m, x + w - m, y + h - m];
    const out: Path[] = [[x0, y0, x1, y0 + r.range(-1, 1) * hand.loose, x1, y1, x0, y1, x0, y0]];
    const step = Math.max(6, u * 0.12);
    const inset = m * 1.4 + 2;
    for (let px = x0 + inset; px <= x1 - inset; px += step) out.push(dot(r, px, y0 + inset, 1.3), dot(r, px, y1 - inset, 1.3));
    for (let py = y0 + inset + step; py <= y1 - inset - step; py += step) out.push(dot(r, x0 + inset, py, 1.3), dot(r, x1 - inset, py, 1.3));
    const s = Math.min(w, h);
    for (const [cx, cy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
      out.push(petal(cx, cy, Math.atan2(y + h / 2 - cy, x + w / 2 - cx), s * 0.1, s * 0.26, s * 0.06));
    }
    const [cx, cy, rr] = [x + w / 2, y + h / 2, s * 0.13];
    for (let k = 0; k < 8; k++) out.push(dot(r, cx + Math.cos((k / 8) * TAU) * rr, cy + Math.sin((k / 8) * TAU) * rr, 1.4));
    out.push(loop(r, cx, cy, rr * 0.4, rr * 0.4, hand.loose, 12));
    return out;
  },
  cactus: (b, r, u, hand) => {
    const [x, y, w, h] = b;
    // A saguaro on the ground line: a trunk round at the top, an arm or two
    // up from it, a rib down its middle, a pebble or two.
    const ground = y + h * 0.88;
    const H = h * r.range(0.62, 0.74);
    const W = Math.min(w, h) * 0.15;
    const cx = x + w * r.range(0.38, 0.62);
    const out: Path[] = [
      [cx - W / 2, ground, ...cap(cx - W / 2, cx + W / 2, ground - H + W / 2), cx + W / 2, ground],
      [cx + r.range(-1, 1) * hand.loose, ground - 2, cx, ground - H + W * 0.7],
    ];
    // An arm: out from the trunk, up, round, and back down to it.
    const arm = (side: number, at: number) => {
      const ay = ground - H * at;
      const reach = W * r.range(1.3, 1.8);
      const up = ay - H * r.range(0.22, 0.32) + W / 2;
      const [xo, xi] = [cx + side * (W / 2 + reach), cx + side * (W / 2 + reach - W * 0.85)];
      out.push([cx + (side * W) / 2, ay, xo, ay, xo, up, ...cap(xo, xi, up), xi, ay - W * 0.85, cx + (side * W) / 2, ay - W * 0.85]);
    };
    arm(-1, r.range(0.3, 0.5));
    if (r.chance(0.7)) arm(1, r.range(0.4, 0.6));
    out.push([x - 3, ground, x + w + 3, ground + r.range(-1, 1) * hand.loose]);
    for (let k = r.int(1, 3); k > 0; k--) out.push(dot(r, x + r.range(0.1, 0.9) * w, ground + r.range(3, 7), 1.6));
    return out;
  },
};

/**
 * A pattern drawn into a cell: `name`'s shapes, cut to the cell (or the
 * ellipse in it, if `round`), each stroke wobbled a little as a hand does.
 * Drawn over `world` (a run or block of cells, `grid` of them across and
 * down) when given, so the cells it spans make one design. `unit` is the
 * pattern's scale - about the cell's smaller side unless given (a bar, far
 * thinner than a cell, draws at a cell's scale); `seed` makes the same
 * cells draw the same way every time, and one design across a block.
 */
export function pattern(
  name: PatternName,
  cell: Box,
  seed: number,
  hand: PatternHand,
  { round = false, world, grid, unit }: { round?: boolean; world?: Box; grid?: [number, number]; unit?: number } = {}
): Path[] {
  const r = rng(seed);
  const [x, y, w, h] = cell;
  const u = unit ?? Math.max(18, Math.min(Math.min(w, h), 90));
  const inside = round
    ? (px: number, py: number) => {
        const [dx, dy] = [(px - (x + w / 2)) / (w / 2 + hand.over), (py - (y + h / 2)) / (h / 2 + hand.over)];
        return dx * dx + dy * dy <= 1;
      }
    : (px: number, py: number) => px >= x - hand.over && px <= x + w + hand.over && py >= y - hand.over && py <= y + h + hand.over;
  // A loose hand's lines wander: up to 3px at print size, a fine pen's
  // width or so.
  const amp = 0.4 + 2.6 * hand.loose;
  return GENS[name](world ?? cell, r, u, hand, world ? (grid ?? [1, 1]) : null)
    .flatMap((p) => clip(p, inside))
    .map((p, i) => (p.length <= 4 ? p : wobble(p, amp, seed * 31 + i, 6)));
}
