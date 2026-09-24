// Pen strokes: handwritten words from the single-line fonts, and the marks
// around them - ticks, underlines, loops. (Doodles are in doodles.ts.)
//
// Everything is in PRINT PX - the page's own coordinates, 2175 x 3075 on a
// 7x10 page - so a stroke lands where the page's own lines are, whatever
// size the page is finally drawn at.
//
// A stroke is a polyline in the order the pen travels it. Handwriting that
// looks written rather than typeset comes from small, SMOOTH variation: the
// baseline drifts, letters lean and resize a little, and every line has a
// faint tremor - all from seeded noise, so a page is the same every time it
// is drawn.

import fonts from "./strokeFonts.json";
import { noise1, rng as makeRng } from "./rng";

export type FontKey = "script";
type Glyph = [number, number[][]];
type StrokeFont = { name: string; ascent: number; descent: number; glyphs: Record<string, Glyph> };
const FONTS = fonts as unknown as Record<FontKey, StrokeFont>;

/** A polyline: x0, y0, x1, y1, ... */
export type Path = number[];

export type TextOptions = {
  font: FontKey;
  /** Left end of the baseline. */
  x: number;
  y: number;
  /** The em, in print px: a capital is ~0.7 of it. */
  size: number;
  /** Lean to the right, radians. */
  slant?: number;
  /** Rotation of the whole line about its start, radians. */
  angle?: number;
  /** Extra space between letters, as a fraction of the em. */
  tracking?: number;
  seed: number;
  /** Squeeze to fit - a hand writes smaller when it runs out of room. */
  maxWidth?: number;
};

/** How wide `text` would be written, in print px. */
export function measure(text: string, font: FontKey, size: number, tracking = 0): number {
  const f = FONTS[font];
  let w = 0;
  for (const ch of text) w += ((f.glyphs[ch]?.[0] ?? 500) / 1000 + tracking) * size;
  return w;
}

export function textStrokes(text: string, o: TextOptions): { paths: Path[]; width: number } {
  const f = FONTS[o.font];
  const tracking = o.tracking ?? 0;
  const natural = measure(text, o.font, o.size, tracking);
  const squeeze = o.maxWidth && natural > o.maxWidth ? o.maxWidth / natural : 1;
  const size = o.size * (squeeze < 1 ? Math.max(0.72, squeeze) : 1);
  const xScale = squeeze < 0.72 ? squeeze / 0.72 : 1;
  const r = makeRng(o.seed);
  const drift = noise1(o.seed + 1);
  const tremorX = noise1(o.seed + 2);
  const tremorY = noise1(o.seed + 3);
  const slant = Math.tan(o.slant ?? 0.08);
  const cos = Math.cos(o.angle ?? 0);
  const sin = Math.sin(o.angle ?? 0);
  const paths: Path[] = [];
  let penX = 0;
  let travelled = 0;
  for (const ch of text) {
    const glyph = f.glyphs[ch] ?? f.glyphs["?"];
    const letterScale = size * r.range(0.955, 1.045) / 1000;
    const letterLean = r.range(-0.04, 0.04);
    const baseline = drift(penX / size / 3) * size * 0.035;
    for (const stroke of glyph[1]) {
      const path: Path = [];
      for (let i = 0; i < stroke.length; i += 2) {
        const gx = stroke[i] * letterScale;
        const gy = stroke[i + 1] * letterScale;
        const t = travelled + i / 40;
        let lx = (penX + gx) * xScale + gy * (slant + letterLean) + tremorX(t) * size * 0.006;
        let ly = -gy + baseline + tremorY(t) * size * 0.006;
        const rx = lx * cos - ly * sin;
        const ry = lx * sin + ly * cos;
        lx = o.x + rx;
        ly = o.y + ry;
        path.push(lx, ly);
      }
      if (path.length >= 4) paths.push(path);
      travelled += stroke.length / 40 + 1;
    }
    penX += (glyph[0] / 1000 + tracking) * size * r.range(0.97, 1.03);
  }
  return { paths, width: penX * xScale };
}

// ---------------------------------------------------------------- doodles

/** Resample a path evenly and push it sideways by smooth noise - the
 *  difference between a drawn line and a plotted one. */
export function wobble(path: Path, amplitude: number, seed: number, step = 12): Path {
  const n = noise1(seed);
  const out: Path = [];
  let along = 0;
  for (let i = 0; i < path.length - 2; i += 2) {
    const [x0, y0, x1, y1] = [path[i], path[i + 1], path[i + 2], path[i + 3]];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    const steps = Math.max(1, Math.round(len / step));
    for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
      const t = s / steps;
      const d = n((along + t * len) / 90) * amplitude;
      out.push(x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d);
    }
    along += len;
  }
  return out;
}

const TAU = Math.PI * 2;

/** An ellipse as one stroke, starting at `start` radians and running a
 *  little past a full turn, the way a hand closes a circle. */
export function ellipse(cx: number, cy: number, rx: number, ry: number, start = -Math.PI / 2, turns = 1.08, points = 48): Path {
  const out: Path = [];
  for (let i = 0; i <= points; i++) {
    const a = start + (i / points) * TAU * turns;
    const grow = 1 + 0.04 * (i / points);
    out.push(cx + Math.cos(a) * rx * grow, cy + Math.sin(a) * ry * grow);
  }
  return out;
}

/** A check mark in an s x s box. */
export function checkMark(x: number, y: number, s: number, seed: number): Path[] {
  return [wobble([x + s * 0.1, y + s * 0.55, x + s * 0.38, y + s * 0.85, x + s * 0.95, y + s * 0.05], s * 0.02, seed, s / 6)];
}

/** A time block: a line down the hours, ticked at both ends - the way the
 *  real page in Andrew's photo marks "work" across an afternoon. */
export function timeBlock(x: number, y0: number, y1: number, seed: number): Path[] {
  return [
    wobble([x - 14, y0, x + 14, y0], 1.5, seed),
    wobble([x, y0, x + 2, (y0 + y1) / 2, x, y1], 2, seed + 1, 20),
    wobble([x - 14, y1, x + 14, y1], 1.5, seed + 2),
  ];
}

/** A line under something, slightly rising, sometimes twice. */
export function underline(x0: number, x1: number, y: number, seed: number, twice = false): Path[] {
  const r = makeRng(seed);
  const rise = r.range(-6, 4);
  const one = (dy: number, s: number) => wobble([x0, y + dy, x1, y + dy + rise], 2, s, 16);
  return twice ? [one(0, seed), one(12, seed + 1)] : [one(0, seed)];
}

/** A loose circle around a box. */
export function circleAround(x: number, y: number, w: number, h: number, seed: number): Path[] {
  const r = makeRng(seed);
  return [wobble(ellipse(x + w / 2, y + h / 2, w / 2 + 18, h / 2 + 14, r.range(-2.6, -2), 1.1, 56), 4, seed, 14)];
}
