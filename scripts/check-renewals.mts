// Auto-renewal (src/lib/print/renewals.ts), on throwaway journals and orders
// in the dev database, with Lulu and Stripe replaced by fakes - so it runs
// without keys and charges nothing.
//
// What it pins:
//   - a due order is renewed once: the next range of the same length, the
//     journal as it is now, the files kept with it, the saved card charged
//     the renewal's price, the renewal sent to print and carrying auto-
//     renew on, and the order it renewed showing no switch any more;
//   - running again renews nothing more, and two runs at once renew once;
//   - a declined card, a deleted journal and a book grown too thick for its
//     binding each leave a FAILED renewal saying why, nothing charged or
//     printed, and auto-renew off;
//   - an order not yet due, and one never paid for, are left alone;
//   - the reminder says "Your next month prints in 5 days" and carries the
//     journal link and signed skip and pause links, which verify for their
//     own order and action only;
//   - skip leaves a SKIPPED order for the next days, nothing charged, with
//     auto-renew and the card carried on; the renewal after it covers the
//     days after the skipped ones; undo puts it back (and keeps a stop made
//     after the skip), but not once the book after is ordered; someone
//     else's order, and an older book of a journal, are refused; the email
//     page's button acts only with a good signature;
//   - print files are deleted a year after delivery, abandoned checkouts'
//     after a month, and nothing else's;
//   - a customer's cancel asks the printer FIRST and refunds only if it
//     agrees, once however often it is pressed; a book the printer has begun,
//     or someone else's, is refused before the printer is asked; a refund
//     that fails still leaves the book stopped and tells us; and a late
//     webhook cannot bring a cancelled book back;
//   - the printer cancelling a paid book itself leaves a refund due and
//     tells us, once; the admin can refund it, and an order whose refund
//     failed, with a new Stripe key each try; a stop we asked for is not
//     taken for the printer's own even when its word lands first; and two
//     deliveries of the same payment send the book to the printer once
//     (review, 2026-10-27).
//
// SABOTAGES THAT TURN IT RED (2026-10-27):
//   * drop the CANCELED branch from applyJobStatus
//     -> "THE PRINTER CANCELLING A PAID BOOK ITSELF LEAVES A REFUND DUE"
//   * refuse every CANCELED order in refundOrder again -> "THE ADMIN CAN REFUND IT"
//   * drop cancelAskedAt from cancelByCustomer -> "A STOP WE ASKED FOR IS NOT TAKEN..."
//   * one key for every refund -> "A REFUND TRIED AGAIN AFTER ONE FAILED..."
//   * drop the claim from fulfilPaidOrder -> "TWO DELIVERIES AT ONCE..."
//   * drop cancelAskedAt from refundOrder -> "THE ADMIN'S OWN STOP IS NOT..."
//   * drop the charge_already_refunded case -> "A REFUND MADE IN STRIPE..."
//   * record a failed refund only when it was due
//     -> "A REFUND THAT FAILS AFTER THE BOOK WAS STOPPED LEAVES IT DUE"
//   * leave auto-renew on when a refund fails on a book that came
//     -> "a shipped book whose refund fails stays SHIPPED..."
//   * drop the clearing guard -> "A BANK PAYMENT STILL CLEARING IS NOT REFUNDED"
//
//   npm run check:renewals
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { prisma } = await import("../src/lib/prisma.js");
const { createBookFor, validateNewJournal } = await import("../src/app/planner/bookSeeding.js");
const { runRenewals, pruneOldPrintFiles } = await import("../src/lib/print/renewals.js");
const { fulfilPaidOrder } = await import("../src/lib/print/orders.js");
type Deps = import("../src/lib/print/renewals.js").RenewalDeps;

