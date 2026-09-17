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
 * How many times a level's pages are printed over a date range.
 *
 * The count, not the calendar: a range of 90 days is 90 dailies and about 13
 * weeklies, and that ratio is what makes the level toggle a price control.
 * Null start or end means the book has no term yet, so a repeating level
 * cannot be counted at all - which is a real answer and not zero.
 */
export function printedCount(
  level: PageLevel,
  start: Date | null | undefined,
  end: Date | null | undefined
): number | null {
  if (!repeats(level)) return 1;
  if (!start || !end) return null;
  // Whole days between, inclusive of both ends. In UTC, so a daylight-saving
  // transition cannot shift a timestamp across a day boundary - the same
  // reasoning monthCalendar.ts already applies to its own day counting.
  const days =
    Math.round(
      (Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) -
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) /
        86_400_000
    ) + 1;
  if (days <= 0) return 0;
  if (level === PageLevel.DAILY) return days;
  if (level === PageLevel.WEEKLY) return Math.ceil(days / 7);
  // Months are counted as calendar months touched, not as 30-day blocks:
  // a book from Jan 28 to Feb 2 spans two months and wants two monthly
  // pages, where days/30 would say one.
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1;
  return Math.max(0, months);
}
