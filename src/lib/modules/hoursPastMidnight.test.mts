// HOURS PAST MIDNIGHT (2026-10-20): "times past midnight should stay with the
// previous times with a super script +1 after the time like in google
// flights". An end at or before the start runs on into the next day, in the
// same column; each time after midnight carries a raised +1; the next
// morning's events are drawn in the evening's column; a drag there is dated
// the next day; and an event outside the hours is no longer drawn over the
// day tab.
//
// Run as part of: npm test
import { getHourlyGridCoreContentHeightPx, hourlyGridGeometry, hoursSpan, overnightMinutes, renderHourlyGridCore, type HourlyGridCoreConfig, type HourlyGridEvent } from "./hourlyGridCore";
import { eventsForDays, type StoredEvent } from "../calendarEvents";
import { columnForEvent, slotAt } from "../hourlyGridHit";
import { FONT_SERIF } from "@/lib/theme";

let failures = 0;
const check = (ok: boolean, message: string) => {
  if (!ok) {
    console.error(`  FAIL  ${message}`);
    failures++;
  }
};

const GEOMETRY = { x: 0, y: 0, width: 1788, height: 1800 };
const config = (over: Partial<HourlyGridCoreConfig> = {}): HourlyGridCoreConfig => ({
  dayCount: 3,
  dayLabels: [{ name: "MONDAY", date: 5 }, { name: "TUESDAY", date: 6 }, { name: "WEDNESDAY", date: 7 }],
  startTime: "10:00",
  endTime: "02:00",
  intervalMinutes: 30,
  hourLineStyle: "full",
  dayBorder: false,
  events: [],
  ...over,
});
const render = (c: HourlyGridCoreConfig) => renderHourlyGridCore(GEOMETRY, c, "t", FONT_SERIF) as Array<{ id: string; type: string; x: number; y: number; width: number; height: number; text?: string }>;

// ---------------------------------------------------------------- the span
const span = hoursSpan("10:00", "02:00");
check(span.startMinutes === 600 && span.endMinutes === 1560, `10:00 to 02:00 is 600 to 1560 (${JSON.stringify(span)})`);
check(overnightMinutes({ startTime: "10:00", endTime: "02:00" }) === 120, "two hours past midnight");
check(overnightMinutes({ startTime: "05:30", endTime: "23:30" }) === 0, "a day that ends by midnight runs none past it");
check(overnightMinutes({ startTime: "06:00", endTime: "24:00" }) === 0 && hoursSpan("06:00", "24:00").endMinutes === 1440, "24:00 is midnight, still that day");
check(hoursSpan("19:00", "07:00").endMinutes - hoursSpan("19:00", "07:00").startMinutes === 720, "a night shift is twelve hours");

// ---------------------------------------------------------------- the rows
const geo = hourlyGridGeometry(GEOMETRY, config());
check(geo.rowCount === 32, `sixteen hours of half hours is 32 rows (${geo.rowCount})`);
const day = getHourlyGridCoreContentHeightPx({ startTime: "06:00", endTime: "22:00", intervalMinutes: 30 });
const night = getHourlyGridCoreContentHeightPx({ startTime: "10:00", endTime: "02:00", intervalMinutes: 30 });
check(Math.abs(day - night) < 0.001, "and as tall as any other sixteen hours");

const marks = render(config());
const day0 = (suffix: string) => marks.filter((m) => m.id.startsWith("t-d0-") && m.id.endsWith(suffix));
const times = day0("-time").map((m) => m.text);
const nexts = day0("-next");
check(times[27] === "11:30" && times[28] === "12:00" && times[31] === "1:30", `the times run on past midnight on a 12-hour clock (${times.slice(26).join(", ")})`);
check(nexts.length === 4 && nexts.every((m) => m.text === "+1"), `each of the four times after midnight carries a +1 (${nexts.length})`);
check(nexts.map((m) => m.id).join() === ["t-d0-r28-next", "t-d0-r29-next", "t-d0-r30-next", "t-d0-r31-next"].join(), "and only those");
const label28 = day0("-time").find((m) => m.id === "t-d0-r28-time")!;
check(nexts[0].y < label28.y + label28.height / 2, "the +1 is raised, above the middle of the time");
const twentyFour = render(config({ timeFormat: "24" })).filter((m) => m.id.startsWith("t-d0-") && m.id.endsWith("-time")).map((m) => m.text);
check(twentyFour[28] === "00:00" && twentyFour[31] === "01:30", `on a 24-hour clock, 00:00 to 01:30 (${twentyFour.slice(28).join(", ")})`);
check(render(config({ startTime: "05:30", endTime: "23:30" })).every((m) => !m.id.endsWith("-next")), "a day that ends by midnight has no +1");

