// Turning a plan into ink over time.
//
// TIMING follows how a hand moves (from the handwriting research Andrew
// commissioned, 2026-09-22):
//   - along a stroke the pen SLOWS ON CURVES and speeds up on straights -
//     speed goes as curvature to the minus one third (Viviani and Terzuolo's
//     two-thirds power law); a constant speed is the robotic tell;
//   - it starts and stops softly;
//   - in a time-lapse the PEN-UP time is what gets squeezed - the moves
//     between strokes and words are clamped short - and the drawing itself
//     is sped up as little as the time allows. The research put the limit
//     at 3x; a whole filled-in spread at 3x takes 46 seconds, so the cap is
//     8x - at the size these words are on screen (a letter shows for about
//     50ms) it still reads as a hand writing fast, the way study time-lapses
//     look. A spread that still runs long simply takes longer.
//
// PAINTING: a stroke being drawn is re-drawn whole each frame on a WET layer
// as a pressure-shaped outline (perfect-freehand), then laid onto the ink
// layer once, when the pen lifts. Letters are uncovered strip by strip (see
// glyphs.ts). The highlighter is repainted whole on its own layer and
// multiplied underneath, because translucent ink laid in pieces darkens where
// the pieces overlap.

import { getStroke } from "perfect-freehand";
import { noise1, rng as makeRng } from "./rng";
import { paintGlyph, spriteOf, type Glyph, type GlyphRun } from "./glyphs";
import { FEEL, grainAt } from "./paperInk";
import { prepareArt, revealTo, type ArtRef, type ArtSprite } from "./art";
import type { InkItem, Pen } from "./plan";

export type TimedStroke = {
  kind: "stroke";
  page: 0 | 1;
  pts: number[];
  /** Length along the stroke at each point. */
  cum: number[];
  /** Time into the stroke at each point, 0 to 1 - slower on curves. */
  when: number[];
  length: number;
  t0: number;
  t1: number;
  pen: Pen;
  /** How far along it the pen has got, as a length. */
  drawn: number;
  /** Laid onto the ink layer: the pen has lifted. */
  done: boolean;
  pressure: (s: number) => number;
};

export type TimedGlyph = {
  kind: "glyph";
  page: 0 | 1;
  run: GlyphRun;
  glyph: Glyph;
  t0: number;
  t1: number;
  /** How much of the letter, 0 to 1, is uncovered. */
  drawn: number;
};

/** A drawn doodle (art.ts), uncovered along its own lines. */
export type TimedArt = {
  kind: "art";
  page: 0 | 1;
  ref: ArtRef;
  box: [number, number, number, number];
  seed: number;
  t0: number;
  t1: number;
  /** How far through, 0 to 1. */
  drawn: number;
  done: boolean;
  /** Made by prepareInk; a doodle that failed to load stays null and is
   *  simply not drawn. */
  art: ArtSprite | null;
};

export type Timed = TimedStroke | TimedGlyph | TimedArt;

/** Print px per second at a human pace, before the time-lapse. */
const SPEED: Record<Pen["kind"], number> = { ink: 700, marker: 600, pencil: 650, highlighter: 1200 };
/** How much faster than life the drawing itself may run. */
const MAX_SPEEDUP = 8;

/** Time along a stroke, point by point, under the two-thirds power law. */
function strokeClock(pts: number[], cum: number[]): number[] {
  const n = cum.length;
  const cost = [0];
  for (let i = 1; i < n; i++) {
    const seg = cum[i] - cum[i - 1];
    // Turning angle per unit length at this point: the curvature.
    let k = 0;
    if (i < n - 1) {
      const a1 = Math.atan2(pts[i * 2 + 1] - pts[i * 2 - 1], pts[i * 2] - pts[i * 2 - 2]);
      const a2 = Math.atan2(pts[i * 2 + 3] - pts[i * 2 + 1], pts[i * 2 + 2] - pts[i * 2]);
      let d = Math.abs(a2 - a1);
      if (d > Math.PI) d = 2 * Math.PI - d;
      k = d / Math.max(1, seg);
    }
    const speed = Math.pow(k + 0.004, -1 / 3);
    cost.push(cost[i - 1] + seg / speed);
  }
  const total = cost[n - 1] || 1;
  return cost.map((c) => c / total);
}

