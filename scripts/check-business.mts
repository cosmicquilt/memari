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
import { coverBrandFor } from "../src/lib/print/coverBrand";
import { makeIntakeToken, turnOffIntake } from "../src/lib/clientIntake";

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
  // THE DOODLE WALL (2026-10-31): the start dialog's pens, fainter, behind
  // the coach's workspace - Studio's wall in light, Night's in dark - and
  // the picture really there, not a 404 behind a plain ground.
  const wallOf = () => tab.evaluate(() => getComputedStyle(document.querySelector("[data-biz-root]")!).backgroundImage);
  const studio = await wallOf();
  const studioUrl = /url\("?([^")]+)"?\)/.exec(studio)?.[1] ?? "";
  const served = studioUrl ? (await fetch(studioUrl)).status : 0;
  say(/doodle-walls\/studio-\d\.webp/.test(studio) && served === 200, `THE WORKSPACE HAS ITS FAINT DOODLE WALL, and it loads (${studioUrl.split("/").pop()} ${served})`);
  await tab.evaluate(() => document.querySelector("[data-biz-root]")!.setAttribute("data-mode", "dark"));
  say(/doodle-walls\/night-\d\.webp/.test(await wallOf()), "in dark, Night's wall");
  await tab.evaluate(() => document.querySelector("[data-biz-root]")!.setAttribute("data-mode", "light"));
  await tab.reload({ waitUntil: "networkidle" });
  say((await wallOf()) === studio, "the same wall after the page is drawn again (one a coach a day: it doesn't jump after a save)");
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
  // ...and one made in HER journal stays in hers (review, 2026-10-26): never
  // copied back to the template, its saved page, or on to another client.
  {
    const hers = herModules.find((m) => (m.propValues as Record<string, unknown>).checkBusinessMark === "edited in the template")!;
    await prisma.moduleInstance.update({ where: { id: hers.id }, data: { propValues: { ...(hers.propValues as Record<string, unknown>), checkBusinessMark: "edited in Maya's journal" } } });
    const spread = await syncLinkedPages([herPage.id]);
    const tplNow = await prisma.moduleInstance.findMany({ where: { pageId: page.id } });
    const savedNow = await prisma.savedPage.findUnique({ where: { id: page.savedPageId! } });
    say(
      spread.length === 0 && !tplNow.some((m) => (m.propValues as Record<string, unknown>).checkBusinessMark === "edited in Maya's journal") && !JSON.stringify(savedNow?.content ?? {}).includes("edited in Maya's journal"),
      `an edit made in Maya's journal stays in hers: not copied to the template or its saved page (${spread.length} other pages rewritten)`
    );
  }
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

  // EXPORT (2026-10-30): the coach's clients as a spreadsheet, and her
  // journal as a PDF - their work is theirs to take (businessExport.ts).
  {
    const sheet = await tab.request.get(`${server.base}/app/business/clients/export`);
    const text = await sheet.text();
    say(
      sheet.status() === 200 && (sheet.headers()["content-type"] ?? "").includes("text/csv") && (sheet.headers()["content-disposition"] ?? "").includes("northwind-coaching-clients-") && text.includes("Maya Okafor") && text.includes("120 Elm Street"),
      `Download all: a spreadsheet of her, with her address (${sheet.status()}, ${text.split("\r\n")[1]?.slice(0, 60)})`
    );
    say((await tab.getByRole("link", { name: "Download all" }).count()) === 1, "Clients offers Download all");
    const stranger = await browser.newContext();
    const theirs = await stranger.request.get(`${server.base}/app/business/clients/export`);
    say(theirs.status() === 404 && !(await theirs.text()).includes("Maya"), `someone else asking gets no spreadsheet (${theirs.status()})`);
    await stranger.close();
    const herPage = `${server.base}/app/business/clients/${client!.id}`;
    await tab.goto(herPage, { waitUntil: "networkidle" });
    const pdfLink = await tab.getByRole("link", { name: "Download as PDF" }).getAttribute("href");
    const pdf = pdfLink ? await tab.request.get(`${server.base}${pdfLink}`, { timeout: 180_000 }) : null;
    say(!!pdf && pdf.status() === 200 && (pdf.headers()["content-type"] ?? "").includes("pdf") && (await pdf.body()).subarray(0, 5).toString() === "%PDF-", `her page: Download as PDF gives her whole book (${pdf?.status()})`);
  }

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
  // THE COACH ON THE COVER (2026-10-30, coverBrand.ts): her book and a
  // sample of the template both carry the business; the logo is asked for
  // (a stand-in here, so the check never reaches the network).
  {
    let asked = "";
    const hers = await coverBrandFor(journalId!, async (url) => {
      asked = url;
      return undefined;
    });
    const sample = await coverBrandFor(guest.journalId, async () => undefined);
    say(hers?.name === "Northwind Coaching" && sample?.name === "Northwind Coaching" && asked.endsWith("otter-1.webp"), `her book and the template's sample name the coach, and ask for the logo (${hers?.name}, ${sample?.name}, ${asked})`);
  }

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
  // A guest is not emailed for (clientLinkSend.ts, review 2026-10-26): the
  // card says why, and offers the link to copy instead.
  say(
    (await tab.getByText("Sign in to have Memari email it to maya@example.com", { exact: false }).count()) === 1 && (await tab.getByRole("button", { name: /^Email Maya/ }).count()) === 0,
    "as a guest, her card says to sign in for Memari to email her link, and has no email button"
  );
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
  const herWall = await her.evaluate(() => getComputedStyle(document.querySelector("[data-biz-root]")!).backgroundImage);
  say(herWall === "none", `her page has no doodle wall: it carries her coach's brand, not ours (${herWall.slice(0, 60)})`);
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
  // TURN IT OFF, WITH AN UNDO (review, 2026-10-26: it could not be taken
  // back, so a mis-click left her emailed link dead): closed at once, and
  // Undo opens the same link again; turned off for good, it stays closed.
  await tab.getByRole("button", { name: "Turn it off" }).click();
  const undo = tab.getByRole("status").getByRole("button", { name: "Undo" });
  await undo.waitFor();
  say((await her.goto(newLink))?.status() === 404, "turned off: her page is closed at once");
  await shoot(tab, "biz-link-off-undo");
  await undo.click();
  await tab.waitForTimeout(800);
  say((await her.goto(newLink))?.status() === 200 && (await linkBox.count()) === 1, "TURN IT OFF HAS AN UNDO: the same link opens her page again, and is shown to copy again");
  await tab.getByRole("button", { name: "Turn it off" }).click();
  await undo.waitFor();
  await tab.waitForTimeout(800);
  say((await her.goto(newLink))?.status() === 404 && (await prisma.businessClient.findUnique({ where: { id: client!.id } }))?.accessMadeAt === null, "turned off again and left: her page stays closed");
  say((await tab.getByRole("button", { name: "Make a link to copy" }).count()) === 1, "and the card offers a new link, not the old one");
  say((await her.goto(`${server.base}/c/not-a-real-token`))?.status() === 404, "a made-up link opens nothing");

  // EMAILED (2026-10-22; the words are clientLinkEmail.test). The steps the
  // button takes (clientLinkSend.ts), run here as the coach once signed in,
  // with a sender standing in for Resend so nothing is ever really sent.
  let emailedLink = "";
  {
    const { emailClientLink, LINKS_PER_DAY } = await import("../src/lib/clientLinkSend");
    const business = await prisma.business.findUniqueOrThrow({ where: { ownerId: guest.ownerId } });
    const sent: string[] = [];
    const notSetUp = async (email: { to: string }) => (sent.push(email.to), { sent: false, reason: "not configured" });
    const asCoach = (guestNow: boolean, now?: Date) =>
      emailClientLink({ owner: { id: guest.ownerId, guest: guestNow }, business, clientId: client!.id, portalUrl: (token) => `${server.base}/c/${token}`, replyTo: () => "coach@example.com", send: notSetUp, now });
    const hashBefore = (await prisma.businessClient.findUnique({ where: { id: client!.id } }))?.accessTokenHash ?? null;
    const asGuest = await asCoach(true);
    say(!asGuest.sent && /Sign in/.test(asGuest.error) && sent.length === 0 && (await prisma.businessClient.findUnique({ where: { id: client!.id } }))?.accessTokenHash === hashBefore, "a guest asking anyway is refused: nothing sent, no new link made");
    const first = await asCoach(false, new Date(Date.now() + 61_000));
    emailedLink = !first.sent ? first.url ?? "" : "";
    const afterEmail = await prisma.businessClient.findUnique({ where: { id: client!.id } });
    say(!first.sent && /not set up/.test(first.error) && sent[0] === "maya@example.com" && /\/c\/[A-Za-z0-9_-]{43}$/.test(emailedLink) && (await her.goto(emailedLink))?.status() === 200, "signed in, with email not set up: a new link made, offered to copy, and it opens her page");
    const again = await asCoach(false);
    const stillSame = await prisma.businessClient.findUnique({ where: { id: client!.id } });
    say(!again.sent && /a moment ago/.test(again.error) && stillSame?.accessTokenHash === afterEmail?.accessTokenHash && (await her.goto(emailedLink))?.status() === 200, "pressed again within a minute: no second link, the first still opens");
    // a business's day of links is capped
    // counted from the emails: one already, and the rest of a day's
    await prisma.clientLinkEmail.createMany({ data: Array.from({ length: LINKS_PER_DAY - 1 }, () => ({ businessId: business.id })) });
    const capped = await asCoach(false, new Date(Date.now() + 120_000));
    say(!capped.sent && new RegExp(`${LINKS_PER_DAY} links in a day`).test(capped.error) && sent.length === 1, `after ${LINKS_PER_DAY} links emailed in a day, no more are`);
    // and turning the link off does not start the count again
    const { turnOffClientLink } = await import("../src/lib/clientPortal");
    await turnOffClientLink(guest.ownerId, client!.id);
    const afterOff = await asCoach(false, new Date(Date.now() + 180_000));
    say(!afterOff.sent && /links in a day/.test(afterOff.error) && sent.length === 1, "turning her link off and asking again is still refused");
    await prisma.clientLinkEmail.deleteMany({ where: { businessId: business.id } });
    // (her link back, for what follows)
    const { makeClientLink } = await import("../src/lib/clientPortal");
    emailedLink = `${server.base}/c/${await makeClientLink(guest.ownerId, client!.id)}`;
  }
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
    // what her page offers depends on whether this machine has payment and printer keys
    if ((await import("../src/lib/print/orders")).orderingConfigured().ok) {
      say(
        (await herPage.getByRole("heading", { name: "Order your next book" }).count()) === 1 && (await herPage.getByRole("group", { name: "Binding" }).count()) === 1 && (await herPage.getByRole("button", { name: "See prices" }).count()) === 1 && (await herPage.getByText("Ordering is not open yet", { exact: false }).count()) === 0,
        "her page: Order your next book, with its bindings and See prices (payment keys here)"
      );
      // prices for a paperback: post to choose with dates in words, or why
      // not - never an empty list of post (2026-10-25, paying as a client)
      await herPage.getByRole("radio", { name: "paperback" }).check();
      await herPage.getByRole("button", { name: "See prices" }).click();
      // the form's own message: Next puts an empty role=alert on every page
      await herPage.locator('input[name="level"], p[role="alert"]').first().waitFor({ timeout: 60_000 });
      const post = await herPage.locator('input[name="level"]').evaluateAll((rs) => rs.map((r) => (r.closest("label") as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
      const why = await herPage.locator('p[role="alert"]').textContent({ timeout: 1000 }).catch(() => null);
      say(
        (post.length > 0 && post.every((p) => !/\d{4}-\d{2}-\d{2}/.test(p))) || (post.length === 0 && !!why && (await herPage.locator("legend", { hasText: /^Post$/ }).count()) === 0),
        `her paperback: ${post.length ? `post to choose, dates in words (${post[0]})` : `the reason, and no empty post list (${why})`}`
      );
    } else {
      say((await herPage.getByRole("heading", { name: "Order your next book" }).count()) === 1 && (await herPage.getByText("Ordering is not open yet", { exact: false }).count()) === 1, "her page: Order your next book, saying ordering is not open yet (no payment keys here)");
    }
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
  // ...and what the coach wrote in HER journal on a template page is still
  // there (second review, 2026-10-26): the update keeps her copy of a page
  // the template still has, rather than copying it again.
  {
    const herCopy = await prisma.page.findFirst({ where: { plannerId: journalId!, savedPageId: page.savedPageId, savedPageIndex: page.savedPageIndex }, include: { moduleInstances: true } });
    say(!!herCopy?.moduleInstances.some((m) => (m.propValues as Record<string, unknown>).checkBusinessMark === "edited in Maya's journal"), "the update keeps the edit made in Maya's journal");
  }
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

  // FIXED IN REVIEW (2026-10-26): the name on the cover reaches her journal's
  // title, which every cover prints; moving her to another template takes
  // the old one's pages away rather than keeping them beside the new one's;
  // and "Stop using" a template, then Undo, puts its clients back on it - a
  // client's journal following its own template, and nothing else.
  {
    await tab.goto(`${server.base}/app/business/clients/${client!.id}`, { waitUntil: "networkidle" });
    await tab.locator('input[name="coverName"]').fill("Maya O.");
    await tab.getByRole("button", { name: "Save" }).click();
    await tab.waitForURL("**/app/business/clients");
    say((await prisma.planner.findUnique({ where: { id: journalId! } }))?.title === "Maya O.", "a corrected name on the cover reaches her journal, so her next cover prints it");

    const { createBookFor, validateNewJournal } = await import("../src/app/planner/bookSeeding.js");
    const second = await createBookFor(
      guest.ownerId,
      validateNewJournal({ title: "Second template", trim: "bound7x10", startISO: "2027-01-04", endISO: "2027-03-31", levels: ["WEEKLY"], dated: true, weekStartDay: 0, font: "serif" })
    );
    const secondTemplate = await prisma.businessTemplate.create({ data: { businessId: business!.id, plannerId: second.id } });
    const own = await prisma.page.create({ data: { plannerId: journalId!, level: "WEEKLY", position: 500 } });
    const aLinks = new Set((await prisma.page.findMany({ where: { plannerId: guest.journalId, savedPageId: { not: null } }, select: { savedPageId: true } })).map((p) => p.savedPageId));
    await tab.goto(`${server.base}/app/business/clients/${client!.id}`, { waitUntil: "networkidle" });
    await tab.getByLabel("Template").selectOption(secondTemplate.id);
    await tab.getByRole("button", { name: "Save" }).click();
    await tab.waitForURL("**/app/business/clients", { timeout: 60_000 });
    const moved = await prisma.page.findMany({ where: { plannerId: journalId! }, include: { savedPage: { select: { sourceKey: true } } } });
    const bPages = await prisma.page.findMany({ where: { plannerId: second.id } });
    say(
      !moved.some((p) => p.savedPageId && aLinks.has(p.savedPageId)) && !moved.some((p) => p.savedPage?.sourceKey === `template:${guest.journalId}`) && moved.length === bPages.length + 1 && moved.some((p) => p.id === own.id),
      `moved to another template: the old one's pages gone, the new one's ${bPages.length} in, her own page kept (${moved.length} pages)`
    );

    // an edit to the new template reaches her; then Stop using, and Undo
    const { syncLinkedPages } = await import("../src/app/planner/savedItems");
    const bPage = (await prisma.page.findMany({ where: { plannerId: second.id }, include: { moduleInstances: true } })).find((p) => p.moduleInstances.length && p.savedPageId)!;
    const mark = async (word: string) => {
      const m = bPage.moduleInstances[0];
      await prisma.moduleInstance.update({ where: { id: m.id }, data: { propValues: { ...(m.propValues as Record<string, unknown>), checkBusinessMark: word } } });
      await syncLinkedPages([bPage.id]);
      const hers = await prisma.page.findFirst({ where: { plannerId: journalId!, savedPageId: bPage.savedPageId, savedPageIndex: bPage.savedPageIndex }, include: { moduleInstances: true } });
      return !!hers?.moduleInstances.some((x) => (x.propValues as Record<string, unknown>).checkBusinessMark === word);
    };
    say(await mark("edited in the second template"), "an edit to her new template reaches her journal");
    await tab.goto(`${server.base}/app/business/templates`, { waitUntil: "networkidle" });
    const stop = () => tab.locator("div, li, article, section").filter({ hasText: "Second template" }).filter({ has: tab.getByRole("button", { name: "Stop using" }) }).last().getByRole("button", { name: "Stop using" });
    await stop().click();
    await tab.getByText("Second template is no longer a template").waitFor();
    say((await prisma.businessClient.findUnique({ where: { id: client!.id } }))?.templateId === null, "Stop using: she is on no template");
    await tab.getByRole("button", { name: "Undo" }).click();
    await tab.waitForTimeout(1500);
    const back = await prisma.businessTemplate.findUnique({ where: { plannerId: second.id } });
    say(!!back && (await prisma.businessClient.findUnique({ where: { id: client!.id } }))?.templateId === back.id, "Undo: the journal is a template again, and she is back on it");
    say(await mark("edited after the undo"), "and its edits reach her again");
    await tab.goto(`${server.base}/app/business/templates`, { waitUntil: "networkidle" });
    await stop().click();
    await tab.getByText("Second template is no longer a template").waitFor();
    await tab.waitForTimeout(500);
    say(!(await mark("edited once it was no template")), "once it is not her template, its edits no longer reach her journal");
    await prisma.planner.delete({ where: { id: second.id } });
  }
  await tab.goto(`${server.base}/app/business/templates`, { waitUntil: "networkidle" });

  // CLIENTS WITHOUT TYPING (2026-10-30, clientIntake.ts): a spreadsheet, and
  // the web address other tools post to. The clients made here are taken
  // away again at the end, so what follows still counts one client.
  {
    const before = new Set((await prisma.businessClient.findMany({ where: { businessId: business!.id }, select: { id: true } })).map((c) => c.id));
    const csv = "Name,Email,Street,City,State,Zip,Months\nMaya Okafor,maya@example.com,120 Elm Street,Jersey City,NJ,07302,3\nSam Lee,sam@example.com,5 Oak Ave,Hoboken,NJ,07030,6\nAna Ruiz,,,,,,12\nBad Email,nope,,,,,3\n";
    const file = { name: "clients.csv", mimeType: "text/csv", buffer: Buffer.from(csv) };
    await tab.goto(`${server.base}/app/business/clients`, { waitUntil: "networkidle" });
    await tab.getByRole("link", { name: "Import" }).click();
    await tab.getByRole("heading", { name: "Import clients" }).waitFor();
    await tab.locator('input[type="file"]').setInputFiles(file);
    await tab.getByRole("button", { name: "Add 2 clients" }).waitFor({ timeout: 30_000 });
    say(
      (await tab.getByText("Already here", { exact: true }).count()) === 1 && (await tab.getByText(/Row 5: Bad Email/).count()) === 1,
      "Import: Maya is already here, row 5's email is refused, two to add"
    );
    await shoot(tab, "biz-import-preview");
    await tab.getByRole("button", { name: "Add 2 clients" }).click();
    await tab.getByText(/Added 2 clients/).waitFor({ timeout: 30_000 });
    const sam = await prisma.businessClient.findFirst({ where: { businessId: business!.id, email: "sam@example.com" } });
    say(!!sam && sam.bookMonths === 6 && (sam.shippingAddress as { city?: string } | null)?.city === "Hoboken" && sam.templateId === template!.id, "Sam is added: six months, his address, on the template");
    await tab.locator('input[type="file"]').setInputFiles(file);
    await tab.getByText(/0 clients to add/).waitFor({ timeout: 30_000 });
    say((await tab.getByRole("button", { name: "Add 0 clients" }).isDisabled()) === true, "the same file again adds nobody twice");

    // the web address: a guest is told to sign in; the address itself works
    await tab.goto(`${server.base}/app/business/settings`, { waitUntil: "networkidle" });
    say((await tab.getByText("Sign in to add clients from other tools: the address belongs to your account.").count()) === 1, "Settings: a guest is told the address needs an account");
    const token = await makeIntakeToken(business!.id);
    const url = `${server.base}/api/business/clients/${token}`;
    const lee = { name: "Lee Park", email: "lee@example.com", street: "1 Main St", city: "Jersey City", state: "NJ", zip: "07302", start_date: "2027-01-04", months: 3, template: "Clarity Quarterly" };
    const first = await tab.request.post(url, { data: lee });
    const again = await tab.request.post(url, { data: lee });
    const asForm = await tab.request.post(url, { form: { name: "Kim Cho", email: "kim@example.com" } });
    const bad = await tab.request.post(url, { data: { name: "Bo", email: "not-an-email" } });
    const wrong = await tab.request.post(`${server.base}/api/business/clients/${"x".repeat(43)}`, { data: lee });
    const leeRow = await prisma.businessClient.findFirst({ where: { businessId: business!.id, email: "lee@example.com" } });
    say(first.status() === 201 && again.status() === 200 && (await again.json()).already === true, `a tool posts Lee: added, and posted again, already here (${first.status()}, ${again.status()})`);
    say(!!leeRow && leeRow.startDate?.toISOString().startsWith("2027-01-04") === true && (leeRow.shippingAddress as { postcode?: string } | null)?.postcode === "07302" && leeRow.templateId === template!.id, "Lee's start, address and template are kept");
    say(asForm.status() === 201 && bad.status() === 400 && wrong.status() === 404, `a form is read too; a bad email is refused; an address that isn't one adds nobody (${asForm.status()}, ${bad.status()}, ${wrong.status()})`);
    await turnOffIntake(business!.id);
    const off = await tab.request.post(url, { data: { name: "After Off" } });
    say(off.status() === 404 && !(await prisma.businessClient.findFirst({ where: { businessId: business!.id, name: "After Off" } })), "turned off, the address adds nobody");
    await prisma.businessClient.deleteMany({ where: { businessId: business!.id, id: { notIn: [...before] } } });
  }

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

  // LOOKING IS USING (review, 2026-10-27): a guest's business is swept once
  // unused for a month (guestSweep.ts), and a coach who only reads their
  // clients' pages changes nothing - so opening it marks it used.
  const idleSince = new Date(Date.now() - 40 * 86_400_000);
  await prisma.$executeRaw`UPDATE "Business" SET "updatedAt" = ${idleSince} WHERE "ownerId" = ${guest.ownerId}`;
  await tab.goto(`${server.base}/app/business/clients`, { waitUntil: "networkidle" });
  const looked = await prisma.business.findUnique({ where: { ownerId: guest.ownerId }, select: { updatedAt: true } });
  say(!!looked && Date.now() - looked.updatedAt.getTime() < 10 * 60_000, `A GUEST COACH OPENING THEIR BUSINESS MARKS IT USED (${looked?.updatedAt.toISOString()})`);
  await context.close();

  // A NEW COACH WITH NO JOURNALS AT ALL, on Home's "Make a template" step
  // (review, 2026-10-26): told to make one, not that every journal of theirs
  // is a template already.
  const newcomer = await makeGuestJournal("Newcomer's journal");
  try {
    await prisma.planner.delete({ where: { id: newcomer.journalId } });
    await prisma.business.create({ data: { ownerId: newcomer.ownerId, name: "Fresh Coaching" } });
    const fresh = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await fresh.addCookies([{ name: newcomer.cookieName, value: newcomer.cookieValue, domain: new URL(server.base).hostname, path: "/" }]);
    const page = await fresh.newPage();
    await page.goto(`${server.base}/app/business/templates`, { waitUntil: "networkidle" });
    const words = await page.evaluate(() => document.body.innerText);
    say(/You have no journals yet/.test(words) && !/template already/.test(words), "A NEW COACH WITH NO JOURNALS IS TOLD TO MAKE ONE, not that every journal is a template already");
    await fresh.close();
  } finally {
    await prisma.business.deleteMany({ where: { ownerId: newcomer.ownerId } });
    await newcomer.remove();
  }

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
