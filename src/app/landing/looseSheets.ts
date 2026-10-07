// The loose sheets on the hero's desk, printed and written on: the base
// week (heroExtras.ts, BASE_SPREAD - Andrew, 2026-10-06: "the archetype will
// replace the doodle walls on the loose paper"), its left page on the left
// sheet and its right page on the right. Until then each sheet was a small
// doodle wall (2026-09-28).
//
// Each page is printed and written in as the journal's are, then laid into
// the film: centred on the sheet like a printout, warped onto the sheet's
// four corners in the 4K frame (video/sheets.ts), given the paper's fibre,
// and cut to where the sheet's paper shows past the book, the cup and the
// mug. The result is baked (public/landing/sheets/) and multiplied onto the
// film by VideoHero, so white leaves the photograph alone and the print and
// ink take its light and leaf shadows.
//
// Baked by the page /dev/sheets, which shows the result on the film's
// resting frame, and saved from it by scripts/build-hero-sheets.mts.

import { SHEETS, sheetMaskPath, type SheetId } from "./video/sheets";

/** A sheet's own units: about the paper's proportions (a sheet measures
 *  1.15 tall to 1 across, taking out the camera's slant), and the margin of
 *  paper left round what is on it. */
export const SHEET_TILE = { w: 1000, h: 1150, scale: 2 };
export const SHEET_MARGIN = 45;

/**
 * The base week's page on its sheet: as tall as `fill` of the tile, centred
 * - a 7 x 10 page printed on a bigger sheet, with the margins a printer
 * leaves (about 5% top and bottom, 14% each side). `seed` is the
 * handwriting's: the one written in, chosen by eye.
 */
export const BASE_SHEET = { fill: 0.97, seed: 4 };

export type SheetBakeInput = {
  /** What is on the sheet: SHEET_TILE at its scale, ink on white. */
  ink: string;
  tile: { w: number; h: number; scale: number };
  margin: number;
  /** The sheet's corners in the picture's own pixels (the 4K frame, less the
   *  box's origin), and the picture's size. */
  corners: Array<[number, number]>;
  size: [number, number];
  /** Where paper shows (alpha), at half the picture's size; the fibre tile. */
  mask: string;
  paper: string;
  /** Picture px per fibre-tile px: the tile is 4in, a sheet about 100px/in. */
  paperScale: number;
  /** Aged to match the film: drawn at `scale` of its size, through lossy
   *  compression at `quality` there, and scaled back up. */
  age: { scale: number; quality: number };
};

/** The film is Veo's 720p take, compressed, then upscaled to 4K: its detail
 *  is soft and a little blocky, and ink drawn crisp at 4K sat on it like a
 *  sticker (2026-09-28: "make the page a bit fuzzier and a bit more
 *  compression artifacting to match scene"). Of four strengths compared at
 *  screen size, Andrew chose the lightest ("I actually like light better",
 *  0.55 / 0.6, over 0.42 / 0.5), then "can we do even better quality"
 *  (0.7 / 0.75), then the crispest of three ("lets see crisper"). */
export const SHEET_AGE = { scale: 0.85, quality: 0.85 };

/** What bakeSheet needs for one sheet, given what is on it and a way to
 *  turn a site path into a URL the baking page can load. */
export function sheetBakeInput(id: SheetId, ink: string, url: (path: string) => string): SheetBakeInput {
  const { corners, box } = SHEETS[id];
  return {
    ink,
    tile: SHEET_TILE,
    margin: SHEET_MARGIN,
    corners: corners.map(([x, y]) => [x - box[0], y - box[1]] as [number, number]),
    size: [box[2], box[3]],
    mask: url(sheetMaskPath(id)),
    paper: url("/landing/paper.jpg"),
    paperScale: 0.8,
    age: SHEET_AGE,
  };
}

/**
 * Lay what is on a sheet into the film: warp it onto its corners, give it
 * the paper's fibre, cut it to the visible paper. Returns a WebP data
 * URL of the sheet's box, white wherever the film should be left alone.
 *
 * The warp is a true perspective one (the sheet is nearer the camera at the
 * bottom, so wider there): a homography from the sheet's units to its
 * corners, drawn as a grid of small triangles, each an affine piece of it -
 * canvas can only draw affine.
 *
 * SELF-CONTAINED, like packWall: its source is handed to a browser page.
 */
