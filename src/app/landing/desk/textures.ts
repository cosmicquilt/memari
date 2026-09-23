// Textures for the desk scene that are drawn in the browser: the ones that
// are cheap to draw (a few canvas operations) or that need the page's own
// fonts. The expensive, per-pixel ones - the walnut, the paper fibre, the
// linen - are baked by scripts/build-desk-textures.mts into public/landing/,
// because drawing them here held the main thread for seconds while the
// title was animating.
//
// When photographs arrive (Andrew means to try Midjourney desks), the wood
// and the wall are the pieces they replace; the journal stays procedural,
// because its pages have to be the real layouts.

import * as THREE from "three";
import { fibreMask } from "../handwriting/paperInk";

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

/**
 * A soft, cloudy unevenness laid over whatever is on the canvas: octaves of
 * coarse noise, each a tiny canvas smoothed up to size and overlaid (mid grey
 * changes nothing). A per-pixel loop over a big canvas costs a third of a
 * second; this costs a few drawImage calls.
 */
function mottle(ctx: CanvasRenderingContext2D, width: number, height: number, octaves: ReadonlyArray<readonly [cells: number, alpha: number]>, seed: number) {
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.imageSmoothingQuality = "high";
  for (const [cells, alpha] of octaves) {
    const n = canvas(cells, Math.max(1, Math.round((cells * height) / width)));
    const nctx = n.getContext("2d")!;
    const img = nctx.createImageData(n.width, n.height);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 64 + hash(seed++, 3, 21) * 128;
      img.data[i + 3] = 255;
    }
    nctx.putImageData(img, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(n, 0, 0, width, height);
  }
  ctx.restore();
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
  mottle(
    c,
    width,
    height,
    [
      [8, 0.1],
      [24, 0.05],
    ],
    21
  );
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

  // Cheap paper: a little cloudy where the pulp settled unevenly, and the
  // rules printed a touch stronger and weaker from line to line.
  const paper = () => {
    ctx.fillStyle = "#f6f2e7";
    ctx.fillRect(0, 0, width, height);
    mottle(
      ctx,
      width,
      height,
      [
        [6, 0.09],
        [40, 0.07],
      ],
      seed * 13
    );
    ctx.lineWidth = 2;
    for (let y = first, n = 0; y < height - 30; y += rule, n++) {
      ctx.strokeStyle = `rgba(90, 130, 190, ${0.28 + 0.12 * hash(n, seed, 5)})`;
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
    // Written on a layer of its own, then taken up by the paper's fibres and
    // multiplied in - as the journal's ink is (PageSurface) - so the rules
    // and the paper show through it.
    const layer = canvas(width, height);
    const pen = layer.getContext("2d")!;
    pen.fillStyle = ink;
    pen.strokeStyle = ink;
    pen.textBaseline = "alphabetic";
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
        pen.font = `${fontSize}px ${family}`;
        pen.save();
        pen.globalAlpha = 0.8 + random() * 0.16;
        pen.translate(x, y + (x - x0) * slope + (random() - 0.5) * 3);
        pen.rotate((random() - 0.5) * 0.05);
        pen.fillText(word, 0, 0);
        pen.restore();
        x += pen.measureText(`${word} `).width * (0.94 + random() * 0.12);
      }
      if (done) {
        pen.globalAlpha = 0.85;
        pen.lineWidth = 3;
        pen.beginPath();
        pen.moveTo(x0 - 6, y - size * 0.22);
        pen.lineTo(x - 10, y - size * 0.26 + (random() - 0.5) * 4);
        pen.stroke();
        pen.globalAlpha = 1;
      }
    }
    pen.globalCompositeOperation = "destination-in";
    pen.fillStyle = pen.createPattern(fibreMask(), "repeat")!;
    pen.fillRect(0, 0, width, height);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.95;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    texture.needsUpdate = true;
  };
  return { texture, write };
}

/**
 * The darkening where something sits on the desk - light from the room
 * cannot get in under it. Its footprint (inches), blurred out over `margin`
 * on every side: black, the softness in its alpha. Returns the texture and
 * the size of the plane to stretch it over.
 */
export function contactShadow(width: number, depth: number, margin: number, round: boolean) {
  const planeW = width + margin * 2;
  const planeD = depth + margin * 2;
  const perIn = 256 / Math.max(planeW, planeD);
  const c = canvas(Math.round(planeW * perIn), Math.round(planeD * perIn));
  const ctx = c.getContext("2d")!;
  ctx.filter = `blur(${Math.max(1, Math.round(margin * perIn * 0.45))}px)`;
  ctx.fillStyle = "#000";
  const x = margin * perIn;
  const y = margin * perIn;
  ctx.beginPath();
  if (round) ctx.ellipse(c.width / 2, c.height / 2, (width * perIn) / 2, (depth * perIn) / 2, 0, 0, Math.PI * 2);
  else ctx.roundRect(x, y, width * perIn, depth * perIn, 0.15 * perIn);
  ctx.fill();
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, planeW, planeD };
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
