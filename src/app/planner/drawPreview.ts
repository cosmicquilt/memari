"use client";

// Painting a page preview onto a canvas.
//
// WHY NOT SVG, which is what this replaced. The preview is ~170 vector marks
// and the drawer resizes ten to fifteen of them live while you drag its
// handle. Measured, ten cards resized a hundred times:
//
//     empty cards (box resize only)     0.21 ms/frame
//     the same cards holding the SVG    7.32 ms/frame     ~35x
//
// against a 16.7ms frame, and that is LAYOUT ALONE - paint and raster on
// top. Blink re-resolves every SVG child's geometry when the viewport
// changes; the viewBox matrix is the basis for that recalculation, not a
// shield from it, so the cost scales with the number of elements and no CSS
// property avoids it. A canvas has one element and one size, and the marks
// are numbers in an array that the resize does not touch at all.
//
// What was tried first and did not work, so it is not tried again:
//   - transform: scale() on a fixed-size SVG. 7.09ms against 7.30ms - no
//     gain - and with will-change it destroyed the line art, because
//     Chromium rasterises a promoted layer once and then bilinear-filters a
//     1px rule down to a grey smear.
//   - quantising the drag to 16px steps. Cheap, effective, and the stepping
//     is plainly visible.
//   - swapping in a low-detail proxy for the gesture, which is what Keynote
//     and Acrobat do. It reintroduces exactly the blur those two attempts
//     were reverted for.
//
// WHAT CANVAS COSTS: no accessibility tree inside the preview, no text
// selection, no CSS reaching the marks. All acceptable for a thumbnail whose
// job is to let you tell one page from another - the card itself is still a
// real button with a real label, which is what a screen reader needs.

import { snapHairline } from "@/lib/hairline";
import { textBaselineY } from "@/lib/modules/textFit";
import { FONT_SANS, FONT_SERIF } from "@/lib/theme";
import type { PreviewMark } from "@/lib/previewMarks";

/**
 * next/font does not register the family you asked for.
 *
 * `Newsreader({...})` emits an @font-face named something like
 * `__Newsreader_1a2b3c` and exposes it through the CSS variable. The literal
 * "Newsreader" that every module renderer writes into its element data
 * resolves only because the DOM has a cascade to resolve it in - and A
 * CANVAS HAS NO CASCADE. `ctx.font = "12px Newsreader"` with no such family
 * registered does not fail; it silently draws in the default serif, which on
 * a thumbnail looks close enough to be believed.
 *
 * So: ask the font set whether the literal name is real, and fall back to
 * whatever the CSS variable holds, which is next/font's generated name
 * followed by its own metric-matched fallback. The variable's name is
 * derived the same way layout.tsx writes it.
 */
const GENERIC: Record<string, string> = {
  [FONT_SERIF]: "Georgia, serif",
  [FONT_SANS]: "system-ui, sans-serif",
};

const resolved = new Map<string, string>();

export function resolveCanvasFamily(family: string): string {
  const cached = resolved.get(family);
  if (cached !== undefined) return cached;

  const generic = GENERIC[family] ?? "serif";
  const quoted = `"${family}"`;
  let value = `${quoted}, ${generic}`;

  if (typeof document !== "undefined") {
    let literalIsReal = false;
    try {
      literalIsReal = document.fonts.check(`16px ${quoted}`);
    } catch {
      literalIsReal = false;
    }
    if (!literalIsReal) {
      const variable = `--font-${family.toLowerCase().replace(/\s+/g, "-")}`;
      const declared = getComputedStyle(document.documentElement)
        .getPropertyValue(variable)
        .trim();
      // The variable already carries next/font's own fallback chain.
      if (declared) value = `${declared}, ${generic}`;
    }
  }

  resolved.set(family, value);
  return value;
}

/** Fonts load after the first paint, and a preview drawn before they arrive
 *  is drawn in the wrong face with no way to know it. Callers redraw on
 *  document.fonts.ready; this drops the answers cached before that. */
export function forgetResolvedFamilies(): void {
  resolved.clear();
}

/** SVG path data is parsed once per distinct shape, not once per draw. The
 *  nine glyphs repeat across a strip and across pages. */
const paths = new Map<string, Path2D>();
function pathFor(d: string): Path2D {
  let path = paths.get(d);
  if (!path) {
    path = new Path2D(d);
    paths.set(d, path);
  }
  return path;
}

