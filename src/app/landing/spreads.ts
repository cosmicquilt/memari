// The spreads the landing page's journal opens to and turns through.
//
// REAL LAYOUTS, DRAWN BY THE REAL RENDERERS. Each spread is one of a book's
// four kinds (heroSpreads.ts) - a week, a month, two facing days, or pages
// of modules - with its spine where the app puts it (the hours, the month's
// calendar) and its zones filled from the module catalogue, and every
// module drawn by the same renderModuleInstance the editor and the PDF
// export use. The landing page shows what Memari actually prints, not an
// illustration of it.
//
// Dated from this week on: the n-th spread is in the n-th week from now -
// its week, the month that week is in, or two of its days.
//
// Alongside the drawing, each page carries its WRITABLE REGIONS - where a day
// column's half-hour slots are, where a box's ruled lines and a to-do's
// checkboxes sit - read off the drawing itself, so the handwriting lands on
// the lines the page actually has. See handwriting/plan.ts for how they are
// written in.
//
// Server-only: it imports the whole module registry, which the browser has
// no reason to download.

import { renderModuleInstance } from "@/lib/renderModuleInstance";
import { flatten } from "@/lib/proofSvg";
import { toPreviewMarks, type PreviewMark } from "@/lib/previewMarks";
import { gridCellToPixels, type PageGrid } from "@/lib/grid";
import { MODULE_REGISTRY, getMinRowSpanForSlug, moduleDefinition, moduleSchemaDefaults } from "@/lib/moduleRegistry";
import { PLANNER_TRIMS } from "@/lib/planner-trims";
import { resolveFontFamily } from "@/lib/theme";
import { MONTH_GRID_ROW_SPAN, MONTH_TITLE_ROW_SPAN, WEEK_TITLE_ROW_SPAN } from "@/lib/pageLayouts";
import { dateRangeLabel } from "@/lib/pageLevels";
import { computeMonthCalendar, type MonthCalendarCell } from "@/lib/monthCalendar";
import { layoutPlacements, type CalendarBlock, type Slot } from "./archetypes";
import { BASE_SPREAD, HERO_SPREADS, heroSpreads, type HeroSpread, type HoursSettings } from "./heroSpreads";
import { EVENT_PRINT_GREY, type HourlyGridEvent } from "@/lib/modules/hourlyGridCore";

const TRIM = PLANNER_TRIMS.bound7x10;
export const LANDING_PAGE_GRID: PageGrid = {
  widthPx: TRIM.widthPx,
  heightPx: TRIM.heightPx,
  gridColumns: 24,
  gridRows: TRIM.gridRows,
  boxInsetPx: 6,
  marginPx: TRIM.marginPx,
};

/** The template's hours, which a spread's own settings go over. */
const HOURS = { startTime: "05:30", endTime: "23:30", intervalMinutes: 30, hourLineStyle: "full", dayBorder: false };
const HOURS_ROW_SPAN = 20;

/** The spreads, in the order the journal turns through them. */
export const SPREAD_DEFS: HeroSpread[] = HERO_SPREADS;

// ---------------------------------------------------------------- regions

/** A rect in print px: x, y, width, height. */
export type Box = [number, number, number, number];

