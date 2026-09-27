// Renders the "core" weekly hourly-grid block: day-header tabs + a
// half-hour ruled grid per day, with optional synced calendar events
// drawn at their correct time. Pure function — no Polotno/React
// dependency — so it can be reused both by the live editor (converting
// its output into real Polotno elements) and later by the server-side
// print export pipeline, which needs the exact same layout logic.
//
// Every constant below is a measured value pulled directly from
// hourlyjournal.pdf's embedded text metadata and vector path data
// (pymupdf get_text('dict') / get_drawings() on page 4 of the source
// PDF), not an eyeballed guess — see the comments on each one.

import { ptToPx } from "@/lib/print-spec";
import { RULE_WIDTH_PT } from "@/lib/modules/moduleFrame";
import { capCentredTextY } from "@/lib/modules/textFit";

export type HourlyGridEvent = {
  day: number; // 0-indexed within this block's dayCount
  startTime: string; // "HH:MM", 24-hour
  endTime: string; // "HH:MM", 24-hour
  label: string;
  source: "manual" | "google-calendar";
  /** Drawn in the banner band above the hours instead of against a time -
   *  see ALL_DAY_BAND_HEIGHT_PT. A holiday is one of these: Google and
   *  iCloud both publish holidays as a calendar of all-day events, so the
   *  band serves both and there is no second concept. */
  allDay?: boolean;
  /** The calendar's colour. Absent falls back to the source default. */
  colour?: string;
};

