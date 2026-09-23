// What makes ink look like it is ON PAPER rather than on a screen.
//
// Asked for, 2026-09-22: the handwriting looked "too clean, like it was
// written on an iPad". A tablet draws a perfect vector edge in a perfectly
// flat colour. A pen on paper does not:
//   - the ink FEATHERS into the fibres, so an edge is slightly ragged;
//   - it takes up UNEVENLY - denser in some fibres than others, speckled
//     where a ballpoint skips;
//   - PRESSURE varies, so some letters come out lighter than their
//     neighbours.
// Two pieces here: letters are rendered once into a small sprite whose alpha
// is roughened at the edges and mottled inside (inkSprite), and every ink
// layer is multiplied by a fibre mask before it reaches the page
// (fibreMask). Both cost nothing per frame: the sprite is made once per
// letter and the mask is one tile.

/** A cheap, stable hash of two integers to 0..1. */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise at a given cell size. */
function valueNoise(x: number, y: number, cell: number, seed: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
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
};

/** Per pen kind: a felt-tip bleeds and is even; a ballpoint is crisp but
 *  skips; a fine liner sits between. */
export const FEEL: Record<string, InkFeel> = {
  marker: { edge: 0.5, mottle: 0.1 },
  ink: { edge: 0.35, mottle: 0.3 },
  pencil: { edge: 0.5, mottle: 0.6 },
};

/**
 * Roughen a rendered letter in place: threshold its anti-aliased edge
 * against fine noise (a feathered, fibrous edge), then mottle its density
 * with a coarser noise. `seed` makes each letter its own.
 */
export function roughen(ctx: CanvasRenderingContext2D, width: number, height: number, feel: InkFeel, seed: number) {
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4 + 3;
      const a = d[i] / 255;
      if (a === 0) continue;
      const fine = hash(x, y, seed) * 0.6 + valueNoise(x, y, 2.2, seed + 1) * 0.4;
      const edged = smooth(0.2, 0.8, a + (fine - 0.5) * feel.edge);
      const patch = valueNoise(x, y, 5, seed + 2) * 0.6 + valueNoise(x, y, 14, seed + 3) * 0.4;
      d[i] = Math.round(255 * edged * (1 - feel.mottle + feel.mottle * (0.35 + 0.65 * patch)));
    }
  }
  ctx.putImageData(img, 0, 0);
}

let mask: HTMLCanvasElement | null = null;
/**
 * A tile of paper fibre as an alpha mask: mostly near-opaque, with short
 * lighter streaks where fibres take up less ink. Every ink layer is
 * multiplied by it (destination-in) on its way to the page.
 */
export function fibreMask(): HTMLCanvasElement {
  if (mask) return mask;
  const size = 256;
  mask = document.createElement("canvas");
  mask.width = mask.height = size;
  const ctx = mask.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Fibres run mostly one way: noise stretched along x, tileable by
      // wrapping the lattice.
      const fibre = valueNoise(x % size, (y * 3) % (size * 3), 6, 91);
      const speck = hash(x, y, 7);
      const alpha = 0.88 + 0.12 * fibre - (speck > 0.985 ? 0.3 : 0);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
      img.data[i + 3] = Math.round(255 * Math.max(0.35, Math.min(1, alpha)));
    }
  }
  ctx.putImageData(img, 0, 0);
  return mask;
}