/** Where handwriting can go on a page. Print px throughout. */
export type Region =
  | {
      kind: "hours";
      /** Each day column: its header box, its writing area (right of the
       *  time labels) and the top of each half-hour slot. */
      /** `hours` is each slot's time of day, 24-hour (13.5 is 1:30pm).
       *  With increments off a day is `free`: no times, and its slots are
       *  the half-rows of the page's dot lattice, every other one a dot. */
      days: Array<{ label: string; header: Box; area: Box; slots: number[]; hours: number[]; free?: boolean }>;
    }
  | {
      kind: "month";
      /** Each day of the month's calendar on this page, in reading order:
       *  its date's box, the square under it, and whether it is in the
       *  month (the calendar's first and last rows run into the months
       *  either side). */
      cells: Array<{ date: number | null; inMonth: boolean; dateBox: Box; body: Box }>;
    }
  | {
      kind: "box";
      slug: string;
      heading: string;
      box: Box;
      /** Below the heading's rule. */
      content: Box;
      /** Writing lines - ruled ones where the page has them. y of each rule
       *  and the x-extent of the line. */
      lines: Array<[y: number, x0: number, x1: number]>;
      /** A checkbox column beside the lines, where the page has one. */
      checkX: number | null;
      /** x of each vertical rule inside the content - a table's columns. */
      columns: number[];
      /** Every printed word inside the content, so ink never lands on one. */
      printed: Box[];
      /** Small square cells to fill in - a progress meter's, a calendar's
       *  day boxes - in reading order. */
      cells: Box[];
      /** What draws it (moduleRegistry's primitive): an icon strip, a
       *  rating strip, a day chart... - how the hand fills it in. */
      primitive: string;
      /** For those three, what gets filled, in reading order: an icon
       *  strip's icons, a rating strip's bubbles, a day chart's dots. */
      targets: Box[];
    }
  | { kind: "title"; box: Box };

export type LandingPage = { marks: PreviewMark[]; regions: Region[] };
export type LandingSpread = { key: string; fontFamily: string; pages: [LandingPage, LandingPage] };

const isHRule = (m: PreviewMark): m is Extract<PreviewMark, { k: "r" }> => m.k === "r" && m.h <= 3 && m.w >= 60;
const isVRule = (m: PreviewMark): m is Extract<PreviewMark, { k: "r" }> => m.k === "r" && m.w <= 3 && m.h >= 150;

/** The page lattice's first row (a row of its dots) at or below y. */
const latticeRow = (y: number) => LANDING_PAGE_GRID.marginPx + Math.ceil((y - LANDING_PAGE_GRID.marginPx) / 75 - 1e-6) * 75;

function hoursRegion(marks: PreviewMark[], free: boolean, bottom: number): Region {
  // Day headers are the heavy-outlined boxes along the top; their names are
  // the upper-case words in them. Slots are the time labels, one per half
  // hour, repeated in each day's column.
  const headers = marks.filter(
    (m): m is Extract<PreviewMark, { k: "r" }> => m.k === "r" && !!m.s && (m.sw ?? 0) > 1.5 && m.h > 40 && m.h < 80
  );
  const texts = marks.filter((m): m is Extract<PreviewMark, { k: "t" }> => m.k === "t");
  const days = headers
    .sort((a, b) => a.x - b.x)
    .map((h) => {
      const label = texts.find((t) => t.x >= h.x - 2 && t.x < h.x + h.w && t.y >= h.y - 4 && t.y < h.y + h.h && /^[A-Z]+$/.test(t.t))?.t ?? "";
      const times = texts.filter((t) => /^\d{1,2}:\d{2}$/.test(t.t) && t.x >= h.x - 4 && t.x < h.x + h.w);
      times.sort((a, b) => a.y - b.y);
      const slots = times.map((t) => t.y);
      // The labels are 12-hour and unmarked: past noon where the hour drops.
      let pm = 0;
      let prev = 0;
      const hours = times.map((t) => {
        const [hh, mm] = t.t.split(":").map(Number);
        if (hh + mm / 60 + pm < prev) pm += 12;
        prev = hh + mm / 60 + pm;
        return prev;
      });
      if (free) {
        // No times to write by: the day is a field, written down from the
        // top on the lattice's rows - in half rows, so that the banner and
        // a two-line entry keep the proportions they have in the hours.
        const area: Box = [h.x, h.y + h.h, h.w, bottom - (h.y + h.h)];
        const first = latticeRow(h.y + h.h + 30);
        const half = Array.from({ length: Math.max(0, Math.floor((bottom - 20 - first) / 37.5) + 1) }, (_, i) => first + i * 37.5);
        return { label, header: [h.x, h.y, h.w, h.h] as Box, area, slots: half, hours: [], free: true };
      }
      const labelRight = times.length ? Math.max(...times.map((t) => t.x + t.w)) + 6 : h.x;
      const end = slots.length ? slots[slots.length - 1] + (slots[1] - slots[0] || 37.5) : h.y + h.h;
      const area: Box = [labelRight, h.y + h.h, h.x + h.w - labelRight, end - (h.y + h.h)];
      return { label, header: [h.x, h.y, h.w, h.h] as Box, area, slots, hours };
    });
  return { kind: "hours", days };
}

