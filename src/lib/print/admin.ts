// WHEN AN ORDER GOES WRONG: retry it, or refund it. Server-only.
//
// A paid order the printer refused is recorded FAILED with its reason
// (orders.ts, fulfilPaidOrder) - the money is taken and no book is coming,
// which a person has to see to. These are what they do about it, from the
// admin page (src/app/app/admin/orders), which only the accounts listed in
// ADMIN_OWNER_IDS can open.

import { prisma } from "@/lib/prisma";
import { fulfilPaidOrder, OrderError } from "./orders";
import { cancelPrintJob } from "./lulu";
import { stripe } from "./stripe";

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

/** Give the money back - all of it - and stop the book if the printer has
 *  not started it. The order is kept, CANCELED, saying when and why. */
export async function refundOrder(orderId: string, why: string): Promise<{ printerCancelled: boolean | null }> {
  const order = await prisma.printOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new OrderError("No such order.");
  if (!order.stripePaymentIntentId) throw new OrderError("This order was never paid for - nothing to refund.");
  if (order.status === "CANCELED") throw new OrderError("This order is already cancelled.");

  // The printer first: a book stopped is a book Lulu does not charge us for.
  let printerCancelled: boolean | null = null;
  if (order.luluPrintJobId && !["SHIPPED", "DELIVERED"].includes(order.status)) {
    try {
      await cancelPrintJob(order.luluPrintJobId);
      printerCancelled = true;
    } catch {
      printerCancelled = false;
    }
  }
  // One refund per order, however many times this is pressed.
  await stripe().refunds.create({ payment_intent: order.stripePaymentIntentId }, { idempotencyKey: `refund-${order.id}` });
  await prisma.printOrder.update({
    where: { id: order.id },
    data: {
      status: "CANCELED",
      autoRenew: false,
      renewsAt: null,
      failureReason: `Refunded ${new Date().toISOString().slice(0, 10)}: ${why}${printerCancelled === false ? " (the printer had already started it)" : ""}`,
    },
  });
  return { printerCancelled };
}
