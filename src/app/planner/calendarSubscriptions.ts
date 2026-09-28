// Subscribing to an .ics feed, and syncing it.
//
// SERVER-ONLY. The reading is in src/lib/ics.ts (pure) and the fetching in
// src/lib/icsFetch.ts (which carries the SSRF argument); this is the part
// that writes rows.
//
// THE SYNC IS AN UPSERT BY UID, not a wipe and re-insert. A feed is re-read
// whenever the editor opens it, and re-inserting would give every event a new
// id on every read - which breaks the editor's hit areas (they are keyed by
// the row's id), breaks any local edit, and churns the table. So:
//
//   in the feed, not here      -> create
//   in both                    -> update in place, same id
//   here, not in the feed      -> TOMBSTONE, not delete
//
// The last one is why a cancelled meeting disappears from the page instead of
// sitting there for ever, and why it can come back if the feed changes its
// mind: the row is still there.
//
// A SUBSCRIBED CALENDAR IS NOT EDITABLE HERE. Its events are the feed's, and
// the next sync would overwrite anything typed over them - which reads as an
// edit that silently undid itself. The editor refuses before that can happen;
// see `assertNotSubscribed`.

import { prisma } from "@/lib/prisma";
import { parseIcs } from "@/lib/ics";
import { fetchIcs, IcsFetchError } from "@/lib/icsFetch";
import { isGuestOwner } from "@/lib/guest";
import { CALENDAR_COLOURS } from "./calendarStore";

/** What `source` says for a feed this app reads itself, as opposed to one
 *  pulled through a provider's API later. */
export const ICS_SOURCE = "ics";

/** A guest's work lives in one browser and is deleted after 30 days, so a
 *  guest subscribing is offering to fetch someone's URL on a schedule for
 *  nothing. One is enough to try the feature with. */
export const GUEST_SUBSCRIPTION_LIMIT = 1;
export const SUBSCRIPTION_LIMIT = 10;

/** Don't re-fetch a feed on every page load. Providers publish a refresh
 *  interval of an hour or more; this is well inside that and still means an
 *  event added on a phone is on the page within the minute if the person
 *  asks for it. */
export const SYNC_INTERVAL_MS = 15 * 60 * 1000;

export type SyncResult = {
  calendarId: string;
  name: string;
  added: number;
  updated: number;
  removed: number;
  /** Events the reader would have had to guess at - see ParsedCalendar. */
  skipped: number;
};

/** The next colour that is not already in use, so two calendars do not arrive
 *  the same shade and become impossible to tell apart on the page. */
async function nextColour(ownerId: string): Promise<string> {
  const used = new Set(
    (await prisma.calendar.findMany({ where: { ownerId }, select: { colour: true } })).map((c) => c.colour.toLowerCase())
  );
  return CALENDAR_COLOURS.find((c) => !used.has(c.toLowerCase())) ?? CALENDAR_COLOURS[0];
}

/**
 * Subscribe to a feed, and read it once.
 *
 * The URL is stored in `externalId`. It is a CREDENTIAL - a secret calendar
 * address is the whole of the authentication - so it is never sent back to
 * the browser and never put in an error message; see `calendarsFor`, which
 * does not select it.
 */
export async function subscribeToIcs(ownerId: string, rawUrl: string, chosenName?: string): Promise<SyncResult> {
  const limit = isGuestOwner(ownerId) ? GUEST_SUBSCRIPTION_LIMIT : SUBSCRIPTION_LIMIT;
  const already = await prisma.calendar.count({ where: { ownerId, source: ICS_SOURCE } });
  if (already >= limit) {
    throw new IcsFetchError(
      isGuestOwner(ownerId)
        ? "A guest can subscribe to one calendar. Sign in to add more - your journals come with you."
        : `That is ${limit} calendars, which is as many as this holds.`
    );
  }

  const feed = await fetchIcs(rawUrl);
  const parsed = parseIcs(feed.text);

  // THE SAME FEED TWICE IS THE SAME CALENDAR. Subscribing again with a URL
  // already here updates it rather than making a second copy that then draws
  // every event twice.
  const existing = await prisma.calendar.findFirst({
    where: { ownerId, source: ICS_SOURCE, externalId: feed.url },
    select: { id: true },
  });

  const name = (chosenName ?? "").trim() || parsed.name || "Subscribed calendar";
  const calendar = existing
    ? await prisma.calendar.update({ where: { id: existing.id }, data: { name }, select: { id: true, name: true } })
    : await prisma.calendar.create({
        data: { ownerId, name, colour: await nextColour(ownerId), source: ICS_SOURCE, externalId: feed.url },
        select: { id: true, name: true },
      });

  return applyFeed(ownerId, calendar.id, calendar.name, parsed);
}

