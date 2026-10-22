// Who is asking: a signed-in person, a guest, or nobody.
//
// Every server action and page that works on journals used to ask Clerk for
// a user id and stop there. A guest has no Clerk session, so this is the one
// place that also accepts a signed guest cookie - see guest.ts. The id it
// returns is what journals are owned by: a Clerk user id, or "guest:<id>".
//
// SERVER-ONLY.

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { GUEST_COOKIE, GUEST_OWNER_PREFIX, guestIdFromCookie } from "@/lib/guest";

export type Owner = { id: string; guest: boolean };

/** The signed-in person, else a guest with a valid cookie, else null. A
 *  signed-in person always wins: a guest cookie left in the browser does not
 *  turn an account into a guest. */
export async function currentOwner(): Promise<Owner | null> {
  const { userId } = await auth();
  if (userId) return { id: userId, guest: false };
  const guestId = guestIdFromCookie((await cookies()).get(GUEST_COOKIE)?.value);
  return guestId ? { id: `${GUEST_OWNER_PREFIX}${guestId}`, guest: true } : null;
}

export async function currentOwnerId(): Promise<string | null> {
  return (await currentOwner())?.id ?? null;
}

/**
 * Signing in on a browser that was used as a guest brings that guest's work
 * with it: every journal, saved page and saved module the guest cookie owns
 * moves to the account. Run wherever a signed-in person lands - the start
 * dialog and the editor - so it happens on the first page after sign-in,
 * whichever that is.
 *
 * The cookie is left as it is: once its journals have moved it owns nothing,
 * and clearing it would need a response this render cannot set cookies on.
 */
export async function claimGuestWork(userId: string): Promise<number> {
  const guestId = guestIdFromCookie((await cookies()).get(GUEST_COOKIE)?.value);
  if (!guestId) return 0;
  return moveGuestWork(`${GUEST_OWNER_PREFIX}${guestId}`, userId);
}

/** What claimGuestWork moves, once it knows whose: every row `guestOwner`
 *  owns, to `userId`. Apart so check:guest-sweep can drive it without a
 *  request's cookies. */
export async function moveGuestWork(guestOwner: string, userId: string): Promise<number> {
  // CALENDARS AND THEIR EVENTS MOVE TOO. They are owned per person rather
  // than per journal, so a guest who typed events onto a week and then signed
  // in would otherwise keep the pages and lose everything written on them -
  // the journal would arrive intact and blank. Both rows are updated: an
  // event carries its own ownerId as well as its calendar's, because every
  // read filters on it directly.
  // ORDERS MOVE TOO (2026-10-15, when guests could order): a book bought as
  // a guest is the account's from the moment they sign in, on the Orders
  // page and for "order the next one".
  const [journals, pages, modules, calendars, events, orders] = await prisma.$transaction([
    prisma.planner.updateMany({ where: { ownerId: guestOwner }, data: { ownerId: userId } }),
    prisma.savedPage.updateMany({ where: { ownerId: guestOwner }, data: { ownerId: userId } }),
    prisma.savedModule.updateMany({ where: { ownerId: guestOwner }, data: { ownerId: userId } }),
    prisma.calendar.updateMany({ where: { ownerId: guestOwner }, data: { ownerId: userId } }),
    prisma.calendarEvent.updateMany({ where: { ownerId: guestOwner }, data: { ownerId: userId } }),
    prisma.printOrder.updateMany({ where: { ownerId: guestOwner }, data: { ownerId: userId } }),
  ]);
  // SETTINGS: the account keeps its own if it has any - a default time zone
  // somebody chose on their account is not replaced by one a guest cookie
  // picked up. Otherwise the guest's come with them. Not in the transaction
  // above because it is a choice between two writes, not one more write.
  const accountSettings = await prisma.ownerSettings.findUnique({ where: { ownerId: userId } });
  if (accountSettings) {
    await prisma.ownerSettings.deleteMany({ where: { ownerId: guestOwner } });
  } else {
    await prisma.ownerSettings.updateMany({ where: { ownerId: guestOwner }, data: { ownerId: userId } });
  }
  // A BUSINESS a guest started (memari. for businesses) comes with them,
  // unless the account has one already - one each, for now. Its clients and
  // templates hang off it, and its journals moved above.
  if (!(await prisma.business.findUnique({ where: { ownerId: userId }, select: { id: true } }))) {
    await prisma.business.updateMany({ where: { ownerId: guestOwner }, data: { ownerId: userId } });
  }
  // SAVED PLANNERS (bookmarks of ours, templateSaving.ts): one the account
  // already has is kept once - the pair is unique, so these are copied with
  // the duplicates skipped rather than moved.
  const planners = await prisma.savedPlanner.findMany({ where: { ownerId: guestOwner }, select: { templateKey: true } });
  if (planners.length > 0) {
    await prisma.savedPlanner.createMany({ data: planners.map((p) => ({ ownerId: userId, templateKey: p.templateKey })), skipDuplicates: true });
    await prisma.savedPlanner.deleteMany({ where: { ownerId: guestOwner } });
  }
  return journals.count + pages.count + modules.count + calendars.count + events.count + orders.count + planners.length;
}

/** Our own sign-in page, returning to `returnTo` afterwards - it is also
 *  where "Continue as guest" lives. */
export function signInPath(returnTo: string): string {
  return `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;
}
