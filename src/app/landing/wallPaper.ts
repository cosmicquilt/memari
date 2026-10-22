// The paper in the doodle wall, baked (2026-10-21: "is it because of the
// sliders, if its preloaded and on live site paper texture isn't editable it
// just preloaded one chosen"). Laid on as background layers, every drawing
// on the wall blended its ~18 photo layers each time it was painted, and the
// page stalled as the wall scrolled in (9-20 long frames in 164, against 1-4
// with no paper). The look never changes once the page is open, so it is
// drawn once here instead - the wall's blue with the paper's steps
// (bodyWall.ts, inkSteps, from the doodles' slider) and its fade - into one
// picture, and every drawing shows that through its mask: one plain layer.
// The sliders bake it again (BodyDoodles.tsx). Canvas blends are the CSS
// ones (the same compositing spec), so it is the look the stacks drew.
//
// One tile, WALL_PAPER_TILE square: wider than any drawing (the biggest are
// 190px at size 1, bodyWall.ts CLASSES), so a drawing, whose paper starts at
// its own corner, never reaches the tile's edge, where the photos whose
// sizes do not divide it would show a seam. No bigger: encoding the picture
// is most of a bake's time (1024 took ~1s on a 2x screen, 512 ~0.3s).

import { BODY_INK_RGB, creamRgb, drawingInkSteps, type BodyWallSettings } from "./bodyWall";

/** The baked tile's side, CSS px. */
export const WALL_PAPER_TILE = 512;

const images = new Map<string, Promise<HTMLImageElement>>();
function load(src: string) {
  let image = images.get(src);
  if (!image) {
    const img = new Image();
    img.src = src;
    image = img.decode().then(() => img);
    images.set(src, image);
  }
  return image;
}

/** What a bake depends on: two settings with the same key look the same. */
export function wallPaperKey(s: BodyWallSettings) {
  return JSON.stringify([s.inkPaper, s.inkBlend, s.doodlePaper, s.paper006, s.paper001, s.paper002, s.paperFibre, s.paperCrumple, s.creamDepth, s.ink]);
}

/** The wall's ink with its paper as one picture, a blob URL; null when the
 *  slider is at 0. At the screen's density, up to 2x. */
export async function bakeWallPaper(s: BodyWallSettings): Promise<string | null> {
  const steps = drawingInkSteps(s);
  if (!steps.length) return null;
  const photos = new Map(await Promise.all(steps.flatMap((step) => (step.kind === "photo" ? [load(step.src).then((img) => [step.src, img] as const)] : []))));
  const tile = WALL_PAPER_TILE;
  const density = Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1)));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = tile * density;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(density, density);
  const ink = `rgb(${BODY_INK_RGB})`;
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, tile, tile);
  for (const step of steps) {
    if (step.kind === "wash") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = step.alpha;
      ctx.fillStyle = ink;
    } else if (step.kind === "paper") {
      ctx.globalCompositeOperation = "darken";
      ctx.fillStyle = `rgb(${creamRgb(s.creamDepth ?? 1).join(", ")})`;
    } else {
      const img = photos.get(step.src)!;
      const [w, h] = step.size.split(" ").map((v) => parseFloat(v));
      const pattern = ctx.createPattern(img, "repeat");
      if (!pattern) continue;
      pattern.setTransform(new DOMMatrix().scale(w / img.naturalWidth, h / img.naturalHeight));
      ctx.globalCompositeOperation = step.blend === "normal" ? "source-over" : step.blend;
      ctx.fillStyle = pattern;
    }
    ctx.fillRect(0, 0, tile, tile);
    ctx.globalAlpha = 1;
  }
  // the drawings' fade, into the picture's own alpha
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = `rgba(0, 0, 0, ${s.ink})`;
  ctx.fillRect(0, 0, tile, tile);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  return blob ? URL.createObjectURL(blob) : null;
}
