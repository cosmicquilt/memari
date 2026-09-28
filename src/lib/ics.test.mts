// An .ics feed, read.
//
// The cases worth pinning are the ones where a reader quietly gets it WRONG
// rather than failing: a folded line truncating a title, a wall time stored
// at the wrong offset across a DST boundary, an all-day range losing its last
// day, a VALARM's TRIGGER read as the event's own time. Each of those leaves
// a page that looks fine.
//
//   npx tsx src/lib/ics.test.mts

import { parseIcs, zoneOffsetMs } from "./ics.js";
import { eventsForDays, type GridDay } from "./calendarEvents.js";

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`  FAIL  ${what}`);
    failures++;
  }
};

const iso = (d: Date) => d.toISOString();
/** Feeds use CRLF. Written with \n here and converted, so the fixtures stay
 *  readable and the reader still sees what a real feed sends. */
const feed = (body: string) => body.replace(/\n/g, "\r\n");

// --- A WHOLE SMALL FEED ---------------------------------------------------
{
  const text = feed(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
X-WR-CALNAME:Andrew's calendar
BEGIN:VEVENT
UID:one@example.com
DTSTAMP:20260901T120000Z
DTSTART:20260928T140000Z
DTEND:20260928T153000Z
SUMMARY:Studio review
END:VEVENT
END:VCALENDAR`);
  const parsed = parseIcs(text);
  check(parsed.name === "Andrew's calendar", `the calendar's name should be read, got ${parsed.name}`);
  check(parsed.events.length === 1, `one event, got ${parsed.events.length}`);
  check(parsed.skipped.length === 0, `nothing should be skipped, skipped ${JSON.stringify(parsed.skipped)}`);
  const e = parsed.events[0];
  check(e.uid === "one@example.com", `the UID should be kept, got ${e.uid}`);
  check(e.title === "Studio review", `the title should be read, got ${e.title}`);
  check(iso(e.startsAt) === "2026-09-28T14:00:00.000Z", `start came out ${iso(e.startsAt)}`);
  check(iso(e.endsAt) === "2026-09-28T15:30:00.000Z", `end came out ${iso(e.endsAt)}`);
  check(!e.allDay, "a timed event was marked all-day");
  check(!e.cancelled, "a confirmed event was marked cancelled");
}

// --- FOLDED LINES ---------------------------------------------------------
//
// Google wraps at 75 octets, so EVERY long title arrives in pieces. Reading
// line by line without unfolding truncates it, and the page shows half a
// title with no sign anything went wrong.
{
  const long = "A really quite long event title that will not fit on one line of an ics feed";
  const parsed = parseIcs(
    feed(`BEGIN:VEVENT
UID:fold@example.com
DTSTART:20260928T090000Z
DTEND:20260928T100000Z
SUMMARY:A really quite long event title that will not fit on one line
  of an ics feed
END:VEVENT`)
  );
  check(parsed.events[0]?.title === long, `a folded title came out as "${parsed.events[0]?.title}"`);
  // A TAB continues a line too, not only a space - and the continuation
  // character is STRIPPED with nothing put in its place. Folded mid-word here
  // so that is unambiguous: a reader that kept the tab, or helpfully inserted
  // a space, gives "Unmistak ably folded".
  const tabbed = parseIcs(
    feed(`BEGIN:VEVENT
UID:tab@example.com
DTSTART:20260928T090000Z
SUMMARY:Unmistak
\tably folded
END:VEVENT`)
  );
  check(tabbed.events[0]?.title === "Unmistakably folded", `a tab-folded title came out as "${tabbed.events[0]?.title}"`);
}

// --- ESCAPES --------------------------------------------------------------
{
  const parsed = parseIcs(
    feed(`BEGIN:VEVENT
UID:esc@example.com
DTSTART:20260928T090000Z
SUMMARY:Coffee\\, then a walk\\; maybe
END:VEVENT`)
  );
  check(
    parsed.events[0]?.title === "Coffee, then a walk; maybe",
    `escapes came out as "${parsed.events[0]?.title}"`
  );
}

// --- A WALL TIME IN A ZONE, AND THE DST BOUNDARY --------------------------
//
// The one that matters most. A feed writes a wall time and a zone; the offset
// MOVES with daylight saving, and reading it at the wrong instant stores a
// whole term of 9am meetings at 8am for half the year.
{
  const at = (date: string) =>
    parseIcs(
      feed(`BEGIN:VEVENT
UID:tz-${date}@example.com
DTSTART;TZID=America/New_York:${date}T090000
DTEND;TZID=America/New_York:${date}T100000
SUMMARY:Standup
END:VEVENT`)
    ).events[0];

  // Summer: EDT, UTC-4. 09:00 local is 13:00Z.
  check(iso(at("20260701").startsAt) === "2026-07-01T13:00:00.000Z", `summer came out ${iso(at("20260701").startsAt)}`);
  // Winter: EST, UTC-5. 09:00 local is 14:00Z.
  check(iso(at("20260115").startsAt) === "2026-01-15T14:00:00.000Z", `winter came out ${iso(at("20260115").startsAt)}`);
  check(at("20260701").timeZone === "America/New_York", "the authored zone should be kept");

  check(
    iso(at("20261101").startsAt) === "2026-11-01T14:00:00.000Z",
    `the morning the clocks go back came out ${iso(at("20261101").startsAt)}`
  );

  // THE HOURS WHERE ONE PASS IS NOT ENOUGH.
  //
  // The offset has to be read at the event's true INSTANT, but the instant is
  // what the offset is needed to work out. So it is read twice: once at the
  // wall time treated as UTC, then again at the instant that gives. The two
  // disagree only when those straddle a transition - a window a few hours
  // wide, twice a year, which is exactly why a single pass survives every
  // obvious test. 09:00 above is outside it; these are inside it.
  //
  // Measured: dropping the second pass leaves every other case in this file
  // green and moves these two by an hour.
  const atTime = (date: string, time: string) =>
    parseIcs(
      feed(`BEGIN:VEVENT
UID:dst-${date}-${time}@example.com
DTSTART;TZID=America/New_York:${date}T${time}
SUMMARY:Early
END:VEVENT`)
    ).events[0];

  // Clocks FORWARD, 8 Mar 2026 (02:00 EST becomes 03:00 EDT, at 07:00Z).
  // 06:00 local is after the jump, so EDT (-4) and 10:00Z. Read once, the
  // offset is taken at 06:00Z - before the jump - and gives EST and 11:00Z.
  check(
    iso(atTime("20260308", "060000").startsAt) === "2026-03-08T10:00:00.000Z",
    `06:00 on the spring-forward morning came out ${iso(atTime("20260308", "060000").startsAt)}`
  );
  // Clocks BACK, 1 Nov 2026 (02:00 EDT becomes 01:00 EST, at 06:00Z). 03:00
  // local is after the change, so EST (-5) and 08:00Z. Read once: 07:00Z.
  check(
    iso(atTime("20261101", "030000").startsAt) === "2026-11-01T08:00:00.000Z",
    `03:00 on the fall-back morning came out ${iso(atTime("20261101", "030000").startsAt)}`
  );

  // A zone the platform does not know is SKIPPED, not guessed. Microsoft
  // still writes its own names in some feeds.
  const unknown = parseIcs(
    feed(`BEGIN:VEVENT
UID:ms@example.com
DTSTART;TZID=Eastern Standard Time:20260701T090000
SUMMARY:From Outlook
END:VEVENT`)
  );
  check(unknown.events.length === 0, "an unreadable zone was placed anyway");
  check(unknown.skipped.length === 1, `it should be counted as skipped, got ${JSON.stringify(unknown.skipped)}`);
  check(
    /Eastern Standard Time/.test(unknown.skipped[0]?.why ?? ""),
    `the reason should name the zone, got "${unknown.skipped[0]?.why}"`
  );
}

// --- zoneOffsetMs on its own ----------------------------------------------
{
  check(zoneOffsetMs("UTC", Date.UTC(2026, 6, 1)) === 0, "UTC should be no offset");
  check(zoneOffsetMs("America/New_York", Date.UTC(2026, 6, 1)) === -4 * 3_600_000, "July in New York is UTC-4");
  check(zoneOffsetMs("America/New_York", Date.UTC(2026, 0, 15)) === -5 * 3_600_000, "January in New York is UTC-5");
  check(zoneOffsetMs("Not/AZone", Date.UTC(2026, 0, 1)) === null, "an unknown zone should be null, not 0");
  // Midnight is the case that renders as hour 24 in some runtimes; an
  // unhandled 24 makes the offset a day out.
  check(zoneOffsetMs("UTC", Date.UTC(2026, 6, 1, 0, 0, 0)) === 0, "midnight UTC should still be no offset");
}

// --- AN ALL-DAY RANGE KEEPS ITS LAST DAY ----------------------------------
//
// DTEND is EXCLUSIVE for a DATE. Checked through eventsForDays rather than
// against the stored value, because "which days does this band" is the
// question that matters and the two halves have to agree on it.
{
  const parsed = parseIcs(
    feed(`BEGIN:VEVENT
UID:trip@example.com
DTSTART;VALUE=DATE:20260928
DTEND;VALUE=DATE:20261001
SUMMARY:Trip
END:VEVENT`)
  );
  const e = parsed.events[0];
  check(e.allDay, "a VALUE=DATE event was not marked all-day");
  const week: GridDay[] = Array.from({ length: 7 }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, 27 + i)) }));
  const drawn = eventsForDays(
    [{ id: "x", title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, allDay: true, rrule: null }],
    week
  );
  check(
    drawn.map((d) => d.day).join(",") === "1,2,3",
    `28-30 Sep should band three days (an exclusive 1 Oct end); got ${drawn.map((d) => d.day).join(",")}`
  );

  // A one-day all-day event: DTEND is the next day.
  const one = parseIcs(
    feed(`BEGIN:VEVENT
UID:day@example.com
DTSTART;VALUE=DATE:20260928
DTEND;VALUE=DATE:20260929
SUMMARY:Holiday
END:VEVENT`)
  ).events[0];
  const oneDrawn = eventsForDays(
    [{ id: "y", title: one.title, startsAt: one.startsAt, endsAt: one.endsAt, allDay: true, rrule: null }],
    week
  );
  check(oneDrawn.map((d) => d.day).join(",") === "1", `a one-day holiday should band one day, got ${oneDrawn.map((d) => d.day).join(",")}`);

  // DTSTART with no VALUE=DATE but an 8-digit value is a date all the same.
  const bare = parseIcs(feed(`BEGIN:VEVENT\nUID:bare@example.com\nDTSTART:20260928\nSUMMARY:Bare\nEND:VEVENT`)).events[0];
  check(bare?.allDay === true, "a bare 8-digit DTSTART was not read as a date");
}