/** The box round an SVG path's points - every number pair in it. */
function pathBox(d: string): Box {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  return [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0];
}

/**
 * What the hand fills in on the three kinds that are filled, not written in
 * (2026-10-06: "I want to fill chart icon strips and bubbles"): an icon
 * strip's icons (outlined glyphs, or outlined circles), a rating strip's
 * bubbles (outlined circles), a day chart's dots (the small filled ones of
 * its grid). In reading order.
 */
function targetsOf(primitive: string, marks: PreviewMark[], inside: (b: { x: number; y: number; w: number; h: number }) => boolean): Box[] {
  const rects = marks.filter((m): m is Extract<PreviewMark, { k: "r" }> => m.k === "r");
  const round = (m: { w: number; h: number; r?: number }) => (m.r ?? 0) >= Math.min(m.w, m.h) * 0.4 && Math.abs(m.w - m.h) < 4;
  let boxes: Box[] = [];
  if (primitive === "icon-strip") {
    const glyphs = marks.filter((m): m is Extract<PreviewMark, { k: "p" }> => m.k === "p" && !!m.s && !m.f).map((m) => pathBox(m.d));
    const outlined = rects.filter((m) => !!m.s && !m.f && m.w >= 12 && m.w <= 64 && Math.abs(m.w - m.h) < 4).map((m) => [m.x, m.y, m.w, m.h] as Box);
    boxes = [...glyphs, ...outlined];
  } else if (primitive === "rating-strip") {
    boxes = rects.filter((m) => !!m.s && round(m) && m.w >= 18 && m.w <= 64).map((m) => [m.x, m.y, m.w, m.h] as Box);
  } else if (primitive === "day-chart") {
    boxes = rects.filter((m) => !!m.f && !m.s && round(m) && m.w <= 14).map((m) => [m.x, m.y, m.w, m.h] as Box);
  }
  return boxes
    .filter(([bx, by, bw, bh]) => inside({ x: bx, y: by, w: bw, h: bh }))
    .sort((a, b) => (Math.abs(a[1] - b[1]) > Math.min(a[3], b[3]) * 0.5 ? a[1] - b[1] : a[0] - b[0]));
}

