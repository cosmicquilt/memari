// Stored events, placed on a week's columns.
//
// This is the join between a dated thing and a template, so the cases worth
// pinning are the ones where "which day is this on" is not obvious: a
// recurrence, an all-day span, an event that runs past midnight, and a rule
// this does not support.
//
//   npx tsx src/lib/calendarEvents.test.mts

import { eventsForDays, type StoredEvent, type GridDay } from "./calendarEvents";

let failures = 0;
const check = (ok: boolean, message: string) => {
  if (!ok) {
    console.error(`  FAIL  ${message}`);
    failures++;
  }
};

const at = (iso: string) => new Date(`${iso}Z`);
/** Sun 20 Sep 2026 through Sat 26 Sep 2026. */
const WEEK: GridDay[] = Array.from({ length: 7 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 8, 20 + i)),
}));

const event = (over: Partial<StoredEvent> = {}): StoredEvent => ({
  id: "e",
  title: "Thing",
  startsAt: at("2026-09-22T09:00:00.000"),
  endsAt: at("2026-09-22T10:00:00.000"),
  allDay: false,
  rrule: null,
  ...over,
});

const days = (events: StoredEvent[]) => eventsForDays(events, WEEK).map((e) => e.day);

// --- a one-off lands on its own day ---------------------------------------
{
  const drawn = eventsForDays([event()], WEEK);
  check(drawn.length === 1, `a one-off should be drawn once, got ${drawn.length}`);
  check(drawn[0].day === 2, `Tuesday 22 Sep is column 2, got ${drawn[0].day}`);
  check(drawn[0].startTime === "09:00" && drawn[0].endTime === "10:00", `times came out ${drawn[0].startTime}-${drawn[0].endTime}`);
  check(!drawn[0].allDay, "a timed event was marked all-day");
}

// --- one outside the week is not drawn ------------------------------------
{
  check(days([event({ startsAt: at("2026-09-19T09:00:00.000"), endsAt: at("2026-09-19T10:00:00.000") })]).length === 0,
    "an event the day before the week was drawn");
  check(days([event({ startsAt: at("2026-09-27T09:00:00.000"), endsAt: at("2026-09-27T10:00:00.000") })]).length === 0,
    "an event the day after the week was drawn");
}

// --- deleted events are gone ----------------------------------------------
check(days([event({ deletedAt: at("2026-09-23T00:00:00.000") })]).length === 0, "a tombstoned event was drawn");

// --- AN EVENT RUNNING PAST MIDNIGHT stays on the day it began -------------
//
// A column is a day. Half an event appearing at the top of the next column
// reads as a second event, so it is drawn where it started and the grid's
// own hours clip it.
{
  const drawn = eventsForDays(
    [event({ startsAt: at("2026-09-22T23:00:00.000"), endsAt: at("2026-09-23T01:00:00.000") })],
    WEEK
  );
  check(drawn.length === 1, `an overnight event should be drawn once, got ${drawn.length}`);
  check(drawn[0].day === 2, `it should stay on the day it began, got column ${drawn[0].day}`);
}

// --- AN ALL-DAY SPAN bands every day it covers ----------------------------
//
// The opposite rule, and deliberately: a three-day trip is on the page for
// three days, and banding only the first would be a lie about the other two.
{
  const drawn = eventsForDays(
    [event({ allDay: true, startsAt: at("2026-09-22T00:00:00.000"), endsAt: at("2026-09-25T00:00:00.000") })],
    WEEK
  );
  check(
    drawn.map((e) => e.day).join(",") === "2,3,4",
    `a 22-25 Sep all-day span should band columns 2,3,4; got ${drawn.map((e) => e.day).join(",")}`
  );
  check(drawn.every((e) => e.allDay), "an all-day span was not marked all-day");
}