// --- DURATION INSTEAD OF DTEND --------------------------------------------
{
  const e = parseIcs(
    feed(`BEGIN:VEVENT
UID:dur@example.com
DTSTART:20260928T090000Z
DURATION:PT1H30M
SUMMARY:Long one
END:VEVENT`)
  ).events[0];
  check(iso(e.endsAt) === "2026-09-28T10:30:00.000Z", `PT1H30M came out ending ${iso(e.endsAt)}`);

  // NEITHER an end nor a duration. A timed event with no end is an instant;
  // drawn at zero height it would save and then be invisible.
  const instant = parseIcs(feed(`BEGIN:VEVENT\nUID:i@example.com\nDTSTART:20260928T090000Z\nSUMMARY:Instant\nEND:VEVENT`)).events[0];
  check(instant.endsAt.getTime() > instant.startsAt.getTime(), "an event with no end was given no length");
  // An all-day event with no end is that one day.
  const oneDay = parseIcs(feed(`BEGIN:VEVENT\nUID:d@example.com\nDTSTART;VALUE=DATE:20260928\nSUMMARY:Day\nEND:VEVENT`)).events[0];
  check(iso(oneDay.endsAt) === "2026-09-29T00:00:00.000Z", `an all-day with no end came out ending ${iso(oneDay.endsAt)}`);
}

