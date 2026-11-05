// check:arrival - the site's pages arrive whole, and the phone's hero fills
// its box (2026-11-04: "things load in at different times like doodles,
// paper texture, hero, etc."; "i dont like how when on mobile the hero fades
// out top and bottom ... just decrease height"; on his iPhone the hero went
// dark and the post-it showed black lines).
//
// In real Chrome, as a phone (390 and 360 wide, 3x) and a laptop (1440,
// 1.25x), on the landing page and a site page (/layouts):
//
// THE CURTAIN (SiteArrival.tsx, arrival.ts)
// - comes before the content in the page's HTML, so it is painted first;
// - lifts only once every picture on the first screen has come (<img>, SVG
//   <image>, the paper's photos), the type is in and the doodle wall is laid
//   out - the curtain's time limit is lifted for the check, and its CSS
//   fallback stopped, so what is tested is what it waits for, not how fast
//   this machine is; on the 390 phone the hero's photo, the torn edge and
//   the covers are held back past the wall, on the 360 phone the paper's
//   photos, so each is what it waits on there;
//   (the wall's grace is stretched for these runs too);
// - and does NOT hold the page for a late wall: a run with the wall's
//   drawings held back 4 s and the real grace kept (a slow phone) must lift
//   before the wall, with the paper showing, and the drawings fade in;
// - lifts at all;
// - and the hero's first layout begins only after it has lifted.
//
// THE PHONE'S HERO (landing.module.css, upright)
// - the film covers the hero, unmasked, and the book fits across, with no
//   grain over it;
// - the hero is no taller than the film is there;
// - the tagline ends above the book, the post-it begins below it;
// - the desk beyond the frame is never fetched, and no still is drawn into a
//   canvas (VideoHero plainStills).
// THE LAPTOP'S HERO keeps what it had: the desk beyond the frame, the
// flattened picture.
//
// What it cannot see: iOS itself (WebKit's canvases, its 3D) - Chrome is
// not WebKit. The post-it's iOS pictures are checked by showing them here
// as iOS's stylesheet would, and comparing where they fall.
//
//   npm run check:arrival
//   npm run check:arrival -- --base http://localhost:4100      a build

import "./appUnderTest.mjs";
import { chromium, type Page } from "playwright-core";
import { ensureServer } from "./appUnderTest.mjs";

const baseArg = process.argv.indexOf("--base");
const server = await ensureServer(baseArg > 0 ? process.argv[baseArg + 1] : process.env.BASE);
const browser = await chromium.launch({ channel: "chrome", headless: true });

/** How long the slowed pictures are held back, ms. */
const SLOW_MS = 3500;

const problems: string[] = [];
const seen: string[] = [];
const fail = (what: string, why: string) => problems.push(`${what}: ${why}`);
const ok = (what: string) => seen.push(what);

/** Watches the curtain from the first byte: whether it precedes the
 *  content, and the state of the page at the moment it lifts. */
