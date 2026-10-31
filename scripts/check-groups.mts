// npm run check:groups - groups that start together (2026-10-31), end to end.
//
//   THE SCREENS, as a guest coach in a real browser: a group made in one go
//   from a pasted list (one of them already a client, who joins as they
//   are), its journals built as its page opens, every book to one place,
//   which the clients list, the client's screen and the client's own page
//   all say; someone taken out and put back; a list that can't be read
//   adding nobody; books home again; a group deleted, its people kept.
//
//   THE ORDER, through the same functions the screens call: who can have a
//   book (one with a book for those days already is left out), the post
//   priced once for a group sent to one place, each book made at the price
//   shown (and not at another), Stripe's real test page for all of them, a
//   newer page closing the older, the paid books sent to the printer (its
//   submit stubbed) with one email however often Stripe says so, one book
//   refunded by its own part, and a bank payment that fails, through the
//   webhook itself.
//
//   npm run check:groups -- <shots folder>

import "./appUnderTest.mjs";
import { chromium, type Page } from "playwright-core";
import { ensureServer, makeGuestJournal, disconnect } from "./appUnderTest.mjs";
import { prisma } from "../src/lib/prisma";
import { makeClientLink } from "../src/lib/clientPortal";
import { PAGE_REPLACED, PriceMovedError } from "../src/lib/print/orders";
import { failClearingBatch, fulfilPaidBatch, openGroupPayment, prepareGroupBook, quoteGroupOrder, recordClearingBatch, startGroupBatch } from "../src/lib/print/groupOrders";
import { refundOrder } from "../src/lib/print/admin";
import { stripe } from "../src/lib/print/stripe";
import { LULU } from "../src/lib/print/printer";
import type { Email } from "../src/lib/email";

const shots = process.argv[2];
const server = await ensureServer(process.env.BASE);
const browser = await chromium.launch({ channel: "chrome", headless: true });
let failures = 0;
const say = (ok: boolean, what: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
};
const HIDE_DEV = `addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal { display: none !important; }"; document.head.append(s); });`;
const shoot = async (tab: Page, name: string) => {
  if (shots) await tab.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};
const text = (tab: Page) => tab.evaluate(() => document.body.innerText);

