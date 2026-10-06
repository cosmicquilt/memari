// Every spread the landing page's journal turns through, in order (Andrew,
// 2026-10-06: "add back in the previous layouts and flesh these layouts out
// by adding more variation (turning increments off), having monthly
// spreads, daily spreads, custom pages of just modules, all well thought
// out").
//
// FOUR KINDS OF SPREAD, the four a Memari book is made of:
//
//   week   the hours across both pages, a sidebar and a zone under the
//          hours - archetypes.ts's people, the six themed weeks the hero
//          showed before them, and weeks whose hours are set differently:
//          by the hour, a shorter day, or increments off (dotted or blank
//          days, written as a list - see `log`).
//   month  the month's calendar across both pages under its title, a
//          sidebar, and a zone under the calendar (pageLayouts.ts's
//          monthLayout).
//   day    a day a page, two facing days of the same template: the day's
//          hours beside a sidebar, a zone under them (dayLayout).
//   pages  pages of modules and nothing else - the extra pages a book can
//          carry at any level, with no spine to fit round.
//
// Each is drawn by the real renderers (spreads.ts) and written in by the
// handwriting (handwriting/plan.ts) from the same fields as a person's week:
// a hand, what is on its calendar, what was written where.
//
// A month's calendar draws no events (month-grid-core has none yet), and a
// week with increments off draws none either (hourly-grid-core leaves them
// out with no hours to place them by). So those spreads have no calendar,
// and nothing scheduled is written on them by hand instead: scheduled things
// are the app's events (2026-10-06) - a month carries what was written after
// the fact, and a dotted day what a person lists.
//
// Data only: no registry, no React. Imported by the server (layouts) and
// the browser (handwriting, the gallery's placeholders).

import type { FontChoice } from "@/lib/theme";
import { PEOPLE, type Person, type Slot, type WeekLayout } from "./archetypes";
import { EXTRA_SPREADS } from "./heroExtras";

// ------------------------------------------------------------------ layout

/** The hours' settings, over the template's (05:30 to 23:30, half hours,
 *  9pt rows): the same fields the editor's Hours settings set. */
export type HoursSettings = {
  startTime?: string;
  endTime?: string;
  intervalMinutes?: 30 | 60;
  /** A 60-minute row the height of a 30-minute one. */
  compactHourRows?: boolean;
  rowHeightPt?: 9 | 12 | 18;
  /** Increments off: no rows, no times - a dotted or blank field. */
  intervalMode?: "on" | "off";
  offModeRule?: "dotted" | "none";
  timeFormat?: "12" | "24";
};

/** A week, as archetypes.ts lays one out, with its hours set its own way.
 *  `hoursRows` is the hours' height in rows (20 for the template's); the
 *  zones under them are placed by their own rows, a row below. */
export type WeekSpread = WeekLayout & { kind: "week"; hours?: HoursSettings; hoursRows?: number };

/** A month: its title over a six-column sidebar (rows 2 to 35), the
 *  calendar across both pages (rows 0 to 15) and a zone under it (rows 17
 *  to 35) - pageLayouts.ts's monthLayout. */
export type MonthSpread = {
  kind: "month";
  font: FontChoice;
  weekStartsMonday: boolean;
  /** What each day holds under its date. */
  inside?: "none" | "lined" | "dotted";
  sidebar: Array<[slug: string, rowSpan: number, props?: Record<string, unknown>]>;
  belowLeft: Slot[];
  belowRight: Slot[];
};

/** Two facing days of one daily template: on each page the day's hours in
 *  columns 6 to 23 (`hoursRows` tall), a sidebar in columns 0 to 5 from the
 *  top, and a zone under the hours. `firstDay` is which day of the week
 *  the left page is (0 is the week's first). */
