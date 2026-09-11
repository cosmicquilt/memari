// A list of things, each rated on the same short scale.
//
// Mood, energy, pain, sleep quality, anxiety, symptom severity, focus,
// craving intensity, satisfaction across the areas of a life. One row per
// item, the same numbered scale on every row, and a glyph to circle.
//
// The scale being SHARED is what makes this a strip rather than a set of
// separate meters: the numbers are printed once at the top and every row
// lines up beneath them, so a filled-in page reads as a column chart. That
// is also what distinguishes it from progressMeter, whose single count
// wraps across rows and has no per-row label at all.
//
// Rows are one cell, the same as a to-do row and for the same reason -
// the pitch has to divide the cell or every resize moves every mark. The
// scale head is half a cell. See todoChecklist.ts for the full argument
// and moduleRegistry.ts for the classifier that checks it.

import { ptToPx } from "@/lib/print-spec";
import { fitLabelSet } from "@/lib/modules/textFit";

export type RatingStripConfig = {
  heading: string;
  /** One row each, in order. */
  items: string[];
  /** Lowest and highest point of the scale, printed at the head. */
  scaleMin: number;
  scaleMax: number;
  /** Circles read as "ring the one you mean"; squares as "tick it". */
  shape?: "circle" | "square";
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
/**
 * ONE CELL, not the half cell a printed head visually wants.
 *
 * The header above is one cell less the box inset at both ends, so what
 * remains is exactly (rowSpan - 1) whole cells. Anything this band takes
 * out of that has to be a whole cell too, or the ruled area below is a
 * whole number of cells plus a remainder - and the remainder shows up as a
 * last row half again as tall as the others, with no rule under it because
 * the border is still half a cell away.
 *
 * That is not a hypothetical: it is the defect reported twice on the
 * to-do, first as "instead of one row, there a little bit of a second row"
 * and then as "with more rows it still looks messed up, the last row is
 * large". A half-cell band reintroduces it exactly.
 */
const SCALE_HEAD_HEIGHT_PT = 18;
const SCALE_HEAD_FONT_PT = 6.5;
/** One cell, the same as a to-do row. */
const ROW_HEIGHT_PT = 18;
const ITEM_FONT_PT = 8;
/** Half a cell each way, centred in its row. */
const GLYPH_PT = 9;
const GLYPH_STROKE_PT = 0.35;
const RULE_WIDTH_PT = 0.35;
const HORIZONTAL_PADDING_PT = 5;
/**
 * The item names take this share of the width and the scale the rest.
 *
 * A proportion rather than a measurement, so the same module works at six
 * columns in a sidebar and at twenty-four across the foot of a page - the
 * problem a fixed label column would have.
 */
const LABEL_SHARE = 0.42;

export function getRatingStripRowMetricsPx() {
  return {
    headerHeightPx: ptToPx(HEADER_HEIGHT_PT),
    scaleHeadHeightPx: ptToPx(SCALE_HEAD_HEIGHT_PT),
    rowHeightPx: ptToPx(ROW_HEIGHT_PT),
  };
}

/** Header, the scale head and one item to rate. */
export function getRatingStripMinHeightPx(): number {
  const m = getRatingStripRowMetricsPx();
  return m.headerHeightPx + m.scaleHeadHeightPx + m.rowHeightPx;
}

export function renderRatingStrip(
  geometry: { x: number; y: number; width: number; height: number },
  config: RatingStripConfig,
  idPrefix: string,
  fontFamily: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic: a glyph names its item and its scale VALUE, so widening the
  // box slides "row 3, value 7" rather than replacing it. See
  // todoChecklist.ts.
  const id = (name: string) => `${idPrefix}-${name}`;

  const headerHeight = ptToPx(HEADER_HEIGHT_PT);
  const scaleHeadHeight = ptToPx(SCALE_HEAD_HEIGHT_PT);
  const rowHeight = ptToPx(ROW_HEIGHT_PT);
  const glyph = ptToPx(GLYPH_PT);
  const ruleWidth = ptToPx(RULE_WIDTH_PT);
  const padding = ptToPx(HORIZONTAL_PADDING_PT);

  // Total in its config - see columnTable.ts for why.
  const items = config.items ?? [];
  const min = Math.round(config.scaleMin) || 1;
  const max = Math.round(config.scaleMax) || 5;
  // A scale that runs backwards or has one point is a configuration
  // mistake, not a thing to draw badly: clamp to at least two points so
  // the strip is still a strip.
  const points = Math.max(2, max - min + 1);

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

  const headerFontSize = ptToPx(HEADER_FONT_PT);
  elements.push({
    id: id("heading"),
    type: "text",
    x: geometry.x,
    y: geometry.y + (headerHeight - headerFontSize * 1.2) / 2,
    width: geometry.width,
    height: headerFontSize * 1.2,
    text: config.heading ?? "",
    fontSize: headerFontSize,
    fontFamily,
    fill: NEAR_BLACK,
    align: "center",
  });

  const headTop = geometry.y + headerHeight;
  const bodyTop = headTop + scaleHeadHeight;
  const bodyBottom = geometry.y + geometry.height;
  const scaleLeft = geometry.x + geometry.width * LABEL_SHARE;
  const scaleWidth = geometry.x + geometry.width - scaleLeft;
  const step = scaleWidth / points;
  const centreOf = (value: number) => scaleLeft + step * (value - min) + step / 2;

  const scaleFontSize = ptToPx(SCALE_HEAD_FONT_PT);
  for (let value = min; value <= min + points - 1; value++) {
    elements.push({
      // By VALUE, not by index: the "7" is the same mark whatever else
      // changes around it.
      id: id(`scale${value}`),
      type: "text",
      x: centreOf(value) - step / 2,
      y: headTop + (scaleHeadHeight - scaleFontSize * 1.2) / 2,
      width: step,
      height: scaleFontSize * 1.2,
      text: String(value),
      fontSize: scaleFontSize,
      fontFamily,
      fill: NEAR_BLACK,
      align: "center",
      opacity: 0.7,
    });
  }

  // The rule under the scale head, which is what makes the numbers read as
  // a heading rather than as the first item's row.
  elements.push({
    id: id("head-rule"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: bodyTop - ruleWidth / 2,
    width: geometry.width,
    height: ruleWidth,
    fill: NEAR_BLACK,
    stroke: "none",
  });

  const labelWidth = geometry.width * LABEL_SHARE - padding * 2;
  // Every row name at one size - see fitLabelSet. "Craving intensity" next
  // to "Mood" should not set the two rows in different sizes.
  const labels = fitLabelSet(
    items.map((text) => ({ text, widthPx: labelWidth })),
    [ptToPx(ITEM_FONT_PT), ptToPx(7), ptToPx(6)]
  );
  const circular = (config.shape ?? "circle") === "circle";

  for (let i = 0; i < items.length; i++) {
    const rowTop = bodyTop + rowHeight * i;
    // An item with no row to sit in is not drawn. Rows are anchored to the
    // top, so the ones that do fit are exactly where they were before the
    // box shrank.
    if (rowTop + rowHeight > bodyBottom + 0.5) break;

    // Shrunk, then cut, so a long row name cannot run into the scale -
    // see textFit.ts, and columnTable.ts for the case that found it.
    const label = { text: labels.texts[i] ?? "", fontSizePx: labels.fontSizePx };
    elements.push({
      id: id(`i${i}-label`),
      type: "text",
      x: geometry.x + padding,
      y: rowTop + (rowHeight - label.fontSizePx * 1.2) / 2,
      width: labelWidth,
      height: label.fontSizePx * 1.2,
      text: label.text,
      fontSize: label.fontSizePx,
      fontFamily,
      fill: NEAR_BLACK,
      align: "left",
    });

    for (let value = min; value <= min + points - 1; value++) {
      elements.push({
        id: id(`i${i}-v${value}`),
        type: "figure",
        subType: "rect",
        x: centreOf(value) - glyph / 2,
        y: rowTop + (rowHeight - glyph) / 2,
        width: glyph,
        height: glyph,
        fill: "transparent",
        stroke: NEAR_BLACK,
        strokeWidth: ptToPx(GLYPH_STROKE_PT),
        // A square with its corner radius at half its side IS a circle -
        // the renderer draws every figure as an SVG rect, so this is how a
        // ring is spelled here rather than a shape it cannot draw.
        cornerRadius: circular ? glyph / 2 : 0,
        opacity: 0.8,
      });
    }

    // The separator BELOW each row, skipped where it would land on the
    // box's own border: drawing both put two hairlines on one edge and
    // made it look like the rows alternated weight. Reported on the to-do
    // in exactly those words.
    const rowBottom = rowTop + rowHeight;
    if (Math.abs(rowBottom - bodyBottom) >= 0.5) {
      elements.push({
        id: id(`i${i}-rule`),
        type: "figure",
        subType: "rect",
        x: geometry.x,
        y: rowBottom - ruleWidth / 2,
        width: geometry.width,
        height: ruleWidth,
        fill: NEAR_BLACK,
        stroke: "none",
        opacity: 0.45,
      });
    }
  }

  return elements;
}
