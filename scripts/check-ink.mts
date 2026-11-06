// Every site page's painted text, measured: no letter outside the box the
// paper is painted in, and nothing moved by the room that keeps them in.
//
// WHY THIS EXISTS. The site paints its text with the paper (landing.module.css,
// "paper through the ink": a background clipped to the text, the fill clear),
// and a background is painted only inside its element's own box. Text set
// tighter than its letters are tall hangs out of that box, and what hangs out
// gets no paper and vanishes: the tail of a g or a y, the top of a hand-written
// "!". It was fixed one heading at a time (2026-10-22, the landing headline)
// and came back on every other one (2026-11-06: "y's and g's in headings are
// cut off at bottom. fix this throughout site"). The fix is now one rule,
// ROOM FOR THE INK: a clear border round each text element, given back as
// negative margin. This check holds the whole site to it.
//
// WHAT IT MEASURES, on each page at a desktop and a phone width:
//   cut      a painted element (text fill clear, background clipped to the
//            text) whose letters - their real outlines, canvas measureText's
//            actualBoundingBox, line by line - reach past its border box
//   moved    an element whose box takes room it does not give back, or
//            gives back room it never took (a class's own margin or padding
//            won over the rule's, and must work var(--ink-room) in itself);
//            failing that, anything whose content box is somewhere else with
//            the paper off
//   grew     an element that took the room and has a background colour,
//            which the room's padding would make taller
// Moving parts (a carousel) are told apart by a second look with the paper on.
//
//   npm run check:ink                       the dev server on :3000, else its own
//   npm run check:ink -- --base http://localhost:4100
//
// SABOTAGED 2026-11-06: with the rule's border commented out, "Keep it coming,
// if you like." and every other tight heading fails as cut; with its margin
// commented out, everything below them fails as moved.

import "./appUnderTest.mjs";
import { chromium } from "playwright-core";
import { ensureServer } from "./appUnderTest.mjs";

/** The site's pages (siteMap.ts) that are drawn on the paper. */
const PAGES = ["/", "/how-it-works", "/layouts", "/covers", "/modules", "/pricing", "/about", "/help", "/print", "/business", "/quiz", "/privacy", "/terms"];
const WIDTHS = [1280, 390];

