// npm run check:covers-page - the covers page (2026-11-05, board 4 of the
// covers mockups): the chosen cover on its stage, "Make it yours" drawing
// the person's own front, and the swatch book below. In a real browser,
// at a desktop and a phone width:
//
// - the address names the cover on the stage (its h1), and a fresh /covers
//   opens on the first one
// - every option reaches the flat front: the mark's kind, its finish (a
//   light cover's gold is its deeper gold), the dates in the order's words,
//   and a typed name
// - the options stay as another cover is chosen, the address and tab
//   follow, and the stage comes back into view from the covers below
// - the materials filter the book; the arrows go through what is in view
// - HEARTS (part 3): the first heart makes a guest (an httpOnly cookie);
//   hearts from the stage and the cards are kept on the server (a reload
//   keeps them), "Your hearts" shows only those, newest first, as does the
//   example order screen; quick taps end as the last tap left them; with
//   none, the empty state
// - no hydration warning (the arrival curtain turns lazy pictures eager on
//   purpose) and no sideways scroll on a phone
//
//   npm run check:covers-page -- <shots folder>

import "./appUnderTest.mjs";
import { chromium, type Page } from "playwright-core";
import { ensureServer } from "./appUnderTest.mjs";
import { COVERS, coverById, coverNumber, type Cover } from "../src/app/covers/catalogue";
import { coverDatesWords } from "../src/lib/print/coverDates";

const shots = process.argv[2];
let failures = 0;
const say = (ok: boolean, what: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
};

const server = await ensureServer();
const browser = await chromium.launch({ channel: "chrome", headless: true });

// the dates the page shows: the three whole months from next month
const now = new Date();
const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
const expectedDates = coverDatesWords({ start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0)) });

/** a cover as the page names it: "Onyx 009" */
const shownName = (c: Cover) => `${c.material} ${coverNumber(c)}`;
const stage = (tab: Page) => tab.locator('section[aria-label$=" cover"]');
const opener = (tab: Page) => stage(tab).locator('button[aria-haspopup="dialog"]');
const front = (tab: Page) => opener(tab).locator(":scope > div");
/** the flat front: its mark (the print's own picture, "m-sans-gold", and
 *  where it sits) and its words, as [text, class words] */
type FrontRead = { mark: string | null; at: string; words: Array<[string, string]> };
const readFront = (el: Element): FrontRead => {
  const img = el.querySelector('img[class*="frontMarkImg"]') as HTMLImageElement | null;
  return {
    mark: img ? (img.getAttribute("src") ?? "").split("/").pop()!.replace(".png", "") : null,
    at: img ? `${img.style.left} ${img.style.top}` : "",
    words: [...el.querySelectorAll("span")].map((s) => [s.textContent ?? "", s.className.replace(/covers-module__\w+__/g, "")] as [string, string]),
  };
};
const marks = (tab: Page) => front(tab).evaluate(readFront);
const pick = async (tab: Page, group: string, label: string) => {
  await stage(tab).locator(`[aria-labelledby="opt-${group}"] button`, { hasText: new RegExp(`^${label.replace(/\./g, "\\.")}$`) }).click();
  await tab.waitForTimeout(120);
};