// --- A VALARM INSIDE A VEVENT IS NOT THE EVENT ----------------------------
//
// A VALARM carries its own TRIGGER, DESCRIPTION and sometimes a SUMMARY.
// Reading a VEVENT's properties flat takes the alarm's SUMMARY as the
// event's - which puts "Reminder" on the page instead of the title.
{
  const parsed = parseIcs(
    feed(`BEGIN:VEVENT
UID:alarm@example.com
DTSTART:20260928T090000Z
DTEND:20260928T100000Z
SUMMARY:Dentist
BEGIN:VALARM
ACTION:DISPLAY
TRIGGER:-PT15M
SUMMARY:Reminder
DESCRIPTION:Reminder
END:VALARM
END:VEVENT`)
  );
  check(parsed.events.length === 1, `an event with an alarm should still be one event, got ${parsed.events.length}`);
  check(parsed.events[0]?.title === "Dentist", `the alarm's summary was taken as the event's: "${parsed.events[0]?.title}"`);
}

// --- RRULE IS KEPT VERBATIM -----------------------------------------------
{
  const e = parseIcs(
    feed(`BEGIN:VEVENT\nUID:r@example.com\nDTSTART:20260928T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE\nSUMMARY:Class\nEND:VEVENT`)
  ).events[0];
  check(e.rrule === "FREQ=WEEKLY;BYDAY=MO,WE", `the rule came out ${e.rrule}`);
  // One this app cannot draw is still kept - it survives a re-read and a
  // round trip, and calendarEvents.ts simply draws nothing for it.
  const monthly = parseIcs(
    feed(`BEGIN:VEVENT\nUID:m@example.com\nDTSTART:20260928T090000Z\nRRULE:FREQ=MONTHLY;BYMONTHDAY=28\nSUMMARY:Rent\nEND:VEVENT`)
  ).events[0];
  check(monthly.rrule === "FREQ=MONTHLY;BYMONTHDAY=28", `an undrawable rule should still be stored, got ${monthly.rrule}`);
}