const WATCH = `(() => {
  window.__arrivalLongestMs = 60000;
  // the wall's grace stretched too, to see the curtain wait for its holds -
  // except where the late wall itself is checked
  if (!window.__arrivalKeepGrace) window.__arrivalWallGraceMs = 60000;
  const out = (window.__arrival = { order: null, lift: null, layout: null, wallAt: null });
  const s = document.createElement("style");
  s.textContent = "[data-curtain]{animation:none!important} nextjs-portal{display:none!important}";
  const firstScreen = () => {
    const bottom = innerHeight * 1.25;
    const inView = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < bottom && r.bottom > 0 && r.left < innerWidth && r.right > 0; };
    const pending = [];
    for (const img of document.querySelectorAll("img:not([data-arrival-skip])")) if (inView(img) && !(img.complete && img.naturalWidth > 0)) pending.push(img.currentSrc || img.src);
    const done = new Set(performance.getEntriesByType("resource").map((e) => e.name));
    for (const im of document.querySelectorAll("image")) { const u = new URL(im.href.baseVal, location.href).href; if (inView(im) && !done.has(u)) pending.push(u); }
    const page = document.querySelector("[data-curtain]")?.parentElement;
    for (const m of (page?.getAttribute("style") ?? "").matchAll(/url\\(\\s*["']?([^"')]+)["']?\\s*\\)/g)) { const u = new URL(m[1], location.href).href; if (!done.has(u)) pending.push(u); }
    return pending.map((u) => u.split("/").slice(-2).join("/"));
  };
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "childList" && !out.order) {
        const c = document.querySelector("[data-curtain]"), main = document.querySelector("main");
        if (c && main) out.order = c.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING ? "curtain first" : "content first";
        else if (main && !c) out.order = "content first";
        if (!s.isConnected && document.head) document.head.append(s);
      }
      if (m.type === "attributes" && m.attributeName === "data-wall-ready" && out.wallAt === null) out.wallAt = performance.now();
      // lifted: by the head's script on <html> (a page's first load), or on
      // the curtain itself by SiteArrival (a page reached by a click)
      if (m.type === "attributes" && (m.attributeName === "data-lifted" || m.attributeName === "data-site-arrived") && !out.lift && m.target.hasAttribute(m.attributeName)) {
        const page = document.querySelector("[data-curtain]")?.parentElement;
        if (!page) continue;
        out.lift = { by: m.attributeName, at: performance.now(), pending: firstScreen(), fonts: document.fonts.status, wall: page.hasAttribute("data-wall-ready"), hasWall: !!page.querySelector("[class*=bodyDoodles]"), paper: getComputedStyle(page).getPropertyValue("--wall-shown").trim() };
      }
      if (m.type === "attributes" && m.attributeName === "style" && m.target.tagName === "CANVAS" && String(m.target.className).includes("videoDrawing") && m.target.style.opacity === "1" && out.layout === null) out.layout = performance.now();
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-lifted", "style", "data-wall-ready", "data-site-arrived"] });
})()`;

/** `slow`: pictures held back this long, so they come after the doodle wall
 *  - on a fast machine everything else is in long before it, and a curtain
 *  that waited for no picture at all would pass. */
async function visit(name: string, url: string, viewport: { width: number; height: number }, scale: number, phone: boolean, slow?: RegExp): Promise<Page> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, isMobile: phone, hasTouch: phone });
  await context.addInitScript(WATCH);
  if (slow) await context.route(slow, async (route) => {
    await new Promise((r) => setTimeout(r, SLOW_MS));
    await route.continue().catch(() => {});
  });
  const tab = await context.newPage();
  await tab.goto(server.base + url, { waitUntil: "load" });
  // lifted, gone, and on the landing page its first layout begun
  await tab.waitForFunction(() => (window as unknown as { __arrival: { lift: unknown } }).__arrival.lift && !document.querySelector("[data-curtain]"), null, { timeout: 60000 }).catch(() => {});
  if (url === "/") await tab.waitForFunction(() => (window as unknown as { __arrival: { layout: unknown } }).__arrival.layout, null, { timeout: 20000 }).catch(() => {});
  const a = (await tab.evaluate(`window.__arrival`)) as {
    order: string | null;
    lift: { at: number; pending: string[]; fonts: string; wall: boolean; hasWall: boolean } | null;
    layout: number | null;
    wallAt: number | null;
  };
  const what = `${name}`;
  if (a.order !== "curtain first") fail(`${what} curtain`, `it is not first in the page (${a.order ?? "never seen"}) - what comes before it is painted before it`);
  else ok(`${what}: the curtain comes before the content`);
  if (!a.lift) fail(`${what} curtain`, "it never lifted");
  else {
    if (a.lift.pending.length) fail(`${what} curtain`, `it lifted with ${a.lift.pending.length} picture(s) of the first screen still coming: ${a.lift.pending.slice(0, 4).join(", ")}`);
    else ok(`${what}: every picture on the first screen was in when it lifted`);
    if (a.lift.fonts !== "loaded") fail(`${what} curtain`, `it lifted with the type still ${a.lift.fonts}`);
    if (a.lift.hasWall && !a.lift.wall) fail(`${what} curtain`, `it lifted before the doodle wall was laid out (lifted ${Math.round(a.lift.at)} ms, wall ${a.wallAt === null ? "never" : Math.round(a.wallAt) + " ms"}})`);
    else if (a.lift.hasWall) ok(`${what}: the doodle wall was laid out when it lifted`);
  }
  if (url === "/") {
    if (a.layout === null) fail(`${what} hero`, "its first layout never began");
    else if (a.lift && a.layout < a.lift.at + 400) fail(`${what} hero`, `its first layout began ${Math.round(a.lift.at - a.layout)} ms before the curtain had lifted - it would fade in unseen`);
    else if (a.lift) ok(`${what}: the first layout began ${Math.round(a.layout - a.lift.at)} ms after the curtain lifted`);
  }
  return tab;
}