try {
  // THE HEARTS ADDRESS REFUSES what is not ours to keep, and making nothing
  // makes no guest
  const hearts = `${server.base}/app/saved/covers`;
  const post = (body: unknown, origin?: string) =>
    fetch(hearts, { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  const foreign = await post({ coverId: "Onyx010" }, "https://elsewhere.example");
  const unknown = await post({ coverId: "NotACover001" });
  const offByNobody = await fetch(hearts, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coverId: "Onyx010" }) });
  say(foreign.status === 403 && !foreign.headers.get("set-cookie"), `hearts: a heart sent from another site is refused, and makes no guest (${foreign.status})`);
  say(unknown.status === 400 && !unknown.headers.get("set-cookie"), `hearts: a cover that isn't one of ours is refused (${unknown.status})`);
  say(offByNobody.status === 200 && !offByNobody.headers.get("set-cookie"), `hearts: taking a heart off as nobody makes no guest (${offByNobody.status})`);

  for (const [label, width, height] of [["desktop", 1280, 800], ["phone", 390, 844]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    // the development build's own badge left out of the shots
    await context.addInitScript(`addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal { display: none !important; }"; document.head.append(s); });`);
    const tab = await context.newPage();
    const warnings: string[] = [];
    tab.on("console", (m) => {
      if (m.text().includes("hydrat")) warnings.push(m.text().slice(0, 160));
    });
    tab.on("pageerror", (e) => warnings.push(e.message.slice(0, 160)));

    // a fresh /covers opens on the first cover
    await tab.goto(`${server.base}/covers`, { waitUntil: "networkidle" });
    say((await tab.locator("h1").textContent()) === shownName(COVERS[0]), `${label}: /covers opens on the first cover (${shownName(COVERS[0])}, its number in three digits)`);

    // the address names the cover; it starts as pictured: Onyx 9 is gold memari. in serif, dated
    const onyx9 = coverById("Onyx010")!;
    await tab.goto(`${server.base}/covers/${onyx9.slug}`, { waitUntil: "networkidle" });
    await tab.waitForTimeout(800);
    say((await tab.locator("h1").textContent()) === shownName(onyx9), `${label}: /covers/${onyx9.slug} puts ${shownName(onyx9)} on the stage`);
    let m = await marks(tab);
    say(
      m.mark === "memari-serif-gold" && m.at === "50% 32%" && m.words.some(([t, c]) => t === expectedDates && c.includes("inkGold")),
      `${label}: its front starts as pictured: the print's gold serif memari. a third down, dated "${expectedDates}" (${JSON.stringify(m)})`
    );

    // every option reaches the front
    await pick(tab, "mark", "m. corner");
    await pick(tab, "finish", "Imprint");
    await pick(tab, "dates", "Off");
    m = await marks(tab);
    say(m.mark === "m-sans-imprint" && m.at === "87.6% 92.2%" && m.words.length === 0, `${label}: m. corner, imprint, dates off reach the front (${JSON.stringify(m)})`);
    await pick(tab, "name", "On");
    await stage(tab).getByLabel("Name on the cover").fill("Sam Rivera");
    await tab.waitForTimeout(150);
    m = await marks(tab);
    say(m.words.some(([t, c]) => t === "Sam Rivera" && c.includes("frontName") && c.includes("inkImprint")), `${label}: a typed name prints under the mark, in its finish`);
    // no mark at all: the name alone, in the mark's place a third of the way down
    await pick(tab, "mark", "No mark");
    m = await marks(tab);
    const nameTop = await front(tab).evaluate((el) => (el.querySelector('span[class*="frontName"]') as HTMLElement | null)?.style.top ?? "");
    say(m.mark === null && m.words.some(([t]) => t === "Sam Rivera") && nameTop.includes("34%"), `${label}: No mark leaves the front without one, the name in its place (${JSON.stringify(m)}, top ${nameTop})`);
    if (shots && label === "desktop") await stage(tab).screenshot({ path: `${shots}/covers-stage-nomark.png` });
    await pick(tab, "mark", "m. centre");
    await pick(tab, "finish", "Gold");
    m = await marks(tab);
    say(m.mark === `m-sans-${onyx9.goldTone}` && m.at === "50% 34%", `${label}: m. centre in gold, the print's own picture (${m.mark})`);
    // drawn at its printed size: 0.132 of the front's width, its own shape
    // (1109 x 584 at 1200 ppi), never stretched by the texture's rule
    const drawn = await front(tab).evaluate((el) => {
      const img = el.querySelector('img[class*="frontMarkImg"]') as HTMLImageElement;
      const f = el.getBoundingClientRect();
      const r = img.getBoundingClientRect();
      return { width: r.width / f.width, ratio: r.width / r.height, middle: (r.top + r.height / 2 - f.top) / f.height };
    });
    say(Math.abs(drawn.width - 0.132) < 0.003 && Math.abs(drawn.ratio - 1109 / 584) < 0.03 && Math.abs(drawn.middle - 0.34) < 0.005, `${label}: the mark is drawn at its printed size and place (${drawn.width.toFixed(3)} wide, ${drawn.ratio.toFixed(2)}:1, middle ${drawn.middle.toFixed(3)} down)`);
    if (shots) await stage(tab).screenshot({ path: `${shots}/covers-stage-${label}.png` });

    // A CLOSE LOOK: a magnifier over the front; a click opens it large, on the
    // cover's whole scan, with the same marks; it zooms, and Esc gives the
    // focus back to the front
    say((await opener(tab).evaluate((el) => getComputedStyle(el).cursor)) === "zoom-in", `${label}: the front shows a magnifier to look closer`);
    const scanStatus = (await fetch(`${server.base}/covers/${onyx9.slug}/scan`, { redirect: "manual" })).status;
    say(scanStatus === 200 || scanStatus === 307, `${label}: the cover's whole scan is served for it (${scanStatus})`);
    await opener(tab).click();
    const zoom = tab.locator("[data-cover-zoom]");
    await zoom.waitFor();
    await tab.waitForFunction(() => document.querySelector("[data-cover-zoom] img")?.getAttribute("src")?.endsWith("/scan"), null, { timeout: 20_000 }).catch(() => {});
    const zoomed = await zoom.evaluate((el) => ({ src: el.querySelector("img")?.getAttribute("src") ?? "", mark: (el.querySelector('img[class*="frontMarkImg"]')?.getAttribute("src") ?? "").split("/").pop(), words: [...el.querySelectorAll("span")].map((s) => s.textContent), focus: document.activeElement?.getAttribute("aria-label") ?? "" }));
    say(zoomed.src.endsWith(`/covers/${onyx9.slug}/scan`) && zoomed.mark === `m-sans-${onyx9.goldTone}.png` && zoomed.words.includes("Sam Rivera") && zoomed.focus === "Close", `${label}: it opens large on the whole scan, with the same marks, the focus on Close (${JSON.stringify(zoomed)})`);
    const scaleOf = () => zoom.locator('[style*="scale("]').evaluate((el) => Number(/scale\(([\d.]+)\)/.exec(el.getAttribute("style") ?? "")?.[1] ?? 0));
    await zoom.getByRole("button", { name: "Zoom in" }).click();
    await zoom.getByRole("button", { name: "Zoom in" }).click();
    const scaled = await scaleOf();
    say(Math.abs(scaled - 2.25) < 0.01, `${label}: Zoom in twice is 225% (${scaled})`);
    await zoom.getByRole("button", { name: "Fit" }).click();
    say((await scaleOf()) === 1, `${label}: Fit goes back to the whole front`);
    if (shots && label === "desktop") await tab.screenshot({ path: `${shots}/covers-zoom.png` });
    await tab.keyboard.press("Escape");
    await tab.waitForTimeout(200);
    say((await zoom.count()) === 0 && (await tab.evaluate(() => document.activeElement?.getAttribute("aria-haspopup"))) === "dialog", `${label}: Esc closes it and the front has the focus again`);

    // another cover, from below: a light one, so its gold is the deeper gold;
    // the options stay, the address and tab follow, the stage comes back
    const light = COVERS.find((c) => c.goldTone === "deep" && c.finish === "imprint")!;
    const card = tab.locator("ul button", { hasText: new RegExp(`^${shownName(light)}$`) });
    await card.scrollIntoViewIfNeeded();
    const from = await tab.evaluate(() => Math.round(scrollY));
    await card.click();
    await tab.waitForTimeout(1400);
    m = await marks(tab);
    const top = await stage(tab).evaluate((el) => Math.round(el.getBoundingClientRect().top));
    say((await tab.locator("h1").textContent()) === shownName(light) && new URL(tab.url()).pathname === `/covers/${light.slug}` && (await tab.title()).startsWith(light.name), `${label}: choosing ${light.name} from below puts it on the stage, in the address and the tab`);
    say(from > 600 && top >= 0 && top < 120, `${label}: and the stage comes back into view (from ${from}px down; its top now at ${top})`);
    say(m.words.some(([t, c]) => t === "Sam Rivera" && c.includes("inkDeep")) && m.mark === "m-sans-deep" && m.at === "50% 34%", `${label}: the options stay with the person, and a light cover's gold is the deeper gold (${light.name}: ${JSON.stringify(m)})`);

    // the materials filter the book, and the arrows go through what is in view
    const wood = COVERS.filter((c) => c.group === "Wood");
    await tab.locator('aside[aria-label="Materials"] button', { hasText: /^Wood/ }).click();
    await tab.waitForTimeout(200);
    // a card's own button, not the heart beside it
    const cardButtons = tab.locator("ul li > button:first-child");
    const cards = await cardButtons.count();
    say(cards === wood.length, `${label}: Wood shows its ${wood.length} covers (${cards})`);
    await cardButtons.first().click();
    await tab.waitForTimeout(800);
    await stage(tab).getByRole("button", { name: /^On to / }).click();
    await tab.waitForTimeout(300);
    say((await tab.locator("h1").textContent()) === shownName(wood[1]), `${label}: › goes on to the next wood cover (${shownName(wood[1])})`);

    // ---- HEARTS
    await tab.goto(`${server.base}/covers/${onyx9.slug}`, { waitUntil: "networkidle" });
    const count = () => tab.locator("[data-hearts-count]").textContent();
    const serverHearts = async () => ((await (await tab.request.get(`${server.base}/app/saved/covers`)).json()) as { hearts: string[] }).hearts;
    const settled = async (want: string[]) => {
      // the page's answer has come back once the server holds what it shows
      for (let i = 0; i < 40 && (await serverHearts()).join() !== want.join(); i++) await tab.waitForTimeout(150);
      await tab.waitForTimeout(150);
    };
    await tab.waitForFunction(() => document.querySelector("[data-hearts-count]")?.textContent !== "");
    const guestCookie = async () => (await context.cookies()).find((c) => c.name === "memari-guest");
    const stageHeart = stage(tab).locator("[data-stage-heart]");
    say((await count()) === "0" && (await stageHeart.textContent()) === "Heart it" && !(await guestCookie()), `${label}: nobody yet: no hearts, "Heart it" on the stage, no guest made`);
    await stageHeart.click();
    await settled([onyx9.id]);
    const made = await guestCookie();
    say(
      (await stageHeart.getAttribute("aria-pressed")) === "true" && (await stageHeart.textContent()) === "Hearted" && (await count()) === "1" && !!made?.httpOnly,
      `${label}: the stage's heart keeps it: "Hearted", 1 heart, and the first heart made a guest (httpOnly ${made?.httpOnly})`
    );
    const second = COVERS.find((c) => c.group === "Cloth & leather")!;
    const secondHeart = tab.locator(`[data-heart="${second.id}"]`);
    await secondHeart.scrollIntoViewIfNeeded();
    // the heart sits in its card's top right corner, on the swatch, at any width
    const placed = await secondHeart.evaluate((el) => {
      const h = el.getBoundingClientRect();
      const img = el.parentElement!.querySelector("img")!.getBoundingClientRect();
      return { right: Math.round(img.right - h.right), top: Math.round(h.top - img.top) };
    });
    say(placed.right >= 2 && placed.right <= 12 && placed.top >= 2 && placed.top <= 12, `${label}: a card's heart sits inside its swatch's top right corner (${placed.right}px in, ${placed.top}px down)`);
    await secondHeart.click();
    await settled([second.id, onyx9.id]);
    say((await count()) === "2" && (await secondHeart.getAttribute("aria-pressed")) === "true", `${label}: a card's heart keeps its cover too (2 hearts)`);
    await tab.reload({ waitUntil: "networkidle" });
    await tab.waitForFunction(() => document.querySelector("[data-hearts-count]")?.textContent === "2", null, { timeout: 10_000 }).catch(() => {});
    say((await count()) === "2" && (await stageHeart.getAttribute("aria-pressed")) === "true", `${label}: a reload keeps them: the server holds the hearts, not the page`);
    await tab.locator("[data-hearts-filter]").click();
    await tab.waitForTimeout(200);
    const inHearts = await cardButtons.evaluateAll((els) => els.map((el) => el.textContent));
    const inBand = await tab.locator('[data-first-in-line] button[aria-label^="Open "]').evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    say(inHearts.join() === [shownName(second), shownName(onyx9)].join(), `${label}: "Your hearts" shows only those, newest first (${inHearts.join(", ")})`);
    say(inBand.join() === [`Open ${second.name}`, `Open ${onyx9.name}`].join(), `${label}: and the example order screen puts them first, in that order (${inBand.join(", ")})`);
    if (shots) await tab.locator("aside[aria-label='Materials']").evaluate((el) => el.scrollIntoView({ block: "start" }));
    if (shots) await tab.screenshot({ path: `${shots}/covers-hearts-${label}.png` });
    // three quick taps in "Your hearts": off, on, off... on - the card stays
    // under the pointer, and the requests go one after another, never out of order
    const tapped = tab.locator(`[data-heart="${second.id}"]`);
    // (each tap allowed a moment: a card gone from under the pointer is a FAIL below, not a hang)
    for (let i = 0; i < 3; i++) await tapped.click({ timeout: 3000 }).catch(() => {});
    await settled([onyx9.id]);
    await tab.waitForTimeout(600);
    const stays = (await tapped.count()) === 1;
    say(stays && (await tapped.getAttribute("aria-pressed")) === "false" && (await serverHearts()).join() === onyx9.id && (await cardButtons.count()) === 2, `${label}: three quick taps in "Your hearts" end as the last left it, on the page and the server, and its card stays put`);
    await tab.locator(`[data-heart="${onyx9.id}"]`).click();
    await settled([]);
    const leftInView = await tab.locator("ul li > [data-heart]").evaluateAll((els) => els.map((el) => el.getAttribute("aria-pressed")));
    say(leftInView.join() === "false,false", `${label}: a heart taken off there leaves its card in place, an outline to put it back (${leftInView.join(", ")})`);
    // opened again, the view starts from what is hearted now: nothing
    await tab.locator("[data-hearts-filter]").click();
    await tab.locator("[data-hearts-filter]").click();
    await tab.waitForTimeout(200);
    say(
      (await count()) === "0" && (await tab.locator("[data-hearts-empty]").isVisible()) && (await tab.locator("[data-first-in-line] [class*='exampleSlot']").count()) === 3 && (await tab.locator("[data-hearts-note]").isVisible()),
      `${label}: opened again with every heart off: "No hearts yet", empty places in the example, and the note that a guest's hearts are kept on this browser`
    );
    say((await serverHearts()).length === 0, `${label}: and the server holds none`);

    const wide = await tab.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (label === "phone") say(wide === 0, `phone: no sideways scroll (${wide}px)`);
    say(warnings.length === 0, `${label}: no hydration warning or page error${warnings.length ? ` (${warnings[0]})` : ""}`);
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}

console.log(failures ? `\n${failures} covers page check(s) failed.` : "\nAll covers page checks passed.");
process.exit(failures ? 1 : 0);
