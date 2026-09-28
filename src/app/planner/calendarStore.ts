// Calendars and their events, in the database.
//
// SERVER-ONLY. The placement rules - which column an event lands in, what a
// recurrence expands to - are in src/lib/calendarEvents.ts, pure and tested.
// This file is the part that cannot be pure: reading and writing rows, and
// deciding who is allowed to.
//
// SHAPE OF THE THING (Andrew, 2026-09-26): a calendar belongs to the OWNER,
// not to a journal - "yes per owner, they can choose to add it to a calendar
// that will be togglable and show up on other journals". So an event typed
// into this week's page is on next year's planner too, and a journal's only
// say is which calendars it hides (HiddenCalendar, keyed by planner).
//
// EVERY function here takes the ownerId its caller already established
// through currentOwnerId - the one identity check (see owner.ts) - and every
// query is filtered by it. An id arriving from the browser is never trusted
// to belong to whoever sent it.

import { prisma } from "@/lib/prisma";
import type { StoredEvent } from "@/lib/calendarEvents";

/** What a new calendar is drawn in until someone changes it. Screen only -
 *  print takes grey, decided 2026-09-26, because colour pages cost money. */
export const DEFAULT_CALENDAR_COLOUR = "#cfe3ff";
export const DEFAULT_CALENDAR_NAME = "My Calendar";

/** The colours the editor offers. Light enough that 5pt text darkened to a
 *  4.5:1 contrast off them is still recognisably the same hue - see eventInk
 *  in hourlyGridCore.ts, which is what actually does the darkening. */
export const CALENDAR_COLOURS = [
  "#cfe3ff", // blue
  "#ffe9b3", // amber
  "#d6f0d8", // green
  "#f7d6e0", // pink
  "#e4dcf7", // violet
  "#ffd9c2", // orange
] as const;

const EVENT_SELECT = {
  id: true,
  title: true,
  startsAt: true,
  endsAt: true,
  allDay: true,
  rrule: true,
  deletedAt: true,
  calendarId: true,
  calendar: { select: { colour: true, source: true } },
} as const;

/** A row as both the placer and the editor want it: StoredEvent plus the
 *  calendar it is on, which the popup needs for its Calendar row. */
export type EditableEvent = StoredEvent & { calendarId: string };

/** The owner's own calendar, made on first use rather than at sign-up - a
 *  person who never adds an event never gets a row. */
export async function defaultCalendarFor(ownerId: string): Promise<{ id: string; colour: string }> {
  const existing = await prisma.calendar.findFirst({
    where: { ownerId, source: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, colour: true },
  });
  if (existing) return existing;
  return prisma.calendar.create({
    data: { ownerId, name: DEFAULT_CALENDAR_NAME, colour: DEFAULT_CALENDAR_COLOUR },
    select: { id: true, colour: true },
  });
}

/**
 * The owner's calendars, and whether this journal shows each one.
 *
 * `externalId` IS DELIBERATELY NOT SELECTED. For a subscription it holds the
 * feed's URL, and a secret calendar address is the whole of its
 * authentication - anyone holding it can read the calendar. It never goes to
 * the browser and never appears in an error message.
 */
export async function calendarsFor(ownerId: string, plannerId?: string) {
  const [calendars, hidden] = await Promise.all([
    prisma.calendar.findMany({
      where: { ownerId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        colour: true,
        source: true,
        _count: { select: { events: { where: { deletedAt: null } } } },
      },
    }),
    plannerId
      ? prisma.hiddenCalendar.findMany({ where: { plannerId }, select: { calendarId: true } })
      : Promise.resolve([]),
  ]);
  const hiddenIds = new Set(hidden.map((h) => h.calendarId));
  return calendars.map(({ _count, ...c }) => ({
    ...c,
    visible: !hiddenIds.has(c.id),
    eventCount: _count.events,
  }));
}

