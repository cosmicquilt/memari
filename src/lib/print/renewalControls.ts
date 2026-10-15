// SKIP, UNDO AND STOP: what a customer can do about the next book before it
// is ordered. Server-only.
//
// Asked 2026-10-15, from the research on planner subscriptions (buyers
// resent being locked in, and a pile of unused books is why they quit):
//   1. a reminder before each book prints - "Your next quarter prints in 7
//      days. Change your pages, skip this one, or pause." (emails.ts)
//   2. one-click skip and cancel, never buried (the top of Orders, and the
//      reminder's own links - src/app/renewal).
//
// SKIP leaves a SKIPPED order in the chain for the skipped days: nothing
// printed, nothing charged, auto-renew carried on it, renewing on the date
// the book AFTER is due. The renewal job treats it like any book that went
// to print, so the chain carries on with no special case (renewals.ts).
// UNDO deletes it and puts auto-renew back on the order it stood in for.
// STOP ("pause", "cancel") is auto-renew off: nothing more is ordered until
// it is switched back on.
//
// Only the CHAIN HEAD - a journal's latest book - carries the controls. A
// switch on an older book, one a later order already followed, would renew
// days already printed (the bug found 2026-10-05).

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { nextRange, renewalDate, type OrderRange, type ShippingLevel } from "./orderRange";
import { bindingFromEnum, shippedAbroad } from "./products";
import { appUrl, siteSignature, verifySiteSignature } from "./fileUrls";

/** A book that went to print, or a skipped one standing in for its days -
 *  what a renewal follows on from. */
export const RENEWABLE_STATUSES = ["SUBMITTED", "IN_PRODUCTION", "SHIPPED", "DELIVERED", "SKIPPED"] as const;
/** As above, plus a book paid for and on its way to the printer: what the
 *  Orders page counts as the journal's latest. */
export const CHAIN_STATUSES = ["PAID", ...RENEWABLE_STATUSES] as const;

export class RenewalControlError extends Error {}

/** What the reminder's links can do without signing in. */
export type RenewalAction = "skip" | "pause";

/** The reminder's skip or pause link: signed, so it works from the email
 *  alone, but it opens a page with one button - mail scanners open links,
 *  and a link that acted on its own would skip books nobody asked to skip. */
export function renewalActionUrl(orderId: string, action: RenewalAction): string {
  return `${appUrl()}/renewal/${encodeURIComponent(orderId)}?do=${action}&sig=${siteSignature(`renewal:${orderId}:${action}`)}`;
}

export function verifyRenewalAction(orderId: string, action: string | null, signature: string | null): action is RenewalAction {
  if (action !== "skip" && action !== "pause") return false;
  // With no signing secret set (production before the print keys are in),
  // nothing could have been signed, so nothing verifies - a "link doesn't
  // work" page, never a 500 (found on the live site 2026-10-15).
  try {
    return verifySiteSignature(`renewal:${orderId}:${action}`, signature);
  } catch {
    return false;
  }
}

type OrderRow = Awaited<ReturnType<typeof prisma.printOrder.findFirstOrThrow>>;

function rangeOf(order: Pick<OrderRow, "startDate" | "endDate" | "days">): OrderRange {
  return { start: order.startDate, end: order.endDate, days: order.days };
}

/** When the book after `range` would be ordered, by this order's post. */
export function renewalDateFor(order: Pick<OrderRow, "binding" | "shippingLevel" | "shippingAddress">, range: OrderRange, now: Date): Date {
  const address = order.shippingAddress as { countryCode?: string };
  return renewalDate(range, order.shippingLevel as ShippingLevel, shippedAbroad(bindingFromEnum(order.binding), address.countryCode ?? ""), now);
}

/** Whether `order` is its journal's latest book - the one the next renews
 *  from. Ties (same last day) go to the newest order. */
export async function isChainHead(order: Pick<OrderRow, "id" | "ownerId" | "plannerId" | "endDate" | "createdAt">): Promise<boolean> {
  if (!order.plannerId) return false;
  const later = await prisma.printOrder.count({
    where: {
      ownerId: order.ownerId,
      plannerId: order.plannerId,
      id: { not: order.id },
      status: { in: [...CHAIN_STATUSES] },
      OR: [{ endDate: { gt: order.endDate } }, { endDate: order.endDate, createdAt: { gt: order.createdAt } }],
    },
  });
  return later === 0;
}

async function ownOrder(ownerId: string, orderId: string): Promise<OrderRow> {
  const order = await prisma.printOrder.findFirst({ where: { id: orderId, ownerId } });
  if (!order) throw new RenewalControlError("That order could not be found.");
  return order;
}

/** What "skip" would skip and when the book after it would be ordered -
 *  for the reminder and the pages to say before anything is done. */
export function skipPreview(order: Pick<OrderRow, "startDate" | "endDate" | "days" | "binding" | "shippingLevel" | "shippingAddress">, now: Date) {
  const skipped = nextRange(rangeOf(order));
  const after = nextRange(skipped);
  return { skipped, after, afterOrderedOn: renewalDateFor(order, skipped, now) };
}

/**
 * Skip the next book: a SKIPPED order for its days, carrying auto-renew,
 * renewing on the date the book after it is due. Claimed like the renewal
 * job claims (renewsAt unchanged since read), so a skip and a renewal at
 * the same moment cannot both happen.
 */