// --- CANCELLED AND UNUSABLE EVENTS ----------------------------------------
{
  const cancelled = parseIcs(
    feed(`BEGIN:VEVENT\nUID:c@example.com\nDTSTART:20260928T090000Z\nSTATUS:CANCELLED\nSUMMARY:Off\nEND:VEVENT`)
  ).events[0];
  check(cancelled.cancelled, "a CANCELLED event was not marked as such");

  const noUid = parseIcs(feed(`BEGIN:VEVENT\nDTSTART:20260928T090000Z\nSUMMARY:Anonymous\nEND:VEVENT`));
  check(noUid.events.length === 0 && noUid.skipped.length === 1, "an event with no UID should be skipped and counted");

  const noStart = parseIcs(feed(`BEGIN:VEVENT\nUID:n@example.com\nSUMMARY:When?\nEND:VEVENT`));
  check(noStart.events.length === 0 && noStart.skipped.length === 1, "an event with no start should be skipped and counted");

  const noSummary = parseIcs(feed(`BEGIN:VEVENT\nUID:s@example.com\nDTSTART:20260928T090000Z\nEND:VEVENT`)).events[0];
  check(noSummary?.title === "Untitled", `an event with no summary should still draw, got "${noSummary?.title}"`);
}

// --- A QUOTED PARAMETER CONTAINING A COLON --------------------------------
{
  const e = parseIcs(
    feed(`BEGIN:VEVENT\nUID:q@example.com\nDTSTART;TZID="America/New_York":20260701T090000\nSUMMARY:Quoted zone\nEND:VEVENT`)
  ).events[0];
  check(iso(e?.startsAt) === "2026-07-01T13:00:00.000Z", `a quoted TZID came out ${iso(e?.startsAt)}`);
}

