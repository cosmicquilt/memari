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
import { columnWidthsForLabels, fitLabel, fitLabelSet } from "@/lib/modules/textFit";
import {
  HEADER_HEIGHT_PT,
  NEAR_BLACK,
  RULE_WIDTH_PT,
  borderElement,
  contentTopPx,
  headerElements,
  rowHeightPx,
  type FrameLattice,
} from "@/lib/modules/moduleFrame";

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

// The header band, the column-head band and the row height all come from
// moduleFrame now, so every module agrees about them - see that file's
// contentTopPx for the lattice-alignment trade-off they encode.
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
const CELL_PADDING_PT = 4;

export function getColumnTableRowMetricsPx() {
  return {
    headerHeightPx: ptToPx(HEADER_HEIGHT_PT),
    columnHeadHeightPx: ptToPx(COLUMN_HEAD_HEIGHT_PT),
    rowHeightPx: rowHeightPx(),
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
  fontFamily: string,
  lattice?: FrameLattice
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic: a mark names its column and its row, so adding a row does
  // not renumber the columns' own dividers. See todoChecklist.ts.
  const id = (name: string) => `${idPrefix}-${name}`;

  const headsTop = contentTopPx(geometry, lattice);
  const columnHeadHeight = ptToPx(COLUMN_HEAD_HEIGHT_PT);
  const rowHeight = rowHeightPx(lattice);
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

  elements.push(borderElement(geometry, id));
  elements.push(...headerElements(geometry, heading, id, fontFamily, headsTop));

  const bodyTop = headsTop + columnHeadHeight;
  const bodyBottom = geometry.y + geometry.height;

  // Column x positions, by weight. A weight of zero would collapse a
  // column to nothing and lose its divider, so every column gets at least
  // a nominal share.
  const weights = columns.map((_, c) => Math.max(0.0001, config.weights?.[c] ?? 1));

  // The widths come from the WORDS as well as the weights: a column is
  // never narrower than its own head, and only what is left over is
  // divided in proportion. See columnWidthsForLabels - previously this
  // divided strictly by weight and the head had to shrink and then be cut
  // to fit whatever it was given, while the column beside it had room to
  // spare.
  //
  // The first column also has to hold the totals label, which is a
  // different and often longer word than its head ("Date" against
  // "Total"), and sizing it for the head alone is what printed "Tot…".
  const headSizes = [ptToPx(COLUMN_HEAD_FONT_PT), ptToPx(6), ptToPx(5)];
  const claims = columns.map((name, c) =>
    c === 0 && config.totalsRow && config.totalsLabel
      ? (name.length >= config.totalsLabel.length ? name : config.totalsLabel)
      : name
  );
  const layout = columnWidthsForLabels({
    labels: claims,
    weights,
    totalWidthPx: geometry.width,
    paddingPx: padding,
    sizesPx: headSizes,
  });
  let x = geometry.x;
  const bounds = layout.widths.map((width) => {
    const start = x;
    x += width;
    return { start, end: x };
  });

  // One size across every head: see fitLabelSet. The size is already
  // settled by the width allocation above; this is the last-resort cut for
  // a box too narrow to hold its own words at any size.
  // The inset the heads were MEASURED against, which is the one they have
  // to be drawn at - see columnWidthsForLabels, which tightens it rather
  // than cut a word. Body cells keep the full padding; only the head row
  // and the totals label move.
  const headPadding = layout.paddingPx;
  // Measured against the ALLOCATED width, not against `end - start`.
  //
  // A column the allocator had to widen is given exactly what its head
  // needs, so the comparison is an equality - and `bounds` is a running
  // sum, so `end - start` comes back a fraction of a float short and the
  // head is cut by a millionth of a pixel. That is how "Category" became
  // "Catego…" in a table that had been sized precisely to hold it.
  const heads = fitLabelSet(
    columns.map((name, c) => ({
      text: name,
      widthPx: layout.widths[c] - headPadding * 2,
    })),
    [layout.fontSizePx]
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
        x: start + headPadding,
        y: headsTop + (columnHeadHeight - headFontSize * 1.2) / 2,
        width: end - start - headPadding * 2,
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

    // The heavy rule goes above the LAST band, because that is where the
    // totals row is. It read `rowCount - 2`, which put the sum in the
    // second-to-last row and left a 69px strip of empty table underneath
    // it - a total that is not the bottom line of its own table. rowCount
    // is a floor, so there is always a short final band after the last
    // whole row (the 6px inset debt, see moduleFrame's contentTopPx); that
    // band is the totals row.
    const isTotalsRule = config.totalsRow && r === rowCount - 1;
    // A totals row is ruled OFF from the body rather than merely ruled:
    // the line above it is the full-weight one, which is how a sum reads as
    // separate from what it sums.
    const thickness = isTotalsRule ? ruleWidth * 2 : ruleWidth;
    elements.push({
      id: id(`row${r}-rule`),
      type: "figure",
      subType: "rect",
      x: geometry.x,
      // Centred on the row line, from ITS OWN thickness. This read
      // `lineBottom - ruleWidth / 2` while the height doubled beside it, so
      // the heavier rule grew downward from where a thin one would start
      // and its centre sat half a hairline - 0.6px - below the lattice.
      // Small enough to look like nothing and be a misprint, and the pitch
      // test caught it as 240 uneven gaps.
      y: lineBottom - thickness / 2,
      width: geometry.width,
      height: thickness,
      fill: NEAR_BLACK,
      stroke: "none",
      opacity: isTotalsRule ? 1 : 0.6,
    });
  }

  if (config.totalsRow && rowCount >= 1 && config.totalsLabel) {
    const totalsTop = bodyTop + rowHeight * rowCount;
    const totalsHeight = bodyBottom - totalsTop;
    // At the size the heads settled on - the first column was widened to
    // hold this word, so it fits, and a totals row set larger or smaller
    // than the heads above it reads as a different table.
    const totals = fitLabel(
      config.totalsLabel,
      layout.widths[0] - headPadding * 2,
      [layout.fontSizePx]
    );
    const labelFontSize = totals.fontSizePx;
    elements.push({
      id: id("totals-label"),
      type: "text",
      x: geometry.x + headPadding,
      y: totalsTop + (totalsHeight - labelFontSize * 1.2) / 2,
      width: bounds[0].end - bounds[0].start - headPadding * 2,
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
