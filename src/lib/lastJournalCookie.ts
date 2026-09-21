// The journal this browser last had open, so the start dialog at /app can
// preselect it - opening it again is then Enter, or one click. See
// openLevelCookie.ts for why the page writes it rather than an action.

export const LAST_JOURNAL_COOKIE = "memari-journal";

/** Cuid-shaped: letters and digits. Anything else is ignored rather than
 *  trusted, since a cookie is whatever the browser says it is. */
const JOURNAL_ID = /^[a-z0-9]{1,64}$/i;

export function parseLastJournalCookie(value: string | undefined): string | null {
  return value && JOURNAL_ID.test(value) ? value : null;
}

export function writeLastJournalCookie(journalId: string) {
  if (!JOURNAL_ID.test(journalId)) return;
  document.cookie = `${LAST_JOURNAL_COOKIE}=${journalId}; path=/; max-age=31536000; samesite=lax`;
}
