// WHEN AN ORDER GOES WRONG: retry it, or refund it. Server-only.
//
// A paid order the printer refused is recorded FAILED with its reason
// (orders.ts, fulfilPaidOrder) - the money is taken and no book is coming,
// which a person has to see to. These are what they do about it, from the
// admin page (src/app/app/admin/orders), which only the accounts listed in
// ADMIN_OWNER_IDS can open.

import { prisma } from "@/lib/prisma";
import { fulfilPaidOrder, OrderError } from "./orders";
import { printerFor } from "./printer";
import { stripe } from "./stripe";
import { refundParams } from "./clientPays";
import { REFUND_BY_HAND, refundDue, withoutRefundFailure } from "./refundDue";
import { isClearing } from "./holdsDays";
import type Stripe from "stripe";

/** Is this account one of the people who run Memari? ADMIN_OWNER_IDS is a
 *  comma-separated list of Clerk user ids, set in the environment. */
export function isAdmin(ownerId: string | null | undefined): boolean {
  if (!ownerId) return false;
  const ids = (process.env.ADMIN_OWNER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return ids.includes(ownerId);
}

/** Paid, not with the printer: send it again. For a FAILED order that was
 *  paid for, or one stuck at PAID. */
export async function retryOrder(orderId: string, origin: string): Promise<void> {
  const order = await prisma.printOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new OrderError("No such order.");
  if (!order.stripePaymentIntentId) throw new OrderError("This order was never paid for - nothing to send.");
  if (order.status !== "FAILED" && order.status !== "PAID") throw new OrderError(`This order is ${order.status}, not waiting to be sent.`);
  await prisma.printOrder.update({
    where: { id: order.id },
    data: { status: "PAID", failureReason: null, luluPrintJobId: null, luluStatus: null },
  });
  await fulfilPaidOrder(order.id, { paymentIntentId: order.stripePaymentIntentId, paymentMethodId: order.stripePaymentMethodId ?? undefined }, origin);
}

export type RefundDeps = {
  /** Stop the job; throws if the printer has begun it. */
  stopAtPrinter: (printerId: string, jobId: string) => Promise<void>;
  refund: (params: Stripe.RefundCreateParams, idempotencyKey: string) => Promise<void>;
};

export function liveRefundDeps(): RefundDeps {
  return {
    stopAtPrinter: (printerId, jobId) => printerFor(printerId).cancel(jobId),
    refund: async (params, idempotencyKey) => {
      await stripe().refunds.create(params, { idempotencyKey });
    },
  };
}

/** Give the money back - all of it - and stop the book if the printer has
 *  not started it. The order is kept, CANCELED, saying when and why. An
 *  order already CANCELED is refunded only when its money is still taken
 *  (refundDue.ts): the printer stopped it unasked, or a refund failed. */
export async function refundOrder(orderId: string, why: string, deps: RefundDeps = liveRefundDeps()): Promise<{ printerCancelled: boolean | null }> {
  const order = await prisma.printOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new OrderError("No such order.");
  if (!order.stripePaymentIntentId) throw new OrderError("This order was never paid for - nothing to refund.");
  // A bank payment still clearing has taken nothing yet: the bank's answer
  // ends it either way (failClearingPayment, or the book is ordered), and a
  // refund tried now could only fail and leave it looking owed for ever.
  if (isClearing(order)) throw new OrderError("This bank payment has not cleared yet, so there is nothing to refund. If it clears, refund it then; if it fails, nothing was taken.");
  const due = refundDue(order);
  if (order.status === "CANCELED" && !due) throw new OrderError("This order is already cancelled.");

  // The printer first: a book stopped is a book Lulu does not charge us for.
  // Written down before asking, like the customer's cancel (orders.ts), so
  // the printer's word on it is known for ours.
  let printerCancelled: boolean | null = null;
  if (order.luluPrintJobId && !["SHIPPED", "DELIVERED", "CANCELED"].includes(order.status)) {
    await prisma.printOrder.update({ where: { id: order.id }, data: { cancelAskedAt: new Date() } });
    try {
      await deps.stopAtPrinter(order.printer, order.luluPrintJobId);
      printerCancelled = true;
    } catch {
      printerCancelled = false;
    }
  }
  // One refund per order, however many times this is pressed - with a
  // coach's share taken back from them (clientPays.ts). A refund OWED after
  // one failed takes a key of its own, new each time the order changes:
  // Stripe answers a key it has seen with the same answer for a day, so the
  // old key would only fail again. Two at once still share a key, and as
  // every refund is the whole payment Stripe refuses a second in any case -
  // but a group's book (groupOrders.ts) is refunded by its own part, which
  // the key alone keeps to once.
  const key = due ? `refund-${order.id}-due-${order.updatedAt.getTime()}` : `refund-${order.id}`;
  const params = refundParams({ stripePaymentIntentId: order.stripePaymentIntentId, markupCents: order.markupCents, payoutAccountId: order.payoutAccountId, batchId: order.batchId, totalCents: order.totalCents });
  const day = new Date().toISOString().slice(0, 10);
  let already = false;
  try {
    await deps.refund(params, key);
  } catch (error) {
    // REFUNDED ALREADY - in Stripe's dashboard, or by a call whose answer was
    // lost: nothing is owed, and the order says so like any refund. Without
    // this a refund made by hand stayed "due" for ever (review, 2026-10-27).
    if ((error as { code?: unknown } | null)?.code === "charge_already_refunded") {
      already = true;
    } else {
      // SAID ON THE ORDER, every time - which also changes it, so the next
      // press has a new key. No book is coming (stopped, never sent, refused,
      // or cancelled already): CANCELED, the refund due. A book still coming
      // or come keeps its status, and the refund is due all the same. Either
      // way it renews no more, as a refund that went through would not.
      const failed = error instanceof Error ? error.message : String(error);
      const noBook = order.status === "CANCELED" || order.status === "PAID" || order.status === "FAILED" || printerCancelled === true || !order.luluPrintJobId;
      const failureReason = `${withoutRefundFailure(order.failureReason) ?? `Refund tried ${day}`}; ${REFUND_BY_HAND}: ${failed}`;
      await prisma.printOrder.update({ where: { id: order.id }, data: noBook ? { status: "CANCELED", autoRenew: false, renewsAt: null, failureReason } : { autoRenew: false, renewsAt: null, failureReason } });
      throw error;
    }
  }
  await prisma.printOrder.update({
    where: { id: order.id },
    data: {
      status: "CANCELED",
      autoRenew: false,
      renewsAt: null,
      failureReason: `Refunded ${day}: ${why}${printerCancelled === false ? " (the printer would not stop it)" : ""}${already ? " (Stripe had refunded it already)" : ""}`,
    },
  });
  return { printerCancelled };
}