// --- A SERIES WITH ONE WEEK MOVED AND ONE DELETED -------------------------
//
// EXACTLY WHAT GOOGLE WRITES for a repeating meeting somebody rescheduled
// once and cancelled once: the series with an EXDATE line, and a SEPARATE
// VEVENT with the same UID and a RECURRENCE-ID for the moved week.
//
// Measured before this existed: the reader returned the moved week as a
// second event with the series' UID, the sync matches by UID, and on the
// second read the moved week OVERWROTE THE WHOLE SERIES - rrule gone, every
// other Monday gone. The deleted week was never removed at all.
{
  const google = feed(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:standup@google.com
DTSTART;TZID=America/New_York:20260907T090000
DTEND;TZID=America/New_York:20260907T093000
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE;TZID=America/New_York:20260921T090000
SUMMARY:Standup
END:VEVENT
BEGIN:VEVENT
UID:standup@google.com
RECURRENCE-ID;TZID=America/New_York:20260928T090000
DTSTART;TZID=America/New_York:20260928T110000
DTEND;TZID=America/New_York:20260928T113000
SUMMARY:Standup (moved)
END:VEVENT
END:VCALENDAR`);
  const parsed = parseIcs(google);
  check(parsed.events.length === 1, `one series should come back as ONE event, got ${parsed.events.length}`);
  const series = parsed.events[0];
  check(series.rrule === "FREQ=WEEKLY;BYDAY=MO", `the series keeps its rule, got ${series.rrule}`);
  check(series.overrides.length === 2, `it should carry two changed occurrences, got ${series.overrides.length}`);

  const deleted = series.overrides.find((o) => o.cancelled);
  check(
    deleted?.recurrenceId.toISOString() === "2026-09-21T13:00:00.000Z",
    `the EXDATE names 9am New York on the 21st (13:00Z), got ${deleted?.recurrenceId.toISOString()}`
  );
  const moved = series.overrides.find((o) => !o.cancelled);
  check(
    moved?.recurrenceId.toISOString() === "2026-09-28T13:00:00.000Z" && moved?.startsAt?.toISOString() === "2026-09-28T15:00:00.000Z",
    `the moved week is named by its ORIGINAL 9am and moved to 11am; got ${moved?.recurrenceId.toISOString()} -> ${moved?.startsAt?.toISOString()}`
  );

  // AND IT DRAWS RIGHT - which is the point. Through the real placer.
  const row = {
    id: "s",
    title: series.title,
    startsAt: series.startsAt,
    endsAt: series.endsAt,
    allDay: series.allDay,
    rrule: series.rrule,
    timeZone: series.timeZone,
    overrides: series.overrides,
  };
  const week = (d: number) => Array.from({ length: 7 }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, d + i)) }));
  const shown = (d: number) =>
    eventsForDays([row], week(d), "America/New_York").map((e) => `${e.startTime} ${e.label}`).join(" | ");
  check(shown(13) === "09:00 Standup", `the week of the 13th is untouched; got ${shown(13)}`);
  check(shown(20) === "", `the week of the 20th was deleted; got "${shown(20)}"`);
  check(shown(27) === "11:00 Standup (moved)", `the week of the 27th was moved to 11am; got ${shown(27)}`);
}

// --- EXDATE IN ITS OTHER SHAPES -------------------------------------------
{
  // Comma-separated, and in UTC.
  const commas = parseIcs(
    feed(`BEGIN:VEVENT\nUID:c@example.com\nDTSTART:20260907T130000Z\nRRULE:FREQ=WEEKLY\nEXDATE:20260914T130000Z,20260921T130000Z\nSUMMARY:x\nEND:VEVENT`)
  ).events[0];
  check(commas.overrides.filter((o) => o.cancelled).length === 2, `comma-separated EXDATEs should both count, got ${commas.overrides.length}`);
  // ONE LINE PER DELETION, which is how Google writes several. EXDATE is the
  // one property allowed to repeat; read like the others - last one wins -
  // only the final deletion survives. Measured: that sabotage passed every
  // case above, because none of them had two lines.
  const lines = parseIcs(
    feed(`BEGIN:VEVENT\nUID:l@example.com\nDTSTART:20260907T130000Z\nRRULE:FREQ=WEEKLY\nEXDATE:20260914T130000Z\nEXDATE:20260921T130000Z\nEXDATE:20260928T130000Z\nSUMMARY:x\nEND:VEVENT`)
  ).events[0];
  check(
    lines.overrides.filter((o) => o.cancelled).length === 3,
    `three EXDATE lines should delete three weeks, got ${lines.overrides.filter((o) => o.cancelled).length}`
  );
  // An all-day series deletes by DATE.
  const allDay = parseIcs(
    feed(`BEGIN:VEVENT\nUID:d@example.com\nDTSTART;VALUE=DATE:20260907\nRRULE:FREQ=WEEKLY\nEXDATE;VALUE=DATE:20260914\nSUMMARY:Bins\nEND:VEVENT`)
  ).events[0];
  check(
    allDay.overrides[0]?.recurrenceId.toISOString() === "2026-09-14T00:00:00.000Z",
    `an all-day EXDATE names midnight of its date, got ${allDay.overrides[0]?.recurrenceId.toISOString()}`
  );
  // A cancelled exception is a deleted occurrence too.
  const cancelledException = parseIcs(
    feed(`BEGIN:VEVENT\nUID:e@example.com\nDTSTART:20260907T130000Z\nRRULE:FREQ=WEEKLY\nSUMMARY:x\nEND:VEVENT\nBEGIN:VEVENT\nUID:e@example.com\nRECURRENCE-ID:20260914T130000Z\nDTSTART:20260914T130000Z\nSTATUS:CANCELLED\nSUMMARY:x\nEND:VEVENT`)
  ).events;
  check(
    cancelledException.length === 1 && cancelledException[0].overrides[0]?.cancelled === true,
    "a cancelled RECURRENCE-ID should become a cancelled occurrence of its series"
  );
}

// --- AN ORPHANED OCCURRENCE IS KEPT, ON ITS OWN ---------------------------
//
// Invited to one week of somebody else's series: the feed has the occurrence
// and not the series. It is still on the person's calendar, so it is kept -
// as a one-off, under a UID of its own so it cannot collide with anything.
{
  const orphan = parseIcs(
    feed(`BEGIN:VEVENT\nUID:theirs@example.com\nRECURRENCE-ID:20260928T130000Z\nDTSTART:20260928T150000Z\nDTEND:20260928T160000Z\nSUMMARY:Guest spot\nEND:VEVENT`)
  ).events;
  check(orphan.length === 1 && orphan[0].rrule === null, "an orphaned occurrence should be kept as a one-off");
  check(orphan[0]?.uid !== "theirs@example.com", "and under a UID of its own, not the series'");
}

// --- AN EMPTY OR JUNK FEED DOES NOT THROW ---------------------------------
for (const junk of ["", "not an ics file at all", "BEGIN:VCALENDAR\r\nEND:VCALENDAR"]) {
  const parsed = parseIcs(junk);
  check(parsed.events.length === 0, `"${junk.slice(0, 20)}" produced events`);
}

if (failures > 0) {
  console.error(`\nics reading: ${failures} problem(s).`);
  process.exit(1);
}
console.log(
  "All ics checks passed (folded lines and escapes, wall times across a DST boundary, an unknown zone skipped rather than guessed, " +
    "all-day ranges keeping their last day, DURATION, a VALARM's own properties ignored, rules kept verbatim, junk not throwing)."
);