function boxRegion(slug: string, primitive: string, heading: string, rect: Box, marks: PreviewMark[]): Region {
  const [x, y, w, h] = rect;
  const rules = marks.filter(isHRule).filter((m) => m.y > y + 4 && m.y < y + h - 4);
  // The heading's rule: the first full-width rule near the top.
  const headerRule = rules.find((m) => m.y < y + 120 && m.w > w * 0.8);
  const top = headerRule ? headerRule.y + headerRule.h : y;
  const content: Box = [x, top, w, y + h - top];
  const lineRules = rules.filter((m) => m !== headerRule && m.y > top + 8).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Array<[number, number, number]> = lineRules.map((m) => [m.y, m.x, m.x + m.w]);
  const verticals = marks.filter(isVRule).filter((m) => m.x > x + 4 && m.x < x + w - 4 && m.y + m.h > top + 20);
  const vertical = verticals.find((m) => m.x < x + 120 && m.y >= top - 4);
  const columns = [...new Set(verticals.map((m) => Math.round(m.x)))].sort((a, b) => a - b);
  const printed: Box[] = marks
    .filter((m): m is Extract<PreviewMark, { k: "t" }> => m.k === "t")
    .filter((t) => t.y + t.z > top + 2 && t.y < y + h && t.x < x + w && t.x + t.w > x)
    .map((t) => [Math.round(t.x), Math.round(t.y), Math.round(t.w), Math.round(t.z * 1.25)] as Box);
  const inside = (m: { x: number; y: number; w: number; h: number }) => m.y >= top && m.y + m.h <= y + h && m.x >= x && m.x + m.w <= x + w;
  const squares: Box[] = marks
    .filter((m): m is Extract<PreviewMark, { k: "r" }> => m.k === "r" && !!m.s && m.w >= 14 && m.w <= 64 && Math.abs(m.w - m.h) < 6)
    .filter(inside)
    .map((m) => [m.x, m.y, m.w, m.h] as Box);
  // A progress meter's row of marks is one outlined strip divided by
  // hairlines (since its rework), not a square per mark: each gap between
  // dividers is a cell. (2026-10-06: the 90-in-90 meter came out with no
  // cells, so nothing was filled in.)
  const stripCells: Box[] = squares.length
    ? []
    : marks
        // Its first strip sits on the heading's rule (a hair above where the
        // content is taken to start), and a short meter's strips stretch to
        // fill the box - up to twice a row's height.
        .filter((m): m is Extract<PreviewMark, { k: "r" }> => m.k === "r" && !!m.s && m.h >= 14 && m.h <= 160 && m.w > m.h * 3)
        .filter((m) => inside({ ...m, y: m.y + 2, h: m.h - 2 }))
        .flatMap((strip) => {
          const dividers = marks
            .filter((m): m is Extract<PreviewMark, { k: "r" }> => m.k === "r" && !m.s && m.w <= 3 && Math.abs(m.y - strip.y) < 2 && Math.abs(m.h - strip.h) < 3 && m.x > strip.x + 2 && m.x < strip.x + strip.w - 2)
            .map((m) => m.x)
            .sort((p, q) => p - q);
          if (dividers.length < 3) return [];
          const edges = [strip.x, ...dividers, strip.x + strip.w];
          return edges.slice(1).map((right, i) => [edges[i], strip.y, right - edges[i], strip.h] as Box);
        });
  const cells: Box[] = [...squares, ...stripCells].sort((a, b) => (Math.abs(a[1] - b[1]) > 4 ? a[1] - b[1] : a[0] - b[0]));
  // A few px of slack: an icon strip's glyphs sit half a pixel past its box.
  const targets = targetsOf(primitive, marks, (m) => m.y >= top - 4 && m.y + m.h <= y + h + 4 && m.x >= x - 4 && m.x + m.w <= x + w + 4);
  return { kind: "box", slug, heading, box: rect, content, lines, checkX: vertical ? vertical.x : null, columns, printed, cells, primitive, targets };
}

/**
 * A month's calendar on one page: each date's box (the small square in a
 * day's top corner) in reading order, matched to the calendar the grid was
 * drawn from, and the square under it to write in.
 *
 * Found by the box's RIGHT SIDE, a short vertical rule the height of the
 * date strip: the grid draws only that side now - its top, left and bottom
 * are the week's, column's and strip's rules, and drawing them again as an
 * outlined box doubled them on screen (monthGridCore, 2026-10-06). The box
 * is square, so it is the side's height back to the left from it.
 */
