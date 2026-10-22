// npm run check:business - memari. for businesses, end to end as a guest
// (2026-10-22): start a business, make a journal a template, add a client
// with an address, archive them and undo it, set a logo, see Orders, and the
// template leave the guest's own journal list. Screens shot into the folder
// given (for the proof), if one is.
//
//   npm run check:business -- <shots folder>

import "./appUnderTest.mjs";
import { chromium, type Page } from "playwright-core";
import { ensureServer, makeGuestJournal, disconnect } from "./appUnderTest.mjs";
import { prisma } from "../src/lib/prisma";

const shots = process.argv[2];
const server = await ensureServer(process.env.BASE);
const browser = await chromium.launch({ channel: "chrome", headless: true });
let failures = 0;
const say = (ok: boolean, what: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
};
// the development build's own badge left out of the shots
const HIDE_DEV = `addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal { display: none !important; }"; document.head.append(s); });`;
const shoot = async (tab: Page, name: string) => {
  if (shots) await tab.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

const guest = await makeGuestJournal("Clarity Quarterly");
// a stand-in account the guest "signs in" as, at the end
const ACCOUNT = `check-business-account-${Date.now()}`;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([{ name: guest.cookieName, value: guest.cookieValue, domain: new URL(server.base).hostname, path: "/" }]);
  await context.addInitScript(HIDE_DEV);
  const tab = await context.newPage();

  // Before there is a business: what it is, and its name.
  await tab.goto(`${server.base}/app/business`, { waitUntil: "networkidle" });
  say((await tab.getByRole("heading", { name: /for businesses/ }).count()) > 0, "before a business: the start page");
  await shoot(tab, "biz-start");
  await tab.getByRole("button", { name: "Start" }).click();
  await tab.waitForTimeout(500);
  const stopped = await tab.getByLabel("Your business’s name").evaluate((el) => !(el as HTMLInputElement).validity.valid);
  say(stopped && !(await prisma.business.findUnique({ where: { ownerId: guest.ownerId } })), "starting with no name is stopped: a name is required");
  await tab.getByLabel("Your business’s name").fill("Northwind Coaching");
  await tab.getByRole("button", { name: "Start" }).click();
  await tab.waitForURL("**/app/business");
  await tab.getByRole("heading", { name: "Home" }).waitFor();
  const business = await prisma.business.findUnique({ where: { ownerId: guest.ownerId } });
  say(!!business && business.name === "Northwind Coaching", "the business is made, the guest's");
  say((await tab.getByText("0 of 4").count()) === 1, "Home: the checklist, nothing done");
  await shoot(tab, "biz-home-new");

  // A template: the guest's own journal.
  await tab.getByRole("link", { name: "Templates" }).click();
  await tab.getByRole("heading", { name: "Templates" }).waitFor();
  await tab.getByLabel("Use one of your journals").selectOption({ label: "Clarity Quarterly" });
  await tab.getByRole("button", { name: "Make it a template" }).click();
  await tab.getByRole("cell", { name: "Clarity Quarterly" }).or(tab.getByText("Clarity Quarterly", { exact: true })).first().waitFor();
  await tab.waitForTimeout(400);
  const template = await prisma.businessTemplate.findFirst({ where: { businessId: business!.id } });
  say(template?.plannerId === guest.journalId, "the journal is the business's template");
  await shoot(tab, "biz-templates");

  // A client, missing their address at first.
  await tab.getByRole("link", { name: "Clients" }).click();
  await tab.getByRole("heading", { name: "Clients" }).waitFor();
  await shoot(tab, "biz-clients-empty");
  await tab.getByRole("link", { name: "Add client" }).first().click();
  await tab.getByRole("heading", { name: "Add client" }).waitFor();
  say((await tab.getByLabel("Template").inputValue()) === template!.id, "the only template is chosen for a new client");
  await tab.getByLabel("Name", { exact: true }).fill("Maya Okafor");
  await tab.getByLabel("Email").fill("maya@example.com");
  await tab.getByLabel("First book starts").fill("2027-01-04");
  await shoot(tab, "biz-client-form");
  await tab.getByRole("button", { name: "Add client" }).click();
  await tab.waitForURL("**/app/business/clients");
  say((await tab.getByText("Address", { exact: true }).count()) > 0, "the list says Maya still needs an address");
  // her address
  await tab.getByRole("link", { name: /Maya Okafor/ }).click();
  await tab.getByRole("heading", { name: "Maya Okafor" }).waitFor();
  await tab.locator('input[name="street1"]').fill("120 Elm Street");
  await tab.locator('input[name="city"]').fill("Portland");
  await tab.locator('input[name="stateCode"]').fill("OR");
  await tab.locator('input[name="postcode"]').fill("97205");
  await tab.locator('input[name="phoneNumber"]').fill("+1 503 555 0100");
  await tab.getByRole("button", { name: "Save" }).click();
  await tab.waitForURL("**/app/business/clients");
  say((await tab.getByText("Ready", { exact: true }).count()) === 1, "with an address, a template and a start: Ready");
  const client = await prisma.businessClient.findFirst({ where: { businessId: business!.id } });
  say((client?.shippingAddress as { countryCode?: string } | null)?.countryCode === "US" && client?.email === "maya@example.com", "her address and email are kept");
  await shoot(tab, "biz-clients");

  // Archive, and undo it.
  await tab.getByRole("link", { name: /Maya Okafor/ }).click();
  await tab.getByRole("button", { name: "Archive" }).click();
  await tab.getByRole("status").filter({ hasText: "archived" }).waitFor();
  say(!!(await prisma.businessClient.findUnique({ where: { id: client!.id } }))?.archivedAt, "Archive archives at once");
  await shoot(tab, "biz-undo");
  await tab.getByRole("button", { name: "Undo" }).click();
  await tab.waitForTimeout(800);
  say(!(await prisma.businessClient.findUnique({ where: { id: client!.id } }))?.archivedAt, "Undo brings her back");

  // Settings: a logo; and a bad one is refused.
  await tab.getByRole("link", { name: "Settings" }).click();
  await tab.getByRole("heading", { name: "Settings" }).waitFor();
  await tab.getByLabel("Logo").fill("http://example.com/logo.png");
  await tab.getByRole("button", { name: "Save" }).click();
  await tab.waitForTimeout(1500);
  say((await tab.getByRole("alert").filter({ hasText: "https" }).count()) === 1, "a logo address that is not https is refused");
  // a real picture (the otter, standing in for a coach's logo), so the shots show one
  await tab.getByLabel("Logo").fill("https://memari.studio/landing/otter/otter-1.webp");
  await tab.getByRole("button", { name: "Save" }).click();
  await tab.getByText("Saved").waitFor();
  say(!!(await prisma.business.findUnique({ where: { id: business!.id } }))?.logoUrl, "an https logo is saved");

  // Home now: three of four done (no sample ordered).
  await tab.getByRole("link", { name: "Home" }).click();
  await tab.getByRole("heading", { name: "Home" }).waitFor();
  say((await tab.getByText("3 of 4").count()) === 1, "Home: logo, template and client done; the sample book to go");
  await shoot(tab, "biz-home");

  // Orders: none yet.
  await tab.getByRole("link", { name: "Orders" }).click();
  await tab.getByRole("heading", { name: "Orders" }).waitFor();
  say((await tab.getByText("No books ordered yet").count()) === 1, "Orders: none yet, and where to start");

  // The switcher, and the template gone from the guest's own journals.
  await tab.getByRole("button", { name: /Northwind Coaching/ }).click();
  await shoot(tab, "biz-switcher");
  await tab.getByRole("menuitem", { name: /Your journals/ }).click();
  await tab.waitForURL("**/app");
  await tab.waitForTimeout(1500);
  const { journalsOf } = await import("../src/app/planner/journals");
  say(!(await journalsOf(guest.ownerId)).some((j) => j.id === guest.journalId), "the template is listed in the business, not in the guest's own journals");

  // A phone: the menu across the top, the rows as cards.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  await phone.addCookies([{ name: guest.cookieName, value: guest.cookieValue, domain: new URL(server.base).hostname, path: "/" }]);
  await phone.addInitScript(HIDE_DEV);
  const small = await phone.newPage();
  await small.goto(`${server.base}/app/business/clients`, { waitUntil: "networkidle" });
  const overflow = await small.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  say(overflow <= 0, `a phone: no sideways scroll (${overflow}px)`);
  await shoot(small, "biz-phone-clients");
  await small.goto(`${server.base}/app/business`, { waitUntil: "networkidle" });
  await shoot(small, "biz-phone-home");
  await phone.close();
  await context.close();

  // Signing in brings the guest's business with their journals (owner.ts,
  // moveGuestWork) - the same function the sign-in path runs.
  const { moveGuestWork } = await import("../src/lib/owner");
  await moveGuestWork(guest.ownerId, ACCOUNT);
  const moved = await prisma.business.findUnique({ where: { ownerId: ACCOUNT }, include: { _count: { select: { clients: true, templates: true } } } });
  say(moved?.name === "Northwind Coaching" && moved._count.clients === 1 && moved._count.templates === 1, "signing in brings the business, its client and its template");
} finally {
  await prisma.business.deleteMany({ where: { ownerId: { in: [guest.ownerId, ACCOUNT] } } });
  await prisma.ownerSettings.deleteMany({ where: { ownerId: ACCOUNT } });
  await prisma.calendar.deleteMany({ where: { ownerId: ACCOUNT } });
  await prisma.planner.deleteMany({ where: { ownerId: ACCOUNT } });
  await guest.remove();
  await browser.close();
  await disconnect();
  server.stop();
}
console.log(failures ? `\n${failures} problem(s).` : "\nAll business checks passed.");
process.exit(failures ? 1 : 0);
