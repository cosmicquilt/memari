// Named columns with ruled rows - the workhorse of the catalogue.
//
// Twenty-six modules are this one drawing with a different set of column
// names: a spending log is Date / Item / Category / Amount, a workout log
// is Exercise / Sets / Reps / Weight, a Step 4 inventory is Person /
// Cause / Affects / My part. The columns are data; the geometry is not.
//
// Two things the catalogue asks for that a plain grid does not give:
//
//   WEIGHTED COLUMNS. A "Date" column and an "Item" column should not be
//   the same width. Each column has a weight and takes that share of the
//   width, so a preset states proportions rather than pixels and the same
//   preset works in the sidebar and across the bottom zone.
//
//   A TOTALS ROW. A budget and a macro log both end in a row that is
//   ruled off from the ones above it. It is the last row, drawn with the
//   body rule doubled, and it costs one row of writing space.
//
// Lattice quantities throughout, for the reason todoChecklist.ts explains
// at length: the header is one cell less the box inset at both ends, so
// what remains is a whole number of cells, and a row is one cell. Rows are
// therefore anchored - growing the box adds rows at the bottom and moves
// none of the ones above.

import { ptToPx } from "@/lib/print-spec";
import { fitLabel, fitLabelSet } from "@/lib/modules/textFit";

