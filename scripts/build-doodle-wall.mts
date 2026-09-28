// The start dialog's backdrop: a wall of little drawings in blue pen on the
// cream paper, baked once into public/landing/doodle-wall.webp.
//
//   npm run build:doodle-wall
//
// Asked for 2026-09-27: the cream paper behind the start dialog "sketched in
// blue pen in the background cute characters and animals", crowded like a
// Mr. Doodle wall - "i want it to be sketched though". So the drawings are the
// doodle library's PENCIL set (public/landing/doodles/pencil, the generated
// sketches the landing journal draws), each turned to one blue ink, and
// packed the way a doodle wall is drawn: the big animals and people first,
// each laid against the ones already down rather than scattered, then the
// middle-sized things in the gaps, then stars, hearts and sparkles in what
// is left. Nothing overlaps; almost everything touches something.
//
// The tile wraps: every drawing is placed and drawn modulo the tile, so it
// repeats with no seam. At 1400 x 1000 CSS px a laptop screen shows about
// one tile, and a repeat is a whole wall away from itself.
//
// Drawn in a real browser (the installed Chrome, as the check scripts do)
// because it needs a canvas: images turned, tinted and packed by their
// actual ink, not their boxes. Seeded, so a rerun gives the same wall.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve(import.meta.dirname, "..");
const PENCIL = path.join(ROOT, "public/landing/doodles/pencil");
const OUT = path.join(ROOT, "public/landing/doodle-wall.webp");

/** The tile, CSS px, and how many image px per CSS px (a 2x screen). */
const TILE = { w: 1400, h: 1000, scale: 2 };

/** Ballpoint blue, and how much of it: the wall sits behind the dialog, so
 *  it is quieter than ink on a page. */
const INK = { color: "#3448ce", alpha: 0.42 };

/** The paper it is drawn on: StartDialog.tsx's BACKDROP_BASE, the landing
 *  page's --cream. Baked in rather than left transparent - a transparent
 *  WebP keeps its alpha losslessly, and the fine pencil grain made that
 *  2.5MB; on the cream the same wall is about 350KB. So the two must match,
 *  or the backdrop changes colour as the wall arrives. */
const PAPER = "#f5ead5";

/** What goes on the wall, biggest first. Sizes are the longer side, CSS px;
 *  `most` stops a class before the next one has no room left. */
const CLASSES = [
  {
    size: [130, 190],
    most: 60,
    subjects: [
      "bear", "bee", "bird", "bunny", "butterfly", "cat", "dog", "duck", "fish", "fox", "frog", "hedgehog", "octopus", "owl",
      "penguin", "snail", "turtle", "whale", "yoga", "reading", "dancing", "surfing", "skateboarding", "meditating", "running",
      "cycling", "swimming", "hiking", "iceskating", "skiing", "dogwalk", "knitting", "painting", "singing", "picnic", "camping",
      "fishing", "gaming", "cooking", "baking", "studying", "climbing", "watering", "hotairballoon",
    ],
  },
  {
    size: [64, 104],
    most: 120,
    subjects: [
      "cupcake", "donut", "icecream", "balloons", "mushroom", "sunflower", "daisy", "tulip", "cactus", "succulent", "houseplant",
      "rainbow", "cloud", "sun", "moon", "umbrella", "coffee", "tea", "books", "camera", "headphones", "paperplane", "sailboat",
      "gift", "cake", "pizza", "taco", "avocado", "partyhat", "bulb", "tree", "bouquet", "guitar",
    ],
  },
  // (Lightning was here: forty little bolts read as a storm, not a doodle.)
  { size: [24, 46], most: 320, subjects: ["star", "sparkle", "heart", "music", "leaf", "snowflake", "cloud"] },
];

// Every pencil drawing of each subject, as data URLs (a page given file://
// images could not read its own canvas back).
const drawings: Record<string, string[]> = {};
for (const file of readdirSync(PENCIL).sort()) {
  const m = /^(.+)-\d+\.webp$/.exec(file);
  if (!m) continue;
  (drawings[m[1]] ??= []).push(`data:image/webp;base64,${readFileSync(path.join(PENCIL, file)).toString("base64")}`);
}
const classes = CLASSES.map((c) => ({ size: c.size, most: c.most, subjects: c.subjects.filter((s) => drawings[s]) }));

