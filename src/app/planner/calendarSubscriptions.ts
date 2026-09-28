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

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { parseIcs } from "@/lib/ics";
import type { Override } from "@/lib/calendarEvents";
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
  /** Rows that REALLY CHANGED. Not "rows seen" - see applyFeed. */
  updated: number;
  /** Rows already identical to the feed, so nothing was written for them.
   *  This is the number that matters for cost: on a calendar nobody has
   *  touched it should be all of them. */
  unchanged: number;
  removed: number;
  /** Events the reader would have had to guess at - see ParsedCalendar. */
  skipped: number;
};

/**
 * WHAT THE SYNC IS ALLOWED TO COST, and why this is not a micro-optimisation.
 *
 * Measured 2026-09-28 against Google's US holiday feed, 317 events: the first
 * version took 8.1 SECONDS, and took the same 8.1 seconds on a re-read where
 * NOTHING HAD CHANGED - 317 sequential round trips to Neon, one per event.
 * This runs inside loadPlannerPages, on the page-load path. A serverless
 * function gets ten seconds; two subscribed calendars would have blown
 * straight through it and the journal page would simply have failed to
 * render, for everyone, with the cause a page or two away from the symptom.
 *
 * Three things fix it, in order of how much they save:
 *   1. THE BODY HASH. A feed that has not changed is not looked at again.
 *   2. ROW COMPARISON. A row identical to the feed is not written.
 *   3. BATCHING. What is left goes in a createMany and one transaction
 *      instead of a round trip each.
 * After all three: an unchanged feed is two queries, and a first read of 317
 * events is one insert.
 */

/** What Calendar.syncToken holds. A string column, so this is JSON rather
 *  than new columns - a migration for a cache key is not worth Andrew having
 *  to run one. Old rows hold a bare timestamp; `readToken` accepts both. */
type SyncToken = { at: number; hash?: string };

function readToken(raw: string | null): SyncToken {
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

const bodyHash = (text: string) => createHash("sha256").update(text).digest("hex");

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

  return applyFeed(ownerId, calendar.id, calendar.name, parsed, bodyHash(feed.text));
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
    const { at } = readToken(calendar.syncToken);
    if (Date.now() - at < SYNC_INTERVAL_MS) return null;
  }

  const feed = await fetchIcs(calendar.externalId);

  // THE BODY IS BYTE-IDENTICAL TO LAST TIME. Nothing can have changed, so
  // nothing is read and nothing is written - just the clock, so the interval
  // starts again. This is the case that matters: a holiday calendar is the
  // same file for a year at a time.
  const hash = bodyHash(feed.text);
  if (readToken(calendar.syncToken).hash === hash) {
    await prisma.calendar.update({
      where: { id: calendar.id },
      data: { syncToken: JSON.stringify({ at: Date.now(), hash }) },
    });
    const unchanged = await prisma.calendarEvent.count({ where: { calendarId: calendar.id, deletedAt: null } });
    return { calendarId: calendar.id, name: calendar.name, added: 0, updated: 0, unchanged, removed: 0, skipped: 0 };
  }

  return applyFeed(ownerId, calendar.id, calendar.name, parseIcs(feed.text), hash);
}

/** Every subscription of this owner's that is due. Failures are swallowed: a
 *  feed that is down must not stop a journal from opening. */
export async function syncDueSubscriptions(ownerId: string): Promise<void> {
  const due = await prisma.calendar.findMany({
    where: { ownerId, source: ICS_SOURCE },
    select: { id: true, syncToken: true },
  });
  for (const calendar of due) {
    if (Date.now() - readToken(calendar.syncToken).at < SYNC_INTERVAL_MS) continue;
    try {
      await syncSubscription(ownerId, calendar.id);
    } catch {
      // Left for the next load. The page is what matters, not the feed.
    }
  }
}

/** A set of changed occurrences as one comparable string - order-free, and
 *  blind to nothing that would change the drawing. */
function signature(list: ReadonlyArray<Override> | null | undefined): string {
  return (list ?? [])
    .map((o) =>
      [
        o.recurrenceId.getTime(),
        o.cancelled ? 1 : 0,
        o.title ?? "",
        o.startsAt?.getTime() ?? "",
        o.endsAt?.getTime() ?? "",
      ].join("|")
    )
    .sort()
    .join(";");
}