export type HourlyGridCoreConfig = {
  dayCount: number; // 3 or 4, matching which half of the spread
  // length === dayCount. `date` is ABSENT on an undated planner - see
  // weekTitle.ts: undated is the absence of the value, not a flag. The tab
  // keeps its bordered box either way, so the space to write one in is
  // already drawn.
  dayLabels: Array<{ name: string; date?: number | null }>;
  startTime: string; // "05:30"
  endTime: string; // "23:30"
  intervalMinutes: number; // 30
  hourLineStyle: "full" | "low-transparency" | "gone";
  dayBorder: boolean;
  events: HourlyGridEvent[];
  /** How far an event block is held off the hour rules above and below it,
   *  in points. Optional; EVENT_VERTICAL_MARGIN_PT by default, which is what
   *  was chosen. Zero puts the block flush against the lines, which is what
   *  the proof draws for comparison. */
  eventVerticalMarginPt?: number;
  // "off" replaces the ruled hour-rows with blank, height-adjustable
  // space (see renderHourlyGridCore's own branch below) — a materially
  // different layout from hourLineStyle:"gone", which still allocates
  // the same rowCount*rowHeight content and still draws each row's time
  // label, just with the ruled lines themselves faded to invisible.
  // Optional/defaults to "on" so existing stored instances (seeded
  // before this field existed) keep rendering exactly as before.
  intervalMode?: "on" | "off";
  // Opts a 1-hour interval back into rendering each row at the same
  // height a 30-min row gets, instead of the default doubled height —
  // see getRowHeightPx's own comment. Ignored at 30-min intervals (there's
  // nothing to make "compact" relative to). Optional/defaults to false
  // so existing stored instances keep the new doubled-height default.
  compactHourRows?: boolean;
  // One of ROW_HEIGHT_OPTIONS_PT. Absent means the 9pt default.
  rowHeightPt?: number;
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

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * The hours to draw, with anything missing filled in.
 *
 * Every renderer in this codebase is total in its config - a propValues
 * that lost a key draws something plain rather than throwing, because a
 * throw inside a render takes the whole PAGE down. This module was the one
 * exception: `timeToMinutes(undefined)` threw, and it is the spine every
 * week page is built on. Measured across the registry, 126 of 127 renderers
 * already coped.
 *
 * Gaps are filled from DEFAULT_HOURLY_SETTINGS rather than from literals.
 * Those same times are already written twice - here and in the registry's
 * own schema defaults - and a third copy is how they begin to disagree.
 */
function hoursOrDefaults(config: Partial<HourlyGridCoreConfig>): {
  startMinutes: number;
  endMinutes: number;
  intervalMinutes: number;
} {
  return {
    startMinutes: timeToMinutes(config.startTime ?? DEFAULT_HOURLY_SETTINGS.startTime),
    endMinutes: timeToMinutes(config.endTime ?? DEFAULT_HOURLY_SETTINGS.endTime),
    // `||` not `??`: a stored zero is not an interval, it is a division by
    // zero dressed as a setting.
    intervalMinutes: config.intervalMinutes || DEFAULT_HOURLY_SETTINGS.intervalMinutes,
  };
}

// 12-hour label with no AM/PM, matching the reference design — position
// in the day (before/after the 12:00 row) carries that meaning instead.
function formatHour12NoMeridiem(minutesSinceMidnight: number): string {
  const totalMinutes = ((minutesSinceMidnight % 1440) + 1440) % 1440;
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")}`;
}

// Near-black, not pure black — matches the reference's actual stroke
// color for box borders and ruled lines (RGB 0.137/0.122/0.125).
const LINE_COLOR = "#231F20";

// The day-header tab box, measured from its actual vector rect in the
// PDF: (136.2, 18.2, 240.2, 31.9) → 13.7pt tall. This is its own
// measurement, separate from the gap below it — conflating the two was
// the bug in the previous pass.
const HEADER_HEIGHT_PT = 13.7;
const HEADER_BORDER_WIDTH_PT = 0.5;
// Gap between the bottom of the header box and the first ruled row.
// Measured from the reference at 22.6pt (row 0 at y≈54.5pt, header bottom
// at y≈31.9pt), trimmed by 0.3pt so the whole header band is exactly two
// 1/4in dots: 13.7 + 22.3 = 36.0pt = 0.500in. Without the trim the band is
// 36.3pt, the block rounds to 21 dots instead of 20, and a quarter inch
// comes off the bottom zone for the sake of three tenths of a point.
const HEADER_TO_GRID_GAP_PT = 22.3;
/**
 * The all-day band, between the day tab and the first ruled row.
 *
 * Asked for 2026-09-26: all-day events and holidays sit "between day of week
 * at top and hourly section". It fits INSIDE the 22.3pt gap that is already
 * there, which is why nothing else on the page moves: the block stays 20
 * dots, its rowSpan stays 21, and the to-do below it keeps all fifteen rows.
 * Growing the block by a dot instead would have cost the to-do a row on every
 * weekly spread, to buy space that was already sitting empty.
 *
 * 14pt leaves 4.15pt of gap above and below, so the tab does not sit on the
 * band and the band does not sit on the grid.
 *
 * AND IT DRAWS ONLY WHEN SOMETHING IS IN IT. A week with no all-day events
 * is identical to one drawn before this existed - no empty band, no band
 * rule, nothing. That is what makes this safe for every stored instance
 * without a config flag or a default to get wrong.
 */
const ALL_DAY_BAND_HEIGHT_PT = 14;
/**
 * How an event block is drawn, in the band and over the hours alike - they
 * are one visual family and reading as two would be the defect.
 *
 * Asked for 2026-09-27: "make them more rounded and lower opacity". The
 * radius is CLAMPED to half the shorter side at the point of use, because a
 * 15-minute event is a few pixels tall and a 4pt radius on a 4px box is not
 * a rounded rectangle, it is a lozenge.
 */
export const EVENT_CORNER_RADIUS_PT = 2;
const EVENT_OPACITY = 0.55;
/** The block's own writing is held off its edge by this much. */
const EVENT_TEXT_PADDING_PT = 3;
/**
 * An event's own label.
 *
 * 5pt, asked for 2026-09-27. Not the smallest this app sets - the water-week
 * strip goes to 4.5 - and it matches the time labels in the column beside
 * it, which are 5 and 5.5. At 30-minute intervals a row is 9pt, so a 5pt
 * line box (6pt) leaves 1.5pt of air above and below when centred.
 */
const EVENT_LABEL_PT = 5;
/** WCAG AA for normal text. See eventInk - this is a floor, not a taste. */
const EVENT_INK_CONTRAST = 4.5;
/**
 * Air between an event block and the hour rules above and below it.
 *
 * HALF THE DISTANCE THE PAGE ALREADY LEAVES BETWEEN TWO ADJACENT MODULES.
 * Every module's ink box is inset 6px from its allocation on all four sides,
 * so two neighbours sit 12px apart; half of that is 6px, which at 300px to
 * the inch is 1.44pt. Chosen by drawing it beside the flush version at true
 * size (Andrew, 2026-09-27: "held of hour lines").
 *
 * The number is written out rather than read from the lattice because the
 * inset is 6 everywhere in this app - twenty definitions, all of them - and
 * taking a page property in here to re-derive a constant would be coupling
 * for its own sake.
 */
export const EVENT_VERTICAL_MARGIN_PT = (6 / 300) * 72;
/**
 * The block's edge weight: the house hairline, the same 0.3pt the hour rules
 * and every module border are drawn at. Asked for as "thinnest border".
 *
 * Note this is a STROKE, so it is not snapped to the device grid the way a
 * fill-only rule is - see src/lib/hairline.ts, which skips stroked boxes
 * because the rasteriser's own hairline handling already applies to them.
 * That is why a module outline reads crisp where a ruled line needs help.
 */
const EVENT_BORDER_WIDTH_PT = RULE_WIDTH_PT;

/**
 * What an event block is filled with IN PRINT.
 *
 * Colour on screen, grey on paper (Andrew, 2026-09-26) - colour pages cost
 * money. Settled over two passes at true size: #ececec read as nothing and
 * #d8d8d8 as a slab, so the answer was "in between but closer to the light
 * grey" (#e6e6e6), and then between that and the light one again.
 *
 * IT IS A 4.7% TINT. At EVENT_OPACITY over white this lands at 242.9/255,
 * and a press holds about 3-5% reliably - so this is now at the BOTTOM of
 * that band rather than inside it, and the Lulu test print is what settles
 * whether it holds. If it drops out the fix is the OPACITY, not the grey:
 * the same colour at full strength is an 8.6% tint.
 *
 * Applied where events are put INTO the config for the book, not here - the
 * editor, the previews and the PDF all read one element list, and the block
 * does not know which of them is asking. See generateBook.
 */
export const EVENT_PRINT_GREY = "#e9e9e9";

// One half-hour slot. The reference measures 11.3pt across 24+ consecutive
// row labels, but that does not divide the 1/4in dot pitch (18pt), so the
// rules drift off the lattice down the page. 9pt is two slots per dot, and
// it lands: 36 slots = 324pt = 18 dots exactly, plus the 2-dot header band
// makes the block 20 dots = 5.000in.
//
// The type is untouched - still 5pt/5.5pt Newsreader - so this takes 1.3pt
// of dead space out of the label box rather than shrinking anything that
// is read. Writing height goes 3.986mm to 3.175mm. Confirmed against a
// true-size print before it was written: see the row-height test sheet.
//
// It also costs nothing: the block goes 6.154in to 5.000in, so the bottom
// zone GAINS, 3.250in to 3.750in.
const ROW_HEIGHT_PT = 9.0;
// The house interior rule weight - see moduleFrame's RULE_WIDTH_PT.
const ROW_LINE_WIDTH_PT = RULE_WIDTH_PT;
// Gap between adjacent day-tab boxes: 244.7 - 240.2 = 4.5pt.
const COLUMN_GUTTER_PT = 4.5;
// Day-tab text insets from the box border: "SUNDAY" bbox starts 4.4pt
// inside the box's left edge; "31" bbox ends 6.9pt inside the right edge.
const DAY_NAME_LEFT_INSET_PT = 4.4;
const DATE_RIGHT_INSET_PT = 6.9;
// Small thin box wrapping each time label, bottom edge flush with the
// row's ruled line — measured from a sample vector rect: ~14pt wide,
// ~8.9pt tall, 0.1pt near-black stroke.
const TIME_LABEL_BOX_WIDTH_PT = 14;
/**
 * How far a TIMED event is held off the left edge of its day.
 *
 * The time-of-day labels live in a box TIME_LABEL_BOX_WIDTH_PT wide at the
 * column's left edge, and an event drawn from dayX + 2 covered them - its
 * own label started at dayX + 6, on top of "8:30". Reported 2026-09-27:
 * "indent the ones over the hours to make it so their text doesn't over lap
 * with the time of day text."
 *
 * The all-day band is NOT indented: there are no time labels beside it, and
 * holding it off the edge would just make it look misaligned with the day
 * tab above it.
 */
const EVENT_LEFT_INSET_PT = TIME_LABEL_BOX_WIDTH_PT + 1.5;
const TIME_LABEL_BOX_HEIGHT_PT = 8.9;
const TIME_LABEL_BOX_WIDTH_STROKE_PT = 0.1;

// The dot field drawn when increments are off. Same size and grey as the
// add-zone's field in NativePlannerEditor, so one lattice looks like one
// lattice wherever it appears.
const DOT_RADIUS_PX = 2.8;
const DOT_COLOR = "#9aa2a8";

// The vertical bars between day columns in increments-off mode. Greyer
// than LINE_COLOR, the near-black used for ruled lines and box borders:
// with the dot field behind them these read as structure rather than as
// content, and near-black made them the heaviest thing in an area that is
// meant to be open. Sits between the dots and the ruled lines in weight.
const DAY_DIVIDER_COLOR = "#a0a6ab";

// A 1-hour row renders at double a 30-min row's own measured height by
// default — requested directly: "make the hour increment setting be
// double the height of the 30 min [rows]." Without this, switching from
// 30min to 1hr increments over the same time range halves rowCount but
// leaves each row the same physical height, so the whole grid's visual
// size shrinks by half along with it — doubling the row height keeps the
// total content height roughly the same, trading row count for row
// height instead. compactHourRows opts back into the original
// single-height behavior for anyone who prefers the shorter, more
// compact hourly view instead — requested directly, same turn: "also
// have a setting to make the hour setting compact." Only 1-hour
// intervals are affected either way; 30-min rows always render at the
// one measured ROW_HEIGHT_PT.
/**
 * The three row heights a planner can use, in points.
 *
 * All three land on the 1/4in dot lattice (18pt), but not in the same way,
 * and the difference is visible:
 *
 *   9pt  - two slots per dot. A rule on every cell line, plus one between.
 *          The default, and the tightest.
 *   12pt - three slots per two dots. Roomier to write in, and still on the
 *          lattice, but the pattern only repeats every OTHER cell line, so
 *          odd cell lines carry no rule.
 *   18pt - one slot per dot. A rule on every cell line and the most room,
 *          but 36 half-hour slots at 18pt is 9.000in, the entire usable
 *          height of a page - so it is only reachable at hour increments.
 *
 * A row height has to divide the pitch to put a rule on every cell line:
 * 18, 9, 6, 4.5. 12 does not, which is why it is the exception rather than
 * a fourth option of the same kind.
 */
export const ROW_HEIGHT_OPTIONS_PT = [9, 12, 18] as const;
// What a row is when nothing has said otherwise — the same value
// getRowHeightPx falls back to for an unset or unrecognised rowHeightPt.
// Exported so that anything RESTORING the default references this rather
// than writing 9 again: resetPlannerToTemplate sizes the block at 20 dots,
// which is only correct for this height.
export const DEFAULT_ROW_HEIGHT_PT = ROW_HEIGHT_PT;

/**
 * How many whole grid rows to keep clear between the hours and whatever
 * sits below them.
 *
 * Asked for as "either a half cell or a full cell depending on where the
 * hours end", and that is what it computes. The two boxes are inset by the
 * same amount, so the insets cancel and the visible gap is exactly
 *
 *   (rowsBetweenTops * cell) - contentHeight
 *
 * The rule is the first cell line at least half a cell below where the
 * hours actually stop. Whole-hour ranges land the content exactly on a
 * cell line at every row height - 20.000, 26.000, 38.000 cells - and get a
 * full cell. A range ending on a half hour at 9pt lands on a half cell and
 * gets half of one. Only a row height that divides the cell into thirds
 * (12pt) with an odd range can land elsewhere, and there it gives the
 * smallest gap that is still at least half a cell.
 *
 * This was a flat one row, and one row on top of a block already rounded
 * UP to whole cells double-counted: 20 cells of content asked for a 21
 * cell box, and the extra row made the visible gap 1.84 cells. Sizing is
 * left alone - it is the gap that was wrong, and computing it here keeps
 * the content comfortably inside its own box.
 */
export function hourlyGapRows(
  cellHeightPx: number,
  propValues: unknown,
  rowSpan: number
): number {
  const config = (propValues ?? {}) as Partial<HourlyGridCoreConfig>;
  const contentPx =
    config.intervalMode === "off"
      ? // Blank mode has no computed content: the block IS whatever height
        // it was dragged to, so the hours "end" at its own bottom and the
        // rule reduces to the full row it always had.
        rowSpan * cellHeightPx
      : getHourlyGridCoreContentHeightPx(config as HourlyGridCoreConfig);
  const rowsToClear = Math.ceil((contentPx + cellHeightPx / 2) / cellHeightPx - 1e-6);
  return Math.max(0, rowsToClear - rowSpan);
}

/** The hours a fresh planner starts with, and the state a reset restores. */
export const DEFAULT_HOURLY_SETTINGS: HourlySettings = {
  startTime: "05:30",
  endTime: "23:30",
  intervalMinutes: 30,
  intervalMode: "on",
  compactHourRows: false,
  rowHeightPt: DEFAULT_ROW_HEIGHT_PT,
};

/** Everything about an hourly grid that is a user choice rather than a
 *  consequence of its box. */
export type HourlySettings = {
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  intervalMode: "on" | "off";
  compactHourRows: boolean;
  rowHeightPt: number;
};

/**
 * An hourly grid's stored props, rebuilt from the settings.
 *
 * Every site that changes these used to spell the whole set out, and the
 * failure was always the same: one of them left a field out. rowHeightPt
 * went missing three separate times - the settings commit, the drag
 * commit, and the template reset - and each time something else had
 * already been sized FROM it, so the block took a height its own contents
 * then disagreed with. A reset restored a 20-row box built for 9pt rows
 * and left 18pt rows inside it.
 *
 * Spelling the set out once means a new setting is added in one place and
 * cannot be half-applied. Existing props are preserved for everything this
 * does not name - dayLabels, events, hourLineStyle, dayBorder - which is
 * why this merges rather than replaces.
 */
export function hourlyPropsFromSettings(
  existing: unknown,
  settings: HourlySettings
): Record<string, unknown> {
  return {
    ...((existing ?? {}) as Record<string, unknown>),
    startTime: settings.startTime,
    endTime: settings.endTime,
    intervalMinutes: settings.intervalMinutes,
    intervalMode: settings.intervalMode,
    compactHourRows: settings.compactHourRows,
    rowHeightPt: settings.rowHeightPt,
  };
}
export type RowHeightPt = (typeof ROW_HEIGHT_OPTIONS_PT)[number];

export function isRowHeightPt(value: unknown): value is RowHeightPt {
  return typeof value === "number" && (ROW_HEIGHT_OPTIONS_PT as readonly number[]).includes(value);
}

function getRowHeightPx(
  intervalMinutes: number,
  compactHourRows: boolean | undefined,
  rowHeightPt?: number
): number {
  const base = ptToPx(isRowHeightPt(rowHeightPt) ? rowHeightPt : ROW_HEIGHT_PT);
  return intervalMinutes === 60 && !compactHourRows ? base * 2 : base;
}

// Same "expose just the height math NativePlannerEditor.tsx/actions.ts
// need" convention as todoChecklist.ts's getTodoChecklistRowMetricsPx and
// habitTracker.ts's getHabitTrackerRowMetricsPx — mirrors
// renderHourlyGridCore's own header+gap+rowCount*rowHeight computation
// exactly (not calling into the renderer itself, same reasoning as those
// two: this needs just the height, not a render pass). Used by
// updateHourlySettings (actions.ts) to size hourly-grid-core's own
// rowSpan from a real requested start/end/interval, via grid.ts's
// pixelHeightToRowSpan.
export function getHourlyGridCoreContentHeightPx(
  config: Pick<
    HourlyGridCoreConfig,
    "startTime" | "endTime" | "intervalMinutes" | "compactHourRows" | "rowHeightPt"
  >
): number {
  const hours = hoursOrDefaults(config);
  const totalMinutes = hours.endMinutes - hours.startMinutes;
  const rowCount = Math.max(1, Math.round(totalMinutes / hours.intervalMinutes));
  return (
    ptToPx(HEADER_HEIGHT_PT) +
    ptToPx(HEADER_TO_GRID_GAP_PT) +
    rowCount * getRowHeightPx(hours.intervalMinutes, config.compactHourRows, config.rowHeightPt)
  );
}

// Minimum content height for the "off" (increments-off, blank-space)
// layout — just the header + its gap, deliberately NOT plus a nominal
// row like the "on" mode's own content height above. Requested directly:
// "for drag resize make a minimum size for the section as well around
// the same minimum size as modules" — header+gap alone already lands at
// exactly MIN_ROW_SPAN (2 grid rows) on this app's real page geometry,
// matching every other module's own resize floor (see actions.ts's
// getMinRowSpanForSlug, which every one of those ultimately clamps to
// at minimum); adding a nominal row on top would make this floor taller
// than everything else's, not "around the same."
export function getHourlyGridCoreOffModeMinHeightPx(): number {
  return ptToPx(HEADER_HEIGHT_PT) + ptToPx(HEADER_TO_GRID_GAP_PT);
}

/** The paper the blocks are drawn on - what an event fill composites over. */
const PAPER = [253, 252, 249] as const;

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const rgbToHex = (rgb: number[]) =>
  "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/**
 * DARKENED IN HSL, NOT BY SCALING RGB.
 *
 * Multiplying a colour toward black preserves its channel RATIOS and throws
 * its saturation away, and for a pale tint that is most of the colour.
 * #cfe3ff is a FULLY saturated blue that happens to be very light - H 215,
 * S 100%, L 90.6% - and scaling it to 35% lands on (72,79,89), which is
 * S 10.6%: a grey. Reported 2026-09-27: "text and border dont look like
 * event color but darker". They did not, and this is why.
 *
 * Keeping the hue and the saturation and moving only the lightness gives
 * what was actually asked for - the same colour, darker.
 */
function rgbToHsl([r, g, b]: readonly number[]): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const hue =
    max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [hue / 6, sat, l];
}

