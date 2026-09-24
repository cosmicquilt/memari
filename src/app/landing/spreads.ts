// The weekly spreads the landing page's journal opens to and turns through.
//
// REAL LAYOUTS, DRAWN BY THE REAL RENDERERS. Each spread is the weekly
// template's structure - the week title, the hours across both pages, a
// sidebar and a zone under the hours - with those zones filled from the
// module catalogue, and every module drawn by the same renderModuleInstance
// the editor and the PDF export use. The landing page shows what Memari
// actually prints, not an illustration of it.
//
// Consecutive weeks, starting with this one: turning the page is turning to
// next week, the way it is in a real journal.
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
import { MODULE_REGISTRY, getMinRowSpanForSlug, moduleSchemaDefaults } from "@/lib/moduleRegistry";
import { PLANNER_TRIMS } from "@/lib/planner-trims";
import { resolveFontFamily, type FontChoice } from "@/lib/theme";
import { WEEK_TITLE_ROW_SPAN } from "@/lib/pageLayouts";
import { dateRangeLabel } from "@/lib/pageLevels";

const TRIM = PLANNER_TRIMS.bound7x10;
export const LANDING_PAGE_GRID: PageGrid = {
  widthPx: TRIM.widthPx,
  heightPx: TRIM.heightPx,
  gridColumns: 24,
  gridRows: TRIM.gridRows,
  boxInsetPx: 6,
  marginPx: TRIM.marginPx,
};

/** Hours on every spread: the template's. Starting earlier on some spreads
 *  would move nothing a visitor notices, so they share one. */
const HOURS = { startTime: "05:30", endTime: "23:30", intervalMinutes: 30, hourLineStyle: "full", dayBorder: false };
const HOURS_ROW_SPAN = 20;
/** The zone under the hours starts a row below them. */
const BELOW_ROW = HOURS_ROW_SPAN + 1;

/** One module in a zone: slug, then its span, then settings on top of its
 *  defaults. */
type Slot = { slug: string; columnStart: number; rowStart: number; columnSpan: number; rowSpan: number; props?: Record<string, unknown> };

type SpreadDef = {
  key: string;
  font: FontChoice;
  weekStartsMonday: boolean;
  /** Top to bottom, 6 columns wide, filling rows 3 to 35. */
  sidebar: Array<[slug: string, rowSpan: number, props?: Record<string, unknown>]>;
  /** Under the left page's hours: columns 6-23, rows 21-35. */
  belowLeft: Slot[];
  /** Under the right page's hours: columns 0-23, rows 21-35. */
  belowRight: Slot[];
};

const box = (heading: string, ruled = false) => ({ heading, ruled, templateHeading: heading });
const below = (slug: string, columnStart: number, rowStart: number, columnSpan: number, rowSpan: number, props?: Record<string, unknown>): Slot => ({
  slug,
  columnStart,
  rowStart,
  columnSpan,
  rowSpan,
  props,
});

/**
 * The spreads, curated rather than random: a random draw from 120 modules
 * mostly produces pages nobody would keep. Each is one kind of week someone
 * really plans - the template, a wellness week, a focus week, training,
 * money, a creative week - so turning the page shows how different one
 * journal can be from the next. Order is shuffled on the page.
 */
