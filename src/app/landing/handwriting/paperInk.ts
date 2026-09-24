// What makes ink look like it is ON PAPER rather than on a screen.
//
// Asked for, 2026-09-22: the handwriting looked "too clean, like it was
// written on an iPad". A tablet draws a perfect vector edge in a perfectly
// flat colour. A pen on paper does not:
//   - the ink FEATHERS into the fibres, so an edge is slightly ragged, and
//     BLEEDS a faint halo past it;
//   - it takes up UNEVENLY - denser in some fibres than others, speckled
//     where a ballpoint skips; a felt tip POOLS at the edges of its line;
//   - PRESSURE varies, so some letters come out lighter than their
//     neighbours.
// And again, 2026-09-24: the writing and, less so, the printed layouts
// still looked "written on ipad". The texture had been at the scale of a
// single texel, and the page is shown at under half its texture's size and
// sampled down by the GPU - averaged away before anyone saw it. Measured on
// screen, what survives that is variation at the scale of a stroke or a
// whole letter: so the edge noise is a few texels across (`grain`), the
// density patches are about a stroke wide, and each letter is pressed a
// little harder or lighter than the next.
//
// Pieces: letters are rendered once into a small sprite whose alpha is
// roughened, mottled and bled (roughen); pen lines bleed through a shadow
// as they are laid down (ink.ts); every ink layer is multiplied by a fibre
// mask on its way to the page (fibreMask); the print by a gentler one
// (printMask). None costs anything per frame: sprites are made once per
// letter and the masks are one tile each.

/** A cheap, stable hash of two integers to 0..1. */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise with cells `cx` by `cy`; the lattice wraps every
 *  `period` cells when one is given, so a tile made of it repeats cleanly. */
function valueNoise(x: number, y: number, cx: number, cy: number, seed: number, period = 0): number {
  const gx = x / cx;
  const gy = y / cy;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const wx = (v: number) => (period ? ((v % Math.round(period / cx)) + Math.round(period / cx)) % Math.round(period / cx) : v);
  const wy = (v: number) => (period ? ((v % Math.round(period / cy)) + Math.round(period / cy)) % Math.round(period / cy) : v);
  const a = hash(wx(x0), wy(y0), seed);
  const b = hash(wx(x0 + 1), wy(y0), seed);
  const c = hash(wx(x0), wy(y0 + 1), seed);
  const d = hash(wx(x0 + 1), wy(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export type InkFeel = {
  /** How ragged the edge is, 0 (clean) to 1. */
  edge: number;
  /** How patchy the density is, 0 (flat) to 1. */
  mottle: number;
  /** How strong the halo bled past the line is, 0 to about 0.3. */
  bleed: number;
  /** How much lighter a line's middle is than its edges, where the ink
   *  pools - a felt tip's; 0 for a ballpoint. */
  pool: number;
  /** How much lighter a letter may come out than its neighbours. */
  pressure: number;
  /** Keep the ink's own alpha - a drawing's washes, grain and pale
   *  strokes - and only nudge it at the edge, instead of thresholding it
   *  into a solid letter. */
  soft?: boolean;
};

/** Per pen kind: a felt-tip bleeds, pools and is even; a ballpoint is crisp
 *  but skips; a fine liner sits between. */
export const FEEL: Record<string, InkFeel> = {
  marker: { edge: 0.55, mottle: 0.34, bleed: 0.24, pool: 0.2, pressure: 0.22 },
  ink: { edge: 0.45, mottle: 0.42, bleed: 0.13, pool: 0.05, pressure: 0.28 },
  pencil: { edge: 0.6, mottle: 0.6, bleed: 0, pool: 0, pressure: 0.3 },
};

/** Texels per paper feature at a canvas scale (canvas px per print px, 300
 *  print px an inch): about a hundredth of an inch - the size of a fibre's
 *  width and a felt tip's feathering - and never under a texel and a half. */
export function grainAt(scale: number) {
  return Math.max(1.5, 300 * scale * 0.011);
}

/** A box blur of an alpha channel, radius r, in both directions. */
function blurAlpha(src: Float32Array, width: number, height: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * width + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = sum / n;
      sum += src[y * width + Math.min(width - 1, x + r + 1)] - src[y * width + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / n;
      sum += tmp[Math.min(height - 1, y + r + 1) * width + x] - tmp[Math.max(0, y - r) * width + x];
    }
  }
  return out;
}

/**
 * Roughen a rendered letter in place: threshold its anti-aliased edge
 * against noise a few texels across (a feathered, fibrous edge), mottle its
 * density, lighten its middle where a felt tip pools, bleed a faint halo
 * past it, and set its pressure. `seed` makes each letter its own; `grain`
 * is texels per paper feature (grainAt). Leave `grain` texels of empty
 * margin round the letter for the halo.
 */
export function roughen(ctx: CanvasRenderingContext2D, width: number, height: number, feel: InkFeel, seed: number, grain: number) {
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  const core = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = d[(y * width + x) * 4 + 3] / 255;
      if (a === 0) continue;
      const fine = valueNoise(x, y, grain * 0.7, grain * 0.7, seed + 1) * 0.55 + valueNoise(x, y, grain * 1.8, grain * 1.8, seed + 4) * 0.45;
      core[y * width + x] = feel.soft ? Math.min(1, Math.max(0, a + (fine - 0.5) * feel.edge * Math.min(1, a * 3))) : smooth(0.25, 0.75, a + (fine - 0.5) * feel.edge);
    }
  }
  // One blur serves twice: how deep inside the line each texel is (1 in the
  // middle of a thick stroke, falling to its edge) and the halo past it.
  const soft = feel.pool > 0 || feel.bleed > 0 ? blurAlpha(core, width, height, Math.max(1, Math.round(grain))) : null;
  const pressed = 1 - feel.pressure * hash(seed, 17, 5);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const j = y * width + x;
      let a = 0;
      if (core[j] > 0) {
        const patch = valueNoise(x, y, grain * 5, grain * 5, seed + 2) * 0.5 + valueNoise(x, y, grain * 14, grain * 14, seed + 3) * 0.5;
        a = core[j] * (1 - feel.mottle + feel.mottle * (0.3 + 0.7 * patch));
        if (soft && feel.pool > 0) a *= 1 - feel.pool * smooth(0.6, 1, soft[j]);
      }
      if (soft && feel.bleed > 0) a = Math.max(a, soft[j] * feel.bleed);
      d[j * 4 + 3] = Math.round(255 * a * pressed);
    }
  }
  ctx.putImageData(img, 0, 0);
}

