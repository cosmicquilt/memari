// An .ics feed, read into the events this app stores.
//
// WHY .ics AND NOT OAUTH FIRST. Google's `calendar.readonly` is a sensitive
// scope: a public app needs Google's own verification before anyone outside a
// test list can use it. Every one of Google, Apple and Microsoft will instead
// hand a person a SECRET ADDRESS for a calendar, which is an .ics feed over
// https. One reader covers all three, needs no credentials from Andrew, and
// is what a person can set up themselves in two minutes.
//
// DELIBERATELY SMALL, the same way recursOn is (see calendarEvents.ts). This
// reads VEVENTs and the handful of properties a paper planner draws. A
// property it does not understand is IGNORED; an event it cannot place
// HONESTLY is SKIPPED and counted, never guessed at. A planner is printed -
// a confidently wrong mark is worse than a missing one, because nobody
// checks a page that looks right.
//
// Pure: no network, no clock, no machine time zone. `fetchIcs` in
// icsFetch.ts does the network half, and the store writes the rows. The zone
// maths is in timeZone.ts, shared with the page that draws what this reads.

import { FLOATING, wallTimeToUtc } from "./timeZone";
import type { Override } from "./calendarEvents";

// Re-exported: the test pins it, and it is the reader's concern as much as
// anyone's - an unknown zone is what makes this skip an event.
export { zoneOffsetMs } from "./timeZone";

/** One VEVENT, as this app stores events. */
export type ParsedEvent = {
  /** The feed's own UID. What makes a re-read an UPDATE rather than a
   *  duplicate - see CalendarEvent.externalId. */
  uid: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  /** Verbatim, rule and all. calendarEvents.ts expands the subset it draws
   *  and ignores the rest; keeping the original means a rule this app cannot
   *  draw yet survives a re-read, and survives a round trip back one day. */
  rrule: string | null;
  /** The zone the event was authored in, for CalendarEvent.timeZone. "UTC"
   *  when the feed gave an instant (a trailing Z), and FLOATING when it gave
   *  a wall time with no zone at all - which is drawn at that wall time in
   *  every book, rather than converted from a zone nobody named. */
  timeZone: string;
  /** CANCELLED events are tombstoned rather than dropped, so a cancellation
   *  in the feed removes the mark instead of leaving it there for ever. */
  cancelled: boolean;
  /** THE SERIES' OWN CHANGED OCCURRENCES - weeks the feed moved, renamed or
   *  deleted - gathered from EXDATE lines and from the separate VEVENTs that
   *  carry a RECURRENCE-ID. Empty for a one-off. See Override. */
  overrides: Override[];
};

export type ParsedCalendar = {
  /** X-WR-CALNAME, which every one of the three writes. Null falls back to
   *  something the caller chooses - never to the URL, which for a secret
   *  address is a credential. */
  name: string | null;
  /** One per UID. A moved or deleted occurrence is NOT here - it is in its
   *  series' `overrides`. It used to be here as an event of its own, sharing
   *  the series' UID, and the sync (which matches by UID) let it overwrite
   *  the whole series: one rescheduled standup and every other week of it
   *  vanished. Measured on a Google-shaped feed, 2026-09-28. */
  events: ParsedEvent[];
  /** Events this reader would have had to guess at. Counted rather than
   *  swallowed: "47 of 300 could not be read" is something a person can act
   *  on, and a silent 47 is not. */
  skipped: Array<{ uid: string; why: string }>;
};

/**
 * RFC 5545 line unfolding.
 *
 * A long property is split across lines, and each continuation begins with a
 * space or a tab which is NOT part of the value. Feeds fold aggressively -
 * Google wraps at 75 octets - so a summary of any length arrives in pieces,
 * and reading the file line by line without this gives every long event a
 * truncated title.
 */
function unfold(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += raw.slice(1);
    } else {
      out.push(raw);
    }
  }
  return out;
}

/** `DTSTART;TZID=Europe/London:20260928T090000` split into its three parts. */
function splitLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colon = indexOfUnquoted(line, ":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(";");
  const params: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: parts[0].toUpperCase(), params, value };
}

/** A parameter value may be quoted and may contain a colon - a TZID of
 *  `"America/New_York"` is legal, and so is a URI parameter. Splitting on the
 *  first colon anywhere would cut the line in the wrong place. */
