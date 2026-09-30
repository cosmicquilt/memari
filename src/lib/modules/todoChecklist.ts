// "TO-DO" checklist block, matching the reference's full-height variant
// (pages 10/11, 14/15 — both sides get one when there's no habit tracker
// on that page) and short variant (page 24, sharing space with a habit
// tracker). Same renderer either way — row count is however many fit in
// whatever height it's given, not hardcoded, so "full height" and
// "short, paired with habit-tracker" are just different allocations.
//
// A third variant — dayCount: 1 — is what a sidebar (single-grid-column)
// placement uses, once dragging a to-do checklist into the side zone
// became possible: this needed no actual renderer change, since a single
// day-column IS just this same loop run once, naturally filling the
// narrower allocated width with one checkbox+line segment per row
// instead of several side by side. See actions.ts's addPaletteModuleAt
// and NativePlannerEditor.tsx's handleDragMove for where dayCount gets
// set to 1 for that placement.
//
// Measured from hourlyjournal.pdf (page 10, get_drawings()): one
// checkbox+line segment per day-column, same width/pitch as the hourly
// grid's own day columns and reusing its exact 14.1pt checkbox width.

import { ptToPx } from "@/lib/print-spec";
import {
  RULE_WIDTH_PT, contentTopPx, fitHeading, truncateHeading,
  HEADER_HEIGHT_PT as FRAME_HEADER_HEIGHT_PT,
  type FrameLattice } from "@/lib/modules/moduleFrame";
import { capCentredTextY, fitLabel } from "@/lib/modules/textFit";
import { rowMarkerElement } from "./latticeFill";
import { glyphElement } from "./glyphs";

export type TodoChecklistConfig = {
  dayCount: number; // matches the hourly-grid-core above it (3 or 4), or 1 in the sidebar
  /**
   * Printed in the header band. Defaults to "TO - DO".
   *
   * It was that string, fixed, which was fine while this drew one module.
   * Fourteen catalogue modules are a checklist with different words above
   * it - a grocery list, a packing list, a prayer list, Ivy Lee's six -
   * and a preset that cannot change its own name is not a preset.
   */
  heading?: string;
  /**
   * How the rows are marked. "lined" (the default, and everything stored
   * before this existed) rules every row and column right across. "crosses"
   * marks the same lattice without drawing it: a small + where a column line
   * meets a row, a short dash at each dot between, and a tick where a column
   * line meets the header rule or the bottom border. Asked for 2026-09-29
   * from a reference page, "in our style and sizing" - so the marks sit on
   * this module's own lattice points at its own rule weight.
   */
  lineStyle?: "lined" | "crosses";
  /**
   * Printed on the rows, top down; blank rows follow. A packing list or a
   * stretch routine is the same checklist every time, and a to-do could
   * only print blank rows - the catalogue pass found it "had nowhere to put
   * a suggestion". Under the hours each day column prints the same list.
   */
  items?: string[];
  /** A number at the start of every row, for a list whose order matters. */
  numbered?: boolean;
  /** What you tick: the ruled column (the default), or a square or circle -
   *  symbols from glyphs.ts, which a bigger set will join. */
  tickMark?: "column" | "square" | "circle";
};