export function inkTimeline(items: InkItem[], targetSeconds: number, seed = 1): { strokes: Timed[]; duration: number } {
  const r = makeRng(seed);
  const out: Timed[] = [];
  // First pass at life speed, keeping pen-down and pen-up time apart.
  let t = 0;
  let down = 0;
  let last: [number, number] | null = null;
  const lift = (x: number, y: number, extra: number) => {
    // The hand moving to the next place: short, however far - the squeeze.
    const move = last ? Math.min(0.07, 0.03 + Math.hypot(x - last[0], y - last[1]) / 15000) : 0;
    t += move + extra;
  };
  for (const item of items) {
    const itemPause = 0.06 + (item.pause ?? 0);
    if (item.kind === "glyphs") {
      const pace = r.range(0.85, 1.15);
      for (const [i, glyph] of item.run.glyphs.entries()) {
        // Between words, a move; between letters of a word, barely a lift.
        if (i === 0) lift(glyph.x, glyph.y, itemPause);
        else t += 0.012;
        const t0 = t;
        const d = (0.1 + (glyph.left + glyph.right) / 520) * pace;
        t += d;
        down += d;
        out.push({ kind: "glyph", page: item.page, run: item.run, glyph, t0, t1: t, drawn: 0 });
        last = [glyph.x + glyph.right, glyph.y];
      }
      continue;
    }
    if (item.kind === "art") {
      // As long as a pen takes over a drawing this size - it is mostly line.
      const [x, y, w, h] = item.box;
      lift(x, y, itemPause);
      const t0 = t;
      const d = Math.max(0.3, ((w + h) * 3.2) / (SPEED[item.pen.kind] * r.range(0.85, 1.15)));
      t += d;
      down += d;
      out.push({ kind: "art", page: item.page, ref: item.art, box: item.box, seed: r.int(1, 1e9), t0, t1: t, drawn: 0, done: false, art: null });
      last = [x + w, y + h];
      continue;
    }
    const speed = SPEED[item.pen.kind] * r.range(0.85, 1.15);
    for (const [i, pts] of item.paths.entries()) {
      if (pts.length < 4) continue;
      const cum = [0];
      for (let j = 2; j < pts.length; j += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[j] - pts[j - 2], pts[j + 1] - pts[j - 1]));
      const length = cum[cum.length - 1];
      lift(pts[0], pts[1], i === 0 ? itemPause : 0);
      const t0 = t;
      const d = Math.max(0.05, length / speed);
      t += d;
      down += d;
      out.push({
        kind: "stroke",
        page: item.page,
        pts,
        cum,
        when: strokeClock(pts, cum),
        length,
        t0,
        t1: t,
        pen: item.pen,
        drawn: 0,
        done: false,
        pressure: noise1(r.int(1, 1e9)),
      });
      last = [pts[pts.length - 2], pts[pts.length - 1]];
    }
  }
  // The time-lapse: speed the drawing up only as much as the time needs,
  // and never past MAX_SPEEDUP. Pen-up time is already squeezed above.
  const up = t - down;
  const speedup = Math.min(MAX_SPEEDUP, Math.max(1, down / Math.max(1, targetSeconds - up)));
  let shift = 0;
  let lastT1 = 0;
  for (const s of out) {
    const gap = s.t0 - lastT1;
    const len = (s.t1 - s.t0) / speedup;
    lastT1 = s.t1;
    s.t0 = shift + gap;
    s.t1 = s.t0 + len;
    shift = s.t1;
  }
  // Still long - a crowded spread - and everything is squeezed evenly to a
  // quarter over the target, rather than letting the page sit for ever.
  const ceiling = targetSeconds * 1.25;
  if (shift > ceiling) {
    const k = ceiling / shift;
    for (const s of out) {
      s.t0 *= k;
      s.t1 *= k;
    }
    shift = ceiling;
  }
  return { strokes: out, duration: shift };
}

/** How far through a letter the pen is at time t, 0 to 1. */
function glyphProgress(s: TimedGlyph, t: number): number {
  if (t <= s.t0) return 0;
  if (t >= s.t1) return 1;
  const u = (t - s.t0) / (s.t1 - s.t0);
  return u * u * (3 - 2 * u) * 0.4 + u * 0.6;
}

/** How far along a stroke the pen is at time t, as a length. */
function strokeReach(s: TimedStroke, t: number): number {
  if (t <= s.t0) return 0;
  if (t >= s.t1) return s.length;
  // A soft start and stop, then the curvature clock inside that.
  const u0 = (t - s.t0) / (s.t1 - s.t0);
  const u = u0 * u0 * (3 - 2 * u0) * 0.35 + u0 * 0.65;
  let i = 1;
  while (i < s.when.length && s.when[i] < u) i++;
  if (i >= s.when.length) return s.length;
  const f = (u - s.when[i - 1]) / Math.max(1e-6, s.when[i] - s.when[i - 1]);
  return s.cum[i - 1] + (s.cum[i] - s.cum[i - 1]) * f;
}

