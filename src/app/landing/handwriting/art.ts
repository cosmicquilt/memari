// Drawn doodles: real drawings (generated with Nano Banana, 2026-09-24, and
// imported by handoff/flow/import-doodles.mts) put on the journal's pages
// as ink and drawn in along their own lines.
//
// Andrew, 2026-09-24, of the code-drawn doodles against the generated ones:
// "no offense all of theirs look so much better" - and of the generated
// ones: "they just need you to apply the mask or whatever that turns it
// from digital drawing to looking like it was written on a page".
//
// Each doodle is stored as ink - RGBA to multiply onto any paper, the
// generator's own paper already taken out - with its reveal paths: the
// centre lines of its strokes, each point with the line's half-width, in
// drawing order. On the page it is roughened into the paper like the
// handwriting (paperInk.ts), and drawn in by uncovering it along those
// paths; when the pen has been along all of them, the whole drawing -
// fills, washes, specks - is laid down.

import { grainAt, roughen, type InkFeel } from "./paperInk";
import { noise1 } from "./rng";

export const DOODLE_STYLES = ["minimal", "retro", "sketchnote", "crayon", "pencil", "riso"] as const;
export type DoodleStyle = (typeof DOODLE_STYLES)[number];

/** style -> subject -> [id, width, height] of each drawing of it. */
type Index = Record<string, Record<string, Array<[string, number, number]>>>;

const BASE = "/landing/doodles";
let index: Index | null = null;
let indexLoading: Promise<Index | null> | null = null;

/** Load the library's index (small; the drawings load when used). */
export function loadArtIndex(): Promise<Index | null> {
  indexLoading ??= fetch(`${BASE}/index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Index>) : null))
    .catch(() => null)
    .then((i) => (index = i));
  return indexLoading;
}

/** The index, once loaded - null before, or if it failed. */
export function artIndex(): Index | null {
  return index;
}

export type ArtRef = { style: string; id: string; w: number; h: number };

/** A drawing of `subject` in `style`, chosen by `pick` (0 to 1), or null. */
export function findArt(style: string, subject: string, pick: number): ArtRef | null {
  const list = index?.[style]?.[subject];
  if (!list?.length) return null;
  const [id, w, h] = list[Math.min(list.length - 1, Math.floor(pick * list.length))];
  return { style, id, w, h };
}

/**
 * How each style's ink takes to the paper. Gentler than the handwriting's:
 * roughen()'s letter threshold thinned a drawing's pale washes, grain and
 * hairlines - drawn pencil and crayon came out ghostly - so drawings keep
 * their own alpha ("soft"), nudged at the edge, mottled, bled a little.
 */
const STYLE_FEEL: Record<string, InkFeel> = {
  crayon: { edge: 0.15, mottle: 0.12, bleed: 0, pool: 0, pressure: 0.08, soft: true },
  pencil: { edge: 0.12, mottle: 0.1, bleed: 0, pool: 0, pressure: 0.08, soft: true },
  minimal: { edge: 0.3, mottle: 0.18, bleed: 0.1, pool: 0, pressure: 0.1, soft: true },
  sketchnote: { edge: 0.3, mottle: 0.18, bleed: 0.14, pool: 0.08, pressure: 0.1, soft: true },
  retro: { edge: 0.3, mottle: 0.18, bleed: 0.1, pool: 0, pressure: 0.1, soft: true },
  riso: { edge: 0.25, mottle: 0.22, bleed: 0.08, pool: 0, pressure: 0.08, soft: true },
};

type Loaded = { img: HTMLImageElement; paths: number[][] };
const loaded = new Map<string, Promise<Loaded | null>>();

function load(ref: ArtRef): Promise<Loaded | null> {
  const key = `${ref.style}/${ref.id}`;
  let p = loaded.get(key);
  if (!p) {
    p = Promise.all([
      new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = `${BASE}/${key}.webp`;
      }),
      fetch(`${BASE}/${key}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<number[][]>) : null))
        .catch(() => null),
    ]).then(([img, paths]) => (img && paths ? { img, paths } : null));
    loaded.set(key, p);
  }
  return p;
}