/**
 * Below this many DEVICE pixels of type size, words are drawn as bars.
 *
 * Measured on a real week spread: at a 200px-tall card the page's labels
 * come out between 1.35 and 3.52 device pixels tall. At that size a letter
 * is two or three pixels of stem and which pixels they are is decided by
 * hinting, not by the word - so shaping them produces a pattern, not text,
 * and it costs 7.2ms of an 8.2ms frame to produce it. A bar of the same
 * extent and the same ink is a BETTER likeness as well as a cheaper one,
 * which is why every page-thumbnail renderer that has this problem solves it
 * this way; InDesign has had a "Greek Type Below" setting since 1999.
 *
 * Four rather than InDesign's seven, because the drawer is a magnifier: the
 * point of dragging it up is to look at a page closely enough to tell which
 * one it is, and at full height this lets the largest headings resolve into
 * real words while the body text stays bars. Seven would greek everything at
 * every size the drawer can reach, which would make the gesture pointless.
 */
const GREEK_BELOW_DEVICE_PX = 4;

/** What a string measures in PRINT px, which does not change with the size
 *  the preview is drawn at - so this is filled once and read forever. The
 *  ink box, not the em box: a bar standing in for a word should be the
 *  height of the word. */
const extents = new Map<string, { advance: number; ascent: number; descent: number }>();

function extentOf(
  ctx: CanvasRenderingContext2D,
  font: string,
  letterSpacing: string,
  text: string,
  /** Applies the font to the context. Called ONLY on a cache miss - see the
   *  note in the text pass on what assigning ctx.font costs. */
  applyFont: (font: string, letterSpacing: string) => void
) {
  const key = `${font}|${letterSpacing}|${text}`;
  let extent = extents.get(key);
  if (!extent) {
    applyFont(font, letterSpacing);
    const measured = ctx.measureText(text);
    extent = {
      advance: measured.width,
      // A string of digits has no descender and a string with a "g" does;
      // asking the metrics rather than assuming is what keeps a bar the
      // shape of the word it stands for.
      ascent: measured.actualBoundingBoxAscent,
      descent: measured.actualBoundingBoxDescent,
    };
    extents.set(key, extent);
  }
  return extent;
}

/** `${size}px ${family}` built once per pair rather than once per mark per
 *  frame - 1200 string allocations a frame, for five distinct answers. */
const fontStrings = new Map<string, string>();
function fontString(size: number, family: string): string {
  const key = `${size}|${family}`;
  let value = fontStrings.get(key);
  if (value === undefined) {
    value = `${size}px ${family}`;
    fontStrings.set(key, value);
  }
  return value;
}

/**
 * How much of its own ink box a face actually fills, MEASURED.
 *
 * A bar at full strength where a word was is far too heavy - a word is
 * mostly the paper between its strokes. The number could be guessed at
 * "about 40%", and that guess would be a magic constant that nobody could
 * check. So it is measured instead: the face is drawn once at a size where
 * it rasterises honestly, and the mean alpha over the ink box is read back.
 *
 * Once per face, on the first bar drawn in it.
 */
const inkCoverage = new Map<string, number>();
/** Ascenders, descenders, round letters, straight letters, and the digits
 *  that half this app's labels are. */
const COVERAGE_SAMPLE = "Monday 12 Reflection gjpq";

function coverageOf(family: string): number {
  const cached = inkCoverage.get(family);
  if (cached !== undefined) return cached;

  let coverage = 0.4;
  try {
    const size = 32;
    const scratch = document.createElement("canvas");
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.font = `${size}px ${family}`;
      const measured = ctx.measureText(COVERAGE_SAMPLE);
      const width = Math.ceil(measured.width);
      const ascent = Math.ceil(measured.actualBoundingBoxAscent);
      const descent = Math.ceil(measured.actualBoundingBoxDescent);
      const height = ascent + descent;
      if (width > 0 && height > 0) {
        scratch.width = width;
        scratch.height = height;
        ctx.font = `${size}px ${family}`;
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#000";
        ctx.fillText(COVERAGE_SAMPLE, 0, ascent);
        const { data } = ctx.getImageData(0, 0, width, height);
        let sum = 0;
        for (let i = 3; i < data.length; i += 4) sum += data[i];
        coverage = sum / (255 * width * height);
      }
    }
  } catch {
    // A tainted or unavailable canvas leaves the default standing. A bar at
    // 0.4 is a reasonable word; a thrown error is not.
  }
  inkCoverage.set(family, coverage);
  return coverage;
}

/** Fonts change what all of the above measured. */
export function forgetTextMetrics(): void {
  extents.clear();
  inkCoverage.clear();
  fontStrings.clear();
}

type FillRun = { path: Path2D; style: string; alpha: number };
type StrokeRun = { path: Path2D; style: string; width: number; alpha: number };

