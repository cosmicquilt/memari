// Turning rendered module elements into a print-ready PDF.
//
// THIS IS THE THIRD CONSUMER OF ONE DRAWING, and deliberately not a third
// description of it. The editor paints the elements to the DOM, the proof
// sheets serialise the same elements to SVG (proofSvg.ts), and this writes
// the same elements to PDF. Nothing here knows what a habit tracker is;
// it knows a rect, a path and a line of text, which is the whole vocabulary
// the renderers emit. A module added tomorrow exports without this file
// changing - and, more to the point, a module cannot print differently from
// how it appeared on screen, because no geometry is restated here.
//
// WHY A PDF AT ALL. The product is printed - see the business model - so
// this file is the end of the pipeline, not a convenience. That sets the
// standard: real vector marks and real text, never a rasterised screenshot,
// because a 300dpi raster of a hairline rule prints as a grey smear where a
// vector rule prints as a line.

import { jsPDF, GState } from "jspdf";
import type { RenderedPolotnoElement } from "./renderModuleInstance";
import { flatten } from "./proofSvg";
import { textBaselineY } from "./modules/textFit";
import type { PageGrid } from "./grid";

/**
 * Print pixels to PDF points.
 *
 * Every renderer works in 300dpi pixels (see print-spec.ts) and PDF is
 * always 72 units to the inch, so this is the only scale in the file. It is
 * exact in both directions at the sizes used here: a 75px lattice cell is
 * 18pt, and a 0.3pt rule is 1.25px.
 */
export const PX_PER_PT = 300 / 72;
export function pxToPt(px: number): number {
  return px / PX_PER_PT;
}

// WHERE A LINE OF TEXT SITS inside the box the renderer gave it is
// textBaselineY (src/lib/modules/textFit.ts), shared with the editor, the
// proof sheets and the canvas previews. This file used to carry its own
// constant here - the baseline at y + 1em, following the proof sheets - and
// said it was "the single number that moves" once print and screen were
// reconciled. They were, on 2026-09-22: it moved to where the editor's own
// div puts it, 0.165em higher in Newsreader.

/** A hex colour as the 0-255 triple jsPDF wants. */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const isPaint = (colour: unknown): colour is string =>
  typeof colour === "string" && colour.length > 0 && colour !== "none" && colour !== "transparent";

// ---------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------
//
// A glyph with a real shape carries an SVG path alongside the box it is
// inscribed in - see glyphs.ts on why the shape is additive rather than its
// own subType. PDF has lines and cubic Beziers and nothing else, so the
// path has to be walked and re-emitted, and its arcs converted.

type PathOp =
  | { op: "m" | "l"; x: number; y: number }
  | { op: "c"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "z" };

/**
 * One SVG elliptical arc as cubic Beziers.
 *
 * PDF has no arc operator, and the crescent glyph is drawn with two of
 * them. This is the endpoint-to-centre conversion from the SVG spec
 * (F.6.5), then one cubic per quarter turn or less, which is where the
 * magic 4/3*tan(d/4) comes from: it is the control-point distance that
 * makes a cubic match a circular arc to within about a part in a thousand
 * over 90 degrees. Splitting keeps every segment inside that bound.
 */
function arcToCubics(
  x0: number,
  y0: number,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x: number,
  y: number
): PathOp[] {
  if (x0 === x && y0 === y) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  // A zero radius is a straight line, per the spec.
  if (rx === 0 || ry === 0) return [{ op: "l", x, y }];

  const phi = (rotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x0 - x) / 2;
  const dy2 = (y0 - y) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // Radii too small to reach both endpoints get scaled up until they do -
  // the spec's own correction, and the thing the first crescent fell foul
  // of by relying on it silently. See glyphs.ts.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coefficient = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (coefficient * (rx * y1p)) / ry;
  const cyp = (coefficient * -(ry * x1p)) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    const a = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
    return ux * vy - uy * vx < 0 ? -a : a;
  };

  const theta = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry
  );
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(delta / (Math.PI / 2))));
  const step = delta / segments;
  const k = (4 / 3) * Math.tan(step / 4);

  const out: PathOp[] = [];
  let t = theta;
  let px = x0;
  let py = y0;
  for (let i = 0; i < segments; i++) {
    const t2 = t + step;
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    const cosT2 = Math.cos(t2);
    const sinT2 = Math.sin(t2);

    const at = (ct: number, st: number) => ({
      x: cx + cosPhi * (rx * ct) - sinPhi * (ry * st),
      y: cy + sinPhi * (rx * ct) + cosPhi * (ry * st),
    });
    const dAt = (ct: number, st: number) => ({
      x: -cosPhi * rx * st - sinPhi * ry * ct,
      y: -sinPhi * rx * st + cosPhi * ry * ct,
    });

    const end = i === segments - 1 ? { x, y } : at(cosT2, sinT2);
    const d1 = dAt(cosT, sinT);
    const d2 = dAt(cosT2, sinT2);
    out.push({
      op: "c",
      x1: px + k * d1.x,
      y1: py + k * d1.y,
      x2: end.x - k * d2.x,
      y2: end.y - k * d2.y,
      x: end.x,
      y: end.y,
    });
    px = end.x;
    py = end.y;
    t = t2;
  }
  return out;
}

