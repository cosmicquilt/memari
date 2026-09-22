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
  const guestOwner = `${GUEST_OWNER_PREFIX}${guestId}`;
  const [journals, pages, modules] = await prisma.$transaction([
    prisma.planner.updateMany({ where: { ownerId: guestOwner }, data: { ownerId: userId } }),
    prisma.savedPage.updateMany({ where: { ownerId: guestOwner }, data: { ownerId: userId } }),
    prisma.savedModule.updateMany({ where: { ownerId: guestOwner }, data: { ownerId: userId } }),
  ]);
  return journals.count + pages.count + modules.count;
}

/** Our own sign-in page, returning to `returnTo` afterwards - it is also
 *  where "Continue as guest" lives. */
export function signInPath(returnTo: string): string {
  return `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;
}