/**
 * Read a subscribed calendar again.
 *
 * @param force skip the interval - what the "Refresh" button passes. Without
 *   it, a sync that ran a minute ago is left alone, so opening the editor
 *   does not fetch somebody's server on every page load.
 */
export async function syncSubscription(ownerId: string, calendarId: string, force = false): Promise<SyncResult | null> {
  const calendar = await prisma.calendar.findFirst({
    where: { id: calendarId, ownerId, source: ICS_SOURCE },
    select: { id: true, name: true, externalId: true, syncToken: true },
  });
  if (!calendar?.externalId) return null;

  if (!force) {
    const last = Number(calendar.syncToken ?? 0);
    if (Number.isFinite(last) && Date.now() - last < SYNC_INTERVAL_MS) return null;
  }

  const feed = await fetchIcs(calendar.externalId);
  return applyFeed(ownerId, calendar.id, calendar.name, parseIcs(feed.text));
}

/** Every subscription of this owner's that is due. Failures are swallowed: a
 *  feed that is down must not stop a journal from opening. */
export async function syncDueSubscriptions(ownerId: string): Promise<void> {
  const due = await prisma.calendar.findMany({
    where: { ownerId, source: ICS_SOURCE },
    select: { id: true, syncToken: true },
  });
  for (const calendar of due) {
    const last = Number(calendar.syncToken ?? 0);
    if (Number.isFinite(last) && Date.now() - last < SYNC_INTERVAL_MS) continue;
    try {
      await syncSubscription(ownerId, calendar.id);
    } catch {
      // Left for the next load. The page is what matters, not the feed.
    }
  }
}

/** The upsert. Exported for the check, which drives it without a network. */
export async function applyFeed(
  ownerId: string,
  calendarId: string,
  name: string,
  parsed: ReturnType<typeof parseIcs>
): Promise<SyncResult> {
  const here = await prisma.calendarEvent.findMany({
    where: { calendarId },
    select: { id: true, externalId: true, deletedAt: true },
  });
  const byUid = new Map(here.filter((e) => e.externalId).map((e) => [e.externalId as string, e]));

  let added = 0;
  let updated = 0;
  const seen = new Set<string>();

  for (const event of parsed.events) {
    seen.add(event.uid);
    const row = byUid.get(event.uid);
    const data = {
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      rrule: event.rrule,
      timeZone: event.timeZone,
      lastSyncedAt: new Date(),
      // A CANCELLED event in the feed is a tombstone here, and an event that
      // comes back un-cancelled is untombstoned. Both directions, so a
      // meeting reinstated on a phone reappears on the page.
      deletedAt: event.cancelled ? new Date() : null,
    };
    if (row) {
      await prisma.calendarEvent.update({ where: { id: row.id }, data });
      updated++;
    } else {
      await prisma.calendarEvent.create({
        data: { ...data, ownerId, calendarId, externalId: event.uid, origin: "IMPORTED" },
      });
      added++;
    }
  }

  // GONE FROM THE FEED. Tombstoned, not deleted - see the note at the top.
  const vanished = here.filter((e) => e.externalId && !seen.has(e.externalId) && !e.deletedAt);
  if (vanished.length > 0) {
    await prisma.calendarEvent.updateMany({
      where: { id: { in: vanished.map((e) => e.id) } },
      data: { deletedAt: new Date() },
    });
  }

  await prisma.calendar.update({
    where: { id: calendarId },
    data: { syncToken: String(Date.now()) },
  });

  return { calendarId, name, added, updated, removed: vanished.length, skipped: parsed.skipped.length };
}

/**
 * Refuse to edit an event that belongs to a feed.
 *
 * The next sync overwrites it from the feed, so an edit here is an edit that
 * silently undoes itself - the worst kind, because it looks like it worked.
 * Better to say so.
 */
export async function assertNotSubscribed(eventId: string): Promise<void> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: { calendar: { select: { source: true } } },
  });
  if (event?.calendar?.source) {
    throw new Error("That event comes from a subscribed calendar. Change it where it lives, and it will follow.");
  }
}

/** Unsubscribe: the calendar and its events go, because they are the feed's
 *  and nothing here wrote them. A calendar made HERE is not removed this way
 *  - see deleteCalendarFor. */
export async function unsubscribeFrom(ownerId: string, calendarId: string): Promise<void> {
  await prisma.calendar.deleteMany({ where: { id: calendarId, ownerId, source: ICS_SOURCE } });
}