function monthRegion(marks: PreviewMark[], cells: MonthCalendarCell[][], rect: Box): Region {
  const [x, y, w, h] = rect;
  const dayCount = cells[0]?.length ?? 1;
  const boxes = marks
    .filter((m): m is Extract<PreviewMark, { k: "r" }> => m.k === "r" && !!m.f && !m.s && m.w <= 4 && m.h >= 24 && m.h <= 56)
    .map((m) => ({ x: m.x + m.w / 2 - m.h, y: m.y, w: m.h, h: m.h }))
    .filter((m) => m.x >= x - 2 && m.x + m.w <= x + w + 2 && m.y >= y - 2 && m.y + m.h <= y + h + 2)
    .sort((a, b) => (Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x));
  const flat = cells.flat();
  if (boxes.length !== flat.length) return { kind: "month", cells: [] };
  const columnWidth = w / dayCount;
  const rows = [...new Set(boxes.map((b) => Math.round(b.y)))].sort((a, b) => a - b);
  const rowHeight = rows.length > 1 ? rows[1] - rows[0] : y + h - rows[0];
  return {
    kind: "month",
    cells: boxes.map((b, i) => ({
      date: flat[i].date ?? null,
      inMonth: flat[i].inCurrentMonth,
      dateBox: [b.x, b.y, b.w, b.h] as Box,
      body: [b.x, b.y + b.h, columnWidth, Math.min(rowHeight, y + h - b.y) - b.h] as Box,
    })),
  };
}

// ---------------------------------------------------------------- dates

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

function weekOf(today: Date, weekStartsMonday: boolean, weeksAhead: number) {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const back = (start.getUTCDay() - (weekStartsMonday ? 1 : 0) + 7) % 7;
  start.setUTCDate(start.getUTCDate() - back + weeksAhead * 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d;
  });
  const yearStart = Date.UTC(start.getUTCFullYear(), 0, 1);
  const weekNumber = Math.floor((start.getTime() - yearStart) / (7 * 86400000)) + 1;
  return {
    days,
    dayLabels: days.map((d) => ({ name: DAYS[d.getUTCDay()], date: d.getUTCDate() })),
    // The app's own label, so the landing page's week reads as a real one.
    title: { weekNumber, weekTotal: 52, dateRangeLabel: dateRangeLabel(days[0], days[6]) },
  };
}

// ---------------------------------------------------------------- build

/** "HH:MM" for an hour of the day, 24-hour (13.5 is "13:30"). */
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

/** Hours as a number, 24-hour ("13:30" is 13.5). */
const hourOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h + m / 60;
};

/** A spread's hours: the template's, with its own settings over them. */
const hoursFor = (settings?: HoursSettings) => ({ ...HOURS, ...(settings ?? {}) });

/**
 * A calendar as the hours' event blocks, page by page - drawn by
 * hourly-grid-core the way the editor draws imported and typed-in events,
 * and in the print grey: the hero's journal is a PRINTED book ("colour on
 * screen, grey on paper", 2026-09-26; Andrew, 2026-10-06: "shouldn't they
 * be grey"). At the module's own event opacity, as everywhere.
 * A block running past midnight (a night shift) is two: the evening, and
 * the next morning from the hours' start. Clipped to the hours shown.
 * `perPage` is how many days each page's hours hold: a week's three and
 * four, or a day page's one.
 */
export function calendarEvents(
  calendar: CalendarBlock[],
  perPage: [number, number] = [3, 4],
  hours: { startTime: string; endTime: string } = HOURS
): [HourlyGridEvent[], HourlyGridEvent[]] {
  const [first, last] = [hourOf(hours.startTime), hourOf(hours.endTime)];
  const pages: [HourlyGridEvent[], HourlyGridEvent[]] = [[], []];
  const put = (day: number, start: number, end: number, block: CalendarBlock) => {
    if (day >= perPage[0] + perPage[1] || end <= first || start >= last) return;
    const page = day < perPage[0] ? 0 : 1;
    pages[page].push({
      day: page === 0 ? day : day - perPage[0],
      startTime: hhmm(Math.max(first, start)),
      endTime: hhmm(Math.min(last, end)),
      label: block.title,
      source: "manual",
      colour: EVENT_PRINT_GREY,
    });
  };
  for (const block of calendar) {
    put(block.day, block.start, Math.min(block.end, 24), block);
    if (block.end > 24) put(block.day + 1, 0, block.end - 24, block);
  }
  return pages;
}

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