function indexOfUnquoted(line: string, char: string): number {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (!quoted && line[i] === char) return i;
  }
  return -1;
}

/** RFC 5545 text escaping: \n \N \, \; \\ */
function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

type Stamp = { at: Date; allDay: boolean; timeZone: string } | null;

/** DTSTART / DTEND, in any of the three forms a feed uses. */
function parseStamp(value: string, params: Record<string, string>): Stamp {
  // A DATE: an all-day event. No time, no zone - the day itself.
  if (params.VALUE === "DATE" || /^\d{8}$/.test(value)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    if (!m) return null;
    return { at: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), allDay: true, timeZone: "UTC" };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  // Trailing Z: already an instant, in UTC.
  if (m[7] === "Z") return { at: new Date(wall), allDay: false, timeZone: "UTC" };
  // A TZID: a wall time in that zone.
  if (params.TZID) {
    const utc = wallTimeToUtc(wall, params.TZID);
    return utc === null ? null : { at: new Date(utc), allDay: false, timeZone: params.TZID };
  }
  // NO ZONE AT ALL is a "floating" time - 9am wherever you happen to be. A
  // paper planner is the one place that is exactly right: the page says 9am
  // and the person reading it is wherever they are. Kept as written, and
  // MARKED as floating so the page does not convert it from UTC - it was
  // marked "UTC" at first, which is indistinguishable from a real UTC instant
  // and would have drawn it five hours early in New York.
  return { at: new Date(wall), allDay: false, timeZone: FLOATING };
}

/** Everything this reader understands, from one feed. */
export function parseIcs(text: string): ParsedCalendar {
  const events: ParsedEvent[] = [];
  const skipped: Array<{ uid: string; why: string }> = [];
  let name: string | null = null;

  let current: Record<string, { params: Record<string, string>; value: string }> | null = null;
  // EXDATE is the one property that legitimately REPEATS in a VEVENT - one
  // line per deleted occurrence, as Google writes it - so it is gathered
  // rather than overwritten like the rest.
  let exdates: Array<{ params: Record<string, string>; value: string }> = [];
  // Every VEVENT read, before series and their exceptions are paired up.
  const read: Array<ReturnType<typeof finish>> = [];
  // A VEVENT may contain a VALARM, which has its own properties - including
  // a TRIGGER that looks enough like a time to matter. Anything nested is
  // ignored, and only the VEVENT's own properties are read.
  let depth = 0;

  for (const line of unfold(text)) {
    const parsed = splitLine(line);
    if (!parsed) continue;
    const { name: key, params, value } = parsed;

    if (key === "BEGIN" && value.toUpperCase() === "VEVENT") {
      current = {};
      exdates = [];
      depth = 0;
      continue;
    }
    if (current && key === "BEGIN") {
      depth++;
      continue;
    }
    if (current && key === "END" && depth > 0) {
      depth--;
      continue;
    }
    if (key === "END" && value.toUpperCase() === "VEVENT") {
      read.push(finish(current ?? {}, exdates));
      current = null;
      continue;
    }
    if (current) {
      if (depth === 0 && key === "EXDATE") exdates.push({ params, value });
      else if (depth === 0) current[key] = { params, value };
      continue;
    }
    if (key === "X-WR-CALNAME") name = unescapeText(value).trim() || null;
  }

  // PAIR EACH EXCEPTION WITH ITS SERIES. An exception is a VEVENT with a
  // RECURRENCE-ID; it names the occurrence it replaces, and it belongs in
  // that series' overrides - never in `events`, where it would share a UID
  // with the series and the sync would treat the two as one row.
  const series = new Map<string, ParsedEvent>();
  const exceptions: Exception[] = [];
  for (const item of read) {
    if ("why" in item) skipped.push(item);
    else if ("recurrenceId" in item) exceptions.push(item);
    else if (!series.has(item.uid)) series.set(item.uid, item);
  }
  for (const exception of exceptions) {
    const owner = series.get(exception.uid);
    if (owner?.rrule) {
      owner.overrides.push({
        recurrenceId: exception.recurrenceId,
        cancelled: exception.event.cancelled,
        title: exception.event.title,
        startsAt: exception.event.startsAt,
        endsAt: exception.event.endsAt,
      });
    } else {
      // AN ORPHAN: an occurrence whose series is not in this feed - which
      // happens when someone is invited to one week of a meeting. It is
      // still something on their calendar, so it is kept as a one-off, under
      // a UID of its own so it cannot collide with anything.
      const uid = `${exception.uid}#${exception.recurrenceId.toISOString()}`;
      if (!series.has(uid)) series.set(uid, { ...exception.event, uid, rrule: null, overrides: [] });
    }
  }
  events.push(...series.values());

  return { name, events, skipped };
}

