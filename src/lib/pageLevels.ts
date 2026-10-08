// The recurrence levels of a book, and the one place that knows their order
// and their names.
//
// You design each level once and the book is stamped out from it: a WEEKLY
// page is printed for every week in the planner's date range, a DAILY one
// for every day, front and back matter once. That is sequence generation,
// and it is also the price dial - a per-day module prints about 90 times in
// a quarter where a per-month one prints 3. See the business model.
//
// ONE DESCRIPTION. The order lives in the Prisma enum's declaration order
// (Postgres sorts an enum that way, so `ORDER BY level` is binding order)
// and is RE-STATED here only as a check that the two agree - see
// LEVELS_IN_BINDING_ORDER's own note. Everything else - the display names,
// which levels repeat, how many pages a level has - is derived, not listed
// again somewhere else. This is the file the timeline reads.

import { PageLevel } from "@/generated/prisma/enums";

export type { PageLevel };

/**
 * Every level, in the order the pages are bound.
 *
 * Built from the generated enum object rather than typed out, so a level
 * added to the schema appears here without anyone remembering to. The ORDER
 * comes from the enum's own declaration order, which Prisma preserves and
 * Postgres sorts by - the same order a `ORDER BY level` query returns, so
 * the timeline and the database cannot disagree about which way round the
 * book goes.
 */
export const LEVELS_IN_BINDING_ORDER = Object.values(PageLevel) as PageLevel[];

/**
 * How many pages a level's set STARTS as - its spread.
 *
 * A week and a month are each a thing you look at whole, so they open flat -
 * two pages, the book laid open. A DAY is a day: one page, and ninety of them
 * as spreads is a book twice the size for no more content. Two consecutive
 * days face each other in the bound book anyway. Front and back matter are
 * single pages.
 *
 * Read by the seed, which creates this many pages, and by the timeline,
 * which joins exactly these into one card: a page added with "+" is a page
 * of its own, not the other half of a spread. It lived in actions.ts, where
 * the timeline could not reach it, and the timeline guessed "pairs" for
 * every level instead - so two pages added to Beginning showed as a spread.
 */
export const LEVEL_PAGE_COUNT: Record<PageLevel, number> = {
  FRONT_MATTER: 1,
  MONTHLY: 2,
  WEEKLY: 2,
  DAILY: 1,
  BACK_MATTER: 1,
};

/**
 * A set's pages as the cards the timeline shows: the level's SPREAD - the
 * pages its template starts with, LEVEL_PAGE_COUNT - as one card, then every
 * page after it on a card of its own. A week of [1, 2, 3, 4] is
 * [[1, 2], [3], [4]]; Beginning's [1, 2, 3] is [[1], [2], [3]].
 *
 * The timeline paired every level two at a time, which made two pages added
 * to Beginning look like a spread they never were. Every card of a set still
 * opens the whole set - the canvas draws it all.
 *
 * The one other spread is a SAVED one added after it: `joined(a, b)` says
 * whether page b is the right-hand page of the spread a starts, and a pair it
 * says yes to is one card. Nothing else joins.
 */
export function inSpreads<T>(pages: T[], level: PageLevel, joined: (a: T, b: T) => boolean = () => false): T[][] {
  const spread = Math.max(1, LEVEL_PAGE_COUNT[level]);
  const cards = [pages.slice(0, spread)];
  for (let i = spread; i < pages.length; i++) {
    if (i + 1 < pages.length && joined(pages[i], pages[i + 1])) {
      cards.push([pages[i], pages[i + 1]]);
      i++;
    } else {
      cards.push([pages[i]]);
    }
  }
  return cards.filter((card) => card.length > 0);
}

/**
 * What each level is called on screen.
 *
 * Separate from the enum value on purpose. Andrew's words for the ends were
 * "BEGINNING" and "ENDING", and that "beginning and ending names may be
 * changed" - a display label is a string in this file; an enum value is a
 * migration. FRONT_MATTER/BACK_MATTER are what the book trade calls them and
 * will not need renaming when the screen does.
 */
