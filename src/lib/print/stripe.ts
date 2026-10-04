// PAYMENT: Stripe, for taking the money before anything is printed.
//
// Checkout is Stripe's own hosted page - the card never touches this app -
// and a webhook says when it has been paid (src/app/api/stripe/webhook).
// The keys are Andrew's to enter: test keys in development, live ones in
// production. Server-only.

import Stripe from "stripe";

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function stripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe's secret key is not set (STRIPE_SECRET_KEY).");
  client = new Stripe(key);
  return client;
}
