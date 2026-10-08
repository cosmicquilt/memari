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
//   - print files are deleted a year after delivery, abandoned checkouts'
//     after a month, and nothing else's;
//   - a customer's cancel asks the printer FIRST and refunds only if it
//     agrees, once however often it is pressed; a book the printer has begun,
//     or someone else's, is refused before the printer is asked; a refund
//     that fails still leaves the book stopped and tells us; and a late
//     webhook cannot bring a cancelled book back.
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
    check(first.includes(soon.id) && second.length === 0 && sent.filter((e) => /Auto-renew|ordered soon/.test(e.subject + e.text)).length >= 1, `a renewal 5 days off is reminded, once (${first.length} then ${second.length})`);
    const mine = sent.find((e) => e.text.includes("Reminder") || e.subject.includes("soon"));
    check(!!mine && /turn auto-renew off/i.test(mine.text) && /own/.test(mine.text), "the reminder says how to stop, and that the price is the next book's own");
    check(!first.includes(far.id) && !first.includes(tomorrow.id) && !first.includes(off.id), "not one a month off, not one renewing within the day, not one with auto-renew off");
    // Run on the very same day and again - each renewal is reminded once.
    await prisma.printOrder.updateMany({ where: { id: { in: [soon.id, far.id, tomorrow.id, off.id] } }, data: { autoRenew: false } });
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
    const cancelled = await order(null, { title: "Cancelled", status: "CANCELED", autoRenew: false, renewsAt: null, stripePaymentIntentId: "pi_cancelled" });
    const shipped = await order(null, { title: "Shipped", status: "SHIPPED", autoRenew: false, renewsAt: null, stripePaymentIntentId: "pi_shipped" });
    const refused = async (run: () => Promise<unknown>) => run().then(() => false, () => true);
    check(await refused(() => retryOrder(unpaid.id, "http://localhost")), "an order never paid for is not sent to print");
    check(await refused(() => refundOrder(unpaid.id, "test")), "nor refunded");
    check(await refused(() => refundOrder(cancelled.id, "test")), "a cancelled order is not refunded twice");
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

  // --- print files ---------------------------------------------------------------------
  {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const files = { create: [{ kind: "interior", bytes }, { kind: "cover", bytes }] };
    const oldDelivered = await order(null, { title: "Old delivered", status: "DELIVERED", autoRenew: false, renewsAt: null, files });
    const recentDelivered = await order(null, { title: "Recent delivered", status: "DELIVERED", autoRenew: false, renewsAt: null, files });
    const oldQuoted = await order(null, { title: "Abandoned", status: "QUOTED", autoRenew: false, renewsAt: null, files, createdAt: new Date(Date.now() - 40 * DAY) });
    const printing = await order(null, { title: "Printing", status: "IN_PRODUCTION", autoRenew: false, renewsAt: null, files });
    await prisma.printOrder.update({ where: { id: oldDelivered.id }, data: { updatedAt: new Date(Date.now() - 400 * DAY) } });
    await pruneOldPrintFiles(new Date());
    const left = async (id: string) => prisma.printFile.count({ where: { orderId: id } });
    check((await left(oldDelivered.id)) === 0, "files of a book delivered over a year ago are deleted");
    check((await left(oldQuoted.id)) === 0, "an abandoned checkout's files go after a month");
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
