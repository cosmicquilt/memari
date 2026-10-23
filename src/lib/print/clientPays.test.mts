// A coach's client paying for their own book (clientPays.ts): the share on
// the price, the split with Stripe Connect, the payment page's settings,
// and refunds. Every number by hand, not from the code under test.
//
// Run as part of: npm test

import { PAYOUT_COUNTRIES, clientBookStart, clientSessionParams, coachReceives, destinationSplit, payerProblem, refundParams, withMarkup, type ClientPayer } from "./clientPays";
import type { Price } from "./pricing";
import { arrivalEmail, cancelledEmail, placedEmail, shippedEmail } from "./emails";
import { shareInForce } from "../payouts";

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failures++;
    console.error(`FAIL ${what}`);
  }
};

const base: Price = { bookCents: 2999, shippingCents: 599, totalCents: 3598, currency: "USD", costCents: 1700 };

// the share on the book's line
const marked = withMarkup(base, 1000);
check(marked.bookCents === 3999 && marked.shippingCents === 599 && marked.totalCents === 4598 && marked.costCents === 1700, "a $10 share goes on the book: $39.99 + $5.99 post = $45.98, Lulu's cost unchanged");
check(withMarkup(base, 0).totalCents === 3598, "no share, Memari's price");
check(withMarkup(base, -500).totalCents === 3598, "a share below nothing is nothing");

// the split: Memari keeps its $35.98 plus 3.9% of the $10 share (39c), the coach the rest
// Memari keeps its $35.98, 3.9% of the share (39c) and $1 towards paying the coach
const split = destinationSplit(4598, 1000);
check(split.applicationFeeCents === 3598 + 39 + 100 && split.coachCents === 861, `$45.98 with a $10 share: Memari $37.37, the coach $8.61 (${split.applicationFeeCents}, ${split.coachCents})`);
check(split.applicationFeeCents + split.coachCents === 4598, "the two add up to the payment");
check(destinationSplit(3598 + 333, 333).coachCents === 333 - 13 - 100, "the fee on a share is rounded up, against the coach: 3.9% of $3.33 is 12.99c, kept as 13c");
check(coachReceives(1000) === 861, "the settings screen's 'you receive' for $10: $8.61");
check(coachReceives(50) === 0 && destinationSplit(3648, 50).applicationFeeCents === 3648, "a share smaller than what is kept: all of it kept, never a negative payout");

// the payment page
const payer: ClientPayer = { email: "maya@example.com", markupCents: 1000, destination: "acct_coach", successUrl: "https://memari.studio/c/T?placed=o1", cancelUrl: "https://memari.studio/c/T" };
const params = clientSessionParams({ orderId: "o1", title: "Maya's journal", description: "Coil, Jan to Mar", shippingName: "Standard", price: marked, payer, expiresAt: 1_800_000_000 });
check(params.expires_at === 1_800_000_000, "the page stops taking payment when it is told to (under the day an open page holds its days)");
check(params.mode === "payment" && params.customer_email === "maya@example.com" && !("customer" in params), "the receipt goes to the client, with no saved customer");
check(params.line_items?.[0]?.price_data?.unit_amount === 3999 && params.line_items?.[1]?.price_data?.unit_amount === 599, "the client sees the book at its price with the share, and the post");
check(params.payment_intent_data?.application_fee_amount === 3737 && params.payment_intent_data?.transfer_data?.destination === "acct_coach", "with a share: a destination charge to the coach, Memari's fee $37.37");
check(!params.payment_intent_data?.setup_future_usage, "a client's card is never saved");
check(params.success_url === payer.successUrl && params.cancel_url === payer.cancelUrl && params.metadata?.orderId === "o1", "back to their page either way; the order's id with it");
const plain = clientSessionParams({ orderId: "o2", title: "t", description: "d", shippingName: "s", price: base, payer: { ...payer, markupCents: 0, destination: null }, expiresAt: 1_800_000_000 });
check(!plain.payment_intent_data?.application_fee_amount && !plain.payment_intent_data?.transfer_data, "at Memari's price: no transfer, an ordinary payment");

// refused before anything is made
check(payerProblem({ ...payer, destination: null }) !== null, "a share with no payouts account is refused");
check(payerProblem({ ...payer, markupCents: 0, destination: null }) === null, "Memari's price needs no account");
check(payerProblem({ ...payer, email: "" }) !== null, "no email, no order");

