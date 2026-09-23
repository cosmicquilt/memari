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
// That number was measured, once, against real Newsreader in a browser, and
// its story is worth keeping: it was pushed from 0.525 to 0.68 to explain
// a heading that wrapped when it should not have, and the real cause was
// that the measurement had been taken on the old 6x9in page's narrower
// sidebar. The overcorrection then forced a taller two-line header band on
// headings that fit perfectly well. Measured properly it came back 0.5495,
// so 0.55 with no margin at all. Keeping it in one place is the point of
// this file: it lived inside labeledBox.ts, which is a strange home for a
// fact about a typeface, and the modules that arrived later needed it too.

/**
 * Average character advance as a fraction of the point size, BY CHARACTER
 * CLASS, measured in real Newsreader.
 *
 * This was one number, 0.55, and its story is worth keeping: it was pushed
 * from 0.525 to 0.68 to explain a heading that wrapped when it should not
 * have, the real cause turned out to be a measurement taken on the old
 * 6x9in page's narrower sidebar, and measured properly it came back
 * 0.5495. So 0.55 with no margin at all.
 *
 * What that story missed is that there is no single number to measure. The
 * 0.5495 was taken on MIXED-CASE text, and this planner sets a great deal
 * of its type in capitals - every module heading, and now every quadrant
 * name and habit row too. Measured on the real face at 100px. These are NEWSREADER - the planner's
 * serif was PT Serif until the face changed, and Newsreader is materially
 * wider, so the old numbers had to be re-measured rather than carried
 * over. "MEASUREMENTS" came out at 0.739 against the old uppercase
 * constant of 0.66: a 12% under-estimate, which is a heading printing out
 * of its own box.
 *
 *     uppercase  0.708 avg (1.024 worst, W)      lowercase  0.514
 *     digits     0.600                           space      0.232
 *
 * So one flat 0.55 is wrong in both directions at once: 10% too narrow for
 * a capitalised word and 10% too wide for a lowercase one. Checked against
 * every one of the 359 multi-character labels the catalogue actually draws,
 * it UNDER-estimated 201 of them - "MON" by 41% - which is a label printing
 * out of its own box, and over-estimated the rest, which is a label
 * needlessly dropping a size.
 *
 * The per-class numbers below are those measurements rounded up for
 * margin. Against the same 359 labels they under-estimate 65 rather than
 * 201, worst case 22% rather than 41%, at a cost of 7% average slack.
 *
 * Note what is NOT done here: raising the flat number. A flat 0.68 fixes
 * capitals and re-creates the original bug for everything else, which is
 * exactly the overcorrection that had to be taken back out. Lowercase
 * stays at 0.52 - four points of margin over its measured 0.502 - and only
 * the capitals move.
 */
const ADVANCE_RATIO = {
  upper: 0.73,
  lower: 0.54,
  digit: 0.62,
  space: 0.26,
  other: 0.42,
};

/**
 * The single ratio, kept for the callers that want one number rather than
 * a string - labeledBox's two-size heading test and textBlock's wrap.
 *
 * Prefer estimateTextWidthPx, which knows what the characters are.
 */
export const SAFE_CHAR_WIDTH_RATIO = 0.55;

/**
 * Slack allowed when asking whether a string fits.
 *
 * A hundredth of a print pixel is a three-millionth of an inch, so this
 * changes nothing anyone can see. It exists because the comparison is
 * often an exact equality: columnWidthsForLabels gives a starved column
 * precisely `estimate + 2 * padding` and the renderer then asks whether
 * `estimate` fits in `width - 2 * padding`, and in floating point
 * `(a + b) - b` is not reliably `a`. Without the tolerance a column sized
 * to the pixel to hold "Category" printed "Catego…".
 */
const FIT_TOLERANCE_PX = 0.01;

function advanceRatio(character: string): number {
  if (character >= "A" && character <= "Z") return ADVANCE_RATIO.upper;
  if (character >= "a" && character <= "z") return ADVANCE_RATIO.lower;
  if (character >= "0" && character <= "9") return ADVANCE_RATIO.digit;
  if (character === " ") return ADVANCE_RATIO.space;
  return ADVANCE_RATIO.other;
}

