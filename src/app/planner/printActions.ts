"use server";

// The order screen's calls: whether ordering works here, a price for the
// choices on screen, the payment page, an earlier order to start from - and
// the Orders page's: auto-renew on or off, skipping the next book, and
// cancelling. See
// src/lib/print/orders.ts for what each does; this file only says who is
// asking.
//
// A GUEST CAN ORDER (Andrew, 2026-10-15: "yes do guest checkout"). Until
// then an order needed an account; the planner research (Gemini part B,
// Baymard) found forced sign-up behind about one abandoned checkout in five.
// A guest pays on Stripe's page, which asks for their email; the order is
// the guest's, kept from the guest sweep (guestSweep.ts) and moved to their
// account if they sign in (owner.ts, claimGuestWork).
//
// RENEWING STILL NEEDS AN ACCOUNT: a book that orders the next one charges a
// saved card for months, and has to be found, stopped and changed from any
// device, so auto-renew - and every control over it - is account-only.

import { currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { currentOwner } from "@/lib/owner";
import { cancelByCustomer, OrderError, orderingConfigured, quoteOrder, startCheckout, type OrderInput, type Quote } from "@/lib/print/orders";
import { appUrl } from "@/lib/print/fileUrls";
import { RenewalControlError, skipNextBook, startAutoRenew, stopAutoRenew, undoSkip } from "@/lib/print/renewalControls";
import { nextRange, type ShippingLevel } from "@/lib/print/orderRange";
import { bindingFromEnum, paperOfSku, type Binding, type PaperColour } from "@/lib/print/products";
import { orderableBindings } from "@/lib/print/printer";
import type { ShippingAddress } from "@/lib/print/lulu";

/** Ready, with the bindings that can be ordered here (each one's printer has
 *  its keys), in the screen's order - the first is chosen to start with. */
export type OrderingStatus = { ready: true; bindings: Binding[]; guest: boolean } | { ready: false; reason: "not-configured" | "signed-out"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

type NotReady = { ready: false; reason: "signed-out"; message: string };

/** Who is ordering: an account or a guest. Nobody at all is asked to sign
 *  in or carry on as a guest. */
async function orderingOwner(): Promise<{ id: string; guest: boolean } | NotReady> {
  const owner = await currentOwner();
  if (!owner) return { ready: false, reason: "signed-out", message: "Sign in, or continue as a guest, to order a printed book." };
  return { id: owner.id, guest: owner.guest };
}

/** Auto-renew and its controls: an account only (see the top of the file). */
async function signedInOwner(): Promise<{ id: string } | NotReady> {
  const owner = await currentOwner();
  if (!owner || owner.guest) {
    return { ready: false, reason: "signed-out", message: "Auto-renew needs an account. Sign in, and your journal and orders come with you." };
  }
  return { id: owner.id };
}

/** Payment pages a guest may open in an hour. Each one builds the whole
 *  book and keeps its files, and a guest costs nothing to be; an account
 *  has no limit. */
const GUEST_CHECKOUTS_PER_HOUR = 5;

export async function orderingStatus(): Promise<OrderingStatus> {
  const owner = await orderingOwner();
  if ("ready" in owner) return owner;
  const configured = orderingConfigured();
  if (!configured.ok) {
    return { ready: false, reason: "not-configured", message: `Ordering is not switched on yet (${configured.missing.join(" and ")} keys are not set).` };
  }
  return { ready: true, bindings: orderableBindings(), guest: owner.guest };
}

/** Errors a person can act on are said; anything else is logged and said
 *  generally, so no internals reach the page. */
function failure(error: unknown, doing: string): { ok: false; error: string } {
  if (error instanceof OrderError || error instanceof RenewalControlError) return { ok: false, error: error.message };
  console.error(`[print] ${doing} failed:`, error);
  return { ok: false, error: `Something went wrong ${doing}. Try again in a moment.` };
}

export async function quotePrint(input: OrderInput): Promise<Result<Quote>> {
  const owner = await orderingOwner();
  if ("ready" in owner) return { ok: false, error: owner.message };
  try {
    return { ok: true, value: await quoteOrder(owner.id, input) };
  } catch (error) {
    return failure(error, "pricing the book");
  }
}

export async function checkoutPrint(input: OrderInput & { level: ShippingLevel; autoRenew: boolean }): Promise<Result<{ url: string }>> {
  const owner = await orderingOwner();
  if ("ready" in owner) return { ok: false, error: owner.message };
  if (owner.guest && input.autoRenew) {
    return { ok: false, error: "Auto-renew needs an account. Sign in to turn it on, or order this book as a guest with it off." };
  }
  if (owner.guest) {
    const { prisma } = await import("@/lib/prisma");
    const recent = await prisma.printOrder.count({ where: { ownerId: owner.id, status: "QUOTED", createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } });
    if (recent >= GUEST_CHECKOUTS_PER_HOUR) {
      return { ok: false, error: "That's a lot of payment pages for one hour. Try again in a little while, or sign in." };
    }
  }
  try {
    // An account's email goes with the order; a guest gives theirs on
    // Stripe's page, and the webhook copies it on (api/stripe/webhook).
    const user = owner.guest ? null : await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? undefined;
    const list = await headers();
    const host = list.get("x-forwarded-host") ?? list.get("host");
    const proto = list.get("x-forwarded-proto") ?? "https";
    const origin = appUrl(host ? `${proto}://${host}` : undefined);
    const { url } = await startCheckout(owner.id, { ...input, autoRenew: input.autoRenew === true, email }, origin);
    return { ok: true, value: { url } };
  } catch (error) {
    return failure(error, "opening the payment page");
  }
}

/**
 * Auto-renew on or off for one of the person's orders. Off always works. On
 * needs the card that was saved when it was paid for - the card is kept only
 * when auto-renew was on at checkout - so an order paid without it says to
 * turn it on with the next order instead.
 */
export async function setAutoRenew(orderId: string, on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const owner = await signedInOwner();
  if ("ready" in owner) return { ok: false, error: owner.message };
  try {
    if (on) await startAutoRenew(owner.id, orderId);
    else await stopAutoRenew(owner.id, orderId);
    return { ok: true };
  } catch (error) {
    return failure(error, "changing auto-renew");
  }
}

/** Skip the next book (renewalControls.ts): nothing printed or charged for
 *  its days; the one after is ordered as usual. */
export async function skipRenewal(orderId: string): Promise<Result<{ skippedId: string }>> {
  const owner = await signedInOwner();
  if ("ready" in owner) return { ok: false, error: owner.message };
  try {
    const { skippedId } = await skipNextBook(owner.id, orderId);
    return { ok: true, value: { skippedId } };
  } catch (error) {
    return failure(error, "skipping the book");
  }
}

/** Take a skip back, while the book after it has not been ordered. */
export async function undoSkipRenewal(skippedId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const owner = await signedInOwner();
  if ("ready" in owner) return { ok: false, error: owner.message };
  try {
    await undoSkip(owner.id, skippedId);
    return { ok: true };
  } catch (error) {
    return failure(error, "undoing the skip");
  }
}

/** The customer stops one of their own books, while the printer has not
 *  begun it - see cancelByCustomer in orders.ts. */
export async function cancelOrder(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const owner = await orderingOwner();
  if ("ready" in owner) return { ok: false, error: owner.message };
  try {
    await cancelByCustomer(owner.id, orderId);
    return { ok: true };
  } catch (error) {
    return failure(error, "cancelling the order");
  }
}

export type ReorderDefaults = { startISO: string; days: number; binding: Binding; paper: PaperColour; address: ShippingAddress; level: ShippingLevel };

/**
 * "Order the next one" (the Orders page): the order screen filled in from an
 * earlier book - the same number of days straight after it, the same
 * binding, address and shipping. A renewal that was never ordered is itself
 * the next one, so it gives its own days. Only the person's own order, and
 * only on the journal it was made from; anything else opens the screen
 * empty, as Order print does.
 */
export async function reorderDefaults(orderId: string, journalId: string): Promise<ReorderDefaults | null> {
  const owner = await orderingOwner();
  if ("ready" in owner) return null;
  const { prisma } = await import("@/lib/prisma");
  const order = await prisma.printOrder.findFirst({ where: { id: orderId, ownerId: owner.id, plannerId: journalId } });
  if (!order) return null;
  const range = { start: order.startDate, end: order.endDate, days: order.days };
  const next = order.status === "FAILED" && order.renewedFromId ? range : nextRange(range);
  return {
    startISO: next.start.toISOString().slice(0, 10),
    days: next.days,
    binding: bindingFromEnum(order.binding),
    paper: paperOfSku(order.podPackageId),
    address: order.shippingAddress as unknown as ShippingAddress,
    level: order.shippingLevel as ShippingLevel,
  };
}