const OWNER = "renewals-check-throwaway";
/** Someone else, whose order ours must not reach. */
const STRANGER = "renewals-check-someone-else";
let failures = 0;
const check = (ok: boolean, message: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${message}`);
  if (!ok) failures++;
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86_400_000;

/** Lulu and Stripe, faked: a fixed cost, a cover size, and a charge that
 *  succeeds unless told otherwise. Every call is recorded. */
function fakes(options: { decline?: boolean } = {}) {
  const calls = { charge: [] as Array<{ orderId: string; amountCents: number; paymentMethodId: string }>, fulfil: [] as string[], printers: [] as string[], emails: [] as Array<{ to: string; subject: string; text: string }> };
  const deps: Deps = {
    printCost: async (printer) => {
      calls.printers.push(printer);
      return { printCents: 1100, fulfillmentCents: 75, shippingCents: 599, taxCents: 0, totalCents: 1774, currency: "USD" };
    },
    coverDimensions: async () => ({ widthPt: 1046, heightPt: 738 }),
    charge: async (input) => {
      calls.charge.push(input);
      return options.decline ? { ok: false, reason: "your card was declined (test)" } : { ok: true, paymentIntentId: `pi_${input.orderId}` };
    },
    email: async (email) => {
      calls.emails.push(email);
      return { sent: true };
    },
    fulfil: async (orderId) => {
      calls.fulfil.push(orderId);
      await prisma.printOrder.update({ where: { id: orderId }, data: { status: "SUBMITTED", luluPrintJobId: `job_${orderId}` } });
    },
  };
  return { deps, calls };
}

async function journal(title: string) {
  const book = await createBookFor(
    OWNER,
    validateNewJournal({ title, trim: "bound7x10", startISO: "2027-01-01", endISO: "2027-03-31", levels: ["JOURNAL", "MONTHLY", "WEEKLY", "DAILY"], dated: true, weekStartDay: 0, font: "serif" })
  );
  return book.id;
}

async function order(plannerId: string | null, overrides: Record<string, unknown> = {}) {
  return prisma.printOrder.create({
    data: {
      ownerId: OWNER,
      plannerId,
      title: "Renewal check",
      startDate: new Date("2027-01-01T00:00:00Z"),
      endDate: new Date("2027-01-30T00:00:00Z"),
      days: 30,
      binding: "PAPERBACK",
      podPackageId: "0700X1000BWSTDPB060UW444MXX",
      pageCount: 64,
      shippingLevel: "GROUND",
      shippingAddress: { name: "Check", street1: "1 Main St", city: "Springfield", stateCode: "IL", countryCode: "US", postcode: "62701", phoneNumber: "5555550100" },
      contactEmail: "check@example.com",
      bookCents: 2499,
      shippingCents: 599,
      totalCents: 3098,
      costCents: 1774,
      status: "SUBMITTED",
      autoRenew: true,
      renewsAt: new Date(Date.now() - DAY),
      stripePaymentMethodId: "pm_check",
      ...overrides,
    },
  });
}

async function cleanUp() {
  await prisma.business.deleteMany({ where: { ownerId: OWNER } });
  await prisma.printOrder.deleteMany({ where: { ownerId: { in: [OWNER, STRANGER] } } });
  await prisma.planner.deleteMany({ where: { ownerId: OWNER } });
  await prisma.ownerSettings.deleteMany({ where: { ownerId: OWNER } });
}

await cleanUp();
try {
  await prisma.ownerSettings.create({ data: { ownerId: OWNER, stripeCustomerId: "cus_check" } });
  const now = new Date();

  // --- a renewal, once ----------------------------------------------------------
  {
    const plannerId = await journal("Renewal check");
    const first = await order(plannerId);
    const { deps, calls } = fakes();
    const outcomes = await runRenewals(now, deps);
    const mine = outcomes.find((o) => o.orderId === first.id);
    check(mine?.outcome === "renewed", `a due order renews (${mine?.outcome} ${mine?.detail ?? ""})`);
    const renewal = await prisma.printOrder.findFirst({ where: { renewedFromId: first.id }, include: { files: true } });
    check(!!renewal && iso(renewal.startDate) === "2027-01-31" && iso(renewal.endDate) === "2027-03-01" && renewal.days === 30, `the next 30 days, straight after (${renewal && `${iso(renewal.startDate)}..${iso(renewal.endDate)}`})`);
    check(!!renewal && renewal.files.length === 2 && renewal.pageCount > 0 && renewal.pageCount % 4 === 0, `its book built and kept with it (${renewal?.files.length} files, ${renewal?.pageCount} pages)`);
    check(calls.charge.length === 1 && calls.charge[0].orderId === renewal?.id && calls.charge[0].amountCents === renewal?.totalCents && calls.charge[0].paymentMethodId === "pm_check", `the saved card charged the renewal's own price once (${calls.charge.map((c) => c.amountCents).join(",")})`);
    check(calls.fulfil.length === 1 && calls.fulfil[0] === renewal?.id, "and the renewal sent to print");
    check(calls.printers.length === 1 && calls.printers[0] === "lulu" && renewal?.printer === "lulu", "priced by the order's own printer, and recorded on the renewal");
    check(!!renewal && renewal.autoRenew && renewal.status === "SUBMITTED", "the renewal carries auto-renew on");
    const after = await prisma.printOrder.findUnique({ where: { id: first.id } });
    check(!!after && !after.autoRenew && after.renewsAt === null, "the order it renewed shows no switch any more");

    const again = fakes();
    const second = await runRenewals(now, again.deps);
    check(second.length === 0 && again.calls.charge.length === 0, `running again renews nothing more (${second.length})`);
  }

  // --- two runs at once ------------------------------------------------------------
  {
    const plannerId = await journal("Race check");
    const raced = await order(plannerId, { title: "Race" });
    const a = fakes();
    const b = fakes();
    await Promise.all([runRenewals(now, a.deps), runRenewals(now, b.deps)]);
    const renewals = await prisma.printOrder.count({ where: { renewedFromId: raced.id } });
    check(renewals === 1 && a.calls.charge.length + b.calls.charge.length === 1, `two runs at once renew it once (${renewals} renewals, ${a.calls.charge.length + b.calls.charge.length} charges)`);
  }

  // --- days already paid for (review, 2026-10-23) ----------------------------------
  // A coach's client paid for the next days themselves (clientPays.ts): the
  // coach's renewal must not charge for them again or print a second copy.
  {
    const plannerId = await journal("Covered check");
    const coachs = await order(plannerId, { title: "Covered" });
    await order(plannerId, { title: "Paid by the client", status: "PAID", startDate: new Date("2027-01-31T00:00:00Z"), endDate: new Date("2027-03-01T00:00:00Z"), autoRenew: false, renewsAt: null, paidByClient: true, markupCents: 1000, stripePaymentMethodId: null });
    const { deps, calls } = fakes();
    const outcomes = await runRenewals(now, deps);
    const mine = outcomes.find((o) => o.orderId === coachs.id);
    const renewals = await prisma.printOrder.count({ where: { renewedFromId: coachs.id } });
    const after = await prisma.printOrder.findUnique({ where: { id: coachs.id } });
    check(mine?.outcome === "skipped" && renewals === 0 && !calls.fulfil.length, `days a client already paid for: no renewal, nothing charged or printed (${mine?.outcome}: ${mine?.detail ?? ""})`);
    check(!!after && !after.autoRenew && after.renewsAt === null, "and the coach's auto-renew is off");
  }
  {
    // a client's payment page still open counts as those days ordered
    const plannerId = await journal("Open page check");
    const coachs = await order(plannerId, { title: "Open page" });
    await order(plannerId, { title: "Client's open page", status: "QUOTED", startDate: new Date("2027-01-31T00:00:00Z"), endDate: new Date("2027-03-01T00:00:00Z"), autoRenew: false, renewsAt: null, paidByClient: true, stripePaymentMethodId: null, stripeCheckoutSessionId: "cs_check_open" });
    const { deps, calls } = fakes();
    const outcomes = await runRenewals(now, deps);
    const mine = outcomes.find((o) => o.orderId === coachs.id);
    check(mine?.outcome === "skipped" && !calls.fulfil.length && (await prisma.printOrder.count({ where: { renewedFromId: coachs.id } })) === 0, `a client's payment page open for those days: no renewal (${mine?.outcome}: ${mine?.detail ?? ""})`);
  }
  {
    // the client's payment landing ends the coach's chain at once
    const plannerId = await journal("Client pays check");
    const coachs = await order(plannerId, { title: "Coach's chain", renewsAt: new Date(Date.now() + 20 * DAY) });
    const theirs = await order(plannerId, { title: "Client's", status: "QUOTED", startDate: new Date("2027-01-31T00:00:00Z"), endDate: new Date("2027-03-01T00:00:00Z"), autoRenew: false, renewsAt: null, paidByClient: true, stripePaymentMethodId: null, luluPrintJobId: "at-the-printer-already" });
    await fulfilPaidOrder(theirs.id, { paymentIntentId: "pi_check" }, "https://example.com");
    const after = await prisma.printOrder.findUnique({ where: { id: coachs.id } });
    const paid = await prisma.printOrder.findUnique({ where: { id: theirs.id } });
    check(paid?.status === "PAID" && !!after && !after.autoRenew && after.renewsAt === null, "a client's book paid for: the coach's renewals of that journal end");
  }

  // --- a client's journal: their address now, and archiving (review, 2026-10-26) ---
  // The client corrects "Where your books go" on their page after the coach
  // turned auto-renew on: the next book is priced for and posted to the new
  // address, not the last book's. A client the coach archived gets no more.
  {
    const business = await prisma.business.create({ data: { ownerId: OWNER, name: "Renewals check business" } });
    const moved = { name: "Maya Check", street1: "22 New Road", city: "Leeds", countryCode: "GB", postcode: "LS1 4AP", phoneNumber: "+441130000000" };
    const plannerId = await journal("Client moved check");
    await prisma.businessClient.create({ data: { businessId: business.id, name: "Maya", plannerId, shippingAddress: moved } });
    const coachs = await order(plannerId, { title: "Coach's renewal" });
    const { deps, calls } = fakes();
    const priced: unknown[] = [];
    const watched: typeof deps = { ...deps, printCost: async (printer, sku, pages, address, level) => (priced.push(address), deps.printCost(printer, sku, pages, address, level)) };
    const outcomes = await runRenewals(now, watched);
    const mine = outcomes.find((o) => o.orderId === coachs.id);
    const renewal = await prisma.printOrder.findFirst({ where: { renewedFromId: coachs.id } });
    const shipTo = renewal?.shippingAddress as { street1?: string; countryCode?: string } | undefined;
    check(mine?.outcome === "renewed" && shipTo?.street1 === "22 New Road" && shipTo?.countryCode === "GB", `the renewal goes to the client's address now (${mine?.outcome}: ${shipTo?.street1 ?? "none"}, ${shipTo?.countryCode ?? ""})`);
    check((priced.at(-1) as { street1?: string } | undefined)?.street1 === "22 New Road", "and is priced for that address");
    check(calls.charge.some((c) => c.orderId === renewal?.id), "and charged as usual");

    const gonePlanner = await journal("Archived client check");
    await prisma.businessClient.create({ data: { businessId: business.id, name: "Former", plannerId: gonePlanner, archivedAt: new Date() } });
    const gone = await order(gonePlanner, { title: "Archived client's renewal" });
    const archived = fakes();
    const goneOutcomes = await runRenewals(now, archived.deps);
    const goneMine = goneOutcomes.find((o) => o.orderId === gone.id);
    const goneAfter = await prisma.printOrder.findUnique({ where: { id: gone.id } });
    check(goneMine?.outcome === "skipped" && archived.calls.charge.length === 0 && archived.calls.fulfil.length === 0 && (await prisma.printOrder.count({ where: { renewedFromId: gone.id } })) === 0, `an archived client's book is not renewed, nothing charged (${goneMine?.outcome}: ${goneMine?.detail ?? ""})`);
    check(!!goneAfter && !goneAfter.autoRenew && goneAfter.renewsAt === null, "and its auto-renew is off");

    // ...and the coach is not told it "prints in 5 days" beforehand.
    const { sendRenewalReminders } = await import("../src/lib/print/emails.js");
    const laterPlanner = await journal("Archived client reminder check");
    await prisma.businessClient.create({ data: { businessId: business.id, name: "Former too", plannerId: laterPlanner, archivedAt: new Date() } });
    const later = await order(laterPlanner, { title: "Archived client's reminder", renewsAt: new Date(Date.now() + 5 * DAY) });
    const sent: string[] = [];
    const reminded = await sendRenewalReminders(new Date(), async (email) => (sent.push(email.subject), { sent: true }));
    check(!reminded.includes(later.id) && (await prisma.printOrder.findUnique({ where: { id: later.id } }))?.renewalReminderSentAt === null, `an archived client's renewal gets no reminder (${reminded.length} reminded)`);
  }

  // --- a bank payment still clearing holds its days (holdsDays.ts, 2026-10-26) ---
  // Checkout completes "unpaid" with a US bank account; it settles days later.
  // Until then the days are taken: not renewed over, not offered again.
  {
    const { recordClearingPayment, failClearingPayment } = await import("../src/lib/print/orders.js");
    const { clientOrderDefaultsFor } = await import("../src/lib/business.js");
    const { HOLDS_DAYS, LISTED } = await import("../src/lib/print/holdsDays.js");
    const business = await prisma.business.findUniqueOrThrow({ where: { ownerId: OWNER } });
    const plannerId = await journal("Clearing check");
    await prisma.businessClient.create({ data: { businessId: business.id, name: "Clearing", plannerId, startDate: new Date("2027-01-01T00:00:00Z"), bookMonths: 1 } });
    const coachs = await order(plannerId, { title: "Coach's book" });
    const theirs = await order(plannerId, { title: "Paid by bank", status: "QUOTED", startDate: new Date("2027-01-31T00:00:00Z"), endDate: new Date("2027-03-01T00:00:00Z"), autoRenew: false, renewsAt: null, paidByClient: true, stripePaymentMethodId: null, stripeCheckoutSessionId: "cs_check_bank", createdAt: new Date(Date.now() - 3 * DAY) });
    const before = await clientOrderDefaultsFor(OWNER, plannerId);
    check(before?.startISO === "2027-01-31", `before the bank payment is recorded, the next book starts at its days (${before?.startISO})`);

    check(await recordClearingPayment(theirs.id, "pi_check_bank", "bank@example.com"), "a finished bank checkout is recorded as clearing");
    check(!(await recordClearingPayment(theirs.id, "pi_check_bank_again")), "and recording it again changes nothing");
    const clearing = await prisma.printOrder.findUniqueOrThrow({ where: { id: theirs.id } });
    check(clearing.status === "QUOTED" && clearing.stripePaymentIntentId === "pi_check_bank" && clearing.contactEmail === "check@example.com", `it stays QUOTED with its payment intent, nothing printed (${clearing.status}, ${clearing.stripePaymentIntentId})`);
    const held = await prisma.printOrder.findMany({ where: { plannerId, OR: HOLDS_DAYS }, select: { id: true } });
    const listed = await prisma.printOrder.findMany({ where: { plannerId, OR: LISTED }, select: { id: true } });
    check(held.some((o) => o.id === theirs.id) && listed.some((o) => o.id === theirs.id), "a clearing payment holds its days and is listed");
    const after = await clientOrderDefaultsFor(OWNER, plannerId);
    check(after?.startISO === "2027-03-02", `while it clears, the next book starts after it, so its days are not sold again (${after?.startISO})`);
    const { deps, calls } = fakes();
    const outcomes = await runRenewals(now, deps);
    const mine = outcomes.find((o) => o.orderId === coachs.id);
    check(mine?.outcome === "skipped" && !calls.charge.length && (await prisma.printOrder.count({ where: { renewedFromId: coachs.id } })) === 0, `the coach's renewal over those days is not ordered, three days after the page opened (${mine?.outcome}: ${mine?.detail ?? ""})`);

    const sent: Array<{ to: string; subject: string }> = [];
    check(await failClearingPayment(theirs.id, async (email) => (sent.push(email), { sent: true })), "the bank refusing it ends the order");
    const refused = await prisma.printOrder.findUniqueOrThrow({ where: { id: theirs.id } });
    check(refused.status === "QUOTED" && refused.stripePaymentIntentId === null && /did not go through/.test(refused.failureReason ?? ""), `a checkout never finished again (QUOTED, no payment), saying why - not a FAILED "book" (${refused.status}: ${refused.failureReason})`);
    check(!(await prisma.printOrder.findMany({ where: { plannerId, OR: LISTED }, select: { id: true } })).some((o) => o.id === theirs.id), "and no list shows it as a book");
    check(!(await recordClearingPayment(theirs.id, "pi_check_bank_late")), "a late, re-sent completion can't take its days again");
    check(sent.length === 1 && sent[0].to === "check@example.com" && /didn't go through/.test(sent[0].subject), `the payer is told (${sent.map((e) => `${e.to}: ${e.subject}`).join("; ")})`);
    const freed = await clientOrderDefaultsFor(OWNER, plannerId);
    check(freed?.startISO === "2027-01-31", `its days are free again (${freed?.startISO})`);
    check(!(await prisma.printOrder.findMany({ where: { plannerId, OR: HOLDS_DAYS }, select: { id: true } })).some((o) => o.id === theirs.id), "and a renewal that failed unpaid holds nothing, so a client's page does not list it");
    check(!(await failClearingPayment(theirs.id, async () => ({ sent: true }))), "ending it again changes nothing");
  }

  // --- what stops a renewal ---------------------------------------------------------
  {
    const plannerId = await journal("Declined check");
    const declined = await order(plannerId, { title: "Declined" });
    const { deps, calls } = fakes({ decline: true });
    await runRenewals(now, deps);
    const renewal = await prisma.printOrder.findFirst({ where: { renewedFromId: declined.id } });
    check(renewal?.status === "FAILED" && /declined/.test(renewal.failureReason ?? "") && /Nothing was charged/.test(renewal.failureReason ?? ""), `a declined card: a FAILED renewal saying so (${renewal?.failureReason})`);
    check(calls.fulfil.length === 0, "and nothing sent to print");
    check(calls.emails.length === 1 && calls.emails[0].to === "check@example.com" && /declined/.test(calls.emails[0].text) && /Nothing was charged/.test(calls.emails[0].text), `and the customer is told why, by email (${calls.emails.map((e) => e.subject).join("; ")})`);
    const after = await prisma.printOrder.findUnique({ where: { id: declined.id } });
    check(!!after && !after.autoRenew && !renewal?.autoRenew, "and auto-renew off - no charging again tomorrow");
  }
  {
    const orphan = await order(null, { title: "Orphan" });
    const { deps, calls } = fakes();
    await runRenewals(now, deps);
    const renewal = await prisma.printOrder.findFirst({ where: { renewedFromId: orphan.id } });
    check(renewal?.status === "FAILED" && /journal was deleted/.test(renewal.failureReason ?? "") && calls.charge.length === 0, `a deleted journal: FAILED, nothing charged (${renewal?.failureReason})`);
  }
  {
    // A year of this journal's pages is more than a coil holds.
    const plannerId = await journal("Thick check");
    const thick = await order(plannerId, { title: "Thick", binding: "COIL", days: 365, endDate: new Date("2027-12-31T00:00:00Z") });
    const { deps, calls } = fakes();
    await runRenewals(now, deps);
    const renewal = await prisma.printOrder.findFirst({ where: { renewedFromId: thick.id } });
    check(renewal?.status === "FAILED" && /more than plastic coil can hold/.test(renewal.failureReason ?? "") && calls.charge.length === 0, `too thick for its binding: FAILED, nothing charged (${renewal?.failureReason})`);
  }

  // --- left alone --------------------------------------------------------------------
  {
    const plannerId = await journal("Not due check");
    const notDue = await order(plannerId, { title: "Not due", renewsAt: new Date(Date.now() + 5 * DAY) });
    const unpaid = await order(plannerId, { title: "Unpaid", status: "QUOTED" });
    const { deps, calls } = fakes();
    await runRenewals(now, deps);
    const notDueRenewals = await prisma.printOrder.count({ where: { renewedFromId: notDue.id } });
    const unpaidRenewals = await prisma.printOrder.count({ where: { renewedFromId: unpaid.id } });
    check(notDueRenewals === 0 && unpaidRenewals === 0 && calls.charge.length === 0, "an order not yet due, and one never paid for, are left alone");
  }

  // --- the reminder, a week ahead, once ------------------------------------------------
  {
    const { sendRenewalReminders } = await import("../src/lib/print/emails.js");
    const plannerId = await journal("Reminder check");
    const soon = await order(plannerId, { title: "Reminder", renewsAt: new Date(Date.now() + 5 * DAY) });
    const far = await order(plannerId, { title: "Far off", renewsAt: new Date(Date.now() + 30 * DAY) });
    const tomorrow = await order(plannerId, { title: "Tomorrow", renewsAt: new Date(Date.now() + 0.5 * DAY) });
    const off = await order(plannerId, { title: "Off", autoRenew: false, renewsAt: new Date(Date.now() + 5 * DAY) });
    const sent: Array<{ to: string; subject: string; text: string }> = [];
    const send = async (email: { to: string; subject: string; text: string }) => {
      sent.push(email);
      return { sent: true };
    };
    const [first, second] = [await sendRenewalReminders(new Date(), send), await sendRenewalReminders(new Date(), send)];
    const mine = sent.find((e) => e.text.startsWith("Reminder:"));
    check(first.includes(soon.id) && second.length === 0 && !!mine, `a renewal 5 days off is reminded, once (${first.length} then ${second.length})`);
    check(mine?.subject === "Your next month prints in 5 days", `the subject says what and when (${mine?.subject})`);
    check(!!mine && /change your pages, skip this one, or pause/i.test(mine.text) && /own/.test(mine.text), "the reminder offers change, skip and pause, and says the price is the next book's own");
    const { verifyRenewalAction } = await import("../src/lib/print/renewalControls.js");
    const link = (action: string) => new RegExp(`/renewal/${soon.id}\\?do=${action}&sig=([0-9a-f]+)`).exec(mine?.text ?? "");
    const [skipLink, pauseLink] = [link("skip"), link("pause")];
    check(!!skipLink && !!pauseLink && verifyRenewalAction(soon.id, "skip", skipLink[1]) && verifyRenewalAction(soon.id, "pause", pauseLink[1]), "its skip and pause links are signed for this order");
    // No signing secret set (production before the print keys): every link
    // fails to verify, quietly - the page says so instead of a 500.
    // As production: development has a fallback secret (fileUrls.ts).
    const env = process.env as Record<string, string | undefined>;
    const saved = { secret: env.PRINT_FILE_SECRET, mode: env.NODE_ENV };
    delete env.PRINT_FILE_SECRET;
    env.NODE_ENV = "production";
    let quiet = true;
    try {
      quiet = verifyRenewalAction(soon.id, "skip", skipLink?.[1] ?? "x") === false;
    } catch {
      quiet = false;
    }
    for (const [key, value] of [["PRINT_FILE_SECRET", saved.secret], ["NODE_ENV", saved.mode]] as const) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
    check(quiet, "with no signing secret set, a link fails to verify rather than throwing (no 500 on the page)");
    check(!!skipLink && !verifyRenewalAction(soon.id, "pause", skipLink[1]) && !verifyRenewalAction(far.id, "skip", skipLink[1]) && !verifyRenewalAction(soon.id, "skip", skipLink[1].replace(/.$/, (c) => (c === "0" ? "1" : "0"))) && !verifyRenewalAction(soon.id, "delete", skipLink[1]), "and for nothing else: not the other action, another order, an altered signature or another verb");
    const slug = (await prisma.planner.findUniqueOrThrow({ where: { id: plannerId } })).slug;
    check(!!slug && (mine?.text.includes(`/app/j/${slug}`) ?? false), `"Change your pages" opens the journal (/app/j/${slug})`);
    check(!first.includes(far.id) && !first.includes(tomorrow.id) && !first.includes(off.id), "not one a month off, not one renewing within the day, not one with auto-renew off");
    // Run on the very same day and again - each renewal is reminded once.
    await prisma.printOrder.updateMany({ where: { id: { in: [soon.id, far.id, tomorrow.id, off.id] } }, data: { autoRenew: false } });
  }

  // --- skip, undo and stop (renewalControls.ts) -------------------------------------------
  {
    const { skipNextBook, undoSkip, stopAutoRenew, startAutoRenew, renewalActionUrl } = await import("../src/lib/print/renewalControls.js");
    const said = (run: () => Promise<unknown>) => run().then(() => null, (error: Error) => error.message);
    const plannerId = await journal("Skip check");
    const head = await order(plannerId, { title: "Skip", renewsAt: new Date(Date.now() + 5 * DAY) });

    const { skippedId } = await skipNextBook(OWNER, head.id);
    let placeholder = await prisma.printOrder.findUniqueOrThrow({ where: { id: skippedId } });
    let original = await prisma.printOrder.findUniqueOrThrow({ where: { id: head.id } });
    check(placeholder.status === "SKIPPED" && iso(placeholder.startDate) === "2027-01-31" && iso(placeholder.endDate) === "2027-03-01" && placeholder.totalCents === 0 && placeholder.renewedFromId === head.id, `skip: a SKIPPED order for the next 30 days, nothing charged (${iso(placeholder.startDate)}..${iso(placeholder.endDate)}, ${placeholder.totalCents})`);
    check(!original.autoRenew && original.renewsAt === null, "the book it skips from renews no more");
    check(placeholder.autoRenew && placeholder.stripePaymentMethodId === "pm_check" && !!placeholder.renewsAt && placeholder.renewsAt > head.renewsAt!, `auto-renew and the card carry on, for the book after (${placeholder.renewsAt && iso(placeholder.renewsAt)})`);
    check(/already been ordered|nothing to skip/.test((await said(() => skipNextBook(OWNER, head.id))) ?? ""), "skipping from the same book twice is refused");

    await undoSkip(OWNER, skippedId);
    original = await prisma.printOrder.findUniqueOrThrow({ where: { id: head.id } });
    check((await prisma.printOrder.count({ where: { id: skippedId } })) === 0 && original.autoRenew && !!original.renewsAt && original.renewalReminderSentAt === null, "undo: the skip is gone and the book renews again, reminder due again");

    // Skip, then stop on the skipped one, then undo: the stop stands.
    const again = await skipNextBook(OWNER, head.id);
    await stopAutoRenew(OWNER, again.skippedId);
    await undoSkip(OWNER, again.skippedId);
    original = await prisma.printOrder.findUniqueOrThrow({ where: { id: head.id } });
    check(!original.autoRenew && original.renewsAt === null, "a stop made after a skip survives undoing the skip");
    await startAutoRenew(OWNER, head.id);

    // The chain carries on through a skip: the renewal after covers the
    // days after the skipped ones, charged once.
    const third = await skipNextBook(OWNER, head.id);
    await prisma.printOrder.update({ where: { id: third.skippedId }, data: { renewsAt: new Date(Date.now() - DAY) } });
    const { deps, calls } = fakes();
    const outcomes = await runRenewals(now, deps);
    const renewal = await prisma.printOrder.findFirst({ where: { renewedFromId: third.skippedId } });
    check(outcomes.some((o) => o.orderId === third.skippedId && o.outcome === "renewed") && !!renewal && iso(renewal.startDate) === "2027-03-02" && iso(renewal.endDate) === "2027-03-31", `the book after a skip is ordered for the days after it (${renewal && `${iso(renewal.startDate)}..${iso(renewal.endDate)}`})`);
    check(calls.charge.filter((c) => c.orderId === renewal?.id).length === 1 && !outcomes.some((o) => o.orderId === head.id), "charged once, and nothing ordered from the book before the skip");
    check(/already been ordered/.test((await said(() => undoSkip(OWNER, third.skippedId))) ?? ""), "once the book after is ordered, the skip can't be undone");
    placeholder = await prisma.printOrder.findUniqueOrThrow({ where: { id: third.skippedId } });
    check(!placeholder.autoRenew && renewal?.autoRenew === true, "and auto-renew moved on to the new book");

    // Refused: someone else's order, and an older book of a journal.
    const theirs = await order(null, { ownerId: STRANGER, title: "Theirs", renewsAt: new Date(Date.now() + 5 * DAY) });
    const errors = [await said(() => skipNextBook(OWNER, theirs.id)), await said(() => stopAutoRenew(OWNER, theirs.id)), await said(() => startAutoRenew(OWNER, theirs.id))];
    check(errors.every((e) => /could not be found/.test(e ?? "")), `someone else's order can't be skipped, stopped or started (${errors.join(" | ")})`);
    const olderJournal = await journal("Older check");
    const older = await order(olderJournal, { title: "Older", renewsAt: new Date(Date.now() + 5 * DAY) });
    await order(olderJournal, { title: "Newer", startDate: new Date("2027-01-31T00:00:00Z"), endDate: new Date("2027-03-01T00:00:00Z"), renewsAt: new Date(Date.now() + 20 * DAY) });
    const olderErrors = [await said(() => skipNextBook(OWNER, older.id)), await said(() => startAutoRenew(OWNER, older.id))];
    check(olderErrors.every((e) => /later book follows/.test(e ?? "")), `an older book of a journal can't be skipped or switched on (${olderErrors.join(" | ")})`);
    await prisma.printOrder.updateMany({ where: { plannerId: { in: [plannerId, olderJournal] } }, data: { autoRenew: false, renewsAt: null } });

    // The email page's button: only with the link's own signature.
    const { actOnRenewal } = await import("../src/app/renewal/actions.js");
    const target = await order(await journal("Email check"), { title: "Email", renewsAt: new Date(Date.now() + 5 * DAY) });
    const form = (url: string) => {
      const parsed = new URL(url);
      const data = new FormData();
      data.set("orderId", decodeURIComponent(parsed.pathname.split("/").pop()!));
      data.set("do", parsed.searchParams.get("do")!);
      data.set("sig", parsed.searchParams.get("sig")!);
      return data;
    };
    const forged = form(renewalActionUrl(target.id, "pause"));
    forged.set("do", "skip");
    const refusal = await actOnRenewal({ error: null }, forged);
    const untouched = await prisma.printOrder.findUniqueOrThrow({ where: { id: target.id } });
    check(!!refusal.error && untouched.autoRenew, `a pause link's signature can't skip (${refusal.error})`);
    const redirected = await actOnRenewal({ error: null }, form(renewalActionUrl(target.id, "pause"))).then(
      () => false,
      (error: { digest?: string }) => /NEXT_REDIRECT/.test(error?.digest ?? "")
    );
    const paused = await prisma.printOrder.findUniqueOrThrow({ where: { id: target.id } });
    check(redirected && !paused.autoRenew && paused.renewsAt === null, "the pause link's button pauses, then shows the page again");
    // Pausing from an email sent before a skip stops the skipped book's renewal.
    const before = await order(await journal("Pause after skip check"), { title: "Pause after skip", renewsAt: new Date(Date.now() + 5 * DAY) });
    const later = await skipNextBook(OWNER, before.id);
    await actOnRenewal({ error: null }, form(renewalActionUrl(before.id, "pause"))).catch(() => undefined);
    const carried = await prisma.printOrder.findUniqueOrThrow({ where: { id: later.skippedId } });
    check(!carried.autoRenew && carried.renewsAt === null, "a pause from the email before a skip stops the book after the skip");
  }

  // --- what the emails say ------------------------------------------------------------
  {
    const { placedEmail, shippedEmail, adminAlertEmail } = await import("../src/lib/print/emails.js");
    const sample = { id: "o1", title: "Tom & Jerry's <Journal>", startDate: new Date("2027-01-04T00:00:00Z"), endDate: new Date("2027-04-03T00:00:00Z"), days: 90, binding: "COIL", pageCount: 128, totalCents: 3598, contactEmail: "c@example.com" };
    const placed = placedEmail(sample);
    check(placed.to === "c@example.com" && /\$35\.98/.test(placed.text) && /4 Jan – 3 Apr 2027/.test(placed.text) && /plastic coil/.test(placed.text), "the order email says what, when, how bound and how much");
    check(placed.html.includes("Tom &amp; Jerry&#39;s".replace("&#39;", "'")) && placed.html.includes("&lt;Journal&gt;") && !placed.html.includes("<Journal>"), "a title is escaped in the HTML, never markup");
    check(/auto-renew/i.test(placedEmail({ ...sample, renewedFromId: "o0" }).subject), "a renewal's order email says it was auto-renew");
    const shipped = shippedEmail(sample, ["https://track.example/1"]);
    check(shipped.text.includes("https://track.example/1"), "the shipped email carries the tracking link");
    const saved = process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_EMAIL;
    check(adminAlertEmail(sample, "why") === null, "no admin alert without ADMIN_EMAIL");
    process.env.ADMIN_EMAIL = "admin@example.com";
    check(adminAlertEmail(sample, "the printer refused")?.to === "admin@example.com", "and to ADMIN_EMAIL with it");
    if (saved === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = saved;
  }

  // --- the admin's guards ----------------------------------------------------------------
  // Retry and refund refuse what they must before touching Lulu or Stripe.
  {
    const { retryOrder, refundOrder, isAdmin } = await import("../src/lib/print/admin.js");
    const unpaid = await order(null, { title: "Never paid", status: "FAILED", autoRenew: false, renewsAt: null, stripePaymentIntentId: null });
    // refunded already: a CANCELED order with no reason is a refund still due (refundDue.ts)
    const cancelled = await order(null, { title: "Cancelled", status: "CANCELED", autoRenew: false, renewsAt: null, stripePaymentIntentId: "pi_cancelled", failureReason: "Refunded 2026-10-01: test" });
    const byCustomer = await order(null, { title: "Cancelled by them", status: "CANCELED", autoRenew: false, renewsAt: null, stripePaymentIntentId: "pi_by_customer", failureReason: "Cancelled by the customer 2026-10-01." });
    const shipped = await order(null, { title: "Shipped", status: "SHIPPED", autoRenew: false, renewsAt: null, stripePaymentIntentId: "pi_shipped" });
    const refused = async (run: () => Promise<unknown>) => run().then(() => false, () => true);
    check(await refused(() => retryOrder(unpaid.id, "http://localhost")), "an order never paid for is not sent to print");
    check(await refused(() => refundOrder(unpaid.id, "test")), "nor refunded");
    check(await refused(() => refundOrder(cancelled.id, "test")), "a cancelled order is not refunded twice");
    check(await refused(() => refundOrder(byCustomer.id, "test")), "nor one the customer cancelled and was refunded for");
    check(await refused(() => retryOrder(shipped.id, "http://localhost")), "a shipped order is not sent again");
    const saved = process.env.ADMIN_OWNER_IDS;
    process.env.ADMIN_OWNER_IDS = "user_a, user_b";
    check(isAdmin("user_b") && !isAdmin("user_c") && !isAdmin("") && !isAdmin(null), "admins are exactly the listed accounts");
    process.env.ADMIN_OWNER_IDS = "";
    check(!isAdmin("user_a"), "and nobody when none are listed");
    process.env.ADMIN_OWNER_IDS = saved;
  }

  // --- the customer's cancel ---------------------------------------------------------------
  {
    const { cancelByCustomer, customerCanCancel, applyLuluStatus } = await import("../src/lib/print/orders.js");
    type CancelDeps = import("../src/lib/print/orders.js").CancelDeps;
    const savedAdmin = process.env.ADMIN_EMAIL;
    process.env.ADMIN_EMAIL = "admin@example.com";
    /** The printer and Stripe, faked; every call recorded. */
    const cancelFakes = (options: { printerRefuses?: boolean; refundFails?: boolean } = {}) => {
      const calls = { stopped: [] as string[], refunded: [] as string[], emails: [] as Array<{ to: string; subject: string; text: string }> };
      const deps: CancelDeps = {
        stopAtPrinter: async (printerId, jobId) => {
          calls.stopped.push(`${printerId}:${jobId}`);
          if (options.printerRefuses) throw new Error("Lulu: job is in production (test)");
        },
        refund: async (paymentIntentId) => {
          calls.refunded.push(paymentIntentId);
          if (options.refundFails) throw new Error("Stripe is down (test)");
        },
        email: async (email) => {
          calls.emails.push(email);
          return { sent: true };
        },
      };
      return { deps, calls };
    };
    const waiting = { status: "SUBMITTED", autoRenew: true, renewsAt: new Date(Date.now() + 20 * DAY), luluStatus: "PRODUCTION_DELAYED", stripePaymentIntentId: "pi_cancel" };
    const said = (run: () => Promise<unknown>) => run().then(() => null, (error: Error) => error.message);

    // Stopped in time: the printer first, then the money, then the email.
    {
      const mine = await order(null, { ...waiting, title: "Cancel me", luluPrintJobId: "job_cancel_me" });
      check(customerCanCancel(mine), "a book waiting in the printer's hour can be cancelled");
      const { deps, calls } = cancelFakes();
      const error = await said(() => cancelByCustomer(OWNER, mine.id, deps));
      const after = await prisma.printOrder.findUniqueOrThrow({ where: { id: mine.id } });
      check(error === null && calls.stopped.join() === "lulu:job_cancel_me" && calls.refunded.join() === "pi_cancel", `the printer stops it, then the whole payment is refunded (${error ?? ""} ${calls.stopped} ${calls.refunded})`);
      check(after.status === "CANCELED" && !after.autoRenew && after.renewsAt === null, `it is CANCELED, auto-renew off (${after.status}, ${after.autoRenew})`);
      check(calls.emails.length === 1 && calls.emails[0].to === "check@example.com" && /refunded/.test(calls.emails[0].text), "and the customer is told by email, once");
      const again = cancelFakes();
      const second = await said(() => cancelByCustomer(OWNER, mine.id, again.deps));
      check(!!second && /already cancelled/.test(second) && again.calls.stopped.length === 0 && again.calls.refunded.length === 0, `pressed again: refused, nothing asked or refunded (${second})`);
      check(!customerCanCancel(after), "and the button is gone");
      // Lulu's "waiting" arriving after the cancel must not bring it back.
      await applyLuluStatus({ id: "job_cancel_me", status: { name: "PRODUCTION_DELAYED" } } as never);
      const late = await prisma.printOrder.findUniqueOrThrow({ where: { id: mine.id } });
      check(late.status === "CANCELED", `a late webhook leaves it cancelled (${late.status})`);
    }

    // The printer has begun: nothing refunded, the order as it was.
    {
      const begun = await order(null, { ...waiting, title: "Too late", luluPrintJobId: "job_too_late" });
      const { deps, calls } = cancelFakes({ printerRefuses: true });
      const error = await said(() => cancelByCustomer(OWNER, begun.id, deps));
      const after = await prisma.printOrder.findUniqueOrThrow({ where: { id: begun.id } });
      check(!!error && /can no longer be stopped/.test(error) && calls.stopped.length === 1, `the printer refuses: the customer is told it has started (${error})`);
      check(calls.refunded.length === 0 && calls.emails.length === 0 && after.status === "SUBMITTED" && after.autoRenew, "and nothing is refunded, emailed or changed");
    }

    // Refused before the printer is asked.
    {
      const printing = await order(null, { ...waiting, title: "Printing", status: "IN_PRODUCTION", luluStatus: "IN_PRODUCTION", luluPrintJobId: "job_printing" });
      const ready = await order(null, { ...waiting, title: "Ready", luluStatus: "PRODUCTION_READY", luluPrintJobId: "job_ready" });
      // Waiting in the printer's hour - cancellable, but not by us.
      const theirs = await order(null, { ...waiting, ownerId: STRANGER, title: "Theirs", luluPrintJobId: "job_theirs" });
      const { deps, calls } = cancelFakes();
      const errors = [await said(() => cancelByCustomer(OWNER, printing.id, deps)), await said(() => cancelByCustomer(OWNER, ready.id, deps)), await said(() => cancelByCustomer(OWNER, theirs.id, deps))];
      check(!customerCanCancel(printing) && !customerCanCancel(ready) && customerCanCancel(theirs), "no button on a book printing, or past the printer's hour");
      check(!!errors[0] && !!errors[1] && /could not be found/.test(errors[2] ?? ""), `and cancelling them anyway is refused (${errors.join(" | ")})`);
      check(calls.stopped.length === 0 && calls.refunded.length === 0, "before the printer or Stripe is asked");
    }

    // The refund fails: the book is still stopped, and we are told.
    {
      const stuck = await order(null, { ...waiting, title: "Refund fails", luluPrintJobId: "job_refund_fails", stripePaymentIntentId: "pi_refund_fails" });
      const { deps, calls } = cancelFakes({ refundFails: true });
      const error = await said(() => cancelByCustomer(OWNER, stuck.id, deps));
      const after = await prisma.printOrder.findUniqueOrThrow({ where: { id: stuck.id } });
      check(!!error && /stopped/.test(error) && /by hand/.test(error), `the customer is told it is stopped and the refund is coming (${error})`);
      check(after.status === "CANCELED" && /by hand/.test(after.failureReason ?? ""), `the order says so (${after.failureReason})`);
      check(calls.emails.some((e) => e.to === "admin@example.com" && /refund failed/.test(e.text)), "and the admin is alerted");
    }
    if (savedAdmin === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = savedAdmin;
  }

  // --- the printer's own cancel, refunds owed, a book sent once (review, 2026-10-27) ---
  {
    const { applyJobStatus, cancelByCustomer, SENDING } = await import("../src/lib/print/orders.js");
    const { refundOrder } = await import("../src/lib/print/admin.js");
    const { refundDue, PRINTER_CANCELLED, REFUND_BY_HAND } = await import("../src/lib/print/refundDue.js");
    type CancelDeps = import("../src/lib/print/orders.js").CancelDeps;
    type RefundDeps = import("../src/lib/print/admin.js").RefundDeps;
    type Sender = import("../src/lib/email.js").EmailSender;
    const savedAdmin = process.env.ADMIN_EMAIL;
    process.env.ADMIN_EMAIL = "admin@example.com";
    const mail = () => {
      const sent: Array<{ to: string; text: string }> = [];
      const send: Sender = async (email) => {
        sent.push({ to: email.to, text: email.text });
        return { sent: true };
      };
      return { sent, send };
    };
    const waiting = { status: "SUBMITTED", autoRenew: true, renewsAt: new Date(Date.now() + 20 * DAY), luluStatus: "PRODUCTION_DELAYED" };
    const cancelled = { name: "CANCELED", status: "CANCELED" as const, tracking: [] as string[] };
    const said = (run: () => Promise<unknown>) => run().then(() => null, (error: Error) => error.message);

    // The printer stops a paid book unasked: we are told, the refund is due.
    {
      const own = await order(null, { ...waiting, title: "Printer's own cancel", luluPrintJobId: "job_printer_own", stripePaymentIntentId: "pi_printer_own" });
      const { sent, send } = mail();
      await applyJobStatus("job_printer_own", { ...cancelled, message: "file rejected (test)" }, send);
      const after = await prisma.printOrder.findUniqueOrThrow({ where: { id: own.id } });
      check(after.status === "CANCELED" && (after.failureReason ?? "").startsWith(PRINTER_CANCELLED) && refundDue(after), `THE PRINTER CANCELLING A PAID BOOK ITSELF LEAVES A REFUND DUE (${after.failureReason})`);
      check(!after.autoRenew && after.renewsAt === null, "and auto-renew off");
      check(sent.length === 1 && sent[0].to === "admin@example.com" && /has not been refunded/.test(sent[0].text), `and we are told (${sent.length} email(s))`);
      await applyJobStatus("job_printer_own", cancelled, send);
      check(sent.length === 1, "once, however often the printer says so");

      // the admin refunds it: Stripe asked once, the printer not at all
      const calls = { stopped: [] as string[], keys: [] as string[] };
      const deps: RefundDeps = {
        stopAtPrinter: async (_printer, job) => {
          calls.stopped.push(job);
        },
        refund: async (_params, key) => {
          calls.keys.push(key);
        },
      };
      const error = await said(() => refundOrder(own.id, "the printer cancelled it", deps));
      const refunded = await prisma.printOrder.findUniqueOrThrow({ where: { id: own.id } });
      check(error === null && calls.keys.length === 1 && calls.keys[0].startsWith(`refund-${own.id}-due-`) && calls.stopped.length === 0, `THE ADMIN CAN REFUND IT, the printer not asked again (${error ?? calls.keys.join()})`);
      check(refunded.status === "CANCELED" && /^Refunded /.test(refunded.failureReason ?? "") && !refundDue(refunded), `and then it is refunded, and no longer due (${refunded.failureReason})`);
      const again = await said(() => refundOrder(own.id, "again", deps));
      check(!!again && /already cancelled/.test(again) && calls.keys.length === 1, "and not twice");
    }

    // A stop we asked for, the printer's word landing before our own write:
    // no alert, and the cancel finishes as the customer's.
    {
      const mine = await order(null, { ...waiting, title: "Race", luluPrintJobId: "job_race", stripePaymentIntentId: "pi_race" });
      const { sent, send } = mail();
      const refunds: string[] = [];
      const told: string[] = [];
      const deps: CancelDeps = {
        stopAtPrinter: async (_printer, job) => applyJobStatus(job, cancelled, send),
        refund: async (paymentIntentId) => {
          refunds.push(paymentIntentId);
        },
        email: async (email) => {
          told.push(email.to);
          return { sent: true };
        },
      };
      const error = await said(() => cancelByCustomer(OWNER, mine.id, deps));
      const after = await prisma.printOrder.findUniqueOrThrow({ where: { id: mine.id } });
      check(error === null && sent.length === 0, `A STOP WE ASKED FOR IS NOT TAKEN FOR THE PRINTER'S OWN, even when its word lands first (${error ?? ""}; ${sent.length} alert(s))`);
      check(/^Cancelled by the customer/.test(after.failureReason ?? "") && !refundDue(after) && refunds.join() === "pi_race" && told.length === 1, `and the customer's cancel finishes: refunded, its reason written, the customer told (${after.failureReason}; ${told.length})`);
    }

    // A stop asked for hours ago: nothing of ours is under way now.
    {
      const stale = await order(null, { ...waiting, title: "Stale ask", luluPrintJobId: "job_stale_ask", stripePaymentIntentId: "pi_stale", cancelAskedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
      const { sent, send } = mail();
      await applyJobStatus("job_stale_ask", cancelled, send);
      const after = await prisma.printOrder.findUniqueOrThrow({ where: { id: stale.id } });
      check(refundDue(after) && sent.length === 1, "a stop asked for hours ago does not hide the printer's own");
    }

    // A refund that failed: the admin makes it, with a new key each try.
    {
      const failed = await order(null, { title: "Refund failed", status: "CANCELED", autoRenew: false, renewsAt: null, stripePaymentIntentId: "pi_failed_before", failureReason: `Cancelled by the customer 2026-10-01; ${REFUND_BY_HAND}: Stripe is down (test)` });
      const keys: string[] = [];
      const failing: RefundDeps = {
        stopAtPrinter: async () => {},
        refund: async (_params, key) => {
          keys.push(key);
          throw new Error("still down (test)");
        },
      };
      const first = await said(() => refundOrder(failed.id, "by hand", failing));
      const between = await prisma.printOrder.findUniqueOrThrow({ where: { id: failed.id } });
      check(!!first && refundDue(between) && (between.failureReason ?? "").split(REFUND_BY_HAND).length === 2 && /still down/.test(between.failureReason ?? ""), `a refund failing again stays due, saying the latest why once (${between.failureReason})`);
      const working: RefundDeps = {
        stopAtPrinter: async () => {},
        refund: async (_params, key) => {
          keys.push(key);
        },
      };
      await refundOrder(failed.id, "by hand", working);
      const done = await prisma.printOrder.findUniqueOrThrow({ where: { id: failed.id } });
      check(keys.length === 2 && keys[0] !== keys[1] && !refundDue(done), `A REFUND TRIED AGAIN AFTER ONE FAILED GOES TO STRIPE WITH A NEW KEY (${keys.join(" | ")})`);
    }

    // The admin's Refund on a book with the printer: its own stop, the
    // printer's word landing during the refund, is no "cancelled itself".
    {
      const mine = await order(null, { ...waiting, title: "Admin race", luluPrintJobId: "job_admin_race", stripePaymentIntentId: "pi_admin_race" });
      const { sent, send } = mail();
      const deps: RefundDeps = {
        stopAtPrinter: async (_printer, job) => applyJobStatus(job, cancelled, send),
        refund: async () => {},
      };
      const error = await said(() => refundOrder(mine.id, "asked by the customer", deps));
      const after = await prisma.printOrder.findUniqueOrThrow({ where: { id: mine.id } });
      check(error === null && sent.length === 0 && /^Refunded /.test(after.failureReason ?? "") && !refundDue(after), `THE ADMIN'S OWN STOP IS NOT TAKEN FOR THE PRINTER'S (${error ?? ""}; ${sent.length} alert(s); ${after.failureReason})`);
    }

    // Refunded already in Stripe's dashboard: the next press clears it.
    {
      const handled = await order(null, { title: "Refunded by hand", status: "CANCELED", autoRenew: false, renewsAt: null, stripePaymentIntentId: "pi_by_hand", failureReason: `Cancelled by the customer 2026-10-01; ${REFUND_BY_HAND}: Stripe is down (test)` });
      const deps: RefundDeps = {
        stopAtPrinter: async () => {},
        refund: async () => {
          throw Object.assign(new Error("Charge ch_test has already been refunded."), { code: "charge_already_refunded" });
        },
      };
      const error = await said(() => refundOrder(handled.id, "made in Stripe", deps));
      const after = await prisma.printOrder.findUniqueOrThrow({ where: { id: handled.id } });
      check(error === null && !refundDue(after) && /already/.test(after.failureReason ?? ""), `A REFUND MADE IN STRIPE'S DASHBOARD CLEARS AT THE NEXT PRESS (${error ?? ""}; ${after.failureReason})`);
    }

    // Stopped at the printer, then Stripe fails: no book is coming, so the
    // order is CANCELED with the refund due, and the next press has a new key.
    {
      const stopped = await order(null, { ...waiting, title: "Stopped, then failed", luluPrintJobId: "job_stop_then_fail", stripePaymentIntentId: "pi_stop_then_fail" });
      const keys: string[] = [];
      const failing: RefundDeps = {
        stopAtPrinter: async () => {},
        refund: async (_params, key) => {
          keys.push(key);
          throw new Error("reverse transfer failed (test)");
        },
      };
      await said(() => refundOrder(stopped.id, "asked", failing));
      const between = await prisma.printOrder.findUniqueOrThrow({ where: { id: stopped.id } });
      check(between.status === "CANCELED" && refundDue(between) && !between.autoRenew, `A REFUND THAT FAILS AFTER THE BOOK WAS STOPPED LEAVES IT DUE (${between.status}: ${between.failureReason})`);
      const working: RefundDeps = {
        stopAtPrinter: async () => {},
        refund: async (_params, key) => {
          keys.push(key);
        },
      };
      await refundOrder(stopped.id, "asked", working);
      const done = await prisma.printOrder.findUniqueOrThrow({ where: { id: stopped.id } });
      check(keys.length === 2 && keys[0] !== keys[1] && !refundDue(done), `and the next press makes it, with a new key (${keys.join(" | ")})`);
      // a book that has shipped keeps its status, and the refund is due all the same
      const shipped = await order(null, { title: "Shipped, refund fails", status: "SHIPPED", autoRenew: true, renewsAt: new Date(Date.now() + 20 * DAY), luluPrintJobId: "job_shipped_refund", stripePaymentIntentId: "pi_shipped_refund" });
      await said(() => refundOrder(shipped.id, "damaged", failing));
      const left = await prisma.printOrder.findUniqueOrThrow({ where: { id: shipped.id } });
      check(left.status === "SHIPPED" && refundDue(left) && !left.autoRenew && left.renewsAt === null, `a shipped book whose refund fails stays SHIPPED, the refund due, and renews no more (${left.status}: ${left.failureReason}; autoRenew ${left.autoRenew})`);
      // a bank payment still clearing: refused before Stripe is asked
      const clearing = await order(null, { title: "Clearing", status: "QUOTED", autoRenew: false, renewsAt: null, stripePaymentIntentId: "pi_clearing_refund" });
      const asked: string[] = [];
      const refusal = await said(() => refundOrder(clearing.id, "asked", { stopAtPrinter: async () => {}, refund: async (_params, key) => { asked.push(key); } }));
      const still = await prisma.printOrder.findUniqueOrThrow({ where: { id: clearing.id } });
      check(!!refusal && /not cleared/.test(refusal) && asked.length === 0 && still.status === "QUOTED" && still.failureReason === null, `A BANK PAYMENT STILL CLEARING IS NOT REFUNDED, nor marked owed (${refusal})`);
    }

    // Sent once: two deliveries of one payment at once, one print job.
    {
      const { LULU } = await import("../src/lib/print/printer.js");
      const real = LULU.submit;
      let jobs = 0;
      LULU.submit = async () => {
        jobs += 1;
        await new Promise((resolve) => setTimeout(resolve, 400));
        return { jobId: `job_claim_${jobs}`, status: "CREATED" };
      };
      try {
        const paying = await order(null, { title: "Sent once", status: "QUOTED", autoRenew: false, renewsAt: null, stripePaymentIntentId: null, luluStatus: null });
        await Promise.all([fulfilPaidOrder(paying.id, { paymentIntentId: "pi_once" }, "https://example.com"), fulfilPaidOrder(paying.id, { paymentIntentId: "pi_once" }, "https://example.com")]);
        const after = await prisma.printOrder.findUniqueOrThrow({ where: { id: paying.id } });
        check(jobs === 1 && after.status === "SUBMITTED" && after.luluPrintJobId === "job_claim_1", `TWO DELIVERIES AT ONCE SEND THE BOOK TO THE PRINTER ONCE (${jobs} job(s), ${after.status})`);
        // a run that ended part way: claimed, and not sent again by a late delivery
        const stuck = await order(null, { title: "Interrupted", status: "PAID", autoRenew: false, renewsAt: null, stripePaymentIntentId: "pi_stuck", luluStatus: SENDING });
        await fulfilPaidOrder(stuck.id, { paymentIntentId: "pi_stuck" }, "https://example.com");
        check(jobs === 1, "an order already being sent is not sent again");
        // the printer refusing: FAILED, and unclaimed for Retry
        LULU.submit = async () => {
          throw new Error("Lulu said no (test)");
        };
        const refusing = await order(null, { title: "Refused", status: "QUOTED", autoRenew: false, renewsAt: null, stripePaymentIntentId: null, luluStatus: null });
        await fulfilPaidOrder(refusing.id, { paymentIntentId: "pi_refused" }, "https://example.com").catch(() => {});
        const refused = await prisma.printOrder.findUniqueOrThrow({ where: { id: refusing.id } });
        check(refused.status === "FAILED" && refused.luluStatus === null, `a refusal leaves it FAILED and unclaimed, for Retry (${refused.status}, ${refused.luluStatus})`);
      } finally {
        LULU.submit = real;
      }
    }
    if (savedAdmin === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = savedAdmin;
  }

  // --- print files ---------------------------------------------------------------------
  {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const files = { create: [{ kind: "interior", bytes }, { kind: "cover", bytes }] };
    const oldDelivered = await order(null, { title: "Old delivered", status: "DELIVERED", autoRenew: false, renewsAt: null, files });
    const recentDelivered = await order(null, { title: "Recent delivered", status: "DELIVERED", autoRenew: false, renewsAt: null, files });
    const oldQuoted = await order(null, { title: "Abandoned", status: "QUOTED", autoRenew: false, renewsAt: null, files, createdAt: new Date(Date.now() - 40 * DAY) });
    const printing = await order(null, { title: "Printing", status: "IN_PRODUCTION", autoRenew: false, renewsAt: null, files });
    // A printer that never says delivered (BookVault): a month for the post.
    const oldShipped = await order(null, { title: "Old shipped", status: "SHIPPED", autoRenew: false, renewsAt: null, files });
    const yearShipped = await order(null, { title: "Shipped a year ago", status: "SHIPPED", autoRenew: false, renewsAt: null, files });
    await prisma.printOrder.update({ where: { id: oldDelivered.id }, data: { updatedAt: new Date(Date.now() - 400 * DAY) } });
    await prisma.printOrder.update({ where: { id: oldShipped.id }, data: { updatedAt: new Date(Date.now() - 400 * DAY) } });
    await prisma.printOrder.update({ where: { id: yearShipped.id }, data: { updatedAt: new Date(Date.now() - 370 * DAY) } });
    await pruneOldPrintFiles(new Date());
    const left = async (id: string) => prisma.printFile.count({ where: { orderId: id } });
    check((await left(oldDelivered.id)) === 0, "files of a book delivered over a year ago are deleted");
    check((await left(oldQuoted.id)) === 0, "an abandoned checkout's files go after a month");
    check((await left(oldShipped.id)) === 0, "a book shipped 13 months ago and never reported delivered: deleted");
    check((await left(yearShipped.id)) === 2, "one shipped a year ago keeps them a month more, for the post");
    check((await left(recentDelivered.id)) === 2 && (await left(printing.id)) === 2, "everything else keeps its files");
    check((await prisma.printOrder.count({ where: { id: oldDelivered.id } })) === 1, "and the order itself is kept");
  }
} finally {
  await cleanUp();
  await prisma.$disconnect();
}

if (failures > 0) {
  console.error(`\n${failures} renewal check(s) failed.`);
  process.exit(1);
}
console.log("\nRenewals: renewed once with the saved card, stopped with a reason when they can't be, files kept a year; cancels refund only what the printer stopped.");