export const LEVEL_LABELS: Record<PageLevel, string> = {
  FRONT_MATTER: "Beginning",
  MONTHLY: "Monthly",
  WEEKLY: "Weekly",
  DAILY: "Daily",
  BACK_MATTER: "Ending",
};

/**
 * How often this level's pages are printed, said in words.
 *
 * For the timeline, where "printed once" and "printed every week" is the
 * whole explanation of what a level is and why it costs what it costs.
 */
export const LEVEL_CADENCE: Record<PageLevel, string> = {
  FRONT_MATTER: "printed once, at the front",
  MONTHLY: "printed for every month",
  WEEKLY: "printed for every week",
  DAILY: "printed for every day",
  BACK_MATTER: "printed once, at the back",
};

/**
 * What ONE occurrence of this level is called: "month", "week", "day".
 *
 * Stated rather than derived from the label, because deriving it does not
 * work: stripping "ly" off "Monthly" and "Weekly" gives month and week, and
 * off "Daily" gives "dai". That was live in the cog's popover for exactly
 * as long as it took to read it back.
 */
export const LEVEL_NOUN: Record<PageLevel, string> = {
  FRONT_MATTER: "book",
  MONTHLY: "month",
  WEEKLY: "week",
  DAILY: "day",
  BACK_MATTER: "book",
};

/**
 * Does this level repeat, or is it printed once?
 *
 * Derived from the level itself rather than stored: front and back matter
 * are the two that do not repeat, and that is what "matter" means. A level
 * added later says which it is by being named, not by a second list.
 */
export function repeats(level: PageLevel): boolean {
  return level !== PageLevel.FRONT_MATTER && level !== PageLevel.BACK_MATTER;
}

/**
 * Group pages by level, in binding order, with every level present.
 *
 * EMPTY LEVELS ARE INCLUDED, and that is the point: a level with no pages is
 * a real state - skip the dailies and the book gets cheaper - and the
 * timeline still has to show it as somewhere you can add one. A grouping
 * that only returned the levels in use would make an empty level invisible
 * and unreachable.
 */
export function byLevel<T extends { level: PageLevel; position: number }>(
  pages: T[]
): Array<{ level: PageLevel; pages: T[] }> {
  return LEVELS_IN_BINDING_ORDER.map((level) => ({
    level,
    pages: pages.filter((p) => p.level === level).sort((a, b) => a.position - b.position),
  }));
}

/**
 * One occurrence of a level within a book's term.
 *
 * "The third week", "February 2026". This is what a per-occurrence layout is
 * FOR, and what the cog's popup lists.
 */
export type Occurrence = {
  /** Stored in `Page.variantKey` when this occurrence gets its own layout.
   *  Null for a level that does not repeat - front and back matter have one
   *  occurrence and it is the default one. */
  key: string | null;
  /** For a person to read: "February 2026", "Week of 2 Feb". */
  label: string;
  /** The first day this occurrence covers. */
  start: Date;
};

/** Title case, as the month title wants it - it uppercases for itself. */
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * Every occurrence of a level inside a term.
 *
 * THE ONE DESCRIPTION of how a term divides up - printedCount below is its
 * length, rather than a second piece of arithmetic that could disagree.
 * That mattered immediately: the count and the list would have been written
 * separately, and a book that printed 13 weeks but offered 12 to customise
 * is the kind of fault nobody notices until a week is missing.
 *
 * Returns NULL, not an empty list, when a repeating level has no term: the
 * answer is unknown rather than none, and none reads as free.
 *
 * All arithmetic in UTC, so a daylight-saving transition cannot shift a
 * timestamp across a day boundary - the same reasoning monthCalendar.ts
 * already applies to its own day counting.
 */