// ---------------------------------------------------------------- events in them
const ev = (startTime: string, endTime: string, id: string): HourlyGridEvent => ({ day: 0, startTime, endTime, label: id, source: "manual", id });
const withEvents = render(config({ events: [ev("23:00", "25:00", "late"), ev("25:00", "26:00", "after"), ev("03:00", "04:00", "early"), ev("08:00", "11:00", "edge")] }));
const box = (id: string) => withEvents.find((m) => m.id === `t-d0-ev${id}-box`);
check(!!box("late") && !!box("after"), "an event over midnight, and one after it, are drawn");
check(!box("early"), "an event wholly before the hours is not drawn (it was, over the day tab)");
const edge = box("edge")!;
check(edge.y >= geo.gridTop - 0.01, "one starting before the hours is cut at the first row");
const after = box("after")!;
check(Math.abs(after.y + after.height - (geo.gridTop + 32 * geo.rowHeight)) < geo.rowHeight * 0.3, "the one after midnight ends at the last row, 2:00");
const plusRight = Math.max(...nexts.map((m) => m.x + m.width));
check(after.x >= plusRight, `events keep clear of the +1 (${after.x.toFixed(1)} vs ${plusRight.toFixed(1)})`);
const dayOnly = render(config({ startTime: "05:30", endTime: "23:30", events: [ev("08:00", "09:00", "a")] })).find((m) => m.id === "t-d0-eva-box")!;
check(dayOnly.x < after.x, "and only on hours that run past midnight do they move");
check(!render(config({ startTime: "05:30", endTime: "23:30", events: [ev("02:00", "03:00", "x")] })).some((m) => m.id === "t-d0-evx-box"), "a 2am event in a 5:30 day draws nothing");

// ---------------------------------------------------------------- placing stored events
const at = (iso: string) => new Date(`${iso}Z`);
const stored = (id: string, startsAt: string, endsAt: string): StoredEvent => ({ id, title: id, startsAt: at(startsAt), endsAt: at(endsAt), allDay: false, rrule: null, timeZone: "UTC" });
const WEEK = [{ date: at("2027-01-04T00:00:00") }, { date: at("2027-01-05T00:00:00") }, { date: at("2027-01-06T00:00:00") }];
const events = [stored("shift", "2027-01-04T22:00:00", "2027-01-05T01:00:00"), stored("morning", "2027-01-05T01:00:00", "2027-01-05T01:30:00"), stored("lunch", "2027-01-05T12:00:00", "2027-01-05T13:00:00")];
const placed = eventsForDays(events, WEEK, "UTC", 120);
const shift = placed.find((e) => e.id === "shift")!;
check(shift.day === 0 && shift.startTime === "22:00" && shift.endTime === "25:00", `an event over midnight keeps its real end (${shift.startTime} to ${shift.endTime}; it read 01:00)`);
const mornings = placed.filter((e) => e.id === "morning");
check(mornings.some((e) => e.day === 0 && e.startTime === "25:00" && e.endTime === "25:30"), `1:00 on Tuesday is drawn in Monday's hours past midnight (${JSON.stringify(mornings)})`);
check(placed.filter((e) => e.id === "lunch").length === 1, "a Tuesday lunch stays on Tuesday only");
check(eventsForDays(events, WEEK, "UTC", 0).filter((e) => e.id === "morning").every((e) => e.day === 1), "with no hours past midnight, nothing moves");
const tuesdayColumn = render(config({ events: mornings.map((e) => ({ ...e, source: "manual" as const })) }));
check(tuesdayColumn.some((m) => m.id === "t-d0-evmorning-box") && !tuesdayColumn.some((m) => m.id === "t-d1-evmorning-box"), "and drawn once: in Monday's last rows, not before Tuesday's first");

// ---------------------------------------------------------------- the editor's side
const lastRow = slotAt(geo, { x: geo.columnX[0] + 60, y: geo.gridTop + 31.5 * geo.rowHeight })!;
check(lastRow.startMinutes === 1530, `the last row is 1:30 the next morning (${lastRow.startMinutes})`);
const COLUMNS = ["2027-01-04", "2027-01-05", "2027-01-06"];
const early = columnForEvent(COLUMNS, geo, "2027-01-05", "01:00", "02:00");
check(early?.day === 0 && early.startTime === "25:00" && early.endTime === "26:00", `a saved 1:00 Tuesday draws in Monday's column (${JSON.stringify(early)})`);
const evening = columnForEvent(COLUMNS, geo, "2027-01-04", "23:00", "01:00");
check(evening?.day === 0 && evening.endTime === "25:00", `23:00 to 1:00 stays on Monday, ending 25:00 (${JSON.stringify(evening)})`);
const noon = columnForEvent(COLUMNS, geo, "2027-01-05", "12:00", "13:00");
check(noon?.day === 1 && noon.startTime === "12:00", "noon Tuesday is Tuesday's");

if (failures > 0) {
  console.error(`\n${failures} hours-past-midnight check(s) failed.`);
  process.exit(1);
}
console.log("All hours-past-midnight checks passed (the span, the rows and their +1, events clipped to the hours and kept clear of the +1, the next morning in the evening's column, and the editor dating it).");
