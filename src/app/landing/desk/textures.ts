// Procedural textures for the desk scene, drawn on canvases at load.
//
// Generated rather than shipped as images: a wood grain, a linen weave and a
// window's leaf shadow are a few KB of code and cost nothing to download.
// When photographs arrive (Andrew means to try Midjourney desks), the wood
// and the wall are the pieces they replace; the journal stays procedural,
// because its pages have to be the real layouts.

import * as THREE from "three";

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value noise: the lattice wraps every `period` cells. */
function noise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (v: number) => ((v % period) + period) % period;
  const a = hash(w(x0), w(y0), seed);
  const b = hash(w(x0 + 1), w(y0), seed);
  const c = hash(w(x0), w(y0 + 1), seed);
  const d = hash(w(x0 + 1), w(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, period: number, seed: number, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let p = period;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * f, y * f, p, seed + i * 17);
    amp *= 0.5;
    f *= 2;
    p *= 2;
  }
  return sum;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Oiled oak, planks running left to right. Growth lines are thin, uneven and
 * mostly straight - long streaks that drift and pinch rather than waves -
 * with open pores along them and each plank a slightly different tone.
 * Returns colour and a roughness map; the pores are a little rougher than
 * the oiled wood around them.
 */
export function woodTextures(size = 1024) {
  const color = canvas(size, size);
  const rough = canvas(size, size);
  const cctx = color.getContext("2d")!;
  const rctx = rough.getContext("2d")!;
  const cimg = cctx.createImageData(size, size);
  const rimg = rctx.createImageData(size, size);
  const planks = 4;
  const light = [196, 156, 112];
  const dark = [128, 86, 54];
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const p = Math.floor(v * planks);
    const inPlank = v * planks - p;
    const tone = [0.0, 0.07, -0.05, 0.04][p % 4];
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Growth lines: across the plank, bent slowly along it.
      const bend = fbm(u * 2, v * 3 + p * 5.3, 2, 31 + p, 3) * 1.6 + fbm(u * 8, v * 8, 8, 41 + p, 2) * 0.25;
      const ring = (v * 26 + bend) % 1;
      const line = Math.exp(-Math.pow((ring - 0.5) / 0.07, 2)) * (0.55 + 0.45 * fbm(u * 6, v * 20, 6, 51 + p, 2));
      // Pores: short dark flecks strung along the grain.
      const pore = Math.pow(noise(u * 256, v * 24, 256, 61 + p), 6) * 1.6;
      // Slow colour drift within a plank.
      const drift = fbm(u * 3, v * 6, 3, 71 + p, 3) - 0.5;
      const seam = inPlank < 0.004 || inPlank > 0.996;
      const k = Math.min(1, line * 0.55 + pore * 0.35 + 0.25 + drift * 0.3);
      const i = (y * size + x) * 4;
      const shade = (1 + tone) * (seam ? 0.5 : 1);
      cimg.data[i] = mix(light[0], dark[0], k) * shade;
      cimg.data[i + 1] = mix(light[1], dark[1], k) * shade;
      cimg.data[i + 2] = mix(light[2], dark[2], k) * shade;
      cimg.data[i + 3] = 255;
      const rv = seam ? 255 : 130 + pore * 70 - line * 20;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.max(0, Math.min(255, rv));
      rimg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = new THREE.CanvasTexture(rough);
  for (const t of [map, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, roughnessMap };
}

/** A fine linen weave, as a bump map - the cloth the journal is bound in. */
export function linenBump(size = 512) {
  const c = canvas(size, size);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const warp = Math.sin((x / size) * Math.PI * 2 * 128) * 0.5 + 0.5;
      const weft = Math.sin((y / size) * Math.PI * 2 * 128) * 0.5 + 0.5;
      const slub = noise((x / size) * 64, (y / size) * 8, 64, 7) * 0.5 + noise((x / size) * 8, (y / size) * 64, 64, 9) * 0.5;
      const v = 255 * (0.35 * warp + 0.35 * weft + 0.3 * slub);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * The journal's front cover: charcoal cloth with "memari." in a warm foil,
 * the way the title reads on the landing page. Colour, roughness (the foil is
 * smoother than the cloth) and bump (the foil is pressed in).
 */
export function coverTextures(wordmarkFamily: string, width = 1024, height = 1448) {
  const color = canvas(width, height);
  const rough = canvas(width, height);
  const bump = canvas(width, height);
  const c = color.getContext("2d")!;
  const r = rough.getContext("2d")!;
  const b = bump.getContext("2d")!;
  // Cloth: a charcoal with a faint warm cast, mottled a little.
  c.fillStyle = "#2b2a2c";
  c.fillRect(0, 0, width, height);
  const img = c.getImageData(0, 0, width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = fbm((x / width) * 8, (y / height) * 8, 8, 21, 3) - 0.5;
      const i = (y * width + x) * 4;
      img.data[i] += n * 14;
      img.data[i + 1] += n * 13;
      img.data[i + 2] += n * 12;
    }
  }
  c.putImageData(img, 0, 0);
  r.fillStyle = "#e0e0e0";
  r.fillRect(0, 0, width, height);
  b.fillStyle = "#808080";
  b.fillRect(0, 0, width, height);
  // The wordmark, lower on the cover than centre, like a real journal's.
  const size = Math.round(width * 0.105);
  const x = width / 2;
  const y = height * 0.44;
  for (const [ctx, style] of [
    [c, "#d9cfb8"],
    [r, "#5a5a5a"],
    [b, "#606060"],
  ] as const) {
    ctx.font = `700 ${size}px ${wordmarkFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = style;
    ctx.fillText("memari.", x, y);
  }
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return { map, roughnessMap: new THREE.CanvasTexture(rough), bumpMap: new THREE.CanvasTexture(bump) };
}

/** The edges of a block of pages: thin warm-white leaves, a few darker. */
export function pageEdges(width = 64, height = 256) {
  const c = canvas(width, height);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#efe9dc";
  ctx.fillRect(0, 0, width, height);
  for (let y = 0; y < height; y += 2) {
    const v = hash(0, y, 5);
    ctx.fillStyle = `rgba(120, 105, 85, ${0.08 + v * 0.18})`;
    ctx.fillRect(0, y, width, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Sunlight through a window with a plant in it - the light a lofi study
 * scene is lit by. White where light passes, dark where the window frame and
 * the leaves block it, softened as a real shadow is at a distance. Projected
 * by the sun (a spot light's `map`).
 */
export function windowLight(size = 1024) {
  const c = canvas(size, size);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  // Four panes.
  ctx.fillStyle = "#fff";
  const m = size * 0.1;
  const bar = size * 0.035;
  const pane = (size - 2 * m - bar) / 2;
  for (const px of [0, 1]) for (const py of [0, 1]) ctx.fillRect(m + px * (pane + bar), m + py * (pane + bar), pane, pane);
  // Leaves across the lower-left panes: pothos-ish ovals on trailing stems.
  ctx.fillStyle = "#000";
  let seed = 3;
  const rand = () => hash(seed++, 1, 77);
  for (let stem = 0; stem < 4; stem++) {
    let x = size * (0.05 + rand() * 0.45);
    let y = size * (0.35 + rand() * 0.2);
    for (let leaf = 0; leaf < 9; leaf++) {
      x += size * (0.02 + rand() * 0.06);
      y += size * (0.03 + rand() * 0.05);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rand() * Math.PI * 2);
      const w = size * (0.03 + rand() * 0.04);
      ctx.beginPath();
      ctx.moveTo(0, -w * 1.6);
      ctx.quadraticCurveTo(w, -w * 0.4, 0, w * 1.2);
      ctx.quadraticCurveTo(-w, -w * 0.4, 0, -w * 1.6);
      ctx.fill();
      ctx.restore();
    }
  }
  // Soften everything: a shadow cast from a window metres away is blurred.
  const soft = canvas(size, size);
  const sctx = soft.getContext("2d")!;
  sctx.filter = `blur(${Math.round(size * 0.012)}px)`;
  sctx.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(soft);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A sheet of lined notepaper with a few lines already written on it. */
/** A line on a loose sheet: `~` first strikes it through (done), and a
 *  leading "  " indents it. */
export type NoteLine = string;

/**
 * A loose sheet of ruled paper with notes on it in someone's hand. It is
 * blank ruled paper until `write` is called with a loaded handwriting face -
 * the faces load after the scene is built.
 */
export function notepaper(ink: string, lines: NoteLine[], seed: number, [inchesWide, inchesTall]: readonly [number, number]) {
  // At 120px to the inch; wide ruled (11/32in), the first line and the
  // margin an inch and a quarter in on a letter sheet, less on a smaller one.
  const perInch = 120;
  const width = Math.round(inchesWide * perInch);
  const height = Math.round(inchesTall * perInch);
  const rule = 41;
  const first = Math.round(Math.min(1.25, inchesTall * 0.12) * perInch);
  const margin = Math.round(Math.min(1.25, inchesWide * 0.16) * perInch);
  const c = canvas(width, height);
  const ctx = c.getContext("2d")!;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const paper = () => {
    ctx.fillStyle = "#f6f2e7";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(90, 130, 190, 0.35)";
    ctx.lineWidth = 2;
    for (let y = first; y < height - 30; y += rule) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(200, 80, 80, 0.45)";
    ctx.beginPath();
    ctx.moveTo(margin, 0);
    ctx.lineTo(margin, height);
    ctx.stroke();
  };
  paper();

  const write = (family: string, size: number) => {
    paper();
    let state = seed >>> 0 || 1;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.textBaseline = "alphabetic";
    for (const [i, raw] of lines.entries()) {
      if (!raw) continue;
      const done = raw.startsWith("~");
      const text = done ? raw.slice(1) : raw;
      const indent = text.startsWith("  ") ? 44 : 0;
      // The hand sits a little above the rule and drifts along the line.
      const y = first + i * rule - 7;
      const slope = (random() - 0.5) * 0.012;
      const x0 = margin + 18 + indent + random() * 10;
      let x = x0;
      for (const word of text.trim().split(" ")) {
        const fontSize = size * (0.96 + random() * 0.08);
        ctx.font = `${fontSize}px ${family}`;
        ctx.save();
        ctx.globalAlpha = 0.8 + random() * 0.16;
        ctx.translate(x, y + (x - x0) * slope + (random() - 0.5) * 3);
        ctx.rotate((random() - 0.5) * 0.05);
        ctx.fillText(word, 0, 0);
        ctx.restore();
        x += ctx.measureText(`${word} `).width * (0.94 + random() * 0.12);
      }
      if (done) {
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x0 - 6, y - size * 0.22);
        ctx.lineTo(x - 10, y - size * 0.26 + (random() - 0.5) * 4);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    texture.needsUpdate = true;
  };
  return { texture, write };
}

/** A plain soft round gradient - steam, and contact shadow under objects. */
export function softDot(size = 128) {
  const c = canvas(size, size);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