/**
 * Draw one page's marks into a canvas context.
 *
 * @param ctx        a 2D context whose canvas is sized in DEVICE pixels.
 * @param marks      the page, in print px - see previewMarks.
 * @param pageWidth  the page's own width in print px.
 * @param pageHeight the page's own height in print px.
 *
 * Fits the page inside the canvas the way the SVG's
 * `preserveAspectRatio="xMidYMid meet"` did: one uniform scale, centred, so
 * a card rounded to a whole pixel cannot stretch the drawing. A preview that
 * is a percent out of proportion is a preview of a page that does not exist.
 */
export function drawPreview(
  ctx: CanvasRenderingContext2D,
  marks: readonly PreviewMark[],
  pageWidth: number,
  pageHeight: number
): void {
  const { width, height } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (width <= 0 || height <= 0 || pageWidth <= 0 || pageHeight <= 0) return;

  // DEVICE px per print px. Everything below works in print px and lets the
  // transform carry it, including the hairline snap in src/lib/hairline.ts.
  const scale = Math.min(width / pageWidth, height / pageHeight);
  // THE CENTRING OFFSET IS ROUNDED TO WHOLE DEVICE PIXELS. snapHairline puts
  // every rule on an integer device row of THIS canvas's own grid; a
  // fractional offset here would then shift the whole snapped set by the
  // same fraction and spill each rule across two rows again - undoing the
  // snap globally after doing it per mark. Half a pixel of centring is not
  // worth that, and a canvas owns its backing store, so it is the one
  // surface that can simply refuse the fraction.
  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    Math.round((width - pageWidth * scale) / 2),
    Math.round((height - pageHeight * scale) / 2)
  );
  ctx.lineJoin = "round";

  // MARKS ARE COALESCED INTO RUNS, NOT SORTED BY STYLE.
  //
  // One fill() over a Path2D holding forty rules costs a fraction of forty
  // fills, and module renderers emit their rules in runs of one colour
  // anyway. Sorting by style would coalesce more and would also reorder the
  // page - a white box that arrives after a rule would erase it instead of
  // sitting behind it. A run flushes the moment the style changes, so paint
  // order is exactly the order the marks are in.
  let fillRun: FillRun | null = null;
  let strokeRun: StrokeRun | null = null;
  const text: Extract<PreviewMark, { k: "t" }>[] = [];
  const letterSpacingWorks = "letterSpacing" in ctx;

  const flushFill = () => {
    if (!fillRun) return;
    ctx.globalAlpha = fillRun.alpha;
    ctx.fillStyle = fillRun.style;
    ctx.fill(fillRun.path);
    fillRun = null;
  };
  const flushStroke = () => {
    if (!strokeRun) return;
    ctx.globalAlpha = strokeRun.alpha;
    ctx.strokeStyle = strokeRun.style;
    ctx.lineWidth = strokeRun.width;
    ctx.stroke(strokeRun.path);
    strokeRun = null;
  };
  const flush = () => {
    flushFill();
    flushStroke();
  };

  const addFill = (style: string, alpha: number): Path2D => {
    if (fillRun && (fillRun.style !== style || fillRun.alpha !== alpha)) flushFill();
    if (!fillRun) fillRun = { path: new Path2D(), style, alpha };
    return fillRun.path;
  };
  const addStroke = (style: string, lineWidth: number, alpha: number): Path2D => {
    if (
      strokeRun &&
      (strokeRun.style !== style || strokeRun.width !== lineWidth || strokeRun.alpha !== alpha)
    ) {
      flushStroke();
    }
    if (!strokeRun) strokeRun = { path: new Path2D(), style, width: lineWidth, alpha };
    return strokeRun.path;
  };

  for (const mark of marks) {
    const opacity = mark.o ?? 1;

    if (mark.k === "r") {
      const filled = mark.f !== undefined;
      const stroked = mark.s !== undefined;
      // Only a fill-only mark is a rule. A stroked box is already a stroke
      // and the rasteriser's own hairline handling covers it.
      const box =
        filled && !stroked
          ? snapHairline({ x: mark.x, y: mark.y, width: mark.w, height: mark.h }, scale)
          : { x: mark.x, y: mark.y, width: mark.w, height: mark.h, ink: 1 };

      if (mark.f !== undefined) {
        const path = addFill(mark.f, opacity * box.ink);
        if (mark.r) path.roundRect(box.x, box.y, box.width, box.height, mark.r);
        else path.rect(box.x, box.y, box.width, box.height);
      }
      if (mark.s !== undefined) {
        const path = addStroke(mark.s, mark.sw ?? 1, opacity);
        if (mark.r) path.roundRect(box.x, box.y, box.width, box.height, mark.r);
        else path.rect(box.x, box.y, box.width, box.height);
      }
      continue;
    }

    if (mark.k === "p") {
      // A glyph's own path, added to the run the same way a rect is - it is
      // a first-class mark, not a special case, which is what keeps an icon
      // strip from quietly vanishing.
      const shape = pathFor(mark.d);
      if (mark.f !== undefined) addFill(mark.f, opacity).addPath(shape);
      if (mark.s !== undefined) addStroke(mark.s, mark.sw ?? 1, opacity).addPath(shape);
      continue;
    }

    // TEXT IS HELD BACK FOR A SECOND PASS - and this is worth 7ms a frame.
    //
    // Drawing it in place ends the run it interrupts, and a page alternates
    // rules and labels all the way down, so 271 rects that should have been
    // a handful of fills became a hundred and twenty of them. Measured, ten
    // cards at 200px: rects alone 2.4ms, text alone 7.6ms, both together
    // 17.3ms - the 7.3ms over the sum is nothing but the chopping.
    //
    // Deferring puts every word on top of every shape, which is the order
    // the page already draws in: a label sits in a box, never behind one.
    text.push(mark);
  }

  flush();

  // ctx.font IS THE EXPENSIVE PART, and it is expensive even when nothing is
  // drawn with it.
  //
  // Counted on a real week spread: ten cards drew 9 fills, 8 strokes and ZERO
  // fillTexts - the coalescing and the greeking had done their work - and the
  // frame still cost 5.4ms, because it set ctx.font 19 times per card.
  // Assigning it parses a CSS font shorthand and resolves a face; 190 of
  // those is most of a frame. So the font is set only when something is about
  // to be MEASURED or DRAWN with it, and a greeked word whose extent is
  // already known needs neither.
  ctx.textBaseline = "alphabetic";
  let font = "";
  let spacing = "0px";
  const applyFont = (next: string, letters: string) => {
    if (next !== font) {
      ctx.font = next;
      font = next;
    }
    if (letterSpacingWorks && letters !== spacing) {
      ctx.letterSpacing = letters;
      spacing = letters;
    }
  };

  let colour = "";
  let alpha = -1;
  let align = "";

  // Bars, accumulated the way rects are and drawn per colour: a greeked page
  // is one fill() rather than a hundred and twenty.
  const bars = new Map<string, { path: Path2D; style: string; alpha: number }>();

  for (const mark of text) {
    const family = resolveCanvasFamily(mark.ff);
    const wanted = fontString(mark.z, family);
    const letters = mark.ls ? `${mark.ls}px` : "0px";
    const x = mark.a === "c" ? mark.x + mark.w / 2 : mark.a === "r" ? mark.x + mark.w : mark.x;
    // Where the editor's own div puts it - the shared rule, which the SVG
    // serialiser and the PDF use too. See textBaselineY.
    const baseline = textBaselineY(mark.y, mark.z, mark.ff);

    if (mark.z * scale < GREEK_BELOW_DEVICE_PX) {
      const extent = extentOf(ctx, wanted, letters, mark.t, applyFont);
      if (extent.advance <= 0 || extent.ascent + extent.descent <= 0) continue;
      const left = mark.a === "c" ? x - extent.advance / 2 : mark.a === "r" ? x - extent.advance : x;
      const style = mark.f ?? "#000";
      const key = `${style}|${mark.o ?? 1}|${mark.ff}`;
      let bar = bars.get(key);
      if (!bar) {
        bar = { path: new Path2D(), style, alpha: (mark.o ?? 1) * coverageOf(family) };
        bars.set(key, bar);
      }
      bar.path.rect(left, baseline - extent.ascent, extent.advance, extent.ascent + extent.descent);
      continue;
    }

    applyFont(wanted, letters);
    const nextColour = mark.f ?? "#000";
    if (nextColour !== colour) {
      ctx.fillStyle = nextColour;
      colour = nextColour;
    }
    const nextAlpha = mark.o ?? 1;
    if (nextAlpha !== alpha) {
      ctx.globalAlpha = nextAlpha;
      alpha = nextAlpha;
    }
    const nextAlign = mark.a === "c" ? "center" : mark.a === "r" ? "right" : "left";
    if (nextAlign !== align) {
      ctx.textAlign = nextAlign as CanvasTextAlign;
      align = nextAlign;
    }
    ctx.fillText(mark.t, x, baseline);
  }
  if (letterSpacingWorks && spacing !== "0px") ctx.letterSpacing = "0px";

  for (const bar of bars.values()) {
    ctx.globalAlpha = bar.alpha;
    ctx.fillStyle = bar.style;
    ctx.fill(bar.path);
  }

  ctx.globalAlpha = 1;
}
