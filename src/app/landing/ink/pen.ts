// The landing page's handwriting, as SVG: pen strokes for underlines,
// circles and doodles in the page's margins (Andrew, 2026-09-23: "continue
// that cursive theme throughout the landing page with other text and
// underlines and doodles in the background").
//
// The shapes are the journal's own (handwriting/doodles.ts, and its underline
// and loose circle in handwriting/strokes.ts), so the page and the journal
// share one hand. Each polyline becomes the outline of a pen
// stroke - thicker where the pen presses, tapering where it lifts
// (perfect-freehand) - and keeps its centre line too, which Ink draws along
// to write the stroke in. Worked out on the server; the browser only gets
// the paths.

import { getStroke } from "perfect-freehand";
import { doodle, type DoodleName } from "../handwriting/doodles";
import { circleAround, underline, wobble, type Path } from "../handwriting/strokes";

export type InkStroke = {
  /** The stroke's outline, filled. */
  d: string;
  /** Its centre line, in the order the pen travels. */
  line: string;
  /** How long the centre line is, in the drawing's units. */
  length: number;
};

export type Drawing = {
  strokes: InkStroke[];
  /** x, y, width, height of the drawing's box. */
  box: [number, number, number, number];
  /** The pen's width, in the drawing's units. */
  pen: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function toStroke(path: Path, pen: number): InkStroke {
  const points: number[][] = [];
  for (let i = 0; i < path.length; i += 2) points.push([path[i], path[i + 1]]);
  const outline = getStroke(points, {
    size: pen,
    thinning: 0.45,
    smoothing: 0.55,
    streamline: 0.35,
    simulatePressure: true,
    start: { taper: pen * 1.5, cap: true },
    end: { taper: pen * 2, cap: true },
    last: true,
  });
  let d = "";
  if (outline.length > 2) {
    d = `M${r2(outline[0][0])} ${r2(outline[0][1])}`;
    for (let i = 1; i < outline.length; i++) {
      const [x0, y0] = outline[i];
      const [x1, y1] = outline[(i + 1) % outline.length];
      d += `Q${r2(x0)} ${r2(y0)} ${r2((x0 + x1) / 2)} ${r2((y0 + y1) / 2)}`;
    }
    d += "Z";
  }
  let line = `M${r2(points[0][0])} ${r2(points[0][1])}`;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    line += `L${r2(points[i][0])} ${r2(points[i][1])}`;
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return { d, line, length };
}

/** Strokes from paths; `pens` gives each its own width (a doodle's detail is
 *  drawn lighter than its outline), and `pen` is the widest. */
function drawing(paths: Path[], box: Drawing["box"], pen: number, pens?: number[]): Drawing {
  const strokes = paths.map((p, i) => [p, pens?.[i] ?? pen] as const).filter(([p]) => p.length >= 4);
  return { strokes: strokes.map(([p, w]) => toStroke(p, w)), box, pen };
}

/** A line under a word, in a 300 x 36 box, stretched to the word. */
export function underlineDrawing(seed: number, twice = false): Drawing {
  return drawing(underline(8, 292, 12, seed, twice), [0, 0, 300, 36], 8);
}

/** A loose loop around something, in a 200 x 120 box. */
export function circleDrawing(seed: number): Drawing {
  return drawing(circleAround(44, 30, 112, 60, seed), [0, 0, 200, 120], 5);
}

export type DoodleKind = DoodleName;

/** One of the journal's doodles, in a 100 x 100 box: outline 3.6, detail
 *  a lighter 2.2. */
export function doodleDrawing(kind: DoodleKind, seed: number): Drawing {
  const strokes = doodle(kind, 8, 8, 84, seed);
  return drawing(strokes.map((st) => st.path), [0, 0, 100, 100], 3.6, strokes.map((st) => (st.weight >= 1 ? 3.6 : 2.2)));
}

/** A curved arrow from the top left of a 160 x 100 box towards its bottom
 *  right - flipped with CSS to point anywhere else. */
export function arrowDrawing(seed: number): Drawing {
  const shaft: Path = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    shaft.push(10 + t * 132 + Math.sin(t * Math.PI) * 10, 12 + t * t * 70 - Math.sin(t * Math.PI) * 18);
  }
  const [tx, ty] = [shaft[shaft.length - 2], shaft[shaft.length - 1]];
  // The head: two strokes back from the tip, 30 degrees either side of the
  // way the shaft arrives.
  const back = Math.atan2(shaft[shaft.length - 5] - ty, shaft[shaft.length - 6] - tx);
  const arm = (a: number): [number, number] => [tx + Math.cos(back + a) * 20, ty + Math.sin(back + a) * 20];
  const head: Path = [...arm(0.52), tx, ty, ...arm(-0.52)];
  // A light tremor, the doodles' own.
  return drawing([wobble(shaft, 1.2, seed, 10), wobble(head, 1.2, seed + 1, 10)], [0, 0, 160, 100], 3.4);
}
