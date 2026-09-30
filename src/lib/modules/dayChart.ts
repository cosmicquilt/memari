// A chart of something across the days: mood, energy, sleep, pain - whatever
// the levels say - with the days of a week or a month along the bottom.
//
// Asked for 2026-09-30: "a chart where the bottom is either the week or the
// month days and the y axis can be mood or other things", in our style, in
// several looks to choose between. It is printed empty and filled in by hand,
// so each look is a way of being filled in:
//
//   dots     a dot where every day meets every level - join them into a line
//   ruled    a rule under each level - plot a point in its band, join them
//   bars     a column of boxes for each day - shade it up to the level
//   circles  a circle where every day meets every level - colour in one a day
//
// THE LEVELS ARE LATTICE ROWS. Each is one cell, top-anchored under the
// header, with the day names in one more cell beneath - rows of one cell for
// the reason every module's are (see ratingStrip.ts): the pitch has to divide
// the cell, or every resize moves every mark. A level's label and its marks
// are centred in its band, so the ruled look's rules sit on the lattice rows
// between the bands and the others' marks clearly between them.
//
// THE DAYS DIVIDE THE PLOT, as a to-do's or a habit tracker's do - seven or
// thirty-one do not divide twenty-four cells. But the level labels' column is
// chosen, within a couple of cells of what the labels need, so that the days
// come out a whole number of cells where they can: a week across a page is
// three cells a day, across three-quarters of one two. Then every boundary is
// a lattice column. Where no such width is near, the days share the plot
// evenly. No rule is drawn down a day boundary, so either way the only
// vertical rule is the axis, which is always on a lattice column - and
// moduleHouseStyle holds it to that, with no exemption.

import { ptToPx } from "@/lib/print-spec";
import { glyphElement } from "@/lib/modules/glyphs";
import { capCentredTextY, estimateTextWidthPx, fitLabelSet } from "@/lib/modules/textFit";
import {
  HEADER_HEIGHT_PT,
  NEAR_BLACK,
  RULE_WIDTH_PT,
  borderElement,
  contentTopPx,
  headerElements,
  rowHeightPx,
  type FrameElement,
  type FrameGeometry,
  type FrameLattice,
} from "@/lib/modules/moduleFrame";
import { weekdayInitials, weekdayShortNames } from "@/lib/weekDays";

export type DayChartLook = "dots" | "ruled" | "bars" | "circles";
export const DAY_CHART_LOOKS: readonly DayChartLook[] = ["dots", "ruled", "bars", "circles"];

export type DayChartConfig = {
  heading?: string;
  /** The seven days of a week, or the days of a month. */
  span?: "week" | "month";
  /** The y axis, TOP DOWN - the highest level first, as it is read. Blank
   *  strings are levels left for the writer to name. */
  levels?: string[];
  look?: DayChartLook;
  /** Set at render time from the journal - see the registry's weekStart. */
  weekStartDay?: number;
  /** Days in the month this page is printed for, set by the dated hook;
   *  unset (31) on a template or an undated planner. */
  monthDays?: number | null;
};

export const DEFAULT_DAY_CHART_LEVELS = ["Great", "Good", "Okay", "Low", "Awful"];

const LEVEL_FONT_PT = [7, 6, 5];
const DAY_FONT_PT = [6.5, 6, 5];
const LABEL_PAD_PT = 4;
/** A plotted dot: big enough to read as the chart's own, not the lattice's. */
const DOT_PT = 1.9;

export function dayChartLevels(config: DayChartConfig): string[] {
  const levels = Array.isArray(config.levels) ? config.levels.map((level) => (typeof level === "string" ? level.trim() : "")) : [];
  return levels.length > 0 ? levels : DEFAULT_DAY_CHART_LEVELS;
}

export function dayChartDayCount(config: DayChartConfig): number {
  if (config.span !== "month") return 7;
  const days = Math.round(Number(config.monthDays));
  return days >= 28 && days <= 31 ? days : 31;
}

/** The header, a cell per level and a cell of day names - in the box's own
 *  pixels, which end one inset short of the last cell. */
export function getDayChartMinHeightPx(config: DayChartConfig, insetPx: number): number {
  return ptToPx(HEADER_HEIGHT_PT) + (dayChartLevels(config).length + 1) * rowHeightPx() - insetPx;
}

/**
 * How many cells the level labels take, and so where the plot starts.
 *
 * Tried in half cells from what the labels need at their SMALLEST size to
 * two cells past what they need at their largest, taking the first that
 * makes each day a whole number of cells, else a whole number of half cells,
 * nearest the labels' own largest size - and failing both, just that size,
 * with the days sharing what is left. A smaller label is worth a lattice:
 * a week across half a page gets its labels at 6pt and exactly a cell and a
 * half a day, where 7pt labels left it 1.4 and off every line.
 */