export const SPREAD_DEFS: SpreadDef[] = [
  {
    key: "classic",
    font: "serif",
    weekStartsMonday: false,
    sidebar: [
      ["labeled-box", 7, box("Things I'm Grateful For")],
      ["labeled-box", 11, box("Reminders")],
      ["labeled-box", 15, box("Notes")],
    ],
    belowLeft: [below("todo-checklist", 6, BELOW_ROW, 18, 15, { dayCount: 3 })],
    belowRight: [below("todo-checklist", 0, BELOW_ROW, 24, 15, { dayCount: 4 })],
  },
  {
    key: "wellness",
    font: "sans",
    weekStartsMonday: true,
    sidebar: [
      ["weekly-priorities", 11],
      ["mood-tracker", 10],
      ["gratitude-three", 12],
    ],
    belowLeft: [below("habit-tracker", 6, BELOW_ROW, 18, 15)],
    belowRight: [
      below("meal-planner", 0, BELOW_ROW, 24, 6),
      // Plants to water, named, a column a day. (The water strip stood
      // here: its smallest size is two strips, two weeks, so a one-week
      // spread printed "WATER" twice. Water is one of the habits instead.)
      below("plant-care", 0, BELOW_ROW + 6, 16, 9),
      below("labeled-box", 16, BELOW_ROW + 6, 8, 9, box("Notes", true)),
    ],
  },
  {
    key: "focus",
    font: "serif",
    weekStartsMonday: true,
    sidebar: [
      ["daily-big-three", 5],
      ["brain-dump", 12],
      ["someday-maybe", 16],
    ],
    belowLeft: [below("todo-checklist", 6, BELOW_ROW, 18, 15, { dayCount: 3 })],
    belowRight: [
      below("eisenhower-matrix", 0, BELOW_ROW, 12, 15),
      below("labeled-box", 12, BELOW_ROW, 12, 15, box("Wins This Week")),
    ],
  },
  {
    key: "training",
    font: "sans",
    weekStartsMonday: true,
    sidebar: [
      ["stretch-routine", 13],
      // One to five: ten circles do not fit a sidebar and overlap.
      ["energy-pain-scale", 8, { scaleMax: 5 }],
      ["labeled-box", 12, box("Meals")],
    ],
    belowLeft: [below("workout-log", 6, BELOW_ROW, 18, 15)],
    belowRight: [
      below("weekly-workout-plan", 0, BELOW_ROW, 24, 7),
      below("run-log", 0, BELOW_ROW + 7, 12, 8),
      // Recovery beside the runs. (A step counter stood here: a month of
      // squares, 31, in a week, in a box it left three-quarters empty.)
      below("sleep-log", 12, BELOW_ROW + 7, 12, 8),
    ],
  },
  {
    key: "money",
    font: "serif",
    weekStartsMonday: false,
    sidebar: [
      ["no-spend-challenge", 8],
      ["grocery-list", 13],
      ["labeled-box", 12, box("Bills Due")],
    ],
    belowLeft: [below("spending-log", 6, BELOW_ROW, 18, 15)],
    belowRight: [
      below("budget", 0, BELOW_ROW, 12, 15),
      below("savings-goal", 12, BELOW_ROW, 12, 4),
      below("debt-payoff", 12, BELOW_ROW + 4, 12, 4),
      below("labeled-box", 12, BELOW_ROW + 8, 12, 7, box("Notes")),
    ],
  },
  {
    key: "creative",
    font: "sans",
    weekStartsMonday: false,
    sidebar: [
      ["daily-affirmation", 5],
      ["watchlist", 13],
      ["writing-prompt", 15],
    ],
    belowLeft: [below("sketch-box", 6, BELOW_ROW, 18, 15)],
    belowRight: [below("todo-checklist", 0, BELOW_ROW, 24, 15, { dayCount: 4 })],
  },
];

// ---------------------------------------------------------------- regions

/** A rect in print px: x, y, width, height. */
export type Box = [number, number, number, number];

/** Where handwriting can go on a page. Print px throughout. */
export type Region =
  | {
      kind: "hours";
      /** Each day column: its header box, its writing area (right of the
       *  time labels) and the top of each half-hour slot. */
      /** `hours` is each slot's time of day, 24-hour (13.5 is 1:30pm). */
      days: Array<{ label: string; header: Box; area: Box; slots: number[]; hours: number[] }>;
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
    }
  | { kind: "title"; box: Box };

export type LandingPage = { marks: PreviewMark[]; regions: Region[] };
export type LandingSpread = { key: string; fontFamily: string; pages: [LandingPage, LandingPage] };

const isHRule = (m: PreviewMark): m is Extract<PreviewMark, { k: "r" }> => m.k === "r" && m.h <= 3 && m.w >= 60;
const isVRule = (m: PreviewMark): m is Extract<PreviewMark, { k: "r" }> => m.k === "r" && m.w <= 3 && m.h >= 150;

function hoursRegion(marks: PreviewMark[]): Region {
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
      const labelRight = times.length ? Math.max(...times.map((t) => t.x + t.w)) + 6 : h.x;
      const bottom = slots.length ? slots[slots.length - 1] + (slots[1] - slots[0] || 37.5) : h.y + h.h;
      const area: Box = [labelRight, h.y + h.h, h.x + h.w - labelRight, bottom - (h.y + h.h)];
      return { label, header: [h.x, h.y, h.w, h.h] as Box, area, slots, hours };
    });
  return { kind: "hours", days };
}

function boxRegion(slug: string, heading: string, rect: Box, marks: PreviewMark[]): Region {
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
  const cells: Box[] = marks
    .filter((m): m is Extract<PreviewMark, { k: "r" }> => m.k === "r" && !!m.s && m.w >= 14 && m.w <= 64 && Math.abs(m.w - m.h) < 6)
    .filter((m) => m.y >= top && m.y + m.h <= y + h && m.x >= x && m.x + m.w <= x + w)
    .map((m) => [m.x, m.y, m.w, m.h] as Box)
    .sort((a, b) => (Math.abs(a[1] - b[1]) > 4 ? a[1] - b[1] : a[0] - b[0]));
  return { kind: "box", slug, heading, box: rect, content, lines, checkX: vertical ? vertical.x : null, columns, printed, cells };
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
    dayLabels: days.map((d) => ({ name: DAYS[d.getUTCDay()], date: d.getUTCDate() })),
    // The app's own label, so the landing page's week reads as a real one.
    title: { weekNumber, weekTotal: 52, dateRangeLabel: dateRangeLabel(days[0], days[6]) },
  };
}

