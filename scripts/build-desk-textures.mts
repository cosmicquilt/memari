// The landing desk's textures, baked once into public/landing/ - a figured
// walnut top and a paper fibre.
//
// They used to be drawn in the browser as the page loaded: 3.7 seconds of
// main thread (dev build) through exactly the moment the title animates.
// Baked, they cost a download instead, and can be far more detailed than a
// page could afford to compute.
//
//   npm run build:desk-textures
//
// The walnut (asked for 2026-09-22: "make the table darker", "a more swirly
// complex wood grain as well with slight chatoyancy"). A 48in square that
// tiles. Growth lines are the level sets of one field: across the boards,
// bent by slow meanders, twisted round swirl sites, and closed into eyes
// round a few knots. Pores, streaks and the curl figure are all drawn in
// that field's own coordinates, so they follow the swirls the way real
// figure follows the grain. Wear on top: scratches, dings, a mug ring, dust.
//
//   wood.jpg          colour (sRGB)
//   wood-surface.jpg  R: height, for bump; G: roughness (half resolution)
//   wood-figure.jpg   R, G: the fibre direction (image x right, y down);
//                     B: the fibres' tilt out of the surface, the curl
//                     figure - what the shimmer reads (scene.ts)
//
// The paper: a 4in square of fibre and formation that tiles, a bump map for
// the journal's pages and the loose sheets.
//
//   paper.jpg         height
//   linen.jpg         the cover cloth's weave, height

import { mkdirSync, statSync } from "node:fs";
import sharp from "sharp";

const OUT = "public/landing";
mkdirSync(OUT, { recursive: true });

