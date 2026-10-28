// A coach's client orders their own book from their page (memari. for
// businesses, 2026-10-22), when the coach has chosen "Your clients" under
// Who pays for books. The book is the one the coach would have ordered for
// them: their journal (the coach's, built from the template), their next
// dates (the day after their last book, or their first start, for as long
// as each of their books runs - clientOrderDefaultsFor), to the address on
// their page. They choose the binding and the post; the price is Memari's,
// with the coach's share on top while the coach's payouts can take it
// (payouts.ts shareInForce), and Stripe takes the payment (clientPays.ts).
//
// Everything is looked up from the link's token each time; the page sends
// only the binding, the post, an email for the receipt, and the total it
// showed - which must still be the price, or nothing is charged.
//
// After the review of 2026-10-23 (an adversarial pass over this code):
//   - never a book for days already gone: a next start in the past (a
//     client who lapsed, a first start that has passed) becomes the first
//     start a book can reach them by, on their journal's week start - as
//     the coach's own order screen does (OrderDialog.tsx);
//   - the coach's payouts are asked of Stripe before a share is quoted or
//     charged, so a coach Stripe has since cleared earns their share and
//     one it has restricted does not block their clients;
//   - at most CHECKOUTS_PER_HOUR payment pages an hour for one client: each
//     builds the book's two PDFs and a Stripe session.
//
// After the second review (2026-10-23):
//   - the start no longer depends on the binding (clientBookStart allows
//     for the longest post), so the dates shown are the dates charged, and
//     the page sends the start it showed with the total;
//   - a new payment page closes the client's earlier open ones, so only one
//     can be paid; if an earlier one has just been paid (its payment still
//     landing), no new one is made;
//   - the hour's limit counts every payment page opened, whatever became
//     of it, and a few-a-minute limit (on this server) covers prices and
//     attempts that stop before a page is made.
//
// After the third review (2026-10-23):
//   - a replaced page stays an unpaid checkout (QUOTED) with its link to
//     Stripe cut, never "cancelled": a cancelled order reads as money taken
//     and given back, keeps its files a year and makes a guest a customer;
//   - only pages OLDER than the new one are closed, after the new one
//     exists - two Pay presses at once leave one payable page, the newer;
//   - the limiter checks a token's shape before keeping anything for it,
//     and lets old entries go rather than forgetting every link at once.
//
// SERVER-ONLY.

import { clientOrderDefaultsFor, shippableAddress } from "@/lib/business";
import { clientForToken, tokenShapeOk } from "@/lib/clientPortal";
import { sendableEmail } from "@/lib/clientLinkEmail";
import { prisma } from "@/lib/prisma";
import { refreshPayouts, shareInForce } from "@/lib/payouts";
import { clientBookStart, withMarkup } from "@/lib/print/clientPays";
import { OrderError, rangeLabel } from "@/lib/print/orderBook";
import { PriceMovedError, orderingConfigured, quoteOrder, startCheckout, type OrderInput, type Quote } from "@/lib/print/orders";
import { stripe, stripeConfigured } from "@/lib/print/stripe";
import type { ShippingLevel } from "@/lib/print/orderRange";
import { orderableBindings } from "@/lib/print/printer";
import type { Binding, PaperColour } from "@/lib/print/products";

/** What the page shows: the order form, or why there is none. */
export type PortalOrdering =
  | { open: true; next: { startISO: string; days: number; label: string }; bindings: Binding[]; email: string | null; withShare: boolean }
  | { open: false; why: string | null };

const DAY = 24 * 60 * 60 * 1000;
/** Payment pages one client may open in an hour (a guest coach's limit is
 *  the same, printActions.ts GUEST_CHECKOUTS_PER_HOUR). */
const CHECKOUTS_PER_HOUR = 5;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** A few asks a minute for one link, on this server: prices and attempts
 *  each build the book and ask the printer before anything is stored. A
 *  serverless instance keeps it only while it lives - a brake on a burst,
 *  not a wall; CHECKOUTS_PER_HOUR, in the database, is the wall. */