export type DaySpread = {
  kind: "day";
  font: FontChoice;
  weekStartsMonday: boolean;
  firstDay: number;
  hours?: HoursSettings;
  hoursRows: number;
  sidebar: Array<[slug: string, rowSpan: number, props?: Record<string, unknown>]>;
  below: Slot[];
};

/** Pages of modules only, placed anywhere. */
export type PagesSpread = { kind: "pages"; font: FontChoice; weekStartsMonday: boolean; pages: [Slot[], Slot[]] };

export type HeroLayout = WeekSpread | MonthSpread | DaySpread | PagesSpread;

// ------------------------------------------------------------- the writing

/**
 * What a month has written in it: the days so far crossed off (the date's
 * box struck through) and today ringed, and in a day's square what was
 * written there - after the fact, mostly. `date` is the day of the month.
 */
export type MonthWriting = {
  /** The day it is "now": earlier dates are crossed off, this one ringed. */
  today: number;
  notes: Array<{ date: number; text?: string; doodle?: string; mark?: "circle" | "underline" | "highlight" }>;
};

/** Everything written on a spread - the same fields as a person's week. */
export type Writing = Pick<
  Person,
  "hand" | "doodles" | "events" | "calendar" | "banner" | "lists" | "tables" | "trackers" | "trackerMark" | "eisenhower" | "fills" | "strips" | "ratings" | "charts"
> & {
  /**
   * A day with increments off, written as a list: one array per day
   * column, in the spread's order, top down. Each entry may start with a
   * Bullet Journal signifier - "x " done, "> " moved on, "o " an event, "- "
   * a note - and is a task (a dot) without one.
   */
  log?: string[][];
  month?: MonthWriting;
};

export type HeroSpread = Writing & {
  key: string;
  layout: HeroLayout;
  /** Why it is not on the live site yet, if it is not (archetypes.ts). */
  held?: string;
};

// ------------------------------------------------------------------ order

const personWeek = (p: Person): HeroSpread => {
  const { key, held, layout, hand, doodles, events, calendar, banner, lists, tables, trackers, trackerMark, eisenhower, fills, strips, ratings, charts } = p;
  return { key, held, layout: { kind: "week", ...layout }, hand, doodles, events, calendar, banner, lists, tables, trackers, trackerMark, eisenhower, fills, strips, ratings, charts };
};

const BY_KEY: Record<string, HeroSpread> = Object.fromEntries([...PEOPLE.map(personWeek), ...EXTRA_SPREADS].map((s) => [s.key, s]));

/**
 * The order the journal turns through them: the student first, the jobs
 * most people do early (2026-10-06), and the kinds mixed so that the next
 * page is rarely the same kind as the last - a week, then a month, a day,
 * pages of modules. Held weeks last; they are not on the live site.
 */
const ORDER = [
  "student",
  "nine-to-five",
  "classic",
  "month-family",
  "nurse",
  "day-adhd",
  "wellness",
  "teacher",
  "pages-trip",
  "maker",
  "rapid-log",
  "parent",
  "month-money",
  "focus",
  "fitness",
  "home",
  "day-stoic",
  "training",
  "adhd",
  "pages-reading",
  "money",
  "philosophy",
  "lisbon",
  "month-student",
  "creative",
  "chronic-illness",
  "pages-kitchen",
  "faith-christian",
  "faith-muslim",
  "faith-jewish",
  "recovery",
];

export const HERO_SPREADS: HeroSpread[] = ORDER.map((key) => {
  const spread = BY_KEY[key];
  if (!spread) throw new Error(`heroSpreads: no spread "${key}"`);
  return spread;
});

export const HERO_BY_KEY: Record<string, HeroSpread> = Object.fromEntries(HERO_SPREADS.map((s) => [s.key, s]));

/** What the hero shows: everything in development, and on the live site
 *  everything not held for a read-through. */
export function heroSpreads(production = process.env.NODE_ENV === "production"): HeroSpread[] {
  return HERO_SPREADS.filter((s) => !(production && s.held));
}
