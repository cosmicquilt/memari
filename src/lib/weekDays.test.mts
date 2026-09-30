// Standalone regression test for weekDays.ts's rotateWeekDays — same
// no-framework convention as grid.test.mts. Run with:
// npx tsx src/lib/weekDays.test.mts

import { rotateWeekDays, rotateWeekList, weekdayInitials, weekdayOfColumn, type DayLabel } from "./weekDays";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error("FAIL:", msg);
  }
}

const left: DayLabel[] = [
  { name: "SUNDAY", date: 1 },
  { name: "MONDAY", date: 2 },
  { name: "TUESDAY", date: 3 },
];
const right: DayLabel[] = [
  { name: "WEDNESDAY", date: 4 },
  { name: "THURSDAY", date: 5 },
  { name: "FRIDAY", date: 6 },
  { name: "SATURDAY", date: 7 },
];

// weekStartDay 0 (Sunday) is the stored order already — untouched.
{
  const result = rotateWeekDays(left, right, 0);
  assert(result.left === left && result.right === right, "weekStartDay 0 returns the input arrays untouched");
}

// weekStartDay 1 (Monday): Mon Tue Wed | Thu Fri Sat Sun.
{
  const result = rotateWeekDays(left, right, 1);
  assert(
    result.left.map((d) => d.name).join(",") === "MONDAY,TUESDAY,WEDNESDAY",
    `weekStartDay 1 left = ${JSON.stringify(result.left.map((d) => d.name))}`
  );
  assert(
    result.right.map((d) => d.name).join(",") === "THURSDAY,FRIDAY,SATURDAY,SUNDAY",
    `weekStartDay 1 right = ${JSON.stringify(result.right.map((d) => d.name))}`
  );
  // Dates travel with their own day name, not left behind.
  assert(result.left[0].date === 2 && result.right[3].date === 1, "dates stay paired with their own day name after rotating");
}

// weekStartDay 6 (Saturday): Sat | Sun Mon Tue Wed Thu Fri.
{
  const result = rotateWeekDays(left, right, 6);
  assert(result.left.map((d) => d.name).join(",") === "SATURDAY,SUNDAY,MONDAY", "weekStartDay 6 left starts at Saturday");
  assert(
    result.right.map((d) => d.name).join(",") === "TUESDAY,WEDNESDAY,THURSDAY,FRIDAY",
    "weekStartDay 6 right continues Tue..Fri"
  );
}

// Malformed shape (not exactly 3+4) — returned untouched rather than
// guessing at a rotation on data this hasn't been measured against.
{
  const shortLeft = [left[0], left[1]];
  const result = rotateWeekDays(shortLeft, right, 1);
  assert(result.left === shortLeft && result.right === right, "a non-3/4 shape is returned untouched, not rotated");
}


// --- every module that prints weekdays -----------------------------------
// The journal's week start reached only the hours (2026-09-30). These are the
// pieces the other modules turn with.
{
  assert(weekdayInitials(0).join("") === "SMTWTFS", "Sunday start: S M T W T F S");
  assert(weekdayInitials(1).join("") === "MTWTFSS", "Monday start: M T W T F S S");
  assert(weekdayOfColumn(0, 1) === 1 && weekdayOfColumn(6, 1) === 0, "a Monday week's first column is Monday and its last Sunday");

  const monFirst = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  assert(rotateWeekList(monFirst, 0).join(",") === "Sun,Mon,Tue,Wed,Thu,Fri,Sat", "a typed Monday-first week turns to a Sunday journal");
  assert(rotateWeekList(monFirst, 1) === monFirst, "a week already starting on the journal's day is returned as it is");
  const long = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  assert(rotateWeekList(long, 1)[0] === "Monday" && rotateWeekList(long, 1)[6] === "Sunday", "full day names turn too");
  const initials = ["S", "M", "T", "W", "T", "F", "S"];
  assert(rotateWeekList(initials, 1) === initials, "initials are left alone - S and T do not say which day they are");
  const prose = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha", "Tahajjud", "Duha"];
  assert(rotateWeekList(prose, 1) === prose, "seven words that are not a week are never reordered");
  const scrambled = ["Mon", "Wed", "Tue", "Thu", "Fri", "Sat", "Sun"];
  assert(rotateWeekList(scrambled, 0) === scrambled, "day names out of order are not treated as a week");
  assert(rotateWeekList(["Mon", "Tue"], 0).length === 2, "a list that is not seven long is untouched");
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("All weekDays.ts checks passed.");
}