const SIZE = 256;

function maskTile(alphaAt: (x: number, y: number) => number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      img.data[i + 3] = Math.round(255 * Math.max(0.3, Math.min(1, alphaAt(x, y))));
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

let fibre: HTMLCanvasElement | null = null;
/**
 * A tile of paper as an alpha mask for ink: mostly near-opaque, with fibres
 * - streaks a few texels wide, most running one way - that take up less
 * ink, a cloudy unevenness in how the sheet was formed, and small pits the
 * pen skips over. Every ink layer is multiplied by it (destination-in) on
 * its way to the page. Its lattices wrap at the tile's edge.
 */
export function fibreMask(): HTMLCanvasElement {
  fibre ??= maskTile((x, y) => {
    const along = valueNoise(x, y, 16, 4, 91, SIZE);
    const across = valueNoise(x, y, 4, 16, 92, SIZE);
    const streak = smooth(0.55, 0.85, along) * 0.2 + smooth(0.6, 0.9, across) * 0.1;
    const cloud = valueNoise(x, y, 32, 32, 93, SIZE) * 0.1;
    const pit = smooth(0.8, 0.95, valueNoise(x, y, 2, 2, 94, SIZE)) * 0.45;
    return 1 - streak - cloud - pit;
  });
  return fibre;
}

let print: HTMLCanvasElement | null = null;
/**
 * The same for print: a press lays ink far more evenly than a pen, but not
 * perfectly - a cloudy density across the sheet, and a fine tooth where the
 * paper's surface did not quite meet it.
 */
export function printMask(): HTMLCanvasElement {
  print ??= maskTile((x, y) => {
    const cloud = valueNoise(x, y, 64, 64, 71, SIZE) * 0.12 + valueNoise(x, y, 16, 16, 72, SIZE) * 0.06;
    const tooth = smooth(0.65, 0.95, valueNoise(x, y, 2, 2, 73, SIZE)) * 0.22;
    return 1 - cloud - tooth;
  });
  return print;
}
