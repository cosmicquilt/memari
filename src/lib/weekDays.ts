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