/**
 * Show or hide a calendar ON THIS JOURNAL.
 *
 * Per journal, not per owner, because that is the shape Andrew asked for: a
 * calendar is the owner's and "togglable", so the work calendar can be on the
 * work planner and off the personal one without two copies of it.
 */
export async function setCalendarVisibleFor(
  ownerId: string,
  plannerId: string,
  calendarId: string,
  visible: boolean
): Promise<void> {
  const owned = await prisma.calendar.findFirst({ where: { id: calendarId, ownerId }, select: { id: true } });
  if (!owned) throw new Error("Calendar not found");
  await assertOwnsJournal(ownerId, plannerId);
  if (visible) {
    await prisma.hiddenCalendar.deleteMany({ where: { plannerId, calendarId } });
  } else {
    // Idempotent: hiding an already-hidden calendar is not an error, and a
    // double click must not throw on the unique key.
    await prisma.hiddenCalendar.upsert({
      where: { plannerId_calendarId: { plannerId, calendarId } },
      create: { plannerId, calendarId },
      update: {},
    });
  }
}

const CALENDAR_NAME_MAX = 60;

export async function renameCalendarFor(ownerId: string, calendarId: string, name: string): Promise<string> {
  const clean = String(name ?? "").trim().slice(0, CALENDAR_NAME_MAX);
  if (!clean) throw new Error("A calendar needs a name.");
  const { count } = await prisma.calendar.updateMany({ where: { id: calendarId, ownerId }, data: { name: clean } });
  if (count === 0) throw new Error("Calendar not found");
  return clean;
}

export async function recolourCalendarFor(ownerId: string, calendarId: string, colour: string): Promise<string> {
  // ONE OF THE OFFERED COLOURS, not any hex. The ink and the border are
  // derived from this by darkening it until it clears 4.5:1 (see eventInk),
  // which only reads as the same hue on a light ground - a dark colour here
  // gives dark text on dark, and the swatches are the set that was checked.
  const chosen = CALENDAR_COLOURS.find((c) => c.toLowerCase() === String(colour ?? "").toLowerCase());
  if (!chosen) throw new Error("That is not one of the colours.");
  const { count } = await prisma.calendar.updateMany({ where: { id: calendarId, ownerId }, data: { colour: chosen } });
  if (count === 0) throw new Error("Calendar not found");
  return chosen;
}

/**
 * Remove a calendar and everything on it.
 *
 * A REAL DELETE, unlike an event's. An event is tombstoned so a future sync
 * knows it went; a calendar being removed means the person no longer wants it
 * at all, and its events cascade. Nothing is left to sync.
 *
 * The owner is not left without one: defaultCalendarFor makes a calendar on
 * first use, so typing an event after deleting the last one simply makes
 * another.
 */
export async function deleteCalendarFor(ownerId: string, calendarId: string): Promise<void> {
  await prisma.calendar.deleteMany({ where: { id: calendarId, ownerId } });
}

/**
 * Every event this journal should draw.
 *
 * NO DATE WINDOW, deliberately. A recurrence is stored as a rule, not as
 * rows, so "which events fall in the week on screen" cannot be asked of the
 * database without expanding the rules first - and the caller draws the whole
 * book anyway, since the timeline's thumbnails are every page. A planner's
 * events are counted in hundreds; when that stops being true the window goes
 * here, around the one-off events only, with recurrences always fetched.
 *
 * Tombstoned events are dropped here as well as in eventsForDays: a deleted
 * event should not reach the client at all, and the pure function's own guard
 * is for callers that do not come through this one.
 */
export async function eventsForJournal(ownerId: string, plannerId: string): Promise<EditableEvent[]> {
  const hidden = await prisma.hiddenCalendar.findMany({
    where: { plannerId },
    select: { calendarId: true },
  });
  return prisma.calendarEvent.findMany({
    where: {
      ownerId,
      deletedAt: null,
      ...(hidden.length ? { calendarId: { notIn: hidden.map((h) => h.calendarId) } } : {}),
    },
    orderBy: { startsAt: "asc" },
    select: EVENT_SELECT,
  });
}

