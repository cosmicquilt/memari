// What Calendar.syncToken holds for a subscription, and how to read it.
//
// Its own module because two sides need it - the sync that writes it
// (calendarSubscriptions.ts) and the store that reports a failure from it to
// the Calendars panel (calendarStore.ts) - and the two import each other's
// other exports, so putting it in either made an import cycle.
//
// A string column, so this is JSON rather than new columns - a migration for
// a cache key is not worth Andrew having to run one. Old rows hold a bare
// timestamp; readToken accepts both.

export type SyncToken = {
  /** When it was last TRIED - success or not. See recordFailure. */
  at: number;
  hash?: string;
  /** Why the last read failed, in words a person can act on. Absent once a
   *  read succeeds. Never holds the feed's address - see IcsFetchError. */
  failed?: string;
};

export function readToken(raw: string | null): SyncToken {
  if (!raw) return { at: 0 };
  try {
    const parsed = JSON.parse(raw) as SyncToken;
    if (typeof parsed?.at === "number") return parsed;
  } catch {
    // The first format: a bare epoch. Left readable rather than migrated.
  }
  const at = Number(raw);
  return { at: Number.isFinite(at) ? at : 0 };
}
