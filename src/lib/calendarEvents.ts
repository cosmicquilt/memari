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
//
// TIME ZONES. An event is an INSTANT and a book has a ZONE; this draws each
// instant at its wall-clock time in the book's zone. It did not, at first: it
// read getUTCHours straight off the stored instant, so a 9am New York meeting
// printed in the 1pm row and a 9pm one moved to the next day's column. Found
// by running a New York feed through it, 2026-09-28 - every test until then
// used UTC times, where the two readings agree.

import type { HourlyGridEvent } from "./modules/hourlyGridCore";
import { DEFAULT_ZONE, FLOATING, isTimeZone, toWallTime, wallTimeToUtc } from "./timeZone";

/** What an event with no title is called - by the server when it saves one,
 *  and by the drag preview, which has to look like what will be saved. One
 *  constant, so the preview cannot read "New event" over a block that then
 *  saves as something else. */
export const UNTITLED_EVENT = "Untitled";

/** The columns of one page's hourly grid, as real dates. */
export type GridDay = {
  /** Midnight UTC of the day this column is, or null for a column that has
   *  no date - an undated book, or a head that is not a weekday name. A
   *  dateless column draws no events rather than borrowing its neighbour's. */
  date: Date | null;
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
  /** The zone it was authored in: an IANA name, "UTC", or FLOATING for a
   *  wall time with no zone. Absent is read as "UTC", which is what every
   *  stored instant with no zone recorded really is. */
  timeZone?: string | null;
  deletedAt?: Date | null;
  calendar?: { colour?: string | null; source?: string | null } | null;
  /** ONE OCCURRENCE OF A SERIES, changed - see Override. Ignored on a
   *  one-off event, which has no occurrences to name. */
  overrides?: Override[] | null;
};

/**
 * A single occurrence of a repeating event, changed: cancelled, moved, or
 * renamed. RFC 5545's RECURRENCE-ID, and what CalendarEventOverride stores.
 *
 * `recurrenceId` names the occurrence by WHERE THE RULE PUT IT - its original
 * start - in the same frame as the series' own startsAt: an instant for a
 * zoned series, the wall time for a floating one, midnight for an all-day
 * one. That is how an occurrence stays identifiable after it has been moved
 * somewhere the rule would never put it.
 */
export type Override = {
  recurrenceId: Date;
  cancelled: boolean;
  title?: string | null;
  /** Set when the occurrence was MOVED. Same frame as recurrenceId. */
  startsAt?: Date | null;
  endsAt?: Date | null;
};