export async function bakeSheet(input: SheetBakeInput): Promise<string> {
  const load = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`could not load ${src.slice(0, 60)}`));
      img.src = src;
    });
  const [ink, mask, paper] = await Promise.all([load(input.ink), load(input.mask), load(input.paper)]);
  const [W, H] = input.size;
  const canvas = (w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };

  // The homography taking the sheet's units - its tile with the margin round
  // it - to its four corners.
  const m = input.margin;
  const from = [
    [-m, -m],
    [input.tile.w + m, -m],
    [input.tile.w + m, input.tile.h + m],
    [-m, input.tile.h + m],
  ];
  const to = input.corners;
  // Solve the 8 unknowns of [a b c; d e f; g h 1] by Gaussian elimination.
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [X, Y] = to[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X, X]);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y, Y]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  const project = (x: number, y: number): [number, number] => {
    const w = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
  };

  // What is on it, warped: each small triangle of the tile drawn with the
  // affine map its three corners make, clipped a hair wide so no seam shows.
  const warped = canvas(W, H);
  const g = warped.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  const s = input.tile.scale;
  const N = 24;
  const tri = (src: Array<[number, number]>) => {
    const dst = src.map(([x, y]) => project(x, y));
    // Solve the affine map from the image's pixels to the picture's.
    const [[x0, y0], [x1, y1], [x2, y2]] = src.map(([x, y]) => [x * s, y * s]);
    const [[X0, Y0], [X1, Y1], [X2, Y2]] = dst;
    const det = x0 * (y1 - y2) - y0 * (x1 - x2) + (x1 * y2 - x2 * y1);
    if (Math.abs(det) < 1e-9) return;
    const solve = (v0: number, v1: number, v2: number) => [
      (v0 * (y1 - y2) - y0 * (v1 - v2) + (v1 * y2 - v2 * y1)) / det,
      (x0 * (v1 - v2) - v0 * (x1 - x2) + (x1 * v2 - x2 * v1)) / det,
      (x0 * (y1 * v2 - y2 * v1) - y0 * (x1 * v2 - x2 * v1) + v0 * (x1 * y2 - x2 * y1)) / det,
    ];
    const [a, c, e] = solve(X0, X1, X2);
    const [b, d, f] = solve(Y0, Y1, Y2);
    const cx = (X0 + X1 + X2) / 3;
    const cy = (Y0 + Y1 + Y2) / 3;
    const grow = (X: number, Y: number): [number, number] => {
      const len = Math.hypot(X - cx, Y - cy) || 1;
      return [X + ((X - cx) / len) * 0.8, Y + ((Y - cy) / len) * 0.8];
    };
    g.save();
    g.beginPath();
    g.moveTo(...grow(X0, Y0));
    g.lineTo(...grow(X1, Y1));
    g.lineTo(...grow(X2, Y2));
    g.closePath();
    g.clip();
    g.setTransform(a, b, c, d, e, f);
    const sx = Math.max(0, Math.min(x0, x1, x2) - 2);
    const sy = Math.max(0, Math.min(y0, y1, y2) - 2);
    const sw = Math.min(ink.width, Math.max(x0, x1, x2) + 2) - sx;
    const sh = Math.min(ink.height, Math.max(y0, y1, y2) + 2) - sy;
    if (sw > 0 && sh > 0) g.drawImage(ink, sx, sy, sw, sh, sx, sy, sw, sh);
    g.restore();
  };
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const [u0, u1] = [(i / N) * input.tile.w, ((i + 1) / N) * input.tile.w];
      const [v0, v1] = [(j / N) * input.tile.h, ((j + 1) / N) * input.tile.h];
      tri([
        [u0, v0],
        [u1, v0],
        [u1, v1],
      ]);
      tri([
        [u0, v0],
        [u1, v1],
        [u0, v1],
      ]);
    }

  // The paper: a little under white with the fibre overlaid twice ("and more
  // paper texture", 2026-09-28 - once on 0.97 barely showed on the film), the
  // ink multiplied into it, and all of it cut to where the paper shows.
  const sheet = canvas(W, H);
  const p = sheet.getContext("2d")!;
  p.fillStyle = "#ededed";
  p.fillRect(0, 0, W, H);
  const fibre = p.createPattern(paper, "repeat")!;
  fibre.setTransform(new DOMMatrix().scale(input.paperScale));
  p.globalCompositeOperation = "overlay";
  p.fillStyle = fibre;
  p.fillRect(0, 0, W, H);
  p.fillRect(0, 0, W, H);
  p.globalCompositeOperation = "multiply";
  p.drawImage(warped, 0, 0);
  p.globalCompositeOperation = "source-over";

  // Aged like the film: smaller, through JPEG there - its 8px blocks and
  // ringing come back up at the film's own scale - and up again, softly.
  // Before the cut to the paper, so the edges at the book, cup and mug stay
  // where they were measured.
  const { scale: k, quality } = input.age;
  const small = canvas(Math.round(W * k), Math.round(H * k));
  const sg = small.getContext("2d")!;
  sg.imageSmoothingQuality = "high";
  sg.drawImage(sheet, 0, 0, small.width, small.height);
  const aged = await load(small.toDataURL("image/jpeg", quality));
  p.imageSmoothingQuality = "high";
  p.drawImage(aged, 0, 0, W, H);

  p.globalCompositeOperation = "destination-in";
  p.imageSmoothingQuality = "high";
  p.drawImage(mask, 0, 0, W, H);

  const out = canvas(W, H);
  const o = out.getContext("2d")!;
  o.fillStyle = "#ffffff";
  o.fillRect(0, 0, W, H);
  o.drawImage(sheet, 0, 0);
  return out.toDataURL("image/webp", 0.85);
}