/** Roughly how wide this string will be, in print pixels. */
export function estimateTextWidthPx(text: string, fontSizePx: number): number {
  let width = 0;
  for (const character of text) width += advanceRatio(character) * fontSizePx;
  return width;
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
    if (estimateTextWidthPx(text, size) <= widthPx + FIT_TOLERANCE_PX) return size;
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
  if (estimateTextWidthPx(text, fontSizePx) <= widthPx + FIT_TOLERANCE_PX) return text;
  // Grown a character at a time against the same estimate, because there
  // is no longer one average advance to divide by - a capital takes more
  // room than a lowercase letter, so "how many characters fit" depends on
  // which ones they are.
  const ellipsisWidth = estimateTextWidthPx("…", fontSizePx);
  let kept = "";
  let used = 0;
  for (const character of text) {
    const advance = advanceRatio(character) * fontSizePx;
    if (used + advance + ellipsisWidth > widthPx) break;
    kept += character;
    used += advance;
  }
  kept = kept.trimEnd();
  return kept.length > 0 ? `${kept}…` : "";
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
          named.every(
            (item) => estimateTextWidthPx(item.text, size) <= item.widthPx + FIT_TOLERANCE_PX
          )
        ) ?? sizesPx[sizesPx.length - 1];
  return {
    fontSizePx,
    // Still truncated individually: one size for all of them does not mean
    // one width, and a label that does not fit even at the smallest size
    // has to be cut rather than allowed out of its box.
    texts: items.map((item) => truncateToWidth(item.text, item.widthPx, fontSizePx)),
  };
}

/**
 * Column widths for a weighted row of columns, where no column is ever
 * narrower than its own label needs.
 *
 * The weights are a statement about how the BODY should be divided - a
 * spending log wants a wide Item and a narrow Date - and dividing strictly
 * by them squeezes whichever column happens to carry a long word. That is
 * how "Category" and "Amount" became "Categ…" and "Amo…": the head had no
 * say in the width it was given, only in whether it survived being put
 * there.
 *
 * There are three levers, and the ORDER they are pulled in is the whole
 * design here, because each one costs something different:
 *
 *   1. SHRINK THE TYPE, down to the smallest legible size, keeping the
 *      weights exactly. Costs legibility, changes nothing structural.
 *   2. TIGHTEN THE PADDING to half, at that smallest size. The cell
 *      padding is a fixed 4pt that does not scale with the type, so a 5pt
 *      head is asked to leave as much air around itself as an 8pt one; in
 *      a sidebar a five-column table spends 38% of its width on padding.
 *   3. WIDEN THE STARVED COLUMNS, taking the width from whichever column
 *      had room to spare. Costs the table its designed proportions.
 *   4. Failing all of that the row genuinely cannot hold its own words:
 *      split the width in proportion to what each label needs - which at
 *      least cuts them all by the same amount rather than sacrificing
 *      whichever one the weights disfavoured - and truncate.
 *
 * Shrinking comes before widening, asked for directly: "before expanding
 * column width shrink text to smallest legible size". Small uniform heads
 * read as a deliberately compact table; a table whose Item column has been
 * narrowed to pay for its Category head reads as a broken one. So the type
 * goes all the way to the floor before any column moves off its weight.
 *
 * A table with room to spare therefore comes out exactly as its weights
 * say, at full size and full padding, which is the common case and must
 * not be quietly re-proportioned.
 */
export function columnWidthsForLabels(options: {
  labels: string[];
  weights: number[];
  totalWidthPx: number;
  paddingPx: number;
  /** Largest first. The last is the smallest legible size - see above. */
  sizesPx: number[];
}): { widths: number[]; fontSizePx: number; paddingPx: number } {
  const { labels, weights, totalWidthPx, paddingPx, sizesPx } = options;
  const needsAt = (fontSizePx: number, pad: number) =>
    labels.map((label) =>
      label.length > 0 ? estimateTextWidthPx(label, fontSizePx) + pad * 2 : 0
    );
  const fitsByWeight = (needs: number[], widths: number[]) =>
    needs.every((need, c) => widths[c] + FIT_TOLERANCE_PX >= need);

  // 1. The type shrinks first, and the weights are kept.
  for (const fontSizePx of sizesPx) {
    const widths = byWeight(totalWidthPx, weights);
    if (fitsByWeight(needsAt(fontSizePx, paddingPx), widths)) {
      return { widths, fontSizePx, paddingPx };
    }
  }

  const smallestPx = sizesPx[sizesPx.length - 1];

  // 2. Then the padding, still keeping the weights.
  const tight = paddingPx / 2;
  {
    const widths = byWeight(totalWidthPx, weights);
    if (fitsByWeight(needsAt(smallestPx, tight), widths)) {
      return { widths, fontSizePx: smallestPx, paddingPx: tight };
    }
  }

  // 3. Only now do columns move off their weights, and only by as much as
  //    the starved ones need.
  for (const pad of [paddingPx, tight]) {
    const needs = needsAt(smallestPx, pad);
    if (needs.reduce((a, b) => a + b, 0) <= totalWidthPx) {
      return {
        widths: waterFill(totalWidthPx, weights, needs),
        fontSizePx: smallestPx,
        paddingPx: pad,
      };
    }
  }

  // 4. Too narrow for its own words at any size.
  const needs = needsAt(smallestPx, tight);
  const needed = needs.reduce((a, b) => a + b, 0);
  if (needed <= 0) {
    return { widths: byWeight(totalWidthPx, weights), fontSizePx: smallestPx, paddingPx: tight };
  }
  return {
    widths: needs.map((need) => (totalWidthPx * need) / needed),
    fontSizePx: smallestPx,
    paddingPx: tight,
  };
}

