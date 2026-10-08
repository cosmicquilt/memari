// A person's defaults for new journals, chosen on the account page
// (2026-10-08): which day a week starts on, the page size, the font. Stored
// in OwnerSettings.preferences (JSON) and read only through here, so
// anything stored that this does not recognise is dropped rather than
// trusted. The time zone has its own column (ownerSettings.ts): the PDF is
// drawn from it.

import type { FontChoice } from "./theme";
import type { PlannerTrimKey } from "./planner-trims";

export type Preferences = {
  weekStartDay: 0 | 1;
  trim: PlannerTrimKey;
  font: FontChoice;
};

/** What everyone had before there were preferences: the start dialog's own
 *  defaults. */
export const DEFAULT_PREFERENCES: Preferences = { weekStartDay: 0, trim: "bound7x10", font: "serif" };

/** Stored JSON, or a form's values, to preferences - unknown or malformed
 *  fields fall back to the defaults. */
export function parsePreferences(value: unknown): Preferences {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    weekStartDay: v.weekStartDay === 1 || v.weekStartDay === "1" ? 1 : 0,
    trim: v.trim === "letter" ? "letter" : "bound7x10",
    font: v.font === "sans" ? "sans" : "serif",
  };
}