export function occurrences(
  level: PageLevel,
  start: Date | null | undefined,
  end: Date | null | undefined,
  /** Which weekday a week begins on, 0 = Sunday. The planner's own setting
   *  (theme.weekStartDay), and the same one rotateWeekDays uses to order the
   *  day columns. Weeks MUST be snapped to it - see below. */
  weekStartDay = 0
): Occurrence[] | null {
  // Matter does not repeat, and is printed whether or not a term is set - it
  // is not a function of the calendar.
  if (!repeats(level)) {
    return [{ key: null, label: "Once", start: start ?? new Date(0) }];
  }
  if (!start || !end) return null;
  const days = Math.round((utcDay(end) - utcDay(start)) / 86_400_000) + 1;
  if (days <= 0) return [];

  if (level === PageLevel.DAILY) {
    return Array.from({ length: days }, (_, i) => {
      const day = new Date(utcDay(start) + i * 86_400_000);
      return {
        key: day.toISOString().slice(0, 10),
        label: `${day.getUTCDate()} ${MONTH_NAMES[day.getUTCMonth()].slice(0, 3)} ${day.getUTCFullYear()}`,
        start: day,
      };
    });
  }

  if (level === PageLevel.WEEKLY) {
    // SNAPPED BACK to the planner's own week-start day, not counted forward
    // from the term's first date.
    //
    // The first version counted forward, on the reasoning that a book
    // beginning on a Wednesday should have its first week begin that
    // Wednesday. Generating a real book showed why that is wrong: the
    // spread's day columns are in weekday order (Sunday..Saturday, rotated
    // by weekStartDay), so a week beginning on a Thursday put its dates on
    // the page as 4, 5, 6, 7, 1, 2, 3 - out of order, across a spread
    // somebody is meant to read left to right.
    //
    // Snapping means the first spread carries a few days from before the
    // term starts. That is what every printed planner does, and it is much
    // the lesser evil: those days are simply there, in the right columns.
    const offset = (start.getUTCDay() - weekStartDay + 7) % 7;
    const firstWeek = utcDay(start) - offset * 86_400_000;
    const spanned = Math.round((utcDay(end) - firstWeek) / 86_400_000) + 1;
    return Array.from({ length: Math.ceil(spanned / 7) }, (_, i) => {
      const day = new Date(firstWeek + i * 7 * 86_400_000);
      return {
        key: `W${day.toISOString().slice(0, 10)}`,
        label: `Week of ${day.getUTCDate()} ${MONTH_NAMES[day.getUTCMonth()].slice(0, 3)}`,
        start: day,
      };
    });
  }

  // Calendar months TOUCHED, not 30-day blocks: a book from Jan 28 to Feb 2
  // spans two months and wants a page for each, where days/30 would say one.
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1;
  return Array.from({ length: Math.max(0, months) }, (_, i) => {
    const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    return {
      key: `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}`,
      label: `${MONTH_NAMES[day.getUTCMonth()]} ${day.getUTCFullYear()}`,
      start: day,
    };
  });
}

/**
 * Which occurrence a page is being printed for.
 *
 * Handed to a module's `dated` hook so it can fill itself in: the week title
 * needs to know it is week 7 of 13, the hourly grid needs the dates of this
 * week's days, the month grid needs this month's calendar.
 */
export type OccurrenceContext = Occurrence & {
  level: PageLevel;
  /** 0-based, and how many there are in the term. "Week 7/13" is these. */
  index: number;
  total: number;
};

/** Weekday names as the day-bearing modules spell them, indexed the way
 *  `Date.getUTCDay()` does - Sunday is 0. Modules name the weekdays they
 *  show ("SUNDAY", "MONDAY"), which is what lets a generator work out which
 *  DATE each of their columns is without being told. */
export const WEEKDAY_NAMES = [
  "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY",
];

/** The day within `start`'s week that falls on a named weekday, or null for
 *  a name this does not recognise - a module free-texting its own column
 *  heads must not take the page down. */