export type ColumnTableConfig = {
  heading: string;
  /** The column heads, in order. An empty string leaves one unlabelled. */
  columns: string[];
  /**
   * Each column's share of the width, index-aligned with `columns`; a
   * missing entry is 1.
   *
   * Two index-aligned arrays rather than an array of objects, because the
   * properties panel edits a list of strings and nothing else - a preset
   * states its own weights here, and a user editing the column names in
   * the panel never has to see them.
   */
  weights?: number[];
  /** A final row ruled off from the body, for a sum. */
  totalsRow?: boolean;
  /** Printed at the left of the totals row. */
  totalsLabel?: string;
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
// todoChecklist.ts for why this particular number and not another.
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
const COLUMN_HEAD_HEIGHT_PT = 18;
const COLUMN_HEAD_FONT_PT = 7;
/** One cell. A quarter inch, the same as a to-do row. */
const ROW_HEIGHT_PT = 18;
const RULE_WIDTH_PT = 0.35;
const CELL_PADDING_PT = 4;

export function getColumnTableRowMetricsPx() {
  return {
    headerHeightPx: ptToPx(HEADER_HEIGHT_PT),
    columnHeadHeightPx: ptToPx(COLUMN_HEAD_HEIGHT_PT),
    rowHeightPx: ptToPx(ROW_HEIGHT_PT),
  };
}

/** Header, column heads and one row to write in. */
export function getColumnTableMinHeightPx(): number {
  const m = getColumnTableRowMetricsPx();
  return m.headerHeightPx + m.columnHeadHeightPx + m.rowHeightPx;
}

export function renderColumnTable(
  geometry: { x: number; y: number; width: number; height: number },
  config: ColumnTableConfig,
  idPrefix: string,
  fontFamily: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic: a mark names its column and its row, so adding a row does
  // not renumber the columns' own dividers. See todoChecklist.ts.
  const id = (name: string) => `${idPrefix}-${name}`;

  const headerHeight = ptToPx(HEADER_HEIGHT_PT);
  const columnHeadHeight = ptToPx(COLUMN_HEAD_HEIGHT_PT);
  const rowHeight = ptToPx(ROW_HEIGHT_PT);
  const ruleWidth = ptToPx(RULE_WIDTH_PT);
  const padding = ptToPx(CELL_PADDING_PT);
  // Every renderer here is total in its config: a ModuleInstance whose
  // propValues lost a key - a row written before a schema gained one, a
  // preset that forgot it - draws a plain empty box rather than throwing,
  // because a throw inside a render takes the whole PAGE down, not one
  // module. Caught by check:behaviour, which renders every registered
  // module with no props at all.
  const heading = config.heading ?? "";
  const columns = (config.columns ?? []).length > 0 ? config.columns : [""];

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
    text: heading,
    fontSize: headerFontSize,
    fontFamily,
    fill: NEAR_BLACK,
    align: "center",
  });

  const headsTop = geometry.y + headerHeight;
  const bodyTop = headsTop + columnHeadHeight;
  const bodyBottom = geometry.y + geometry.height;

  // Column x positions, by weight. A weight of zero would collapse a
  // column to nothing and lose its divider, so every column gets at least
  // a nominal share.
  const weights = columns.map((_, c) => Math.max(0.0001, config.weights?.[c] ?? 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let x = geometry.x;
  const bounds = weights.map((w) => {
    const start = x;
    x += (geometry.width * w) / totalWeight;
    return { start, end: x };
  });

  // One size across every head: see fitLabelSet. Sized before the loop so
  // no column can pick its own.
  const headSizes = [ptToPx(COLUMN_HEAD_FONT_PT), ptToPx(6), ptToPx(5)];
  const heads = fitLabelSet(
    columns.map((name, c) => ({
      text: name,
      widthPx: bounds[c].end - bounds[c].start - padding * 2,
    })),
    headSizes
  );

  columns.forEach((name, c) => {
    const { start, end } = bounds[c];
    if (name) {
      // Shrunk, then cut. Nothing in the renderer clips a text node, so a
      // head wider than its column runs out of the module and over
      // whatever is beside it - which is exactly what "Amount" did in a
      // six-column spending log, printing across the module next to it.
      const headFontSize = heads.fontSizePx;
      elements.push({
        id: id(`c${c}-head`),
        type: "text",
        x: start + padding,
        y: headsTop + (columnHeadHeight - headFontSize * 1.2) / 2,
        width: end - start - padding * 2,
        height: headFontSize * 1.2,
        text: heads.texts[c],
        fontSize: headFontSize,
        fontFamily,
        fill: NEAR_BLACK,
        align: "left",
      });
    }
    // The divider to the LEFT of each column but the first: the box's own
    // border already closes the outside edges, and drawing a rule on top
    // of it doubles its weight - the same overlap that made the to-do's
    // bottom edge look like it alternated thick and thin.
    if (c > 0) {
      elements.push({
        id: id(`c${c}-divider`),
        type: "figure",
        subType: "rect",
        x: start - ruleWidth / 2,
        y: headsTop,
        width: ruleWidth,
        height: bodyBottom - headsTop,
        fill: NEAR_BLACK,
        stroke: "none",
      });
    }
  });

  // The rule under the column heads, which is what makes them read as
  // headings rather than as the first row.
  elements.push({
    id: id("heads-rule"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: bodyTop - ruleWidth / 2,
    width: geometry.width,
    height: ruleWidth,
    fill: NEAR_BLACK,
    stroke: "none",
  });

  const rowCount = Math.max(0, Math.floor((bodyBottom - bodyTop) / rowHeight + 1e-6));
  for (let r = 0; r < rowCount; r++) {
    const lineBottom = bodyTop + rowHeight * (r + 1);
    // The bottom border already draws the last line, and draws it better -
    // see todoChecklist.ts, where drawing both made the edge appear to
    // alternate thick and thin.
    if (Math.abs(lineBottom - bodyBottom) < 0.5) continue;

    const isTotalsRule = config.totalsRow && r === rowCount - 2;
    elements.push({
      id: id(`row${r}-rule`),
      type: "figure",
      subType: "rect",
      x: geometry.x,
      y: lineBottom - ruleWidth / 2,
      // A totals row is ruled OFF from the body rather than merely ruled:
      // the line above it is the full-weight one, which is how a sum reads
      // as separate from what it sums.
      width: geometry.width,
      height: isTotalsRule ? ruleWidth * 2 : ruleWidth,
      fill: NEAR_BLACK,
      stroke: "none",
      opacity: isTotalsRule ? 1 : 0.6,
    });
  }

  if (config.totalsRow && rowCount >= 2 && config.totalsLabel) {
    const totals = fitLabel(
      config.totalsLabel,
      bounds[0].end - bounds[0].start - padding * 2,
      [ptToPx(COLUMN_HEAD_FONT_PT), ptToPx(6), ptToPx(5)]
    );
    const labelFontSize = totals.fontSizePx;
    elements.push({
      id: id("totals-label"),
      type: "text",
      x: geometry.x + padding,
      y: bodyTop + rowHeight * (rowCount - 1) + (rowHeight - labelFontSize * 1.2) / 2,
      width: bounds[0].end - bounds[0].start - padding * 2,
      height: labelFontSize * 1.2,
      text: totals.text,
      fontSize: labelFontSize,
      fontFamily,
      fill: NEAR_BLACK,
      align: "left",
    });
  }

  return elements;
}