type Placed = { slug: string; page: 0 | 1; columnStart: number; rowStart: number; columnSpan: number; rowSpan: number; locked: boolean; props: Record<string, unknown> };
type When = ReturnType<typeof weekOf>;

/** A stack down the six-column sidebar from `row`. */
function stack(sidebar: Array<[slug: string, rowSpan: number, props?: Record<string, unknown>]>, page: 0 | 1, row: number): Array<Slot & { page: 0 | 1 }> {
  return sidebar.map(([slug, rowSpan, props]) => {
    const at = row;
    row += rowSpan;
    return { slug, page, columnStart: 0, rowStart: at, columnSpan: 6, rowSpan, props };
  });
}

/**
 * Where everything on a spread goes. The spine first - the hours, or the
 * month's calendar, locked where the app locks them - then the modules
 * around it.
 */
function placementsOf(def: HeroSpread, when: When): Placed[] {
  const { layout } = def;
  const weekStartDay = layout.weekStartsMonday ? 1 : 0;
  const placed: Placed[] = [];
  const spine = (p: Omit<Placed, "locked">) => placed.push({ ...p, locked: true });
  const modules: Array<Slot & { page: 0 | 1 }> = [];

  if (layout.kind === "week") {
    const hours = hoursFor(layout.hours);
    const rowSpan = layout.hoursRows ?? HOURS_ROW_SPAN;
    // With increments off the hours draw no events: nothing to place them by.
    const events = hours.intervalMode === "off" ? [[], []] : calendarEvents(def.calendar, [3, 4], hours);
    // Undated (the base week, a free printable): no numbers, no dates -
    // the absence of the values, as everywhere in the app.
    const title = def.undated ? { dateRangeLabel: "" } : when.title;
    const dayLabels = def.undated ? when.dayLabels.map(({ name }) => ({ name })) : when.dayLabels;
    spine({ slug: "week-title", page: 0, columnStart: 0, rowStart: 0, columnSpan: 6, rowSpan: WEEK_TITLE_ROW_SPAN, props: title });
    spine({ slug: "hourly-grid-core", page: 0, columnStart: 6, rowStart: 0, columnSpan: 18, rowSpan, props: { dayCount: 3, dayLabels: dayLabels.slice(0, 3), ...hours, events: events[0] } });
    spine({ slug: "hourly-grid-core", page: 1, columnStart: 0, rowStart: 0, columnSpan: 24, rowSpan, props: { dayCount: 4, dayLabels: dayLabels.slice(3), ...hours, events: events[1] } });
    modules.push(...layoutPlacements(layout));
  } else if (layout.kind === "month") {
    // The month this week is in (its middle day's), as pageLayouts.ts's
    // monthLayout lays it out: the calendar's first three days on the left
    // page, the other four on the right.
    const middle = when.days[3];
    const month = middle.getUTCMonth() + 1;
    const calendar = computeMonthCalendar(middle.getUTCFullYear(), month, weekStartDay);
    const names = Array.from({ length: 7 }, (_, i) => DAYS[(weekStartDay + i) % 7]);
    spine({ slug: "month-title", page: 0, columnStart: 0, rowStart: 0, columnSpan: 6, rowSpan: MONTH_TITLE_ROW_SPAN, props: { monthName: MONTHS[month - 1] } });
    const grid = (page: 0 | 1, from: number, dayCount: number, columnStart: number, columnSpan: number) =>
      spine({
        slug: "month-grid-core",
        page,
        columnStart,
        rowStart: 0,
        columnSpan,
        rowSpan: MONTH_GRID_ROW_SPAN,
        props: {
          dayCount,
          dayLabels: names.slice(from, from + dayCount).map((name) => ({ name })),
          weekCount: calendar.weekCount,
          cells: calendar.weeks.map((week) => week.slice(from, from + dayCount)),
          inside: layout.inside ?? "none",
        },
      });
    grid(0, 0, 3, 6, 18);
    grid(1, 3, 4, 0, 24);
    modules.push(...stack(layout.sidebar, 0, MONTH_TITLE_ROW_SPAN));
    modules.push(...layout.belowLeft.map((s) => ({ ...s, page: 0 as const })), ...layout.belowRight.map((s) => ({ ...s, page: 1 as const })));
  } else if (layout.kind === "day") {
    // One daily template, printed for two days: the same modules on both
    // pages, each page's hours its own day (and that day's events).
    const hours = hoursFor(layout.hours);
    const events = hours.intervalMode === "off" ? [[], []] : calendarEvents(def.calendar, [1, 1], hours);
    for (const page of [0, 1] as const) {
      const label = when.dayLabels[layout.firstDay + page];
      spine({ slug: "hourly-grid-core", page, columnStart: 6, rowStart: 0, columnSpan: 18, rowSpan: layout.hoursRows, props: { dayCount: 1, dayLabels: [label], ...hours, events: events[page] } });
      modules.push(...stack(layout.sidebar, page, 0), ...layout.below.map((s) => ({ ...s, page })));
    }
  } else {
    layout.pages.forEach((slots, page) => modules.push(...slots.map((s) => ({ ...s, page: page as 0 | 1 }))));
  }

  // A module arrives the way the editor's palette drops it: filled with its
  // catalogue entry's words (its heading, its labels, its rows), and then
  // whatever the spread sets. Without the catalogue's, a preset draws as its
  // bare primitive - an untitled box, a matrix labelled Q1 to Q4, a progress
  // meter with nothing in it - which is what the spreads did until
  // 2026-09-23 ("some don't have title ... drawing over a blank").
  // Every module that prints weekdays starts them on the spread's week
  // start, as in a journal (the registry's weekStart) - a habit tracker on a
  // Monday week printed S M T W T F S until 2026-10-06.
  for (const p of modules) {
    const props = { ...moduleSchemaDefaults(p.slug), ...(p.props ?? {}) };
    const rotate = moduleDefinition(p.slug)?.weekStart;
    placed.push({ ...p, locked: false, props: rotate ? rotate(props, weekStartDay) : props });
  }
  return placed;
}

