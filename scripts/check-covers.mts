// npm run check:covers - the photographed covers, end to end (2026-11-01).
//
//   CHOSEN, in a real browser: the order screen's Cover section (drawn alone
//   by /dev/covers, as ordering is off where the printers' keys aren't set)
//   opens on the drawn cover, offers all 85 and the plain one, and a cover
//   picked is kept on the journal; the plain one picked takes it off.
//   PRINTED: the preview of the cover (the very file an order sends) carries
//   the chosen scan, once, on wire-o's two pages and a paperback's one; a
//   2:1 scan is refused for a hardcover, and a cover asked for by a name
//   that isn't one prints the drawn cover.
//   WHERE CHOOSING IS SHUT: with no scans to print from, a journal that chose
//   one is told so and can go back to the plain cover.
//   THE SCANS: one that isn't the file the manifest knows is refused; from a
//   file host (COVER_SCANS_URL) a scan is fetched and checked, a missing one
//   refused. A RENEWAL prints the journal's cover, and ends, charging
//   nothing, when its scan can't be fetched.
//
//   npm run check:covers -- <shots folder>

import "./appUnderTest.mjs";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "playwright-core";
import { ensureServer, makeGuestJournal, disconnect } from "./appUnderTest.mjs";
import { prisma } from "../src/lib/prisma";
import { coverById } from "../src/app/covers/catalogue";
import { choosableCover, coverMisfit, journalCover, loadCoverScan } from "../src/lib/print/coverScans";
import { runRenewals, type RenewalDeps } from "../src/lib/print/renewals";
import { createBookFor, validateNewJournal } from "../src/app/planner/bookSeeding";
import manifest from "../src/lib/print/coverScans.json" with { type: "json" };

const shots = process.argv[2];
const server = await ensureServer(process.env.BASE);
const browser = await chromium.launch({ channel: "chrome", headless: true });
let failures = 0;
const say = (ok: boolean, what: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
};
const HIDE_DEV = `addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal { display: none !important; }"; document.head.append(s); });`;
const SCANS: Record<string, { bytes: number }> = manifest;
const OWNER = "covers-check-throwaway";

const guest = await makeGuestJournal("The Steady Year");
const themeOf = async (id = guest.journalId) => ((await prisma.planner.findUniqueOrThrow({ where: { id }, select: { theme: true } })).theme ?? {}) as Record<string, unknown>;
const preview = async (binding: string, extra = "") => {
  const response = await fetch(`${server.base}/app/print-preview?journal=${guest.journalId}&start=2027-01-01&days=90&binding=${binding}&part=cover${extra}`, { headers: { cookie: guest.cookie } });
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = bytes.toString("latin1");
  return { status: response.status, type: response.headers.get("content-type") ?? "", bytes, text, jpegs: (text.match(/\/Filter \/DCTDecode/g) ?? []).length, pages: (text.match(/\/Type \/Page\b/g) ?? []).length };
};
let host: ReturnType<typeof createServer> | null = null;