function byWeight(totalWidthPx: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.map((weight) => (totalWidthPx * weight) / total);
}

/** Pin every column that its weight would starve, then share what is left
 *  by weight - repeating, because pinning one starves the next. */
function waterFill(totalWidthPx: number, weights: number[], needs: number[]): number[] {
  const count = weights.length;
  const widths = new Array<number>(count).fill(0);
  const pinned = new Array<boolean>(count).fill(false);

  // At most one column is pinned per pass, so this cannot run longer than
  // there are columns.
  for (let pass = 0; pass <= count; pass++) {
    let poolWidth = totalWidthPx;
    let poolWeight = 0;
    for (let c = 0; c < count; c++) {
      if (pinned[c]) poolWidth -= widths[c];
      else poolWeight += weights[c];
    }
    if (poolWeight <= 0) break;

    let starved = false;
    for (let c = 0; c < count; c++) {
      if (pinned[c]) continue;
      if ((poolWidth * weights[c]) / poolWeight < needs[c] - 0.001) {
        widths[c] = needs[c];
        pinned[c] = true;
        starved = true;
      }
    }
    if (!starved) {
      for (let c = 0; c < count; c++) {
        if (!pinned[c]) widths[c] = (poolWidth * weights[c]) / poolWeight;
      }
      break;
    }
  }

  // Every column pinned and room to spare: hand the remainder back out by
  // weight, or the row would stop short of its own box.
  const slack = totalWidthPx - widths.reduce((a, b) => a + b, 0);
  if (slack > 0.001) {
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    for (let c = 0; c < count; c++) widths[c] += (slack * weights[c]) / total;
  }
  return widths;
}

// ---------------------------------------------------------------------
// VERTICAL metrics: where a line of text actually sits in its own box.
//
// Every consumer gives a text element a line height of 1.2 (see
// PolotnoJsonRenderer, drawPreview and the PDF export), and twenty-two
// places across twelve module renderers centre a label by centring that LINE
// BOX in a band: `y = top + (band - fontSize * 1.2) / 2`.
//
// CENTRING THE LINE BOX IS NOT CENTRING THE INK. Where the glyphs sit inside
// the box depends on the font's own ascent and descent, and the two fonts
// this app ships disagree. Reported 2026-09-22: "with the serif font the
// headers of modules do not look vertically centered." Measured in the
// running editor, the uppercase ink centre against the line box centre:
//
//   Newsreader       -4.0px at 33.3px, -3.5 at 29.2, -3.0 at 25, -2.5 at 20.8
//   Hanken Grotesk    0 at every size
//
// Every one of those is 16.7% of the cap height - a constant 0.12em - and
// the sans is right by luck, not design.
// ---------------------------------------------------------------------

/** The line height every renderer gives a text element. */
export const TEXT_LINE_HEIGHT = 1.2;

/**
 * Measured from the loaded faces in Chrome, in ems, at 100px:
 * `measureText` for fontBoundingBoxAscent/Descent, and the actual ascent of
 * "HELMO" for the cap height.
 *
 * Newsreader's ascent+descent is 1.01em, which sits INSIDE the 1.2em line
 * box with positive half-leading; Hanken Grotesk's is 1.30em, which
 * overflows it. That is the whole of the difference.
 */
const FONT_METRICS: Record<string, { ascent: number; descent: number; capHeight: number }> = {
  Newsreader: { ascent: 0.74, descent: 0.27, capHeight: 0.71 },
  "Hanken Grotesk": { ascent: 1.0, descent: 0.3, capHeight: 0.71 },
};

/** Newsreader's, so an unknown family lands on the app's default rather than
 *  on no correction at all. */