/**
 * Every placement fits its page, overlaps nothing and is at least as tall
 * as its content needs; and the pages are full - every cell covered but the
 * row a spine keeps clear beneath it - since a hole in a spread reads as a
 * module missing. Thrown rather than drawn wrong - see spreads.test.mts,
 * which runs it for every spread.
 */
export function spreadProblems(def: HeroSpread): string[] {
  const problems: string[] = [];
  const placed = placementsOf(def, weekOf(new Date(Date.UTC(2026, 0, 5)), def.layout.weekStartsMonday, 0));
  const rows = LANDING_PAGE_GRID.gridRows;
  for (const p of placed) {
    if (!(p.slug in MODULE_REGISTRY)) problems.push(`${def.key}: no module "${p.slug}"`);
    if (p.columnStart < 0 || p.columnStart + p.columnSpan > 24 || p.rowStart < 0 || p.rowStart + p.rowSpan > rows) {
      problems.push(`${def.key}: ${p.slug} runs off page ${p.page}`);
    }
    if (!p.locked) {
      const floor = getMinRowSpanForSlug(p.slug, LANDING_PAGE_GRID, p.columnSpan, p.props);
      if (p.rowSpan < floor) problems.push(`${def.key}: ${p.slug} is ${p.rowSpan} rows, needs ${floor}`);
    }
  }
  for (const a of placed) {
    for (const b of placed) {
      if (a === b || a.page !== b.page) continue;
      const overlap =
        a.columnStart < b.columnStart + b.columnSpan &&
        b.columnStart < a.columnStart + a.columnSpan &&
        a.rowStart < b.rowStart + b.rowSpan &&
        b.rowStart < a.rowStart + a.rowSpan;
      if (overlap && a.slug <= b.slug) problems.push(`${def.key}: ${a.slug} overlaps ${b.slug} on page ${a.page}`);
    }
  }
  for (const page of [0, 1] as const) {
    const covered = new Set<number>();
    const mark = (p: { columnStart: number; rowStart: number; columnSpan: number; rowSpan: number }) => {
      for (let r = p.rowStart; r < p.rowStart + p.rowSpan; r++) for (let c = p.columnStart; c < p.columnStart + p.columnSpan; c++) covered.add(r * 24 + c);
    };
    for (const p of placed.filter((q) => q.page === page)) {
      mark(p);
      // The row clear under the hours or the month's calendar.
      if (p.locked && p.slug.endsWith("-core")) mark({ ...p, rowStart: p.rowStart + p.rowSpan, rowSpan: 1 });
    }
    const empty = Array.from({ length: rows * 24 }, (_, i) => i).filter((i) => !covered.has(i));
    if (empty.length > 0) problems.push(`${def.key}: page ${page} has ${empty.length} empty cells, the first at row ${Math.floor(empty[0] / 24)}, column ${empty[0] % 24}`);
  }
  return problems;
}

