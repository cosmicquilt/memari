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
//     after a month, and nothing else's.
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
  const calls = { charge: [] as Array<{ orderId: string; amountCents: number; paymentMethodId: string }>, fulfil: [] as string[] };
  const deps: Deps = {
    printCost: async () => ({ printCents: 1100, fulfillmentCents: 75, shippingCents: 599, taxCents: 0, totalCents: 1774, currency: "USD" }),
    coverDimensions: async () => ({ widthPt: 1046, heightPt: 738 }),
    charge: async (input) => {
      calls.charge.push(input);
      return options.decline ? { ok: false, reason: "your card was declined (test)" } : { ok: true, paymentIntentId: `pi_${input.orderId}` };
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
  await prisma.printOrder.deleteMany({ where: { ownerId: OWNER } });
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
    check(renewal?.status === "FAILED" && /more than coil-bound can hold/.test(renewal.failureReason ?? "") && calls.charge.length === 0, `too thick for its binding: FAILED, nothing charged (${renewal?.failureReason})`);
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
console.log("\nRenewals: renewed once with the saved card, stopped with a reason when they can't be, files kept a year.");