const recentAsks = new Map<string, number[]>();
function tooMany(token: string, kind: string, max: number, windowMs: number): boolean {
  // nothing is kept for what is not a token's shape (it is refused next)
  if (!tokenShapeOk(token)) return false;
  const key = `${kind}:${token}`;
  const now = Date.now();
  const kept = (recentAsks.get(key) ?? []).filter((t) => now - t < windowMs);
  if (kept.length >= max) {
    recentAsks.set(key, kept);
    return true;
  }
  kept.push(now);
  recentAsks.delete(key);
  recentAsks.set(key, kept);
  // past the cap, the longest unused go first (a Map keeps insertion order)
  while (recentAsks.size > 5000) recentAsks.delete(recentAsks.keys().next().value!);
  return false;
}

async function context(token: string) {
  const client = await clientForToken(token);
  if (!client || !client.business.clientsPay) return null;
  return client;
}
type Client = NonNullable<Awaited<ReturnType<typeof context>>>;

/** The day their next book starts: the one after their last book (or their
 *  first start), unless that has gone, when it is the first day a book can
 *  reach them from anywhere, on their journal's week start. */
async function nextStart(client: Client): Promise<{ startISO: string; days: number } | null> {
  const defaults = await clientOrderDefaultsFor(client.business.ownerId, client.plannerId!);
  if (!defaults?.startISO) return null;
  const today = new Date();
  if (defaults.startISO >= isoDay(today)) return { startISO: defaults.startISO, days: defaults.days };
  const journal = await prisma.planner.findUnique({ where: { id: client.plannerId! }, select: { theme: true } });
  const weekStartDay = Number((journal?.theme as { weekStartDay?: unknown } | null)?.weekStartDay ?? 0) || 0;
  return { startISO: clientBookStart({ startISO: defaults.startISO, today, weekStartDay }), days: defaults.days };
}

/** The coach's share now: asked of Stripe when there is one to charge. */
async function shareNow(client: Client) {
  if (client.business.markupCents <= 0 || !client.business.stripeAccountId) return shareInForce(client.business);
  const ready = await refreshPayouts(client.businessId);
  return shareInForce({ ...client.business, payoutsReady: ready });
}

/** Can this client order their next book from their page, and what is it. */
export async function portalOrdering(token: string): Promise<PortalOrdering> {
  const client = await context(token);
  // their coach orders their books: nothing to say about it here
  if (!client) return { open: false, why: null };
  if (!client.plannerId) return { open: false, why: "Your journal is still being made. You can order it here once it is ready." };
  if (!orderingConfigured().ok) return { open: false, why: "Ordering is not open yet. Your coach can tell you when it is." };
  const address = shippableAddress(client.shippingAddress);
  if (!address) return { open: false, why: "Fill in where your books go, below, and you can order here." };
  const bindings = orderableBindings();
  const next = await nextStart(client);
  if (!next) return { open: false, why: "Your coach has not said when your book starts yet." };
  const start = new Date(`${next.startISO}T00:00:00Z`);
  const end = new Date(start.getTime() + (next.days - 1) * DAY);
  return {
    open: true,
    next: { startISO: next.startISO, days: next.days, label: rangeLabel({ start, end, days: next.days }) },
    bindings,
    email: sendableEmail(client.email),
    withShare: shareInForce(client.business).markupCents > 0,
  };
}

async function orderInput(token: string, binding: Binding, paper?: PaperColour) {
  const client = await context(token);
  if (!client) throw new OrderError("This page cannot order books. Your coach orders them for you.");
  if (!client.plannerId) throw new OrderError("Your journal is still being made.");
  const address = shippableAddress(client.shippingAddress);
  if (!address) throw new OrderError("Fill in where your books go first.");
  const next = await nextStart(client);
  if (!next) throw new OrderError("Your coach has not said when your book starts yet.");
  const input: OrderInput = { journalId: client.plannerId, startISO: next.startISO, days: next.days, binding, paper, address };
  return { client, input, share: await shareNow(client) };
}

