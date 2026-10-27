// A PAID BOOK CANCELLED WITH THE MONEY STILL TAKEN (review, 2026-10-27).
//
// Three ways it happens. The printer cancels a job on its own - Lulu or
// BookVault stop it, and Memari hears of it only as a status (applyJobStatus).
// A refund is tried and fails - the customer's cancel (cancelByCustomer) or
// the admin's Refund (refundOrder). Or Memari asked the printer to stop it
// and the printer's word arrived, but the cancel that asked never got as far
// as saying why: a paid order CANCELED with no reason at all. Before, the
// first was recorded as a plain cancellation - no alert, no refund, the
// admin's Refund button gone ("already cancelled"), and the coach's orders
// page saying "refunded".
//
// Each is an order the admin page lists and can refund, and no page calls
// refunded. A failed refund is due whatever the status - a shipped book the
// admin meant to refund too. Told apart by the order's reason: these words
// are written only from orders.ts and admin.ts, through the constants here.
// A refund made in Stripe's own dashboard clears it at the next Refund press:
// Stripe answers that it is refunded already, and that is taken as done.
//
// Plain data, no database client: pages, lists and queries all read it.

import type { Prisma } from "@/generated/prisma/client";

/** What an order the printer stopped unasked says. */
export const PRINTER_CANCELLED = "The printer cancelled it on its own; the payment has not been refunded.";

/** Inside the reason of an order whose refund was tried and failed. */
export const REFUND_BY_HAND = "the refund failed and must be made by hand";

/** Is a refund owed on this order - its payment still taken? */
export function refundDue(order: { status: string; stripePaymentIntentId: string | null; failureReason: string | null }): boolean {
  if (!order.stripePaymentIntentId) return false;
  const reason = order.failureReason;
  if (reason?.includes(REFUND_BY_HAND)) return true;
  return order.status === "CANCELED" && (reason === null || reason.startsWith(PRINTER_CANCELLED));
}

/** The same, for a query. */
export const REFUND_DUE = {
  stripePaymentIntentId: { not: null },
  OR: [{ failureReason: { contains: REFUND_BY_HAND } }, { status: "CANCELED", OR: [{ failureReason: null }, { failureReason: { startsWith: PRINTER_CANCELLED } }] }],
} satisfies Prisma.PrintOrderWhereInput;

/** `reason` with any earlier failed refund taken off, for writing the next. */
export function withoutRefundFailure(reason: string | null): string | null {
  if (!reason) return reason;
  const at = reason.indexOf(`; ${REFUND_BY_HAND}`);
  return at === -1 ? reason : reason.slice(0, at);
}
