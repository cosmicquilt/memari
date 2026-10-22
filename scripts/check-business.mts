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
  say((await tab.getByText("Address", { exact: true }).count()) === 0 && (await tab.getByText("Journal", { exact: true }).count()) === 1, "with an address, a template and a start: only her journal left to build");
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

  // HER JOURNAL, built from the template and linked to it.
  await tab.goto(`${server.base}/app/business/clients`, { waitUntil: "networkidle" });
  say((await tab.getByText("Journal", { exact: true }).count()) > 0, "before it is built, the list says Maya needs her journal");
  await tab.getByRole("link", { name: /Maya Okafor/ }).click();
  await tab.getByRole("heading", { name: "Maya Okafor" }).waitFor();
  await shoot(tab, "biz-client-build");
  await tab.getByRole("button", { name: "Build their journal" }).click();
  await tab.getByRole("link", { name: "Open their journal" }).waitFor({ timeout: 60_000 });
  await shoot(tab, "biz-client-journal");
  const built = await prisma.businessClient.findUnique({ where: { id: client!.id } });
  const journalId = built?.plannerId;
  say(!!journalId, "Build their journal: Maya has a journal");
  const [tplPages, herPages] = await Promise.all(
    [guest.journalId, journalId!].map((id) =>
      prisma.page.findMany({ where: { plannerId: id }, include: { moduleInstances: { select: { id: true, propValues: true, moduleTypeId: true } } }, orderBy: [{ level: "asc" }, { variantKey: "asc" }, { position: "asc" }] })
    )
  );
  const herJournal = await prisma.planner.findUnique({ where: { id: journalId! } });
  say(herJournal?.title === "Maya Okafor" && herJournal.ownerId === guest.ownerId && herJournal.startDate?.toISOString().slice(0, 10) === "2027-01-04", `her journal: her name, the coach's, from her start (${herJournal?.title}, ${herJournal?.startDate?.toISOString().slice(0, 10)})`);
  say(
    tplPages.length > 0 && tplPages.length === herPages.length && tplPages.every((p, i) => p.savedPageId && p.savedPageId === herPages[i].savedPageId && p.moduleInstances.length === herPages[i].moduleInstances.length),
    `every one of the template's ${tplPages.length} pages is linked, and hers carries the same link and modules`
  );
  // an edit to the template reaches her journal - the copy every editing action makes
  const page = tplPages.find((p) => p.moduleInstances.length)!;
  const module = page.moduleInstances[0];
  const marked = { ...(module.propValues as Record<string, unknown>), checkBusinessMark: "edited in the template" };
  await prisma.moduleInstance.update({ where: { id: module.id }, data: { propValues: marked } });
  const { syncLinkedPages, savedPagesOf } = await import("../src/app/planner/savedItems");
  await syncLinkedPages([page.id]);
  const herPage = herPages[tplPages.indexOf(page)];
  const herModules = await prisma.moduleInstance.findMany({ where: { pageId: herPage.id } });
  say(herModules.some((m) => (m.propValues as Record<string, unknown>).checkBusinessMark === "edited in the template"), "an edit to the template's page reaches Maya's journal");
  say(!(await savedPagesOf(guest.ownerId)).some((sp) => tplPages.some((p) => p.savedPageId === sp.id)), "the template's links stay out of the coach's Saved list");
  // the coach's calendar is not in her book
  const { createEventFor, eventsForJournal } = await import("../src/app/planner/calendarStore");
  const event = { title: "Coach's own dentist", date: "2027-01-06", start: "10:00", end: "11:00", allDay: false, rrule: null };
  await createEventFor(guest.ownerId, guest.journalId, event);
  const [inTemplate, inHers] = await Promise.all([eventsForJournal(guest.ownerId, guest.journalId), eventsForJournal(guest.ownerId, journalId!)]);
  say(inTemplate.some((e) => e.title === "Coach's own dentist") && inHers.length === 0, `the coach's event shows in their own journal, not in Maya's (${inTemplate.length} / ${inHers.length})`);
  let refused = "";
  try {
    await createEventFor(guest.ownerId, journalId!, { ...event, title: "x" });
  } catch (error) {
    refused = error instanceof Error ? error.message : String(error);
  }
  say(refused.includes("client's journal"), "an event cannot be added to a client's journal");
  // her order screen, filled in from her details (the order dialog applies
  // these; locally ordering is off - no Stripe keys - so read them directly)
  const orderHref = await tab.getByRole("link", { name: "Order their book" }).getAttribute("href");
  const { clientOrderDefaultsFor } = await import("../src/lib/business");
  const fill = await clientOrderDefaultsFor(guest.ownerId, journalId!);
  say(
    !!orderHref?.endsWith("/order") && fill?.client === "Maya Okafor" && fill.startISO === "2027-01-04" && fill.days === 90 && fill.address?.street1 === "120 Elm Street",
    `"Order their book" opens her order screen, filled in: her start, 90 days, her address (${JSON.stringify({ start: fill?.startISO, days: fill?.days, street: fill?.address?.street1 })})`
  );
  say((await clientOrderDefaultsFor(guest.ownerId, guest.journalId)) === null, "a journal that is not a client's is not filled in");
  await tab.goto(`${server.base}/app/business/clients`, { waitUntil: "networkidle" });
  say((await tab.getByText("Ready", { exact: true }).count()) === 1, "with her journal built: Ready");

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

  // A book of hers, paid for (a row as checkout leaves one): it is on Orders
  // and her page, and her next book starts the day after it ends.
  await prisma.printOrder.create({
    data: {
      ownerId: guest.ownerId,
      plannerId: journalId!,
      status: "PAID",
      title: "Maya Okafor",
      startDate: new Date("2027-01-04T00:00:00Z"),
      endDate: new Date("2027-04-03T00:00:00Z"),
      days: 90,
      binding: "PAPERBACK",
      podPackageId: "check-business",
      pageCount: 100,
      shippingLevel: "GROUND",
      shippingAddress: { name: "Maya Okafor" },
      bookCents: 2975,
      shippingCents: 500,
      totalCents: 3475,
      costCents: 1500,
    },
  });
  await tab.reload({ waitUntil: "networkidle" });
  say((await tab.getByText("Maya Okafor", { exact: true }).count()) > 0 && (await tab.getByText("Approved", { exact: true }).count()) === 1, "Orders: her book, Approved");
  await shoot(tab, "biz-orders");
  say((await clientOrderDefaultsFor(guest.ownerId, journalId!))?.startISO === "2027-04-04", "her next book starts the day after this one ends (4 Apr 2027)");
  await tab.goto(`${server.base}/app/business/clients/${client!.id}`, { waitUntil: "networkidle" });
  say((await tab.getByText("Approved", { exact: true }).count()) === 1, "her page lists the book");
  await shoot(tab, "biz-client-journal");

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
  await prisma.printOrder.deleteMany({ where: { ownerId: { in: [guest.ownerId, ACCOUNT] } } });
  await prisma.planner.deleteMany({ where: { ownerId: { in: [guest.ownerId, ACCOUNT] }, id: { not: guest.journalId } } });
  await prisma.savedPage.deleteMany({ where: { ownerId: { in: [guest.ownerId, ACCOUNT] } } });
  await prisma.calendarEvent.deleteMany({ where: { ownerId: { in: [guest.ownerId, ACCOUNT] } } });
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
