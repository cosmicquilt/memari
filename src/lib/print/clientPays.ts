// A COACH'S CLIENT PAYS FOR THEIR OWN BOOK (memari. for businesses,
// 2026-10-22: "both stripe connect and no markup options"). The coach
// chooses, in their business's settings:
//
//   - Memari's price: the client pays exactly what the coach would have.
//     Memari takes the payment as for any order; nothing to set up.
//   - Memari's price plus the coach's share (markupCents): the payment is a
//     Stripe Connect DESTINATION CHARGE to the coach's Express account.
//     Memari keeps its own price (the book and the post), the card fee on
//     the share - Stripe charges the whole fee to Memari - and PAYOUT_COST
//     towards Stripe's cost of paying the coach; the rest goes to the coach.
//     A refund takes the coach's share back (reverse_transfer) and returns
//     Memari's (refund_application_fee).
//
// Coaches in the US, UK, EEA, Canada and Switzerland (PAYOUT_COUNTRIES):
// where Stripe pays out across borders without an arrangement with its
// sales team, for a platform in one of them, by this very flow - a
// destination charge without on_behalf_of (docs.stripe.com/connect/
// cross-border-payouts, read 2026-10-23).
//
// The money in plain functions, so a test reads every number without
// Stripe (clientPays.test.mts); orders.ts uses them. Server-only.

import type Stripe from "stripe";
import { CARD_FEE_SHARE, type Price } from "./pricing";
import { SHIPPING_LEVELS, leadDays, suggestedStart } from "./orderRange";

/** What Memari keeps of each share towards Stripe's cost of paying coaches
 *  (Connect pricing, read 2026-10-23: $2 for each coach in a month they are
 *  paid, 0.25% + 25c a payout, from 0.25% more across a border, and the
 *  currency's conversion). Andrew's call (2026-10-23: "go on with your
 *  recommendation" - a fixed amount a book, 50c to $1): the top of it, as
 *  payouts are monthly (payouts.ts), one $2 and one payout fee a month. */
export const PAYOUT_COST_CENTS = 100;
/** A share is at least this - so what reaches the coach is worth sending -
 *  and at most the most. */
export const MIN_SHARE_CENTS = 300;
export const MAX_SHARE_CENTS = 20000;

/** Where a coach can be paid their share: the regions Stripe pays out
 *  across without its sales team (US, UK, EEA, Canada, Switzerland). */
export const PAYOUT_COUNTRIES: readonly string[] = (
  "US CA GB CH AT BE BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE"
).split(" ");

/** The day a client's next book starts: the one their schedule gives, or,
 *  when that has already gone, the first day a book can reach them -
 *  allowing for the longest post, from abroad, whatever the binding, so the
 *  dates the page shows are the dates any binding charges for - on their
 *  journal's week start. Never days already past (review, 2026-10-23; the
 *  coach's order screen keeps a start of today or later as it is too). */
export function clientBookStart(o: { startISO: string; today: Date; weekStartDay: number }): string {
  if (o.startISO >= o.today.toISOString().slice(0, 10)) return o.startISO;
  // the slowest post there is, from abroad - standard mail, 31 days (third
  // review: it had been ground, 24, and mail is offered first)
  const slowest = SHIPPING_LEVELS.reduce((a, b) => (leadDays(b, true) > leadDays(a, true) ? b : a));
  return suggestedStart(o.today, slowest, true, o.weekStartDay).toISOString().slice(0, 10);
}

/** The coach's share on the book's line: the client sees one book price. */
export function withMarkup(price: Price, markupCents: number): Price {
  const share = Math.max(0, Math.round(markupCents));
  return { ...price, bookCents: price.bookCents + share, totalCents: price.totalCents + share };
}

/** How a payment with a share splits: what Memari keeps (Stripe's
 *  application fee) and what reaches the coach. Kept back from the share:
 *  the card fee on it, rounded up, and PAYOUT_COST_CENTS; never more than
 *  the share itself. */
export function destinationSplit(totalCents: number, markupCents: number): { applicationFeeCents: number; coachCents: number } {
  const share = Math.max(0, Math.round(markupCents));
  const kept = Math.min(share, Math.ceil(share * CARD_FEE_SHARE) + PAYOUT_COST_CENTS);
  return { applicationFeeCents: totalCents - share + kept, coachCents: share - kept };
}

/** What the coach receives of a share, after what is kept back from it: for
 *  the settings screen's "you receive" and their earnings. */
export const coachReceives = (markupCents: number) => destinationSplit(markupCents, markupCents).coachCents;

export type ClientPayer = {
  /** The client's address for Stripe's receipt and our emails. */
  email: string;
  markupCents: number;
  /** The coach's Connect account; needed for a share. */
  destination: string | null;
  successUrl: string;
  cancelUrl: string;
  /** The total the client was shown; the order is refused if the price
   *  has moved since (startCheckout). */
  expectTotalCents?: number;
  /** When the client's dates were worked out from the books already held:
   *  a book paid for those days after this refuses the page
   *  (closeOverlappingPages). */
  startedAt?: Date;
};

/** A share needs somewhere to go: refused before anything is made. */
export function payerProblem(payer: ClientPayer): string | null {
  if (!payer.email) return "There is no email address to send the receipt to.";
  if (payer.markupCents > 0 && !payer.destination) return "This coach's payouts are not set up, so their price cannot be charged yet.";
  return null;
}

/** Stripe's payment page for a client's order: no saved customer (the
 *  client has no account), the receipt to them, never a saved card (no
 *  auto-renew for a client's book), and with a share, the destination
 *  charge. */
export function clientSessionParams(o: {
  orderId: string;
  title: string;
  description: string;
  shippingName: string;
  price: Price;
  payer: ClientPayer;
  /** When the page stops taking payment (seconds): under the 24 hours an
   *  open page counts as holding its days (renewals.ts, clientOrders.ts). */
  expiresAt: number;
}): Stripe.Checkout.SessionCreateParams {
  const split = o.payer.markupCents > 0 && o.payer.destination ? destinationSplit(o.price.totalCents, o.payer.markupCents) : null;
  return {
    mode: "payment",
    expires_at: o.expiresAt,
    customer_email: o.payer.email,
    client_reference_id: o.orderId,
    metadata: { orderId: o.orderId, paidByClient: "true" },
    line_items: [
      { quantity: 1, price_data: { currency: "usd", unit_amount: o.price.bookCents, product_data: { name: `${o.title} - printed journal`, description: o.description } } },
      { quantity: 1, price_data: { currency: "usd", unit_amount: o.price.shippingCents, product_data: { name: `Shipping - ${o.shippingName}` } } },
    ],
    payment_intent_data: {
      metadata: { orderId: o.orderId, paidByClient: "true" },
      ...(split ? { application_fee_amount: split.applicationFeeCents, transfer_data: { destination: o.payer.destination! } } : {}),
    },
    success_url: o.payer.successUrl,
    cancel_url: o.payer.cancelUrl,
  };
}

/** A refund: with a share, the coach's comes back and so does Memari's
 *  fee; otherwise a plain refund. The idempotency key is the caller's. */
export function refundParams(order: { stripePaymentIntentId: string; markupCents: number; payoutAccountId: string | null }): Stripe.RefundCreateParams {
  return {
    payment_intent: order.stripePaymentIntentId,
    ...(order.markupCents > 0 && order.payoutAccountId ? { reverse_transfer: true, refund_application_fee: true } : {}),
  };
}
