// npm run check:coach-kit - the first coaches' kit, end to end (2026-10-31).
//
//   BUILT: the made-up example kit becomes a prepared workspace - its journal
//   the template, its questions asked, the coach their own first client - and
//   building it again rebuilds it.
//   CLAIMED, in a real browser: the link's page names the workspace; its
//   button opens it as this browser's (Home's "Set up for you"); the link
//   then opens nothing, in any browser; two presses at once, one wins; a link
//   past its days opens nothing; one opened where someone was a guest already
//   joins their work, theirs kept. Signing in (the same move every sign-in
//   makes) makes it the account's, claimed - and the builder won't touch it.
//   A guest's business merging into an account's keeps its groups (the bug).
//   "TELL US" from the workspace is kept, with its page; the pilot page shows
//   the coach's steps and what they said. The guest sweep keeps a prepared
//   workspace while its link could still be used. A promotion code's
//   discount is kept on the order, through the webhook itself.
//
//   npm run check:coach-kit -- <shots folder>

import "./appUnderTest.mjs";
import { readFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";
import { ensureServer, makeGuestJournal, disconnect } from "./appUnderTest.mjs";
import { prisma } from "../src/lib/prisma";
import { buildCoachKit } from "./build-coach-kit.mjs";
import type { CoachKit } from "../src/lib/coachKit";
import { claimTargetFor, makeClaimToken, takeClaim } from "../src/lib/businessClaim";
import { moveGuestWork } from "../src/lib/owner";
import { sweepIdleGuests } from "../src/lib/guestSweep";
import { questionsOf } from "../src/lib/clientAnswers";
import { stripe } from "../src/lib/print/stripe";

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
const fresh = async (cookie?: { name: string; value: string }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (cookie) await context.addCookies([{ ...cookie, domain: new URL(server.base).hostname, path: "/" }]);
  await context.addInitScript(HIDE_DEV);
  return { context, tab: await context.newPage() };
};

const example = JSON.parse(readFileSync(new URL("./coach-kit.example.json", import.meta.url), "utf8")) as CoachKit;
const KEYS = ["example-steady-ground", "check-kit-existing-guest", "check-kit-merge"];
const ACCOUNT = `check-coach-kit-account-${Date.now()}`;
const owners: string[] = [ACCOUNT];
const other = await makeGuestJournal("Their own journal");
owners.push(other.ownerId);
try {
  // ---- BUILT
  const built = await buildCoachKit(example, server.base);
  owners.push(built.ownerId);
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: built.businessId },
    include: { templates: { include: { planner: { select: { id: true, title: true } } } }, clients: { include: { planner: { select: { id: true } } } } },
  });
  const template = business.templates[0];
  say(
    business.preparedKey === example.key && !!business.preparedAt && built.ownerId.startsWith("guest:") && template?.planner.title === example.journal.title,
    `THE EXAMPLE KIT IS BUILT: "${business.name}", prepared, a holding guest's, their journal the template`
  );
  say(questionsOf(template?.questions).length === 3, `its three questions asked (${questionsOf(template?.questions).map((q) => q.prompt).join(" / ")})`);
  const coach = business.clients[0];
  say(business.clients.length === 1 && coach?.name === example.coach.name && !!coach.planner && coach.templateId === template.id, "the coach is their own first client, their journal built");
  const pagesOf = (plannerId: string) => prisma.page.count({ where: { plannerId } });
  say((await pagesOf(template.planner.id)) > 0 && (await pagesOf(template.planner.id)) === (await pagesOf(coach.planner!.id)), "their journal has the template's pages");
  const again = await buildCoachKit(example, server.base);
  const rebuilt = await prisma.business.findMany({ where: { preparedKey: example.key } });
  say(again.rebuilt && again.ownerId === built.ownerId && rebuilt.length === 1 && rebuilt[0].id !== built.businessId, "building it again rebuilds it, one workspace, the same holding guest");

  // ---- CLAIMED, in a real browser
  const a = await fresh();
  await a.tab.goto(again.url, { waitUntil: "networkidle" });
  say(/Your workspace is ready/.test(await a.tab.innerText("body")) && (await a.tab.getByText(example.business.name).count()) > 0, "the link's page names the workspace, and claims nothing by itself");
  say(!!(await claimTargetFor(again.url.split("/").pop()!)), "(opening the page alone leaves the link unused)");
  await shoot(a.tab, "kit-claim");
  await a.tab.getByRole("button", { name: "Open your workspace" }).click();
  await a.tab.waitForURL("**/app/business?welcome=1");
  await a.tab.locator("[data-prepared]").waitFor();
  say((await a.tab.getByRole("link", { name: "Sign in to keep it" }).count()) === 1, "OPENED: THEIR WORKSPACE, as this browser's, asking them to sign in to keep it");
  await shoot(a.tab, "kit-home");
  await a.tab.goto(`${server.base}/app/business/templates`, { waitUntil: "networkidle" });
  say(/The Steady Ground Journal/.test(await a.tab.innerText("body")) && (await a.tab.getByRole("link", { name: "Questions (3)" }).count()) === 1, "their journal is the template, with its three questions");
  const opened = await prisma.business.findUniqueOrThrow({ where: { id: again.businessId } });
  say(opened.claimTokenHash === null && opened.ownerId === again.ownerId && !opened.claimedAt, "the link is used up; the workspace is still the guest's, not claimed");
  const b = await fresh();
  await b.tab.goto(again.url, { waitUntil: "networkidle" });
  say(/This link has stopped working/.test(await b.tab.innerText("body")), "THE LINK OPENS IT ONCE: in another browser it opens nothing (a forwarded note can't take it)");
  await shoot(b.tab, "kit-used");
  await b.context.close();

  // tell us, from the workspace
  await a.tab.goto(`${server.base}/app/business/clients`, { waitUntil: "networkidle" });
  await a.tab.getByRole("button", { name: "Tell us" }).click();
  await a.tab.getByLabel("What’s wrong, or what do you wish it did?").fill("I'd like my clients to see the plan on day one.");
  await shoot(a.tab, "kit-tell-us");
  await a.tab.getByRole("button", { name: "Send" }).click();
  await a.tab.getByRole("status").filter({ hasText: "with us now" }).waitFor();
  const told = await prisma.businessFeedback.findFirst({ where: { businessId: again.businessId } });
  say(told?.message === "I'd like my clients to see the plan on day one." && told.page === "/app/business/clients" && told.ownerId === again.ownerId, "TELL US: KEPT, with the page they were on");

  // the pilot page (its view; signing in as an admin is not for a check)
  await a.tab.goto(`${server.base}/dev/pilot`, { waitUntil: "networkidle" });
  const card = a.tab.locator(`[data-pilot="${example.key}"]`);
  const cardText = await card.innerText();
  say(/opened, as a guest/.test(cardText) && /plan on day one/.test(cardText) && (await card.getByRole("button", { name: "New claim link" }).count()) === 1, "THE PILOT PAGE: opened as a guest, what they told us, a new link offered");
  await shoot(a.tab, "kit-pilot");
  const asGuest = await fetch(`${server.base}/app/admin/coaches`, { redirect: "manual" });
  say(asGuest.status === 404, `the pilot page itself is a 404 to anyone but an admin (${asGuest.status})`);

  // signing in: the same move every sign-in makes (owner.ts)
  await moveGuestWork(again.ownerId, ACCOUNT);
  const claimed = await prisma.business.findUniqueOrThrow({ where: { id: again.businessId } });
  say(claimed.ownerId === ACCOUNT && !!claimed.claimedAt, "SIGNED IN: THE ACCOUNT'S, CLAIMED");
  let refused = "";
  await buildCoachKit(example, server.base).catch((e: Error) => (refused = e.message));
  say(/claimed by the coach/.test(refused), "and the builder won't rebuild it: it's theirs to change now");
  let reissue = "";
  await makeClaimToken(again.businessId).catch((e: Error) => (reissue = e.message));
  say(/nobody has claimed/.test(reissue), "nor make a new link for it");
  await a.context.close();

  // two presses at once; a link past its days
  const second = await buildCoachKit({ ...example, key: KEYS[1], business: { name: "Second Ground Coaching" } }, server.base);
  owners.push(second.ownerId);
  const token = second.url.split("/").pop()!;
  const both = await Promise.all([takeClaim(token), takeClaim(token)]);
  say(both.filter(Boolean).length === 1, `TWO PRESSES AT ONCE: ONE OPENS IT (${both.filter(Boolean).length})`);
  const late = await makeClaimToken(second.businessId);
  await prisma.business.update({ where: { id: second.businessId }, data: { claimExpiresAt: new Date(Date.now() - 1000) } });
  say(!(await claimTargetFor(late)), "a link past its days opens nothing");

  // opened where they were a guest already: it joins their work
  const fresh2 = await makeClaimToken(second.businessId).catch(() => null);
  await prisma.business.update({ where: { id: second.businessId }, data: { claimExpiresAt: new Date(Date.now() + 86_400_000) } });
  const c = await fresh({ name: other.cookieName, value: other.cookieValue });
  await c.tab.goto(`${server.base}/claim/${fresh2}`, { waitUntil: "networkidle" });
  await c.tab.getByRole("button", { name: "Open your workspace" }).click();
  await c.tab.waitForURL("**/app/business?welcome=1");
  const joined = await prisma.business.findUniqueOrThrow({ where: { id: second.businessId } });
  const theirOwn = await prisma.planner.findUnique({ where: { id: other.journalId } });
  const leftBehind = await prisma.planner.count({ where: { ownerId: second.ownerId } });
  say(joined.ownerId === other.ownerId && theirOwn?.ownerId === other.ownerId && leftBehind === 0, "OPENED WHERE THEY WERE A GUEST ALREADY: it joins their work, their own journal kept, nothing left on the holding guest");
  await c.context.close();

  // a guest's business merging into an account's keeps its groups (review)
  const guestCoach = `guest:check-kit-merge-${Date.now()}`;
  const mergeAccount = `check-coach-kit-merge-${Date.now()}`;
  owners.push(guestCoach, mergeAccount);
  const theirs = await prisma.business.create({ data: { ownerId: guestCoach, name: "Guest's business" } });
  const group = await prisma.businessGroup.create({ data: { businessId: theirs.id, name: "January cohort" } });
  await prisma.businessClient.create({ data: { businessId: theirs.id, name: "Maya", groupId: group.id } });
  const account = await prisma.business.create({ data: { ownerId: mergeAccount, name: "Account's business" } });
  await moveGuestWork(guestCoach, mergeAccount);
  const movedGroup = await prisma.businessGroup.findUnique({ where: { id: group.id }, include: { clients: true } });
  say(movedGroup?.businessId === account.id && movedGroup.clients.length === 1, "A GUEST'S BUSINESS MERGING INTO AN ACCOUNT'S KEEPS ITS GROUPS, and their people in them");

  // the guest sweep keeps a prepared workspace while its link could be used
  const third = await buildCoachKit({ ...example, key: KEYS[2], business: { name: "Third Ground Coaching" } }, server.base);
  owners.push(third.ownerId);
  const old = new Date(Date.now() - 40 * 86_400_000);
  await prisma.$executeRaw`UPDATE "Business" SET "updatedAt" = ${old} WHERE id = ${third.businessId}`;
  await prisma.$executeRaw`UPDATE "Planner" SET "updatedAt" = ${old} WHERE "ownerId" = ${third.ownerId}`;
  // its first client (the coach) too: built with it, as old as it - or the
  // client alone would keep it, and this would prove nothing about the link
  await prisma.$executeRaw`UPDATE "BusinessClient" SET "updatedAt" = ${old} WHERE "businessId" = ${third.businessId}`;
  await sweepIdleGuests();
  say(!!(await prisma.business.findUnique({ where: { id: third.businessId } })) && (await prisma.planner.count({ where: { ownerId: third.ownerId } })) > 0, "THE GUEST SWEEP KEEPS A PREPARED WORKSPACE while its link could still be used");

  // a promotion code's discount, through the webhook itself
  const order = await prisma.printOrder.create({
    data: {
      ownerId: ACCOUNT, title: "Discounted", startDate: new Date("2027-01-04T00:00:00Z"), endDate: new Date("2027-04-03T00:00:00Z"), days: 90, binding: "PAPERBACK",
      podPackageId: "x", pageCount: 100, shippingLevel: "MAIL", shippingAddress: {}, bookCents: 2000, shippingCents: 500, totalCents: 2500, costCents: 1500,
    },
  });
  const body = JSON.stringify({ id: `evt_${Date.now()}`, object: "event", type: "checkout.session.completed", data: { object: { id: "cs_check_discount", object: "checkout.session", metadata: { orderId: order.id }, payment_status: "no_payment_required", total_details: { amount_discount: 700 } } } });
  const signed = await fetch(`${server.base}/api/stripe/webhook`, { method: "POST", body, headers: { "stripe-signature": stripe().webhooks.generateTestHeaderString({ payload: body, secret: process.env.STRIPE_WEBHOOK_SECRET! }), "content-type": "application/json" } });
  const discounted = await prisma.printOrder.findUniqueOrThrow({ where: { id: order.id } });
  say(signed.status === 200 && discounted.discountCents === 700, `A PROMOTION CODE'S DISCOUNT IS KEPT ON THE ORDER (${discounted.discountCents})`);
} finally {
  await prisma.printOrder.deleteMany({ where: { ownerId: { in: owners } } });
  await prisma.business.deleteMany({ where: { OR: [{ preparedKey: { in: KEYS } }, { ownerId: { in: owners } }] } });
  await prisma.planner.deleteMany({ where: { ownerId: { in: owners }, id: { not: other.journalId } } });
  await prisma.savedPage.deleteMany({ where: { ownerId: { in: owners } } });
  await prisma.ownerSettings.deleteMany({ where: { ownerId: { in: owners } } });
  await other.remove();
  await browser.close();
  await disconnect();
  server.stop();
}
console.log(failures ? `\n${failures} problem(s).` : "\nAll coach kit checks passed.");
process.exit(failures ? 1 : 0);