function hslToRgb([h, sat, l]: readonly number[]): number[] {
  if (sat === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

/**
 * The same colour at a different lightness - hue and saturation untouched.
 *
 * NO SATURATION FLOOR. The first version raised it to 5% so a near-grey
 * would still "read as deliberate", which put a red cast on the print grey:
 * a neutral fill has hue 0 by convention, not by choice, and 5% of hue 0 is
 * pink. A grey event should have grey writing.
 */
function atLightness(hex: string, lightness: number): string {
  const [h, sat] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, sat, lightness]));
}

const luminance = (rgb: readonly number[]) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: readonly number[], b: readonly number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * What an event block's fill looks like once it is drawn: the colour at
 * EVENT_OPACITY over the paper. This, not the fill, is what its own writing
 * has to be read against.
 */
function eventBackdrop(fill: string): number[] {
  const rgb = hexToRgb(fill);
  return rgb.map((v, i) => EVENT_OPACITY * v + (1 - EVENT_OPACITY) * PAPER[i]);
}

/**
 * Writing for an event block: the same colour, taken down until it can be
 * read on top of itself.
 *
 * Asked for 2026-09-27 - "make it a darker version of the background color".
 * A fixed factor would be a guess that happens to work for the two pastels
 * shipped today and fails on whatever colour somebody's calendar turns out
 * to be, so this DARKENS UNTIL IT MEETS A RATIO instead.
 *
 * 4.5:1 - WCAG AA for normal text, and the FLOOR rather than a preference.
 * It was 7:1 (AAA) on the argument that 5pt type on paper deserves the
 * margin, and at 7:1 the blue lands at L34% and the amber at L21%, which
 * reads as near-black rather than as the event's own colour: "make the dark
 * color closer to the event color". 4.5 puts them at L46% and L28%.
 *
 * Measured, so the cost of going further is on the record: 4:1 would give
 * L49%, and 3.5:1 L54% - but 4.5 is where a printed label stops being
 * something this app can defend, so that is where it stops.
 */
