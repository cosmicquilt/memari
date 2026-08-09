// Pure calendar-grid math for the monthly layout's month-grid-core
// module — computes which day-of-month number belongs in each cell of a
// Sunday-start, 7-column calendar grid, and how many week-rows (5 or 6)
// the given month needs. No DOM/Polotno dependency, matching grid.ts's
// own pattern (this file drives monthGridCore.ts's config the same way
// grid.ts drives placement).
//
// Verified against the reference PDF (hourlyjournal.pdf, a real 2024
// planner) rather than assumed: January 2024 needs 5 rows (matches the
// reference's pages 2/3 exactly, including the specific leading/trailing
// day numbers), March and June 2024 each need 6 (reference pages 22,
// 54, confirmed via measuring distinct date-row y-positions) — both are
// exercised as anchor cases in monthCalendar.test.mts, not just asserted
// to be "usually 5."
//
// A third case, initially missed and caught by this file's own test
// suite rather than assumed away: a 28-day February whose 1st falls
// exactly on a Sunday needs only 4 rows (zero leading/trailing days —
// the grid is exactly 4 complete weeks). Exhaustively checked every
// month from 1900-2100: weekCount is always 4, 5, or 6, never anything
// else (4 occurs 22 times in that 201-year range, always in February).
// The reference PDF's own 2024 edition never happens to hit this case
// (Feb 2024 starts on a Thursday), which is exactly why it's worth
// calling out explicitly here instead of only in a comment on the
// reference's own layout — a future year's edition of this planner will
// eventually need it.

export type MonthCalendarCell = {
  date: number; // day-of-month number to display, 1-31
  inCurrentMonth: boolean;
};

export type MonthCalendar = {
  weekCount: 4 | 5 | 6;
  // weekCount rows x 7 columns, Sunday first (column 0 = Sunday ... 6 = Saturday).
  weeks: MonthCalendarCell[][];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// All arithmetic in UTC, not local time — day-counting shouldn't be at
// the mercy of daylight-saving-time transitions shifting a timestamp by
// an hour and landing it on the wrong side of a day boundary.
function utcDate(year: number, monthIndex0: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex0, day));
}

export function computeMonthCalendar(year: number, month: number): MonthCalendar {
  const monthIndex0 = month - 1; // JS Date months are 0-indexed; this file's own API stays 1-indexed to match dayLabels-style config elsewhere.
  const firstOfMonth = utcDate(year, monthIndex0, 1);
  // Day 0 of the *next* month is the last day of *this* one — the
  // standard JS Date trick, works even across a December->January
  // rollover since Date normalizes monthIndex0+1 === 12 to next year.
  const daysInMonth = utcDate(year, monthIndex0 + 1, 0).getUTCDate();
  const lastOfMonth = utcDate(year, monthIndex0, daysInMonth);

  // Grid runs from the Sunday on/before the 1st through the Saturday
  // on/after the last day of the month.
  const gridStart = new Date(firstOfMonth.getTime() - firstOfMonth.getUTCDay() * MS_PER_DAY);
  const gridEnd = new Date(lastOfMonth.getTime() + (6 - lastOfMonth.getUTCDay()) * MS_PER_DAY);

  const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / MS_PER_DAY) + 1;
  const weekCount = totalDays / 7;
  if (weekCount !== 4 && weekCount !== 5 && weekCount !== 6) {
    // Exhaustively verified (1900-2100) that a real Gregorian month on
    // a Sunday-aligned grid only ever needs 4, 5, or 6 rows — anything
    // else means an arithmetic bug above, not a legitimate calendar
    // shape. Guards against silently handing the renderer a malformed
    // grid rather than failing loudly.
    throw new Error(`Unexpected month-grid week count ${weekCount} for ${year}-${month}`);
  }

  const weeks: MonthCalendarCell[][] = [];
  for (let w = 0; w < weekCount; w++) {
    const row: MonthCalendarCell[] = [];
    for (let c = 0; c < 7; c++) {
      const cellDate = new Date(gridStart.getTime() + (w * 7 + c) * MS_PER_DAY);
      row.push({
        date: cellDate.getUTCDate(),
        inCurrentMonth: cellDate.getUTCMonth() === monthIndex0 && cellDate.getUTCFullYear() === year,
      });
    }
    weeks.push(row);
  }

  return { weekCount: weekCount as 4 | 5 | 6, weeks };
}
