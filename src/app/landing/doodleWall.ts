// The start dialog's wall of blue-pen doodles (StartDialog.tsx's backdrop):
// what it is drawn from, and how - shared by the script that bakes it
// (scripts/build-doodle-wall.mts) and the control panel that previews it
// and saves it (/dev/doodles), so the two cannot draw different walls.
//
// Which drawings are on the wall is not decided here: it is the `wall` list
// in doodleChoices.json, which the panel edits.

/** The tile, CSS px, and how many image px per CSS px (a 2x screen). At
 *  1400 x 1000 a laptop screen shows about one tile, and a repeat is a whole
 *  wall away from itself. */
export const WALL_TILE = { w: 1400, h: 1000, scale: 2 };

/** Ballpoint blue, and how much of it: the wall sits behind the dialog, so
 *  it is quieter than ink on a page. */
export const WALL_INK = { color: "#3448ce", alpha: 0.42 };

/** The paper it is drawn on: StartDialog.tsx's BACKDROP_BASE, the landing
 *  page's --cream. Baked in rather than left transparent - a transparent
 *  WebP keeps its alpha losslessly, and the fine pencil grain made that
 *  2.5MB; on the cream the same wall is about 380KB. So the two must match,
 *  or the backdrop changes colour as the wall arrives. */
export const WALL_PAPER = "#f5ead5";

/** Sizes, biggest first: the longer side in CSS px, and how many of each at
 *  most (so one size cannot take the room the next needs). */
export const WALL_CLASSES = [
  { size: [130, 190], most: 60 },
  { size: [64, 104], most: 120 },
  { size: [24, 46], most: 320 },
] as const;

/** The animals and people are drawn big; these small, to fill the gaps;
 *  anything else middling. */
const BIG = new Set([
  "bear", "bee", "bird", "bunny", "butterfly", "cat", "dog", "duck", "fish", "fox", "frog", "hedgehog", "octopus", "owl",
  "penguin", "snail", "turtle", "whale", "yoga", "reading", "dancing", "surfing", "skateboarding", "meditating", "running",
  "cycling", "swimming", "hiking", "iceskating", "skiing", "dogwalk", "knitting", "painting", "singing", "picnic", "camping",
  "fishing", "gaming", "cooking", "baking", "studying", "climbing", "watering", "hotairballoon", "tennis", "basketball",
  "football", "concert", "cafe",
]);
const SMALL = new Set(["star", "sparkle", "heart", "music", "leaf", "snowflake", "cloud", "lightning", "tick"]);

/** Which size a drawing of `subject` is drawn at: 0 big, 1 middle, 2 small. */
export function wallClassOf(subject: string): number {
  return BIG.has(subject) ? 0 : SMALL.has(subject) ? 2 : 1;
}

export type WallInput = {
  /** Each drawing on the wall: its source (a URL or data URL) and size class. */
  drawings: Array<{ src: string; cls: number }>;
  classes: ReadonlyArray<{ readonly size: readonly [number, number]; readonly most: number }>;
  tile: { w: number; h: number; scale: number };
  ink: { color: string; alpha: number };
  paper: string;
  seed: number;
};

export type WallOutput = { url: string; counts: number[]; covered: number };

/**
 * Draw the wall in a browser and return it as a WebP data URL.
 *
 * Packed the way a doodle wall is drawn: the big ones first, each laid
 * against the ones already down (of the free spots tried, the one whose
 * ring touches the most ink wins) rather than scattered; then the middle
 * ones in the gaps; then the small. Nothing overlaps. Every drawing of a
 * size is used once before any is used twice. The tile wraps, so it
 * repeats with no seam. Seeded: the same input gives the same wall.
 *
 * SELF-CONTAINED - no imports, no module-level names - because the script
 * hands this function's source to a browser page (page.evaluate), where
 * nothing else from this file exists.
 */
export async function packWall(input: WallInput): Promise<WallOutput> {
  const { drawings, classes, tile, ink, paper } = input;
  let seed = input.seed >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const load = (src: string) =>
    new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  const loaded = await Promise.all(drawings.map(async (d) => ({ img: await load(d.src), cls: d.cls })));

  // Occupancy on a coarse grid, wrapping: a cell is 6 CSS px.
  const CELL = 6;
  const GW = Math.round(tile.w / CELL);
  const GH = Math.round(tile.h / CELL);
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

  // A drawing's ink at a size and turn, as cells: what it covers (grown by a
  // cell - a hair of paper between neighbours), and a ring a few cells out
  // round it, which is how much of its neighbours it would touch.
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
    const inked = new Uint8Array(n * n);
    for (let i = 0; i < inked.length; i++) inked[i] = px[i * 4 + 3] > 24 ? 1 : 0;
    const body = grow(inked, n, 1);
    const reach = grow(inked, n, 3);
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
    ((((cy + dy) % GH) + GH) % GH) * GW + ((((cx + dx) % GW) + GW) % GW);
  // A spot to try: a free cell, so a crowded wall still finds its gaps.
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
  for (const [c, cls] of classes.entries()) {
    const pool = loaded.filter((d) => d.cls === c && d.img).map((d) => d.img!);
    let misses = 0;
    let n = 0;
    let bag: HTMLImageElement[] = [];
    // Until this size keeps failing to find room, or has had its share.
    while (pool.length && misses < 8 && n < cls.most) {
      if (!bag.length) {
        bag = [...pool];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      const img = bag.pop()!;
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
        // The first drawings have nothing to touch; after that, the one
        // that nestles in closest wins.
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

  // Each drawing in one blue, at every wrap position it reaches, onto the
  // cream.
  const out = document.createElement("canvas");
  out.width = tile.w * tile.scale;
  out.height = tile.h * tile.scale;
  const o = out.getContext("2d")!;
  o.fillStyle = paper;
  o.fillRect(0, 0, out.width, out.height);
  o.imageSmoothingQuality = "high";
  const tint = document.createElement("canvas");
  const tg = tint.getContext("2d")!;
  for (const p of placed) {
    tint.width = Math.ceil(p.w * tile.scale);
    tint.height = Math.ceil(p.h * tile.scale);
    tg.globalCompositeOperation = "source-over";
    tg.drawImage(p.img, 0, 0, tint.width, tint.height);
    tg.globalCompositeOperation = "source-in";
    tg.fillStyle = ink.color;
    tg.fillRect(0, 0, tint.width, tint.height);
    const reach = Math.hypot(p.w, p.h) / 2;
    for (const ox of [-tile.w, 0, tile.w])
      for (const oy of [-tile.h, 0, tile.h]) {
        const x = p.x + ox;
        const y = p.y + oy;
        if (x + reach < 0 || y + reach < 0 || x - reach > tile.w || y - reach > tile.h) continue;
        o.save();
        o.globalAlpha = ink.alpha;
        o.setTransform(tile.scale, 0, 0, tile.scale, 0, 0);
        o.translate(x, y);
        o.rotate(p.angle);
        o.drawImage(tint, -p.w / 2, -p.h / 2, p.w, p.h);
        o.restore();
      }
  }
  let covered = 0;
  for (const c of occ) covered += c;
  return { url: out.toDataURL("image/webp", 0.82), counts, covered: covered / occ.length };
}