function eventInk(fill: string): string {
  const backdrop = eventBackdrop(fill);
  for (let lightness = 0.7; lightness > 0.05; lightness -= 0.01) {
    const candidate = atLightness(fill, lightness);
    if (contrast(hexToRgb(candidate), backdrop) >= EVENT_INK_CONTRAST) return candidate;
  }
  return atLightness(fill, 0.08);
}

/** The block's edge: the same colour, dark enough to define it and light
 *  enough not to compete with the writing inside. Raised from 55% with the
 *  ink, for the same reason - at 55% it read as a dark outline rather than as
 *  the event's own colour. */
const eventBorder = (fill: string) => atLightness(fill, 0.65);

/**
 * Where each of a day's timed events sits when some of them clash.
 *
 * CONCURRENT EVENTS STACK HORIZONTALLY (Andrew, 2026-09-27). Drawn at full
 * width in arrival order, the later of two overlapping events simply lies
 * over the earlier one and hides where it ends - which is what the proof
 * sheet showed.
 *
 * Returns, per event, which column it takes and how many columns its CLUSTER
 * needs. A cluster is a run of events connected by overlap, and the count is
 * per cluster rather than per day on purpose: a morning clash should not
 * narrow an unrelated afternoon event to half a column.
 *
 * Columns are assigned greedily in start order, taking the first that is
 * free - the usual calendar layout, and the one Google and Apple both use.
 */
