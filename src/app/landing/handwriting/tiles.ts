// Flow's drawn patterns, tiled into cells (2026-10-07: "I think it would be
// better to get flow to create it then you tile it the best you can").
//
// The drawings (handoff/flow/patterns/, imported by import_patterns.py into
// public/landing/patterns/ and patternTiles.json) are of three kinds:
//   field  a pattern edge to edge: cut into cells, neighbouring cells showing
//          neighbouring parts of it, so a run of cells, a block or a whole
//          module reads as one drawing - and where it would run out, it
//          starts again at a cell's edge, behind the printed line;
//   strip  a border band: run along a row of cells or a bar, a cell's height;
//   block  one design: laid over a block of cells (or into one cell), each
//          cell showing its part.
// This works out, for one cell, which part of which drawing it shows: pure,
// so the proof page can run it too.

import manifest from "./patternTiles.json";

export type Box = [number, number, number, number];
export type TileKind = "field" | "strip" | "block";
export type TileAsset = { id: string; pattern: string; kind: TileKind; w: number; h: number; periodX?: number; periodY?: number };

/** Drawings left out: cross-hatching so dense that shrunk to a cell it is a
 *  dark blot. */
const LEFT_OUT = new Set(["crosshatch-field-2", "crosshatch-field-4"]);
export const TILES = (manifest as unknown as TileAsset[]).filter((t) => !LEFT_OUT.has(t.id));

/** How many cells across a field drawing spans: the scale its motifs are
 *  drawn at - two or three small motifs a cell, a Talavera tile a cell, a
 *  dune landscape across a couple. Set by eye, from what each drawing holds
 *  (the repeat measured from the images was unreliable). In cells of at
 *  least REF print px: a smaller cell shows less of the drawing, not
 *  smaller motifs - shrunk to a habit grid's cell they went to grey. */
const REF = 72;
const SPAN: Record<string, number> = {
  "kolam-lattice": 2.2,
  scales: 3.4,
  talavera: 3.4,
  crosshatch: 3.2,
  waves: 3.2,
  "stepped-diamond": 3.2,
  serape: 3,
  dunes: 2.4,
};
const SPAN_OF: Record<string, number> = {
  "kolam-lattice-field-9": 3,
  "kolam-lattice-field-7": 2,
  "talavera-field-6": 4,
  "talavera-field-1": 3,
  "talavera-field-7": 3.2,
};

/** How tall a strip's band is drawn, as a share of the cell or bar. */
const BAND = 0.78;

/** Where in a cell a drawing goes and which part of it: `src` in the
 *  drawing's px, `dest` in print px. */
export type Placement = { id: string; src: Box; dest: Box };

/** The drawings of a pattern of a kind. */
export function tilesOf(pattern: string, kind: TileKind): TileAsset[] {
  return TILES.filter((t) => t.pattern === pattern && t.kind === kind);
}

/** Whether there is a drawing for a pattern at all. */
export const hasTiles = (pattern: string) => TILES.some((t) => t.pattern === pattern);

