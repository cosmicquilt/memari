// The hero's still picture, flattened (2026-10-15).
//
// Once the book lies open, everything in the hero but the writing is still:
// the desk beyond the frame, the resting frame, the loose sheets, and over
// them the blur toward the screen's sides (six backdrop-filter layers), the
// scrim, the vignette and the film grain, blended soft-light. Left as
// layers, the compositor drew all of them again on every frame the page
// moved, and with the hero sliding under the paper (the parallax) that is
// every frame of a scroll: "the parallax effect is also still a bit
// jittery". Measured in Chrome on Andrew's laptop (Iris Xe, its own screen;
// scripts/_hero-hitches.mts), the side blur and the grain were about 40% of
// the GPU's compositing time while scrolling, and the hero as one picture of
// itself cut that time by about 60%.
//
// So they are drawn here, once, into one canvas the size of the hero, in
// the order the page stacks them, and VideoHero shows that instead -
// drawing it again when the hero's size or the dev panel's settings change.
// Every layer is reproduced from its CSS in landing.module.css (.videoStage,
// .sideBlur, .videoScrim, .vignette, .grain); a change there is a change
// here. Two differences, both within a hair: the writing, multiplied onto
// the pages, now lies over the scrim, vignette and grain rather than under
// them (the scrim and vignette darken by multiplying, which commutes, and
// grain over a pen line never showed); and where a narrow window brings the
// side blur onto a page's edge, the layout there is not blurred.

import type { BodyWallSettings } from "../bodyWall";

export type HeroParts = {
  hero: HTMLElement;
  /** .videoStage: its box, and its colour where the frame's edges fade. */
  stage: HTMLElement;
  /** The desk beyond the frame's sides, drawn into their canvases. */
  sides: Array<HTMLCanvasElement | null>;
  /** The resting frame to show, dotted or clean, its edges faded. */
  frame: HTMLCanvasElement;
  /** The loose sheets' drawings, multiplied onto the desk. */
  sheets: Array<HTMLCanvasElement | null>;
  /** .grain, for its opacity, and the noise it tiles. */
  grainLayer: HTMLElement;
  grain: HTMLImageElement;
};

/** Where the hero lies in the stage, CSS px: where the baked picture goes. */
export function heroInStage(hero: HTMLElement, stage: HTMLElement) {
  const h = hero.getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  return { left: h.left - s.left, top: h.top - s.top, width: h.width, height: h.height };
}

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

/** The vignette's and scrim's brown-black, rgb(16 10 6). */
const SHADE = "16, 10, 6";

/** Draw the hero's still picture into `target`, sized to the hero at the
 *  screen's pixel density. Everything is drawn in device pixels with no
 *  transform: a canvas filter's blur is in the bitmap's pixels. */
