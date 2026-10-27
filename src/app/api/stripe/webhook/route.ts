// POST /api/stripe/webhook - Stripe saying an order has been paid.
//
// Signed with STRIPE_WEBHOOK_SECRET; an unsigned or wrongly signed body is
// refused before anything is read from it. Paid means: record it, then send
// the book to print (src/lib/print/orders.ts, fulfilPaidOrder). Stripe
// retries a delivery that is not answered 2xx, and fulfilPaidOrder is safe
// to repeat.
//
// A PAYMENT THAT TAKES DAYS (2026-10-26): with a US bank account, Checkout
// completes "unpaid" and the money settles days later. The order's days are
// taken at once (recordClearingPayment; holdsDays.ts), the book is sent when
// .async_payment_succeeded comes, and .async_payment_failed ends the order
// with nothing taken and tells the payer. The production endpoint must be
// subscribed to all three checkout.session events (scripts/setup-webhooks.mts).

import type Stripe from "stripe";
import { stripe } from "@/lib/print/stripe";
import { failClearingPayment, fulfilPaidOrder, recordClearingPayment } from "@/lib/print/orders";
import { appUrl } from "@/lib/print/fileUrls";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  const raw = await request.text();
  if (!secret || !signature) return new Response("Not signed.", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch {
    return new Response("Bad signature.", { status: 400 });
  }

  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (orderId) await failClearingPayment(orderId);
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    // Finished, but the money is still on its way: hold the days, print later.
    if (event.type === "checkout.session.completed" && session.payment_status === "unpaid" && orderId && intentId) {
      await recordClearingPayment(orderId, intentId, session.customer_details?.email);
    }
    if (session.payment_status === "paid" && orderId) {
      const paymentIntentId = intentId;
      // A guest's order has no email until now: they gave it on Stripe's
      // page (2026-10-15, printActions.ts). The printer and our emails both
      // need it, so it goes on before the book is sent.
      const email = session.customer_details?.email;
      if (email) await prisma.printOrder.updateMany({ where: { id: orderId, contactEmail: null }, data: { contactEmail: email } });
      // The card is kept only where renewals were asked for.
      const order = await prisma.printOrder.findUnique({ where: { id: orderId }, select: { autoRenew: true } });
      let paymentMethodId: string | undefined;
      if (order?.autoRenew && paymentIntentId) {
        // ONLY A CARD RENEWS (review, 2026-10-26): a renewal is charged off
        // session and must succeed at once. A bank account answers
        // "processing" and settles days later, which renewOne would record
        // as nothing charged while the debit went through - money taken,
        // no book. Without a card the renewal says so and charges nothing.
        const intent = await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] });
        const method = intent.payment_method;
        paymentMethodId = method && typeof method !== "string" && method.type === "card" ? method.id : undefined;
      }
      try {
        await fulfilPaidOrder(orderId, { paymentIntentId, paymentMethodId }, appUrl(new URL(request.url).origin));
      } catch (error) {
        // Recorded on the order as FAILED with its reason - the money is
        // taken and the book is not printing, which a person must see to.
        // Answered 200 all the same: a retry would find it already failed.
        console.error(`[print] order ${orderId} paid but not sent to print:`, error);
      }
    }
  }
  return new Response("ok", { status: 200 });
}
