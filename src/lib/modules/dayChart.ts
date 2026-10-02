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
// THE LEVELS ARE LATTICE ROWS AT THE FLOOR. Each is one cell under the
// header, with the day names in one more cell beneath. A chart taller than
// that fills its height (2026-10-02, see dayChartRowsBetween): the levels
// spread apart, and once there is a cell for a row of dots between each
// pair, the rows jump to that - every row a cell, on the lattice again - and
// spread from there. A level's label and its marks are centred in its band;
// the ruled look's rules sit between the bands.
//
// THE DAYS DIVIDE THE PLOT, as a to-do's or a habit tracker's do. The level
// labels take exactly what they need, no more than a quarter of the box where
// a smaller size allows, and the days share the rest evenly to the border -
// each end half a day from its edge (2026-10-02). The only vertical rule is
// the axis, where the labels end.
import { ptToPx } from "@/lib/print-spec";
import { glyphElement } from "@/lib/modules/glyphs";
import { MOOD_FACES } from "@/lib/modules/faces";
import { BEDTIME_LEVELS, ENERGY_BOLTS, scaleSymbolAspect, scaleSymbolElements, splitLevel } from "@/lib/modules/scaleSymbols";
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
import type { PageLevel } from "@/lib/pageLevels";

export type DayChartLook = "dots" | "ruled" | "bars" | "circles";
export type DayChartAlong = "weekdays" | "dates" | "days" | "weeks";
export const DAY_CHART_ALONG: readonly DayChartAlong[] = ["weekdays", "dates", "days", "weeks"];

/** What runs along the bottom - `along`, or what `span` meant before it. */
export function dayChartAlong(config: DayChartConfig): DayChartAlong {
  if (DAY_CHART_ALONG.includes(config.along as DayChartAlong)) return config.along as DayChartAlong;
  return config.span === "month" ? "days" : "weekdays";
}
export const DAY_CHART_LOOKS: readonly DayChartLook[] = ["dots", "ruled", "bars", "circles"];

/**
 * WHAT CAN RUN ALONG THE BOTTOM ON EACH LEVEL OF PAGE, the usual one first
 * (2026-10-02: "weekdays letter or days or weeks. depending on level of
 * page"). A week's page and a day's - which charts the week around it - show
 * the week by its days' names or its dates; a month's page, and the journal
 * pages at the front and back, the month by its days or its weeks. The
 * editor offers only these, so nothing is offered that the page cannot fill.
 */
export const DAY_CHART_ALONG_BY_LEVEL: Record<PageLevel, readonly DayChartAlong[]> = {
  WEEKLY: ["weekdays", "dates"],
  DAILY: ["weekdays", "dates"],
  MONTHLY: ["days", "weeks"],
  FRONT_MATTER: ["days", "weeks"],
  BACK_MATTER: ["days", "weeks"],
};

/** Words, for a scale that is neither faces, bolts nor the moon. */
export const DAY_CHART_WORDS = ["Great", "Good", "Okay", "Low", "Awful"];

/**
 * THE SCALES the editor offers, drawn (2026-10-02: "relevant module editor
 * setting that would be as intuitive as possible"). Each one sets the levels
 * outright - they are still a list of strings, so the list stays editable
 * for anything else, and a list that is none of these picks none of them.
 */
export const DAY_CHART_SCALES: ReadonlyArray<{ value: string[]; label: string }> = [
  { value: [...MOOD_FACES], label: "Faces" },
  { value: [...ENERGY_BOLTS], label: "Bolts" },
  { value: [...BEDTIME_LEVELS], label: "Bedtime" },
  { value: DAY_CHART_WORDS, label: "Words" },
];