/** A VEVENT that replaces one occurrence of a series. */
type Exception = { uid: string; recurrenceId: Date; event: ParsedEvent };

const DAY_MS = 86_400_000;

function finish(
  props: Record<string, { params: Record<string, string>; value: string }>,
  exdateLines: Array<{ params: Record<string, string>; value: string }> = []
): ParsedEvent | Exception | { uid: string; why: string } {
  const uid = props.UID?.value?.trim() || "";
  if (!uid) return { uid: "(no UID)", why: "no UID, so a re-read could not tell it from a new event" };

  const start = props.DTSTART ? parseStamp(props.DTSTART.value, props.DTSTART.params) : null;
  if (!start) {
    return {
      uid,
      why: props.DTSTART
        ? `a start this reader cannot place (${props.DTSTART.params.TZID ?? props.DTSTART.value})`
        : "no start",
    };
  }

  let end = props.DTEND ? parseStamp(props.DTEND.value, props.DTEND.params) : null;
  if (!end && props.DURATION) end = { at: new Date(start.at.getTime() + durationMs(props.DURATION.value)), allDay: start.allDay, timeZone: start.timeZone };
  // NEITHER an end nor a duration is legal, and it means different things for
  // the two kinds: an all-day event is that one day, and a timed one is an
  // instant, which this app draws as its shortest block rather than as
  // nothing.
  if (!end) {
    end = {
      at: new Date(start.at.getTime() + (start.allDay ? DAY_MS : 30 * 60_000)),
      allDay: start.allDay,
      timeZone: start.timeZone,
    };
  }

  // DELETED OCCURRENCES, as cancelled overrides. Named by the same kind of
  // stamp as DTSTART - a date, a zoned wall time or a UTC instant - so each
  // lands in the frame the series itself is stored in, which is how the
  // placer matches them. A value it cannot read is dropped, not guessed: the
  // cost is one extra occurrence drawn, not a real one hidden.
  const overrides: Override[] = [];
  for (const line of exdateLines) {
    for (const one of line.value.split(",")) {
      const at = parseStamp(one.trim(), line.params);
      if (at) overrides.push({ recurrenceId: at.at, cancelled: true });
    }
  }

  const event: ParsedEvent = {
    uid,
    title: unescapeText(props.SUMMARY?.value ?? "").trim() || "Untitled",
    startsAt: start.at,
    // An all-day DTEND is EXCLUSIVE in iCalendar - a one-day event ends on
    // the NEXT day - and eventsForDays already bands `startsAt < dayEnd &&
    // endsAt > dayStart`, which is exactly an exclusive end. So it is stored
    // as written; shifting it back a day here would drop the last day of
    // every trip.
    endsAt: end.at,
    allDay: start.allDay,
    rrule: props.RRULE ? props.RRULE.value.trim().toUpperCase() : null,
    timeZone: start.timeZone,
    cancelled: (props.STATUS?.value ?? "").toUpperCase() === "CANCELLED",
    overrides,
  };

  // AN EXCEPTION names the occurrence it replaces. Paired with its series in
  // parseIcs; a RECURRENCE-ID this reader cannot read is skipped and
  // counted, since attaching it to the wrong week would be worse than
  // missing it.
  if (props["RECURRENCE-ID"]) {
    const recurrence = parseStamp(props["RECURRENCE-ID"].value, props["RECURRENCE-ID"].params);
    if (!recurrence) return { uid, why: "a RECURRENCE-ID this reader cannot place" };
    return { uid, recurrenceId: recurrence.at, event };
  }
  return event;
}

/** An ISO 8601 duration, the subset iCalendar allows: P[n]DT[n]H[n]M[n]S. */
function durationMs(value: string): number {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim().toUpperCase());
  if (!m) return 30 * 60_000;
  const n = (i: number) => Number(m[i] ?? 0) || 0;
  const ms = n(2) * 7 * DAY_MS + n(3) * DAY_MS + n(4) * 3_600_000 + n(5) * 60_000 + n(6) * 1000;
  return m[1] === "-" ? -ms : ms;
}
