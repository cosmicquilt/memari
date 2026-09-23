// The page previews' own view of a drawing: the FIFTH consumer of the
// element list.
//
// The others are pdfDocument.ts (the printed book), proofSvg.ts (the proof
// sheets), PolotnoJsonRenderer.tsx (the editor canvas) and the legacy
// PlannerEditorCanvas.tsx. Every one of them reads the same elements, which
// is the whole reason a preview can be trusted: it is the page, not a
// picture of the page.
//
// WHY A SEPARATE SHAPE AT ALL, when the elements already exist. The timeline
// crosses the server/client boundary, so whatever it carries is serialised
// into the HTML for every page of the book at once. A RenderedPolotnoElement
// has twenty-odd optional fields and an index signature; a mark has the five
// or six a thumbnail can actually draw. The previous shape was an <svg>
// string, which was the same information plus angle brackets.
//
// Nothing here is a second DESCRIPTION of the drawing - every value is
// copied, none is recomputed. The geometry still comes from one place.
//
// THE VOCABULARY IS THREE KINDS, NOT TWO. A renderer written for rects and
// text alone silently drops every icon strip in the catalogue, because a
// glyph with a real shape is still `type:"figure", subType:"rect"` and
// carries its curve in an ADDITIVE `pathD` field - see glyphs.ts for why it
// was done that way. check:preview exists to make that impossible to miss.

import type { RenderedPolotnoElement } from "./renderModuleInstance";

/** Where a text mark sits in its box: left, centre, right. */
export type MarkAlign = "l" | "c" | "r";

/**
 * One drawable mark. Short keys because there are ~170 of these per page and
 * every page of the book ships at once.
 *
 * Geometry is in PRINT px - the page's own 0..widthPx/heightPx space - and
 * the painter scales. Nothing is pre-scaled, because the size a preview is
 * drawn at changes sixty times a second and the marks do not.
 */
export type PreviewMark =
  /** A rect. `r` is its corner radius. */
  | { k: "r"; x: number; y: number; w: number; h: number; r?: number; f?: string; s?: string; sw?: number; o?: number }
  /** A glyph's real shape, as SVG path data. */
  | { k: "p"; d: string; f?: string; s?: string; sw?: number; o?: number }
  /** Text. `x`/`w` are its BOX; the painter derives the anchor from `a`, so
   *  the anchor rule lives with the drawing rather than being baked in here
   *  twice. `y` is the box top and `z` the font size - the baseline is
   *  textBaselineY(y, z, ff), the same rule the editor, the SVG serialiser
   *  and the PDF use. */
  | {
      k: "t";
      x: number;
      y: number;
      w: number;
      z: number;
      t: string;
      ff: string;
      a: MarkAlign;
      f?: string;
      o?: number;
      ls?: number;
    };

/** Two decimals of a print pixel is a 300 DPI page measured to a six
 *  hundredth of an inch, and a preview is drawn at a twentieth of page size.
 *  Full float strings would be describing motion no display can show. */
const round = (n: number) => Math.round(n * 100) / 100;

function fillOf(element: RenderedPolotnoElement): string | undefined {
  const fill = element.fill;
  return typeof fill === "string" && fill !== "transparent" ? fill : undefined;
}

function strokeOf(element: RenderedPolotnoElement): { s: string; sw: number } | undefined {
  const stroke = element.stroke;
  const width = element.strokeWidth ?? 0;
  return typeof stroke === "string" && stroke !== "none" && width > 0
    ? { s: stroke, sw: round(width) }
    : undefined;
}

/** Only when it is not 1, so the common case costs no bytes. */
function opacityOf(element: RenderedPolotnoElement): number | undefined {
  const opacity = element.opacity;
  return typeof opacity === "number" && opacity !== 1 ? round(opacity) : undefined;
}

/**
 * One element as one mark, or null if it is not a drawable mark at all.
 *
 * Null means "a group wrapper, or a kind this vocabulary has never seen".
 * The two are worth telling apart at the call site - `flatten` removes the
 * first before this is ever asked - so null reaching a caller that has
 * flattened means a NEW element kind has appeared, which is exactly what
 * check:preview watches for.
 */
export function toPreviewMark(element: RenderedPolotnoElement): PreviewMark | null {
  if (element.type === "text") {
    const z = element.fontSize ?? 12;
    return {
      k: "t",
      x: round(element.x ?? 0),
      y: round(element.y ?? 0),
      w: round(element.width ?? 0),
      z: round(z),
      t: String(element.text ?? ""),
      // ITS OWN FAMILY, not a constant. proofSvg writes "Newsreader" onto
      // every text node and lets a stylesheet override it, which a proof
      // sheet can do because it has one; a canvas has no cascade, so a
      // hard-coded family would draw a sans-serif planner in a serif.
      ff: typeof element.fontFamily === "string" ? element.fontFamily : "",
      a: element.align === "center" ? "c" : element.align === "right" ? "r" : "l",
      ...(fillOf(element) ? { f: fillOf(element) } : {}),
      ...(opacityOf(element) !== undefined ? { o: opacityOf(element) } : {}),
      ...(element.letterSpacing ? { ls: round(element.letterSpacing) } : {}),
    };
  }

  if (element.type !== "figure") return null;

  const stroke = strokeOf(element);
  const fill = fillOf(element);

  if (typeof element.pathD === "string" && element.pathD.length > 0) {
    return {
      k: "p",
      d: element.pathD,
      ...(fill ? { f: fill } : {}),
      ...(stroke ?? {}),
      ...(opacityOf(element) !== undefined ? { o: opacityOf(element) } : {}),
    };
  }

  return {
    k: "r",
    x: round(Number(element.x ?? 0)),
    y: round(Number(element.y ?? 0)),
    w: round(Number(element.width ?? 0)),
    h: round(Number(element.height ?? 0)),
    ...(typeof element.cornerRadius === "number" && element.cornerRadius > 0
      ? { r: round(element.cornerRadius) }
      : {}),
    ...(fill ? { f: fill } : {}),
    ...(stroke ?? {}),
    ...(opacityOf(element) !== undefined ? { o: opacityOf(element) } : {}),
  };
}

/**
 * A flattened element list as marks, saying what it could not draw.
 *
 * `skipped` is not an error path to ignore - it is the signal that the
 * element vocabulary has grown and this consumer has not heard. It is
 * returned rather than thrown because a book that contains one unknown mark
 * should still show its previews; check:preview is where it becomes fatal.
 */
export function toPreviewMarks(elements: RenderedPolotnoElement[]): {
  marks: PreviewMark[];
  skipped: RenderedPolotnoElement[];
} {
  const marks: PreviewMark[] = [];
  const skipped: RenderedPolotnoElement[] = [];
  for (const element of elements) {
    const mark = toPreviewMark(element);
    if (mark) marks.push(mark);
    else skipped.push(element);
  }
  return { marks, skipped };
}
