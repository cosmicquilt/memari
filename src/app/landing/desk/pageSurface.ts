// One page of the journal as a picture: paper, the printed layout, and the
// ink written on it - composited into the canvas the 3D page is textured
// with.
//
// Three layers, because they change at three different rates: the paper and
// the print once per spread, the highlighter whenever a highlight is drawn
// (it is repainted whole - see ink.ts), and the pen a little every frame.

import { drawPreview, resolveCanvasFamily } from "@/app/planner/drawPreview";
import type { LandingPage } from "../spreads";
import type { InkLayers, Rect } from "../handwriting/ink";
import { fibreMask, grainAt, printMask } from "../handwriting/paperInk";

/** The page's own size in print px - see spreads.ts. */
export const PAGE_W = 2175;
export const PAGE_H = 3075;
/** Ivory, not white: the stock planners are printed on. */
const PAPER = "#f8f3e7";
/** The page is 7in wide; the baked paper tile is 4in at 128px an inch. */
const PAGE_IN = 7;
const TILE_PX_PER_IN = 128;

export type PageSide = "left" | "right";

let paperTile: HTMLImageElement | null = null;
let paperLoading: Promise<void> | null = null;
/** The baked paper fibre (scripts/build-desk-textures.mts) - the same tile
 *  the 3D page's relief is made from, so what the light picks out and what
 *  the eye sees in the paper are the same fibres. */
function loadPaper(): Promise<void> {
  paperLoading ??= new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      paperTile = img;
      resolve();
    };
    img.onerror = () => resolve();
    img.src = "/landing/paper.jpg";
  });
  return paperLoading;
}

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

export class PageSurface {
  /** What the texture shows. */
  readonly canvas: HTMLCanvasElement;
  /** Canvas px per print px. */
  readonly scale: number;
  private base: HTMLCanvasElement;
  readonly layers: InkLayers;
  private ctx: CanvasRenderingContext2D;
  /** Where the ink is taken up by the paper's fibres before it lands. */
  private scratch: CanvasRenderingContext2D;

  /** Bare: only what is printed and written, on white - for laying over a
   *  photographed page (the video hero), whose own paper, light and gutter
   *  show through where this is white. */
  private readonly bare: boolean;

  constructor(height: number, { bare = false }: { bare?: boolean } = {}) {
    this.bare = bare;
    const width = Math.round((height * PAGE_W) / PAGE_H);
    this.scale = height / PAGE_H;
    this.canvas = canvas(width, height);
    this.ctx = this.canvas.getContext("2d")!;
    this.base = canvas(width, height);
    this.layers = {
      ink: canvas(width, height).getContext("2d")!,
      wet: canvas(width, height).getContext("2d")!,
      highlight: canvas(width, height).getContext("2d")!,
    };
    this.scratch = canvas(width, height).getContext("2d")!;
    this.blank();
  }

  /** Paper with nothing on it: its colour, and the cloud and fibre of the
   *  sheet once the tile has arrived. */
  blank() {
    const b = this.base.getContext("2d")!;
    const { width, height } = this.base;
    b.fillStyle = this.bare ? "#ffffff" : PAPER;
    b.fillRect(0, 0, width, height);
    if (paperTile && !this.bare) {
      const pattern = b.createPattern(paperTile, "repeat")!;
      pattern.setTransform(new DOMMatrix().scale(width / PAGE_IN / TILE_PX_PER_IN));
      b.save();
      b.globalCompositeOperation = "overlay";
      b.globalAlpha = 0.75;
      b.fillStyle = pattern;
      b.fillRect(0, 0, width, height);
      b.restore();
    }
    this.clearInk();
  }

