"use server";

// The order screen's three calls: whether ordering works here, a price for
// the choices on screen, and the payment page. See src/lib/print/orders.ts
// for what each does; this file only says who is asking.
//
// An order needs an ACCOUNT, not a guest cookie: it is paid for, posted to a
// person, and may renew - all of which outlive a browser. A guest is asked
// to sign in, and their journal comes with them (owner.ts, claimGuestWork).

import { currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { currentOwner } from "@/lib/owner";
import { OrderError, orderingConfigured, quoteOrder, startCheckout, type OrderInput, type Quote } from "@/lib/print/orders";
import { appUrl } from "@/lib/print/fileUrls";
import type { ShippingLevel } from "@/lib/print/orderRange";

export type OrderingStatus = { ready: true } | { ready: false; reason: "guest" | "not-configured" | "signed-out"; message: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function signedInOwner(): Promise<{ id: string } | Extract<OrderingStatus, { ready: false }>> {
  const owner = await currentOwner();
  if (!owner) return { ready: false, reason: "signed-out", message: "Sign in to order a printed book." };
  if (owner.guest) {
    return { ready: false, reason: "guest", message: "Sign in to order a printed book. Your journal comes with you." };
  }
  return { id: owner.id };
}

export async function orderingStatus(): Promise<OrderingStatus> {
  const owner = await signedInOwner();
  if ("ready" in owner) return owner;
  const configured = orderingConfigured();
  if (!configured.ok) {
    return { ready: false, reason: "not-configured", message: `Ordering is not switched on yet (${configured.missing.join(" and ")} keys are not set).` };
  }
  return { ready: true };
}

/** Errors a person can act on are said; anything else is logged and said
 *  generally, so no internals reach the page. */
function failure(error: unknown, doing: string): { ok: false; error: string } {
  if (error instanceof OrderError) return { ok: false, error: error.message };
  console.error(`[print] ${doing} failed:`, error);
  return { ok: false, error: `Something went wrong ${doing}. Try again in a moment.` };
}

export async function quotePrint(input: OrderInput): Promise<Result<Quote>> {
  const owner = await signedInOwner();
  if ("ready" in owner) return { ok: false, error: owner.message };
  try {
    return { ok: true, value: await quoteOrder(owner.id, input) };
  } catch (error) {
    return failure(error, "pricing the book");
  }
}

export async function checkoutPrint(input: OrderInput & { level: ShippingLevel; autoRenew: boolean }): Promise<Result<{ url: string }>> {
  const owner = await signedInOwner();
  if ("ready" in owner) return { ok: false, error: owner.message };
  try {
    const user = await currentUser();
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
  const { prisma } = await import("@/lib/prisma");
  const { renewalDate } = await import("@/lib/print/orderRange");
  const order = await prisma.printOrder.findFirst({ where: { id: orderId, ownerId: owner.id } });
  if (!order) return { ok: false, error: "That order could not be found." };
  if (on && !order.stripePaymentMethodId) {
    return { ok: false, error: "No card was saved with this order. Turn auto-renew on when you place your next order." };
  }
  const address = order.shippingAddress as { countryCode?: string };
  await prisma.printOrder.update({
    where: { id: order.id },
    data: {
      autoRenew: on,
      renewsAt: on
        ? renewalDate({ start: order.startDate, end: order.endDate, days: order.days }, order.shippingLevel as never, address.countryCode !== "US", new Date())
        : null,
    },
  });
  return { ok: true };
}
