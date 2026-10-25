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
  const edited = page.moduleInstances[0];
  const marked = { ...(edited.propValues as Record<string, unknown>), checkBusinessMark: "edited in the template" };
  await prisma.moduleInstance.update({ where: { id: edited.id }, data: { propValues: marked } });
  const { syncLinkedPages, savedPagesOf } = await import("../src/app/planner/savedItems");
  await syncLinkedPages([page.id]);
  const herPage = herPages[tplPages.indexOf(page)];
  const herModules = await prisma.moduleInstance.findMany({ where: { pageId: herPage.id } });
  say(herModules.some((m) => (m.propValues as Record<string, unknown>).checkBusinessMark === "edited in the template"), "an edit to the template's page reaches Maya's journal");
  say(!(await savedPagesOf(guest.ownerId)).some((sp) => tplPages.some((p) => p.savedPageId === sp.id)), "the template's links stay out of the coach's Saved list");
  // and a page saved the ordinary way still is (no source key: a NOT over a
  // null column would hide it)
  const ordinary = await prisma.savedPage.create({
    data: { ownerId: guest.ownerId, name: "My own page", pageCount: 1, widthPx: 2175, heightPx: 3075, gridColumns: 24, gridRows: 36, gridGapPx: 12, marginPx: 187.5, content: { pages: [[]] } },
  });
  say((await savedPagesOf(guest.ownerId)).some((sp) => sp.id === ordinary.id), "a page saved the ordinary way is still in the coach's Saved list");
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
  await tab.getByRole("button", { name: "Save" }).first().click();
  await tab.waitForTimeout(1500);
  say((await tab.getByRole("alert").filter({ hasText: "https" }).count()) === 1, "a logo address that is not https is refused");
  // a real picture (the otter, standing in for a coach's logo), so the shots show one
  await tab.getByLabel("Logo").fill("https://memari.studio/landing/otter/otter-1.webp");
  await tab.getByRole("button", { name: "Save" }).first().click();
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

  // THE CHARTS (2026-10-22, charts.tsx): what they draw matches the rows,
  // each has a table of the same numbers, and a mark answers the keyboard.
  const thisMonth = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  await tab.goto(`${server.base}/app/business`, { waitUntil: "networkidle" });
  const tileValues = await tab.locator('[class*="tileValue"]').allTextContents();
  say(tileValues.join("|") === "1|1|1|0", `Home's numbers: 1 client, 1 book this quarter, 1 on the way, nobody running out (${tileValues.join(", ")})`);
  say((await tab.getByText("1 approved", { exact: true }).count()) === 1, "and the book on its way is Approved");
  const coverage = tab.getByRole("figure", { name: "Who has pages, and until when" });
  say((await coverage.getByRole("link", { name: "Maya Okafor: To 3 Apr" }).count()) === 1, "Home's timeline: Maya, covered to 3 Apr, her name a link to her");
  await coverage.locator('g[aria-label^="Maya Okafor: book 4 Jan to 3 Apr"]').focus();
  say((await tab.getByRole("status").filter({ hasText: "4 Jan to 3 Apr" }).count()) === 1, "her book, reached by keyboard, says its dates in a tooltip");
  await shoot(tab, "biz-home-charts");
  await coverage.getByRole("button", { name: "Table" }).click();
  say((await coverage.getByRole("row", { name: /Maya Okafor 1 3 Apr To 3 Apr/ }).count()) === 1, "its Table: the same numbers as a table");
  await tab.goto(`${server.base}/app/business/orders`, { waitUntil: "networkidle" });
  say((await tab.locator('g[aria-label="Approved: 1"]').count()) === 1 && (await tab.locator('g[aria-label="In production: 0"]').count()) === 0, "Orders: the stage bar, one book Approved and no empty segment drawn");
  const columns = tab.locator('svg[aria-label="Books ordered"] g[tabindex="0"]');
  say((await columns.count()) === 12 && (await tab.locator(`svg[aria-label="Books ordered"] g[aria-label="${thisMonth}: 1"]`).count()) === 1, `Orders: 12 months of books, 1 in ${thisMonth}`);
  say((await tab.locator(`svg[aria-label="Spent"] g[aria-label="${thisMonth}: $34.75"]`).count()) === 1, "and spent, $34.75 this month, on a chart of its own");
  await tab.getByRole("link", { name: "6 months", exact: true }).click();
  await tab.waitForURL("**/orders?range=6");
  await tab.waitForTimeout(400);
  say((await columns.count()) === 6, "6 months: the charts redraw over 6");
  await shoot(tab, "biz-orders-charts");
  await tab.goto(`${server.base}/app/business/clients`, { waitUntil: "networkidle" });
  say((await tab.getByRole("listitem", { name: "First book ordered: 1 of 1" }).count()) === 1, "Clients: how many have reached each step, the first book 1 of 1");

  // LIGHT, DARK OR AUTOMATIC (2026-10-22, Appearance.tsx): Automatic follows
  // the system from the first paint; a choice holds against it and over a
  // reload; the client's own page is not touched by it.
  {
    const night = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" });
    await night.addCookies([{ name: guest.cookieName, value: guest.cookieValue, domain: new URL(server.base).hostname, path: "/" }]);
    // the mode before React: the page's bundles blocked, so only the inline
    // script in the HTML can have set it
    const bare = await night.newPage();
    await bare.route("**/_next/static/**/*.js", (route) => route.abort());
    await bare.goto(`${server.base}/app/business`, { waitUntil: "domcontentloaded" });
    const first = await bare.evaluate(() => document.querySelector("[data-biz-root]")?.getAttribute("data-mode") ?? "unset");
    await bare.close();
    const dark = await night.newPage();
    await dark.goto(`${server.base}/app/business`, { waitUntil: "networkidle" });
    const ground = (page: typeof dark) => page.evaluate(() => getComputedStyle(document.querySelector("[data-biz-root]")!).backgroundColor);
    const darkGround = await ground(dark);
    say(first === "dark" && darkGround !== "rgb(247, 244, 238)", `Automatic with the system dark: dark from the first paint (${first}, ${darkGround})`);
    await dark.getByRole("button", { name: /^Appearance/ }).click();
    await dark.getByRole("menuitemradio", { name: /^Light/ }).click();
    await dark.waitForTimeout(200);
    const chosen = await dark.evaluate(() => document.querySelector("[data-biz-root]")?.getAttribute("data-mode"));
    await dark.reload({ waitUntil: "networkidle" });
    const kept = await dark.evaluate(() => document.querySelector("[data-biz-root]")?.getAttribute("data-mode"));
    say(chosen === "light" && kept === "light" && (await ground(dark)) === "rgb(247, 244, 238)", `Light chosen holds against the system, and over a reload (${chosen}, ${kept})`);
    await dark.getByRole("button", { name: /^Appearance/ }).click();
    await dark.getByRole("menuitemradio", { name: /^Dark/ }).click();
    await dark.waitForTimeout(200);
    say((await dark.evaluate(() => document.querySelector("[data-biz-root]")?.getAttribute("data-mode"))) === "dark", "Dark chosen: dark");
    await night.close();
  }
  await tab.goto(`${server.base}/app/business/clients/${client!.id}`, { waitUntil: "networkidle" });

  // HER OWN PAGE, by a private link (clientPortal.ts): no account, no cookie.
  say((await tab.getByText("Emails go to maya@example.com.", { exact: false }).count()) === 1, "Their page says where an emailed link goes");
  await tab.getByRole("button", { name: "Make a link to copy" }).click();
  const linkBox = tab.getByLabel("Maya's link");
  await linkBox.waitFor();
  const link = await linkBox.inputValue();
  say(/\/c\/[A-Za-z0-9_-]{43}$/.test(link), "Make their link: a private link, shown to copy");
  await shoot(tab, "biz-client-link");
  const stored = await prisma.businessClient.findUnique({ where: { id: client!.id } });
  say(!!stored?.accessTokenHash && !link.includes(stored.accessTokenHash), "only the link's hash is kept");
  const visitor = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await visitor.addInitScript(HIDE_DEV);
  const her = await visitor.newPage();
  const opened = await her.goto(link, { waitUntil: "networkidle" });
  say(opened?.status() === 200 && (await her.getByRole("heading", { name: "Maya, your journal" }).count()) === 1, "with no account or cookie, the link opens her page");
  await her.waitForTimeout(1500);
  const canvases = await her.locator("canvas").count();
  say(canvases >= tplPages.length, `her page shows her journal's pages (${canvases} drawn)`);
  say((await her.getByText("Approved", { exact: true }).count()) === 1, "and her book");
  const privacy = await her.evaluate(() => ({
    referrer: document.querySelector('meta[name="referrer"]')?.getAttribute("content"),
    robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "",
  }));
  say(privacy.referrer === "no-referrer" && privacy.robots.includes("noindex"), `it is private: no referrer, not indexed (${JSON.stringify(privacy)})`);
  await her.screenshot({ path: shots ? `${shots}/biz-portal.png` : "/dev/null", fullPage: true }).catch(() => {});
  // she corrects her address
  await her.locator('input[name="street1"]').fill("121 Elm Street");
  await her.getByRole("button", { name: "Save" }).click();
  await her.getByText("Saved. Your next book comes here.").waitFor();
  const corrected = (await prisma.businessClient.findUnique({ where: { id: client!.id } }))!.shippingAddress as { street1?: string };
  say(corrected?.street1 === "121 Elm Street", "she corrects her address from her page, and it reaches the coach's record");
  // the coach sees she opened it
  await tab.reload({ waitUntil: "networkidle" });
  say((await tab.getByText(/Maya last opened it on/).count()) === 1, "the coach sees she opened it");
  // a phone
  const herPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const small2 = await herPhone.newPage();
  await small2.goto(link, { waitUntil: "networkidle" });
  const over2 = await small2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  say(over2 <= 0, `her page on a phone: no sideways scroll (${over2}px)`);
  await herPhone.close();
  // a new link stops the old; turning it off closes the page
  await tab.getByRole("button", { name: "Make a new link to copy" }).click();
  await linkBox.waitFor();
  await tab.waitForTimeout(300);
  const newLink = await linkBox.inputValue();
  say(newLink !== link && (await her.goto(link))?.status() === 404 && (await her.goto(newLink))?.status() === 200, "a new link: the old one stops working, the new one opens");
  await tab.getByRole("button", { name: "Turn it off" }).click();
  await tab.waitForTimeout(800);
  say((await her.goto(newLink))?.status() === 404 && !(await prisma.businessClient.findUnique({ where: { id: client!.id } }))?.accessTokenHash, "turned off: her page is closed");
  say((await her.goto(`${server.base}/c/not-a-real-token`))?.status() === 404, "a made-up link opens nothing");

  // EMAILED (2026-10-22, emailLinkTo; the words are clientLinkEmail.test).
  // Email is not set up on this machine, so nothing is sent: the coach is
  // told so, and the new link is shown to copy - the old one has stopped.
  await tab.getByRole("button", { name: "Email Maya their link" }).click();
  await tab.getByRole("alert").filter({ hasText: "Email is not set up on this site yet" }).waitFor({ timeout: 20_000 });
  const emailedLink = await linkBox.inputValue();
  const afterEmail = await prisma.businessClient.findUnique({ where: { id: client!.id } });
  say(/\/c\/[A-Za-z0-9_-]{43}$/.test(emailedLink) && !!afterEmail?.accessTokenHash && (await her.goto(emailedLink))?.status() === 200, "Email Maya their link, with email not set up here: a new link made and shown to copy, and it opens her page");
  say((await tab.getByText("nothing was sent", { exact: false }).count()) === 1, "and the coach is told nothing was sent");
  await tab.getByRole("button", { name: "Email Maya a new link" }).click();
  await tab.getByRole("alert").filter({ hasText: "a moment ago" }).waitFor({ timeout: 20_000 });
  const again = await prisma.businessClient.findUnique({ where: { id: client!.id } });
  say(again?.accessTokenHash === afterEmail?.accessTokenHash && (await her.goto(emailedLink))?.status() === 200, "pressed again within a minute: no second link, the first still opens");
  say((await linkBox.count()) === 1 && (await linkBox.inputValue()) === emailedLink, "and the link already shown stays there to copy");
  await shoot(tab, "biz-client-email");
  // WHO PAYS FOR BOOKS (2026-10-22, clientPays.ts / payouts.ts /
  // clientOrders.ts). Stripe is not set up on this machine, so what can be
  // seen without it: the choice saved, a share waiting on payouts, her page
  // offering her next book but saying ordering is not open, and a book she
  // paid for counted as earned, not as the coach's spending.
  {
    await tab.goto(`${server.base}/app/business/settings`, { waitUntil: "networkidle" });
    await tab.getByRole("radio", { name: /^Your clients/ }).check();
    await tab.getByRole("radio", { name: /^Memari.s price What you would pay/ }).check();
    await tab.getByRole("button", { name: "Save" }).last().click();
    await tab.waitForTimeout(800);
    let biz = await prisma.business.findUnique({ where: { ownerId: guest.ownerId } });
    say(biz?.clientsPay === true && biz.markupCents === 0, "Who pays for books: Your clients, at Memari's price, saved");
    await tab.getByRole("radio", { name: /^Memari.s price, plus your share/ }).check();
    await tab.getByLabel("Your share, each book ($)").fill("10");
    say((await tab.getByText("You receive $8.61 of it", { exact: false }).count()) === 1, "a $10 share: it says the coach receives $8.61, the card fee and $1 towards paying them kept back");
    const payoutCountries = await tab.getByLabel("Where you are paid").locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    say(payoutCountries.includes("US") && payoutCountries.includes("GB") && payoutCountries.includes("DE") && payoutCountries.includes("CA") && payoutCountries.includes("CH") && !payoutCountries.includes("AU"), `where they can be paid: the US, UK, Europe, Canada, Switzerland - not yet Australia (${payoutCountries.length - 1} countries)`);
    say((await tab.getByLabel("Where you are paid").inputValue()) === "", "no country chosen for them: the coach must pick one");
    await tab.getByRole("button", { name: "Save" }).last().click();
    await tab.waitForTimeout(800);
    biz = await prisma.business.findUnique({ where: { ownerId: guest.ownerId } });
    say(biz?.markupCents === 1000 && !biz.payoutsReady, "the share is kept, $10, payouts not set up");
    say((await tab.getByText(/Until then, clients pay Memari.s price\./).count()) === 1 && (await tab.getByRole("button", { name: "Set up payouts" }).isDisabled()), "until payouts are set up clients pay Memari's price, and with payments off here Set up payouts cannot be pressed");
    say((await tab.getByText("Sign in to set up payouts: they belong to your account.").count()) === 1, "and a guest is told payouts need an account");
    await tab.getByLabel("Your share, each book ($)").fill("500");
    await tab.getByRole("button", { name: "Save" }).last().click();
    await tab.getByRole("alert").filter({ hasText: "from $3 to $200" }).waitFor({ timeout: 10_000 });
    say((await prisma.business.findUnique({ where: { ownerId: guest.ownerId } }))?.markupCents === 1000, "a share of $500 is refused, the $10 kept");
    say(
      (await tab.getByRole("radio", { name: /^Your clients/ }).isChecked()) && (await tab.getByRole("radio", { name: /^Memari.s price, plus your share/ }).isChecked()),
      "after the refusal the choices on screen are still the ones made (React's form reset had put them back)"
    );
    await shoot(tab, "biz-settings-payer");

    // her page: her next book offered, ordering not open on this machine
    const reader = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await reader.addInitScript(HIDE_DEV);
    const herPage = await reader.newPage();
    await herPage.goto(emailedLink, { waitUntil: "networkidle" });
    say((await herPage.getByRole("heading", { name: "Order your next book" }).count()) === 1 && (await herPage.getByText("Ordering is not open yet", { exact: false }).count()) === 1, "her page: Order your next book, saying ordering is not open yet (no payment keys here)");
    await shoot(herPage, "biz-portal-order");
    const html = await herPage.content();
    say(!html.includes("acct_") && !html.includes(guest.ownerId) && !html.includes("markupCents"), "her page carries no Stripe account, owner id or share");
    await herPage.goto(`${emailedLink}?placed=1`, { waitUntil: "networkidle" });
    say((await herPage.getByText("Thank you: your book is ordered.").count()) === 1 && (await herPage.getByRole("heading", { name: "Order your next book" }).count()) === 0, "back from paying: thanks, and not the same order form again");
    await shoot(herPage, "biz-portal-placed");
    await reader.close();

    // a book she paid for herself, with the coach's $10 share
    const before = await prisma.printOrder.count({ where: { plannerId: journalId! } });
    const hers = await prisma.printOrder.create({
      data: { ownerId: guest.ownerId, plannerId: journalId!, status: "PAID", title: "Maya Okafor", startDate: new Date("2027-04-04T00:00:00Z"), endDate: new Date("2027-07-02T00:00:00Z"), days: 90, binding: "PAPERBACK", podPackageId: "check-business", pageCount: 100, shippingLevel: "GROUND", shippingAddress: { name: "Maya Okafor" }, bookCents: 3975, shippingCents: 500, totalCents: 4475, costCents: 1500, paidByClient: true, markupCents: 1000, payoutAccountId: "acct_test" },
    });
    await tab.goto(`${server.base}/app/business`, { waitUntil: "networkidle" });
    const values = await tab.locator('[class*="tileValue"]').allTextContents();
    const labels = await tab.locator('[class*="tileLabel"]').allTextContents();
    say(labels.some((l) => l.includes("Earned this quarter")) && values.includes("$8.61"), `Home: Earned this quarter, $8.61 - her $10 share after what is kept back (${labels.join(" / ")}: ${values.join(", ")})`);
    await tab.goto(`${server.base}/app/business/orders`, { waitUntil: "networkidle" });
    say((await tab.locator(`svg[aria-label="Spent"] g[aria-label="${thisMonth}: $34.75"]`).count()) === 1, "Orders: what she paid is not the coach's spending (still $34.75 this month)");
    say((await tab.getByText("Paid by them, you receive $8.61").count()) === 1, "and her book is marked paid by her, with what reaches the coach");
    await prisma.printOrder.delete({ where: { id: hers.id } });
    // a book that failed never printed: her next one still starts where it did
    const failed = await prisma.printOrder.create({
      data: { ownerId: guest.ownerId, plannerId: journalId!, status: "FAILED", title: "Maya Okafor", startDate: new Date("2027-04-04T00:00:00Z"), endDate: new Date("2027-07-02T00:00:00Z"), days: 90, binding: "PAPERBACK", podPackageId: "check-business", pageCount: 0, shippingLevel: "GROUND", shippingAddress: { name: "Maya Okafor" }, bookCents: 0, shippingCents: 0, totalCents: 0, costCents: 0 },
    });
    say((await clientOrderDefaultsFor(guest.ownerId, journalId!))?.startISO === "2027-04-04", "a FAILED book never paid for does not push her next start past its days (still 4 Apr 2027)");
    // but one she paid for, which the printer refused, still holds its days
    await prisma.printOrder.update({ where: { id: failed.id }, data: { stripePaymentIntentId: "pi_check_refused", totalCents: 4475 } });
    say((await clientOrderDefaultsFor(guest.ownerId, journalId!))?.startISO === "2027-07-03", "a FAILED book she paid for (waiting on a retry or refund) still holds its days: her next starts 3 Jul 2027");
    await prisma.printOrder.delete({ where: { id: failed.id } });
    say((await prisma.printOrder.count({ where: { plannerId: journalId! } })) === before, "(the made-up book taken away again)");
  }
  await visitor.close();

  // THE EDITOR SAYS WHAT A JOURNAL IS to the business, and what an edit reaches.
  const templateSlug = (await prisma.planner.findUnique({ where: { id: guest.journalId } }))!.slug ?? guest.journalId;
  await tab.goto(`${server.base}/app/j/${templateSlug}`, { waitUntil: "networkidle" });
  say((await tab.getByRole("link", { name: "Template · your edits reach 1 journal" }).count()) === 1, "the template's editor: Template · your edits reach 1 journal");
  say((await tab.getByRole("button", { name: /^Reset to/ }).count()) === 0, "and no Reset to Template on a template: its pages are what every client's journal follows");
  await tab.screenshot({ path: shots ? `${shots}/biz-editor-template.png` : "/dev/null", clip: { x: 0, y: 0, width: 1280, height: 120 } }).catch(() => {});
  await tab.goto(`${server.base}/app/j/${journalId}`, { waitUntil: "networkidle" });
  say((await tab.getByRole("link", { name: "Maya Okafor's journal" }).count()) === 1, "her journal's editor: Maya Okafor's journal");
  say((await tab.getByRole("button", { name: "Reset to their template" }).count()) === 1, "and its reset says it goes back to her template");

  // A CHANGE A LINK CANNOT CARRY - a page added to the template, a setting -
  // waits for an update, which is said first, and keeps her own page.
  const weekly = tplPages.filter((p) => p.level === "WEEKLY" && p.variantKey === null);
  await prisma.page.create({ data: { plannerId: guest.journalId, level: "WEEKLY", position: weekly.length } });
  const tplTheme = ((await prisma.planner.findUnique({ where: { id: guest.journalId } }))!.theme ?? {}) as Record<string, unknown>;
  await prisma.planner.update({ where: { id: guest.journalId }, data: { theme: { ...tplTheme, weekStartDay: tplTheme.weekStartDay === 1 ? 0 : 1 } } });
  const herWeekly = herPages.filter((p) => p.level === "WEEKLY" && p.variantKey === null);
  const ownPage = await prisma.page.create({ data: { plannerId: journalId!, level: "WEEKLY", position: herWeekly.length } });
  const { clientsBehind } = await import("../src/lib/businessJournals");
  const behindNow = await clientsBehind(template!.id);
  say(behindNow.length === 1 && behindNow[0].name === "Maya Okafor", "after a page is added and a setting changed, her journal is behind the template");
  await tab.goto(`${server.base}/app/business/templates`, { waitUntil: "networkidle" });
  say((await tab.getByText("This changes the next book for 1 client: Maya Okafor.", { exact: false }).count()) === 1, "Templates says first whose next book an update changes");
  await shoot(tab, "biz-templates-behind");
  await tab.getByRole("button", { name: "Update their journal" }).click();
  await tab.getByRole("status").filter({ hasText: "1 journal updated" }).waitFor({ timeout: 60_000 });
  const after = await prisma.page.findMany({ where: { plannerId: journalId! }, orderBy: [{ level: "asc" }, { variantKey: "asc" }, { position: "asc" }] });
  const tplAfter = await prisma.page.findMany({ where: { plannerId: guest.journalId }, orderBy: [{ level: "asc" }, { variantKey: "asc" }, { position: "asc" }] });
  const herTheme = (await prisma.planner.findUnique({ where: { id: journalId! } }))!.theme as Record<string, unknown>;
  const kept = after.find((p) => p.id === ownPage.id);
  say(
    tplAfter.every((t) => t.savedPageId && after.some((p) => p.savedPageId === t.savedPageId && p.level === t.level && p.position === t.position)),
    `after the update she has every page of the template, the new one too, linked, in its place (${tplAfter.length} pages)`
  );
  say(herTheme?.weekStartDay === (tplTheme.weekStartDay === 1 ? 0 : 1), "and the template's changed setting");
  say(!!kept && kept.position === weekly.length + 1, `her own page is kept, after the template's (position ${kept?.position})`);
  say((await clientsBehind(template!.id)).length === 0, "and nothing is behind any more");
  // the page redraws a moment after the toast; wait for the notice to go
  await tab.getByText("pages or settings changed").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  say((await tab.getByText("pages or settings changed").count()) === 0, "Templates no longer asks");

  // RESET TO THEIR TEMPLATE from her journal's editor (2026-10-22): her own
  // page goes, and her journal is the template's pages again, linked.
  await tab.goto(`${server.base}/app/j/${journalId}`, { waitUntil: "networkidle" });
  tab.once("dialog", (dialog) => void dialog.accept());
  await tab.getByRole("button", { name: "Reset to their template" }).click();
  await tab.getByRole("button", { name: "Reset to their template" }).waitFor({ timeout: 60_000 });
  await tab.waitForTimeout(800);
  const reset = await prisma.page.findMany({ where: { plannerId: journalId! }, orderBy: [{ level: "asc" }, { variantKey: "asc" }, { position: "asc" }] });
  const tplNow = await prisma.page.findMany({ where: { plannerId: guest.journalId }, orderBy: [{ level: "asc" }, { variantKey: "asc" }, { position: "asc" }] });
  say(
    !reset.some((p) => p.id === ownPage.id) && reset.length === tplNow.length && tplNow.every((t) => reset.some((p) => p.savedPageId === t.savedPageId && p.level === t.level && p.position === t.position)),
    `Reset to their template: her own page gone, the template's ${tplNow.length} pages, linked, in their places (${reset.length})`
  );
  await tab.goto(`${server.base}/app/business/templates`, { waitUntil: "networkidle" });

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
