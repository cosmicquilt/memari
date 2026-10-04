// POST /api/stripe/webhook - Stripe saying an order has been paid.
//
// Signed with STRIPE_WEBHOOK_SECRET; an unsigned or wrongly signed body is
// refused before anything is read from it. Paid means: record it, then send
// the book to print (src/lib/print/orders.ts, fulfilPaidOrder). Stripe
// retries a delivery that is not answered 2xx, and fulfilPaidOrder is safe
// to repeat.

import type Stripe from "stripe";
import { stripe } from "@/lib/print/stripe";
import { fulfilPaidOrder } from "@/lib/print/orders";
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

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (session.payment_status === "paid" && orderId) {
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      // The card is kept only where renewals were asked for.
      const order = await prisma.printOrder.findUnique({ where: { id: orderId }, select: { autoRenew: true } });
      let paymentMethodId: string | undefined;
      if (order?.autoRenew && paymentIntentId) {
        const intent = await stripe().paymentIntents.retrieve(paymentIntentId);
        paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
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