const DEFAULT_METRICS = FONT_METRICS.Newsreader;

/**
 * How far DOWN to move a line box so its capitals are centred where the box
 * is, as a fraction of the font size.
 *
 * Derived, not tabulated: the browser centres the font's content area
 * (ascent + descent) in the line box, which puts the baseline at
 * `(1.2 - (a + d)) / 2 + a`; the cap band runs from there up by the cap
 * height, so its centre is half a cap height above the baseline. The nudge
 * is the difference between that and the line box's own centre. Newsreader
 * comes out at 0.120em and Hanken Grotesk at 0.005em, which is what was
 * measured on screen.
 */
export function capCentreNudgeEm(fontFamily: string): number {
  const { ascent, descent, capHeight } = FONT_METRICS[fontFamily] ?? DEFAULT_METRICS;
  const baseline = (TEXT_LINE_HEIGHT - (ascent + descent)) / 2 + ascent;
  const capBandCentre = baseline - capHeight / 2;
  return TEXT_LINE_HEIGHT / 2 - capBandCentre;
}

/**
 * WHERE A TEXT ELEMENT'S BASELINE IS, given the top of its box - the one
 * description every consumer of a text element uses.
 *
 * The editor puts a text element in a div with line-height 1.2, and the
 * browser centres the font's content area (ascent + descent) in that line
 * box, so the baseline is `(1.2 - (a + d)) / 2 + a` ems below the top. The
 * PDF, the proof sheets and the canvas previews used to put it at exactly
 * 1em instead - 0.165em lower for Newsreader - so print and previews sat
 * lower than the editor showed. capCentredTextY then centred text for the
 * editor, which left the day names 5.5 print px low in their tabs
 * everywhere else. Reported 2026-09-22: "the days of the week aren't
 * vertically centered". Every consumer now asks here.
 */
export function textBaselineY(textY: number, fontSizePx: number, fontFamily: string): number {
  const { ascent, descent } = FONT_METRICS[fontFamily] ?? DEFAULT_METRICS;
  return textY + ((TEXT_LINE_HEIGHT - (ascent + descent)) / 2 + ascent) * fontSizePx;
}

/**
 * The `y` for a text element whose CAPITALS should sit in the middle of a
 * band - the one description of vertically centred text in this app.
 *
 * Takes the band rather than returning an offset, because every caller was
 * already writing the same subtraction and the point is that they stop.
 *
 * Cap-centred rather than ink-centred: these are labels - headings, day
 * letters, column heads, times - and a label with a descender in it should
 * not sit higher than the one beside it without. Centring the cap band is
 * what makes a row of them line up.
 */
export function capCentredTextY(
  bandTop: number,
  bandHeight: number,
  fontSizePx: number,
  fontFamily: string
): number {
  return (
    bandTop +
    (bandHeight - fontSizePx * TEXT_LINE_HEIGHT) / 2 +
    capCentreNudgeEm(fontFamily) * fontSizePx
  );
}

/**
 * Characters that actually put ink below the baseline.
 *
 * The five descending lowercase letters, plus the comma and semicolon that
 * hang below it. Brackets and parentheses descend a little too, but no label
 * in this app's modules is set in them, and listing them would be guessing at
 * a case rather than covering one.
 */
const DESCENDERS = /[gjpqy,;]/;

/**
 * The band a string's INK occupies, given the top of its text element.
 *
 * A text element's own height is a LINE BOX - `fontSize * 1.2` - and most of
 * a line box is empty: leading above the ascent, and the whole descent when
 * the string is capitals. Nothing is painted there.
 *
 * moduleHouseStyle's "no mark escapes the module" rule used the line box for
 * its vertical test, and that proxy held until text moved. Cap-centring a day
 * letter in the bottom row of a bill-tracker pushed the empty bottom of its
 * line box 3px past the module while the letter itself stayed 8px inside, and
 * 48 cases failed for marks that are not there. The top is the cap height,
 * since every label centred this way is set in capitals; the bottom is the
 * baseline unless the string has something below it.
 */
export function textInkBand(
  textY: number,
  fontSizePx: number,
  fontFamily: string,
  text: string
): { top: number; bottom: number } {
  const { descent, capHeight } = FONT_METRICS[fontFamily] ?? DEFAULT_METRICS;
  const baseline = textBaselineY(textY, fontSizePx, fontFamily);
  return {
    top: baseline - capHeight * fontSizePx,
    bottom: baseline + (DESCENDERS.test(text) ? descent * fontSizePx : 0),
  };
}
