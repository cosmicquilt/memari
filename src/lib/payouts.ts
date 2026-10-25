// A COACH'S PAYOUTS - Stripe Connect, for the share a coach adds to the
// price of a book their client pays for (src/lib/print/clientPays.ts).
//
// The coach connects once, on Stripe's own pages: the app makes their
// connected account (or reuses it) and sends them to Stripe's onboarding;
// coming back, it asks Stripe whether the account can receive their share
// and pay it out, and remembers the answer (Business.payoutsReady). Their
// Express dashboard - payouts, their bank - is a link away. Memari pays
// Stripe's fees and covers losses on every coach's account.
//
// ACCOUNTS v2 (2026-10-25). The first run against Andrew's sandbox was
// refused: "Stripe no longer recommends Accounts v1 for new Connect
// integrations." Andrew chose to move rather than switch v1 back on. What
// the sandbox showed, beyond the docs:
// - a US coach's account can receive transfers alone; anywhere else Stripe
//   refuses transfers "without the configuration.merchant.capabilities.
//   card_payments capability", so a coach outside the US also gets card
//   payments (unused: the charges are Memari's, see clientPays.ts);
// - payouts can be set to monthly before onboarding, through Balance
//   Settings (Accounts v2 has no payout fields);
// - the v1 view of a v2 account still answers details_submitted;
// - a login link is refused until onboarding is done;
// - closing needs the account's configurations named;
// - an account that receives transfers must have a contact email.
// The charges and refunds in clientPays.ts are unchanged: a v2 account's
// id is an acct_ id like any other.
//
// SERVER-ONLY.

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { PAYOUT_COUNTRIES } from "@/lib/print/clientPays";
import { stripe, stripeConfigured } from "@/lib/print/stripe";

export class PayoutsError extends Error {}

/** Where Stripe lets an account receive transfers without card payments. */
const TRANSFERS_ALONE = ["US"];

/** The connected account for a coach in `country`: an Express dashboard,
 *  Memari collecting fees and covering losses, able to receive the
 *  destination charge's transfer - and, outside the US, card payments too,
 *  which Stripe requires there. */
export function coachAccountParams(o: { country: string; name: string; email: string; businessId: string }): Stripe.V2.Core.AccountCreateParams {
  return {
    display_name: o.name,
    contact_email: o.email,
    dashboard: "express",
    identity: { country: o.country },
    defaults: {
      responsibilities: { fees_collector: "application", losses_collector: "application" },
      profile: { product_description: "Printed planners for my coaching clients, made through memari." },
    },
    configuration: {
      recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
      ...(TRANSFERS_ALONE.includes(o.country) ? {} : { merchant: { capabilities: { card_payments: { requested: true } } } }),
    },
    metadata: { businessId: o.businessId },
    include: ["configuration.recipient"],
  };
}

/** Paid out once a month, on the 1st, so Stripe's per-payout cost comes
 *  once a month. Best effort: the account works on Stripe's own schedule
 *  if this is refused. */
async function payMonthly(account: string): Promise<void> {
  try {
    await stripe().balanceSettings.update(
      { payments: { payouts: { schedule: { interval: "monthly", monthly_payout_days: [1] } } } },
      { stripeAccount: account, timeout: 4000, maxNetworkRetries: 0 }
    );
  } catch (error) {
    console.error("[payouts] Stripe would not set monthly payouts:", error);
  }
}

/** Stripe's onboarding page for the business's account, made if need be -
 *  in the coach's own country (2026-10-23: "I would like international
 *  coaches as well"), one of PAYOUT_COUNTRIES. */