type Geometry = {
  vw: number;
  svh: number;
  peek: number;
  hero: number;
  stage: { top: number; bottom: number; left: number; right: number; mask: string };
  book: { top: number; bottom: number; left: number; right: number };
  tagBottom: number;
  postitTop: number;
  stills: number[];
  backdrop: boolean;
  grain: string;
  sides: number;
  baked: boolean;
};

const GEOMETRY = `(() => {
  const hero = document.querySelector('section[aria-label="Memari Studio"]');
  const stage = [...hero.children].find((c) => String(c.className).includes("videoStage"));
  const s = stage.getBoundingClientRect();
  const k = s.width / 3840;
  const free = document.querySelector('[class*="postitFree"]');
  const photo = [...document.querySelectorAll('[class*="postitPhotos"] img')].find((i) => getComputedStyle(i).visibility === "visible" && i.getBoundingClientRect().width > 0);
  const postit = (free && free.getBoundingClientRect().width > 0 ? free : photo)?.getBoundingClientRect();
  const page = hero.closest('[class*="page"]');
  return {
    vw: innerWidth, svh: innerHeight, peek: Number(getComputedStyle(page).getPropertyValue("--peek-phone")) || 0,
    hero: hero.getBoundingClientRect().height,
    stage: { top: s.top, bottom: s.bottom, left: s.left, right: s.right, mask: getComputedStyle(stage).maskImage || getComputedStyle(stage).webkitMaskImage },
    book: { top: s.top + 648 * k, bottom: s.top + 1820 * k, left: s.left + 1044 * k, right: s.left + 2794 * k },
    tagBottom: hero.querySelector('[class*="tagline"]').getBoundingClientRect().bottom,
    postitTop: postit ? postit.top : NaN,
    stills: [...stage.querySelectorAll("canvas")].filter((c) => !String(c.className).includes("videoDrawing")).map((c) => c.width),
    backdrop: !!hero.querySelector('[class*="videoBackdrop"]'),
    grain: getComputedStyle(hero.querySelector('[class*="grain"]')).display,
    sides: performance.getEntriesByType("resource").filter((e) => /hero-extend-/.test(e.name)).length,
    baked: hero.hasAttribute("data-baked"),
  };
})()`;

function phoneHero(name: string, g: Geometry) {
  const fit = (g.vw * 2160) / 1840;
  const want = Math.min(g.svh * (1 - g.peek / 100), fit);
  if (Math.abs(g.hero - want) > 2) fail(`${name} hero`, `${g.hero.toFixed(0)}px tall, not ${want.toFixed(0)} (the film's height with the book across the screen, or the screen's share)`);
  else ok(`${name}: the hero is ${g.hero.toFixed(0)}px, as tall as the film with the book across`);
  if (g.stage.top > 0.5 || g.stage.bottom < g.hero - 0.5 || g.stage.left > 0.5 || g.stage.right < g.vw - 0.5) fail(`${name} hero`, `the film does not cover it (${g.stage.top.toFixed(1)}..${g.stage.bottom.toFixed(1)} down, ${g.stage.left.toFixed(1)}..${g.stage.right.toFixed(1)} across)`);
  else ok(`${name}: the film covers the hero`);
  if (g.stage.mask && g.stage.mask !== "none") fail(`${name} hero`, `the film is masked (${g.stage.mask.slice(0, 60)}) - faded at its top and bottom`);
  if (g.backdrop) fail(`${name} hero`, "the blurred copy of the frame is back behind it");
  if (g.grain !== "none") fail(`${name} hero`, "the grain is over it - on iOS its blend is not drawn, and it lies over the photo as grey speckle");
  else ok(`${name}: no grain over the photo`);
  if (g.book.left < -0.5 || g.book.right > g.vw + 0.5) fail(`${name} hero`, `the book is cropped (${g.book.left.toFixed(0)}..${g.book.right.toFixed(0)} of ${g.vw})`);
  else ok(`${name}: the book fits across (${g.book.left.toFixed(0)}..${g.book.right.toFixed(0)})`);
  if (g.tagBottom > g.book.top - 4) fail(`${name} title`, `the tagline ends at ${g.tagBottom.toFixed(0)}, on the book (its top at ${g.book.top.toFixed(0)})`);
  else ok(`${name}: the tagline ends ${(g.book.top - g.tagBottom).toFixed(0)}px above the book`);
  if (!(g.postitTop >= g.book.bottom - 1)) fail(`${name} post-it`, `it begins at ${g.postitTop.toFixed(0)}, over the book's foot (${g.book.bottom.toFixed(0)})`);
  else ok(`${name}: the post-it is on the desk below the book`);
  if (g.sides) fail(`${name} hero`, `the desk beyond the frame was fetched (${g.sides}) - a phone upright never shows it`);
  if (g.stills.some((w) => w !== 300)) fail(`${name} hero`, `a still was drawn into a canvas (${g.stills.join(", ")}) - a phone keeps them as pictures`);
  else ok(`${name}: no still drawn into a canvas, no desk beyond the frame fetched`);
}

