// Standalone regression tests for monthCalendar.ts, parallel to
// grid.test.mts (no test framework, plain assertions, non-zero exit on
// failure). Run with: npx tsx src/lib/monthCalendar.test.mts
//
// The anchor cases below are real dates from the reference PDF
// (hourlyjournal.pdf, a real 2024 planner), not synthetic examples —
// January 2024's exact leading/trailing day numbers and March/June
// 2024's 6-row grids were confirmed directly against the reference
// (visual inspection of pages 2/3, and PyMuPDF row-position measurement
// across all 12 monthly pages) before being encoded here.

import { computeMonthCalendar } from "./monthCalendar";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error("FAIL:", msg);
  }
}

// --- January 2024: reference's own 5-row month, exact date sequence ---
// Reference pages 2/3: row1 = Sun 31(Dec) Mon 1 Tue 2 Wed 3 Thu 4 Fri 5
// Sat 6; row5 = Sun 28 Mon 29 Tue 30 Wed 31 Thu 1(Feb) Fri 2 Sat 3.
{
  const jan2024 = computeMonthCalendar(2024, 1);
  assert(jan2024.weekCount === 5, "January 2024 needs exactly 5 rows, matching the reference exactly");
  assert(jan2024.weeks.length === 5, "weeks array length matches weekCount");

  const row1 = jan2024.weeks[0].map((c) => c.date);
  assert(
    row1.join(",") === "31,1,2,3,4,5,6",
    `January 2024 row 1 dates should be 31,1,2,3,4,5,6 (Dec 31 leading in), got ${row1.join(",")}`
  );
  assert(!jan2024.weeks[0][0].inCurrentMonth, "Jan 2024 row 1's Sunday (Dec 31) is flagged out-of-month");
  assert(jan2024.weeks[0][1].inCurrentMonth, "Jan 2024 row 1's Monday (Jan 1) is flagged in-month");

  const row5 = jan2024.weeks[4].map((c) => c.date);
  assert(
    row5.join(",") === "28,29,30,31,1,2,3",
    `January 2024 row 5 dates should be 28,29,30,31,1,2,3 (Feb trailing out), got ${row5.join(",")}`
  );
  assert(jan2024.weeks[4][3].inCurrentMonth, "Jan 2024 row 5's Wednesday (Jan 31) is flagged in-month");
  assert(!jan2024.weeks[4][4].inCurrentMonth, "Jan 2024 row 5's Thursday (Feb 1) is flagged out-of-month");
}

// --- March 2024 and June 2024: the reference's two confirmed 6-row months ---
{
  const mar2024 = computeMonthCalendar(2024, 3);
  assert(mar2024.weekCount === 6, "March 2024 needs 6 rows, matching the reference (page 22)");
  assert(mar2024.weeks[0][0].date === 25 && !mar2024.weeks[0][0].inCurrentMonth, "March 2024 grid starts on Sun Feb 25");
  assert(mar2024.weeks[5][6].date === 6 && !mar2024.weeks[5][6].inCurrentMonth, "March 2024 grid ends on Sat Apr 6");

  const jun2024 = computeMonthCalendar(2024, 6);
  assert(jun2024.weekCount === 6, "June 2024 needs 6 rows, matching the reference (page 54)");
  assert(jun2024.weeks[0][0].date === 26 && !jun2024.weeks[0][0].inCurrentMonth, "June 2024 grid starts on Sun May 26");
  assert(jun2024.weeks[5][6].date === 6 && !jun2024.weeks[5][6].inCurrentMonth, "June 2024 grid ends on Sat Jul 6");
}

// --- The 4-row edge case: a 28-day February starting exactly on Sunday ---
// Not in the reference PDF (its 2024 edition's February starts on a
// Thursday), but real and confirmed via an exhaustive 1900-2100 sweep —
// this was initially missed and caught by this file's own general sweep
// below, so it's promoted to its own explicit anchor rather than left
// implicit.
{
  const feb2026 = computeMonthCalendar(2026, 2);
  assert(feb2026.weekCount === 4, "February 2026 (28 days, starts on Sunday) needs exactly 4 rows, no leading/trailing days");
  assert(feb2026.weeks[0][0].date === 1 && feb2026.weeks[0][0].inCurrentMonth, "Feb 2026 grid starts exactly on Feb 1 (Sunday), no January bleed");
  assert(feb2026.weeks[3][6].date === 28 && feb2026.weeks[3][6].inCurrentMonth, "Feb 2026 grid ends exactly on Feb 28 (Saturday), no March bleed");
  assert(
    feb2026.weeks.flat().every((c) => c.inCurrentMonth),
    "every cell in a perfect 4-row month is in-month — zero leading/trailing days"
  );
}

// --- Structural invariants across every month of several different years ---
{
  for (const year of [2023, 2024, 2025, 2026, 2028]) {
    // 2028 included as a leap year with a different weekday pattern
    // than 2024 (also a leap year, but they don't share a start-of-year
    // weekday) — guards against a bug that only 2024 happens to hide.
    for (let month = 1; month <= 12; month++) {
      const cal = computeMonthCalendar(year, month);
      assert(
        cal.weekCount === 4 || cal.weekCount === 5 || cal.weekCount === 6,
        `${year}-${month}: weekCount is 4, 5, or 6 (got ${cal.weekCount})`
      );
      assert(cal.weeks.length === cal.weekCount, `${year}-${month}: weeks array length matches weekCount`);
      for (const row of cal.weeks) {
        assert(row.length === 7, `${year}-${month}: every row has exactly 7 columns`);
      }
      // Every day 1..daysInMonth must appear exactly once, flagged in-month.
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const inMonthDates = cal.weeks.flat().filter((c) => c.inCurrentMonth).map((c) => c.date);
      assert(
        inMonthDates.length === daysInMonth,
        `${year}-${month}: exactly ${daysInMonth} in-month cells (got ${inMonthDates.length})`
      );
      assert(
        new Set(inMonthDates).size === inMonthDates.length,
        `${year}-${month}: no duplicate in-month day numbers`
      );
      assert(Math.min(...inMonthDates) === 1, `${year}-${month}: day 1 is present and in-month`);
      assert(Math.max(...inMonthDates) === daysInMonth, `${year}-${month}: last day of month is present and in-month`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("All monthCalendar.ts checks passed.");
}