  /** Print a page's layout onto fresh paper, in its planner's typeface.
   *  `side` is where it lies in the spread - which edge is the gutter. */
  async print(page: LandingPage, fontFamily: string, side: PageSide) {
    try {
      await Promise.all([document.fonts.load(`40px ${resolveCanvasFamily(fontFamily)}`), loadPaper()]);
    } catch {
      // Drawn in the fallback face - the page still reads.
    }
    this.blank();
    const { width, height } = this.base;
    const perIn = width / PAGE_IN;
    const layout = canvas(width, height);
    const l = layout.getContext("2d")!;
    drawPreview(l, page.marks, PAGE_W, PAGE_H);
    // A press lays ink evenly, but not perfectly: a little cloudy, with a
    // fine tooth where the paper's surface did not quite meet it.
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = "destination-in";
    l.fillStyle = l.createPattern(printMask(), "repeat")!;
    l.fillRect(0, 0, width, height);
    const b = this.base.getContext("2d")!;
    if (this.bare) {
      b.save();
      this.printLayout(b, layout);
      b.restore();
      this.compose();
      return;
    }
    b.save();
    b.globalCompositeOperation = "multiply";
    // Show-through: the print on the other side of the leaf, mirrored and
    // softened by the paper between. A planner's pages are much alike, so
    // this page's own layout, flipped, stands in for its back.
    b.globalAlpha = 0.045;
    b.filter = "blur(1.5px)";
    b.setTransform(-1, 0, 0, 1, width, 0);
    b.drawImage(layout, 0, 0);
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.filter = "none";
    this.printLayout(b, layout);
    // The page curves down into the gutter, where less light reaches; and
    // its other edges are a shade darker from handling.
    b.globalAlpha = 1;
    const gutterX = side === "left" ? width : 0;
    const toward = side === "left" ? -1 : 1;
    const gutter = b.createLinearGradient(gutterX, 0, gutterX + toward * 0.6 * perIn, 0);
    gutter.addColorStop(0, "rgba(120, 100, 80, 0.2)");
    gutter.addColorStop(1, "rgba(120, 100, 80, 0)");
    b.fillStyle = gutter;
    b.fillRect(0, 0, width, height);
    const edge = 0.14 * perIn;
    const outerX = side === "left" ? 0 : width;
    for (const [x0, y0, x1, y1] of [
      [outerX, 0, outerX - toward * edge, 0],
      [0, 0, 0, edge],
      [0, height, 0, height - edge],
    ]) {
      const g = b.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, "rgba(150, 130, 105, 0.12)");
      g.addColorStop(1, "rgba(150, 130, 105, 0)");
      b.fillStyle = g;
      b.fillRect(0, 0, width, height);
    }
    b.restore();
    this.compose();
  }

  /** Printed ink sits IN the paper: multiplied, a touch short of black, and
   *  spread a little into the sheet (dot gain) - a soft copy under the
   *  crisp one - rather than cut out of it with a screen's hard edge. */
  private printLayout(b: CanvasRenderingContext2D, layout: HTMLCanvasElement) {
    b.globalCompositeOperation = "multiply";
    b.filter = `blur(${(grainAt(this.scale) * 0.45).toFixed(2)}px)`;
    b.globalAlpha = 0.4;
    b.drawImage(layout, 0, 0);
    b.filter = "none";
    b.globalAlpha = 0.9;
    b.drawImage(layout, 0, 0);
  }

  clearInk() {
    for (const layer of [this.layers.ink, this.layers.wet, this.layers.highlight]) layer.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    this.compose();
  }

  /**
   * The page's picture from its layers - all of it, or only `areas` (canvas
   * px), which is all a frame of writing changes. Every pass is the same,
   * clipped to whole pixels, so the result is the same picture: what the
   * clip saves is fill. A whole page is about 13ms of GPU work (Intel Iris
   * Xe, 2026-09-25), both pages every writing frame more than a frame's
   * budget - scrolling past the hero stuttered ("scrolling near the hero is
   * laggy"); a word's area is well under 1ms.
   */
  compose(areas?: Rect[] | null) {
    if (!areas) return this.composeIn(null);
    const { width, height } = this.canvas;
    for (const area of areas) {
      const x0 = Math.max(0, Math.floor(area[0]));
      const y0 = Math.max(0, Math.floor(area[1]));
      const x1 = Math.min(width, Math.ceil(area[2]));
      const y1 = Math.min(height, Math.ceil(area[3]));
      if (x1 > x0 && y1 > y0) this.composeIn([x0, y0, x1 - x0, y1 - y0]);
    }
  }

  private composeIn(clip: [number, number, number, number] | null) {
    const c = this.ctx;
    const s = this.scratch;
    if (clip) {
      for (const g of [c, s]) {
        g.save();
        g.beginPath();
        g.rect(...clip);
        g.clip();
      }
    }
    c.globalCompositeOperation = "source-over";
    c.drawImage(this.base, 0, 0);
    c.globalCompositeOperation = "multiply";
    c.drawImage(this.fibred(this.layers.highlight.canvas), 0, 0);
    // Ink sinks INTO the paper too: taken up unevenly by the fibres, then
    // multiplied, so the grain and the print show through a little - the
    // way a pen line looks on a real page and not on a screen.
    c.globalAlpha = 0.95;
    c.drawImage(this.fibred(this.layers.ink.canvas), 0, 0);
    c.drawImage(this.fibred(this.layers.wet.canvas), 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    if (clip) {
      c.restore();
      s.restore();
    }
  }

  /** A layer as the paper takes it up: masked by the fibre tile. */
  private fibred(layer: HTMLCanvasElement): HTMLCanvasElement {
    const s = this.scratch;
    s.globalCompositeOperation = "copy";
    s.drawImage(layer, 0, 0);
    s.globalCompositeOperation = "destination-in";
    s.fillStyle = s.createPattern(fibreMask(), "repeat")!;
    s.fillRect(0, 0, s.canvas.width, s.canvas.height);
    s.globalCompositeOperation = "source-over";
    return s.canvas;
  }

  /** Take another surface's whole picture - paper, print and ink - as this
   *  one's. The page that turns carries the page it was lifted from. */
  copyFrom(other: PageSurface) {
    const b = this.base.getContext("2d")!;
    b.drawImage(other.base, 0, 0);
    this.layers.ink.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.layers.ink.drawImage(other.layers.ink.canvas, 0, 0);
    this.layers.wet.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.layers.highlight.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.layers.highlight.drawImage(other.layers.highlight.canvas, 0, 0);
    this.compose();
  }
}