/** The stroke's points up to a length, each with the pen's pressure there. */
function pointsTo(s: TimedStroke, length: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < s.cum.length; i++) {
    if (s.cum[i] > length) {
      const a = s.cum[i - 1];
      const f = (length - a) / Math.max(1e-6, s.cum[i] - a);
      const x = s.pts[(i - 1) * 2] + (s.pts[i * 2] - s.pts[(i - 1) * 2]) * f;
      const y = s.pts[(i - 1) * 2 + 1] + (s.pts[i * 2 + 1] - s.pts[(i - 1) * 2 + 1]) * f;
      out.push([x, y, 0.5 + 0.35 * s.pressure(length / 60)]);
      break;
    }
    out.push([s.pts[i * 2], s.pts[i * 2 + 1], 0.5 + 0.35 * s.pressure(s.cum[i] / 60)]);
  }
  return out;
}

/** A pressure-shaped outline of the stroke so far, filled. */
function fillStroke(ctx: CanvasRenderingContext2D, s: TimedStroke, length: number, scale: number, finished: boolean) {
  const points = pointsTo(s, length).map(([x, y, p]) => [x * scale, y * scale, p]);
  if (points.length < 2) return;
  const size = s.pen.width * scale * 1.15;
  // A real pen keeps its width: a felt tip lays a blunt, even line, and a
  // ballpoint or fine liner barely thins with pressure and ends round, with
  // at most a short flick. (A line swelling with pressure and tapering to a
  // point at both ends is a stylus's - Andrew, 2026-09-24: "look like
  // written on ipad".) Pressure shows as density instead - see `flow`.
  const outline = getStroke(points, {
    size,
    thinning: s.pen.kind === "marker" ? 0.05 : s.pen.kind === "pencil" ? 0.25 : 0.14,
    smoothing: 0.55,
    streamline: 0.35,
    simulatePressure: false,
    start: { taper: 0, cap: true },
    end: { taper: finished && s.pen.kind !== "marker" ? size * 0.6 : 0, cap: true },
    last: finished,
  });
  if (outline.length < 3) return;
  // Each line with its own ink flow, a little lighter or darker than the
  // last - and, being short of opaque, darker where lines cross - bleeding
  // a faint halo into the paper round it (see paperInk.ts).
  const feel = FEEL[s.pen.kind] ?? FEEL.ink;
  const flow = 1 - feel.pressure * 0.8 * unitHash(s.t0 * 1000 + s.pts[0]);
  ctx.fillStyle = s.pen.color;
  ctx.globalAlpha = (s.pen.kind === "pencil" ? 0.8 : 0.9) * flow;
  if (feel.bleed > 0) {
    ctx.shadowColor = withAlpha(s.pen.color, feel.bleed * 1.6);
    ctx.shadowBlur = grainAt(scale) * 1.6;
  }
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

/** A stable 0..1 from a number: the same line always gets the same flow,
 *  in its wet frames and when it is laid down. */
function unitHash(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** A #rrggbb colour at an alpha, as rgba(). */
function withAlpha(hex: string, alpha: number) {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.min(1, alpha).toFixed(3)})`;
}

export type InkLayers = {
  /** Pen ink laid down, kept between frames. */
  ink: CanvasRenderingContext2D;
  /** Strokes still being drawn, redrawn whole every frame. */
  wet: CanvasRenderingContext2D;
  /** Highlighter, repainted whole whenever it changes. */
  highlight: CanvasRenderingContext2D;
};

/**
 * Paint everything the pen has reached by time t. `scale` is canvas px per
 * print px. Returns which pages changed, so only their textures are sent to
 * the GPU again.
 */
export function paintInk(timeline: Timed[], t: number, layers: [InkLayers, InkLayers], scale: number): [boolean, boolean] {
  const changed: [boolean, boolean] = [false, false];
  const highlightDirty: [boolean, boolean] = [false, false];
  const wetDirty: [boolean, boolean] = [false, false];
  const wet: TimedStroke[] = [];
  const wetArt: TimedArt[] = [];
  for (const s of timeline) {
    if (s.t0 > t) break;
    if (s.kind === "glyph") {
      const p = glyphProgress(s, t);
      if (p <= s.drawn + 0.001) continue;
      paintGlyph(layers[s.page].ink, s.run, s.glyph, s.drawn, p, scale);
      s.drawn = p;
      changed[s.page] = true;
      continue;
    }
    if (s.kind === "art") {
      if (s.done || !s.art) continue;
      const u = Math.min(1, (t - s.t0) / Math.max(1e-6, s.t1 - s.t0));
      if (u >= 1) {
        // The pen has been along every line: the whole drawing goes down -
        // its washes and fills with it.
        layers[s.page].ink.drawImage(s.art.sprite, s.art.x, s.art.y);
        s.drawn = 1;
        s.done = true;
        wetDirty[s.page] = changed[s.page] = true;
        continue;
      }
      const eased = u * u * (3 - 2 * u) * 0.3 + u * 0.7;
      if (eased > s.drawn + 0.002) {
        s.drawn = eased;
        revealTo(s.art, eased * s.art.length);
        wetDirty[s.page] = changed[s.page] = true;
      }
      wetArt.push(s);
      continue;
    }
    if (s.done) continue;
    const reach = strokeReach(s, t);
    if (s.pen.kind === "highlighter") {
      if (reach > s.drawn + 0.01) {
        s.drawn = reach;
        highlightDirty[s.page] = changed[s.page] = true;
      }
      if (reach >= s.length) s.done = true;
      continue;
    }
    if (reach >= s.length) {
      // The pen lifts: the stroke goes down for good.
      fillStroke(layers[s.page].ink, s, s.length, scale, true);
      s.drawn = s.length;
      s.done = true;
      wetDirty[s.page] = changed[s.page] = true;
      continue;
    }
    if (reach > s.drawn + 0.01) {
      s.drawn = reach;
      wetDirty[s.page] = changed[s.page] = true;
    }
    wet.push(s);
  }
  for (const page of [0, 1] as const) {
    if (wetDirty[page]) {
      const ctx = layers[page].wet;
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      for (const s of wet) if (s.page === page) fillStroke(ctx, s, s.drawn, scale, false);
      for (const s of wetArt) if (s.page === page && s.art) ctx.drawImage(s.art.shown.canvas, s.art.x, s.art.y);
    }
    if (!highlightDirty[page]) continue;
    const ctx = layers[page].highlight;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const s of timeline) {
      if (s.kind !== "stroke" || s.page !== page || s.pen.kind !== "highlighter" || s.drawn <= 0) continue;
      const points = pointsTo(s, s.drawn);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = s.pen.color;
      ctx.lineWidth = s.pen.width * scale;
      ctx.lineCap = "butt";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(points[0][0] * scale, points[0][1] * scale);
      for (const [x, y] of points.slice(1)) ctx.lineTo(x * scale, y * scale);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  return changed;
}

/**
 * Make every letter's sprite before the writing starts, a slice at a time
 * in idle moments: roughening letters into the paper takes a few hundred
 * milliseconds a spread, which the frames that write must not pay.
 */
export async function prepareInk(timeline: Timed[], scale: number) {
  // The drawn doodles: fetched together, then each drawn into its sprite.
  const arts = timeline.filter((s): s is TimedArt => s.kind === "art");
  const made = await Promise.all(arts.map((a) => prepareArt(a.ref, a.box, scale, a.seed)));
  arts.forEach((a, i) => (a.art = made[i]));
  const glyphs = timeline.filter((s): s is TimedGlyph => s.kind === "glyph");
  let at = 0;
  while (at < glyphs.length) {
    await new Promise<void>((resolve) => {
      const slice = (deadline?: IdleDeadline) => {
        const until = performance.now() + (deadline ? Math.min(8, Math.max(4, deadline.timeRemaining())) : 8);
        while (at < glyphs.length && performance.now() < until) {
          spriteOf(glyphs[at].run, glyphs[at].glyph, scale);
          at++;
        }
        resolve();
      };
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(slice, { timeout: 200 });
      else window.setTimeout(slice, 0);
    });
  }
}

/** Forget what has been drawn, to write the same timeline again. */
export function resetInk(timeline: Timed[]) {
  for (const s of timeline) {
    s.drawn = 0;
    if (s.kind === "stroke") s.done = false;
    if (s.kind === "art") {
      s.done = false;
      if (s.art) {
        s.art.masked = 0;
        s.art.mask.clearRect(0, 0, s.art.mask.canvas.width, s.art.mask.canvas.height);
      }
    }
  }
}