/** A doodle on a page, being drawn in. */
export type ArtSprite = {
  /** The drawing at the page canvas's scale, roughened into the paper. */
  sprite: HTMLCanvasElement;
  /** Where it goes, in canvas px. */
  x: number;
  y: number;
  /** What the pen has uncovered so far. */
  mask: CanvasRenderingContext2D;
  /** The uncovered drawing, rebuilt each frame it changes. */
  shown: CanvasRenderingContext2D;
  /** Reveal paths in canvas px (x, y, half-width), with the length along
   *  all of them at each point. */
  paths: number[][];
  cum: number[][];
  length: number;
  /** Length the mask has been drawn to. */
  masked: number;
};

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};

/**
 * Make a doodle ready to draw: load it, draw it into its box (print px) at
 * the canvas scale, turned by `angle` (radians) about the box's middle, lay
 * a pen's pressure along its lines, roughen it into the paper, and put its
 * reveal paths in canvas px. Null if it could not be loaded.
 */
export async function prepareArt(ref: ArtRef, box: [number, number, number, number], scale: number, seed: number, angle = 0): Promise<ArtSprite | null> {
  const got = await load(ref);
  if (!got) return null;
  const [bx, by, bw, bh] = box;
  const k = (bw * scale) / ref.w;
  const w = bw * scale;
  const h = bh * scale;
  const grain = grainAt(scale);
  const pad = Math.ceil(grain * 2.5) + 2;
  // The turned drawing's bounds, and where a point of the drawing lands.
  const [cs, sn] = [Math.cos(angle), Math.sin(angle)];
  const tw = Math.abs(w * cs) + Math.abs(h * sn);
  const th = Math.abs(w * sn) + Math.abs(h * cs);
  const sprite = canvas(tw + pad * 2, th + pad * 2);
  const [mx, my] = [sprite.width / 2, sprite.height / 2];
  const place = (x: number, y: number): [number, number] => {
    const [dx, dy] = [x - w / 2, y - h / 2];
    return [mx + dx * cs - dy * sn, my + dx * sn + dy * cs];
  };
  const g = sprite.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingQuality = "high";
  g.setTransform(cs, sn, -sn, cs, mx, my);
  g.drawImage(got.img, -w / 2, -h / 2, w, h);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const paths: number[][] = [];
  const cum: number[][] = [];
  let length = 0;
  for (const p of got.paths) {
    const pts: number[] = [];
    const c: number[] = [];
    for (let i = 0; i < p.length; i += 3) {
      const [x, y] = place(p[i] * k, p[i + 1] * k);
      if (pts.length) length += Math.hypot(x - pts[pts.length - 3], y - pts[pts.length - 2]);
      // (Half-widths are stored in half pixels.)
      pts.push(x, y, Math.max(0.8, (p[i + 2] / 2) * k));
      c.push(length);
    }
    // A dot: a little length of its own, so it takes a moment to draw.
    if (pts.length === 3) {
      length += pts[2] * 2;
      c[0] = length;
    }
    paths.push(pts);
    cum.push(c);
  }
  // The bigger the drawing, the more a flat, even line gives it away as
  // made on a screen (Andrew, 2026-09-25: the large ones "still look written
  // on ipad"): so the more its ink varies.
  const big = Math.min(1, Math.max(0, (Math.max(w, h) - 70) / 180));
  pressAlong(g, paths, cum, seed, 0.18 + 0.3 * big);
  const feel = STYLE_FEEL[ref.style] ?? STYLE_FEEL.minimal;
  roughen(g, sprite.width, sprite.height, { ...feel, edge: feel.edge * (1 + big), mottle: feel.mottle * (1 + 1.4 * big), bleed: feel.bleed * (1 + 0.6 * big) }, seed, grain);
  return {
    sprite,
    x: (bx + bw / 2) * scale - mx,
    y: (by + bh / 2) * scale - my,
    mask: canvas(sprite.width, sprite.height).getContext("2d")!,
    shown: canvas(sprite.width, sprite.height).getContext("2d")!,
    paths,
    cum,
    length: Math.max(1, length),
    masked: 0,
  };
}