// --- noise ------------------------------------------------------------------

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const GRADIENTS = new Float64Array(512);
for (let i = 0; i < 256; i++) {
  const a = (i / 256) * Math.PI * 2;
  GRADIENTS[i * 2] = Math.cos(a);
  GRADIENTS[i * 2 + 1] = Math.sin(a);
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Gradient noise, about -1..1, repeating every px cells in x and py in y. */
function perlin(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ix0 = mod(x0, px);
  const ix1 = mod(x0 + 1, px);
  const iy0 = mod(y0, py);
  const iy1 = mod(y0 + 1, py);
  const g = (ix: number, iy: number, dx: number, dy: number) => {
    const k = (hash(ix, iy, seed) & 255) * 2;
    return GRADIENTS[k] * dx + GRADIENTS[k + 1] * dy;
  };
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = g(ix0, iy0, fx, fy);
  const b = g(ix1, iy0, fx - 1, fy);
  const c = g(ix0, iy1, fx, fy - 1);
  const d = g(ix1, iy1, fx - 1, fy - 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.41;
}

/** Octaves of perlin over a tile: (tu, tv) are 0..1 across it, `cells` the
 *  coarsest octave's cells across (x) and down (y). */
function fbm(tu: number, tv: number, cx: number, cy: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const f = 1 << i;
    sum += amp * perlin(tu * cx * f, tv * cy * f, cx * f, cy * f, seed + i * 101);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** A seeded 0..1 stream. */
function stream(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function save(name: string, width: number, height: number, rgb: Uint8Array, quality: number, exact: boolean) {
  const file = `${OUT}/${name}`;
  await sharp(Buffer.from(rgb.buffer, rgb.byteOffset, rgb.byteLength), { raw: { width, height, channels: 3 } })
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: exact ? "4:4:4" : "4:2:0" })
    .toFile(file);
  const { size } = statSync(file);
  console.log(`${file}  ${width}x${height}  ${(size / 1024).toFixed(0)} KB`);
}

// --- the walnut -----------------------------------------------------------------

const TILE_IN = 48;
const WOOD_PX = 2048;

// The desk plane (scene.ts) maps this tile so that world (x, z) inches land
// at tile ((x + 45) mod 48, (z + 23) mod 48). Features are placed in world
// terms, where they will be seen - beside the book, behind it, below the
// title - and converted.
const toTile = (x: number, z: number): [number, number] => [mod(x + 45, TILE_IN), mod(z + 23, TILE_IN)];

// Every feature's size is scaled by this: Andrew liked the first bake's
// grain "maybe a little more zoomed out", so the figure is drawn at three
// quarters of the size it was, on the same 48in tile (no more repeats).
const SCALE = 0.75;

type Swirl = { c: [number, number]; r: number; s: number };
const SWIRLS: Swirl[] = [
  { c: toTile(11, -7.5), r: 4, s: 2.2 },
  { c: toTile(-9.5, -11.5), r: 3.2, s: -2.6 },
  { c: toTile(13.5, 2.5), r: 2.4, s: 2.8 },
  { c: toTile(-4, -16), r: 6, s: -1.1 },
  { c: toTile(-16, -14), r: 3, s: 2.4 },
  { c: toTile(20, -17), r: 4, s: -1.8 },
  { c: toTile(6, -22), r: 3, s: 2.0 },
  { c: toTile(-2, 10), r: 4, s: -1.6 },
  { c: toTile(3, 13), r: 2.5, s: 2.5 },
  { c: toTile(-19, 6), r: 5, s: 1.3 },
].map((swirl) => ({ ...swirl, r: swirl.r * SCALE }));
type Knot = { c: [number, number]; r: number; a: number };
const KNOTS: Knot[] = [
  { c: toTile(-9.5, -11.5), r: 0.55, a: 1.5 },
  { c: toTile(13.6, 2.4), r: 0.4, a: 1.2 },
  { c: toTile(16.5, -5.2), r: 0.22, a: 0.6 },
  { c: toTile(-2, 10), r: 0.5, a: 1.3 },
].map((knot) => ({ ...knot, r: knot.r * SCALE, a: knot.a * SCALE }));

/** The shortest offset from c to p on the tile's torus. */
function wrapDelta(p: number, c: number) {
  let d = p - c;
  if (d > TILE_IN / 2) d -= TILE_IN;
  if (d < -TILE_IN / 2) d += TILE_IN;
  return d;
}

/**
 * The grain's own coordinates at a point (inches): phi runs ACROSS the grain
 * (its level sets are the growth lines), psi ALONG it. Both repeat with the
 * tile, each gaining exactly 48 across a seam in its own direction.
 */
function grain(u: number, v: number): { phi: number; psi: number; knot: number } {
  let x = u;
  let y = v;
  for (const { c, r, s } of SWIRLS) {
    const dx = wrapDelta(x, c[0]);
    const dy = wrapDelta(y, c[1]);
    const d2 = dx * dx + dy * dy;
    const a = s * Math.exp(-d2 / (r * r));
    if (Math.abs(a) < 1e-4) continue;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    x = x - dx + (dx * cos - dy * sin);
    y = y - dy + (dx * sin + dy * cos);
  }
  const tu = x / TILE_IN;
  const tv = y / TILE_IN;
  // Slow meanders across the whole top, a waver on them, and a tremble.
  // (Cell counts are whole numbers so the tile repeats; each is the first
  // bake's divided by SCALE, rounded.)
  const w = 1.95 * fbm(tu, tv, 3, 4, 3, 11) + 0.53 * fbm(tu, tv, 11, 16, 3, 23) + 0.06 * perlin(tu * 64, tv * 128, 64, 128, 37);
  let phi = y + w;
  let knot = 0;
  for (const { c, r, a } of KNOTS) {
    const dx = wrapDelta(x, c[0]);
    const dy = wrapDelta(y, c[1]);
    const d2 = dx * dx + dy * dy;
    // A bump steeper than the grain's own slope closes the lines into
    // rings round it: the eye of a knot.
    phi += a * Math.exp(-d2 / (r * r));
    knot = Math.max(knot, Math.exp(-d2 / (r * r * 0.12)));
  }
  const psi = x + 0.68 * fbm(tu, tv, 5, 5, 2, 47);
  return { phi, psi, knot };
}

async function walnut() {
  const S = WOOD_PX;
  const perIn = S / TILE_IN;
  const color = new Float32Array(S * S * 3);
  const height = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const F = S / 2;
  const figure = new Uint8Array(F * F * 3);

  // Colours of oiled black walnut, before the sun: latewood nearly
  // chocolate, earlywood a warm brown, figure catching gold, and the grey-
  // violet streaks walnut has.
  const EARLY = [112, 74, 48];
  const LATE = [50, 31, 21];
  const GOLD = [150, 102, 58];
  const MINERAL = [74, 58, 52];
  const RINGS_PER_IN = 212 / TILE_IN; // a whole number of rings per tile

  for (let py = 0; py < S; py++) {
    const v = (py + 0.5) / perIn;
    for (let px = 0; px < S; px++) {
      const u = (px + 0.5) / perIn;
      const { phi, psi, knot } = grain(u, v);
      const tu = u / TILE_IN;
      const tv = v / TILE_IN;
      const gu = psi / TILE_IN;
      const gv = phi / TILE_IN;

      // Broad flames of colour following the grain, wandering in width
      // along the board - underneath the lines, not instead of them.
      const flame = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (phi * (32 / TILE_IN) + 0.9 * fbm(gu, gv, 4, 16, 3, 43)));
      // Growth rings: a latewood band darkening in and ending sharply, the
      // line stronger and weaker along its length.
      const t = phi * RINGS_PER_IN - Math.floor(phi * RINGS_PER_IN);
      const band = smoothstep(0.45, 0.88, t) * (1 - smoothstep(0.9, 0.995, t));
      const lineStrength = 0.6 + 0.4 * fbm(gu, gv, 16, 128, 2, 53);
      // Streaks drawn along the grain: long and thin.
      const streak = perlin(gu * 64, gv * 256, 64, 256, 61);
      const goldMask = smoothstep(0.1, 0.55, fbm(gu, gv, 8, 32, 3, 67));
      const mineral = smoothstep(0.35, 0.7, fbm(gu, gv, 4, 64, 3, 71));
      // Pores: dark hairlines an inch or so long, strung along the grain.
      const pore = smoothstep(0.38, 0.7, perlin(gu * 48, gv * 1728, 48, 1728, 79));
      const tone = fbm(tu, tv, 3, 3, 3, 83);
      // The curl: bands across the grain where the fibres dip and rise.
      // Not coloured in - it is a trick of the light, drawn by the shader
      // from the figure map.
      const curlStrength = smoothstep(-0.05, 0.45, fbm(gu, gv, 5, 8, 2, 89));
      const curl = Math.sin(Math.PI * 2 * (psi * (144 / TILE_IN) + 1.1 * fbm(gu, gv, 16, 16, 2, 97)));

      const k = band * lineStrength;
      const depth = 0.3 * (1 - flame) + 0.8 * k;
      let r = mix(EARLY[0], LATE[0], depth);
      let g = mix(EARLY[1], LATE[1], depth);
      let b = mix(EARLY[2], LATE[2], depth);
      const lift = goldMask * 0.4 * (0.5 + 0.5 * flame) * (1 - k);
      r = mix(r, GOLD[0], lift);
      g = mix(g, GOLD[1], lift);
      b = mix(b, GOLD[2], lift);
      const grey = mineral * 0.25;
      r = mix(r, MINERAL[0], grey);
      g = mix(g, MINERAL[1], grey);
      b = mix(b, MINERAL[2], grey);
      const shade = (1 + 0.12 * tone) * (1 + 0.06 * streak) * (1 - 0.3 * pore);
      r *= shade;
      g *= shade;
      b *= shade;
      // A knot's heart: nearly black.
      r = mix(r, 34, knot * 0.85);
      g = mix(g, 22, knot * 0.85);
      b = mix(b, 16, knot * 0.85);

      const i = py * S + px;
      color[i * 3] = r;
      color[i * 3 + 1] = g;
      color[i * 3 + 2] = b;
      // Oiled wood: the soft earlywood wears down, the latewood stands
      // proud; the pores are pits.
      height[i] = 0.5 + 0.1 * k + 0.03 * streak - 0.28 * pore - 0.25 * knot;
      rough[i] = 0.5 + 0.08 * (1 - k) + 0.25 * pore + 0.05 * mineral;

      if ((px & 1) === 0 && (py & 1) === 0) {
        // The fibre direction: along the growth line, which is where phi
        // does not change. Sampled at the figure map's resolution.
        const e = 1 / perIn;
        const dpu = grain(u + e, v).phi - phi;
        const dpv = grain(u, v + e).phi - phi;
        let fx = dpv;
        let fy = -dpu;
        const len = Math.hypot(fx, fy) || 1;
        fx /= len;
        fy /= len;
        const j = ((py >> 1) * F + (px >> 1)) * 3;
        figure[j] = Math.round((fx * 0.5 + 0.5) * 255);
        figure[j + 1] = Math.round((fy * 0.5 + 0.5) * 255);
        figure[j + 2] = Math.round((0.5 + 0.5 * curl * curlStrength) * 255);
      }
    }
  }

  // --- wear
  const rand = stream(20260922);
  const splat = (cx: number, cy: number, radius: number, apply: (i: number, w: number) => void) => {
    const r = Math.ceil(radius * 2.5);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const w = Math.exp(-(dx * dx + dy * dy) / (radius * radius));
        if (w < 0.02) continue;
        const x = mod(Math.round(cx) + dx, S);
        const y = mod(Math.round(cy) + dy, S);
        apply(y * S + x, w);
      }
    }
  };
  // Scratches: mostly along the desk, a few across it; most short.
  for (let n = 0; n < 260; n++) {
    const x0 = rand() * S;
    const y0 = rand() * S;
    const along = rand() < 0.8;
    const angle = along ? (rand() - 0.5) * 0.7 : rand() * Math.PI;
    const length = (0.2 + Math.pow(rand(), 2.2) * 5) * perIn;
    const depth = 0.25 + rand() * 0.6;
    const bow = (rand() - 0.5) * 0.25;
    for (let s = 0; s < length; s += 0.5) {
      const a = angle + bow * (s / length - 0.5);
      const fade = Math.sin(Math.PI * (s / length)) ** 0.6;
      splat(x0 + Math.cos(a) * s, y0 + Math.sin(a) * s, 0.55, (i, w) => {
        const k = w * depth * fade;
        color[i * 3] = mix(color[i * 3], 150, k * 0.35);
        color[i * 3 + 1] = mix(color[i * 3 + 1], 116, k * 0.35);
        color[i * 3 + 2] = mix(color[i * 3 + 2], 88, k * 0.35);
        height[i] -= k * 0.35;
        rough[i] = mix(rough[i], 0.78, k);
      });
    }
  }
  // Dings: small dents, darker where the finish is crushed.
  for (let n = 0; n < 60; n++) {
    const x = rand() * S;
    const y = rand() * S;
    const radius = (0.02 + rand() * 0.05) * perIn;
    splat(x, y, radius, (i, w) => {
      color[i * 3] *= 1 - 0.25 * w;
      color[i * 3 + 1] *= 1 - 0.25 * w;
      color[i * 3 + 2] *= 1 - 0.25 * w;
      height[i] -= 0.5 * w;
    });
  }
  // A mug ring, behind the book on the right, and the fainter one beside it
  // from the time before.
  for (const [wx, wz, radius, strength] of [
    [5.8, -7.4, 1.52, 1],
    [6.25, -7.05, 1.55, 0.45],
  ] as const) {
    const [cu, cv] = toTile(wx, wz);
    for (let a = 0; a < Math.PI * 2; a += 1.5 / (radius * perIn)) {
      const k = strength * clamp01(0.55 + 0.6 * perlin(a * 1.6, 0.5, 11, 1, 101)) * (0.8 + 0.2 * Math.sin(a * 7));
      if (k <= 0) continue;
      splat((cu + Math.cos(a) * radius) * perIn, (cv + Math.sin(a) * radius) * perIn, 0.05 * perIn, (i, w) => {
        const d = w * k;
        color[i * 3] *= 1 - 0.1 * d;
        color[i * 3 + 1] *= 1 - 0.12 * d;
        color[i * 3 + 2] *= 1 - 0.14 * d;
        rough[i] = mix(rough[i], 0.36, d * 0.7);
      });
    }
  }
  // Dust and lint: pale specks that catch the light.
  for (let n = 0; n < 4200; n++) {
    const x = rand() * S;
    const y = rand() * S;
    const k = 0.1 + rand() * 0.35;
    splat(x, y, 0.45 + rand() * 0.6, (i, w) => {
      color[i * 3] = mix(color[i * 3], 205, w * k);
      color[i * 3 + 1] = mix(color[i * 3 + 1], 196, w * k);
      color[i * 3 + 2] = mix(color[i * 3 + 2], 182, w * k);
      rough[i] = mix(rough[i], 0.95, w * k);
    });
  }

  const rgb = new Uint8Array(S * S * 3);
  for (let i = 0; i < S * S * 3; i++) rgb[i] = Math.max(0, Math.min(255, Math.round(color[i])));
  await save("wood.jpg", S, S, rgb, 84, false);
  // Relief and sheen at half the colour's resolution, each texel the mean of
  // four: at the distance the desk is seen from, the pores' own relief is
  // below a pixel, and the grain's is not.
  const surface = new Uint8Array(F * F * 3);
  for (let y = 0; y < F; y++) {
    for (let x = 0; x < F; x++) {
      let hs = 0;
      let rs = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = (y * 2 + dy) * S + x * 2 + dx;
        hs += height[i];
        rs += rough[i];
      }
      const j = (y * F + x) * 3;
      surface[j] = Math.round(clamp01(hs / 4) * 255);
      surface[j + 1] = Math.round(clamp01(rs / 4) * 255);
      surface[j + 2] = 128;
    }
  }
  await save("wood-surface.jpg", F, F, surface, 88, true);
  await save("wood-figure.jpg", F, F, figure, 92, true);
}