export function dayNamed(start: Date, name: unknown): Date | null {
  const index = WEEKDAY_NAMES.indexOf(String(name).trim().toUpperCase());
  if (index < 0) return null;
  // Forward from the occurrence's own first day, never backwards: a week
  // that begins on a Wednesday has its Sunday at the END, and reaching back
  // would date it into the week before.
  const offset = (index - start.getUTCDay() + 7) % 7;
  return new Date(start.getTime() + offset * 86_400_000);
}

/**
 * WHAT DATE EACH COLUMN OF AN HOURLY GRID IS, for one occurrence.
 *
 * THE ONE DESCRIPTION. Two things need this answer and they must agree: the
 * registry's `dated` hook, which writes the number into the day tab, and
 * calendar events, which have to land in the column whose date they fall on.
 * A second copy of the rule is exactly the "two descriptions of one geometry"
 * defect this project keeps meeting - it would show up as an event drawn
 * under the wrong date number, on a page where both look plausible.
 *
 * The two levels differ, and deliberately:
 *   WEEKLY - each column already NAMES its weekday, so the date follows from
 *            the week being printed, whichever half of the spread it is on.
 *   DAILY  - the name itself is a template's guess (MONDAY, because it had to
 *            say something), so consecutive days are taken from the
 *            occurrence's own start and the name is recomputed with them.
 *
 * Null for a column whose name is not a weekday: a module free-texting its
 * own heads gets no date and no events, rather than taking the page down.
 */
export function columnDates(
  level: PageLevel,
  start: Date,
  dayLabels: ReadonlyArray<{ name?: unknown }>
): Array<Date | null> {
  return dayLabels.map((d, index) =>
    level === "DAILY" ? new Date(start.getTime() + index * 86_400_000) : dayNamed(start, d.name)
  );
}

/** "DEC 31 - JAN 6", the form the week title was measured in. */
export function dateRangeLabel(start: Date, end: Date): string {
  const part = (d: Date) => `${MONTH_NAMES[d.getUTCMonth()].slice(0, 3).toUpperCase()} ${d.getUTCDate()}`;
  return `${part(start)} - ${part(end)}`;
}

/**
 * How many times a level's pages are printed over a date range.
 *
 * The count, not the calendar: a range of 90 days is 90 dailies and about 13
 * weeklies, and that ratio is what makes the level toggle a price control.
 * Derived from `occurrences` rather than computed again, so the number of
 * pages printed and the number of occurrences offered for customisation
 * cannot disagree. Null means the book has no term, which is a real answer
 * and not zero.
 */
export function printedCount(
  level: PageLevel,
  start: Date | null | undefined,
  end: Date | null | undefined,
  weekStartDay = 0
): number | null {
  return occurrences(level, start, end, weekStartDay)?.length ?? null;
}

/** One occurrence of one level, waiting for its place in the book. `rank`
 *  is the level's place in LEVELS_IN_BINDING_ORDER. */
export type BindingSlot = { at: OccurrenceContext; rank: number };

/**
 * THE BOOK'S ORDER. Not all the monthlies and then all the weeklies - that is
 * how the timeline groups them for DESIGNING, and it is not how a book is
 * bound. A real one runs front matter, then each month followed by the weeks
 * and days inside it, then back matter: every occurrence sorted by the date
 * it begins, and where two begin on the same day, the coarser one first.
 *
 * Here rather than in generateBook (2026-10-08) because bookPageCount needs
 * the same order to know where the facing pages fall - see facingPads.
 */