/**
 * An SVG path string as PDF-drawable operations.
 *
 * Handles the commands this app's own glyphs emit - M, L, H, V, C, A, Z, in
 * both absolute and relative form. An unrecognised command is REPORTED
 * rather than silently dropped: a renderer must never throw and take a page
 * down with it, but a print pipeline that quietly omits a mark is worse
 * than one that fails loudly, so the caller gets told.
 */
export function parsePathD(d: string): { ops: PathOp[]; unsupported: string[] } {
  const ops: PathOp[] = [];
  const unsupported: string[] = [];
  const tokens = d.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let command = "";
  const num = () => Number(tokens[i++]);

  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++];
    // A repeated coordinate set continues the previous command, and a
    // repeated moveto continues as a lineto - both per the SVG grammar.
    const rel = command === command.toLowerCase();
    switch (command.toUpperCase()) {
      case "M": {
        const nx = num();
        const ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        ops.push({ op: "m", x, y });
        startX = x;
        startY = y;
        command = rel ? "l" : "L";
        break;
      }
      case "L": {
        const nx = num();
        const ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        ops.push({ op: "l", x, y });
        break;
      }
      case "H": {
        const nx = num();
        x = rel ? x + nx : nx;
        ops.push({ op: "l", x, y });
        break;
      }
      case "V": {
        const ny = num();
        y = rel ? y + ny : ny;
        ops.push({ op: "l", x, y });
        break;
      }
      case "C": {
        const x1 = num();
        const y1 = num();
        const x2 = num();
        const y2 = num();
        const nx = num();
        const ny = num();
        ops.push({
          op: "c",
          x1: rel ? x + x1 : x1,
          y1: rel ? y + y1 : y1,
          x2: rel ? x + x2 : x2,
          y2: rel ? y + y2 : y2,
          x: rel ? x + nx : nx,
          y: rel ? y + ny : ny,
        });
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        break;
      }
      case "A": {
        const rx = num();
        const ry = num();
        const rot = num();
        const largeArc = num() !== 0;
        const sweep = num() !== 0;
        const nx = num();
        const ny = num();
        const ex = rel ? x + nx : nx;
        const ey = rel ? y + ny : ny;
        ops.push(...arcToCubics(x, y, rx, ry, rot, largeArc, sweep, ex, ey));
        x = ex;
        y = ey;
        break;
      }
      case "Z": {
        ops.push({ op: "z" });
        x = startX;
        y = startY;
        break;
      }
      default: {
        if (!unsupported.includes(command)) unsupported.push(command);
        // Nothing sensible to advance by, so stop rather than spin.
        i = tokens.length;
      }
    }
  }
  return { ops, unsupported };
}

// ---------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------

export type PdfFont = {
  /** The name to select in the document. */
  name: string;
  style: string;
  /** True when a real file was embedded, so the metrics are the design's
   *  own rather than a substitute face's. */
  embedded: boolean;
};

/** What could not be drawn faithfully, for the caller to surface. */
export type DrawReport = {
  elements: number;
  text: number;
  rects: number;
  paths: number;
  skipped: number;
  unsupportedPathCommands: string[];
};

export function emptyReport(): DrawReport {
  return { elements: 0, text: 0, rects: 0, paths: 0, skipped: 0, unsupportedPathCommands: [] };
}

/**
 * One rendered element, drawn into the document at print scale.
 *
 * Mirrors proofSvg's toSvg case for case, deliberately: if the two ever
 * disagree about what an element means, a proof sheet stops predicting what
 * comes off the press, which is the only thing a proof sheet is for.
 */
