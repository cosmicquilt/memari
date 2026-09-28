// Clearing out guest work nobody came back for.
//
// SERVER-ONLY. Pulled out of /guest's route handler so it can be driven by a
// check: it deletes things, it is the only code that does, and "does the
// sweep also take the new kind of row" is a question that needs answering
// every time a new kind of row is added.
//
// IT WAS NOT, once already. Calendars and their events arrived on 2026-09-27
// and the sweep still deleted only journals and saved items, so a guest's
// subscribed calendar - a feed address and every event on it - would have sat
// in the database for ever after their journals went. Found by checking a
// sentence written on the privacy page rather than by anything failing.
//
// No scheduled job: this runs whenever somebody starts as a guest, which is
// often enough and costs a few indexed queries.

import { prisma } from "@/lib/prisma";
import { GUEST_IDLE_DAYS, GUEST_OWNER_PREFIX } from "@/lib/guest";

export type SweepResult = { journals: number; savedPages: number; savedModules: number; calendars: number };

export async function sweepIdleGuests(now: Date = new Date()): Promise<SweepResult> {
  const cutoff = new Date(now.getTime() - GUEST_IDLE_DAYS * 24 * 60 * 60 * 1000);
  const idleGuest = { ownerId: { startsWith: GUEST_OWNER_PREFIX }, updatedAt: { lt: cutoff } };

  const journals = await prisma.planner.deleteMany({ where: idleGuest });

  // A guest's OTHER belongings go once that guest has no journals left and
  // the thing itself has sat as long. Not on idleness alone: a saved page is
  // only touched when it is edited, and a calendar only when it syncs, so a
  // guest still using their journals would otherwise lose them.
  const owners = new Set(
    [
      ...(await prisma.savedPage.findMany({ where: idleGuest, select: { ownerId: true }, distinct: ["ownerId"] })),
      ...(await prisma.savedModule.findMany({ where: idleGuest, select: { ownerId: true }, distinct: ["ownerId"] })),
      ...(await prisma.calendar.findMany({ where: idleGuest, select: { ownerId: true }, distinct: ["ownerId"] })),
    ].map((row) => row.ownerId)
  );
  if (owners.size === 0) return { journals: journals.count, savedPages: 0, savedModules: 0, calendars: 0 };

  const active = await prisma.planner.findMany({
    where: { ownerId: { in: [...owners] } },
    select: { ownerId: true },
    distinct: ["ownerId"],
  });
  for (const row of active) owners.delete(row.ownerId);
  if (owners.size === 0) return { journals: journals.count, savedPages: 0, savedModules: 0, calendars: 0 };

  const gone = { ...idleGuest, ownerId: { in: [...owners] } };
  // The events cascade with their calendar, so nothing of the feed is left.
  const [savedPages, savedModules, calendars] = await prisma.$transaction([
    prisma.savedPage.deleteMany({ where: gone }),
    prisma.savedModule.deleteMany({ where: gone }),
    prisma.calendar.deleteMany({ where: gone }),
  ]);

  return {
    journals: journals.count,
    savedPages: savedPages.count,
    savedModules: savedModules.count,
    calendars: calendars.count,
  };
}
