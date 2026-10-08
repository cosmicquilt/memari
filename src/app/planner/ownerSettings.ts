// A person's own settings: the time zone their books follow, and their
// defaults for new journals.
//
// SERVER-ONLY. Every function takes the ownerId its caller established
// through currentOwnerId (see owner.ts); none of them trusts an id from the
// browser.

import { prisma } from "@/lib/prisma";
import { effectiveZone, isTimeZone } from "@/lib/timeZone";
import { parsePreferences, type Preferences } from "@/lib/preferences";

/** The person's default zone, or null if they have never had one seeded. */
export async function ownerDefaultZone(ownerId: string): Promise<string | null> {
  const row = await prisma.ownerSettings.findUnique({ where: { ownerId }, select: { timeZone: true } });
  return isTimeZone(row?.timeZone) ? row.timeZone : null;
}

/** Set the person's default. Every book that follows it redraws. */
export async function setOwnerDefaultZone(ownerId: string, zone: string): Promise<void> {
  if (!isTimeZone(zone)) throw new Error("That is not a time zone.");
  await prisma.ownerSettings.upsert({
    where: { ownerId },
    create: { ownerId, timeZone: zone },
    update: { timeZone: zone },
  });
}

/**
 * Give the person a default IF THEY HAVE NONE - from the browser, the one
 * place that knows where they are. Never overwrites: a default somebody chose
 * must not be replaced because they opened the app on a laptop in another
 * country.
 *
 * @returns whether it seeded one, so the caller knows to redraw.
 */
export async function seedOwnerDefaultZone(ownerId: string, zone: unknown): Promise<boolean> {
  if (!isTimeZone(zone)) return false;
  if (await ownerDefaultZone(ownerId)) return false;
  await prisma.ownerSettings.upsert({
    where: { ownerId },
    create: { ownerId, timeZone: zone },
    update: { timeZone: zone },
  });
  return true;
}

/**
 * The zone one of this person's books reads, resolved through effectiveZone -
 * the book's own, else their default, else UTC. What the save path uses, so it
 * agrees with the page by construction.
 */
export async function zoneForBook(ownerId: string, journalId: string): Promise<string> {
  const [book, ownerZone] = await Promise.all([
    prisma.planner.findFirst({ where: { id: journalId, ownerId }, select: { timeZone: true } }),
    ownerDefaultZone(ownerId),
  ]);
  if (!book) throw new Error("Journal not found");
  return effectiveZone(book.timeZone, ownerZone);
}

/** The person's defaults for new journals (preferences.ts) - the app's own
 *  if they have chosen none. */
export async function ownerPreferences(ownerId: string): Promise<Preferences> {
  const row = await prisma.ownerSettings.findUnique({ where: { ownerId }, select: { preferences: true } });
  return parsePreferences(row?.preferences);
}

/** Save the person's defaults for new journals. Journals they already have
 *  keep their own settings. */
export async function setOwnerPreferences(ownerId: string, value: unknown): Promise<Preferences> {
  const preferences = parsePreferences(value);
  await prisma.ownerSettings.upsert({
    where: { ownerId },
    create: { ownerId, preferences },
    update: { preferences },
  });
  return preferences;
}
