// WHAT A BOOK COSTS THE CUSTOMER, from what it costs us.
//
// With worldwide shipping, three bindings and any number of days, no price
// list can be right: the page count, the binding and the address all move
// Lulu's charge. So the price is Lulu's own quote marked up - the book at a
// margin, the post passed on at cost - and shown before anyone pays.
//
// PLACEHOLDERS, Andrew's to set (2026-10-04): the margin and the floor
// below. The business model's aim is ~35-40% contribution after processing
// and reprints (memory: memari-business-model), "do not cut margin to
// launch". Stripe's fee comes out of the margin, so it is priced in.

import type { PrintCost } from "./lulu";

/** The share of the book's price kept after Lulu's charge for printing it. */
export const BOOK_MARGIN = 0.45;
/** No book costs less than this, however thin. */
export const MIN_BOOK_PRICE_CENTS = 1200;
/** Stripe's card fee, roughly: 2.9% + 30c, more for cards from abroad. */
const CARD_FEE_SHARE = 0.039;
const CARD_FEE_FIXED_CENTS = 30;

export type Price = {
  /** The book itself. */
  bookCents: number;
  /** The post, at what Lulu charges. */
  shippingCents: number;
  totalCents: number;
  currency: "USD";
  /** What Lulu will charge us, tax included. Kept on the order. */
  costCents: number;
};

/** Up to the next whole dollar, less a cent: 23.40 becomes 23.99. */
function charmUp(cents: number): number {
  return Math.ceil((cents + 1) / 100) * 100 - 1;
}

/**
 * The customer's price for one book from Lulu's quote. The book carries
 * everything Lulu charges except the post - printing, the fulfilment fee
 * and any tax - grossed up so that after the card fee BOOK_MARGIN of it is
 * left; the post is passed on at Lulu's charge.
 */
export function priceFromCost(cost: PrintCost): Price {
  const bookCost = cost.totalCents - cost.shippingCents;
  // The card fee is on the WHOLE charge, post included - and the post is
  // passed on at cost, so the book carries the fee on it too.
  const raw = (bookCost + CARD_FEE_FIXED_CENTS + cost.shippingCents * CARD_FEE_SHARE) / (1 - BOOK_MARGIN - CARD_FEE_SHARE);
  const bookCents = Math.max(MIN_BOOK_PRICE_CENTS, charmUp(raw));
  return {
    bookCents,
    shippingCents: cost.shippingCents,
    totalCents: bookCents + cost.shippingCents,
    currency: "USD",
    costCents: cost.totalCents,
  };
}

/** $23.99 - one way of writing money, for the order screen and receipts. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
