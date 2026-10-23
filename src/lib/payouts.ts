// A COACH'S PAYOUTS - Stripe Connect Express (2026-10-22), for the share
// a coach adds to the price of a book their client pays for
// (src/lib/print/clientPays.ts).
//
// The coach connects once, on Stripe's own pages: the app makes their
// Express account (or reuses it) and sends them to Stripe's onboarding;
// coming back, it asks Stripe whether the account can take payments and
// pay out, and remembers the answer (Business.payoutsReady). Their Express
// dashboard - payouts, tax forms - is a link away. Connect itself is
// switched on in Memari's Stripe dashboard (Andrew's); until it is,
// creating an account fails and the coach is told so.
//
// SERVER-ONLY.

import { prisma } from "@/lib/prisma";
import { PAYOUT_COUNTRIES } from "@/lib/print/clientPays";
import { stripe, stripeConfigured } from "@/lib/print/stripe";

export class PayoutsError extends Error {}

/** Stripe's onboarding page for the business's account, made if need be -
 *  in the coach's own country (2026-10-23: "I would like international
 *  coaches as well"), one of PAYOUT_COUNTRIES, and paid out monthly so
 *  Stripe's $2-a-month and per-payout costs come once a month. */
export async function payoutsSetupUrl(businessId: string, ownerEmail: string | null, origin: string, country: string): Promise<string> {
  if (!stripeConfigured()) throw new PayoutsError("Payments are not switched on on this site yet, so payouts cannot be set up.");
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  let account = business.stripeAccountId;
  if (!account) {
    if (!PAYOUT_COUNTRIES.includes(country)) throw new PayoutsError("Payouts are not available in that country yet. Your clients can still pay Memari's price.");
    try {
      const made = await stripe().accounts.create({
        type: "express",
        country,
        email: ownerEmail ?? undefined,
        business_profile: { name: business.name, product_description: "Printed planners for my coaching clients, made through memari." },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        settings: { payouts: { schedule: { interval: "monthly", monthly_anchor: 1 } } },
        metadata: { businessId },
      });
      account = made.id;
    } catch (error) {
      console.error("[payouts] Stripe would not make an account:", error);
      throw new PayoutsError("Stripe would not set up payouts just now. If it keeps happening, tell us.");
    }
    await prisma.business.update({ where: { id: businessId }, data: { stripeAccountId: account } });
  }
  const link = await stripe().accountLinks.create({
    account,
    type: "account_onboarding",
    refresh_url: `${origin}/app/business/settings?payouts=again`,
    return_url: `${origin}/app/business/settings?payouts=back`,
  });
  return link.url;
}

/** Ask Stripe whether the account can take payments and pay out, and keep
 *  the answer. Without an account, or Stripe, what is known stands - and
 *  so it does if Stripe takes longer than a few seconds, so a page that
 *  asks never hangs on it (second review, 2026-10-23). */
export async function refreshPayouts(businessId: string): Promise<boolean> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { stripeAccountId: true, payoutsReady: true } });
  if (!business.stripeAccountId || !stripeConfigured()) return business.payoutsReady;
  try {
    const account = await stripe().accounts.retrieve(business.stripeAccountId, {}, { timeout: 4000, maxNetworkRetries: 0 });
    const ready = !!account.charges_enabled && !!account.payouts_enabled;
    if (ready !== business.payoutsReady) await prisma.business.update({ where: { id: businessId }, data: { payoutsReady: ready } });
    return ready;
  } catch (error) {
    console.error("[payouts] Stripe would not say how the account stands:", error);
    return business.payoutsReady;
  }
}

/** Forget an account Stripe has not been given details for yet - made in
 *  the wrong country, say - so payouts can start again from the country
 *  question. An account with details is never removed from here. */
export async function discardUnfinishedPayouts(businessId: string): Promise<void> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { stripeAccountId: true } });
  if (!business.stripeAccountId) return;
  if (stripeConfigured()) {
    const account = await stripe().accounts.retrieve(business.stripeAccountId, {}, { timeout: 8000 });
    if (account.details_submitted) throw new PayoutsError("Stripe already has your details for this account. To change its country, tell us and we'll help.");
    try {
      await stripe().accounts.del(business.stripeAccountId);
    } catch (error) {
      console.error("[payouts] could not remove an unfinished account:", error);
    }
  }
  await prisma.business.update({ where: { id: businessId }, data: { stripeAccountId: null, payoutsReady: false } });
}

/** The coach's own Stripe dashboard: payouts, their bank, tax forms. */
export async function payoutsDashboardUrl(businessId: string): Promise<string> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { stripeAccountId: true } });
  if (!business.stripeAccountId || !stripeConfigured()) throw new PayoutsError("Payouts are not set up.");
  return (await stripe().accounts.createLoginLink(business.stripeAccountId)).url;
}

/** What a client pays on top of Memari's price, now: the coach's share
 *  only while their payouts can take it, else nothing - a client is never
 *  stopped from ordering because Stripe wants something from their coach,
 *  and the coach's settings say their share is not being added. */
export function shareInForce(business: { markupCents: number; payoutsReady: boolean; stripeAccountId: string | null }): { markupCents: number; destination: string | null } {
  return business.markupCents > 0 && business.payoutsReady && business.stripeAccountId
    ? { markupCents: business.markupCents, destination: business.stripeAccountId }
    : { markupCents: 0, destination: null };
}
