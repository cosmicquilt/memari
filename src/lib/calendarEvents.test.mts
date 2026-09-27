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
// Not "draws something approximate". An imported MONTHLY rule keeps its
// RRULE in the database so a round trip to Google does not destroy it, but
// drawing it as if it were weekly would put a confidently wrong mark on a
// printed page - which is worse than a missing one, because nobody checks a
// page that looks right.
for (const rule of ["FREQ=MONTHLY;BYMONTHDAY=22", "FREQ=YEARLY", "FREQ=HOURLY", "", "nonsense"]) {
  check(
    days([event({ rrule: rule })]).length === (rule === "" ? 1 : 0),
    `"${rule}" should draw ${rule === "" ? "as a one-off" : "nothing"}, drew ${days([event({ rrule: rule })]).length}`
  );
}

// --- the calendar's colour and source reach the mark ----------------------
{
  const drawn = eventsForDays([event({ calendar: { colour: "#ffd8d8", source: "google" } })], WEEK)[0];
  check(drawn.colour === "#ffd8d8", `the calendar's colour should reach the mark, got ${drawn.colour}`);
  check(drawn.source === "google-calendar", `an imported event's source should say so, got ${drawn.source}`);
  const own = eventsForDays([event()], WEEK)[0];
  check(own.source === "manual", `a typed event should be manual, got ${own.source}`);
}

if (failures > 0) {
  console.error(`\nCalendar events: ${failures} problem(s).`);
  process.exit(1);
}
console.log(
  "All calendar event checks passed (one-offs, overnight staying put, all-day spans banding every day, " +
    "weekly and daily recurrence with BYDAY/INTERVAL/COUNT/UNTIL, and unsupported rules drawing nothing)."
);