/** Is this journal the caller's? Every write below goes through it, so a
 *  journal id typed into a request cannot reach someone else's book. */
async function assertOwnsJournal(ownerId: string, journalId: string): Promise<void> {
  const owned = await prisma.planner.findFirst({ where: { id: journalId, ownerId }, select: { id: true } });
  if (!owned) throw new Error("Journal not found");
}

export type EventInput = {
  title: string;
  /** ISO instants. The client sends strings; the server action boundary is
   *  not a place to rely on a Date surviving as a Date. */
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  rrule: string | null;
  calendarId?: string | null;
};

const TITLE_MAX = 200;

function parse(input: EventInput) {
  const title = String(input.title ?? "").trim().slice(0, TITLE_MAX);
  const startsAt = new Date(input.startsAt);
  let endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw new Error("Bad date");
  // AN END BEFORE ITS START draws a block of negative height, which the
  // renderer clamps to nothing - so the event would save and then be
  // invisible, which reads as "it did not save". Pin it to the start instead.
  if (endsAt.getTime() < startsAt.getTime()) endsAt = startsAt;
  return {
    title: title || "Untitled",
    startsAt,
    endsAt,
    allDay: Boolean(input.allDay),
    rrule: input.rrule || null,
  };
}

export async function createEventFor(
  ownerId: string,
  journalId: string,
  input: EventInput
): Promise<EditableEvent> {
  await assertOwnsJournal(ownerId, journalId);
  const calendarId = input.calendarId
    ? (await prisma.calendar.findFirstOrThrow({ where: { id: input.calendarId, ownerId }, select: { id: true } })).id
    : (await defaultCalendarFor(ownerId)).id;
  return prisma.calendarEvent.create({
    data: { ownerId, calendarId, ...parse(input) },
    select: EVENT_SELECT,
  });
}

export async function updateEventFor(
  ownerId: string,
  eventId: string,
  input: EventInput
): Promise<EditableEvent> {
  const existing = await prisma.calendarEvent.findFirst({ where: { id: eventId, ownerId }, select: { id: true } });
  if (!existing) throw new Error("Event not found");
  const calendarId = input.calendarId
    ? (await prisma.calendar.findFirstOrThrow({ where: { id: input.calendarId, ownerId }, select: { id: true } })).id
    : undefined;
  return prisma.calendarEvent.update({
    where: { id: eventId },
    data: { ...parse(input), ...(calendarId ? { calendarId } : {}) },
    select: EVENT_SELECT,
  });
}

/**
 * Delete an event. A TOMBSTONE only where one is needed.
 *
 * The rule is whether ANYTHING OUTSIDE knows about this event, which is
 * exactly what `externalId` records:
 *
 *   IT CAME FROM A FEED, or has been pushed to one - tombstoned. Without the
 *   row, a deletion here is invisible to the next sync and the event comes
 *   straight back on the next pull. The row is the cheap half of two-way sync
 *   bought now.
 *
 *   IT WAS ONLY EVER TYPED HERE - really deleted. Nothing can re-create it,
 *   so a tombstone would keep the title and times of something a person asked
 *   to be rid of, for a feature that does not exist, and the privacy page
 *   would have to say so. When push does exist, it will only ever need a
 *   tombstone for events the far end has heard of - which is this same test.
 */
export async function deleteEventFor(ownerId: string, eventId: string): Promise<void> {
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, ownerId },
    select: { id: true, externalId: true },
  });
  if (!existing) return;
  if (existing.externalId) {
    await prisma.calendarEvent.update({ where: { id: eventId }, data: { deletedAt: new Date() } });
  } else {
    await prisma.calendarEvent.delete({ where: { id: eventId } });
  }
}