// ---------------------------------------------------------------- build

type Placed = { slug: string; page: 0 | 1; columnStart: number; rowStart: number; columnSpan: number; rowSpan: number; locked: boolean; props: Record<string, unknown> };

function placementsOf(def: SpreadDef, week: ReturnType<typeof weekOf>): Placed[] {
  const placed: Placed[] = [
    { slug: "week-title", page: 0, columnStart: 0, rowStart: 0, columnSpan: 6, rowSpan: WEEK_TITLE_ROW_SPAN, locked: true, props: week.title },
    {
      slug: "hourly-grid-core",
      page: 0,
      columnStart: 6,
      rowStart: 0,
      columnSpan: 18,
      rowSpan: HOURS_ROW_SPAN,
      locked: true,
      props: { dayCount: 3, dayLabels: week.dayLabels.slice(0, 3), ...HOURS, events: [] },
    },
    {
      slug: "hourly-grid-core",
      page: 1,
      columnStart: 0,
      rowStart: 0,
      columnSpan: 24,
      rowSpan: HOURS_ROW_SPAN,
      locked: true,
      props: { dayCount: 4, dayLabels: week.dayLabels.slice(3), ...HOURS, events: [] },
    },
  ];
  // A module arrives the way the editor's palette drops it: filled with its
  // catalogue entry's words (its heading, its labels, its rows), and then
  // whatever the spread sets. Without the catalogue's, a preset draws as its
  // bare primitive - an untitled box, a matrix labelled Q1 to Q4, a progress
  // meter with nothing in it - which is what the spreads did until
  // 2026-09-23 ("some don't have title ... drawing over a blank").
  const filled = (slug: string, props?: Record<string, unknown>) => ({ ...moduleSchemaDefaults(slug), ...(props ?? {}) });
  let row = WEEK_TITLE_ROW_SPAN;
  for (const [slug, rowSpan, props] of def.sidebar) {
    placed.push({ slug, page: 0, columnStart: 0, rowStart: row, columnSpan: 6, rowSpan, locked: false, props: filled(slug, props) });
    row += rowSpan;
  }
  for (const s of def.belowLeft) placed.push({ ...s, page: 0, locked: false, props: filled(s.slug, s.props) });
  for (const s of def.belowRight) placed.push({ ...s, page: 1, locked: false, props: filled(s.slug, s.props) });
  return placed;
}

/** Every placement fits its page, overlaps nothing and is at least as tall
 *  as its content needs. Thrown rather than drawn wrong - see
 *  spreads.test.mts, which runs it for every spread. */
export function spreadProblems(def: SpreadDef): string[] {
  const problems: string[] = [];
  const placed = placementsOf(def, weekOf(new Date(Date.UTC(2026, 0, 5)), def.weekStartsMonday, 0));
  for (const p of placed) {
    if (!(p.slug in MODULE_REGISTRY)) problems.push(`${def.key}: no module "${p.slug}"`);
    if (p.columnStart < 0 || p.columnStart + p.columnSpan > 24 || p.rowStart < 0 || p.rowStart + p.rowSpan > LANDING_PAGE_GRID.gridRows) {
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
  return problems;
}

function buildSpread(def: SpreadDef, week: ReturnType<typeof weekOf>): LandingSpread {
  const fontFamily = resolveFontFamily(def.font);
  const pages: [LandingPage, LandingPage] = [
    { marks: [], regions: [] },
    { marks: [], regions: [] },
  ];
  for (const p of placementsOf(def, week)) {
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
    if (p.slug === "hourly-grid-core") page.regions.push(hoursRegion(marks));
    else if (p.slug === "week-title") page.regions.push({ kind: "title", box });
    else page.regions.push(boxRegion(p.slug, String(p.props.heading ?? MODULE_REGISTRY[p.slug]?.label ?? p.slug), box, marks));
  }
  return { key: def.key, fontFamily, pages };
}

/** The spreads for the week containing `today`, then the weeks after it. */
export function landingSpreads(today = new Date()): LandingSpread[] {
  return SPREAD_DEFS.map((def, index) => buildSpread(def, weekOf(today, def.weekStartsMonday, index)));
}