/** A to-do's printed items: the non-blank ones, as they will print. */
export function todoItems(config: { items?: unknown }): string[] {
  return (Array.isArray(config.items) ? config.items : [])
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

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
// A printed item sets at the row's own size, shrinking a point at a time
// before it is cut - the table's ladder for a cell.
const ITEM_SIZES_PT = [7.5, 7, 6.5, 6];
// The header band the renderer actually draws.
//
// Taken from moduleFrame rather than restated, because the renderers here
// do not use a constant at all - they call contentTopPx, which lands the
// band on the next lattice line down (pitch 75 less the box inset 6 = 69)
// and falls back to exactly this constant when there is no lattice.
//
// This file used to keep its own 15.12pt, i.e. 63px, described as "one dot
// pitch less the box inset at BOTH ends". That double-counted the inset:
// the band starts at the ink box's own top, which is already inset once.
// The number was six pixels short of the drawing and only ever reached the
// minimum-height rule, where six pixels is a whole row - so every named
// tracker's floor came out one row below what its rows actually need, and
// the last row was silently dropped at the minimum. See
// minRowSpanFloors.test.mts.
// The heading is set by the house rule, fitHeading - 8pt, shrinking to 7,
// 6 and 5 as a renamed list's heading gets longer. It was a fixed 8pt (after
// "make the to-do and habit headers 8pt too" brought it down from 12), which
// was right for "TO - DO" and printed a long name straight past the border.
const HEADER_BORDER_WIDTH_PT = 0.5;
// One row is one dot: 18pt, 75 print px, a quarter inch. With the header
// above taking a dot less the two insets, the height left over is exactly
// (rowSpan - 1) dots, so rows tile the box perfectly at every size with
// nothing left over — which is the whole point.
//
// Two earlier attempts both failed on the leftover rather than the pitch.
// Stretching the pitch to swallow it made row height depend on box height
// (71.7px in a short box against 56.7px in a tall one, so two to-dos on
// one page did not match). Fixing the pitch at the measured 13.45pt left a
// remainder that had to go somewhere: below the last line it drew a thin
// abandoned strip, and inside the last row it made that row up to twice
// the others. Neither is acceptable, and neither is fixable while the
// pitch fails to divide the cell — 56.25px simply does not go into 75.
//
// The cost is density. The reference measures 13.45pt, so rows are now a
// third taller and a full-height to-do holds 14 rows where it held 18.
const ROW_HEIGHT_PT = 18;
// The house interior rule weight - see moduleFrame's RULE_WIDTH_PT.
const ROW_LINE_WIDTH_PT = RULE_WIDTH_PT;
// One dot wide, which makes each checkbox exactly square now that a row is
// one dot tall. Was 14.1pt, borrowed from hourlyGridCore's time-label box
// back when a row was 13.45pt and the two were near enough to each other
// that the difference did not read; at an 18pt row it would have drawn a
// visibly wide rectangle instead.
const CHECKBOX_WIDTH_PT = 18;
const COLUMN_GUTTER_PT = 4.5; // same convention as hourlyGridCore

// Exposes just the height constants NativePlannerEditor.tsx needs to
// compute this module type's own minimum resize height ("title and one
// row below," requested directly) without a server round trip — same
// constants the real renderer above already uses, not a guessed row
// count. There used to be a caveat here that this was only the nominal
// height and the renderer stretched it to fill the box exactly. That
// stretch is gone — the pitch is fixed — so this is now the real row
// height the renderer uses, and the two can no longer disagree.
export function getTodoChecklistRowMetricsPx(): {
  headerHeightPx: number;
  nominalRowHeightPx: number;
  rowLineWidthPx: number;
} {
  return {
    headerHeightPx: ptToPx(FRAME_HEADER_HEIGHT_PT),
    nominalRowHeightPx: ptToPx(ROW_HEIGHT_PT),
    rowLineWidthPx: ptToPx(ROW_LINE_WIDTH_PT),
  };
}

export function renderTodoChecklist(
  geometry: { x: number; y: number; width: number; height: number },
  config: TodoChecklistConfig,
  idPrefix: string,
  fontFamily: string,
  lattice?: FrameLattice
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic, not positional. An id names one mark for the whole life of
  // the module, so adding a row at the bottom leaves every other mark's
  // id untouched. Positional ids renumbered everything after the
  // insertion point, which made the renderer treat the whole drawing as
  // new: it remounted every node and replayed the arrival fade, so a
  // resize flickered at each snap step as rows came and went.
  const id = (name: string) => `${idPrefix}-${name}`;
  const FONT_FAMILY = fontFamily;

  // Renders flush with its own allocated cell (contentY === geometry.y)
  // — this used to push its content down by a fixed 18.5pt to match the
  // reference PDF's gap below the hourly grid, back when this block was
  // always auto-placed directly beneath one. Now that it's a freely
  // user-placed module (drag/drop, any position), that assumption no
  // longer holds — baking in a gap meant for one specific relative
  // position would leave dead space at the top everywhere else instead.
  // Any desired gap now comes from the grid position itself (rowStart),
  // same as every other freely-placed module.
  const contentY = geometry.y;
  const contentHeight = geometry.height;
  // The header band ends on the first LATTICE line, not one cell less the
  // box inset at both ends.
  //
  // 63px tiled the rest of the box perfectly - uniform rows, last rule
  // exactly on the border - at the cost of starting the content 6px above
  // a dot row, so every row line in the module sat 6px off the dots.
  // Reported as "todo on proof also not aligned", after the same thing was
  // fixed in the new modules. See moduleFrame's contentTopPx for the full
  // trade: the 6px moves to the LAST band, which comes out 69px against
  // 75, and the to-do holds one row fewer at each height as a result.
  const headerBottom = contentTopPx({ ...geometry, y: contentY }, lattice);

  const headerHeight = headerBottom - contentY;
  const nominalRowHeight = ptToPx(ROW_HEIGHT_PT);
  const rowLineWidth = ptToPx(ROW_LINE_WIDTH_PT);
  const checkboxWidth = ptToPx(CHECKBOX_WIDTH_PT);
  const columnGutter = ptToPx(COLUMN_GUTTER_PT);
  // Day columns measured from the ALLOCATION, not from the ink box - the
  // same move hourlyGridCore makes, and for the same reason.
  //
  // Dividing the ink box by the day count put every vertical line off the
  // lattice and drifting: measured at 6.0, 8.3 and 10.5px from the nearest
  // dot column across three days, because the box is inset 6px inside its
  // allocation and its width is not a whole number of cells. Reported as
  // "the vertical lines within the todo dont line up with the dots".
  //
  // The allocation IS a whole number of cells, so a day is too: 18 columns
  // over 3 days is 450px, exactly 6 cells. Every day boundary then lands
  // on a dot column, and so does every checkbox divider, since a checkbox
  // is one cell wide.
  const allocationX = lattice ? geometry.x - lattice.insetPx : geometry.x;
  const allocationWidth = lattice ? geometry.width + lattice.insetPx * 2 : geometry.width;
  const dayAllocationWidth = allocationWidth / config.dayCount;
  const segmentWidth = lattice
    ? dayAllocationWidth - columnGutter
    : (geometry.width - columnGutter * (config.dayCount - 1)) / config.dayCount;

  const gridHeight = contentHeight - headerHeight;
  // A hair of slack before flooring, so a height that divides exactly
  // yields the row it has room for rather than losing it to a float
  // remainder — same reason pixelsToGridCell rounds the way it does.
  const rowCount = Math.max(0, Math.floor(gridHeight / nominalRowHeight + 1e-6));

  // The pitch is fixed, and because it divides the available height
  // exactly there is no remainder to place anywhere. Growing the box
  // therefore leaves every existing row line precisely where it was and
  // adds new ones below the old bottom edge, where the clip window can
  // simply uncover them without any of them having to move.
  //
  // This used to stretch the pitch instead — rowHeight = gridHeight /
  // rowCount — and the comment here claimed that was a sub-pixel
  // correction. It was not. The remainder was spread across every row, so
  // row i shifted by i/rowCount of it and the lowest rows moved by most of
  // a row height. `npm run check:behaviour` measured a vertical resize
  // moving 102 marks and keeping 3, which is why the animation had nothing
  // stable to hold on to.
  const rowHeight = nominalRowHeight;

  // Outer border around the whole block — reaches the full allocated
  // height exactly (see rowHeight comment above).
  elements.push({
    id: id("border"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: contentY,
    width: geometry.width,
    height: contentHeight,
    fill: "transparent",
    stroke: NEAR_BLACK,
    strokeWidth: ptToPx(HEADER_BORDER_WIDTH_PT),
  });

  // "TO - DO" header, centered across the full width. Manually centered
  // vertically rather than relying on verticalAlign, which hasn't
  // reliably centered text elsewhere in this codebase.
  // Inside the same 8pt side padding as every other module's heading, which
  // is also the width fitHeading - and so the editor's letter limit - uses.
  const headingPadding = ptToPx(8);
  const headingWidth = geometry.width - headingPadding * 2;
  const headingText = (config.heading ?? "TO - DO").toUpperCase();
  const { fontSizePx: headerFontSize, fits: headingFits } = fitHeading(headingText, headingWidth, FONT_FAMILY);
  const headerTextHeight = headerFontSize * 1.2;
  elements.push({
    id: id("heading"),
    type: "text",
    x: geometry.x + headingPadding,
    y: capCentredTextY(contentY, headerHeight, headerFontSize, FONT_FAMILY),
    width: headingWidth,
    height: headerTextHeight,
    text: headingFits ? headingText : truncateHeading(headingText, headingWidth, headerFontSize, FONT_FAMILY),
    fontSize: headerFontSize,
    fontFamily: FONT_FAMILY,
    align: "center",
  });

  // Divider between the header band and the checklist grid.
  elements.push({
    id: id("header-rule"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: contentY + headerHeight - rowLineWidth / 2,
    width: geometry.width,
    height: rowLineWidth,
    fill: NEAR_BLACK,
    stroke: "none",
  });

  const gridTop = contentY + headerHeight;
  const gridBottom = gridTop + gridHeight;

  // CROSSES: every mark is centred on a lattice point, so each is sized from
  // the pitch - a quarter cell each way for a cross arm and a tick, half a
  // cell for a dash. One description of the mark, used for all of them.
  const crosses = config.lineStyle === "crosses";
  const arm = checkboxWidth / 4;
  const mark = (name: string, x: number, y: number, width: number, height: number) =>
    elements.push({
      id: id(name),
      type: "figure",
      subType: "rect",
      x,
      y,
      width,
      height,
      fill: NEAR_BLACK,
      stroke: "none",
      opacity: 0.6,
    });
  /** A vertical stroke of the given length centred on x. */
  const vertical = (name: string, x: number, top: number, length: number) =>
    mark(name, x - rowLineWidth / 2, top, rowLineWidth, length);
  /** A horizontal stroke centred on (x, y). */
  const horizontal = (name: string, x: number, y: number, halfLength: number) =>
    mark(name, x - halfLength, y - rowLineWidth / 2, halfLength * 2, rowLineWidth);

  // Per-day-column checkbox+line segments, repeated for each row.
  for (let d = 0; d < config.dayCount; d++) {
    // On the dot column itself. hourlyGridCore centres its GUTTER on the
    // shared line instead, because there a day boundary is a gap; here it
    // is a drawn rule, and a drawn rule belongs on the dot.
    const segX = lattice
      ? allocationX + d * dayAllocationWidth
      : geometry.x + d * (segmentWidth + columnGutter);
    // The first day's boundary is the ALLOCATION's left edge, 6px outside
    // the ink box, so anything drawn across the segment has to start at
    // the border instead or it hangs off the side of the module. Only the
    // rules that span the segment need this; the checkbox divider is a
    // whole cell in and always lands inside.
    const inkX = Math.max(segX, geometry.x);
    const inkWidth = segmentWidth - (inkX - segX);

    // Left edge of the checkbox column - for every day but the FIRST,
    // whose left edge is the box's own border. The border is on the ink
    // box and the day boundary is on the allocation, 6px apart, so drawing
    // both put a second line just outside the border. (It was measured
    // 0.7px outside the box even before this change, when the two were
    // drawn at the same place.)
    // The column lines this day has, where a line is DRAWN rather than being
    // the box's own border.
    const columnLines = [
      ...(d > 0 || !lattice ? [{ name: "checkbox-left", x: segX }] : []),
      // No tick column's edge when the mark is a symbol instead.
      ...(config.tickMark === "square" || config.tickMark === "circle" ? [] : [{ name: "checkbox-right", x: segX + checkboxWidth }]),
    ];

    // What each row starts with: its number, then its printed item. In the
    // row's own band, after the tick column - every band, including the
    // short one at the foot, which is a row you write on like the others.
    const items = todoItems(config);
    if (items.length > 0 || config.numbered) {
      const bands = rowCount + (gridHeight - rowCount * rowHeight > rowHeight / 4 ? 1 : 0);
      const writeX = segX + checkboxWidth + ptToPx(2.5);
      const writeWidth = segX + segmentWidth - writeX - ptToPx(2.5);
      const numberWidth = config.numbered ? ptToPx(9) : 0;
      for (let i = 0; i < bands; i++) {
        const bandTop = gridTop + i * rowHeight;
        const bandHeight = Math.min(rowHeight, gridTop + gridHeight - bandTop);
        if (config.numbered) {
          const number = rowMarkerElement({
            marker: "numbers",
            number: i + 1,
            id: id(`d${d}-row${i}-number`),
            x: writeX,
            bandTop,
            bandHeight,
            fontFamily: FONT_FAMILY,
            textY: capCentredTextY,
          });
          if (number) elements.push(number);
        }
        const item = items[i];
        if (!item) continue;
        const fitted = fitLabel(item, writeWidth - numberWidth, ITEM_SIZES_PT.map(ptToPx));
        elements.push({
          id: id(`d${d}-row${i}-item`),
          type: "text",
          x: writeX + numberWidth,
          y: capCentredTextY(bandTop, bandHeight, fitted.fontSizePx, FONT_FAMILY),
          width: writeWidth - numberWidth,
          height: fitted.fontSizePx * 1.2,
          text: fitted.text,
          fontSize: fitted.fontSizePx,
          fontFamily: FONT_FAMILY,
          fill: NEAR_BLACK,
          align: "left",
          opacity: 0.85,
        });
      }
    }

    // THE TICK MARK: the ruled column (the default), or a square or a circle
    // in the same cell, drawn from the icon strip's own symbols so a larger
    // set can join them - "circle can be a place holder for now"
    // (2026-09-30). The row lines stay whichever.
    const tickMark = config.tickMark === "square" || config.tickMark === "circle" ? config.tickMark : "column";
    if (tickMark !== "column") {
      const bands = rowCount + (gridHeight - rowCount * rowHeight > rowHeight / 4 ? 1 : 0);
      const size = Math.min(checkboxWidth, rowHeight) * 0.42;
      for (let i = 0; i < bands; i++) {
        const bandTop = gridTop + i * rowHeight;
        const bandHeight = Math.min(rowHeight, gridTop + gridHeight - bandTop);
        elements.push(
          glyphElement({
            id: id(`d${d}-row${i}-tick`),
            // Centred in the cell as drawn: the first day's starts at the border.
            x: (Math.max(segX, geometry.x) + segX + checkboxWidth) / 2 - size / 2,
            y: bandTop + bandHeight / 2 - size / 2,
            sizePx: size,
            shape: tickMark,
            opacity: 0.8,
          })
        );
      }
    }

    if (crosses) {
      // Ticks where each column line meets the header rule and the border.
      for (const line of columnLines) {
        vertical(`d${d}-${line.name}-top`, line.x, gridTop, arm);
        vertical(`d${d}-${line.name}-bottom`, line.x, gridBottom - arm, arm);
      }
      for (let i = 0; i < rowCount; i++) {
        const y = gridTop + (i + 1) * rowHeight;
        // Not on the bottom border, which is already a line - as below.
        if (Math.abs(y - gridBottom) < 0.5) continue;
        for (const line of columnLines) {
          horizontal(`d${d}-row${i}-${line.name}-h`, line.x, y, arm);
          vertical(`d${d}-row${i}-${line.name}-v`, line.x, y - arm, arm * 2);
        }
        // The first day's left edge IS the box's border, so its cross is the
        // half that falls inside: a tick in from the border.
        if (d === 0 && lattice) mark(`d0-row${i}-edge`, geometry.x, y - rowLineWidth / 2, arm, rowLineWidth);
        // A dash at each dot across the writing space, stopping a whole arm
        // short of the day's end so none reaches the next day or the border.
        for (let k = 2; segX + k * checkboxWidth + arm <= segX + segmentWidth + 0.5; k++) {
          horizontal(`d${d}-row${i}-dash${k}`, segX + k * checkboxWidth, y, arm);
        }
      }
      continue;
    }

    if (d > 0 || !lattice) elements.push({
      id: id(`d${d}-checkbox-left`),
      type: "figure",
      subType: "rect",
      x: segX - rowLineWidth / 2,
      y: gridTop,
      width: rowLineWidth,
      // Down to the border, not just to the last row line: with a fixed
      // pitch those are no longer the same place, and stopping short would
      // leave the checkbox column hanging above the bottom edge.
      height: gridHeight,
      fill: NEAR_BLACK,
      stroke: "none",
    });

    // Vertical divider between checkbox and task line - the tick column,
    // unless the mark is a symbol.
    if (config.tickMark !== "square" && config.tickMark !== "circle") elements.push({
      id: id(`d${d}-checkbox-right`),
      type: "figure",
      subType: "rect",
      x: segX + checkboxWidth - rowLineWidth / 2,
      y: gridTop,
      width: rowLineWidth,
      // Down to the border, not just to the last row line: with a fixed
      // pitch those are no longer the same place, and stopping short would
      // leave the checkbox column hanging above the bottom edge.
      height: gridHeight,
      fill: NEAR_BLACK,
      stroke: "none",
    });

    for (let i = 0; i < rowCount; i++) {
      // Every row is exactly one pitch. The last one is NOT pinned to the
      // bottom border.
      //
      // It used to be, as a safeguard, and the comment here said so: "under
      // the current geometry these are the same place - the pitch divides
      // gridHeight exactly - so this changes nothing today. It is here so
      // that if the header height, the box inset or the cell pitch is ever
      // changed such that they no longer divide, the block still fills its
      // box." The header height then changed, exactly as anticipated, and
      // the safeguard turned out to be the failure mode rather than the
      // protection: the last row absorbed the whole 69px remainder on top
      // of its own 75, coming out at 144 - nearly twice its neighbours.
      // Reported as "the bottom rows of the todos are too tall", which is
      // the same defect, in the same words, as the two before it.
      //
      // A short final band is the trade the lattice alignment buys (see
      // moduleFrame's contentTopPx); a DOUBLE final row is nobody's trade.
      const rowBottom = gridTop + (i + 1) * rowHeight;
      // The bottom border already draws this line, and draws it better: it
      // is 0.5pt with its outer edge flush to the box, where a row
      // separator is a 0.35pt fill centred on its own position. Drawing
      // both put a lighter, thinner, half-overhanging line across part of
      // the border — reported as the bottom edge appearing to alternate
      // thick and thin along its length, because the separator only spans
      // each column and the gutters between them showed the border alone.
      if (Math.abs(rowBottom - (gridTop + gridHeight)) < 0.5) continue;
      // Row line under both the checkbox and task-line cells.
      elements.push({
        id: id(`d${d}-row${i}`),
        type: "figure",
        subType: "rect",
        x: inkX,
        y: rowBottom - rowLineWidth / 2,
        width: inkWidth,
        height: rowLineWidth,
        fill: NEAR_BLACK,
        stroke: "none",
        opacity: 0.6,
      });
    }
  }

  return elements;
}