// --- paper ------------------------------------------------------------------

/** A 4in square of uncoated paper at 128px to the inch: the cloudy
 *  formation of the sheet, fibres lying every way across it, and grain. */
async function paper() {
  const S = 512;
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const tu = x / S;
      const tv = y / S;
      h[y * S + x] = 0.5 + 0.1 * fbm(tu, tv, 8, 8, 4, 131) + 0.05 * perlin(tu * 128, tv * 128, 128, 128, 137);
    }
  }
  const rand = stream(424242);
  for (let n = 0; n < 4500; n++) {
    let x = rand() * S;
    let y = rand() * S;
    let a = rand() * Math.PI * 2;
    const length = 6 + rand() * 30;
    const k = (rand() < 0.5 ? -1 : 1) * (0.03 + rand() * 0.06);
    for (let s = 0; s < length; s += 0.7) {
      a += (rand() - 0.5) * 0.12;
      x += Math.cos(a) * 0.7;
      y += Math.sin(a) * 0.7;
      const i = mod(Math.round(y), S) * S + mod(Math.round(x), S);
      h[i] += k;
    }
  }
  const rgb = new Uint8Array(S * S * 3);
  for (let i = 0; i < S * S; i++) rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = Math.round(clamp01(h[i]) * 255);
  await save("paper.jpg", S, S, rgb, 85, false);
}

/** The cover's linen: warp and weft, with slubs - thicker runs of thread. */
async function linen() {
  const S = 512;
  const rgb = new Uint8Array(S * S * 3);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const tu = x / S;
      const tv = y / S;
      const warp = Math.sin(tu * Math.PI * 2 * 128) * 0.5 + 0.5;
      const weft = Math.sin(tv * Math.PI * 2 * 128) * 0.5 + 0.5;
      const slub = 0.5 + 0.25 * perlin(tu * 64, tv * 8, 64, 8, 7) + 0.25 * perlin(tu * 8, tv * 64, 8, 64, 9);
      const v = 255 * clamp01(0.35 * warp + 0.35 * weft + 0.3 * slub);
      const i = (y * S + x) * 3;
      rgb[i] = rgb[i + 1] = rgb[i + 2] = Math.round(v);
    }
  }
  await save("linen.jpg", S, S, rgb, 85, false);
}

const started = Date.now();
await walnut();
await paper();
await linen();
console.log(`baked in ${((Date.now() - started) / 1000).toFixed(1)}s`);