function buildSpread(def: HeroSpread, when: When): LandingSpread {
  const fontFamily = resolveFontFamily(def.layout.font);
  const pages: [LandingPage, LandingPage] = [
    { marks: [], regions: [] },
    { marks: [], regions: [] },
  ];
  for (const p of placementsOf(def, when)) {
    const elements = flatten(
      renderModuleInstance(
        {
          id: `${def.key}-${p.page}-${p.slug}-${p.rowStart}-${p.columnStart}`,
          locked: p.locked,
          columnStart: p.columnStart,
          rowStart: p.rowStart,
          columnSpan: p.columnSpan,
          rowSpan: p.rowSpan,
          propValues: p.props,
          moduleType: { slug: p.slug },
        },
        LANDING_PAGE_GRID,
        fontFamily
      )
    );
    const marks = toPreviewMarks(elements).marks;
    const page = pages[p.page];
    page.marks.push(...marks);
    const rect = gridCellToPixels(LANDING_PAGE_GRID, p);
    const box: Box = [rect.x, rect.y, rect.width, rect.height];
    if (p.slug === "hourly-grid-core") page.regions.push(hoursRegion(marks, p.props.intervalMode === "off", rect.y + rect.height));
    else if (p.slug === "month-grid-core") page.regions.push(monthRegion(marks, p.props.cells as MonthCalendarCell[][], box));
    else if (p.slug === "week-title" || p.slug === "month-title") page.regions.push({ kind: "title", box });
    else page.regions.push(boxRegion(p.slug, MODULE_REGISTRY[p.slug]?.primitive ?? p.slug, String(p.props.heading ?? MODULE_REGISTRY[p.slug]?.label ?? p.slug), box, marks));
  }
  return { key: def.key, fontFamily, pages };
}

/** The base week, for the loose sheets on the hero's desk (heroExtras.ts,
 *  BASE_SPREAD) - undated, so any week will do. */
export function baseSheetSpread(): LandingSpread {
  return buildSpread(BASE_SPREAD, weekOf(new Date(Date.UTC(2026, 0, 5)), BASE_SPREAD.layout.weekStartsMonday, 0));
}

/** The spreads, the first in the week containing `today` and each after it
 *  a week on - everything in development, and on the live site everything
 *  not held for a read-through (see archetypes.ts). */
export function landingSpreads(today = new Date(), production = process.env.NODE_ENV === "production"): LandingSpread[] {
  return heroSpreads(production).map((def, index) => buildSpread(def, weekOf(today, def.layout.weekStartsMonday, index)));
}
