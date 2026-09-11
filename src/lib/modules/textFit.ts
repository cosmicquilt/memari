// Making a string fit a box, when nothing here can measure a string.
//
// The renderer sets every text node `whiteSpace: "pre"` and draws exactly
// what it is handed, at exactly the position it is handed. There is no
// wrapping, no shrink-to-fit and no clipping: a label wider than its
// column simply carries on over whatever is next to it - across the module
// border and into the neighbouring module, which is how this was found. A
// spending log's "Amount" head at six columns wide ran out of the box and
// over the module beside it.
//
// So the fitting has to happen before the string is emitted, and it has to
// happen against an ESTIMATE, because a server-rendered module has no
// canvas to measure with. The estimate is one number: the average
// character advance as a fraction of the point size.
//
// That number was measured, once, against real PT Serif in a browser, and
// its story is worth keeping: it was pushed from 0.525 to 0.68 to explain
// a heading that wrapped when it should not have, and the real cause was
// that the measurement had been taken on the old 6x9in page's narrower
// sidebar. The overcorrection then forced a taller two-line header band on
// headings that fit perfectly well. Measured properly it came back 0.5495,
// so 0.55 with no margin at all. Keeping it in one place is the point of
// this file: it lived inside labeledBox.ts, which is a strange home for a
// fact about a typeface, and the modules that arrived later needed it too.

/**
 * Average character advance as a fraction of the point size, for the
 * serif this planner is set in.
 *
 * An estimate, and knowingly so - a string of capital Ms and a string of
 * lowercase ls sit either side of it by a wide margin. It is used for
 * decisions with a safe direction (drop a size, truncate) rather than for
 * layout, so being a little wrong costs a slightly small label rather than
 * a broken page.
 */
export const SAFE_CHAR_WIDTH_RATIO = 0.55;

/** Roughly how wide this string will be, in print pixels. */
export function estimateTextWidthPx(text: string, fontSizePx: number): number {
  return text.length * fontSizePx * SAFE_CHAR_WIDTH_RATIO;
}

/**
 * The largest size in `sizesPx`, largest-first, at which `text` fits
 * `widthPx` - or the smallest of them if none does.
 *
 * Dropping a size is the first thing to try, because it keeps the whole
 * string: a column head that reads "Amount" one point smaller is better
 * than one that reads "Amo…" at full size.
 */
export function fitFontSizePx(text: string, widthPx: number, sizesPx: number[]): number {
  for (const size of sizesPx) {
    if (estimateTextWidthPx(text, size) <= widthPx) return size;
  }
  return sizesPx[sizesPx.length - 1];
}

/**
 * `text` cut to what fits `widthPx`, with an ellipsis if anything was
 * lost.
 *
 * The last resort, after shrinking. Returns the string unchanged when it
 * already fits, so it is safe to call on everything.
 */
export function truncateToWidth(text: string, widthPx: number, fontSizePx: number): string {
  if (widthPx <= 0) return "";
  if (estimateTextWidthPx(text, fontSizePx) <= widthPx) return text;
  const perChar = fontSizePx * SAFE_CHAR_WIDTH_RATIO;
  // One character's worth of room goes to the ellipsis itself.
  const room = Math.floor(widthPx / perChar) - 1;
  if (room <= 0) return "";
  return `${text.slice(0, room).trimEnd()}…`;
}

/**
 * Shrink first, then cut: the whole treatment for a label that has to sit
 * on one line inside a fixed box.
 *
 * Returns both the string to draw and the size to draw it at, because the
 * two decisions cannot be made apart - a smaller size can itself remove
 * the need to cut. Making them separately is a bug this codebase has
 * already had once, in labeledBox, where the wrap was decided at 8pt and
 * the text then drawn at 7pt.
 */
export function fitLabel(
  text: string,
  widthPx: number,
  sizesPx: number[]
): { text: string; fontSizePx: number } {
  const fontSizePx = fitFontSizePx(text, widthPx, sizesPx);
  return { text: truncateToWidth(text, widthPx, fontSizePx), fontSizePx };
}

/**
 * One size for a SET of labels that belong together - a table's column
 * heads, a matrix's four quadrant names, the rows of a rating strip.
 *
 * Each label may have its own width (a table's columns are weighted), and
 * the size chosen is the largest at which every one of them fits its own.
 * Fitting them independently is what the first version did, and a spending
 * log came out with "Item" a couple of points larger than "Amount" beside
 * it - which reads as a mistake, because it is one. Labels in a row are
 * one typographic decision, not several.
 */
export function fitLabelSet(
  items: Array<{ text: string; widthPx: number }>,
  sizesPx: number[]
): { fontSizePx: number; texts: string[] } {
  const named = items.filter((item) => item.text.length > 0);
  const fontSizePx =
    named.length === 0
      ? sizesPx[0]
      : sizesPx.find((size) =>
          named.every((item) => estimateTextWidthPx(item.text, size) <= item.widthPx)
        ) ?? sizesPx[sizesPx.length - 1];
  return {
    fontSizePx,
    // Still truncated individually: one size for all of them does not mean
    // one width, and a label that does not fit even at the smallest size
    // has to be cut rather than allowed out of its box.
    texts: items.map((item) => truncateToWidth(item.text, item.widthPx, fontSizePx)),
  };
}