// --- WEEKLY recurrence ----------------------------------------------------
{
  // Every Tuesday, from a Tuesday before this week.
  const weekly = event({ startsAt: at("2026-09-08T09:00:00.000"), endsAt: at("2026-09-08T10:00:00.000"), rrule: "FREQ=WEEKLY" });
  check(days([weekly]).join(",") === "2", `a weekly Tuesday should land on column 2 only, got ${days([weekly])}`);

  // BYDAY, several in a week.
  const weekdays = event({ startsAt: at("2026-09-07T09:00:00.000"), endsAt: at("2026-09-07T09:30:00.000"), rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" });
  check(days([weekdays]).join(",") === "1,3,5", `MO,WE,FR should be columns 1,3,5; got ${days([weekdays])}`);

  // INTERVAL counts from the series' own start, not from the year.
  const fortnightly = event({ startsAt: at("2026-09-08T09:00:00.000"), endsAt: at("2026-09-08T10:00:00.000"), rrule: "FREQ=WEEKLY;INTERVAL=2" });
  check(days([fortnightly]).join(",") === "2", `8 Sep + 2 weeks is 22 Sep, so column 2; got ${days([fortnightly])}`);
  const offBeat = event({ startsAt: at("2026-09-15T09:00:00.000"), endsAt: at("2026-09-15T10:00:00.000"), rrule: "FREQ=WEEKLY;INTERVAL=2" });
  check(days([offBeat]).length === 0, `15 Sep every other week skips 22 Sep; got ${days([offBeat])}`);

  // An instance keeps the series' time of day and its length.
  const drawn = eventsForDays([weekly], WEEK)[0];
  check(drawn.startTime === "09:00" && drawn.endTime === "10:00", `an instance came out ${drawn.startTime}-${drawn.endTime}`);
}

// --- DAILY recurrence, and its bounds -------------------------------------
{
  const daily = event({ startsAt: at("2026-09-21T07:00:00.000"), endsAt: at("2026-09-21T07:30:00.000"), rrule: "FREQ=DAILY" });
  check(days([daily]).join(",") === "1,2,3,4,5,6", `daily from Mon should fill columns 1-6, got ${days([daily])}`);

  const until = event({ ...daily, rrule: "FREQ=DAILY;UNTIL=20260923" });
  check(days([until]).join(",") === "1,2,3", `UNTIL 23 Sep is inclusive, so 1,2,3; got ${days([until])}`);

  const counted = event({ ...daily, rrule: "FREQ=DAILY;COUNT=2" });
  check(days([counted]).join(",") === "1,2", `COUNT=2 should give two instances, got ${days([counted])}`);

  // Nothing before the series begins.
  check(days([event({ startsAt: at("2026-09-24T07:00:00.000"), endsAt: at("2026-09-24T07:30:00.000"), rrule: "FREQ=DAILY" })]).join(",") === "4,5,6",
    "a series was drawn before its own start");
}

// --- A RULE THIS DOES NOT SUPPORT DRAWS NOTHING ---------------------------
//
// Not "draws something approximate". An imported rule with a part this
// cannot read keeps its RRULE in the database so a round trip to Google does
// not destroy it, but drawing it approximately would put a confidently wrong
// mark on a printed page - which is worse than a missing one, because nobody
// checks a page that looks right. (MONTHLY and YEARLY were on this list until
// 2026-10-06; they draw now - see below.)
for (const rule of [
  "FREQ=HOURLY",
  "",
  "nonsense",
  "FREQ=MONTHLY;BYSETPOS=-1;BYDAY=MO,TU,WE,TH,FR",
  "FREQ=MONTHLY;BYDAY=6TU",
  "FREQ=WEEKLY;BYMONTHDAY=22",
  "FREQ=YEARLY;BYWEEKNO=39",
]) {
  check(
    days([event({ rrule: rule })]).length === (rule === "" ? 1 : 0),
    `"${rule}" should draw ${rule === "" ? "as a one-off" : "nothing"}, drew ${days([event({ rrule: rule })]).length}`
  );
}

// --- MONTHLY AND YEARLY (2026-10-06) -----------------------------------------
// For day icons - "one off or repeated once every whatever or skip or first
// monday" - and every imported monthly event with them. Each date below was
// checked against a real 2026-2028 calendar.
{
  const on = (rrule: string, start: string, iso: string) =>
    eventsForDays([event({ rrule, allDay: true, startsAt: at(`${start}T00:00:00.000`), endsAt: at(`${start}T00:00:00.000`) })], [{ date: at(`${iso}T00:00:00.000`) }]).length > 0;
  const cases: Array<[string, string, string, boolean, string]> = [
    ["FREQ=MONTHLY;BYMONTHDAY=22", "2026-09-22", "2026-10-22", true, "the 22nd, next month"],
    ["FREQ=MONTHLY;BYMONTHDAY=22", "2026-09-22", "2026-10-21", false, "not the 21st"],
    ["FREQ=MONTHLY", "2026-01-31", "2026-03-31", true, "a 31st recurs on the next 31st"],
    ["FREQ=MONTHLY", "2026-01-31", "2026-02-28", false, "and is skipped in February, not slid to the 28th"],
    ["FREQ=MONTHLY;BYMONTHDAY=-1", "2026-01-31", "2026-02-28", true, "the last day of February 2026"],
    ["FREQ=MONTHLY;BYDAY=1MO", "2026-10-05", "2026-11-02", true, "the first Monday of November 2026 is the 2nd"],
    ["FREQ=MONTHLY;BYDAY=1MO", "2026-10-05", "2026-12-07", true, "and of December the 7th"],
    ["FREQ=MONTHLY;BYDAY=1MO", "2026-10-05", "2026-11-09", false, "not the second Monday"],
    ["FREQ=MONTHLY;BYDAY=-1FR", "2026-10-30", "2026-11-27", true, "the last Friday of November 2026"],
    ["FREQ=MONTHLY;BYDAY=-1FR", "2026-10-30", "2026-11-20", false, "not the one before it"],
    // Where "last" arithmetic goes wrong: a last Friday that IS the month's
    // last day (30 April 2027). Without this case an off-by-one passed.
    ["FREQ=MONTHLY;BYDAY=-1FR", "2026-10-30", "2027-04-30", true, "a last Friday on the month's last day"],
    ["FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1", "2026-01-01", "2026-04-01", true, "every three months from January: April"],
    ["FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1", "2026-01-01", "2026-02-01", false, "not February"],
    ["FREQ=MONTHLY;BYDAY=1MO;COUNT=2", "2026-10-05", "2026-11-02", true, "COUNT=2: the second"],
    ["FREQ=MONTHLY;BYDAY=1MO;COUNT=2", "2026-10-05", "2026-12-07", false, "and no third"],
    ["FREQ=MONTHLY;BYMONTHDAY=15;UNTIL=20261115", "2026-09-15", "2026-11-15", true, "UNTIL includes its own day"],
    ["FREQ=MONTHLY;BYMONTHDAY=15;UNTIL=20261115", "2026-09-15", "2026-12-15", false, "and stops after it"],
    ["FREQ=MONTHLY;BYDAY=1MO", "2026-10-05", "2026-09-07", false, "nothing before the series starts"],
    ["FREQ=YEARLY", "2026-02-14", "2027-02-14", true, "every year on 14 Feb"],
    ["FREQ=YEARLY", "2026-02-14", "2026-03-14", false, "not every month"],
    ["FREQ=YEARLY", "2024-02-29", "2028-02-29", true, "a 29 Feb birthday in a leap year"],
    ["FREQ=YEARLY", "2024-02-29", "2025-02-28", false, "and not slid to the 28th"],
    ["FREQ=YEARLY;INTERVAL=2", "2026-06-01", "2027-06-01", false, "every other year skips 2027"],
    ["FREQ=YEARLY;INTERVAL=2", "2026-06-01", "2028-06-01", true, "and lands in 2028"],
    ["FREQ=YEARLY;BYMONTH=11;BYDAY=4TH", "2026-11-26", "2027-11-25", true, "the fourth Thursday of November 2027"],
  ];
  for (const [rule, start, iso, want, what] of cases) {
    const got = on(rule, start, iso);
    check(got === want, `${rule} from ${start}, on ${iso}: ${what} - drew ${got}`);
  }
}

// --- the calendar's colour and source reach the mark ----------------------
{
  const drawn = eventsForDays([event({ calendar: { colour: "#ffd8d8", source: "google" } })], WEEK)[0];
  check(drawn.colour === "#ffd8d8", `the calendar's colour should reach the mark, got ${drawn.colour}`);
  check(drawn.source === "google-calendar", `an imported event's source should say so, got ${drawn.source}`);
  const own = eventsForDays([event()], WEEK)[0];
  check(own.source === "manual", `a typed event should be manual, got ${own.source}`);
}

// ===========================================================================
// TIME ZONES
//
// An event is an INSTANT; a book has a ZONE; the page draws the wall-clock
// time in the book's zone. Everything above is in UTC, where the instant and
// the wall clock read the same - which is exactly why none of it noticed that
// a 9am New York meeting was printing in the 1pm row.
// ===========================================================================

/** Sun 27 Sep - Sat 3 Oct 2026, and any other week by its Sunday. */
const weekFrom = (y: number, m: number, d: number): GridDay[] =>
  Array.from({ length: 7 }, (_, i) => ({ date: new Date(Date.UTC(y, m - 1, d + i)) }));
const LATE_SEP = weekFrom(2026, 9, 27);
const placed = (events: StoredEvent[], days: GridDay[], zone: string) =>
  eventsForDays(events, days, zone).map(
    (e) => `${days[e.day].date!.toISOString().slice(0, 10)} ${e.startTime}-${e.endTime}`
  );

// --- THE BUG: a New York meeting in a New York book -----------------------
{
  // 9am New York on Mon 28 Sep is 13:00Z (EDT, UTC-4).
  const nine = event({
    startsAt: at("2026-09-28T13:00:00.000"),
    endsAt: at("2026-09-28T14:00:00.000"),
    timeZone: "America/New_York",
  });
  check(
    placed([nine], LATE_SEP, "America/New_York").join() === "2026-09-28 09:00-10:00",
    `9am New York should print at 09:00 on the 28th; got ${placed([nine], LATE_SEP, "America/New_York")}`
  );

  // 9pm New York is 01:00Z THE NEXT DAY. Read in UTC it moved columns.
  const evening = event({
    startsAt: at("2026-09-29T01:00:00.000"),
    endsAt: at("2026-09-29T02:00:00.000"),
    timeZone: "America/New_York",
  });
  check(
    placed([evening], LATE_SEP, "America/New_York").join() === "2026-09-28 21:00-22:00",
    `9pm New York should stay on the 28th at 21:00; got ${placed([evening], LATE_SEP, "America/New_York")}`
  );

  // THE SAME INSTANT IN A LONDON BOOK is 2pm - London is BST (UTC+1) in late
  // September. An instant is an instant; the book decides the clock.
  check(
    placed([nine], LATE_SEP, "Europe/London").join() === "2026-09-28 14:00-15:00",
    `the same meeting in a London book should be 14:00; got ${placed([nine], LATE_SEP, "Europe/London")}`
  );
}

// --- FLOATING TIMES ARE NOT CONVERTED -------------------------------------
//
// "9am wherever you are" - an imported event with no zone, and everything
// typed before books had zones. Converting it from UTC would print it at 5am
// in New York.
{
  const floating = event({
    startsAt: at("2026-09-28T09:00:00.000"),
    endsAt: at("2026-09-28T10:00:00.000"),
    timeZone: "floating",
  });
  for (const zone of ["America/New_York", "Europe/London", "Asia/Tokyo"]) {
    check(
      placed([floating], LATE_SEP, zone).join() === "2026-09-28 09:00-10:00",
      `a floating 9am should be 9am in ${zone}; got ${placed([floating], LATE_SEP, zone)}`
    );
  }
}

// --- ALL-DAY IS A DATE, NOT AN INSTANT ------------------------------------
{
  // Stored as UTC midnight of its date. Converted to Tokyo (UTC+9) it would
  // still be the 26th; converted to New York (UTC-4/5) it would become the
  // 25th - which is exactly the mistake an all-day event must not make.
  const thanksgiving = event({
    allDay: true,
    startsAt: at("2026-11-26T00:00:00.000"),
    endsAt: at("2026-11-27T00:00:00.000"),
    timeZone: "UTC",
  });
  const nov = weekFrom(2026, 11, 22);
  for (const zone of ["America/Los_Angeles", "America/New_York", "Asia/Tokyo"]) {
    check(
      eventsForDays([thanksgiving], nov, zone).map((e) => e.day).join() === "4",
      `Thanksgiving is the 26th in ${zone} too; got column ${eventsForDays([thanksgiving], nov, zone).map((e) => e.day)}`
    );
  }
}

// --- A SERIES HOLDS ITS WALL TIME ACROSS DAYLIGHT SAVING ------------------
//
// "Every Monday at 9am New York", started in September (EDT). The clocks go
// back on 1 Nov; after that 9am is 14:00Z, not 13:00Z. Expanding the rule on
// the stored UTC instant keeps 13:00Z and prints it at 8am all winter.
{
  const standup = event({
    startsAt: at("2026-09-07T13:00:00.000"),
    endsAt: at("2026-09-07T13:30:00.000"),
    rrule: "FREQ=WEEKLY;BYDAY=MO",
    timeZone: "America/New_York",
  });
  const before = placed([standup], weekFrom(2026, 10, 25), "America/New_York");
  const after = placed([standup], weekFrom(2026, 11, 1), "America/New_York");
  check(before.join() === "2026-10-26 09:00-09:30", `26 Oct (EDT) should be 09:00; got ${before}`);
  check(after.join() === "2026-11-02 09:00-09:30", `2 Nov (EST) should STILL be 09:00; got ${after}`);

  // AND IN A LONDON BOOK it moves by an hour for one week, because the UK
  // changes its clocks on 25 Oct and the US on 1 Nov. That is correct - the
  // meeting happens in New York, at 9am New York - and it is the case that
  // proves the series is expanded in ITS zone rather than the book's.
  const london = (y: number, m: number, d: number) => placed([standup], weekFrom(y, m, d), "Europe/London").join();
  check(london(2026, 10, 18) === "2026-10-19 14:00-14:30", `19 Oct in London (both on summer time) should be 14:00; got ${london(2026, 10, 18)}`);
  check(london(2026, 10, 25) === "2026-10-26 13:00-13:30", `26 Oct in London (UK back, US not yet) should be 13:00; got ${london(2026, 10, 25)}`);
  check(london(2026, 11, 1) === "2026-11-02 14:00-14:30", `2 Nov in London (both back) should be 14:00; got ${london(2026, 11, 1)}`);
}

// --- A SERIES WHOSE INSTANCES LAND ON A DIFFERENT DATE --------------------
//
// Mondays at 9pm in Honolulu (UTC-10) are Tuesdays at 9pm in Kiritimati
// (UTC+14): a whole day apart. A placement that only looked for the rule on
// the column's own date would never find it.
{
  const late = event({
    startsAt: at("2026-09-08T07:00:00.000"), // Mon 7 Sep, 21:00 Honolulu
    endsAt: at("2026-09-08T08:00:00.000"),
    rrule: "FREQ=WEEKLY;BYDAY=MO",
    timeZone: "Pacific/Honolulu",
  });
  check(
    placed([late], LATE_SEP, "Pacific/Kiritimati").join() === "2026-09-29 21:00-22:00",
    `Monday 9pm Honolulu is Tuesday 9pm in Kiritimati; got ${placed([late], LATE_SEP, "Pacific/Kiritimati")}`
  );
  check(
    placed([late], LATE_SEP, "Pacific/Honolulu").join() === "2026-09-28 21:00-22:00",
    `and Monday 9pm in its own zone; got ${placed([late], LATE_SEP, "Pacific/Honolulu")}`
  );
}

// ===========================================================================
// ONE OCCURRENCE OF A SERIES, CHANGED
//
// An occurrence is named by where the rule put it - its original start - so
// it can still be found after it has been moved somewhere the rule would
// never put it. These are the cases a Google feed writes for every
// rescheduled or cancelled week of a repeating meeting, and the ones a person
// makes by editing "only this week".
// ===========================================================================
{
  // Mondays 9am New York (13:00Z in September, EDT).
  const series = (overrides: StoredEvent["overrides"]) =>
    event({
      id: "standup",
      startsAt: at("2026-09-07T13:00:00.000"),
      endsAt: at("2026-09-07T13:30:00.000"),
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      timeZone: "America/New_York",
      overrides,
    });
  const monday28 = at("2026-09-28T13:00:00.000"); // the occurrence on the 28th

  // Untouched, for the control.
  check(
    placed([series([])], LATE_SEP, "America/New_York").join() === "2026-09-28 09:00-09:30",
    `the control: Monday the 28th at 09:00; got ${placed([series([])], LATE_SEP, "America/New_York")}`
  );

  // CANCELLED: that week, and only that week, is gone.
  const cancelled = series([{ recurrenceId: monday28, cancelled: true }]);
  check(placed([cancelled], LATE_SEP, "America/New_York").length === 0, "a cancelled occurrence was still drawn");
  check(
    placed([cancelled], weekFrom(2026, 10, 4), "America/New_York").join() === "2026-10-05 09:00-09:30",
    `and the week after is untouched; got ${placed([cancelled], weekFrom(2026, 10, 4), "America/New_York")}`
  );

  // MOVED to 11am the same day: drawn at 11, NOT also at 9.
  const movedLater = series([
    { recurrenceId: monday28, cancelled: false, startsAt: at("2026-09-28T15:00:00.000"), endsAt: at("2026-09-28T15:30:00.000") },
  ]);
  check(
    placed([movedLater], LATE_SEP, "America/New_York").join() === "2026-09-28 11:00-11:30",
    `moved to 11am, it should draw once at 11:00; got ${placed([movedLater], LATE_SEP, "America/New_York")}`
  );

  // MOVED TO ANOTHER DAY - Wednesday - which the rule never touches. Found by
  // its own start, and gone from Monday.
  const movedDay = series([
    { recurrenceId: monday28, cancelled: false, startsAt: at("2026-09-30T13:00:00.000"), endsAt: at("2026-09-30T13:30:00.000") },
  ]);
  check(
    placed([movedDay], LATE_SEP, "America/New_York").join() === "2026-09-30 09:00-09:30",
    `moved to Wednesday, it should draw on Wednesday and not Monday; got ${placed([movedDay], LATE_SEP, "America/New_York")}`
  );

  // RENAMED only: same time, its own title.
  const renamed = series([{ recurrenceId: monday28, cancelled: false, title: "Standup (with Dana)" }]);
  const renamedDrawn = eventsForDays([renamed], LATE_SEP, "America/New_York");
  check(
    renamedDrawn.length === 1 && renamedDrawn[0].label === "Standup (with Dana)",
    `a renamed occurrence should keep its time and take its own title; got ${renamedDrawn.map((e) => e.label)}`
  );
  check(
    eventsForDays([renamed], weekFrom(2026, 10, 4), "America/New_York")[0]?.label === "Thing",
    "the rename should touch only that week"
  );

  // EVERY DRAWN OCCURRENCE SAYS WHICH ONE IT IS - the original start, even
  // once moved. It keys the marks and tells the popup which week "only this
  // one" means.
  const movedKey = eventsForDays([movedDay], LATE_SEP, "America/New_York")[0];
  check(
    movedKey?.occurrence === String(monday28.getTime()),
    `a moved occurrence should still be named by its ORIGINAL start; got ${movedKey?.occurrence}`
  );
  check(
    eventsForDays([event()], WEEK)[0].occurrence === undefined,
    "a one-off has no occurrence to name"
  );

  // A DAILY SERIES WITH ONE DAY MOVED ONTO THE NEXT puts two blocks of one
  // event in one column - which is why the occurrence is part of the key.
  const daily = event({
    id: "daily",
    startsAt: at("2026-09-28T13:00:00.000"),
    endsAt: at("2026-09-28T13:30:00.000"),
    rrule: "FREQ=DAILY",
    timeZone: "America/New_York",
    overrides: [
      { recurrenceId: at("2026-09-28T13:00:00.000"), cancelled: false, startsAt: at("2026-09-29T18:00:00.000"), endsAt: at("2026-09-29T18:30:00.000") },
    ],
  });
  const tuesday = eventsForDays([daily], LATE_SEP, "America/New_York").filter((e) => e.day === 2);
  check(
    tuesday.map((e) => e.startTime).sort().join() === "09:00,14:00",
    `Tuesday should hold its own 9am and Monday's, moved to 2pm; got ${tuesday.map((e) => e.startTime)}`
  );
  check(
    new Set(tuesday.map((e) => e.occurrence)).size === 2,
    "and the two must be told apart by their occurrence"
  );

  // AN ALL-DAY SERIES' occurrence is named by its date at midnight.
  const weeklyHoliday = event({
    id: "bins",
    allDay: true,
    startsAt: at("2026-09-07T00:00:00.000"),
    endsAt: at("2026-09-08T00:00:00.000"),
    rrule: "FREQ=WEEKLY",
    overrides: [{ recurrenceId: at("2026-09-28T00:00:00.000"), cancelled: true }],
  });
  check(
    eventsForDays([weeklyHoliday], LATE_SEP, "America/New_York").length === 0,
    "a cancelled all-day occurrence was still drawn"
  );
}

// --- AN UNKNOWN BOOK ZONE STILL DRAWS -------------------------------------
check(
  placed([event()], WEEK, "Not/AZone").join() === "2026-09-22 09:00-10:00",
  `an unknown book zone should fall back to UTC rather than throw; got ${placed([event()], WEEK, "Not/AZone")}`
);

if (failures > 0) {
  console.error(`\nCalendar events: ${failures} problem(s).`);
  process.exit(1);
}
console.log(
  "All calendar event checks passed (one-offs, overnight staying put, all-day spans banding every day, " +
    "daily, weekly, monthly and yearly recurrence with BYDAY and its ordinals, BYMONTHDAY, BYMONTH, INTERVAL, COUNT and UNTIL, and unsupported rules drawing nothing)."
);