/** The upsert. Exported for the check, which drives it without a network. */
export async function applyFeed(
  ownerId: string,
  calendarId: string,
  name: string,
  parsed: ReturnType<typeof parseIcs>,
  /** The feed's body hash, so the next read can skip it entirely. Omitted by
   *  the check, which has no body. */
  hash?: string
): Promise<SyncResult> {
  // EVERY FIELD THE FEED OWNS is read back, not just the ids: a row can only
  // be left alone if it is known to match, and "matches" has to be decided on
  // the values themselves.
  const here = await prisma.calendarEvent.findMany({
    where: { calendarId },
    select: {
      id: true,
      externalId: true,
      title: true,
      startsAt: true,
      endsAt: true,
      allDay: true,
      rrule: true,
      timeZone: true,
      deletedAt: true,
      overrides: { select: { recurrenceId: true, cancelled: true, title: true, startsAt: true, endsAt: true } },
    },
  });
  const byUid = new Map(here.filter((e) => e.externalId).map((e) => [e.externalId as string, e]));

  // THE SERIES' CHANGED OCCURRENCES, which the feed owns outright - a moved
  // or deleted week is whatever the feed currently says it is. Rewritten
  // only when the set actually differs, for the same reason rows are: an
  // unchanged read must write nothing (see SyncResult).
  const overridesToWrite = new Map<string, Override[]>();

  const inserts: Array<{
    ownerId: string;
    calendarId: string;
    externalId: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    allDay: boolean;
    rrule: string | null;
    timeZone: string;
    deletedAt: Date | null;
    lastSyncedAt: Date;
    origin: "IMPORTED";
  }> = [];
  const updates: Array<ReturnType<typeof prisma.calendarEvent.update>> = [];
  let unchanged = 0;
  /** Events whose row was right but whose changed weeks were not. */
  let weeksOnly = 0;
  const seen = new Set<string>();
  const now = new Date();

  for (const event of parsed.events) {
    seen.add(event.uid);
    const row = byUid.get(event.uid);
    const fields = {
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      rrule: event.rrule,
      timeZone: event.timeZone,
      // A CANCELLED event in the feed is a tombstone here, and one that comes
      // back un-cancelled is untombstoned. Both directions, so a meeting
      // reinstated on a phone reappears on the page.
      deletedAt: event.cancelled ? now : null,
    };

    if (!row) {
      inserts.push({ ...fields, ownerId, calendarId, externalId: event.uid, lastSyncedAt: now, origin: "IMPORTED" });
      if (event.overrides.length > 0) overridesToWrite.set(event.uid, event.overrides);
      continue;
    }

    const overridesChanged = signature(row.overrides) !== signature(event.overrides);
    if (overridesChanged) overridesToWrite.set(event.uid, event.overrides);

    // ALREADY RIGHT? Then do not write it. `deletedAt` is compared as a
    // PRESENCE, not as an instant: re-tombstoning an already-tombstoned event
    // would change the timestamp and so count as a change every single time,
    // which is the whole 8 seconds back again for any cancelled event.
    const same =
      row.title === fields.title &&
      row.startsAt.getTime() === fields.startsAt.getTime() &&
      row.endsAt.getTime() === fields.endsAt.getTime() &&
      row.allDay === fields.allDay &&
      row.rrule === fields.rrule &&
      row.timeZone === fields.timeZone &&
      (row.deletedAt === null) === (fields.deletedAt === null);
    if (same) {
      // The row itself is right; a changed week of it still counts as a
      // change to the event, and is written below.
      if (overridesChanged) weeksOnly++;
      else unchanged++;
      continue;
    }
    // lastSyncedAt is written only with a real change, so it means "when this
    // row last moved", not "when we last looked" - which is the more useful
    // of the two and the only one that is free.
    updates.push(prisma.calendarEvent.update({ where: { id: row.id }, data: { ...fields, lastSyncedAt: now } }));
  }

  // GONE FROM THE FEED. Tombstoned, not deleted - see the note at the top.
  const vanished = here.filter((e) => e.externalId && !seen.has(e.externalId) && !e.deletedAt);

  // ONE ROUND TRIP EACH, rather than one per event. createMany inserts the
  // lot; the updates are pipelined through a single transaction. See the note
  // on SyncToken for what this replaced and what it cost.
  if (inserts.length > 0) await prisma.calendarEvent.createMany({ data: inserts, skipDuplicates: true });
  if (updates.length > 0) await prisma.$transaction(updates);

  if (overridesToWrite.size > 0) {
    // createMany does not return ids, so events just inserted are looked up
    // - once, and only when one of them has a changed week to attach.
    const ids = new Map(here.filter((e) => e.externalId).map((e) => [e.externalId as string, e.id]));
    const missing = [...overridesToWrite.keys()].filter((uid) => !ids.has(uid));
    if (missing.length > 0) {
      for (const row of await prisma.calendarEvent.findMany({
        where: { calendarId, externalId: { in: missing } },
        select: { id: true, externalId: true },
      })) {
        ids.set(row.externalId as string, row.id);
      }
    }
    const eventIds = [...overridesToWrite.keys()].map((uid) => ids.get(uid)).filter((id): id is string => Boolean(id));
    const rows = [...overridesToWrite.entries()].flatMap(([uid, list]) => {
      const eventId = ids.get(uid);
      if (!eventId) return [];
      // One per occurrence: a feed that names the same week twice keeps the
      // last, rather than failing the unique key and the whole sync with it.
      const byWeek = new Map(list.map((o) => [o.recurrenceId.getTime(), o]));
      return [...byWeek.values()].map((o) => ({
        eventId,
        recurrenceId: o.recurrenceId,
        cancelled: o.cancelled,
        title: o.title ?? null,
        startsAt: o.startsAt ?? null,
        endsAt: o.endsAt ?? null,
      }));
    });
    await prisma.$transaction([
      prisma.calendarEventOverride.deleteMany({ where: { eventId: { in: eventIds } } }),
      prisma.calendarEventOverride.createMany({ data: rows }),
    ]);
  }
  if (vanished.length > 0) {
    await prisma.calendarEvent.updateMany({
      where: { id: { in: vanished.map((e) => e.id) } },
      data: { deletedAt: now },
    });
  }

  await prisma.calendar.update({
    where: { id: calendarId },
    data: { syncToken: JSON.stringify({ at: Date.now(), ...(hash ? { hash } : {}) }) },
  });

  return {
    calendarId,
    name,
    added: inserts.length,
    updated: updates.length + weeksOnly,
    unchanged,
    removed: vanished.length,
    skipped: parsed.skipped.length,
  };
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
