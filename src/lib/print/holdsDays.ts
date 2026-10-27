// WHICH ORDERS HOLD THEIR DAYS (review, 2026-10-26): one rule, where it used
// to be written out in four places that had begun to differ.
//
// A book holds the days it covers - so they are not sold again, and the next
// book starts after them - when it is paid and on its way, when it was paid
// and the printer refused it (it waits for a retry or a refund), or when its
// payment is still CLEARING: a Checkout finished with a method that takes
// days to settle, a US bank account (ACH) above all, which Stripe reports as
// completed but "unpaid" and settles about four business days later
// (checkout.session.async_payment_succeeded or ..._failed). Such an order
// stays QUOTED with its payment intent recorded (api/stripe/webhook), and
// counts as taken. Before, after its payment page's 24 hours were up it was
// invisible, and the same days could be sold and charged a second time.
//
// Not a book: a checkout never finished (QUOTED, no payment intent), one
// cancelled or skipped, or a renewal that failed unpaid.
//
// Plain data, no database client: pages, lists and queries all read it.

import type { Prisma } from "@/generated/prisma/client";

/** A finished checkout whose payment has not cleared. */
export const PAYMENT_CLEARING = { status: "QUOTED", stripePaymentIntentId: { not: null } } satisfies Prisma.PrintOrderWhereInput;

/** Orders whose days are taken: use as `OR: HOLDS_DAYS`. */
export const HOLDS_DAYS = [
  { status: { notIn: ["QUOTED", "CANCELED", "SKIPPED", "FAILED"] } },
  { status: "FAILED", stripePaymentIntentId: { not: null } },
  PAYMENT_CLEARING,
] satisfies Prisma.PrintOrderWhereInput[];

/** Orders a list of books shows: everything but checkouts never finished.
 *  Use as `OR: LISTED`. */
export const LISTED = [{ status: { not: "QUOTED" } }, PAYMENT_CLEARING] satisfies Prisma.PrintOrderWhereInput[];

export function isClearing(order: { status: string; stripePaymentIntentId: string | null }): boolean {
  return order.status === "QUOTED" && !!order.stripePaymentIntentId;
}

/** What a list says of a clearing payment. */
export const CLEARING_WORDS = "Payment clearing";
