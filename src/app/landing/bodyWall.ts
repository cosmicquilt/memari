// The doodle wall in the landing page's body (Andrew, 2026-10-01: "we move
// the doodle wall to the body below where it adapts around the contents ...
// a percentage of the viewport ... of the next section past the hero of the
// cream white background before the doodles begin").
//
// Packed live, in the browser, around what the page actually shows at its
// width: every heading's lines, paragraph's lines, card, demo, button and pen
// mark is measured as an area to keep clear (BodyDoodles.tsx), and the
// drawings - the `body` list in doodleChoices.json - are packed into what is
// left the way the start dialog's wall is (doodleWall.ts's packWall): the
// big ones first, each against the ones already down, then the middle ones,
// then the small. Its own copy of that packing rather than packWall's,
// because packWall has to be self-contained to run inside a bake script's
// page, and this one also keeps clear of the content and never wraps.
//
// The settings (bodyWallSettings.json) are tuned live with the sliders on the
// landing page itself in development (BodyWallTuner.tsx) and saved there.

import saved from "./bodyWallSettings.json";

export type BodyWallSettings = {
  /** Paper kept between drawings, CSS px. */
  gap: number;
  /** Paper kept round the page's content, CSS px. */
  clearance: number;
  /** Drawing size, times the wall's sizes. */
  size: number;
  /** How many, times a full wall's count for the area. */
  density: number;
  /** How strong the blue is. */
  ink: number;
  /** Plain cream below the hero before the doodles begin, % of the screen's
   *  height - on a desktop and on a phone. */
  bandDesktop: number;
  bandMobile: number;
  /** The arrangement: a seed, or a new one each load. */
  seed: number;
  newEachLoad: boolean;
};

export const BODY_WALL_DEFAULTS: BodyWallSettings = saved as BodyWallSettings;

/** Below this width the page is laid out for a phone (the stylesheet's own
 *  breakpoint): drawings smaller, and the phone's cream band. */
export const PHONE_WIDTH = 760;

/** The ballpoint blue of every doodle wall (doodleWall.ts, WALL_THEMES). */
export const BODY_INK_RGB = "52, 72, 206";

// Live tuning, development only: the sliders set this and the wall follows.
let current = BODY_WALL_DEFAULTS;
const listeners = new Set<() => void>();
export const bodyWallSettings = () => current;
export function setBodyWallSettings(next: BodyWallSettings) {
  current = next;
  for (const l of listeners) l();
}
export function onBodyWallSettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Big, middle, small: the wall's own sizes (CSS px, longer side) and its
 *  counts for a 1400 x 1000 tile. */
const CLASSES = [
  { size: [130, 190], most: 60 },
  { size: [64, 104], most: 120 },
  { size: [24, 46], most: 320 },
] as const;

export type Keep = [x: number, y: number, w: number, h: number];
export type Placed = { src: string; x: number; y: number; w: number; h: number; angle: number };

/**
 * Pack drawings into a width x height area, keeping clear of `keep`. Each
 * drawing is placed whole: what it covers is its actual ink at its size and
 * turn, so they nestle. Yields to the page every few milliseconds - this
 * runs while the page is in use.
 */