export async function skipNextBook(ownerId: string, orderId: string, now: Date = new Date()): Promise<{ skippedId: string; skipped: OrderRange; afterOrderedOn: Date }> {
  const order = await ownOrder(ownerId, orderId);
  if (!order.autoRenew || !order.renewsAt) throw new RenewalControlError("Auto-renew is off for this book, so there is nothing to skip.");
  if (!(RENEWABLE_STATUSES as readonly string[]).includes(order.status)) throw new RenewalControlError("This book can't be skipped from here.");
  if ((await prisma.printOrder.count({ where: { renewedFromId: order.id } })) > 0) throw new RenewalControlError("The next book has already been ordered.");
  if (!(await isChainHead(order))) throw new RenewalControlError("A later book follows this one; skip from that one.");

  const preview = skipPreview(order, now);
  const created = await prisma.$transaction(async (tx) => {
    const claimed = await tx.printOrder.updateMany({ where: { id: order.id, autoRenew: true, renewsAt: order.renewsAt }, data: { autoRenew: false, renewsAt: null } });
    if (claimed.count === 0) throw new RenewalControlError("The next book is being ordered right now, so it can't be skipped.");
    return tx.printOrder.create({
      data: {
        ownerId: order.ownerId,
        plannerId: order.plannerId,
        title: order.title,
        startDate: preview.skipped.start,
        endDate: preview.skipped.end,
        days: preview.skipped.days,
        binding: order.binding,
        podPackageId: order.podPackageId,
        printer: order.printer,
        pageCount: 0,
        shippingLevel: order.shippingLevel,
        shippingAddress: order.shippingAddress as Prisma.InputJsonValue,
        contactEmail: order.contactEmail,
        bookCents: 0,
        shippingCents: 0,
        totalCents: 0,
        costCents: 0,
        currency: order.currency,
        status: "SKIPPED",
        autoRenew: true,
        renewsAt: preview.afterOrderedOn,
        // The card goes with the chain, for the book after.
        stripePaymentMethodId: order.stripePaymentMethodId,
        renewedFromId: order.id,
      },
    });
  });
  return { skippedId: created.id, skipped: preview.skipped, afterOrderedOn: preview.afterOrderedOn };
}

/** Undo a skip: the SKIPPED order goes, and auto-renew comes back on the
 *  book it stood in for - while nothing has followed the skip. If auto-renew
 *  was stopped after the skip, it stays stopped. */
export async function undoSkip(ownerId: string, skippedId: string, now: Date = new Date()): Promise<{ renewsAt: Date | null }> {
  const skipped = await ownOrder(ownerId, skippedId);
  if (skipped.status !== "SKIPPED" || !skipped.renewedFromId) throw new RenewalControlError("That book wasn't skipped.");
  if ((await prisma.printOrder.count({ where: { renewedFromId: skipped.id } })) > 0) throw new RenewalControlError("The book after it has already been ordered, so the skip stays.");
  const original = await ownOrder(ownerId, skipped.renewedFromId);
  const renewsAt = skipped.autoRenew ? renewalDateFor(original, rangeOf(original), now) : null;
  await prisma.$transaction(async (tx) => {
    const gone = await tx.printOrder.deleteMany({ where: { id: skipped.id, status: "SKIPPED", renewals: { none: {} } } });
    if (gone.count === 0) throw new RenewalControlError("The book after it has already been ordered, so the skip stays.");
    await tx.printOrder.update({ where: { id: original.id }, data: { autoRenew: renewsAt !== null, renewsAt, renewalReminderSentAt: null } });
  });
  return { renewsAt };
}

/** Where a reminder's pause lands: past any skips made since it was sent,
 *  to the order that renews now - pausing from an older email still stops
 *  the journal's next book. */
export async function pastSkips(orderId: string): Promise<OrderRow | null> {
  let order = await prisma.printOrder.findUnique({ where: { id: orderId } });
  while (order) {
    const skipped = await prisma.printOrder.findFirst({ where: { renewedFromId: order.id, status: "SKIPPED" } });
    if (!skipped) return order;
    order = skipped;
  }
  return null;
}

/** Stop auto-renew ("pause" in the reminder, "Stop auto-renew" on the
 *  page): nothing more is ordered until it is switched back on. */
export async function stopAutoRenew(ownerId: string, orderId: string): Promise<void> {
  const order = await ownOrder(ownerId, orderId);
  await prisma.printOrder.update({ where: { id: order.id }, data: { autoRenew: false, renewsAt: null } });
}

/** Auto-renew back on - only on a journal's latest book, and only with the
 *  card saved when it was paid for. */
export async function startAutoRenew(ownerId: string, orderId: string, now: Date = new Date()): Promise<{ renewsAt: Date }> {
  const order = await ownOrder(ownerId, orderId);
  if (!order.stripePaymentMethodId) throw new RenewalControlError("No card was saved with this order. Turn auto-renew on when you place your next order.");
  if (!(RENEWABLE_STATUSES as readonly string[]).includes(order.status) && order.status !== "PAID") throw new RenewalControlError("This book can't renew.");
  if ((await prisma.printOrder.count({ where: { renewedFromId: order.id } })) > 0) throw new RenewalControlError("The next book has already been ordered.");
  if (!(await isChainHead(order))) throw new RenewalControlError("A later book follows this one, so it can't renew; turn auto-renew on for that one.");
  const renewsAt = renewalDateFor(order, rangeOf(order), now);
  await prisma.printOrder.update({ where: { id: order.id }, data: { autoRenew: true, renewsAt, renewalReminderSentAt: null } });
  return { renewsAt };
}