/** A small, steady 0..1 from numbers. */
function hash(...n: number[]) {
  let h = 2166136261;
  for (const v of n) h = Math.imul(h ^ Math.round(v * 1000), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Which drawing a cell shows, and which part. `use` is how the cells are
 * being drawn: "block" - one design over the block `world`, `grid` cells
 * across and down; "run"/"whole" - one field over them; "band" - a strip
 * along them; "single" - this cell alone. The drawing is chosen by `seed`,
 * the same for every cell of a block, from the kinds that suit the use;
 * null if the pattern has no drawing.
 */
export function placeTile(pattern: string, use: "single" | "run" | "block" | "whole" | "band", cell: Box, world: Box | null, grid: [number, number] | null, seed: number): Placement | null {
  // A bar takes a strip or nothing (a field squeezed into a bar's height
  // was a faint smear); a block design wants room - over a small cell its
  // detail fills in.
  const W0 = world ?? cell;
  const roomy = Math.min(W0[2], W0[3]) >= 90;
  const prefer: TileKind[] =
    use === "block" ? ["block", "field"] : use === "band" ? ["strip"] : use === "single" ? ["field", "block", "strip"] : ["field", "strip"];
  const kind = prefer.filter((k) => k !== "block" || roomy).find((k) => tilesOf(pattern, k).length > 0);
  if (!kind) return null;
  const options = tilesOf(pattern, kind);
  const asset = options[Math.floor(hash(seed, 7) * options.length) % options.length];
  const [x, y, w, h] = cell;
  const W = world ?? cell;
  const [cols, rows] = world && grid ? grid : [1, 1];
  const [pw, ph] = [W[2] / cols, W[3] / rows];

  if (kind === "block") {
    // The design covers the block (its longer side cropped a little), each
    // cell its part of it.
    const k = Math.min(asset.w / W[2], asset.h / W[3]);
    const [ox, oy] = [(asset.w - W[2] * k) / 2, (asset.h - W[3] * k) / 2];
    return { id: asset.id, src: [ox + (x - W[0]) * k, oy + (y - W[1]) * k, w * k, h * k], dest: cell };
  }

  // Field or strip: asset px per print px, and how many cells of it fit
  // before it must start again (at a cell's edge, behind the printed line).
  const band = kind === "strip";
  let k = band ? asset.h / (h * BAND) : asset.w / ((SPAN_OF[asset.id] ?? SPAN[pattern] ?? 3) * Math.max(pw, REF));
  // A drawing of motifs (a Talavera tile, a kolam loop): scaled so a whole
  // number of them fits the cell's shorter side - a cell never cuts one in
  // half there.
  const period = band ? undefined : asset.periodX;
  const side = Math.min(pw, ph);
  if (period) k = (period * Math.max(1, Math.round(side / (period / k)))) / side;
  const fitX = Math.max(1, Math.floor(asset.w / (pw * k)));
  const fitY = band ? 1 : Math.max(1, Math.floor(asset.h / (ph * k)));
  const col = Math.max(0, Math.floor((x + w / 2 - W[0]) / pw));
  const row = Math.max(0, Math.floor((y + h / 2 - W[1]) / ph));
  const [cx, cy] = [Math.floor(col / fitX), Math.floor(row / fitY)];
  // Each restart from its own place in the drawing - snapped to whole
  // repeats of it where its repeat is known, so a cell lands on a motif,
  // not across two halves of one.
  const snap = (v: number, period: number | undefined, spare: number) => (period && period <= spare ? Math.round(v / period) * period : v);
  const spareX = Math.max(0, asset.w - fitX * pw * k);
  const spareY = band ? 0 : Math.max(0, asset.h - fitY * ph * k);
  const ox = snap(hash(seed, cx, cy, 1) * spareX, asset.periodX, spareX) - (W[0] + cx * fitX * pw) * k;
  const oy = snap(hash(seed, cx, cy, 2) * spareY, asset.periodY, spareY) - (W[1] + cy * fitY * ph) * k;
  if (band) {
    const bh = h * BAND;
    return { id: asset.id, src: [ox + x * k, 0, w * k, asset.h], dest: [x, y + (h - bh) / 2, w, bh] };
  }
  let [sx, sy] = [ox + x * k, oy + y * k];
  // Along a cell's longer side the motifs do not divide evenly: there, a
  // whole one in the middle and part of one each side, as a cut tile.
  if (period) {
    const centre = (start: number, len: number) => {
      const mid = start + (len * k) / 2;
      return start + (Math.floor(mid / period) + 0.5) * period - mid;
    };
    if (pw > ph * 1.15) sx = centre(sx, w);
    if (ph > pw * 1.15) sy = centre(sy, h);
  }
  return { id: asset.id, src: [sx, sy, w * k, h * k], dest: cell };
}
