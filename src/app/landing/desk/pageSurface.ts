// One page of the journal as a picture: paper, the printed layout, and the
// ink written on it - composited into the canvas the 3D page is textured
// with.
//
// Three layers, because they change at three different rates: the paper and
// the print once per spread, the highlighter whenever a highlight is drawn
// (it is repainted whole - see ink.ts), and the pen a little every frame.

import { drawPreview, resolveCanvasFamily } from "@/app/planner/drawPreview";
import type { LandingPage } from "../spreads";
import type { InkLayers } from "../handwriting/ink";
import { fibreMask } from "../handwriting/paperInk";

/** The page's own size in print px - see spreads.ts. */
export const PAGE_W = 2175;
export const PAGE_H = 3075;
const PAPER = "#fbf8f0";

let grain: HTMLCanvasElement | null = null;
/** A tile of paper fibre: low-contrast speckle, drawn once and reused. */
function paperGrain(): HTMLCanvasElement {
  if (grain) return grain;
  grain = document.createElement("canvas");
  grain.width = grain.height = 256;
  const ctx = grain.getContext("2d")!;
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 34;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return grain;
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

  constructor(height: number) {
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

  /** Paper with nothing on it. */
  blank() {
    const b = this.base.getContext("2d")!;
    b.fillStyle = PAPER;
    b.fillRect(0, 0, this.base.width, this.base.height);
    b.globalAlpha = 0.05;
    b.globalCompositeOperation = "multiply";
    b.fillStyle = b.createPattern(paperGrain(), "repeat")!;
    b.fillRect(0, 0, this.base.width, this.base.height);
    b.globalAlpha = 1;
    b.globalCompositeOperation = "source-over";
    this.clearInk();
  }

  /** Print a page's layout onto fresh paper, in its planner's typeface. */
  async print(page: LandingPage, fontFamily: string) {
    try {
      await document.fonts.load(`40px ${resolveCanvasFamily(fontFamily)}`);
    } catch {
      // Drawn in the fallback face - the page still reads.
    }
    this.blank();
    const layout = canvas(this.base.width, this.base.height);
    drawPreview(layout.getContext("2d")!, page.marks, PAGE_W, PAGE_H);
    const b = this.base.getContext("2d")!;
    // Printed ink sits IN the paper: multiplied, and a touch short of black.
    b.globalCompositeOperation = "multiply";
    b.globalAlpha = 0.97;
    b.drawImage(layout, 0, 0);
    b.globalAlpha = 1;
    b.globalCompositeOperation = "source-over";
    this.compose();
  }

  clearInk() {
    for (const layer of [this.layers.ink, this.layers.wet, this.layers.highlight]) layer.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    this.compose();
  }

  compose() {
    const c = this.ctx;
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