export function bindingOrder<T extends BindingSlot>(slots: T[], termStart: Date | null | undefined): T[] {
  // An occurrence that BEGINS BEFORE THE TERM sorts as if it began on the
  // first day. The week containing 1 January begins on 28 December, and
  // sorting it by that date opened the book with a week page and put
  // January's own page after January's first week. Clamping puts the
  // coarsest thing first - the month, then the week that runs into it, then
  // its days - and changes nothing else, since every other occurrence starts
  // inside the term already.
  const from = termStart ? termStart.getTime() : -Infinity;
  const sortDate = (at: OccurrenceContext) => Math.max(at.start.getTime(), from);
  return [...slots].sort((a, b) => {
    // Front matter opens the book and back matter closes it, whatever dates
    // they happen to carry - they are not dated at all, and sorting them by
    // a sentinel would put them wherever that sentinel fell.
    const bookend = (slot: BindingSlot) =>
      slot.at.level === PageLevel.FRONT_MATTER ? -1 : slot.at.level === PageLevel.BACK_MATTER ? 1 : 0;
    const ends = bookend(a) - bookend(b);
    if (ends !== 0) return ends;
    if (!repeats(a.at.level) && !repeats(b.at.level)) return a.rank - b.rank;
    const byDate = sortDate(a.at) - sortDate(b.at);
    if (byDate !== 0) return byDate;
    // Same day: the COARSER level first. A month's own page belongs before
    // the first week inside it, and that week before its first day.
    return a.rank - b.rank;
  });
}

/**
 * KEEPING SPREADS FACING (Andrew, 2026-10-08: "keep two page spread facing
 * add dot grid pages").
 *
 * A bound book's first page is a right-hand page, so a page is a LEFT-hand
 * one when its number is even. A month's or a week's first two pages are a
 * spread - two halves of one thing, meant to be seen open together - and
 * printed from an odd page they land back to back on one leaf instead. Until
 * this existed nothing stopped that: a book with no front page, or two, or
 * with a page a day between its weeks, split its spreads, in the PDF and in
 * the bound book alike.
 *
 * So before any spread that would start on a right-hand page goes one page
 * of the dot grid - a page to write on, not a blank. True for each run that
 * needs one. The one rule: generateBook inserts the pages, bookPageCount
 * counts them, and neither decides for itself.
 */
export function facingPads(runs: ReadonlyArray<{ level: PageLevel; pages: number }>): boolean[] {
  let printed = 0;
  return runs.map((run) => {
    const spread = LEVEL_PAGE_COUNT[run.level] === 2 && run.pages >= 2;
    // The next page is number printed + 1: odd - a right-hand page - when
    // the count so far is even.
    const pad = spread && printed % 2 === 0;
    printed += run.pages + (pad ? 1 : 0);
    return pad;
  });
}

/**
 * How many pages a whole book prints: each level's pages times how many
 * times that level prints over the term, and the dot grid pages that keep
 * its spreads facing (facingPads). `pagesPerLevel` is a journal's own sets
 * (a week of three pages prints three a week), or LEVEL_PAGE_COUNT for a
 * journal not made yet - the start dialog shows this as the levels are
 * switched on and off, because cadence is the price. Null when the book has
 * no term: that is a real answer, and not zero.
 */
export function bookPageCount(
  pagesPerLevel: Partial<Record<PageLevel, number>>,
  start: Date | null | undefined,
  end: Date | null | undefined,
  weekStartDay = 0
): number | null {
  const slots: Array<BindingSlot & { pages: number }> = [];
  for (const [rank, level] of LEVELS_IN_BINDING_ORDER.entries()) {
    const pages = pagesPerLevel[level] ?? 0;
    if (pages === 0) continue;
    const list = occurrences(level, start, end, weekStartDay);
    if (list === null) return null;
    list.forEach((occurrence, index) => slots.push({ at: { ...occurrence, level, index, total: list.length }, rank, pages }));
  }
  const runs = bindingOrder(slots, start).map((slot) => ({ level: slot.at.level, pages: slot.pages }));
  const pads = facingPads(runs).filter(Boolean).length;
  return runs.reduce((total, run) => total + run.pages, 0) + pads;
}
