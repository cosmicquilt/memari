"use server";

// The account page's actions. Each one asks who is asking itself (owner.ts)
// and acts only on that person's own things.

import { cookies } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { currentOwner } from "@/lib/owner";
import { GUEST_COOKIE } from "@/lib/guest";
import { prisma } from "@/lib/prisma";
import { setOwnerDefaultZone, setOwnerPreferences } from "@/app/planner/ownerSettings";
import type { Preferences } from "@/lib/preferences";

async function owner() {
  const who = await currentOwner();
  if (!who) throw new Error("Not signed in");
  return who;
}

/** Save the defaults for new journals. */
export async function savePreferences(value: unknown): Promise<Preferences> {
  return setOwnerPreferences((await owner()).id, value);
}

/** Save the time zone books follow - every book that follows it redraws. */
export async function saveTimeZone(zone: string): Promise<void> {
  await setOwnerDefaultZone((await owner()).id, zone);
}

/** What deleting would take: shown before the person confirms. */
export type DeletionSummary = { journals: number; savedPages: number; savedModules: number; calendars: number; booksOnTheWay: number; renewing: number };

const ON_THE_WAY = ["PAID", "SUBMITTED", "IN_PRODUCTION", "SHIPPED"] as const;

export async function deletionSummary(): Promise<DeletionSummary> {
  const { id } = await owner();
  const [journals, savedPages, savedModules, calendars, booksOnTheWay, renewing] = await Promise.all([
    prisma.planner.count({ where: { ownerId: id, isTemplate: false } }),
    prisma.savedPage.count({ where: { ownerId: id } }),
    prisma.savedModule.count({ where: { ownerId: id } }),
    prisma.calendar.count({ where: { ownerId: id } }),
    prisma.printOrder.count({ where: { ownerId: id, status: { in: [...ON_THE_WAY] } } }),
    prisma.printOrder.count({ where: { ownerId: id, autoRenew: true } }),
  ]);
  return { journals, savedPages, savedModules, calendars, booksOnTheWay, renewing };
}

/**
 * Delete the person and everything they made: journals (their pages and
 * modules cascade), saved pages and modules, calendars and events, settings
 * - and, for an account, the account itself at Clerk. Asked twice: the page
 * makes them type "delete".
 *
 * PRINTED-BOOK RECORDS STAY, with auto-renew turned off: they are the record
 * of a sale (and a book already with the printer still has to arrive), so
 * nothing renews and nothing more is charged, but the order is not erased.
 */
export async function deleteAccount(confirmation: string): Promise<void> {
  if (confirmation.trim().toLowerCase() !== "delete") throw new Error('Type "delete" to confirm.');
  const who = await owner();
  const id = who.id;
  await prisma.$transaction([
    prisma.printOrder.updateMany({ where: { ownerId: id, autoRenew: true }, data: { autoRenew: false } }),
    prisma.planner.deleteMany({ where: { ownerId: id, isTemplate: false } }),
    prisma.savedPage.deleteMany({ where: { ownerId: id } }),
    prisma.savedModule.deleteMany({ where: { ownerId: id } }),
    prisma.calendarEvent.deleteMany({ where: { ownerId: id } }),
    prisma.calendar.deleteMany({ where: { ownerId: id } }),
    prisma.ownerSettings.deleteMany({ where: { ownerId: id } }),
  ]);
  if (who.guest) {
    (await cookies()).delete(GUEST_COOKIE);
    return;
  }
  const clerk = await clerkClient();
  await clerk.users.deleteUser(id);
}