/** Prices for their book in a binding, to their address: Memari's, with the
 *  coach's share on the book. */
export async function quoteForClient(token: string, binding: Binding, paper?: PaperColour): Promise<Quote> {
  if (tooMany(token, "quote", 12, 60_000)) throw new OrderError("That's a lot of prices in a minute. Wait a moment and try again.");
  const { client, input, share } = await orderInput(token, binding, paper);
  const quote = await quoteOrder(client.business.ownerId, input);
  return {
    ...quote,
    options: quote.options.map((option) => ({ ...option, price: withMarkup(option.price, share.markupCents) })),
    fromPrices: Object.fromEntries(Object.entries(quote.fromPrices).map(([b, cents]) => [b, (cents as number) + share.markupCents])) as Quote["fromPrices"],
  };
}

const STRIPE_CALL = { timeout: 8000, maxNetworkRetries: 1 };
/** Their open payment pages of the last day. */
export const openPages = (plannerId: string) =>
  prisma.printOrder.findMany({
    where: {
      plannerId,
      paidByClient: true,
      status: "QUOTED",
      stripeCheckoutSessionId: { not: null },
      // not one replaced, or whose bank payment was refused, or one whose
      // bank payment is clearing: each session reads "complete" at Stripe,
      // with nothing more to come (review, 2026-10-27)
      failureReason: null,
      stripePaymentIntentId: null,
      createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true, stripeCheckoutSessionId: true },
  });

/** Before a new page: one already paid (Stripe's word comes a moment later)
 *  stops a new one being made. */
async function refuseWhilePaying(plannerId: string) {
  if (!stripeConfigured()) return;
  for (const page of await openPages(plannerId)) {
    const session = await stripe().checkout.sessions.retrieve(page.stripeCheckoutSessionId!, {}, STRIPE_CALL);
    if (session.status === "complete") throw new OrderError("Your payment for this book is going through. Refresh this page in a minute to see it.");
  }
}

/** Stripe's payment page for their book, at the total and dates the page
 *  showed. */
export async function checkoutForClient(
  token: string,
  o: { binding: Binding; paper?: PaperColour; level: ShippingLevel; email: string; expectTotalCents: number; expectStartISO: string; expectDays: number },
  origin: string
): Promise<string> {
  if (tooMany(token, "pay", 6, 60_000)) throw new OrderError("That's a lot of tries in a minute. Wait a moment and try again.");
  const email = sendableEmail(o.email);
  if (!email) throw new OrderError("Give an email address for your receipt.");
  // before the dates are worked out from the books already held
  const startedAt = new Date();
  const { client, input, share } = await orderInput(token, o.binding, o.paper);
  if (input.startISO !== o.expectStartISO || input.days !== o.expectDays) throw new PriceMovedError("The dates of your book have changed since you saw them. See prices again.");
  // every page opened this hour counts, whatever became of it
  const recent = await prisma.printOrder.count({ where: { plannerId: client.plannerId!, paidByClient: true, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (recent >= CHECKOUTS_PER_HOUR) throw new OrderError("That's a lot of payment pages for one hour. Try again in a little while.");
  await refuseWhilePaying(client.plannerId!);
  const { url } = await startCheckout(client.business.ownerId, { ...input, level: o.level, autoRenew: false }, origin, {
    email,
    markupCents: share.markupCents,
    destination: share.destination,
    expectTotalCents: o.expectTotalCents,
    startedAt,
    // The link's token goes to Stripe in these two addresses, so the client
    // comes back to their own page - the one place the raw token is kept
    // outside their email. Accepted (review, 2026-10-23): whoever can read
    // Stripe's sessions holds the keys that read the database too, and a
    // coach can make a new link at any time, which ends this one.
    successUrl: `${origin}/c/${token}?placed=1`,
    cancelUrl: `${origin}/c/${token}`,
  });
  // the older pages for these days - theirs or the coach's - were closed by
  // startCheckout (closeOverlappingPages)
  return url;
}