/** A slow phone, as on Andrew's iPhone (2026-11-04: "take a long time to
 *  load"): the doodle wall's drawings held back well past everything else,
 *  the curtain's real grace for the wall kept. The page must not wait on it:
 *  the curtain lifts first, the paper shows when it does, and the drawings
 *  fade in when laid out. */
async function lateWall() {
  const name = "phone 390, a late wall";
  const context = await browser.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await context.addInitScript(`window.__arrivalKeepGrace = true`);
  await context.addInitScript(WATCH);
  await context.route(/\/landing\/doodles\//, async (route) => {
    await new Promise((r) => setTimeout(r, LATE_WALL_MS));
    await route.continue().catch(() => {});
  });
  const tab = await context.newPage();
  await tab.goto(server.base + "/", { waitUntil: "load" });
  await tab.waitForFunction(() => document.querySelector('[class*="page"]')?.hasAttribute("data-wall-ready"), null, { timeout: 60000 }).catch(() => {});
  // and the curtain lifted - after the wall, if it waited for it
  await tab.waitForFunction(() => (window as unknown as { __arrival: { lift: unknown } }).__arrival.lift, null, { timeout: 10000 }).catch(() => {});
  const a = (await tab.evaluate(`window.__arrival`)) as { lift: { at: number; wall: boolean; paper: string } | null; wallAt: number | null };
  const late = await tab.evaluate(() => document.querySelector('[class*="bodyDoodles"]')?.hasAttribute("data-late") ?? false);
  if (!a.lift) fail(`${name} curtain`, "it never lifted");
  else if (a.lift.wall || (a.wallAt !== null && a.wallAt <= a.lift.at)) fail(`${name} curtain`, `it waited for the wall (lifted ${Math.round(a.lift.at)} ms, the wall at ${a.wallAt === null ? "?" : Math.round(a.wallAt)} ms) - the page sat covered for it`);
  else {
    ok(`${name}: the curtain lifted at ${Math.round(a.lift.at)} ms, without waiting for the wall (${a.wallAt === null ? "never laid out" : Math.round(a.wallAt) + " ms"})`);
    if (a.lift.paper !== "1") fail(`${name} paper`, `it was still held back (--wall-shown ${a.lift.paper || "unset"}) when the curtain lifted`);
    else ok(`${name}: the paper showed when the curtain lifted`);
    if (a.wallAt === null) fail(`${name} wall`, "it was never laid out");
    else if (!late) fail(`${name} wall`, "laid out after the curtain lifted, it appeared at once instead of fading in");
    else ok(`${name}: the drawings faded in when laid out`);
  }
  await context.close();
}

/** How long the late wall's drawings are held back, ms. */
const LATE_WALL_MS = 4000;

/** A phone slow to start the page's script (2026-11-04, on his iPhone: the
 *  curtain had waited for hydration): every script chunk held back, the
 *  pictures not. The head's script (arrivalScript.ts) must lift the curtain
 *  on the pictures alone, long before the page's script runs. */
