// Handwriting from real handwriting fonts, one letter at a time.
//
// A handwriting font typesets: every "a" is the same "a", the baseline is a
// ruler and the spacing is even, and that is what gives it away. So each
// letter is drawn on its own, with small variation that is SMOOTH along the
// line rather than random per letter - a hand drifts, it does not shake:
//   - the baseline wanders a few percent of the letter height, slowly;
//   - each letter is a little larger or smaller, wider or narrower, and
//     leans and shears by a degree or two;
//   - the gaps vary, and the whole line sits at a slight angle.
// Numbers from looking at real planner pages, tuned by eye against them.
//
// Writing is a reveal: as the pen reaches a letter, the letter is uncovered
// from its left edge to its right, a strip at a time (see paintGlyph). At
// the speed a filled-in page plays back, that reads as the letter being
// written.

import { noise1, rng as makeRng } from "./rng";
import { FEEL, grainAt, roughen, type InkFeel } from "./paperInk";

export type Glyph = {
  ch: string;
  /** Pen position at the letter's origin, print px. */
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
  shear: number;
  /** The letter's ink extent either side of its origin, print px, before
   *  scaling - what the reveal uncovers. */
  left: number;
  right: number;
  /** How far the pen moves on after it. */
  advance: number;
  color: string;
  seed: number;
  /** The letter rendered once, roughened into the paper - see paintGlyph. */
  sprite?: { canvas: HTMLCanvasElement; scale: number; ox: number; oy: number };
};

export type GlyphRun = {
  family: string;
  weight: number;
  size: number;
  glyphs: Glyph[];
  width: number;
  feel: InkFeel;
};

let measurer: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D {
  if (!measurer) measurer = document.createElement("canvas").getContext("2d")!;
  return measurer;
}

export type GlyphOptions = {
  family: string;
  weight?: number;
  /** Font size in print px. */
  size: number;
  x: number;
  y: number;
  seed: number;
  color: string;
  /** Extra space between letters, fraction of the size. */
  tracking?: number;
  /** Whole-line angle, radians. */
  angle?: number;
  maxWidth?: number;
  /** What the pen is: a marker bleeds, a ballpoint skips. */
  pen?: keyof typeof FEEL;
};

/** Slightly vary a hex colour's lightness - pressure shows in the ink. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + amount))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

export function layoutGlyphs(text: string, o: GlyphOptions): GlyphRun {
  const ctx = measureCtx();
  const weight = o.weight ?? 400;
  const r = makeRng(o.seed);
  const drift = noise1(o.seed + 11);
  const wander = noise1(o.seed + 12);
  const tracking = o.tracking ?? 0;
  ctx.font = `${weight} ${o.size}px ${o.family}`;
  const natural = ctx.measureText(text).width * (1 + tracking * 2);
  const fit = o.maxWidth && natural > o.maxWidth ? Math.max(0.7, o.maxWidth / natural) : 1;
  const size = o.size * fit;
  ctx.font = `${weight} ${size}px ${o.family}`;
  const angle = o.angle ?? r.range(-0.018, 0.018);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const glyphs: Glyph[] = [];
  let pen = 0;
  for (const [i, ch] of [...text].entries()) {
    const m = ctx.measureText(ch);
    const advance = m.width * r.range(0.95, 1.06) + tracking * size;
    if (ch !== " ") {
      const lx = pen;
      const ly = drift(pen / size / 2.2) * size * 0.045 + r.range(-0.012, 0.012) * size;
      glyphs.push({
        ch,
        x: o.x + lx * cos - ly * sin,
        y: o.y + lx * sin + ly * cos,
        rot: angle + wander(i * 0.7) * 0.05 + r.range(-0.02, 0.02),
        sx: r.range(0.94, 1.06),
        sy: r.range(0.95, 1.05),
        shear: r.range(-0.06, 0.06),
        left: m.actualBoundingBoxLeft + size * 0.04,
        right: m.actualBoundingBoxRight + size * 0.04,
        advance,
        color: shade(o.color, r.range(-0.07, 0.05)),
        seed: r.int(1, 1e9),
      });
    }
    pen += advance;
  }
  return { family: o.family, weight, size, glyphs, width: pen, feel: FEEL[o.pen ?? "ink"] };
}

/** Render a letter once at the canvas's scale, then roughen it into the
 *  paper (see paperInk.ts). Made ahead of writing (ink.ts prepareInk) or on
 *  first use, and kept on the glyph. */
export function spriteOf(run: GlyphRun, g: Glyph, scale: number) {
  if (g.sprite && g.sprite.scale === scale) return g.sprite;
  // Room round the letter for the ink that bleeds past it.
  const grain = grainAt(scale);
  const pad = 3 + Math.ceil(grain * 2.5);
  const ox = Math.ceil(g.left * scale) + pad;
  const oy = Math.ceil(run.size * 1.3 * scale) + pad;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, ox + Math.ceil(g.right * scale) + pad);
  canvas.height = Math.max(1, oy + Math.ceil(run.size * 0.6 * scale) + pad);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.font = `${run.weight} ${run.size * scale}px ${run.family}`;
  ctx.fillStyle = g.color;
  ctx.fillText(g.ch, ox, oy);
  roughen(ctx, canvas.width, canvas.height, run.feel, g.seed, grain);
  g.sprite = { canvas, scale, ox, oy };
  return g.sprite;
}

/**
 * Uncover a letter from `from` to `to` (0 to 1 across its width) - only that
 * strip, so a letter drawn over several frames is never painted twice where
 * it overlaps itself. `scale` is canvas px per print px.
 */
/** Where a letter's sprite lands on the page, canvas px: x0, y0, x1, y1 -
 *  its box turned, sheared and scaled as paintGlyph draws it. */
export function glyphBounds(run: GlyphRun, g: Glyph, scale: number): [number, number, number, number] {
  const sprite = spriteOf(run, g, scale);
  const [cs, sn] = [Math.cos(g.rot), Math.sin(g.rot)];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const u of [-sprite.ox, sprite.canvas.width - sprite.ox])
    for (const v of [-sprite.oy, sprite.canvas.height - sprite.oy]) {
      const [x, y] = [g.sx * u + g.shear * v, g.sy * v];
      xs.push(g.x * scale + x * cs - y * sn);
      ys.push(g.y * scale + x * sn + y * cs);
    }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function paintGlyph(ctx: CanvasRenderingContext2D, run: GlyphRun, g: Glyph, from: number, to: number, scale: number) {
  if (to <= from) return;
  const sprite = spriteOf(run, g, scale);
  const span = (g.left + g.right) * scale;
  const x0 = -g.left * scale + span * from;
  const x1 = -g.left * scale + span * to;
  ctx.save();
  ctx.translate(g.x * scale, g.y * scale);
  ctx.rotate(g.rot);
  ctx.transform(g.sx, 0, g.shear, g.sy, 0, 0);
  ctx.beginPath();
  ctx.rect(x0, -sprite.oy, x1 - x0, sprite.canvas.height);
  ctx.clip();
  ctx.drawImage(sprite.canvas, -sprite.ox, -sprite.oy);
  ctx.restore();
}