let browser;
try {
  browser = await chromium.launch({ channel: "chrome" });
} catch {
  browser = await chromium.launch({ channel: "msedge" });
}
const page = await browser.newPage();
// tsx compiles with esbuild's keepNames, which wraps every named function
// below in a `__name()` helper; Playwright ships the function's source to
// the page, where the helper does not exist (see check-browser.mts). Too big
// to pass as a string, so the page gets a do-nothing helper - as a string,
// which nothing compiles.
await page.evaluate("window.__name = (f) => f");
const result = await page.evaluate(
  async ({ drawings, classes, TILE, INK, PAPER }) => {
    // Seeded, so the same wall comes back.
    let seed = 20260927;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const load = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    const images: Record<string, HTMLImageElement[]> = {};
    for (const [subject, srcs] of Object.entries(drawings)) images[subject] = await Promise.all(srcs.map(load));

    // Occupancy on a coarse grid, wrapping: a cell is 6 CSS px.
    const CELL = 6;
    const GW = Math.round(TILE.w / CELL);
    const GH = Math.round(TILE.h / CELL);
    const occ = new Uint8Array(GW * GH);

    // Grow a mask by r cells: a max filter, rows then columns.
    const grow = (m: Uint8Array, n: number, r: number) => {
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

    // A drawing's ink at a size and turn, as cells: what it covers (grown by
    // a cell - a hair of paper between neighbours), and a ring a few cells
    // out round it, which is how much of its neighbours it would touch.
    const probe = document.createElement("canvas");
    const pg = probe.getContext("2d", { willReadFrequently: true })!;
    const cellsOf = (img: HTMLImageElement, w: number, h: number, angle: number) => {
      const n = Math.ceil(Math.hypot(w, h) / CELL) + 8;
      probe.width = probe.height = n;
      pg.clearRect(0, 0, n, n);
      pg.setTransform(Math.cos(angle) / CELL, Math.sin(angle) / CELL, -Math.sin(angle) / CELL, Math.cos(angle) / CELL, n / 2, n / 2);
      pg.drawImage(img, -w / 2, -h / 2, w, h);
      pg.setTransform(1, 0, 0, 1, 0, 0);
      const px = pg.getImageData(0, 0, n, n).data;
      const ink = new Uint8Array(n * n);
      for (let i = 0; i < ink.length; i++) ink[i] = px[i * 4 + 3] > 24 ? 1 : 0;
      const body = grow(ink, n, 1);
      const reach = grow(ink, n, 3);
      const bodyCells: number[] = [];
      const ringCells: number[] = [];
      for (let i = 0; i < body.length; i++) {
        const [x, y] = [(i % n) - (n >> 1), Math.floor(i / n) - (n >> 1)];
        if (body[i]) bodyCells.push(x, y);
        else if (reach[i]) ringCells.push(x, y);
      }
      return { bodyCells, ringCells };
    };
    const at = (cx: number, cy: number, dx: number, dy: number) =>
      (((cy + dy) % GH) + GH) % GH * GW + ((((cx + dx) % GW) + GW) % GW);
    // A spot to try: a free cell, so crowded walls still find their gaps.
    const freeSpot = () => {
      for (let t = 0; t < 40; t++) {
        const i = Math.floor(rand() * occ.length);
        if (!occ[i]) return [i % GW, Math.floor(i / GW)];
      }
      return [Math.floor(rand() * GW), Math.floor(rand() * GH)];
    };

    type Placed = { img: HTMLImageElement; x: number; y: number; w: number; h: number; angle: number };
    const placed: Placed[] = [];
    const counts: number[] = [];
    for (const cls of classes) {
      let misses = 0;
      let n = 0;
      // Until this size keeps failing to find room, or has had its share.
      // Subjects from a shuffled bag: every one is drawn before any is drawn
      // twice (picked at random, a wall had four people watering plants).
      let bag: string[] = [];
      while (misses < 8 && n < cls.most) {
        if (!bag.length) {
          bag = [...cls.subjects];
          for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
          }
        }
        const subject = bag.pop()!;
        const variants = images[subject];
        const img = variants[Math.floor(rand() * variants.length)];
        const long = cls.size[0] + rand() * (cls.size[1] - cls.size[0]);
        const k = long / Math.max(img.width, img.height);
        const [w, h] = [img.width * k, img.height * k];
        const angle = (rand() - 0.5) * 0.5;
        const { bodyCells, ringCells } = cellsOf(img, w, h, angle);
        let best: { cx: number; cy: number; score: number } | null = null;
        for (let t = 0; t < 250; t++) {
          const [cx, cy] = freeSpot();
          let hit = 0;
          for (let i = 0; i < bodyCells.length && hit === 0; i += 2) hit = occ[at(cx, cy, bodyCells[i], bodyCells[i + 1])];
          if (hit) continue;
          let score = 0;
          for (let i = 0; i < ringCells.length; i += 2) score += occ[at(cx, cy, ringCells[i], ringCells[i + 1])];
          // The very first drawings have nothing to touch; after that, the
          // one that nestles in closest wins.
          score += rand() * 0.5;
          if (!best || score > best.score) best = { cx, cy, score };
        }
        if (!best) {
          misses++;
          continue;
        }
        misses = 0;
        for (let i = 0; i < bodyCells.length; i += 2) occ[at(best.cx, best.cy, bodyCells[i], bodyCells[i + 1])] = 1;
        placed.push({ img, x: best.cx * CELL, y: best.cy * CELL, w, h, angle });
        n++;
      }
      counts.push(n);
    }

    // Draw: each drawing in one blue, at every wrap position it reaches.
    const out = document.createElement("canvas");
    out.width = TILE.w * TILE.scale;
    out.height = TILE.h * TILE.scale;
    const o = out.getContext("2d")!;
    o.imageSmoothingQuality = "high";
    const tint = document.createElement("canvas");
    const tg = tint.getContext("2d")!;
    for (const p of placed) {
      tint.width = Math.ceil(p.w * TILE.scale);
      tint.height = Math.ceil(p.h * TILE.scale);
      tg.globalCompositeOperation = "source-over";
      tg.drawImage(p.img, 0, 0, tint.width, tint.height);
      tg.globalCompositeOperation = "source-in";
      tg.fillStyle = INK.color;
      tg.fillRect(0, 0, tint.width, tint.height);
      const reach = Math.hypot(p.w, p.h) / 2;
      for (const ox of [-TILE.w, 0, TILE.w])
        for (const oy of [-TILE.h, 0, TILE.h]) {
          const x = p.x + ox;
          const y = p.y + oy;
          if (x + reach < 0 || y + reach < 0 || x - reach > TILE.w || y - reach > TILE.h) continue;
          o.save();
          o.globalAlpha = INK.alpha;
          o.setTransform(TILE.scale, 0, 0, TILE.scale, 0, 0);
          o.translate(x, y);
          o.rotate(p.angle);
          o.drawImage(tint, -p.w / 2, -p.h / 2, p.w, p.h);
          o.restore();
        }
    }
    let covered = 0;
    for (const c of occ) covered += c;
    const flat = document.createElement("canvas");
    flat.width = out.width;
    flat.height = out.height;
    const f = flat.getContext("2d")!;
    f.fillStyle = PAPER;
    f.fillRect(0, 0, flat.width, flat.height);
    f.drawImage(out, 0, 0);
    return { url: flat.toDataURL("image/webp", 0.82), counts, covered: covered / occ.length };
  },
  { drawings, classes, TILE, INK, PAPER }
);
await browser.close();

const bytes = Buffer.from(result.url.split(",")[1], "base64");
writeFileSync(OUT, bytes);
console.log(
  `doodle-wall.webp: ${TILE.w * TILE.scale}x${TILE.h * TILE.scale}, ${(bytes.length / 1024).toFixed(0)} KB; ` +
    `placed ${result.counts.join(" + ")} (big, middle, small); ${(result.covered * 100).toFixed(0)}% of the tile inked or reserved`
);
