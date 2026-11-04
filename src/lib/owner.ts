// Who is asking: a signed-in person, a guest, or nobody.
//
// Every server action and page that works on journals used to ask Clerk for
// a user id and stop there. A guest has no Clerk session, so this is the one
// place that also accepts a signed guest cookie - see guest.ts. The id it
// returns is what journals are owned by: a Clerk user id, or "guest:<id>".
//
// SERVER-ONLY.

import { AsyncLocalStorage } from "node:async_hooks";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { GUEST_COOKIE, GUEST_OWNER_PREFIX, guestIdFromCookie } from "@/lib/guest";
import { markClaimed } from "@/lib/businessClaim";

export type Owner = { id: string; guest: boolean };

// A PERSON'S OWN ASSISTANT, CONNECTED (2026-11-02, src/lib/connector): it
// arrives with an OAuth token instead of a session, and asks for the same
// actions the editor does. Everything it touches asks here who is asking, so
// the token's owner is held for the length of that one tool call - and every
// action's ownership checks then hold for it, with no second list of them.
// Nothing in a browser can reach this: only the connector's token check calls
// it, and this is not a "use server" file.
const connected = new AsyncLocalStorage<Owner>();

/** Run `work` as the account `userId`, whose token has already been checked.
 *  Always an account: a guest has no way to connect. */
export function asConnectedOwner<T>(userId: string, work: () => Promise<T>): Promise<T> {
  return connected.run({ id: userId, guest: false }, work);
}

/** The signed-in person, else a guest with a valid cookie, else null. A
 *  signed-in person always wins: a guest cookie left in the browser does not
 *  turn an account into a guest. */
export async function currentOwner(): Promise<Owner | null> {
  const acting = connected.getStore();
  if (acting) return acting;
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
  // A BUSINESS a guest started (memari. for businesses) comes with them. Its
  // clients and templates hang off it, and its journals moved above. An
  // account with a business already - one each, for now - takes the guest's
  // clients, templates and emailed-link count into its own, and the guest's
  // goes (review, 2026-10-27): left behind, it was out of the account's
  // reach and still the guest cookie's, so whoever used that browser as a
  // guest next had its clients' names and addresses. The account's name,
  // logo and payouts stand; a guest cannot set up payouts.
  const guestBusiness = await prisma.business.findUnique({ where: { ownerId: guestOwner }, select: { id: true } });
  if (guestBusiness) await moveGuestBusiness(guestBusiness.id, guestOwner, userId);
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

/** The guest's business to the account (moveGuestWork): moved whole when
 *  the account has none, merged into the account's when it has one.
 *
 *  EVERY WRITE IS SCOPED TO THE GUEST STILL OWNING IT. Claims run on every
 *  page that claims, so two can run at once (two tabs; a reload during the
 *  sign-in redirect), and the second may have read the guest's business just
 *  before the first moved it. Unscoped, the second then found the account
 *  "already had" a business - the very one just moved - and merged it into
 *  itself and deleted it, every client with it (review, 2026-10-27). Scoped,
 *  a claim that lags does nothing. */
export async function moveGuestBusiness(guestBusinessId: string, guestOwner: string, userId: string): Promise<void> {
  const own = await prisma.business.findUnique({ where: { ownerId: userId }, select: { id: true, preparedAt: true } });
  if (own?.id === guestBusinessId) return;
  const theGuests = { id: guestBusinessId, ownerId: guestOwner };
  // A WORKSPACE WE PREPARED (businessClaim.ts) is claimed once an account has
  // it: its link dies, and the pilot page says when. Moving to another guest
  // (a claim link opened where they were a guest already) is not that.
  const toAccount = !userId.startsWith(GUEST_OWNER_PREFIX);
  if (!own) {
    await prisma.business.updateMany({ where: theGuests, data: { ownerId: userId } });
    if (toAccount) await markClaimed(guestBusinessId);
    return;
  }
  const prepared = await prisma.business.findUnique({ where: { id: guestBusinessId }, select: { preparedAt: true, preparedKey: true, claimTokenHash: true, claimExpiresAt: true } });
  await prisma.$transaction([
    prisma.businessClient.updateMany({ where: { business: theGuests }, data: { businessId: own.id } }),
    prisma.businessTemplate.updateMany({ where: { business: theGuests }, data: { businessId: own.id } }),
    // its groups too (review, 2026-10-31): left on the guest's business they
    // went with it, deleted, and their clients fell out of them
    prisma.businessGroup.updateMany({ where: { business: theGuests }, data: { businessId: own.id } }),
    prisma.businessFeedback.updateMany({ where: { business: theGuests }, data: { businessId: own.id } }),
    prisma.clientLinkEmail.updateMany({ where: { business: theGuests }, data: { businessId: own.id } }),
    prisma.business.deleteMany({ where: theGuests }),
    // a prepared workspace merged into theirs: theirs is the one the pilot
    // page follows now, and its link goes on working on their other devices
    // while it is a guest's (after the delete: the link's hash is unique)
    ...(prepared?.preparedAt && !own.preparedAt
      ? [
          prisma.business.update({
            where: { id: own.id },
            data: { preparedAt: prepared.preparedAt, preparedKey: prepared.preparedKey, claimTokenHash: prepared.claimTokenHash, claimExpiresAt: prepared.claimExpiresAt },
          }),
        ]
      : []),
  ]);
  if (toAccount) await markClaimed(own.id);
}

/** EVERYTHING A PERSON MADE, gone (account/actions.ts, deleteAccount): their
 *  journals (pages and modules cascade), saved pages and modules, calendars
 *  and events, settings - and their business, with its clients, templates
 *  and emailed-link count (2026-10-27: it was left behind, a guest's beyond
 *  anyone's reach, its clients' names and addresses kept for as long as any
 *  client kept opening their page). A coach's payouts account is theirs at
 *  Stripe and stays there; refunds of their clients' books read the account
 *  off each order, not the business. Printed-book records stay, with
 *  auto-renew off: they are the record of a sale. */
export async function deleteOwnerWork(ownerId: string): Promise<void> {
  await prisma.$transaction([
    prisma.printOrder.updateMany({ where: { ownerId, autoRenew: true }, data: { autoRenew: false } }),
    prisma.planner.deleteMany({ where: { ownerId, isTemplate: false } }),
    prisma.savedPage.deleteMany({ where: { ownerId } }),
    prisma.savedModule.deleteMany({ where: { ownerId } }),
    prisma.calendarEvent.deleteMany({ where: { ownerId } }),
    prisma.calendar.deleteMany({ where: { ownerId } }),
    prisma.ownerSettings.deleteMany({ where: { ownerId } }),
    prisma.business.deleteMany({ where: { ownerId } }),
  ]);
}

/** Our own sign-in page, returning to `returnTo` afterwards - it is also
 *  where "Continue as guest" lives. */
export function signInPath(returnTo: string): string {
  return `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;
}