export async function packAround(opts: {
  width: number;
  height: number;
  keep: Keep[];
  drawings: Array<{ src: string; img: HTMLImageElement; cls: number }>;
  settings: BodyWallSettings;
  seed: number;
  phone: boolean;
  cancelled: () => boolean;
}): Promise<Placed[] | null> {
  const { width, height, keep, drawings, settings, phone } = opts;
  let seed = opts.seed >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const CELL = 6;
  const GW = Math.ceil(width / CELL);
  const GH = Math.ceil(height / CELL);
  const occ = new Uint8Array(GW * GH);
  // What to keep clear, grown by the clearance.
  const c = settings.clearance;
  for (const [x, y, w, h] of keep) {
    const x0 = Math.max(0, Math.floor((x - c) / CELL));
    const y0 = Math.max(0, Math.floor((y - c) / CELL));
    const x1 = Math.min(GW, Math.ceil((x + w + c) / CELL));
    const y1 = Math.min(GH, Math.ceil((y + h + c) / CELL));
    for (let gy = y0; gy < y1; gy++) occ.fill(1, gy * GW + x0, gy * GW + Math.max(x0, x1));
  }

  const grow = (m: Uint8Array, n: number, r: number) => {
    if (r <= 0) return m;
    const a = new Uint8Array(n * n);
    const out = new Uint8Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let v = 0;
        for (let d = -r; d <= r && !v; d++) {
          const xx = x + d;
          if (xx >= 0 && xx < n) v = m[y * n + xx];
        }
        a[y * n + x] = v;
      }
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let v = 0;
        for (let d = -r; d <= r && !v; d++) {
          const yy = y + d;
          if (yy >= 0 && yy < n) v = a[yy * n + x];
        }
        out[y * n + x] = v;
      }
    return out;
  };
  // A drawing as cells: `test`, its ink grown by the gap - what must be free
  // to place it; `mark`, its ink alone - what it then takes (so the next one
  // keeps the gap from it, not twice the gap); `ring`, just beyond the test -
  // how much it would touch.
  const gapCells = Math.max(0, Math.round(settings.gap / CELL));
  const probe = document.createElement("canvas");
  const pg = probe.getContext("2d", { willReadFrequently: true })!;
  const cellsOf = (img: HTMLImageElement, w: number, h: number, angle: number) => {
    const n = Math.ceil(Math.hypot(w, h) / CELL) + 2 * (gapCells + 4);
    probe.width = probe.height = n;
    pg.clearRect(0, 0, n, n);
    pg.setTransform(Math.cos(angle) / CELL, Math.sin(angle) / CELL, -Math.sin(angle) / CELL, Math.cos(angle) / CELL, n / 2, n / 2);
    pg.drawImage(img, -w / 2, -h / 2, w, h);
    pg.setTransform(1, 0, 0, 1, 0, 0);
    const px = pg.getImageData(0, 0, n, n).data;
    const inked = new Uint8Array(n * n);
    for (let i = 0; i < inked.length; i++) inked[i] = px[i * 4 + 3] > 24 ? 1 : 0;
    const test = grow(inked, n, gapCells);
    const reach = grow(inked, n, gapCells + 3);
    const testCells: number[] = [];
    const markCells: number[] = [];
    const ringCells: number[] = [];
    for (let i = 0; i < test.length; i++) {
      const [x, y] = [(i % n) - (n >> 1), Math.floor(i / n) - (n >> 1)];
      if (inked[i]) markCells.push(x, y);
      if (test[i]) testCells.push(x, y);
      else if (reach[i]) ringCells.push(x, y);
    }
    return { testCells, markCells, ringCells };
  };
  const at = (cx: number, cy: number, dx: number, dy: number) => {
    const [x, y] = [cx + dx, cy + dy];
    return x < 0 || y < 0 || x >= GW || y >= GH ? -1 : y * GW + x;
  };
  const freeSpot = () => {
    for (let t = 0; t < 40; t++) {
      const i = Math.floor(rand() * occ.length);
      if (!occ[i]) return [i % GW, Math.floor(i / GW)];
    }
    return [Math.floor(rand() * GW), Math.floor(rand() * GH)];
  };

  const area = (width * height) / (1400 * 1000);
  const scale = settings.size * (phone ? 0.7 : 1);
  const placed: Placed[] = [];
  let slice = performance.now();
  for (const [ci, cls] of CLASSES.entries()) {
    const pool = drawings.filter((d) => d.cls === ci);
    const most = Math.round(cls.most * settings.density * area);
    let misses = 0;
    let n = 0;
    let bag: typeof pool = [];
    while (pool.length && misses < 8 && n < most) {
      if (performance.now() - slice > 8) {
        await new Promise((r) => setTimeout(r, 0));
        if (opts.cancelled()) return null;
        slice = performance.now();
      }
      if (!bag.length) {
        bag = [...pool];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      const d = bag.pop()!;
      const long = (cls.size[0] + rand() * (cls.size[1] - cls.size[0])) * scale;
      const k = long / Math.max(d.img.width, d.img.height);
      const [w, h] = [d.img.width * k, d.img.height * k];
      const angle = (rand() - 0.5) * 0.5;
      const { testCells, markCells, ringCells } = cellsOf(d.img, w, h, angle);
      let best: { cx: number; cy: number; score: number } | null = null;
      for (let t = 0; t < 200; t++) {
        const [cx, cy] = freeSpot();
        let hit = 0;
        for (let i = 0; i < testCells.length && !hit; i += 2) {
          const j = at(cx, cy, testCells[i], testCells[i + 1]);
          hit = j < 0 ? 1 : occ[j];
        }
        if (hit) continue;
        let score = 0;
        for (let i = 0; i < ringCells.length; i += 2) {
          const j = at(cx, cy, ringCells[i], ringCells[i + 1]);
          if (j >= 0) score += occ[j];
        }
        score += rand() * 0.5;
        if (!best || score > best.score) best = { cx, cy, score };
      }
      if (!best) {
        misses++;
        continue;
      }
      misses = 0;
      for (let i = 0; i < markCells.length; i += 2) {
        const j = at(best.cx, best.cy, markCells[i], markCells[i + 1]);
        if (j >= 0) occ[j] = 1;
      }
      placed.push({ src: d.src, x: best.cx * CELL, y: best.cy * CELL, w, h, angle });
      n++;
    }
  }
  return placed;
}