/**
 * A pen's pressure along the drawing's lines: each line lighter and darker
 * as it goes - slow, smooth swells, and a little lift at its ends - by up to
 * `depth` of its ink. Washes and fills away from the lines keep theirs.
 */
function pressAlong(g: CanvasRenderingContext2D, paths: number[][], cum: number[][], seed: number, depth: number) {
  const { width, height } = g.canvas;
  // How much lighter each pixel is, as grey (white = none), taking the
  // lightest line over it rather than adding them up: inside a filled shape
  // many traced lines overlap, and summed they hollowed it out.
  const press = canvas(width, height).getContext("2d", { willReadFrequently: true })!;
  press.fillStyle = "#000";
  press.fillRect(0, 0, width, height);
  press.globalCompositeOperation = "lighten";
  press.lineCap = "round";
  paths.forEach((pts, s) => {
    const c = cum[s];
    if (pts.length < 6) return;
    const swell = noise1(seed * 13 + s);
    const start = c[0];
    const end = c[c.length - 1];
    for (let i = 1; i < c.length; i++) {
      const along = (c[i - 1] + c[i]) / 2;
      // Lighter where the pen lands and lifts, and in slow swells between.
      const ends = Math.min(1, (along - start) / 14, (end - along) / 14);
      const lift = 0.35 * (1 - Math.max(0, ends));
      const light = Math.min(0.95, depth * (0.5 + 0.5 * swell(along / 55)) + lift * depth);
      if (light <= 0.01) continue;
      const v = Math.round(light * 255);
      press.strokeStyle = `rgb(${v}, ${v}, ${v})`;
      press.lineWidth = Math.max(pts[(i - 1) * 3 + 2], pts[i * 3 + 2]) * 3.4 + 3;
      press.beginPath();
      press.moveTo(pts[(i - 1) * 3], pts[(i - 1) * 3 + 1]);
      press.lineTo(pts[i * 3], pts[i * 3 + 1]);
      press.stroke();
    }
  });
  const light = press.getImageData(0, 0, width, height).data;
  const img = g.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] && light[i - 3]) d[i] = Math.round(d[i] * (1 - light[i - 3] / 255));
  g.putImageData(img, 0, 0);
}

/** Uncover the drawing along its paths up to `reach` (canvas px of path):
 *  round-capped lines a little wider than the ink, so the pen's width is
 *  covered. */
export function revealTo(a: ArtSprite, reach: number) {
  if (reach <= a.masked) return;
  const m = a.mask;
  m.fillStyle = m.strokeStyle = "#000";
  m.lineCap = m.lineJoin = "round";
  for (const [s, pts] of a.paths.entries()) {
    const c = a.cum[s];
    if (c[c.length - 1] < a.masked) continue;
    if (c[0] > reach && pts.length > 3) break;
    if (pts.length === 3) {
      if (c[0] <= reach) {
        m.beginPath();
        m.arc(pts[0], pts[1], pts[2] * 1.7 + 1.5, 0, Math.PI * 2);
        m.fill();
      }
      continue;
    }
    for (let i = 1; i < c.length; i++) {
      if (c[i] < a.masked) continue;
      if (c[i - 1] > reach) break;
      const f = c[i] > reach ? (reach - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]) : 1;
      const x0 = pts[(i - 1) * 3];
      const y0 = pts[(i - 1) * 3 + 1];
      const x1 = x0 + (pts[i * 3] - x0) * f;
      const y1 = y0 + (pts[i * 3 + 1] - y0) * f;
      m.lineWidth = Math.max(pts[(i - 1) * 3 + 2], pts[i * 3 + 2]) * 3.4 + 3;
      m.beginPath();
      m.moveTo(x0, y0);
      m.lineTo(x1, y1);
      m.stroke();
    }
  }
  a.masked = reach;
  const s = a.shown;
  s.globalCompositeOperation = "copy";
  s.drawImage(a.sprite, 0, 0);
  s.globalCompositeOperation = "destination-in";
  s.drawImage(m.canvas, 0, 0);
  s.globalCompositeOperation = "source-over";
}