function concurrencyColumns(events: HourlyGridEvent[]): Map<HourlyGridEvent, { column: number; of: number }> {
  const placed = new Map<HourlyGridEvent, { column: number; of: number }>();
  const spans = events
    .map((event) => ({ event, from: timeToMinutes(event.startTime), to: timeToMinutes(event.endTime) }))
    .sort((a, b) => a.from - b.from || b.to - a.to);

  let cluster: typeof spans = [];
  let clusterEnd = -Infinity;

  const close = () => {
    if (cluster.length === 0) return;
    // Within the cluster, first free column in start order.
    const columnEnds: number[] = [];
    const assigned = new Map<HourlyGridEvent, number>();
    for (const span of cluster) {
      let column = columnEnds.findIndex((end) => end <= span.from);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(span.to);
      } else {
        columnEnds[column] = span.to;
      }
      assigned.set(span.event, column);
    }
    const of = columnEnds.length;
    for (const span of cluster) placed.set(span.event, { column: assigned.get(span.event)!, of });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const span of spans) {
    // A new cluster starts where nothing before it is still running. Touching
    // is not overlapping: an event ending at 10:00 and one starting at 10:00
    // are consecutive, and splitting the column for them would halve two
    // events that never share a minute.
    if (span.from >= clusterEnd) close();
    cluster.push(span);
    clusterEnd = Math.max(clusterEnd, span.to);
  }
  close();
  return placed;
}

/** The corner radius an event block can actually take: the house radius, or
 *  half the shorter side if the block is smaller than that. A 15-minute event
 *  is a few pixels tall, and an unclamped radius turns it into a lozenge. */
function eventCornerRadiusPx(width: number, height: number): number {
  return Math.min(ptToPx(EVENT_CORNER_RADIUS_PT), width / 2, height / 2);
}