// In the page. A string, not a function: tsx names functions with a helper
// the page does not have.
const MEASURE = String.raw`(() => {
  const page = document.querySelector("[data-text-paper]");
  if (!page) return { paper: false, cut: [], moved: [], grew: [] };
  const ctx = document.createElement("canvas").getContext("2d");
  const all = Array.prototype.slice.call(page.querySelectorAll("*"));
  const name = (el) => {
    const cls = (String(el.className).match(/__(\w+)/) || [, ""])[1];
    return el.tagName.toLowerCase() + (cls ? "." + cls : "") + " \"" + (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) + "\"";
  };
  const painted = (cs) => cs.webkitTextFillColor === "rgba(0, 0, 0, 0)" && /text/.test(cs.webkitBackgroundClip || cs.backgroundClip);

  // cut: each line's letters against the element's border box
  const cut = [];
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (!painted(cs) || cs.display === "inline" || cs.visibility === "hidden") continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    ctx.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
    // drawn at one size and scaled (the layout previews): measure in its own px, compare in the screen's
    const scale = el.offsetHeight ? box.height / el.offsetHeight : 1;
    let below = 0, above = 0, word = "";
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const text = node.textContent;
      const lines = new Map();
      const r = document.createRange();
      for (let i = 0; i < text.length; i++) {
        r.setStart(node, i); r.setEnd(node, i + 1);
        const rect = r.getClientRects()[0];
        if (!rect || rect.height === 0) continue;
        const key = Math.round(rect.top);
        const line = lines.get(key) || { top: rect.top, bottom: rect.bottom, text: "" };
        line.text += text[i];
        lines.set(key, line);
      }
      for (const line of lines.values()) {
        const t = cs.textTransform === "uppercase" ? line.text.toUpperCase() : line.text;
        if (!t.trim()) continue;
        const m = ctx.measureText(t);
        const fontBox = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
        const baseline = line.top + (line.bottom - line.top) * (m.fontBoundingBoxAscent / fontBox);
        const b = baseline + m.actualBoundingBoxDescent * scale - box.bottom;
        const a = box.top - (baseline - m.actualBoundingBoxAscent * scale);
        if (b > below) { below = b; word = word || t.trim().slice(0, 30); }
        if (a > above) above = a;
      }
    }
    if (below > 0.5 || above > 0.5) cut.push(name(el) + " " + (below > 0.5 ? "bottom " + below.toFixed(1) + "px " : "") + (above > 0.5 ? "top " + above.toFixed(1) + "px" : ""));
  }

  // moved / grew: content boxes with the paper on, off, and on again
  const snap = () => all.map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const bt = parseFloat(cs.borderTopWidth), bl = parseFloat(cs.borderLeftWidth);
    return { x: r.left + bl + parseFloat(cs.paddingLeft), y: r.top + bt + parseFloat(cs.paddingTop), pt: parseFloat(cs.paddingTop), pb: parseFloat(cs.paddingBottom), inline: cs.display === "inline", mt: parseFloat(cs.marginTop), mb: parseFloat(cs.marginBottom), bg: cs.backgroundColor, painted: painted(cs) };
  });
  const sx = window.scrollX, sy = window.scrollY;
  const on = snap();
  page.removeAttribute("data-text-paper");
  const off = snap();
  page.setAttribute("data-text-paper", "");
  const again = snap();
  window.scrollTo(sx, sy);
  const moved = [], grew = [], kept = [];
  for (let i = 0; i < all.length; i++) {
    const still = Math.abs(on[i].x - again[i].x) < 0.1 && Math.abs(on[i].y - again[i].y) < 0.1;
    if (!still) continue;
    const dx = on[i].x - off[i].x, dy = on[i].y - off[i].y;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) moved.push(name(all[i]) + " by " + dx.toFixed(1) + ", " + dy.toFixed(1));
    const room = on[i].pt - off[i].pt;
    // took room and did not give it back (a class's own margin won), or gave back room it never took
    // (a class's own padding won): the cause of everything that moves below it
    const top = on[i].mt - off[i].mt + room, bottom = on[i].mb - off[i].mb + (on[i].pb - off[i].pb);
    // an inline box's top and bottom padding and margin never move the line
    if (!on[i].inline && (Math.abs(top) > 0.1 || Math.abs(bottom) > 0.1)) kept.push(name(all[i]) + " moves its top " + top.toFixed(1) + "px, bottom " + bottom.toFixed(1) + "px (margin " + off[i].mt + "/" + off[i].mb + ", room " + room.toFixed(1) + ")");
    if (room > 0.05 && on[i].bg !== "rgba(0, 0, 0, 0)") grew.push(name(all[i]) + " (" + on[i].bg + ")");
  }
  return { paper: true, cut: cut, moved: kept.length ? kept : moved, grew: grew };
})()`;

const baseArg = process.argv.indexOf("--base");
const server = await ensureServer(baseArg > 0 ? process.argv[baseArg + 1] : process.env.BASE);
const browser = await chromium.launch({ channel: "chrome", headless: true });
let failures = 0;
try {
  for (const width of WIDTHS) {
    const tab = await browser.newPage({ viewport: { width, height: 900 } });
    for (const path of PAGES) {
      const res = await tab.goto(server.base + path, { waitUntil: "networkidle", timeout: 120_000 });
      await tab.evaluate(() => document.fonts.ready);
      // settle: the doodle wall and the curtain finish laying out
      await tab.waitForFunction(() => !document.querySelector("[data-text-paper]") || !!document.querySelector("[data-wall-ready]"), null, { timeout: 20_000 }).catch(() => {});
      const r = (await tab.evaluate(MEASURE)) as { paper: boolean; cut: string[]; moved: string[]; grew: string[] };
      const bad = r.cut.length + r.moved.length + r.grew.length;
      failures += bad;
      console.log(`  ${bad ? "FAIL" : "ok  "}  ${String(width).padEnd(5)} ${path.padEnd(14)} ${res?.status()}  ${r.paper ? "" : "(no paper)"}`);
      for (const [kind, list] of [["cut", r.cut], ["moved", r.moved], ["grew", r.grew]] as const) for (const line of list.slice(0, 12)) console.log(`          ${kind.padEnd(6)} ${line}`);
      for (const [kind, list] of [["cut", r.cut], ["moved", r.moved], ["grew", r.grew]] as const) if (list.length > 12) console.log(`          ${kind.padEnd(6)} ...and ${list.length - 12} more`);
    }
    await tab.close();
  }
} finally {
  await browser.close();
  server.stop();
}
console.log(failures ? `\n${failures} problems.` : "\nEvery letter inside its paper, nothing moved.");
process.exit(failures ? 1 : 0);