export function bakeHero(target: HTMLCanvasElement, parts: HeroParts, s: BodyWallSettings) {
  const dpr = window.devicePixelRatio || 1;
  const heroBox = parts.hero.getBoundingClientRect();
  const W = heroBox.width;
  const H = heroBox.height;
  const w = Math.max(1, Math.round(W * dpr));
  const h = Math.max(1, Math.round(H * dpr));
  if (target.width !== w) target.width = w;
  if (target.height !== h) target.height = h;
  const g = target.getContext("2d");
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  /** An element's box in the bitmap's pixels. */
  const at = (el: Element) => {
    const r = el.getBoundingClientRect();
    return [(r.left - heroBox.left) * dpr, (r.top - heroBox.top) * dpr, r.width * dpr, r.height * dpr] as const;
  };
  const shown = (el: Element) => getComputedStyle(el).display !== "none";

  // The stage: its colour, the desk beyond the frame, the frame, and the
  // sheets multiplied onto the desk (.videoSheet).
  const [sx, sy, sw, sh] = at(parts.stage);
  g.fillStyle = getComputedStyle(parts.stage).backgroundColor;
  g.fillRect(sx, sy, sw, sh);
  for (const side of parts.sides) if (side?.width && shown(side.parentElement ?? side)) g.drawImage(side, ...at(side));
  g.drawImage(parts.frame, sx, sy, sw, sh);
  g.globalCompositeOperation = "multiply";
  for (const sheet of parts.sheets) if (sheet?.width) g.drawImage(sheet, ...at(sheet));
  g.globalCompositeOperation = "source-over";

  // .sideBlur: each side three layers, each blurring what is under it -
  // the layers before it included - by a third of the edge's blur, and each
  // shown through a ramp reaching k thirds of the way in from the edge.
  const stripW = Math.round(((s.sideBlurWidth ?? 0) / 100) * w);
  const sigma = (s.sideBlur ?? 0) * 0.577 * dpr;
  if (stripW > 0 && sigma > 0 && innerWidth / innerHeight > 1) {
    const pad = Math.ceil(sigma * 3);
    for (const left of [true, false]) {
      for (const k of [1, 2, 3]) {
        // The strip and a margin inward, so its inner edge blurs from what
        // is beside it rather than from nothing.
        const x0 = left ? 0 : Math.max(0, w - stripW - pad);
        const span = left ? Math.min(w, stripW + pad) : w - x0;
        const t = canvas(span, h);
        const tg = t.getContext("2d")!;
        tg.filter = `blur(${sigma}px)`;
        tg.drawImage(target, x0, 0, span, h, 0, 0, span, h);
        tg.filter = "none";
        const inner = left ? stripW : w - stripW - x0;
        const outer = left ? 0 : span;
        const ramp = tg.createLinearGradient(inner, 0, outer, 0);
        ramp.addColorStop(0, "rgba(0,0,0,0)");
        ramp.addColorStop(Math.max(0, 1 - k * 0.3334), "rgba(0,0,0,0)");
        ramp.addColorStop(1, "#000");
        tg.globalCompositeOperation = "destination-in";
        tg.fillStyle = ramp;
        tg.fillRect(0, 0, span, h);
        g.drawImage(t, x0, 0);
      }
    }
  }

  // .videoScrim: shade at the top, under the title.
  const scrim = g.createLinearGradient(0, 0, 0, h);
  scrim.addColorStop(0, `rgba(${SHADE}, 0.55)`);
  scrim.addColorStop(0.26, `rgba(${SHADE}, 0.28)`);
  scrim.addColorStop(0.46, `rgba(${SHADE}, 0)`);
  g.fillStyle = scrim;
  g.fillRect(0, 0, w, h);

  // .vignette: its oval first (the background), then the four inset
  // shadows over it.
  const ellipse = (rx: number, ry: number, cx: number, cy: number, stops: Array<[number, string]>) => {
    g.save();
    g.setTransform(rx * dpr, 0, 0, ry * dpr, cx * dpr, cy * dpr);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [at, colour] of stops) grad.addColorStop(at, colour);
    g.fillStyle = grad;
    g.fillRect(-cx / rx, -cy / ry, W / rx, H / ry);
    g.restore();
  };
  const corners = s.vignetteCorners ?? 0;
  if (corners > 0) {
    ellipse(0.74 * W, 0.8 * H, 0.5 * W, 0.6 * H, [
      [0, `rgba(${SHADE}, 0)`],
      [0.6, `rgba(${SHADE}, 0)`],
      [0.84, `rgba(${SHADE}, ${corners * 0.45})`],
      [1, `rgba(${SHADE}, ${corners})`],
    ]);
  }
  // An inset shadow `inset dx dy reach/2 -reach/2`: the hole is the box
  // grown by reach/2 and moved by (dx, dy); the shade is all outside it,
  // blurred by a Gaussian of half the blur radius.
  const inset = (dx: number, dy: number, reach: number, alpha: number) => {
    if (!(reach > 0 && alpha > 0)) return;
    const grow = reach / 2;
    const margin = reach * 2 * dpr + 8;
    g.save();
    g.filter = `blur(${(reach / 4) * dpr}px)`;
    g.fillStyle = `rgba(${SHADE}, ${alpha})`;
    g.beginPath();
    g.rect(-margin, -margin, w + margin * 2, h + margin * 2);
    g.rect((dx - grow) * dpr, (dy - grow) * dpr, (W + reach) * dpr, (H + reach) * dpr);
    g.fill("evenodd");
    g.restore();
  };
  const top = ((s.vignetteTopReach ?? 0) / 100) * H;
  const bottom = ((s.vignetteBottomReach ?? 0) / 100) * H;
  const sides = ((s.vignetteSidesReach ?? 0) / 100) * innerWidth;
  inset(0, top, top, s.vignetteTop ?? 0);
  inset(0, -bottom, bottom, s.vignetteBottom ?? 0);
  inset(sides, 0, sides, s.vignetteSides ?? 0);
  inset(-sides, 0, sides, s.vignetteSides ?? 0);

  // .grain: the noise tiled at 160px from the hero's corner with its oval
  // over it, the two together laid soft-light at the layer's opacity.
  if (shown(parts.grainLayer) && parts.grain.naturalWidth) {
    const grain = canvas(w, h);
    const gg = grain.getContext("2d")!;
    const tile = gg.createPattern(parts.grain, "repeat")!;
    tile.setTransform(new DOMMatrix().scale((160 * dpr) / parts.grain.naturalWidth));
    gg.fillStyle = tile;
    gg.fillRect(0, 0, w, h);
    gg.setTransform(1.3 * W * dpr, 0, 0, H * dpr, 0.5 * W * dpr, 0.4 * H * dpr);
    const oval = gg.createRadialGradient(0, 0, 0, 0, 0, 1);
    oval.addColorStop(0.55, "rgba(30, 18, 8, 0)");
    oval.addColorStop(1, "rgba(30, 18, 8, 0.28)");
    gg.fillStyle = oval;
    gg.fillRect(-0.5 / 1.3, -0.4, 1 / 1.3, 1);
    g.globalAlpha = Number.parseFloat(getComputedStyle(parts.grainLayer).opacity) || 0;
    g.globalCompositeOperation = "soft-light";
    g.drawImage(grain, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }
}