export function dayChartLabelCells(
  allocationCells: number,
  needed: { largest: number; smallest: number },
  days: number
): { cells: number; onLattice: boolean } {
  const halfUp = (cells: number) => Math.max(1, Math.ceil(cells * 2 - 1e-9) / 2);
  const ideal = halfUp(needed.largest);
  const multiple = (value: number, step: number) => Math.abs(value / step - Math.round(value / step)) < 1e-9;
  let best = { cells: ideal, grade: 0 };
  for (let cells = halfUp(needed.smallest); cells <= ideal + 2; cells += 0.5) {
    const perDay = (allocationCells - cells) / days;
    if (perDay <= 0) break;
    const grade = multiple(perDay, 1) ? 2 : multiple(perDay, 0.5) ? 1 : 0;
    const nearer = Math.abs(cells - ideal) < Math.abs(best.cells - ideal);
    if (grade > best.grade || (grade > 0 && grade === best.grade && nearer)) best = { cells, grade };
  }
  return { cells: best.cells, onLattice: best.grade > 0 };
}

export function renderDayChart(
  geometry: FrameGeometry,
  config: DayChartConfig,
  idPrefix: string,
  fontFamily: string,
  lattice?: FrameLattice
): FrameElement[] {
  const elements: FrameElement[] = [];
  // Semantic: a mark names its day and its level, so a resize slides "day 3,
  // level 2" rather than replacing it. See todoChecklist.ts.
  const id = (name: string) => `${idPrefix}-${name}`;

  const pitch = rowHeightPx(lattice);
  const inset = lattice?.insetPx ?? 0;
  const ruleWidth = ptToPx(RULE_WIDTH_PT);
  const pad = ptToPx(LABEL_PAD_PT);
  const look: DayChartLook = DAY_CHART_LOOKS.includes(config.look as DayChartLook) ? (config.look as DayChartLook) : "dots";
  const levels = dayChartLevels(config);
  const days = dayChartDayCount(config);

  elements.push(borderElement(geometry, id));
  const top = contentTopPx(geometry, lattice);
  elements.push(...headerElements(geometry, config.heading ?? "", id, fontFamily, top));

  // Measured in the ALLOCATION frame, which is a whole number of cells - the
  // box is 6px inside it on every side. See moduleHouseStyle's note.
  const allocationLeft = geometry.x - inset;
  const allocationCells = Math.max(1, Math.round((geometry.width + inset * 2) / pitch));
  const boxRight = geometry.x + geometry.width;
  const boxBottom = geometry.y + geometry.height;

  // The levels that fit, from the top: a box too short for all of them draws
  // the ones it has room for, exactly where they were.
  const shown = Math.max(0, Math.min(levels.length, Math.floor((boxBottom - top - pitch + inset + 0.5) / pitch)));
  const plotTop = top;
  const plotBottom = top + shown * pitch;
  const bandCentre = (i: number) => plotTop + (i + 0.5) * pitch;

  // The level labels' column - see dayChartLabelCells.
  const levelSizes = LEVEL_FONT_PT.map(ptToPx);
  const needs = (size: number) =>
    (Math.max(0, ...levels.map((level) => estimateTextWidthPx(level, size))) + pad * 2 + inset) / pitch;
  const labelColumn = dayChartLabelCells(
    allocationCells,
    { largest: needs(levelSizes[0]), smallest: needs(levelSizes[levelSizes.length - 1]) },
    days
  );
  const plotLeft = allocationLeft + labelColumn.cells * pitch;
  // Days on the lattice run to the allocation's edge, where the last
  // boundary is a lattice column (the border stands in for it, 6px inside,
  // as the to-do's does). Days that cannot be on it anyway stop short of the
  // border instead, so the last one does not crowd it.
  const plotRight = labelColumn.onLattice ? allocationLeft + allocationCells * pitch : boxRight - pad / 2;
  const dayWidth = (plotRight - plotLeft) / days;
  const dayCentre = (d: number) => plotLeft + (d + 0.5) * dayWidth;

  const levelLabels = fitLabelSet(
    levels.slice(0, shown).map((text) => ({ text, widthPx: plotLeft - geometry.x - pad * 2 })),
    levelSizes
  );
  for (let i = 0; i < shown; i++) {
    if (!levelLabels.texts[i]) continue;
    elements.push({
      id: id(`l${i}-label`),
      type: "text",
      x: geometry.x + pad,
      y: capCentredTextY(plotTop + i * pitch, pitch, levelLabels.fontSizePx, fontFamily),
      width: plotLeft - geometry.x - pad * 2,
      height: levelLabels.fontSizePx * 1.2,
      text: levelLabels.texts[i],
      fontSize: levelLabels.fontSizePx,
      fontFamily,
      fill: NEAR_BLACK,
      align: "right",
      opacity: 0.75,
    });
  }

  // THE AXES: the plot's left edge and its foot, both on the lattice.
  const rule = (name: string, x: number, y: number, width: number, height: number, opacity?: number): FrameElement => ({
    id: id(name),
    type: "figure",
    subType: "rect",
    x,
    y,
    width,
    height,
    fill: NEAR_BLACK,
    stroke: "none",
    ...(opacity !== undefined ? { opacity } : {}),
  });
  if (shown > 0) {
    elements.push(rule("axis-y", plotLeft - ruleWidth / 2, plotTop, ruleWidth, plotBottom - plotTop));
    elements.push(rule("axis-x", plotLeft, plotBottom - ruleWidth / 2, boxRight - plotLeft, ruleWidth));
  }

  // THE MARKS, one look at a time.
  if (look === "ruled") {
    // A rule on each lattice row between the bands, faint, from the axis to
    // the border: a level is the band its label sits in.
    for (let i = 1; i < shown; i++) {
      elements.push(rule(`l${i}-rule`, plotLeft, plotTop + i * pitch - ruleWidth / 2, boxRight - plotLeft, ruleWidth, 0.4));
    }
  }
  const tickHeight = ptToPx(2.5);
  for (let d = 0; d < days; d++) {
    const x = dayCentre(d);
    if (look === "ruled" && shown > 0) {
      // Where each day is, on the axis, since nothing else says.
      elements.push(rule(`d${d}-tick`, x - ruleWidth / 2, plotBottom - tickHeight, ruleWidth, tickHeight, 0.6));
    }
    if (look === "bars" && shown > 0) {
      // A column of boxes, one per level, with air either side so the days
      // read as bars and not as a grid.
      const gap = Math.max(ptToPx(1), dayWidth * 0.2);
      const left = plotLeft + d * dayWidth + gap;
      const width = Math.max(1, dayWidth - gap * 2);
      elements.push({
        id: id(`d${d}-bar`),
        type: "figure",
        subType: "rect",
        x: left,
        y: plotTop + pitch * 0.12,
        width,
        height: plotBottom - plotTop - pitch * 0.12,
        fill: "transparent",
        stroke: NEAR_BLACK,
        strokeWidth: ruleWidth,
        opacity: 0.7,
      });
      for (let i = 1; i < shown; i++) {
        elements.push(rule(`d${d}-rule${i}`, left, plotTop + i * pitch - ruleWidth / 2, width, ruleWidth, 0.45));
      }
    }
    for (let i = 0; i < shown && (look === "dots" || look === "circles"); i++) {
      const y = bandCentre(i);
      if (look === "dots") {
        const size = ptToPx(DOT_PT);
        elements.push({
          id: id(`d${d}-l${i}`),
          type: "figure",
          subType: "rect",
          x: x - size / 2,
          y: y - size / 2,
          width: size,
          height: size,
          cornerRadius: size / 2,
          fill: NEAR_BLACK,
          stroke: "none",
          opacity: 0.55,
        });
      } else {
        const size = Math.min(dayWidth * 0.62, pitch * 0.5, ptToPx(10));
        elements.push(glyphElement({ id: id(`d${d}-l${i}`), x: x - size / 2, y: y - size / 2, sizePx: size, shape: "circle", opacity: 0.7 }));
      }
    }
  }

  // THE DAYS, in the cell under the plot: the week's names in the journal's
  // order, short where they fit and initials where not; a month's numbers,
  // every one where they fit and every fifth where not.
  const axisTop = plotBottom;
  const axisHeight = Math.min(pitch, boxBottom - axisTop);
  if (shown > 0 && axisHeight > 0) {
    const daySizes = DAY_FONT_PT.map(ptToPx);
    const fitsAll = (texts: string[]) =>
      texts.every((text) => estimateTextWidthPx(text, daySizes[daySizes.length - 1]) <= dayWidth - ptToPx(1));
    let names: Array<string | null>;
    let thinned = false;
    if (config.span === "month") {
      const numbers = Array.from({ length: days }, (_, d) => String(d + 1));
      thinned = !fitsAll(numbers);
      names = thinned ? numbers.map((n, d) => (d === 0 || (d + 1) % 5 === 0 ? n : null)) : numbers;
    } else {
      const short = weekdayShortNames(config.weekStartDay);
      names = fitsAll(short) ? short : weekdayInitials(config.weekStartDay);
    }
    // A thinned month's numbers may spread over the days either side - four
    // days, so the 1 and the 5 just meet - kept centred on their own day and
    // inside the box.
    const halfWidth = (d: number) =>
      Math.min((thinned ? 4 : 1) * dayWidth, (dayCentre(d) - geometry.x) * 2, (boxRight - dayCentre(d)) * 2) / 2;
    // One size for all of them.
    const set = fitLabelSet(
      names.map((text, d) => ({ text: text ?? "", widthPx: halfWidth(d) * 2 - ptToPx(1) })),
      daySizes
    );
    names.forEach((text, d) => {
      if (text === null || !set.texts[d]) return;
      const half = halfWidth(d);
      elements.push({
        id: id(`d${d}-label`),
        type: "text",
        x: dayCentre(d) - half,
        y: capCentredTextY(axisTop, axisHeight, set.fontSizePx, fontFamily),
        width: half * 2,
        height: set.fontSizePx * 1.2,
        text: set.texts[d],
        fontSize: set.fontSizePx,
        fontFamily,
        fill: NEAR_BLACK,
        align: "center",
        opacity: 0.7,
      });
    });
  }

  return elements;
}
