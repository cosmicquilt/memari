// npm run check:layouts - the site's layout pictures, as nobody signed in
// (2026-10-22):
//   - on /layouts, a planner's card opens the planner zoom with its
//     timeline, a part per level, opening on the part the card shows - it
//     used to open the one-spread popup on that part alone ("only a month
//     comes up no timeline either");
//   - the parts switch from the timeline, Escape closes it and focus goes
//     back to the card;
//   - a week's card still opens the Layouts popup;
//   - on the landing page a layout grows under the pointer (scale 1.035,
//     landing.module.css .spreadCard).

import "./appUnderTest.mjs";
import { chromium } from "playwright-core";
import { ensureServer } from "./appUnderTest.mjs";
import { PLANNERS, coverSpreadOf, partsOf, plannerShelves } from "../src/app/landing/plannerTemplates";

const server = await ensureServer(process.env.BASE);
const browser = await chromium.launch({ channel: "chrome", headless: true });
let failures = 0;
const say = (ok: boolean, what: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
};
const LEVEL: Record<string, string> = { front: "Beginning", month: "Monthly", week: "Weekly", day: "Daily" };

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const tab = await context.newPage();
  const errors: string[] = [];
  tab.on("pageerror", (e) => errors.push(e.message));

  await tab.goto(`${server.base}/layouts`, { waitUntil: "load", timeout: 120_000 });
  // the first planner on the page: the first shelf's first
  const planner = plannerShelves(PLANNERS)[0].planners[0];
  const parts = partsOf(planner);
  // the first card under Planners, whatever it opens - as it was found
  const card = tab.locator('#planners button[aria-label^="Open "]').first();
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await tab.getByRole("dialog").first().waitFor({ timeout: 15_000 });
  const zoom = tab.getByRole("dialog", { name: planner.title });
  const tiles = zoom.getByRole("navigation", { name: "Parts of the planner" }).getByRole("button");
  const names = await tiles.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")?.split(":")[0]));
  say(names.join() === parts.map((p) => LEVEL[p.part]).join(), `${planner.title}: its card opens the planner with its timeline, its parts by level (${names.join(", ") || "no timeline"})`);
  if (!names.length) {
    console.log("\n1 or more check(s) failed: the rest of the planner zoom cannot be checked.");
    await browser.close();
    process.exit(1);
  }
  const cover = parts.find((p) => p.key === coverSpreadOf(planner))!;
  const current = await zoom.locator("[aria-current]").getAttribute("aria-label");
  say(current?.startsWith(LEVEL[cover.part]) ?? false, `it opens on the part the card shows (${current})`);
  await zoom.locator("canvas").first().waitFor({ timeout: 15_000 });
  const other = parts.find((p) => p.key !== cover.key)!;
  await tiles.filter({ hasText: "" }).nth(parts.indexOf(other)).click();
  say((await zoom.locator("[aria-current]").getAttribute("aria-label"))?.startsWith(LEVEL[other.part]) ?? false, `a tile switches it to the ${LEVEL[other.part].toLowerCase()} part`);
  say((await zoom.getByRole("button", { name: /Use this planner|Order as is/ }).count()) === 1 && (await zoom.getByRole("button", { name: `Save the ${planner.title} planner`, exact: true }).count()) === 1, "its header has Save planner and the planner's Use button");
  await tab.keyboard.press("Escape");
  await zoom.waitFor({ state: "detached" });
  say((await card.evaluate((el) => el === document.activeElement)) === true, "Escape closes it, and focus goes back to the card");

  // a week is not a planner: still the Layouts popup, with Use this
  const week = tab.locator('#week button[aria-label^="Open "]').first();
  if ((await week.count()) === 1) {
    await week.scrollIntoViewIfNeeded();
    await week.click();
    await tab.getByRole("dialog").waitFor({ timeout: 15_000 });
    say((await tab.getByRole("navigation", { name: "Parts of the planner" }).count()) === 0, "a week's card still opens the Layouts popup, no timeline");
    await tab.keyboard.press("Escape");
  } else {
    say(false, "found a week's card on /layouts (#week)");
  }
  say(errors.length === 0, `no errors on /layouts${errors.length ? ` (${errors.join(" | ")})` : ""}`);

  // the landing page: a layout grows under the pointer
  await tab.goto(`${server.base}/`, { waitUntil: "load", timeout: 120_000 });
  // the page's script attached to the cards (React's props on the node)
  await tab.waitForFunction(`Object.keys(document.querySelector('figure[class*="spreadCard"]') || {}).some((k) => k.startsWith("__reactProps"))`, undefined, { timeout: 60_000 });
  const figure = tab.locator('figure[class*="spreadCard"]').first();
  await figure.scrollIntoViewIfNeeded();
  await tab.mouse.move(2, 2);
  await tab.waitForTimeout(600);
  const picture = figure.locator("button").first();
  const box = (await picture.boundingBox())!;
  await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await tab.waitForTimeout(1200);
  const grown = await picture.evaluate((el) => getComputedStyle(el).transform);
  // the spring may still be a hair from rest
  const scale = Number(/^matrix\(([\d.]+),/.exec(grown)?.[1] ?? 1);
  say(Math.abs(scale - 1.035) < 0.002, `the landing page: a layout grows under the pointer (${grown})`);

  // and on a laptop with a touchscreen, which tells the page its pointer is
  // a finger - hovered with the mouse all the same (2026-10-22: "only the
  // magnifying glass increases in size on hover not the layout it self")
  const touchLaptop = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const t2 = await touchLaptop.newPage();
  await t2.goto(`${server.base}/`, { waitUntil: "load", timeout: 120_000 });
  // the page's script attached to the cards (React's props on the node)
  await t2.waitForFunction(`Object.keys(document.querySelector('figure[class*="spreadCard"]') || {}).some((k) => k.startsWith("__reactProps"))`, undefined, { timeout: 60_000 });
  const fig2 = t2.locator('figure[class*="spreadCard"]').first();
  await fig2.scrollIntoViewIfNeeded();
  const pic2 = fig2.locator("button").first();
  const box2 = (await pic2.boundingBox())!;
  await t2.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await t2.waitForTimeout(1200);
  const grown2 = await pic2.evaluate((el) => getComputedStyle(el).transform);
  const scale2 = Number(/^matrix\(([\d.]+),/.exec(grown2)?.[1] ?? 1);
  const hover2 = await t2.evaluate("matchMedia('(hover: hover)').matches");
  say(Math.abs(scale2 - 1.035) < 0.002, `with a touchscreen too (the page told hover: ${hover2}), the mouse grows the layout (${grown2})`);
  await t2.mouse.move(2, 2);
  await t2.waitForTimeout(600);
  const back = await pic2.evaluate((el) => getComputedStyle(el).transform);
  say(back === "none" || back === "matrix(1, 0, 0, 1, 0, 0)", `and it settles back when the mouse leaves (${back})`);
  await touchLaptop.close();
} finally {
  await browser.close();
  await server.stop?.();
}
if (failures) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll layouts checks passed.");