async function slowScript() {
  const name = "phone 390, a slow script";
  const context = await browser.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await context.addInitScript(`window.__arrivalKeepGrace = true`);
  await context.addInitScript(WATCH);
  await context.route(/\/_next\/static\/chunks\/.*\.js/, async (route) => {
    await new Promise((r) => setTimeout(r, SLOW_SCRIPT_MS));
    await route.continue().catch(() => {});
  });
  const tab = await context.newPage();
  await tab.goto(server.base + "/", { waitUntil: "commit" });
  await tab.waitForFunction(() => (window as unknown as { __arrival: { lift: unknown } }).__arrival.lift, null, { timeout: 30000 }).catch(() => {});
  const a = (await tab.evaluate(`window.__arrival`)) as { lift: { at: number; pending: string[] } | null };
  if (!a.lift) fail(`${name} curtain`, "it never lifted");
  else if (a.lift.at >= SLOW_SCRIPT_MS) fail(`${name} curtain`, `it lifted at ${Math.round(a.lift.at)} ms, after the page's script (held to ${SLOW_SCRIPT_MS} ms) - it waited for hydration`);
  else if (a.lift.pending.length) fail(`${name} curtain`, `it lifted with ${a.lift.pending.length} picture(s) still coming: ${a.lift.pending.slice(0, 4).join(", ")}`);
  else ok(`${name}: the curtain lifted at ${Math.round(a.lift.at)} ms on its pictures alone, before the page's script (held to ${SLOW_SCRIPT_MS} ms)`);
  await context.close();
}

/** How long the page's script chunks are held back, ms. */
const SLOW_SCRIPT_MS = 5000;

try {
  await slowScript();
  await lateWall();
  for (const [name, w, h] of [
    ["phone 390", 390, 664],
    ["phone 360", 360, 640],
  ] as const) {
    // the 390 phone with its first screen's pictures arriving after the wall
    // the 390 phone with its first screen's pictures arriving after the
    // wall, the 360 with its paper's photos (backgrounds, found another way;
    // only the page's layers - the wall's own paper is baked from others)
    const tab = await visit(name, "/", { width: w, height: h }, 3, true, w === 390 ? /hero-open-dots|\/landing\/torn\/|\/landing\/covers\// : /\/landing\/paper\/(Paper\d+|fibre|crumples)\.avif/);
    phoneHero(name, (await tab.evaluate(GEOMETRY)) as Geometry);
    // iOS's post-it pictures, shown as its stylesheet would (Chrome is not
    // WebKit): the same place as the note itself
    const before = (await tab.evaluate(GEOMETRY)) as Geometry;
    await tab.addStyleTag({ content: `[class*="postitPhotos"]{display:block!important;position:absolute;inset:0}[class*="postitShadow"],[class*="postitStuck"],[class*="postitFree"]{display:none!important}` });
    await tab.evaluate(() => Promise.all([...document.querySelectorAll<HTMLImageElement>('[class*="postitPhotos"] img')].map((i) => ((i.loading = "eager"), i.decode().catch(() => {})))));
    const after = (await tab.evaluate(GEOMETRY)) as Geometry;
    if (!(Math.abs(after.postitTop - before.postitTop) < 8)) fail(`${name} post-it`, `iOS's picture of it begins at ${after.postitTop.toFixed(0)}, the note at ${before.postitTop.toFixed(0)}`);
    else ok(`${name}: iOS's picture of the post-it lies where the note does (within ${Math.abs(after.postitTop - before.postitTop).toFixed(1)}px)`);
    await tab.context().close();
  }
  {
    const tab = await visit("laptop 1440", "/", { width: 1440, height: 900 }, 1.25, false);
    const g = (await tab.evaluate(GEOMETRY)) as Geometry;
    if (g.sides < 2) fail("laptop hero", "the desk beyond the frame was not fetched");
    await tab.waitForFunction(() => document.querySelector('section[aria-label="Memari Studio"]')?.hasAttribute("data-baked"), null, { timeout: 15000 }).catch(() => {});
    if (!(await tab.evaluate(() => document.querySelector('section[aria-label="Memari Studio"]')!.hasAttribute("data-baked")))) fail("laptop hero", "its still layers were never flattened (heroBake)");
    else ok("laptop 1440: the desk beyond the frame fetched, the hero flattened as before");
    await tab.context().close();
  }
  {
    const tab = await visit("site page /layouts", "/layouts", { width: 390, height: 664 }, 3, true);
    await tab.context().close();
  }
} finally {
  await browser.close();
  server.stop();
}

for (const s of seen) console.log(`ok    ${s}`);
if (problems.length) {
  for (const p of problems) console.log(`FAIL  ${p}`);
  console.log(`\n${problems.length} arrival check(s) failed.`);
  process.exit(1);
}
console.log("\nAll arrival checks passed.");