export function drawElement(
  doc: jsPDF,
  element: RenderedPolotnoElement,
  font: PdfFont,
  report: DrawReport
): void {
  report.elements++;
  const opacity = element.opacity ?? 1;
  // jsPDF's graphics state is a stack it does not pop for us, so anything
  // transparent is bracketed and put straight back.
  const transparent = opacity < 1;
  if (transparent) doc.setGState(new GState({ opacity, "stroke-opacity": opacity }));

  try {
    if (element.type === "text") {
      const size = element.fontSize ?? 12;
      const align =
        element.align === "center" ? "center" : element.align === "right" ? "right" : "left";
      const anchorX =
        align === "center"
          ? (element.x ?? 0) + (element.width ?? 0) / 2
          : align === "right"
          ? (element.x ?? 0) + (element.width ?? 0)
          : element.x ?? 0;
      doc.setFont(font.name, font.style);
      doc.setFontSize(pxToPt(size));
      doc.setTextColor(...hexToRgb(isPaint(element.fill) ? element.fill : "#000000"));
      // NO character spacing. Every renderer here deliberately leaves
      // letterSpacing unset - see headerElements, where setting it wrapped
      // the legacy route's text to one character a line - so an element
      // carrying one is honoured rather than assumed away.
      if (typeof element.letterSpacing === "number" && element.letterSpacing !== 0) {
        doc.setCharSpace(pxToPt(element.letterSpacing));
      }
      doc.text(
        String(element.text ?? ""),
        pxToPt(anchorX),
        pxToPt(textBaselineY(element.y ?? 0, size, String(element.fontFamily ?? ""))),
        { align, baseline: "alphabetic" }
      );
      if (typeof element.letterSpacing === "number" && element.letterSpacing !== 0) {
        doc.setCharSpace(0);
      }
      report.text++;
      return;
    }

    if (element.type !== "figure") {
      report.skipped++;
      return;
    }

    const hasFill = isPaint(element.fill);
    const hasStroke = isPaint(element.stroke) && (element.strokeWidth ?? 0) > 0;
    if (!hasFill && !hasStroke) {
      report.skipped++;
      return;
    }
    const style = hasFill && hasStroke ? "FD" : hasFill ? "F" : "S";
    if (hasFill) doc.setFillColor(...hexToRgb(element.fill as string));
    if (hasStroke) {
      doc.setDrawColor(...hexToRgb(element.stroke as string));
      doc.setLineWidth(pxToPt(element.strokeWidth as number));
    }

    if (typeof element.pathD === "string" && element.pathD.length > 0) {
      const { ops, unsupported } = parsePathD(element.pathD);
      for (const command of unsupported) {
        if (!report.unsupportedPathCommands.includes(command)) {
          report.unsupportedPathCommands.push(command);
        }
      }
      // Rounded joins, matching the SVG the proofs draw - a leaf tip meeting
      // at a sharp miter spikes.
      doc.setLineJoin("round");
      for (const o of ops) {
        if (o.op === "m") doc.moveTo(pxToPt(o.x), pxToPt(o.y));
        else if (o.op === "l") doc.lineTo(pxToPt(o.x), pxToPt(o.y));
        else if (o.op === "c") {
          doc.curveTo(
            pxToPt(o.x1),
            pxToPt(o.y1),
            pxToPt(o.x2),
            pxToPt(o.y2),
            pxToPt(o.x),
            pxToPt(o.y)
          );
        } else doc.close();
      }
      // A path is finished by its own operator, not by the style argument
      // rect() takes - jsPDF's `path()` wants a segment list, which is a
      // different API from the moveTo/curveTo one used here.
      if (style === "FD") doc.fillStroke();
      else if (style === "F") doc.fill();
      else doc.stroke();
      report.paths++;
      return;
    }

    const x = pxToPt(element.x ?? 0);
    const y = pxToPt(element.y ?? 0);
    const w = pxToPt(element.width ?? 0);
    const h = pxToPt(element.height ?? 0);
    const radius = typeof element.cornerRadius === "number" ? pxToPt(element.cornerRadius) : 0;
    if (radius > 0) doc.roundedRect(x, y, w, h, radius, radius, style);
    else doc.rect(x, y, w, h, style);
    report.rects++;
  } finally {
    if (transparent) doc.setGState(new GState({ opacity: 1, "stroke-opacity": 1 }));
  }
}

/**
 * A document sized to the page it will be printed on.
 *
 * The page carries its BLEED - the pixel size the whole app works in is the
 * trim plus an eighth of an inch on every edge (see print-spec.ts), and a
 * printer needs that margin to cut into. Exporting at trim size instead
 * would put every edge of the design on the knife.
 */
export function createPdf(page: PageGrid): jsPDF {
  return new jsPDF({
    unit: "pt",
    format: [pxToPt(page.widthPx), pxToPt(page.heightPx)],
    compress: true,
  });
}

/**
 * Install the planner's own face, if its file was supplied.
 *
 * Without it the document falls back to Times. The reason that matters is
 * NOT overflow, which was the first guess and is measurably wrong: setting
 * all 915 text marks in the catalogue at their default size in Times
 * overflows exactly one of them (a "10" on the energy scale, at 116% of its
 * box). The fitting in textFit.ts leaves enough slack to absorb the
 * difference.
 *
 * It matters because the planner is DESIGNED in Newsreader, and a printed
 * product set in a substitute face is a different product - which is the
 * whole of the argument, and enough on its own. The fallback exists so an
 * export never fails outright, and it reports `embedded: false` so a caller
 * can refuse to send it to a printer.
 */
export function installFont(
  doc: jsPDF,
  family: string,
  ttfBase64?: string
): PdfFont {
  if (!ttfBase64) return { name: "times", style: "normal", embedded: false };
  const file = `${family}.ttf`;
  doc.addFileToVFS(file, ttfBase64);
  doc.addFont(file, family, "normal");
  return { name: family, style: "normal", embedded: true };
}

/** Every element of one page, drawn in order. */
export function drawPage(
  doc: jsPDF,
  elements: RenderedPolotnoElement[],
  font: PdfFont,
  report: DrawReport = emptyReport()
): DrawReport {
  for (const element of flatten(elements)) drawElement(doc, element, font, report);
  return report;
}