// refunds
const r = refundParams({ stripePaymentIntentId: "pi_1", markupCents: 1000, payoutAccountId: "acct_coach" });
check(r.payment_intent === "pi_1" && r.reverse_transfer === true && r.refund_application_fee === true, "a refund with a share takes the coach's back and returns Memari's fee");
const r2 = refundParams({ stripePaymentIntentId: "pi_2", markupCents: 0, payoutAccountId: null });
check(r2.payment_intent === "pi_2" && !("reverse_transfer" in r2) && !("refund_application_fee" in r2), "a plain refund otherwise (Stripe refuses reverse_transfer with no transfer)");

// a share is charged only while the coach's payouts can take it
check(shareInForce({ markupCents: 1000, payoutsReady: true, stripeAccountId: "acct_coach" }).markupCents === 1000, "payouts ready: the share is charged, to the coach's account");
check(shareInForce({ markupCents: 1000, payoutsReady: true, stripeAccountId: "acct_coach" }).destination === "acct_coach", "and goes to it");
const paused = shareInForce({ markupCents: 1000, payoutsReady: false, stripeAccountId: "acct_coach" });
check(paused.markupCents === 0 && paused.destination === null, "payouts not ready (Stripe wants more): Memari's price, so the client can still order");
check(shareInForce({ markupCents: 1000, payoutsReady: true, stripeAccountId: null }).markupCents === 0, "no account: Memari's price");

// the emails: a client has no account, so no link to one
const order = { id: "o1", title: "Maya's journal", startDate: new Date("2027-01-04T00:00:00Z"), endDate: new Date("2027-04-03T00:00:00Z"), days: 90, binding: "COIL", pageCount: 120, totalCents: 4598, contactEmail: "maya@example.com" };
const theirs = placedEmail({ ...order, paidByClient: true });
check(!theirs.text.includes("/app/account/orders") && !theirs.html.includes("/app/account/orders") && theirs.text.includes("Ask your coach"), "a client's order email: no link to an account they don't have, ask your coach instead");
check(!shippedEmail({ ...order, paidByClient: true }, []).text.includes("/app/account/orders"), "and when it ships");
check(placedEmail(order).text.includes("/app/account/orders"), "anyone else's still links to their orders");
const arrived = arrivalEmail({ ...order, paidByClient: true }, { yes: "https://x/yes", notYet: "https://x/no" });
check(!arrived.text.includes("/app/account/orders") && arrived.text.includes("https://x/yes"), "the 'has it arrived?' email to a client: its answers, no account link");
const stopped = cancelledEmail({ ...order, paidByClient: true });
check(!stopped.text.includes("/app/account/orders") && stopped.text.includes("from your page") && !stopped.text.includes("Auto-renew"), "a client's cancelled email: order again from your page, nothing about auto-renew");
check(shippedEmail({ ...order, paidByClient: true }, []).text.includes("tracking will show on your page"), "a client's shipped email: tracking on their page");

// the start of a client's next book: never days already gone (review, 2026-10-23)
const today = new Date("2026-10-23T12:00:00Z"); // a Friday
check(clientBookStart({ startISO: "2026-11-02", today, weekStartDay: 0 }) === "2026-11-02", "a start still to come is kept as it is");
check(clientBookStart({ startISO: "2026-10-23", today, weekStartDay: 0 }) === "2026-10-23", "today counts as still to come (the coach's screen keeps it too)");
const lapsed = clientBookStart({ startISO: "2026-06-01", today, weekStartDay: 0 });
check(lapsed > "2026-10-23" && new Date(`${lapsed}T00:00:00Z`).getUTCDay() === 0, `a start in the past becomes a reachable Sunday, never days gone (${lapsed})`);
const monday = clientBookStart({ startISO: "2026-06-01", today, weekStartDay: 1 });
check(new Date(`${monday}T00:00:00Z`).getUTCDay() === 1, `on the journal's week start, here a Monday (${monday})`);
// the slowest post, standard mail from abroad (31 days), whatever the binding: the dates shown are the dates charged
check(lapsed >= "2026-11-23", `far enough out for a book posted from abroad by standard mail (${lapsed})`);
check(PAYOUT_COUNTRIES.includes("US") && PAYOUT_COUNTRIES.includes("GB") && PAYOUT_COUNTRIES.includes("DE") && PAYOUT_COUNTRIES.includes("CA") && PAYOUT_COUNTRIES.includes("CH") && !PAYOUT_COUNTRIES.includes("AU") && !PAYOUT_COUNTRIES.includes("IN"), "coaches can be paid in the US, UK, EEA, Canada and Switzerland, not yet Australia or India");

if (failures) {
  console.error(`\n${failures} client-pays check(s) failed.`);
  process.exit(1);
}
console.log("All client-pays checks passed.");
