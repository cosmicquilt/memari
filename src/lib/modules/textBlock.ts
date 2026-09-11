// A passage of set text, printed rather than written on.
//
// The Serenity Prayer, a creed, an affirmation, a breathing exercise's
// four steps, the rules of a method, a recipe's instructions, the standing
// question at the top of a page. What these have in common is that the
// words are FIXED - the user reads them, they do not fill them in - which
// is the opposite of every other primitive here and is why none of them
// could serve.
//
// This is what quote-block becomes. It was registered and seeded from the
// start with no renderer, as the place a catalogue module goes before it
// can be drawn; it can be drawn now.
//
// TEXT WRAPPING IS THIS FILE'S REAL WORK. The renderer sets each text node
// `whiteSpace: "pre"` and draws exactly the string it is given, so a long
// passage handed over whole runs straight out of its box. Nothing in this
// app wrapped text before - labeledBox got as far as deciding WHETHER a
// heading wraps, and then dropped a point size to avoid it. So the wrap
// happens here, greedily, against the same measured character-width ratio
// labeledBox uses, and each line is emitted as its own text element.
//
// The ratio is an estimate (0.55 of the point size, measured against real
// PT Serif in the browser - see textFit.ts for the measurement and for the
// shrink-then-truncate helpers the single-line modules use). It is
// imported rather than restated because two copies of one number is the
// defect this codebase keeps meeting.
//
// Line pitch is half a cell, which divides the cell, so growing the box
// adds lines at the bottom and moves none of the ones above.

import { ptToPx } from "@/lib/print-spec";
import { SAFE_CHAR_WIDTH_RATIO } from "@/lib/modules/textFit";

export type TextBlockConfig = {
  /** Optional - an affirmation card often has none. */
  heading?: string;
  /** The passage. Newlines are honoured, so verse stays verse. */
  body: string;
  /** Printed right-aligned under the passage. */
  attribution?: string;
  align?: "left" | "center";
};

export type RenderedElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
};

const NEAR_BLACK = "#231F20";
const BORDER_WIDTH_PT = 0.5;
// One cell less the box inset at both ends - 63 print px. See
// todoChecklist.ts.
const HEADER_HEIGHT_PT = 15.12;
const HEADER_FONT_PT = 12;
/** Half a cell: the line pitch of the passage. */
const LINE_HEIGHT_PT = 9;
const BODY_FONT_PT = 8;
const ATTRIBUTION_FONT_PT = 7;
const HORIZONTAL_PADDING_PT = 8;
/** Half a cell of air under the header before the passage starts. */
const BODY_TOP_PADDING_PT = 9;

export function getTextBlockRowMetricsPx() {
  return {
    headerHeightPx: ptToPx(HEADER_HEIGHT_PT),
    lineHeightPx: ptToPx(LINE_HEIGHT_PT),
  };
}

/**
 * Greedy word wrap against an estimated average character advance.
 *
 * Exported because the minimum height has to know how many lines a passage
 * takes, and that has to be the same count the renderer draws or the box
 * will be sized for one thing and filled with another.
 *
 * Newlines in the source are hard breaks: a prayer, a poem and a numbered
 * list all carry their own line structure, and reflowing them into a
 * paragraph would be wrong in a way no wrap width could fix. Each of those
 * lines is then wrapped on its own if it is too long for the box.
 *
 * A single word longer than the line is left to overrun rather than being
 * broken - hyphenation needs real metrics, and a URL sticking out is more
 * legible than one chopped in an arbitrary place.
 */
export function wrapTextBlock(body: string, widthPx: number, fontSizePx: number): string[] {
  const perChar = fontSizePx * SAFE_CHAR_WIDTH_RATIO;
  const maxChars = Math.max(1, Math.floor(widthPx / perChar));
  const lines: string[] = [];

  for (const paragraph of body.split("\n")) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      // A blank line in the source is a blank line in the output - it is
      // how a passage separates its stanzas.
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= maxChars || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }

  return lines;
}

/**
 * Header, the whole passage, and the attribution.
 *
 * The whole passage, not a first line of it: a quote cut off halfway is
 * not a short quote. Same reasoning as the mini month's six weeks.
 */