try {
  // ---- CHOSEN
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([{ name: guest.cookieName, value: guest.cookieValue, domain: new URL(server.base).hostname, path: "/" }]);
  await context.addInitScript(HIDE_DEV);
  const tab = await context.newPage();
  await tab.goto(`${server.base}/dev/covers?journal=${guest.journalId}`);
  const name = tab.locator("[data-cover-name]");
  say((await name.textContent())?.trim() === "Plain", "A JOURNAL OPENS ON THE PLAIN COVER");
  if (shots) await tab.screenshot({ path: `${shots}/covers-row.png` });
  await tab.getByRole("button", { name: "Change" }).click();
  const tiles = tab.locator("[data-cover]");
  await tiles.first().waitFor();
  say((await tiles.count()) === 86, `the picker offers the plain cover and all 85 (${await tiles.count()})`);
  await tab.waitForTimeout(800);
  if (shots) await tab.screenshot({ path: `${shots}/covers-picker.png` });
  const onyx = coverById("Onyx010")!;
  await tab.locator('[data-cover="Onyx010"]').click();
  await tab.waitForFunction((want) => document.querySelector("[data-cover-name]")?.textContent?.trim() === want, onyx.name, { timeout: 15_000 });
  say((await themeOf()).cover === "Onyx010", `A COVER PICKED IS KEPT ON THE JOURNAL: "${onyx.name}" (theme.cover ${(await themeOf()).cover})`);
  if (shots) await tab.screenshot({ path: `${shots}/covers-chosen.png` });

  // ---- PRINTED
  const wire = await preview("wireoStandard");
  say(wire.status === 200 && wire.type.includes("pdf") && wire.jpegs === 1 && wire.pages === 2 && wire.bytes.length > SCANS.Onyx010.bytes, `THE COVER PRINTS WITH ITS SCAN: wire-o, ${wire.pages} pages, the scan carried ${wire.jpegs}x, ${(wire.bytes.length / 1e6).toFixed(2)} MB (the scan ${(SCANS.Onyx010.bytes / 1e6).toFixed(2)})`);
  if (shots) writeFileSync(`${shots}/covers-onyx010-wireo.pdf`, wire.bytes);
  const paper = await preview("paperback");
  say(paper.status === 200 && paper.jpegs === 1 && paper.pages === 1, `and a paperback's one sheet (${paper.status}, ${paper.pages} page, ${paper.jpegs} scan)`);
  if (shots) writeFileSync(`${shots}/covers-onyx010-paperback.pdf`, paper.bytes);
  await tab.getByRole("button", { name: "Change" }).click();
  await tab.locator('[data-cover="Concrete034"]').click();
  await tab.waitForFunction((want) => document.querySelector("[data-cover-name]")?.textContent?.trim() === want, coverById("Concrete034")!.name);
  const hard = await preview("hardcover");
  say(hard.status === 409 && /isn't large enough for a hardcover/.test(hard.text), `A 2:1 SCAN IS REFUSED FOR A HARDCOVER (${hard.status}: ${hard.text.slice(0, 80)})`);
  const pbConcrete = await preview("paperback");
  say(pbConcrete.status === 200 && pbConcrete.jpegs === 1, "and printed on a paperback");
  await tab.getByRole("button", { name: "Change" }).click();
  await tab.locator('[data-cover="plain"]').click();
  await tab.waitForFunction(() => document.querySelector("[data-cover-name]")?.textContent?.trim() === "Plain");
  say(!("cover" in (await themeOf())), "THE PLAIN COVER PICKED TAKES THE CHOICE OFF THE JOURNAL");
  const plain = await preview("wireoStandard");
  const bogus = await preview("wireoStandard", "&cover=NotACover");
  say(plain.status === 200 && plain.jpegs === 0 && bogus.status === 200 && bogus.jpegs === 0, "the plain cover prints drawn, as does one asked for by a name that isn't a cover");

  // ---- WHERE CHOOSING IS SHUT
  await prisma.planner.update({ where: { id: guest.journalId }, data: { theme: { ...(await themeOf()), cover: "Onyx002" } } });
  await tab.goto(`${server.base}/dev/covers?journal=${guest.journalId}&offered=0`);
  const shut = tab.getByText("Photographed covers can’t be printed yet.");
  say(await shut.isVisible(), "WITH NO SCANS TO PRINT FROM, A JOURNAL THAT CHOSE ONE IS TOLD SO");
  if (shots) await tab.screenshot({ path: `${shots}/covers-shut.png` });
  await tab.getByRole("button", { name: "Use the plain cover" }).click();
  await tab.waitForFunction(() => document.querySelector("[data-cover-name]")?.textContent?.trim() === "Plain");
  say(!("cover" in (await themeOf())), "and goes back to the plain cover");
  await context.close();

  // ---- THE SCANS
  say(!choosableCover("NotACover") && journalCover({ cover: "NotACover" }) === null && journalCover({ cover: "Onyx010" })?.kind === "wordmark", "a name that isn't a cover is never one a journal has");
  say(
    coverMisfit({ cover: "Concrete034" }, "hardcover", "wrap", { widthIn: 7, heightIn: 10 }, 200) !== null && coverMisfit({ cover: "Concrete034" }, "wireo", "panels", { widthIn: 7, heightIn: 10 }, 200) === null && coverMisfit({}, "hardcover", "wrap", { widthIn: 7, heightIn: 10 }, 200) === null,
    "the order screen's bindings: a hardcover ruled out for a 2:1 scan, wire-o not, nothing for the drawn cover"
  );
  const TAMPERED = "handoff/print-scans-check";
  mkdirSync(TAMPERED, { recursive: true });
  copyFileSync("handoff/print-scans/Onyx005.jpg", `${TAMPERED}/Onyx005.jpg`);
  const bytes = readFileSync(`${TAMPERED}/Onyx005.jpg`);
  bytes[bytes.length - 100] ^= 0xff;
  writeFileSync(`${TAMPERED}/Onyx005.jpg`, bytes);
  process.env.COVER_SCANS_DIR = TAMPERED;
  let tampered = "";
  try {
    await loadCoverScan("Onyx005");
  } catch (error) {
    tampered = (error as Error).message;
  }
  say(/can't be printed right now/.test(tampered), `A SCAN THAT ISN'T THE FILE THE MANIFEST KNOWS IS REFUSED ("${tampered}")`);
  rmSync(TAMPERED, { recursive: true, force: true });
  delete process.env.COVER_SCANS_DIR;

  // a file host: the scans folder served over HTTP, as a Blob store would
  host = createServer((request, response) => {
    try {
      const file = readFileSync(`handoff/print-scans/${decodeURIComponent((request.url ?? "").slice(1))}`);
      response.writeHead(200, { "Content-Type": "image/jpeg" }).end(file);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => host!.listen(0, resolve));
  const port = (host.address() as { port: number }).port;
  process.env.COVER_SCANS_URL = `http://127.0.0.1:${port}/`;
  const fetched = await loadCoverScan("Wood052");
  say(fetched.data.length === (SCANS as Record<string, { bytes: number }>).Wood052.bytes && fetched.width === 3600, `FROM A FILE HOST A SCAN IS FETCHED AND CHECKED (${(fetched.data.length / 1e6).toFixed(2)} MB)`);
  process.env.COVER_SCANS_URL = `http://127.0.0.1:${port}/missing/`;
  let missing = "";
  try {
    await loadCoverScan("Wood060");
  } catch (error) {
    missing = (error as Error).message;
  }
  say(/can't be fetched right now/.test(missing), `and one it hasn't got is refused ("${missing}")`);

  // ---- A RENEWAL
  process.env.COVER_SCANS_URL = `http://127.0.0.1:${port}/`;
  await prisma.ownerSettings.upsert({ where: { ownerId: OWNER }, create: { ownerId: OWNER, stripeCustomerId: "cus_check" }, update: {} });
  const journal = async (cover: string) => {
    const book = await createBookFor(
      OWNER,
      validateNewJournal({ title: "Covers check", trim: "bound7x10", startISO: "2027-01-01", endISO: "2027-03-31", levels: ["JOURNAL", "MONTHLY", "WEEKLY", "DAILY"], dated: true, weekStartDay: 0, font: "serif" })
    );
    await prisma.planner.update({ where: { id: book.id }, data: { theme: { ...((book.theme as object | null) ?? {}), cover } } });
    return book.id;
  };
  const order = (plannerId: string) =>
    prisma.printOrder.create({
      data: {
        ownerId: OWNER,
        plannerId,
        title: "Covers check",
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
        renewsAt: new Date(Date.now() - 86_400_000),
        stripePaymentMethodId: "pm_check",
      },
    });
  const charges: string[] = [];
  const deps: RenewalDeps = {
    printCost: async () => ({ printCents: 1100, fulfillmentCents: 75, shippingCents: 599, taxCents: 0, totalCents: 1774, currency: "USD" }),
    coverDimensions: async () => ({ widthPt: 1046, heightPt: 738 }),
    charge: async (input) => {
      charges.push(input.orderId);
      return { ok: true, paymentIntentId: `pi_${input.orderId}` };
    },
    email: async () => ({ sent: true }),
    fulfil: async (orderId) => {
      await prisma.printOrder.update({ where: { id: orderId }, data: { status: "SUBMITTED", luluPrintJobId: `job_${orderId}` } });
    },
  };
  const first = await order(await journal("Travertine002"));
  const outcomes = await runRenewals(new Date(), deps);
  const renewal = await prisma.printOrder.findFirst({ where: { renewedFromId: first.id }, include: { files: true } });
  const coverFile = renewal?.files.find((f) => f.kind === "cover");
  const coverText = coverFile ? Buffer.from(coverFile.bytes).toString("latin1") : "";
  say(
    outcomes.find((o) => o.orderId === first.id)?.outcome === "renewed" && (coverText.match(/\/Filter \/DCTDecode/g) ?? []).length === 1,
    `A RENEWAL PRINTS THE JOURNAL'S COVER (${outcomes.find((o) => o.orderId === first.id)?.outcome}, its cover file ${((coverFile?.bytes.length ?? 0) / 1e6).toFixed(2)} MB with the scan)`
  );
  // a cover whose scan the host hasn't got
  process.env.COVER_SCANS_URL = `http://127.0.0.1:${port}/missing/`;
  const second = await order(await journal("Wood061"));
  const charged = charges.length;
  const outcomes2 = await runRenewals(new Date(), deps);
  const failed = await prisma.printOrder.findFirst({ where: { renewedFromId: second.id } });
  const mine = outcomes2.find((o) => o.orderId === second.id);
  say(mine?.outcome === "failed" && /its cover couldn't be fetched/.test(mine.detail ?? "") && failed?.status === "FAILED" && charges.length === charged, `A RENEWAL WHOSE SCAN CAN'T BE FETCHED ENDS, CHARGING NOTHING ("${mine?.detail}")`);
} finally {
  host?.close();
  delete process.env.COVER_SCANS_URL;
  await prisma.printOrder.deleteMany({ where: { ownerId: OWNER } });
  await prisma.planner.deleteMany({ where: { ownerId: OWNER } });
  await prisma.ownerSettings.deleteMany({ where: { ownerId: OWNER } });
  await guest.remove();
  await browser.close();
  await disconnect();
  server.stop?.();
}

console.log(failures ? `\n${failures} cover check(s) failed.` : "\nAll cover checks passed.");
process.exitCode = failures ? 1 : 0;
