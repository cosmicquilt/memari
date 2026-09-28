// Time zones: turning instants into the wall-clock times a page prints, and
// back.
//
// WHY THIS IS ITS OWN FILE. It began inside the .ics reader, which needed it
// to turn `TZID=America/New_York:...T090000` into an instant. Then it turned
// out the PAGE needed it too: events were stored as true instants but drawn
// with getUTCHours, so a 9am New York meeting printed in the 1pm row and a
// 9pm one moved to the next day. Three things now do zone maths - reading a
// feed, drawing a week, saving what a person typed - and three copies of "how
// to find the offset on a given day" is three chances for one of them to get
// daylight saving wrong.
//
// THE MODEL, in one line: an event is an INSTANT; a book has a ZONE; a page
// shows every instant as the wall-clock time in its book's zone.
//
// Plus one exception, from iCalendar itself: a FLOATING time has no zone at
// all - "9am wherever you are" - and is drawn at its wall time in every book.
// Imported events written without a zone are floating, and so is everything
// typed before books had zones (the migration marks those).
//
// Pure: `Intl` knows every IANA zone and its rules, so no table is carried.

/** An event's `timeZone` when it has none - see the header. The string that
 *  goes in CalendarEvent.timeZone. */
export const FLOATING = "floating";

/** The zone a book falls back to before it has one of its own. Every book
 *  that existed before zones did has none until it is next opened, when the
 *  editor gives it the browser's; until then this draws it exactly as it
 *  always was drawn. */
export const DEFAULT_ZONE = "UTC";

/** Is this an IANA zone the platform knows? Checked before a name is stored,
 *  because a zone that `Intl` rejects later would make every event in the
 *  book undrawable rather than wrong in an obvious way. */
export function isTimeZone(name: unknown): name is string {
  if (typeof name !== "string" || name.length === 0 || name.length > 64) return false;
  if (name === FLOATING) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/**
 * THE ZONE'S OFFSET AT ONE INSTANT, in ms: wall time minus UTC.
 *
 * Asked of the platform rather than carried in a table, and asked AT THAT
 * INSTANT, because it moves with daylight saving - New York is -4h in July and
 * -5h in January, and an event stored at the wrong one is a whole term of 9am
 * meetings sitting at 8am for half the year.
 *
 * Null for a zone the platform does not recognise. Microsoft still writes its
 * own names ("Eastern Standard Time") in some feeds; the caller decides what
 * that means, which for the .ics reader is "skip it" rather than "guess".
 */
export function zoneOffsetMs(timeZone: string, instant: number): number | null {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(instant));
  } catch {
    return null;
  }
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  // `hour12: false` renders midnight as 24 in some runtimes.
  const hour = at("hour") % 24;
  const asUtc = Date.UTC(at("year"), at("month") - 1, at("day"), hour, at("minute"), at("second"));
  // Whole seconds: the formatter drops milliseconds, and an offset of -123ms
  // on every instant with a fractional second would move nothing visible but
  // would make two equal instants compare unequal.
  return Number.isNaN(asUtc) ? null : asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * A WALL TIME IN `timeZone`, as an instant.
 *
 * `wall` is the wall-clock time encoded as if it were UTC - Date.UTC(2026, 8,
 * 28, 9, 0) for "9am on 28 Sep" - which is how this project writes a time that
 * has not been given a zone yet.
 *
 * Two passes. The offset has to be read at the event's true instant, but the
 * instant is what the offset is needed to work out. So it is read once at the
 * wall time treated as UTC, then again at the instant that gives. They
 * disagree only when those straddle a transition - a window a few hours wide,
 * twice a year, which is why a single pass survives every obvious test. See
 * ics.test.mts, where dropping the second pass was measured to change nothing
 * until a case inside that window was added.
 */
export function wallTimeToUtc(wall: number, timeZone: string): number | null {
  const first = zoneOffsetMs(timeZone, wall);
  if (first === null) return null;
  const second = zoneOffsetMs(timeZone, wall - first);
  if (second === null) return null;
  return wall - second;
}

/**
 * AN INSTANT, as the wall-clock time in `timeZone` - encoded as if it were
 * UTC, so getUTCHours and getUTCDate read the wall clock directly. That
 * encoding is what lets the rest of the placement code stay as it was: it
 * already worked in wall-clock-as-UTC, it was only ever handed the wrong
 * clock.
 *
 * An unknown zone falls back to UTC rather than throwing: a page must render,
 * and isTimeZone keeps unknown names out of the database in the first place.
 */
export function toWallTime(instant: Date, timeZone: string): Date {
  const offset = zoneOffsetMs(timeZone, instant.getTime()) ?? 0;
  return new Date(instant.getTime() + offset);
}

/** "YYYY-MM-DD" and "HH:MM" of a wall-time-as-UTC Date. */
export const wallDate = (wall: Date) => wall.toISOString().slice(0, 10);
export const wallClock = (wall: Date) =>
  `${String(wall.getUTCHours()).padStart(2, "0")}:${String(wall.getUTCMinutes()).padStart(2, "0")}`;

/**
 * "2026-09-28" and "09:30" in `timeZone`, as an instant. Null for a malformed
 * date or time, or an unknown zone. What the editor's popup produces is always
 * these two strings, and this is the only place they become an instant.
 */
export function instantFromWall(date: string, clock: string, timeZone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!d || !t) return null;
  const hours = Number(t[1]);
  const minutes = Number(t[2]);
  if (hours > 23 || minutes > 59) return null;
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hours, minutes);
  const utc = wallTimeToUtc(wall, timeZone);
  return utc === null ? null : new Date(utc);
}
