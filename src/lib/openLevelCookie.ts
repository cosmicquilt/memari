// Which of the book's layouts the editor last had open - the level, and the
// occurrence's own layout if one was open - so a refresh of memari.studio/app
// comes back to it.
//
// NOT IN THE URL, by request: "I dont want site to change while swapping
// between their monthly weekly layout ... within same journal". The editor
// lives at one address and swaps layouts in place (see EditorShell), so the
// open layout has to be remembered somewhere other than the address.
//
// Written by the BROWSER, not by a server action: setting a cookie from a
// server action makes Next refresh the whole route, which is exactly the
// page change this exists to avoid. The same arrangement as viewportCookie.

import { LEVELS_IN_BINDING_ORDER, type PageLevel } from "@/lib/pageLevels";

export const OPEN_LEVEL_COOKIE = "memari-open";

export type OpenLevel = { level: PageLevel; variantKey: string | null };

/** An occurrence key: a month (2026-02), a week (W2026-01-05) or a day
 *  (2026-01-05) - see pageLevels' occurrences(). */
const VARIANT_KEY = /^W?\d{4}-\d{2}(-\d{2})?$/;

/** `WEEKLY`, or `MONTHLY~2026-02`. Anything else - a missing cookie, a level
 *  that no longer exists, a hand-edited value - is null, and the editor opens
 *  its default. */
export function parseOpenLevelCookie(value: string | undefined): OpenLevel | null {
  if (!value) return null;
  const [level, variantKey = null, extra] = value.split("~");
  if (extra !== undefined) return null;
  if (!(LEVELS_IN_BINDING_ORDER as readonly string[]).includes(level)) return null;
  if (variantKey !== null && !VARIANT_KEY.test(variantKey)) return null;
  return { level: level as PageLevel, variantKey };
}

export function writeOpenLevelCookie({ level, variantKey }: OpenLevel) {
  const value = variantKey ? `${level}~${variantKey}` : level;
  document.cookie = `${OPEN_LEVEL_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
}