export async function payoutsSetupUrl(businessId: string, ownerEmail: string | null, origin: string, country: string): Promise<string> {
  if (!stripeConfigured()) throw new PayoutsError("Payments are not switched on on this site yet, so payouts cannot be set up.");
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  let account = business.stripeAccountId;
  if (!account) {
    if (!PAYOUT_COUNTRIES.includes(country)) throw new PayoutsError("Payouts are not available in that country yet. Your clients can still pay Memari's price.");
    // Stripe requires one: someone signed in by phone may have none
    if (!ownerEmail) throw new PayoutsError("Stripe needs an email address for your payouts. Add one to your account, then try again.");
    let made: Stripe.V2.Core.Account;
    try {
      made = await stripe().v2.core.accounts.create(coachAccountParams({ country, name: business.name, email: ownerEmail, businessId }));
    } catch (error) {
      console.error("[payouts] Stripe would not make an account:", error);
      throw new PayoutsError("Stripe would not set up payouts just now. If it keeps happening, tell us.");
    }
    // An account Stripe already says can never receive a share is closed
    // at once, rather than kept for onboarding that cannot help.
    const transfers = made.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
    if (transfers === "unsupported" || transfers === "rejected") {
      await stripe()
        .v2.core.accounts.close(made.id, { applied_configurations: made.applied_configurations })
        .catch((error) => console.error("[payouts] could not close an unusable account:", error));
      throw new PayoutsError("Stripe cannot pay coaches in that country through memari yet. Your clients can still pay Memari's price.");
    }
    account = made.id;
    await prisma.business.update({ where: { id: businessId }, data: { stripeAccountId: account } });
    await payMonthly(account);
  }
  const link = await stripe().v2.core.accountLinks.create({
    account,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        refresh_url: `${origin}/app/business/settings?payouts=again`,
        return_url: `${origin}/app/business/settings?payouts=back`,
      },
    },
  });
  return link.url;
}

/** Ask Stripe whether the account can receive a share and pay it out, and
 *  keep the answer. Without an account, or Stripe, what is known stands -
 *  and so it does if Stripe takes longer than a few seconds, so a page
 *  that asks never hangs on it (second review, 2026-10-23). */
export async function refreshPayouts(businessId: string): Promise<boolean> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { stripeAccountId: true, payoutsReady: true } });
  if (!business.stripeAccountId || !stripeConfigured()) return business.payoutsReady;
  try {
    const account = await stripe().v2.core.accounts.retrieve(business.stripeAccountId, { include: ["configuration.recipient"] }, { timeout: 4000, maxNetworkRetries: 0 });
    const balance = account.configuration?.recipient?.capabilities?.stripe_balance;
    const ready = !account.closed && balance?.stripe_transfers?.status === "active" && balance?.payouts?.status === "active";
    if (ready !== business.payoutsReady) {
      await prisma.business.update({ where: { id: businessId }, data: { payoutsReady: ready } });
      // again on turning ready, in case it was refused at the start
      if (ready) await payMonthly(business.stripeAccountId);
    }
    return ready;
  } catch (error) {
    console.error("[payouts] Stripe would not say how the account stands:", error);
    return business.payoutsReady;
  }
}

/** Forget an account Stripe has not been given details for yet - made in
 *  the wrong country, say - closing it, so payouts can start again from
 *  the country question. An account with details is never closed from
 *  here. */
export async function discardUnfinishedPayouts(businessId: string): Promise<void> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { stripeAccountId: true } });
  if (!business.stripeAccountId) return;
  if (stripeConfigured()) {
    const id = business.stripeAccountId;
    const [asV1, account] = await Promise.all([
      stripe().accounts.retrieve(id, {}, { timeout: 8000 }),
      stripe().v2.core.accounts.retrieve(id, { include: ["configuration.recipient"] }, { timeout: 8000 }),
    ]);
    const transfers = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
    if (asV1.details_submitted || transfers === "active") throw new PayoutsError("Stripe already has your details for this account. To change its country, tell us and we'll help.");
    if (!account.closed) {
      try {
        await stripe().v2.core.accounts.close(id, { applied_configurations: account.applied_configurations });
      } catch (error) {
        console.error("[payouts] could not close an unfinished account:", error);
      }
    }
  }
  await prisma.business.update({ where: { id: businessId }, data: { stripeAccountId: null, payoutsReady: false } });
}

/** The coach's own Stripe dashboard: payouts, their bank. Stripe refuses
 *  it until onboarding is done, so the settings show it only when ready. */
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