export type DayChartConfig = {
  heading?: string;
  /** The seven days of a week, or the days of a month. Read when `along`
   *  is unset - the older setting, which `along` grew out of. */
  span?: "week" | "month";
  /**
   * WHAT RUNS ALONG THE BOTTOM (2026-10-02): the week's days by name, the
   * week's dates, the month's days, or its weeks - offered by the level of
   * the page the chart is on. Unset follows `span`.
   */
  along?: DayChartAlong;
  /** The dates of the week's seven days, set by the dated hook; unset on a
   *  template, where the dates are left to be written in. */
  weekDates?: number[] | null;
  /** How many weeks the month runs across, set by the dated hook; 5 on a
   *  template. */
  weeksInMonth?: number | null;
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

// A mood chart's axis is faces - the doodle people's, 2026-10-01 (faces.ts).
// Any level that is exactly one of them is drawn as it; anything else is
// words, as written.
export const DEFAULT_DAY_CHART_LEVELS: string[] = [...MOOD_FACES];
/** A face's share of its level's band - a cell - so it reads at print size
 *  and keeps clear of the faces above and below it. Every symbol's. */
const FACE_SHARE = 0.8;
/** Words with a symbol - a bedtime under its moon - are FINE PRINT at the
 *  symbol's lower right: the house's smallest legible size (see the icon
 *  strip's heading), "even smaller fine print text with the time near the
 *  lower right corner" (2026-10-02). */
const FINE_PRINT_PT = 5;

const LEVEL_FONT_PT = [7, 6, 5];
const DAY_FONT_PT = [6.5, 6, 5];
const LABEL_PAD_PT = 4;
/** A plotted dot: big enough to read as the chart's own, not the lattice's. */
const DOT_PT = 1.9;
/** A dot in a row between two levels: smaller, and lighter (see THE FILL). */
const BETWEEN_DOT_PT = 1.5;

export function dayChartLevels(config: DayChartConfig): string[] {
  const levels = Array.isArray(config.levels) ? config.levels.map((level) => (typeof level === "string" ? level.trim() : "")) : [];
  return levels.length > 0 ? levels : DEFAULT_DAY_CHART_LEVELS;
}

/** Are the levels all words - none a face, a bolt or the moon? */
export function dayChartLevelsAreWords(config: DayChartConfig): boolean {
  return dayChartLevels(config).every((level) => !splitLevel(level).symbol);
}

export function dayChartDayCount(config: DayChartConfig): number {
  const along = dayChartAlong(config);
  if (along === "weeks") {
    const weeks = Math.round(Number(config.weeksInMonth));
    return weeks >= 4 && weeks <= 6 ? weeks : 5;
  }
  if (along !== "days") return 7;
  const days = Math.round(Number(config.monthDays));
  return days >= 28 && days <= 31 ? days : 31;
}

/**
 * THE FILL (2026-10-02). A chart taller than its floor fills its height: the
 * levels spread apart, and once there is a whole cell for a row of dots
 * between each pair of levels, the rows jump to that - every row a cell
 * again - and spread from there; then two rows between, and so on. Andrew:
 * "scale but at a certain point jump and add a row of dots in between each
 * symbol row and scale again from there". The floor, and each jump, are on
 * the lattice; between them the rows share the height evenly, off it, as
 * the days share the width.
 *
 * Returns how many rows go between each pair of levels, for `levels` levels
 * in a plot `plotCells` cells tall.
 */
export function dayChartRowsBetween(levels: number, plotCells: number): number {
  if (levels < 2 || plotCells <= levels) return 0;
  return Math.floor((plotCells - levels) / (levels - 1));
}

/** The header, a cell per level and a cell of day names - in the box's own
 *  pixels, which end one inset short of the last cell. */
export function getDayChartMinHeightPx(config: DayChartConfig, insetPx: number): number {
  return ptToPx(HEADER_HEIGHT_PT) + (dayChartLevels(config).length + 1) * rowHeightPx() - insetPx;
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

  const pitch = rowHeightPx(lattice); // a cell
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
  const plotCells = Math.max(0, Math.floor((boxBottom - top - pitch + inset + 0.5) / pitch));
  const shown = Math.min(levels.length, plotCells);
  // A box with room to spare fills it - see dayChartRowsBetween. ROWS are
  // the levels and the rows between them; level i is row i * (between + 1).
  const between = shown === levels.length ? dayChartRowsBetween(shown, plotCells) : 0;
  const rowCount = shown + Math.max(0, shown - 1) * between;
  const rowPitch = shown === levels.length && rowCount > 0 ? (plotCells * pitch) / rowCount : pitch;
  const plotTop = top;
  const plotBottom = top + rowCount * rowPitch;
  const levelRow = (i: number) => i * (between + 1);
  const rowCentre = (r: number) => plotTop + (r + 0.5) * rowPitch;
  const bandCentre = (i: number) => rowCentre(levelRow(i));
  // A row's name: a level's own, or the level above it and how far below.
  const rowName = (r: number) => {
    const level = Math.floor(r / (between + 1));
    const step = r % (between + 1);
    return step === 0 ? `l${level}` : `l${level}h${step}`;
  };

  // The level labels' column - see where plotLeft is set.
  const levelSizes = LEVEL_FONT_PT.map(ptToPx);
  // A level is words, a symbol (scaleSymbols.ts), or a symbol before words -
  // "🌙 10h" - where the symbol is small enough to sit with the text.
  const symbolSize = pitch * FACE_SHARE;
  const fineSize = ptToPx(FINE_PRINT_PT);
  const fineGap = ptToPx(0.75);
  const parts = levels.map((level) => splitLevel(level));
  const levelWidth = (i: number, size: number) => {
    const { symbol, words } = parts[i];
    if (!symbol) return estimateTextWidthPx(words, size);
    return symbolSize * scaleSymbolAspect(symbol) + (words ? fineGap + estimateTextWidthPx(words, fineSize) : 0);
  };
  const needs = (size: number) =>
    (Math.max(0, ...levels.map((_, i) => levelWidth(i, size))) + pad * 2 + inset) / pitch;
  // THE COLUMN IS WHAT THE LABELS NEED, at the largest size that keeps it
  // within a quarter of the box (or at the smallest, if even that is wider),
  // and the days share the rest, running to the border - so the first is
  // half a day from the axis and the last half a day from the border.
  //
  // It used to be rounded out so the days landed on the lattice, and that
  // rounding was slack before the labels - 13px before a three-day chart's
  // faces, nearly two cells before a page-wide one's. Andrew, 2026-10-02:
  // "take slight extra space before smileys and add it so S first day Sunday
  // is same distance from border on its left and S Saturday last day is from
  // the border on its right", and for the energy and sleep charts the same.
  // The day columns are off the lattice now as a month's always were; the
  // level rows still sit on it. Nothing is drawn down a day boundary.
  const quarter = allocationCells * 0.25;
  const fitting = levelSizes.find((size) => needs(size) <= quarter) ?? levelSizes[levelSizes.length - 1];
  const plotLeft = allocationLeft + needs(fitting) * pitch;
  const plotRight = boxRight;
  const dayWidth = (plotRight - plotLeft) / days;
  const dayCentre = (d: number) => plotLeft + (d + 0.5) * dayWidth;

  const columnWidth = plotLeft - geometry.x - pad * 2;
  // Words alone share one size, fitted; a symbol's words are fine print.
  const levelLabels = fitLabelSet(
    parts.slice(0, shown).map(({ symbol, words }) => ({ text: symbol ? "" : words, widthPx: columnWidth })),
    levelSizes
  );
  // The widest fine print beside a symbol: the column the symbols stand in
  // is that far from the axis.
  const widestNote = Math.max(0, ...parts.map(({ symbol, words }) => (symbol && words ? estimateTextWidthPx(words, fineSize) : 0)));
  const symbolId = (i: number, kind: string) => (part: string) => id(kind === "face" ? `l${i}-face-${part}` : `l${i}-sym-${part}`);
  for (let i = 0; i < shown; i++) {
    const { symbol, words } = parts[i];
    const right = plotLeft - pad;
    if (symbol && !words) {
      // Against the axis, as a label is, centred in its band.
      const height = Math.min(symbolSize, columnWidth / scaleSymbolAspect(symbol));
      if (height > 0) {
        const width = height * scaleSymbolAspect(symbol);
        elements.push(...scaleSymbolElements(symbol, right - width, bandCentre(i) - height / 2, height, symbolId(i, symbol.kind)));
      }
      continue;
    }
    if (symbol) {
      // The symbol at full size, its words in fine print at its lower right.
      // The symbols stand in one column, the widest words against the axis,
      // so a short time does not push its moon out of line. The words'
      // baseline sits level with the symbol's foot. Not "-label": typing
      // over a level on the page would replace the moon with the words -
      // they are edited in the panel.
      const textWidth = estimateTextWidthPx(words, fineSize);
      const height = Math.min(symbolSize, (columnWidth - widestNote - fineGap) / scaleSymbolAspect(symbol));
      if (height <= 0) continue;
      const width = height * scaleSymbolAspect(symbol);
      const top = bandCentre(i) - height / 2;
      const symbolRight = right - widestNote - fineGap;
      elements.push(...scaleSymbolElements(symbol, symbolRight - width, top, height, symbolId(i, symbol.kind)));
      elements.push({
        id: id(`l${i}-note`),
        type: "text",
        x: symbolRight + fineGap,
        y: top + height - fineSize * 1.05,
        width: textWidth,
        height: fineSize * 1.2,
        text: words,
        fontSize: fineSize,
        fontFamily,
        fill: NEAR_BLACK,
        align: "left",
        opacity: 0.75,
      });
      continue;
    }
    if (!levelLabels.texts[i]) continue;
    elements.push({
      id: id(`l${i}-label`),
      type: "text",
      x: geometry.x + pad,
      y: capCentredTextY(plotTop + levelRow(i) * rowPitch, rowPitch, levelLabels.fontSizePx, fontFamily),
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
    // A rule between each pair of rows, faint, from the axis to the border:
    // a level is the band its label sits in, and a row between two levels a
    // band of its own.
    for (let r = 1; r < rowCount; r++) {
      elements.push(rule(`${rowName(r)}-rule`, plotLeft, plotTop + r * rowPitch - ruleWidth / 2, boxRight - plotLeft, ruleWidth, 0.4));
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
      for (let r = 1; r < rowCount; r++) {
        const name = rowName(r);
        elements.push(rule(`d${d}-rule${name.slice(1)}`, left, plotTop + r * rowPitch - ruleWidth / 2, width, ruleWidth, 0.45));
      }
    }
    for (let r = 0; r < rowCount && (look === "dots" || look === "circles"); r++) {
      const y = rowCentre(r);
      const name = rowName(r);
      // A row between levels is a row of dots in either look - lighter, a
      // half step rather than a level of its own.
      if (name.includes("h")) {
        const size = ptToPx(BETWEEN_DOT_PT);
        elements.push({
          id: id(`d${d}-${name}`),
          type: "figure",
          subType: "rect",
          x: x - size / 2,
          y: y - size / 2,
          width: size,
          height: size,
          cornerRadius: size / 2,
          fill: NEAR_BLACK,
          stroke: "none",
          opacity: 0.35,
        });
        continue;
      }
      const i = Number(name.slice(1));
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
    const along = dayChartAlong(config);
    if (along === "days") {
      const numbers = Array.from({ length: days }, (_, d) => String(d + 1));
      thinned = !fitsAll(numbers);
      names = thinned ? numbers.map((n, d) => (d === 0 || (d + 1) % 5 === 0 ? n : null)) : numbers;
    } else if (along === "weeks") {
      const long = Array.from({ length: days }, (_, w) => `WEEK ${w + 1}`);
      names = fitsAll(long) ? long : Array.from({ length: days }, (_, w) => `W${w + 1}`);
    } else if (along === "dates") {
      // The week's own dates where the page is dated; on a template, nothing
      // - the dates are written in.
      const dates = Array.isArray(config.weekDates) && config.weekDates.length === 7 ? config.weekDates : null;
      names = dates ? dates.map((n) => String(n)) : Array.from({ length: 7 }, () => null);
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