/** One drawn occurrence, before it becomes a mark. */
type Occurrence = {
  start: Date;
  end: Date;
  /** A renamed occurrence's own title. */
  title?: string | null;
  /** Its recurrenceId in ms, for a series; absent for a one-off. */
  occurrence?: number;
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
export function eventsForDays(
  events: StoredEvent[],
  days: GridDay[],
  /** The BOOK's zone - what the page's clock reads. See the header. */
  bookZone: string = DEFAULT_ZONE
): HourlyGridEvent[] {
  const out: HourlyGridEvent[] = [];
  const zone = isTimeZone(bookZone) ? bookZone : DEFAULT_ZONE;

  days.forEach((day, index) => {
    if (!day.date) return;
    const dayStart = utcMidnight(day.date);

    for (const event of events) {
      if (event.deletedAt) continue;

      for (const { start, end, title, occurrence } of occurrencesOn(event, dayStart, zone)) {
        out.push({
          id: event.id,
          // WHICH OCCURRENCE, for a series: it keys the marks - a daily series
          // with one day moved onto the next puts two blocks of one event in
          // one column - and it tells the popup which week "only this one"
          // means.
          ...(occurrence !== undefined ? { occurrence: String(occurrence) } : {}),
          day: index,
          startTime: event.allDay ? "00:00" : hhmm(start),
          endTime: event.allDay ? "23:59" : hhmm(end),
          label: title || event.title,
          source: event.calendar?.source ? "google-calendar" : "manual",
          ...(event.allDay ? { allDay: true } : {}),
          ...(event.calendar?.colour ? { colour: event.calendar.colour } : {}),
        });
      }
    }
  });

  return out;
}

/** Candidate days either side of a column, for a series authored in another
 *  zone: an instance's date can differ by up to a day between two zones -
 *  two, between the extremes of UTC-12 and UTC+14. */
const NEIGHBOURS = [-2, -1, 0, 1, 2];

/**
 * The occurrences of `event` that fall on the column starting `dayStart`, in
 * the BOOK's wall clock (encoded as UTC - see toWallTime). Usually none or
 * one. Two only when a series has an occurrence moved onto a day it already
 * has one, which a daily series can.
 *
 * THREE KINDS, three rules:
 *
 *   ALL-DAY - a DATE, not an instant. The 26th is the 26th in every zone, so
 *   nothing is converted. A span bands every day it covers.
 *
 *   FLOATING - a wall time with no zone. Drawn at that wall time in every
 *   book, exactly as stored.
 *
 *   ZONED - an instant. Converted to the book's wall clock, and placed on the
 *   day it STARTS there: a column is a day, and half an event at the top of
 *   the next column reads as a second event.
 */
function occurrencesOn(event: StoredEvent, dayStart: number, bookZone: string): Occurrence[] {
  const dayEnd = dayStart + DAY_MS;

  // A ONE-OFF is simple, and has no occurrences to override.
  if (!event.rrule) {
    if (event.allDay || event.timeZone === FLOATING) {
      const startsOnThisDay = event.startsAt.getTime() >= dayStart && event.startsAt.getTime() < dayEnd;
      // An ALL-DAY event is a span, not an instant: it belongs to every day
      // it covers, so a three-day trip bands all three.
      const coversThisDay =
        event.allDay && event.startsAt.getTime() < dayEnd && event.endsAt.getTime() > dayStart;
      return startsOnThisDay || coversThisDay ? [{ start: event.startsAt, end: event.endsAt }] : [];
    }
    const start = toWallTime(event.startsAt, bookZone);
    if (utcMidnight(start) !== dayStart) return [];
    return [{ start, end: toWallTime(event.endsAt, bookZone) }];
  }

  // A SERIES: what the rule generates, minus the occurrences that were
  // cancelled or moved away, plus the ones moved HERE from elsewhere.
  const overrides = new Map((event.overrides ?? []).map((o) => [o.recurrenceId.getTime(), o]));
  const length = event.endsAt.getTime() - event.startsAt.getTime();
  const found: Occurrence[] = [];

  /** `original` in the series' own frame; `start` in the book's wall clock. */
  const keep = (original: number, start: Date) => {
    const change = overrides.get(original);
    // CANCELLED: gone. MOVED: drawn where it went, below - not here.
    if (change?.cancelled || change?.startsAt) return;
    found.push({ start, end: new Date(start.getTime() + length), title: change?.title, occurrence: original });
  };

  if (event.allDay || event.timeZone === FLOATING) {
    // Already in the frame the page reads, so the rule runs as it always did.
    if (recursOn(event, dayStart)) {
      const offsetIntoDay = event.startsAt.getTime() - utcMidnight(event.startsAt);
      keep(dayStart + offsetIntoDay, new Date(dayStart + offsetIntoDay));
    }
  } else {
    // A SERIES IS EXPANDED IN THE ZONE IT WAS WRITTEN IN, then each instance
    // is converted. "Every Monday at 9am New York" stays at 9am in New York
    // across daylight saving - and so moves by an hour, for a couple of weeks
    // a year, in a London book, because the two countries change their
    // clocks on different dates. Expanding it in the book's zone instead
    // would put it an hour wrong in New York for those weeks, which is the
    // zone it actually happens in.
    const ruleZone = isTimeZone(event.timeZone) ? event.timeZone : DEFAULT_ZONE;
    const inRuleZone: StoredEvent = {
      ...event,
      startsAt: toWallTime(event.startsAt, ruleZone),
      endsAt: toWallTime(event.endsAt, ruleZone),
    };
    const offsetIntoDay = inRuleZone.startsAt.getTime() - utcMidnight(inRuleZone.startsAt);
    for (const shift of NEIGHBOURS) {
      const ruleDay = dayStart + shift * DAY_MS;
      if (!recursOn(inRuleZone, ruleDay)) continue;
      const instant = wallTimeToUtc(ruleDay + offsetIntoDay, ruleZone);
      if (instant === null) continue;
      const start = toWallTime(new Date(instant), bookZone);
      if (utcMidnight(start) !== dayStart) continue;
      keep(instant, start);
    }
  }

  // MOVED HERE. An occurrence moved to another time is drawn at that time,
  // wherever it landed - which can be a day the rule never touches, so it
  // is found by its own start rather than by running the rule. It keeps its
  // ORIGINAL recurrenceId, which is how the popup still knows which week of
  // the series it is.
  for (const change of overrides.values()) {
    if (change.cancelled || !change.startsAt) continue;
    const movedEnd = change.endsAt ?? new Date(change.startsAt.getTime() + length);
    const floatingFrame = event.allDay || event.timeZone === FLOATING;
    const start = floatingFrame ? change.startsAt : toWallTime(change.startsAt, bookZone);
    if (utcMidnight(start) !== dayStart) continue;
    found.push({
      start,
      end: floatingFrame ? movedEnd : toWallTime(movedEnd, bookZone),
      title: change.title,
      occurrence: change.recurrenceId.getTime(),
    });
  }
  return found;
}
