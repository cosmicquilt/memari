// Rotates the display order of a week's day labels for Page Settings'
// "day of the week to start" dropdown. Pure, read-time-only transform —
// the underlying stored data (each hourly-grid-core instance's own
// dayLabels propValues) always stays in the app's one fixed canonical
// order (Sun/Mon/Tue on the left page, Wed/Thu/Fri/Sat on the right —
// see actions.ts's getOrCreatePlanner seed and WeekSettingsPanel.tsx's
// identical LEFT_LABELS/RIGHT_LABELS convention), so nothing else that
// reads or writes that data (WeekSettingsPanel, updateWeekSettings) needs
// to change or migrate — this is applied once, in loadPlannerPages.ts,
// on top of whatever's already stored.
//
// Known limitation, not addressed here: HourlyGridCoreConfig.events[].day
// is indexed by day-*position*-within-the-page (0..dayCount-1), separate
// from dayLabels, and isn't remapped by this rotation. Low-risk today —
// events is unconditionally seeded empty and nothing in the codebase
// writes into it yet (no calendar sync) — but worth revisiting once that
// ships, so a rotated week doesn't silently show an event under the
// wrong day header.

export type DayLabel = { name: string; date: number };

export function rotateWeekDays(
  leftDayLabels: DayLabel[],
  rightDayLabels: DayLabel[],
  weekStartDay: number
): { left: DayLabel[]; right: DayLabel[] } {
  // weekStartDay 0 (Sunday) is the stored order already — nothing to do.
  // Also bail out untouched for a page shape this hasn't been measured
  // against (not exactly 3+4) rather than guess at a rotation that could
  // scramble data it doesn't actually understand.
  if (weekStartDay === 0 || leftDayLabels.length !== 3 || rightDayLabels.length !== 4) {
    return { left: leftDayLabels, right: rightDayLabels };
  }

  const canonical = [...leftDayLabels, ...rightDayLabels]; // 7, Sun..Sat
  const start = ((weekStartDay % 7) + 7) % 7;
  const rotated = [...canonical.slice(start), ...canonical.slice(0, start)];
  return { left: rotated.slice(0, 3), right: rotated.slice(3) };
}

// ---------------------------------------------------------------------
// THE JOURNAL'S WEEK START, FOR EVERY MODULE THAT PRINTS WEEKDAYS.
//
// The rotation above only ever reached the hours. The mini month and the
// habit tracker printed S M T W T F S from fixed lists, the month calendar
// was seeded Sunday first and never turned, and three presets typed their
// own day names Monday first - so a Monday journal had Monday-first hours
// beside Sunday-first trackers, and a Sunday journal had the reverse.
// Found building the module-edits list, 2026-09-30.

const INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const normalStart = (weekStartDay: number | null | undefined) =>
  ((Math.round(Number(weekStartDay) || 0) % 7) + 7) % 7;

/** Which weekday (0 = Sunday) column `c` of a week is. */
export function weekdayOfColumn(c: number, weekStartDay: number | null | undefined): number {
  return (c + normalStart(weekStartDay)) % 7;
}

/** The seven initials, starting on the week's first day. */
export function weekdayInitials(weekStartDay: number | null | undefined): string[] {
  return Array.from({ length: 7 }, (_, c) => INITIALS[weekdayOfColumn(c, weekStartDay)]);
}

/**
 * A list that IS a week, turned to start on the journal's week start.
 *
 * Recognised only when it is exactly the seven day names in order from any
 * day - "Mon".."Sun", "Monday".."Sunday" - so free text is never reordered.
 * Initials are left alone: S and T do not say which day they are. Returns
 * the list itself when it is not a week or already starts right.
 */
export function rotateWeekList<T>(list: T, weekStartDay: number | null | undefined): T {
  if (!Array.isArray(list) || list.length !== 7) return list;
  const indices = list.map((entry) => {
    const word = typeof entry === "string" ? entry.trim().toLowerCase() : "";
    return word.length >= 3 ? DAY_NAMES.findIndex((name) => name.startsWith(word)) : -1;
  });
  if (indices.some((index, i) => index < 0 || index !== (indices[0] + i) % 7)) return list;
  const shift = (normalStart(weekStartDay) - indices[0] + 7) % 7;
  if (shift === 0) return list;
  return [...list.slice(shift), ...list.slice(0, shift)] as T;
}
