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
//
// A GUEST WHO HAS ORDERED IS NEVER SWEPT (2026-10-15, when guests could
// order). They paid; the journal their book was made from, and their
// settings - the Stripe customer among them - stay for as long as the
// cookie does, idle or not, so "order the next one" still finds them. The
// orders themselves are never deleted here: they are the record of a sale.
//
// A GUEST'S BUSINESS (memari. for businesses; review, 2026-10-27). A coach's
// journals are one set - their templates and every client's journal - and
// are in use whenever the coach works on the business or a client opens
// their page, neither of which touches a journal. Swept one journal at a
// time, an active coach lost each client's journal a month after its last
// edit. Now none of a guest coach's journals go while the business is in
// use; and once it is not, the business goes after them, with its clients'
// names, emails and addresses - before, those were kept for ever.

import { LISTED } from "@/lib/print/holdsDays";
import { prisma } from "@/lib/prisma";
import { GUEST_IDLE_DAYS, GUEST_OWNER_PREFIX } from "@/lib/guest";

export type SweepResult = {
  journals: number;
  savedPages: number;
  savedModules: number;
  calendars: number;
  settings: number;
  businesses: number;
};

export async function sweepIdleGuests(now: Date = new Date()): Promise<SweepResult> {
  const cutoff = new Date(now.getTime() - GUEST_IDLE_DAYS * 24 * 60 * 60 * 1000);
  // Guests with an order that got as far as payment. An abandoned checkout
  // (QUOTED) does not count: nothing was bought. A bank payment still
  // clearing does (holdsDays.ts, 2026-10-26).
  const customers = (
    await prisma.printOrder.findMany({
      where: { ownerId: { startsWith: GUEST_OWNER_PREFIX }, OR: LISTED },
      select: { ownerId: true },
      distinct: ["ownerId"],
    })
  ).map((row) => row.ownerId);
  // Guest coaches whose business is in use: touched by the coach (business.ts,
  // currentBusiness), a client changed, a client's page opened, or any of
  // their journals edited.
  const coaches = (await prisma.business.findMany({ where: { ownerId: { startsWith: GUEST_OWNER_PREFIX } }, select: { ownerId: true } })).map((row) => row.ownerId);
  const working =
    coaches.length === 0
      ? []
      : [
          ...(await prisma.business.findMany({
            where: {
              ownerId: { in: coaches },
              OR: [{ updatedAt: { gte: cutoff } }, { clients: { some: { OR: [{ updatedAt: { gte: cutoff } }, { accessSeenAt: { gte: cutoff } }] } } }],
            },
            select: { ownerId: true },
          })),
          ...(await prisma.planner.findMany({ where: { ownerId: { in: coaches }, updatedAt: { gte: cutoff } }, select: { ownerId: true }, distinct: ["ownerId"] })),
        ].map((row) => row.ownerId);
  const idleGuest = { ownerId: { startsWith: GUEST_OWNER_PREFIX, notIn: [...customers, ...working] }, updatedAt: { lt: cutoff } };

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
      // OwnerSettings, added 2026-09-28 - the second kind of row this sweep
      // had to be told about, one day after calendars. check:guest-sweep
      // names each kind for exactly this reason.
      ...(await prisma.ownerSettings.findMany({ where: idleGuest, select: { ownerId: true }, distinct: ["ownerId"] })),
      // A business, the third (2026-10-27). Its clients, templates and
      // emailed-link counts cascade with it.
      ...(await prisma.business.findMany({ where: idleGuest, select: { ownerId: true } })),
    ].map((row) => row.ownerId)
  );
  const nothing = { journals: journals.count, savedPages: 0, savedModules: 0, calendars: 0, settings: 0, businesses: 0 };
  if (owners.size === 0) return nothing;

  const active = await prisma.planner.findMany({
    where: { ownerId: { in: [...owners] } },
    select: { ownerId: true },
    distinct: ["ownerId"],
  });
  for (const row of active) owners.delete(row.ownerId);
  if (owners.size === 0) return nothing;

  const gone = { ...idleGuest, ownerId: { in: [...owners] } };
  // The events cascade with their calendar, so nothing of the feed is left.
  const [savedPages, savedModules, calendars, settings, businesses] = await prisma.$transaction([
    prisma.savedPage.deleteMany({ where: gone }),
    prisma.savedModule.deleteMany({ where: gone }),
    prisma.calendar.deleteMany({ where: gone }),
    prisma.ownerSettings.deleteMany({ where: gone }),
    prisma.business.deleteMany({ where: gone }),
  ]);

  return {
    journals: journals.count,
    savedPages: savedPages.count,
    savedModules: savedModules.count,
    calendars: calendars.count,
    settings: settings.count,
    businesses: businesses.count,
  };
}