export function getTextBlockMinHeightPx(config: TextBlockConfig, widthPx: number): number {
  const m = getTextBlockRowMetricsPx();
  const usableWidth = widthPx - ptToPx(HORIZONTAL_PADDING_PT) * 2;
  const lines = wrapTextBlock(config.body ?? "", usableWidth, ptToPx(BODY_FONT_PT));
  const attribution = config.attribution ? m.lineHeightPx : 0;
  return (
    (config.heading ? m.headerHeightPx : 0) +
    ptToPx(BODY_TOP_PADDING_PT) +
    m.lineHeightPx * Math.max(1, lines.length) +
    attribution
  );
}

export function renderTextBlock(
  geometry: { x: number; y: number; width: number; height: number },
  config: TextBlockConfig,
  idPrefix: string,
  fontFamily: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic, and here that means by CONTENT rather than by index: the
  // renderer keys text nodes on their id, and a line of a fixed passage is
  // identified by which line of the passage it is. A rewrap at a new width
  // genuinely produces different lines, so they are different marks and
  // should fade rather than slide - which is what indexing by line number
  // gives, since line 3 at one width holds different words than line 3 at
  // another. See PolotnoJsonRenderer's textKey.
  const id = (name: string) => `${idPrefix}-${name}`;

  const headerHeight = config.heading ? ptToPx(HEADER_HEIGHT_PT) : 0;
  const lineHeight = ptToPx(LINE_HEIGHT_PT);
  const padding = ptToPx(HORIZONTAL_PADDING_PT);
  const bodyFontSize = ptToPx(BODY_FONT_PT);
  const align = config.align ?? "left";

  elements.push({
    id: id("border"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    fill: "transparent",
    stroke: NEAR_BLACK,
    strokeWidth: ptToPx(BORDER_WIDTH_PT),
  });

  if (config.heading) {
    const headerFontSize = ptToPx(HEADER_FONT_PT);
    elements.push({
      id: id("heading"),
      type: "text",
      x: geometry.x,
      y: geometry.y + (headerHeight - headerFontSize * 1.2) / 2,
      width: geometry.width,
      height: headerFontSize * 1.2,
      text: config.heading,
      fontSize: headerFontSize,
      fontFamily,
      fill: NEAR_BLACK,
      align: "center",
    });
  }

  const usableWidth = geometry.width - padding * 2;
  const lines = wrapTextBlock(config.body ?? "", usableWidth, bodyFontSize);
  const bodyTop = geometry.y + headerHeight + ptToPx(BODY_TOP_PADDING_PT);
  const bodyBottom = geometry.y + geometry.height;

  let drawn = 0;
  for (let i = 0; i < lines.length; i++) {
    const top = bodyTop + lineHeight * i;
    // A line with nowhere to sit is dropped. getTextBlockMinHeightPx sizes
    // the box for the whole passage, so this is the case where a user has
    // shrunk the box below what its own text needs - the text truncates
    // rather than spilling over the border of the box beneath it.
    if (top + lineHeight > bodyBottom + 0.5) break;
    drawn = i + 1;
    if (!lines[i]) continue;

    elements.push({
      id: id(`line${i}`),
      type: "text",
      x: geometry.x + padding,
      y: top + (lineHeight - bodyFontSize * 1.2) / 2,
      width: usableWidth,
      height: bodyFontSize * 1.2,
      text: lines[i],
      fontSize: bodyFontSize,
      fontFamily,
      fill: NEAR_BLACK,
      align,
    });
  }

  if (config.attribution) {
    const attributionFontSize = ptToPx(ATTRIBUTION_FONT_PT);
    const top = bodyTop + lineHeight * drawn;
    if (top + lineHeight <= bodyBottom + 0.5) {
      elements.push({
        id: id("attribution"),
        type: "text",
        x: geometry.x + padding,
        y: top + (lineHeight - attributionFontSize * 1.2) / 2,
        width: usableWidth,
        height: attributionFontSize * 1.2,
        // An em dash is how an attribution is set, and the module owns
        // that convention rather than asking every preset to type it.
        text: `— ${config.attribution}`,
        fontSize: attributionFontSize,
        fontFamily,
        fill: NEAR_BLACK,
        align: "right",
        opacity: 0.75,
      });
    }
  }

  return elements;
}
