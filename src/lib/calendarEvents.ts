// Stored calendar events, turned into the marks an hourly grid draws.
//
// The book is derived from templates and never stored, and a module dates
// itself through the registry's `dated` hook (see memari-sequence-generation).
// An event is DATED, so it cannot live in a template's propValues: it lives
// in CalendarEvent, per owner, and this is what turns a stored row into the
// `events` an hourly-grid-core draws for one particular week.
//
// Pure, and deliberately so - no Prisma, no clock, no time zone of the
// machine it runs on. The same function answers for the editor's canvas, the
// timeline previews and the printed book, which is the one-description rule
// this project keeps coming back to.

import type { HourlyGridEvent } from "./modules/hourlyGridCore";

/** The columns of one page's hourly grid, as real dates. */
export type GridDay = {
  /** Midnight UTC of the day this column is. */
  date: Date;
};

/** What this needs from a CalendarEvent row - structural, so a Prisma row
 *  fits and so does a test's plain object. */
export type StoredEvent = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  rrule: string | null;
  deletedAt?: Date | null;
  calendar?: { colour?: string | null; source?: string | null } | null;
};

const DAY_MS = 86_400_000;
const utcMidnight = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const hhmm = (d: Date) =>
  `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

/** RFC 5545 weekday codes, in getUTCDay order. */
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

/**
 * Does a recurring event fall on `day`?
 *
 * A DELIBERATELY SMALL SUBSET of RFC 5545: FREQ=DAILY and FREQ=WEEKLY, with
 * INTERVAL, BYDAY, COUNT and UNTIL. That is what a paper planner needs -
 * "every Tuesday", "every weekday", "every other Monday" - and it is what
 * the editor's Repeat row offers.
 *
 * ANYTHING ELSE RETURNS FALSE rather than guessing. An imported MONTHLY or
 * YEARLY rule keeps its RRULE in the database untouched, so a round trip back
 * to Google does not destroy it; it simply does not draw yet. Drawing a
 * monthly rule as though it were weekly would be worse than not drawing it,
 * because the page would be confidently wrong.
 */
function recursOn(event: StoredEvent, dayStart: number): boolean {
  const rule = Object.fromEntries(
    (event.rrule ?? "")
      .replace(/^RRULE:/i, "")
      .split(";")
      .filter(Boolean)
      .map((part) => {
        const [k, v] = part.split("=");
        return [k.toUpperCase(), (v ?? "").toUpperCase()];
      })
  );
  const freq = rule.FREQ;
  if (freq !== "DAILY" && freq !== "WEEKLY") return false;

  const firstStart = utcMidnight(event.startsAt);
  if (dayStart < firstStart) return false;

  // UNTIL is inclusive of its own date.
  if (rule.UNTIL) {
    const until = Date.parse(
      rule.UNTIL.replace(/^(\d{4})(\d{2})(\d{2}).*$/, "$1-$2-$3T00:00:00.000Z")
    );
    if (!Number.isNaN(until) && dayStart > until) return false;
  }

  const interval = Math.max(1, Number(rule.INTERVAL ?? 1) || 1);
  const daysSince = Math.round((dayStart - firstStart) / DAY_MS);

  let occursToday: boolean;
  let ordinal: number;
  if (freq === "DAILY") {
    occursToday = daysSince % interval === 0;
    ordinal = Math.floor(daysSince / interval);
  } else {
    const wanted = rule.BYDAY
      ? rule.BYDAY.split(",").map((d) => d.trim())
      : [BYDAY[event.startsAt.getUTCDay()]];
    const today = BYDAY[new Date(dayStart).getUTCDay()];
    // Which week of the series this is, counted from the event's own first
    // week rather than from the year, so INTERVAL=2 means "every other week
    // from when it started".
    const weeksSince = Math.floor((dayStart - firstStart) / (7 * DAY_MS));
    occursToday = wanted.includes(today) && weeksSince % interval === 0;
    // COUNT counts INSTANCES, so a twice-weekly rule reaches its count in
    // half the weeks.
    ordinal = weeksSince * wanted.length;
  }
  if (!occursToday) return false;

  if (rule.COUNT) {
    const count = Number(rule.COUNT);
    if (Number.isFinite(count) && ordinal >= count) return false;
  }
  return true;
}

/**
 * The events a page's hourly grid should draw, in the grid's own shape.
 *
 * @param days the page's columns, as real dates - the left page of a weekly
 *   spread gets three, the right four.
 *
 * An event is placed by the day its START falls on. One running past
 * midnight is drawn on the day it began and clipped by the grid's own hours,
 * rather than split across two columns: a column is a day, and half an event
 * appearing at the top of the next one reads as a second event.
 */
export function eventsForDays(events: StoredEvent[], days: GridDay[]): HourlyGridEvent[] {
  const out: HourlyGridEvent[] = [];

  days.forEach((day, index) => {
    const dayStart = utcMidnight(day.date);
    const dayEnd = dayStart + DAY_MS;

    for (const event of events) {
      if (event.deletedAt) continue;

      let start: Date;
      let end: Date;
      if (event.rrule) {
        if (!recursOn(event, dayStart)) continue;
        // An instance keeps the series' time of day and its length.
        const offsetIntoDay = event.startsAt.getTime() - utcMidnight(event.startsAt);
        const length = event.endsAt.getTime() - event.startsAt.getTime();
        start = new Date(dayStart + offsetIntoDay);
        end = new Date(start.getTime() + length);
      } else {
        const startsOnThisDay = event.startsAt.getTime() >= dayStart && event.startsAt.getTime() < dayEnd;
        // An ALL-DAY event is a span, not an instant: it belongs to every day
        // it covers, so a three-day trip bands all three.
        const coversThisDay =
          event.allDay && event.startsAt.getTime() < dayEnd && event.endsAt.getTime() > dayStart;
        if (!startsOnThisDay && !coversThisDay) continue;
        start = event.startsAt;
        end = event.endsAt;
      }

      out.push({
        day: index,
        startTime: event.allDay ? "00:00" : hhmm(start),
        endTime: event.allDay ? "23:59" : hhmm(end),
        label: event.title,
        source: event.calendar?.source ? "google-calendar" : "manual",
        ...(event.allDay ? { allDay: true } : {}),
        ...(event.calendar?.colour ? { colour: event.calendar.colour } : {}),
      });
    }
  });

  return out;
}