const START = "2027-01-04";
const guest = await makeGuestJournal("Clarity Quarterly");
const sessions: string[] = [];
try {
  const business = await prisma.business.create({ data: { ownerId: guest.ownerId, name: "Northwind Coaching" } });
  const template = await prisma.businessTemplate.create({ data: { businessId: business.id, plannerId: guest.journalId } });
  // already a client, by email: joins the group as she is
  const ana = await prisma.businessClient.create({ data: { businessId: business.id, name: "Ana Lima", email: "ana@example.com", note: "kept" } });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([{ name: guest.cookieName, value: guest.cookieValue, domain: new URL(server.base).hostname, path: "/" }]);
  await context.addInitScript(HIDE_DEV);
  const tab = await context.newPage();

  // ---- THE SCREENS
  await tab.goto(`${server.base}/app/business/groups`, { waitUntil: "networkidle" });
  say((await tab.getByRole("link", { name: "Groups" }).count()) > 0 && /No groups yet/.test(await text(tab)), "Groups is in the menu, and says when there are none");
  await shoot(tab, "groups-empty");

  // a list that can't be read adds nobody, and says which line
  await tab.getByRole("link", { name: "New group" }).first().click();
  await tab.getByRole("heading", { name: "New group" }).waitFor();
  await tab.getByLabel("Group name").fill("Broken list");
  await tab.getByLabel("Names, one a line").fill("Jo, jo@example.com, jo2@example.com");
  await tab.getByRole("button", { name: "Make the group" }).click();
  await tab.getByRole("alert").filter({ hasText: "two email" }).waitFor();
  say((await prisma.businessGroup.count({ where: { businessId: business.id } })) === 0, "A LIST WITH A LINE THAT CAN'T BE READ ADDS NOBODY, and says which line");

  // the group, in one go
  await tab.getByLabel("Group name").fill("January cohort");
  say((await tab.locator('select[name="templateId"]').inputValue()) === template.id, "the template is chosen for a new group");
  say(!(await tab.locator("[data-venue-fields]").isVisible()), "books home (the default): the place's address is not asked for");
  await tab.locator('input[name="startDate"]').fill(START);
  await tab.getByLabel("All to one place").check();
  await tab.locator('input[name="addressName"]').fill("Northwind at Hotel Lumen");
  await tab.locator('input[name="street1"]').fill("120 Congress Ave");
  await tab.locator('input[name="city"]').fill("Austin");
  await tab.locator('input[name="stateCode"]').fill("TX");
  await tab.locator('input[name="postcode"]').fill("78701");
  await tab.locator('input[name="phoneNumber"]').fill("+1 512 555 0100");
  await tab.getByLabel("Names, one a line").fill("Maya Okafor, maya@example.com\nSam Lee <sam@example.com>\nana@example.com\tAna Lima");
  await shoot(tab, "groups-new");
  await tab.getByRole("button", { name: "Make the group" }).click();
  await tab.waitForURL(/\/app\/business\/groups\/[^/?]+/);
  // its journals build as the page opens
  await tab.getByText("3 of 3 built").waitFor({ timeout: 120_000 });
  const group = await prisma.businessGroup.findFirstOrThrow({ where: { businessId: business.id }, include: { clients: { orderBy: { name: "asc" } } } });
  const [anaNow, maya, sam] = group.clients;
  say(group.clients.length === 3 && anaNow.id === ana.id && anaNow.note === "kept", "THE GROUP IS MADE IN ONE GO: two new clients, and Ana, already one, joins as she is");
  say(
    group.clients.every((c) => c.plannerId && c.templateId === template.id && c.bookMonths === 3 && c.startDate?.toISOString().startsWith(START)),
    "each has the group's template, start and length, and a journal built from it"
  );
  say(!/[?&]build=1/.test(tab.url()), "the build step leaves the address once it is done");
  say(/Sign in/.test(await text(tab)), "a guest coach is asked to sign in to order the group's books");
  say(/Sign in to have Memari email them/.test(await text(tab)) && (await tab.getByRole("button", { name: /Email \d+ people/ }).count()) === 0, "and told to sign in for the emails, not offered a button that would fail for each");
  await shoot(tab, "groups-page");

  // the place, said everywhere
  await tab.goto(`${server.base}/app/business/clients`, { waitUntil: "networkidle" });
  const list = await text(tab);
  say((list.match(/January cohort/g) ?? []).length === 3, "the clients list names each one's group");
  say(!/\bAddress\b/.test(list.replace(/Download all|Address given/g, "")), "nobody in it needs an address: the group's place counts");
  await shoot(tab, "groups-clients");
  await tab.goto(`${server.base}/app/business/clients/${maya.id}`, { waitUntil: "networkidle" });
  say(/In January cohort: their books go to Northwind at Hotel Lumen, Austin/.test(await text(tab)), "Maya's screen says her books go to the group's place");
  say((await tab.getByRole("link", { name: "Order their book" }).getAttribute("aria-disabled")) === null, "and her book can be ordered there");
  const token = await makeClientLink(guest.ownerId, maya.id);
  await tab.goto(`${server.base}/c/${token}`, { waitUntil: "networkidle" });
  say(/your books are sent to Northwind at Hotel Lumen, 120 Congress Ave, Austin, with the rest of your group/.test(await text(tab)), "HER OWN PAGE SAYS WHERE HER BOOKS GO, with her group");
  await shoot(tab, "groups-portal");

  // taken out, and put back
  await tab.goto(`${server.base}/app/business/groups/${group.id}`, { waitUntil: "networkidle" });
  await tab.getByRole("button", { name: "Take Sam Lee out of the group" }).click();
  await tab.getByRole("status").filter({ hasText: "out of the group" }).waitFor();
  say((await prisma.businessClient.findUniqueOrThrow({ where: { id: sam.id } })).groupId === null, "Take out takes him out at once");
  await tab.getByRole("button", { name: "Undo" }).click();
  await tab.waitForTimeout(1000);
  say((await prisma.businessClient.findUniqueOrThrow({ where: { id: sam.id } })).groupId === group.id, "Undo puts him back");

  // ---- THE ORDER
  const binding = "paperback" as const;
  let asked = 0;
  const realQuote = LULU.quoteShipping;
  LULU.quoteShipping = async (...args) => {
    asked += 1;
    return realQuote(...args);
  };
  const quote = await quoteGroupOrder(guest.ownerId, group.id, { startISO: START, binding });
  LULU.quoteShipping = realQuote;
  const option = quote.options[0];
  say(quote.members.length === 3 && quote.members.every((m) => m.ok) && !!option, `THE GROUP IS PRICED: all three, ${quote.options.map((o) => o.level).join(", ")}`);
  say(asked === 1, `one book to one place: the printer asked once for all of them (${asked})`);
  say(!!option && Object.values(option.perBook).reduce((s, c) => s + c, 0) === option.totalCents, "each book's price adds up to the total");

  // one with a book for those days already is left out
  const held = await prisma.printOrder.create({
    data: {
      ownerId: guest.ownerId, plannerId: sam.plannerId, title: "Sam's own", startDate: new Date(`${START}T00:00:00Z`), endDate: new Date("2027-04-03T00:00:00Z"), days: 90, binding: "PAPERBACK",
      podPackageId: "x", pageCount: 100, shippingLevel: "MAIL", shippingAddress: {}, bookCents: 1, shippingCents: 1, totalCents: 2, costCents: 1, status: "SUBMITTED",
    },
  });
  const without = await quoteGroupOrder(guest.ownerId, group.id, { startISO: START, binding });
  const samLine = without.members.find((m) => m.clientId === sam.id);
  say(!!samLine && !samLine.ok && /book for these days/.test(samLine.why) && without.members.filter((m) => m.ok).length === 2, `ONE WITH A BOOK FOR THOSE DAYS ALREADY IS LEFT OUT (${samLine && !samLine.ok ? samLine.why : ""})`);
  await prisma.printOrder.delete({ where: { id: held.id } });
  let past = "";
  await quoteGroupOrder(guest.ownerId, group.id, { startISO: "2020-01-06", binding }).catch((e: Error) => (past = e.message));
  say(/today or later/.test(past), "days already gone are refused");

  // each book made at the price shown, and not at another
  const ready = quote.members.filter((m) => m.ok);
  const order = { startISO: START, days: quote.range.days, binding, paper: quote.paper, level: option.level };
  const batch = await startGroupBatch(guest.ownerId, group.id);
  let moved: unknown = null;
  await prepareGroupBook(guest.ownerId, batch, ready[0].clientId, { ...order, expectCents: option.perBook[ready[0].clientId] + 1 }).catch((e) => (moved = e));
  say(moved instanceof PriceMovedError && (await prisma.printOrder.count({ where: { batchId: batch } })) === 0, "A BOOK AT ANOTHER PRICE THAN SHOWN IS NOT MADE");
  for (const m of ready) await prepareGroupBook(guest.ownerId, batch, m.clientId, { ...order, expectCents: option.perBook[m.clientId] });
  const again = await prepareGroupBook(guest.ownerId, batch, ready[0].clientId, { ...order, expectCents: option.perBook[ready[0].clientId] });
  const made = await prisma.printOrder.findMany({ where: { batchId: batch }, include: { files: { select: { kind: true } } } });
  say(made.length === 3 && made.some((o) => o.id === again.orderId), "each book made once, asked twice or not");
  say(made.every((o) => o.status === "QUOTED" && o.files.length === 2 && !o.autoRenew && o.totalCents === option.perBook[group.clients.find((c) => c.plannerId === o.plannerId)!.id]), "each with its two files, at its own price, never renewing");
  const counted = new Map(quote.members.flatMap((m) => (m.ok ? [[group.clients.find((c) => c.id === m.clientId)!.plannerId!, m.pageCount]] : [])));
  say(made.every((o) => counted.get(o.plannerId!) === o.pageCount), `THE PAGES COUNTED TO PRICE IT ARE THE PAGES MADE (${made.map((o) => `${o.pageCount}/${counted.get(o.plannerId!)}`).join(", ")})`);
  say(made.every((o) => (o.shippingAddress as { city?: string }).city === "Austin"), "every book to the group's place");

  // Stripe's real test page, for all of them
  let wrongTotal: unknown = null;
  await openGroupPayment(guest.ownerId, batch, option.totalCents - 1, server.base, "coach@example.com").catch((e) => (wrongTotal = e));
  say(wrongTotal instanceof PriceMovedError, "a total other than shown opens no page");
  // two presses at once: one page (review, 2026-10-31)
  const both = await Promise.allSettled([0, 1].map(() => openGroupPayment(guest.ownerId, batch, option.totalCents, server.base, "coach@example.com")));
  const opened = both.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
  const first = await prisma.printBatch.findUniqueOrThrow({ where: { id: batch } });
  sessions.push(first.stripeCheckoutSessionId!);
  const url = opened[0]?.value ?? "";
  say(opened.length === 1 && both.some((r) => r.status === "rejected" && /gone to payment/.test(String(r.reason))), `TWO PRESSES AT ONCE OPEN ONE PAGE, not two (${opened.length} opened)`);
  const page = await stripe().checkout.sessions.retrieve(first.stripeCheckoutSessionId!, { expand: ["line_items"] });
  say(/^https:\/\/checkout\.stripe\.com\//.test(url) && page.amount_total === option.totalCents && page.line_items?.data.length === 4, `ONE STRIPE PAGE FOR ALL THREE: ${page.amount_total} cents, ${page.line_items?.data.length} lines`);
  say((await prisma.printOrder.count({ where: { batchId: batch, stripeCheckoutSessionId: first.stripeCheckoutSessionId } })) === 3, "each book carries the page's id");

  // a newer page for the same days closes the older
  const batch2 = await startGroupBatch(guest.ownerId, group.id);
  for (const m of ready) await prepareGroupBook(guest.ownerId, batch2, m.clientId, { ...order, expectCents: option.perBook[m.clientId] });
  await openGroupPayment(guest.ownerId, batch2, option.totalCents, server.base, "coach@example.com");
  const second = await prisma.printBatch.findUniqueOrThrow({ where: { id: batch2 } });
  sessions.push(second.stripeCheckoutSessionId!);
  const older = await stripe().checkout.sessions.retrieve(first.stripeCheckoutSessionId!);
  const replaced = await prisma.printOrder.findMany({ where: { batchId: batch } });
  say(older.status === "expired" && replaced.every((o) => o.failureReason === PAGE_REPLACED && o.stripeCheckoutSessionId === null), `A NEWER GROUP PAGE FOR THE SAME DAYS CLOSES THE OLDER (${older.status})`);

  // paid: each to the printer, one email however often Stripe says so
  const realSubmit = LULU.submit;
  let jobs = 0;
  LULU.submit = async () => ({ jobId: `job_group_${++jobs}`, status: "CREATED" });
  const emails: Email[] = [];
  const send = async (e: Email) => (emails.push(e), { sent: true });
  try {
    const sent = await fulfilPaidBatch(batch2, second.stripeCheckoutSessionId!, { paymentIntentId: "pi_group_check" }, server.base, "coach@example.com", send);
    const twice = await fulfilPaidBatch(batch2, second.stripeCheckoutSessionId!, { paymentIntentId: "pi_group_check" }, server.base, "coach@example.com", send);
    const paid = await prisma.printOrder.findMany({ where: { batchId: batch2 } });
    say(sent === 3 && twice === 0 && jobs === 3 && paid.every((o) => o.status === "SUBMITTED" && o.stripePaymentIntentId === "pi_group_check"), `PAID: EACH BOOK TO THE PRINTER ONCE (${jobs} jobs; ${sent} then ${twice})`);
    say(emails.length === 1 && /3 books with the printer/.test(emails[0].subject) && ["Ana Lima", "Maya Okafor", "Sam Lee"].every((n) => emails[0].text.includes(n)), `ONE EMAIL FOR ALL OF THEM, not one each, and not twice (${emails.map((e) => e.subject).join(" | ")})`);
    await shoot(tab, "groups-after");

    // one book refunded by its own part
    let params: { amount?: number; payment_intent?: string } | null = null;
    await refundOrder(paid[0].id, "check", { stopAtPrinter: async () => {}, refund: async (p) => void (params = p as typeof params) });
    say(params!.payment_intent === "pi_group_check" && params!.amount === paid[0].totalCents, `ONE BOOK OF THE GROUP IS REFUNDED BY ITS OWN PART (${params!.amount} of ${option.totalCents})`);
    const rest = await prisma.printOrder.findMany({ where: { batchId: batch2, id: { not: paid[0].id } } });
    say(rest.every((o) => o.status === "SUBMITTED"), "and the others go on");
  } finally {
    LULU.submit = realSubmit;
  }

  // a bank payment that fails, through the webhook itself
  const fake = `cs_group_bank_${Date.now()}`;
  const bank = await prisma.printBatch.create({ data: { ownerId: guest.ownerId, groupId: group.id, stripeCheckoutSessionId: fake } });
  for (const c of group.clients)
    await prisma.printOrder.create({
      data: {
        ownerId: guest.ownerId, plannerId: c.plannerId, title: c.name, startDate: new Date("2027-07-05T00:00:00Z"), endDate: new Date("2027-10-02T00:00:00Z"), days: 90, binding: "PAPERBACK", podPackageId: "x",
        pageCount: 100, shippingLevel: "MAIL", shippingAddress: {}, bookCents: 1000, shippingCents: 500, totalCents: 1500, costCents: 900, batchId: bank.id, stripeCheckoutSessionId: fake, contactEmail: "coach@example.com",
      },
    });
  const signed = async (type: string, paymentStatus: string) => {
    const body = JSON.stringify({ id: `evt_${Date.now()}`, object: "event", type, data: { object: { id: fake, object: "checkout.session", metadata: { batchId: bank.id }, payment_status: paymentStatus, payment_intent: "pi_group_bank", customer_details: { email: "coach@example.com" } } } });
    const header = stripe().webhooks.generateTestHeaderString({ payload: body, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    return fetch(`${server.base}/api/stripe/webhook`, { method: "POST", body, headers: { "stripe-signature": header, "content-type": "application/json" } });
  };
  const done = await signed("checkout.session.completed", "unpaid");
  const clearing = await prisma.printOrder.findMany({ where: { batchId: bank.id } });
  say(done.status === 200 && clearing.every((o) => o.status === "QUOTED" && o.stripePaymentIntentId === "pi_group_bank"), "A GROUP'S BANK PAYMENT CLEARING HOLDS EVERY BOOK'S DAYS (through the webhook)");
  const refusedBank = await signed("checkout.session.async_payment_failed", "unpaid");
  const ended = await prisma.printOrder.findMany({ where: { batchId: bank.id } });
  say(refusedBank.status === 200 && ended.every((o) => o.stripePaymentIntentId === null && /did not go through/.test(o.failureReason ?? "")), "and when the bank says no, none of them is ordered and nothing taken");
  // the lib's own email for it: one, of all three
  const bankEmails: Email[] = [];
  await prisma.printOrder.updateMany({ where: { batchId: bank.id }, data: { failureReason: null } });
  await recordClearingBatch(bank.id, fake, "pi_group_bank_2");
  await failClearingBatch(bank.id, fake, async (e) => (bankEmails.push(e), { sent: true }));
  say(bankEmails.length === 1 && /3 books/.test(bankEmails[0].text), `one email for the failed bank payment, of all three (${bankEmails.length})`);

  // ---- books home again; a group deleted, its people kept
  await tab.goto(`${server.base}/app/business/groups/${group.id}`, { waitUntil: "networkidle" });
  await tab.getByLabel("Each to their own address").check();
  await tab.getByRole("button", { name: "Save", exact: true }).click();
  await tab.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  const home = await prisma.businessGroup.findUniqueOrThrow({ where: { id: group.id } });
  say(!home.shipToVenue && (home.venueAddress as { city?: string } | null)?.city === "Austin", "books home again: the place is kept for later");
  await prisma.businessGroup.update({ where: { id: group.id }, data: { templateId: null } });
  await tab.goto(`${server.base}/app/business/groups/${group.id}`, { waitUntil: "networkidle" });
  say((await tab.locator('select[name="templateId"]').inputValue()) === "", "A GROUP WHERE EACH KEEPS THEIR OWN TEMPLATE SHOWS THAT, not the first template (review: Save would have moved everyone)");
  await tab.goto(`${server.base}/app/business/clients`, { waitUntil: "networkidle" });
  say(((await text(tab)).match(/\bAddress\b/g) ?? []).length >= 3, "and each now needs their own address");
  await tab.goto(`${server.base}/app/business/groups/${group.id}`, { waitUntil: "networkidle" });
  await tab.getByRole("button", { name: "Delete the group" }).click();
  await tab.getByRole("button", { name: "Yes, delete it" }).click();
  await tab.waitForURL("**/app/business/groups");
  const kept = await prisma.businessClient.findMany({ where: { businessId: business.id } });
  say(!(await prisma.businessGroup.findUnique({ where: { id: group.id } })) && kept.length === 3 && kept.every((c) => c.groupId === null && c.plannerId), "A GROUP DELETED: its people stay clients, with their journals");

  // a phone: no sideways scroll on the group page
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await phone.addCookies([{ name: guest.cookieName, value: guest.cookieValue, domain: new URL(server.base).hostname, path: "/" }]);
  await phone.addInitScript(HIDE_DEV);
  const small = await phone.newPage();
  await small.goto(`${server.base}/app/business/groups/new`, { waitUntil: "networkidle" });
  const overflow = await small.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  say(overflow <= 0, `a phone: no sideways scroll on New group (${overflow}px)`);
  await shoot(small, "groups-phone-new");
  await phone.close();
  await context.close();
} finally {
  for (const id of sessions) await stripe().checkout.sessions.expire(id).catch(() => {});
  await prisma.printOrder.deleteMany({ where: { ownerId: guest.ownerId } });
  await prisma.printBatch.deleteMany({ where: { ownerId: guest.ownerId } });
  await prisma.planner.deleteMany({ where: { ownerId: guest.ownerId, id: { not: guest.journalId } } });
  await prisma.savedPage.deleteMany({ where: { ownerId: guest.ownerId } });
  await prisma.business.deleteMany({ where: { ownerId: guest.ownerId } });
  await prisma.ownerSettings.deleteMany({ where: { ownerId: guest.ownerId } });
  await guest.remove();
  await browser.close();
  await disconnect();
  server.stop();
}
console.log(failures ? `\n${failures} problem(s).` : "\nAll group checks passed.");
process.exit(failures ? 1 : 0);