export function renderHourlyGridCore(
  geometry: { x: number; y: number; width: number; height: number },
  config: HourlyGridCoreConfig,
  idPrefix: string,
  fontFamily: string,
  // The page's 1/4in dot lattice. Only used when increments are off, where
  // the block becomes free space and the dots are what makes it writable -
  // see that branch. Optional so a caller without a page grid (a preview,
  // a test) still renders everything else.
  lattice?: { pitchPx: number; originX: number; originY: number; insetPx: number }
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic, not positional — see todoChecklist.ts. Ids here name a day
  // column, a row within it, or a lattice position, so changing the hour
  // range or turning the dot field on does not renumber everything else.
  const id = (name: string) => `${idPrefix}-${name}`;
  // Page Settings' font switch (Planner.theme) — aliased to the name
  // already used everywhere below rather than touching every reference.
  const FONT_FAMILY = fontFamily;

  // See hoursOrDefaults: this renderer is total in its config like every
  // other one here, which it had not been.
  const { startMinutes, endMinutes, intervalMinutes } = hoursOrDefaults(config);
  const totalMinutes = endMinutes - startMinutes;
  const rowCount = Math.max(1, Math.round(totalMinutes / intervalMinutes));

  const headerHeight = ptToPx(HEADER_HEIGHT_PT);
  const headerToGridGap = ptToPx(HEADER_TO_GRID_GAP_PT);
  const rowHeight = getRowHeightPx(intervalMinutes, config.compactHourRows, config.rowHeightPt);
  // The header band is measured from the ALLOCATION's top, not the ink
  // box's - the same frame the day columns already use, one line below.
  //
  // Everything about this block is designed in allocation terms: the
  // header band is 36pt so it is exactly two dots, 36 slots at 9pt are
  // exactly eighteen more, and the whole thing is "20 dots = 5.000in" -
  // which is what getHourlyGridCoreContentHeightPx returns, and what
  // pixelHeightToRowSpan turns into rowSpan 20. Only the render measured
  // from geometry.y, and geometry.y is 6px inside that.
  //
  // Two faults came out of the one line. The rows sat 6px off the dots all
  // the way down (hourly-grid-core has been carrying that in
  // moduleHouseStyle's LATTICE_DEBT). And 150 + 1350 drawn from the ink
  // top runs to 1500 where the ink box is 1488, so the last hour row hung
  // 12.6px past the bottom edge - found by check:page, which renders the
  // real planner rather than a synthetic size.
  //
  // From the allocation both go: the first rule lands on a dot line, and
  // the last lands on the allocation's own bottom edge - 6px below the ink
  // box, which is the same overhang the day columns have at the sides and
  // is what "works in the allocation frame" means.
  const gridTop =
    (lattice ? geometry.y - lattice.insetPx : geometry.y) + headerHeight + headerToGridGap;
  const columnGutter = ptToPx(COLUMN_GUTTER_PT);

  // Each day gets an equal share of the module's ALLOCATION, not of its
  // inked width, so the boundary between two days falls on a lattice line.
  //
  // It used to divide (width - gutter * (dayCount - 1)) by dayCount, which
  // takes the gutter out of the total and leaves each day 5.78 dots wide
  // instead of 6. The dividers then missed the dots by up to a pixel, in
  // different directions per boundary - reported exactly that way: "between
  // sun and mon line is to left, mon and tues line is to right... thurs and
  // fri line aligned, fri and sat line to right." Six of one, half a dozen
  // of the other, literally.
  //
  // The gutter now comes out of each day's own allocation instead, half on
  // each side, which centres it on the shared lattice line and leaves the
  // inked column a whole 6 dots less one gutter.
  const allocationX = lattice ? geometry.x - lattice.insetPx : geometry.x;
  const allocationWidth = lattice ? geometry.width + lattice.insetPx * 2 : geometry.width;
  const dayAllocationWidth = allocationWidth / config.dayCount;
  const dayColumnWidth = lattice
    ? dayAllocationWidth - columnGutter
    : (geometry.width - columnGutter * (config.dayCount - 1)) / config.dayCount;

  const lineOpacity =
    config.hourLineStyle === "full" ? 1 : config.hourLineStyle === "low-transparency" ? 0.25 : 0;

  for (let d = 0; d < config.dayCount; d++) {
    const dayX = lattice
      ? allocationX + d * dayAllocationWidth + columnGutter / 2
      : geometry.x + d * (dayColumnWidth + columnGutter);
    const label = config.dayLabels[d];

    // Header tab: bordered box, day name at the left edge, date at the
    // right edge — measured directly from the reference, not centered.
    elements.push({
      id: id(`d${d}-header-box`),
      type: "figure",
      subType: "rect",
      x: dayX,
      y: geometry.y,
      width: dayColumnWidth,
      height: headerHeight,
      fill: "transparent",
      stroke: LINE_COLOR,
      strokeWidth: ptToPx(HEADER_BORDER_WIDTH_PT),
    });
    if (label) {
      // Manually centered rather than relying on verticalAlign, which
      // wasn't reliably centering text in a box taller than the text.
      const dateWidth = ptToPx(26);
      const nameLeftInset = ptToPx(DAY_NAME_LEFT_INSET_PT);
      const dateRightInset = ptToPx(DATE_RIGHT_INSET_PT);

      const nameFontSize = ptToPx(8);
      const nameTextHeight = nameFontSize * 1.2;
      elements.push({
        id: id(`d${d}-name`),
        type: "text",
        x: dayX + nameLeftInset,
        y: capCentredTextY(geometry.y, headerHeight, nameFontSize, FONT_FAMILY),
        width: dayColumnWidth - nameLeftInset - dateWidth,
        height: nameTextHeight,
        text: label.name,
        fontSize: nameFontSize,
        fontFamily: FONT_FAMILY,
        align: "left",
      });

      // Bumped a hair past the reference's own measured 5pt for
      // legibility, requested directly — same kind of deliberate
      // departure from the literal measurement as habitTracker.ts's
      // own DAY_LETTER_FONT_PT (see its comment).
      const dateFontSize = ptToPx(5.5);
      const dateTextHeight = dateFontSize * 1.2;
      // No date on an undated planner. Nothing is drawn in its place: the
      // tab's own border already encloses the space, and a rule inside a
      // box is a second edge, not a writing line. Note the date's own
      // width is still reserved above (the name's box stops short of it),
      // so turning dates on later does not re-wrap the day name.
      if (typeof label.date === "number") elements.push({
        id: id(`d${d}-date`),
        type: "text",
        x: dayX + dayColumnWidth - dateWidth - dateRightInset,
        y: capCentredTextY(geometry.y, headerHeight, dateFontSize, FONT_FAMILY),
        width: dateWidth,
        height: dateTextHeight,
        text: String(label.date),
        fontSize: dateFontSize,
        fontFamily: FONT_FAMILY,
        fill: "#555555",
        align: "right",
      });
    }

    if (config.intervalMode === "off") {
      // Increments turned off: no ruled rows, no time labels — just a
      // blank, height-adjustable area (its own height comes straight
      // from geometry.height, i.e. from whatever rowSpan the instance
      // currently has — see the drag-resize handle in
      // NativePlannerEditor.tsx) with a vertical divider bar between
      // each pair of day columns, requested directly: "replace the
      // hours section with blank space, separated by vertical bars
      // that extend maybe 2/3 the height." Drawn once per inter-column
      // boundary (d>0, between column d-1 and d), not per row — there
      // are no rows in this mode.
      // A dot field over the blank area, on the page lattice. With no
      // rules and no time labels there is nothing to write against, and
      // this is the one place inside a module where the grid earns its
      // keep - requested directly: "i would also like dot grid to show in
      // the hours section when increments are turned off."
      //
      // Drawn once for the whole block, not per day column, so the field
      // reads continuously across the dividers the way a bullet journal's
      // does. Guarded on d === 0 for that reason.
      if (d === 0 && lattice) {
        const top = gridTop;
        const bottom = geometry.y + geometry.height;
        const firstCol = Math.ceil((geometry.x - lattice.originX) / lattice.pitchPx);
        const firstRow = Math.ceil((top - lattice.originY) / lattice.pitchPx);
        for (let cx = lattice.originX + firstCol * lattice.pitchPx; cx <= geometry.x + geometry.width; cx += lattice.pitchPx) {
          for (let cy = lattice.originY + firstRow * lattice.pitchPx; cy <= bottom; cy += lattice.pitchPx) {
            elements.push({
              // Named by lattice position, so the field keeps its identity
              // when the block is resized and the loop bounds shift.
              id: id(
                `dot-${Math.round((cx - lattice.originX) / lattice.pitchPx)}` +
                  `-${Math.round((cy - lattice.originY) / lattice.pitchPx)}`
              ),
              type: "figure",
              subType: "rect",
              x: cx - DOT_RADIUS_PX,
              y: cy - DOT_RADIUS_PX,
              width: DOT_RADIUS_PX * 2,
              height: DOT_RADIUS_PX * 2,
              fill: DOT_COLOR,
              stroke: "none",
              cornerRadius: DOT_RADIUS_PX,
            });
          }
        }
      }

      if (d > 0) {
        const blankHeight = geometry.y + geometry.height - gridTop;
        const dividerHeight = blankHeight * (2 / 3);
        const dividerY = gridTop + (blankHeight - dividerHeight) / 2;
        const dividerWidth = ptToPx(ROW_LINE_WIDTH_PT);
        elements.push({
          id: id(`d${d}-divider`),
          type: "figure",
          subType: "rect",
          x: dayX - columnGutter / 2 - dividerWidth / 2,
          y: dividerY,
          width: dividerWidth,
          height: dividerHeight,
          fill: DAY_DIVIDER_COLOR,
          stroke: "none",
        });
      }
    } else {
      // Ruled rows + time labels. The main row line is a single line at
      // the row's bottom edge, not a bordered box — a box-per-row would
      // draw phantom vertical dividers the reference doesn't have. The
      // time label itself sits inside a small separate box whose bottom
      // edge is flush with that line, per the reference's own structure.
      const labelBoxWidth = ptToPx(TIME_LABEL_BOX_WIDTH_PT);
      const labelBoxHeight = ptToPx(TIME_LABEL_BOX_HEIGHT_PT);
      for (let i = 0; i < rowCount; i++) {
        const rowY = gridTop + i * rowHeight;
        const rowMinutes = startMinutes + i * intervalMinutes;
        const lineY = rowY + rowHeight;
        const labelBoxTop = lineY - labelBoxHeight;

        if (lineOpacity > 0) {
          elements.push({
            id: id(`d${d}-r${i}-label-box`),
            type: "figure",
            subType: "rect",
            x: dayX,
            y: labelBoxTop,
            width: labelBoxWidth,
            height: labelBoxHeight,
            fill: "transparent",
            stroke: LINE_COLOR,
            strokeWidth: ptToPx(TIME_LABEL_BOX_WIDTH_STROKE_PT),
            opacity: lineOpacity,
          });
        }

        // Centered, not left-aligned — left alignment made shorter
        // strings ("8:00") look off relative to longer ones ("10:30")
        // sharing the same fixed-width box. Manually positioned near the
        // bottom (not flush) for the same reason verticalAlign was
        // dropped elsewhere — a small gap off the line reads better than
        // touching it exactly.
        // 5pt -> 5.5pt legibility bump (dateFontSize above got the same
        // one) crowded the box specifically for a two-digit hour
        // ("10:00"/"10:30"/"11:00"/"11:30"/"12:00"/"12:30" — 4 digits
        // once the colon's stripped out, vs. 3 for a single-digit hour
        // like "9:00") — the box's own fixed width was always sized for
        // the *shorter* strings. Eased down twice (5.3pt, then 5.1pt),
        // still crowded either way — back to the original 5pt
        // measurement for these specifically, requested directly.
        // Single-digit-hour times keep the 5.5pt bump.
        const timeLabelText = formatHour12NoMeridiem(rowMinutes);
        const timeLabelDigitCount = timeLabelText.replace(/\D/g, "").length;
        const timeLabelFontSize = ptToPx(timeLabelDigitCount >= 4 ? 5 : 5.5);
        const timeLabelTextHeight = timeLabelFontSize * 1.2;
        const timeLabelBottomGap = ptToPx(1);
        elements.push({
          id: id(`d${d}-r${i}-time`),
          type: "text",
          x: dayX + 2,
          y: labelBoxTop + labelBoxHeight - timeLabelTextHeight - timeLabelBottomGap,
          width: labelBoxWidth - 4,
          height: timeLabelTextHeight,
          text: timeLabelText,
          fontSize: timeLabelFontSize,
          fontFamily: FONT_FAMILY,
          fill: "#666666",
          align: "center",
        });

        if (lineOpacity > 0) {
          // Filled thin rect, not a zero-height stroked one — Polotno
          // doesn't reliably render sub-2px strokes on degenerate shapes
          // at the exact requested color (this rendered blue instead of
          // the specified near-black).
          const lineWidth = ptToPx(ROW_LINE_WIDTH_PT);
          elements.push({
            id: id(`d${d}-r${i}-rule`),
            type: "figure",
            subType: "rect",
            x: dayX,
            y: lineY - lineWidth / 2,
            width: dayColumnWidth,
            height: lineWidth,
            fill: LINE_COLOR,
            stroke: "none",
            opacity: lineOpacity,
          });
        }
      }
    }

    // Optional solid border around the whole day column (header + body),
    // independent of the ruled-line style above. "off" mode's own body
    // height is whatever geometry.height gives it (no rowCount to derive
    // from — see the intervalMode branch above), matching how "on" mode's
    // own body height is content-derived rather than geometry-derived.
    if (config.dayBorder) {
      // Measured to where the rows actually END, which is no longer
      // headerToGridGap + rows from the header box: the grid starts from
      // the allocation now, so the gap under the header box is that much
      // wider than the constant.
      const bodyHeight =
        config.intervalMode === "off"
          ? geometry.height - headerHeight
          : gridTop + rowCount * rowHeight - (geometry.y + headerHeight);
      elements.push({
        id: id(`d${d}-border`),
        type: "figure",
        subType: "rect",
        x: dayX,
        y: geometry.y,
        width: dayColumnWidth,
        height: headerHeight + bodyHeight,
        fill: "transparent",
        stroke: "#222222",
        strokeWidth: 1.5,
      });
    }

    // ALL-DAY EVENTS AND HOLIDAYS, in the band between the day tab and the
    // first ruled row - see ALL_DAY_BAND_HEIGHT_PT.
    //
    // Measured against what is actually drawn rather than against the
    // nominal 22.3pt: the header box starts at geometry.y, the grid starts
    // at gridTop, and on a lattice those are not the same distance apart as
    // the two constants say - gridTop is measured from the ALLOCATION's top,
    // six pixels above the ink box. Centring in the real gap keeps the band
    // off both neighbours whichever frame is in force.
    const allDay = config.events.filter((e) => e.day === d && e.allDay);
    if (allDay.length > 0 && config.intervalMode !== "off") {
      const bandHeight = Math.min(ptToPx(ALL_DAY_BAND_HEIGHT_PT), gridTop - (geometry.y + headerHeight));
      if (bandHeight > 0) {
        const bandTop = geometry.y + headerHeight + (gridTop - (geometry.y + headerHeight) - bandHeight) / 2;
        const first = allDay[0];
        // ONE LINE, and the rest counted. The band is a single 14pt line -
        // stacking a second item inside it would set two labels at 3pt, which
        // is under this app's own legibility floor. A day with a holiday AND
        // an all-day event reads "Thanksgiving +1", which is true and
        // readable, rather than two things neither of which is.
        const label = allDay.length > 1 ? `${first.label} +${allDay.length - 1}` : first.label;
        const bandFill = first.colour ?? (first.source === "google-calendar" ? "#cfe3ff" : "#ffe9b3");
        elements.push({
          id: id(`d${d}-allday-box`),
          type: "figure",
          subType: "rect",
          x: dayX + 2,
          y: bandTop,
          width: dayColumnWidth - 4,
          height: bandHeight,
          fill: bandFill,
          stroke: eventBorder(bandFill),
          strokeWidth: ptToPx(EVENT_BORDER_WIDTH_PT),
          opacity: EVENT_OPACITY,
          // Proved to survive to paper - see pdfDocument.test.mts, which
          // reads the file back and counts the bezier curves.
          cornerRadius: eventCornerRadiusPx(dayColumnWidth - 4, bandHeight),
        });
        const labelFontSize = ptToPx(EVENT_LABEL_PT);
        elements.push({
          id: id(`d${d}-allday-label`),
          type: "text",
          x: dayX + 2 + ptToPx(EVENT_TEXT_PADDING_PT),
          y: capCentredTextY(bandTop, bandHeight, labelFontSize, FONT_FAMILY),
          width: dayColumnWidth - 4 - ptToPx(EVENT_TEXT_PADDING_PT) * 2,
          height: labelFontSize * 1.2,
          text: label,
          fontSize: labelFontSize,
          fontFamily: FONT_FAMILY,
          fill: eventInk(bandFill),
          align: "left",
        });
      }
    }

    // Synced/manual events for this day, positioned by time — has no
    // well-defined position without a ruled grid to place it against, so
    // skipped entirely in "off" mode. Low-risk today (see
    // src/lib/weekDays.ts's identical note): events is always seeded
    // empty, nothing writes into it yet.
    const timedToday =
      config.intervalMode === "off" ? [] : config.events.filter((e) => e.day === d && !e.allDay);
    const stacking = concurrencyColumns(timedToday);
    for (const event of timedToday) {
      const evStart = timeToMinutes(event.startTime);
      const evEnd = timeToMinutes(event.endTime);
      const evY = gridTop + ((evStart - startMinutes) / intervalMinutes) * rowHeight;
      const evHeight = ((evEnd - evStart) / intervalMinutes) * rowHeight;

      // HELD OFF THE TIME LABELS - see EVENT_LEFT_INSET_PT. Drawn from the
      // column's left edge, the block and its own label sat on top of
      // "8:30".
      const trackX = dayX + ptToPx(EVENT_LEFT_INSET_PT);
      const trackWidth = dayColumnWidth - ptToPx(EVENT_LEFT_INSET_PT) - 2;
      // Its share of the track, if anything else is running at the same time.
      const { column, of } = stacking.get(event) ?? { column: 0, of: 1 };
      const share = trackWidth / of;
      const eventX = trackX + share * column;
      // A hair between neighbours so two blocks read as two, not as one wide
      // one with a line down it. Only between them - the last column keeps
      // the track's full right edge.
      const eventWidth = share - (column < of - 1 ? ptToPx(1) : 0);
      // MARGIN FROM THE HOUR LINES, when asked for - see
      // EVENT_VERTICAL_MARGIN_PT. Never more than a third of the block, or a
      // 15-minute event would be margin with nothing inside it.
      const margin = Math.min(
        ptToPx(config.eventVerticalMarginPt ?? EVENT_VERTICAL_MARGIN_PT),
        Math.max(0, evHeight) / 3
      );
      const eventY = evY + margin;
      const eventHeight = Math.max(evHeight - margin * 2, 4);
      const eventFill = event.colour ?? (event.source === "google-calendar" ? "#cfe3ff" : "#ffe9b3");
      elements.push({
        id: id(`d${d}-ev${event.startTime}-box`),
        type: "figure",
        subType: "rect",
        x: eventX,
        y: eventY,
        width: eventWidth,
        height: eventHeight,
        fill: eventFill,
        stroke: eventBorder(eventFill),
        strokeWidth: ptToPx(EVENT_BORDER_WIDTH_PT),
        opacity: EVENT_OPACITY,
        cornerRadius: eventCornerRadiusPx(eventWidth, eventHeight),
      });
      const eventFontSize = ptToPx(EVENT_LABEL_PT);
      elements.push({
        id: id(`d${d}-ev${event.startTime}-label`),
        type: "text",
        x: eventX + ptToPx(EVENT_TEXT_PADDING_PT),
        // CENTRED IN ITS FIRST ROW, not in the whole block. Asked for as
        // "the text sits in the middle vertically of its row in 30 min
        // events" - and a 30-minute event IS one row, so centring in the
        // block and centring in the row are the same thing there. They part
        // company on a three-hour block, where centring in the block would
        // put the title halfway down a tall empty rectangle; this keeps it
        // in the row the event starts in, which is where the eye goes.
        y: capCentredTextY(eventY, Math.min(eventHeight, rowHeight), eventFontSize, FONT_FAMILY),
        width: eventWidth - ptToPx(EVENT_TEXT_PADDING_PT) * 2,
        height: eventFontSize * 1.2,
        text: event.label,
        fontSize: eventFontSize,
        fontFamily: FONT_FAMILY,
        fill: eventInk(eventFill),
        align: "left",
      });
    }
  }

  return elements;
}
