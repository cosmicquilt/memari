// The catalogue as something a person can review, rather than as an
// instrument.
//
// catalogueProof.mts draws every module at FOUR sizes on a dark sheet with
// mark counts and slugs, because the question it answers is "does this
// still land on the lattice at every width". That is the wrong page to put
// in front of a reviewer: the minimum-size crops look broken to anyone not
// checking pitch, and the questions worth asking - is this useful, is the
// name right, would I fill it in - are not about pitch at all.
//
// So this draws each module ONCE, at the size it arrives at when you place
// it, on paper, with its real printed dimensions in inches. Same renderer,
// same toSvg the proof sheet and the PDF exporter use, so nothing here can
// show something the press would not.
//
// NO DOT LATTICE. The dots are an editor affordance drawn only inside an
// empty zone - they are not printed. The proof sheet draws them to make the
// pitch rule legible; a review page that drew them would be telling a
// reviewer the paper has dots on it.
//
//   npm run check:review
import { mkdirSync, writeFileSync } from "node:fs";
import { renderModuleInstance } from "./renderModuleInstance";
import { moduleDefinition, PALETTE_SECTIONS } from "./moduleRegistry";
import { getMinRowSpanForSlug } from "./moduleMinRowSpan";
import { gridCellToAllocation } from "./grid";
import { toSvg, flatten, escapeXml, PROOF_PAGE as PAGE } from "./proofSvg";

/** A quarter-inch cell, so a span is inches x 4. */
const CELL_IN = 0.25;
/** Every drawing is scaled to this width, so the page reads as a list
 *  rather than a ragged collage. True size is stated in words instead -
 *  see the caption on each card. */
const CARD_WIDTH_PX = 300;
/** What a full-row card gets, for the wide-and-short shapes below. */
const FULL_ROW_WIDTH_PX = 1020;

const threw: string[] = [];
let drawn = 0;
let markCount = 0;

function sizeWords(columnSpan: number, rowSpan: number): string {
  const w = (columnSpan * CELL_IN).toFixed(2).replace(/\.?0+$/, "");
  const h = (rowSpan * CELL_IN).toFixed(2).replace(/\.?0+$/, "");
  const share =
    columnSpan >= PAGE.gridColumns ? "full width" :
    columnSpan >= PAGE.gridColumns * 0.7 ? "most of the page" :
    columnSpan <= PAGE.gridColumns / 4 ? "sidebar" : "part width";
  return `${share} · ${w}″ × ${h}″`;
}

/** One module at the size it arrives at, drawn on paper. */
function card(slug: string, label: string, index: number): string {
  const definition = moduleDefinition(slug);
  const columnSpan = definition?.db.defaultColumnSpan ?? 6;
  // Never below the floor the editor would enforce - a module cannot be
  // reviewed at a height it would refuse to be.
  const rowSpan = Math.max(
    getMinRowSpanForSlug(slug, PAGE, columnSpan, definition?.previewProps ?? {}),
    definition?.db.defaultRowSpan ?? 8
  );
  const placement = { columnStart: 0, rowStart: 0, columnSpan, rowSpan };

  const box0 = gridCellToAllocation(PAGE, placement);
  // How far down this card shows the page, which is what turns a print
  // thickness into a screen one - see SvgOptions.
  const wide = columnSpan / rowSpan >= 6;
  const hairlineScale = (wide ? FULL_ROW_WIDTH_PX : CARD_WIDTH_PX) / box0.width;

  const parts: string[] = [];
  try {
    const elements = flatten(
      renderModuleInstance(
        {
          id: `r-${slug}`,
          locked: true,
          ...placement,
          propValues: definition?.previewProps ?? {},
          moduleType: { slug },
        } as never,
        PAGE
      ) as never
    );
    markCount += elements.length;
    for (const element of elements) parts.push(toSvg(element, { hairlineScale }));
  } catch (error) {
    threw.push(`${slug}: ${error}`);
  }

  const box = box0;
  // A WIDE, SHORT module gets the whole row.
  //
  // Scaled to an ordinary card an icon strip came out 25px tall - six
  // inches of paper half an inch deep, faithfully reproduced and completely
  // unreviewable. There is no scale at which such a shape is both readable
  // and card-sized, because the shape itself is wide; so it gets a wide
  // card, which is also how it reads on the page it lives on.
  const width = wide ? FULL_ROW_WIDTH_PX : CARD_WIDTH_PX;
  const height = (width * box.height) / box.width;
  drawn++;
  return (
    `<figure class="m${wide ? " full" : ""}">` +
    `<div class="paper" style="height:${height.toFixed(0)}px">` +
    `<svg viewBox="${box.x} ${box.y} ${box.width} ${box.height}" ` +
    `width="100%" height="100%" preserveAspectRatio="xMidYMid meet">` +
    `<g class="ink">${parts.join("")}</g></svg></div>` +
    `<figcaption><span class="n">${index}</span>` +
    `<span class="nm">${escapeXml(label)}</span>` +
    `<span class="sz">${sizeWords(columnSpan, rowSpan)}</span></figcaption>` +
    `</figure>`
  );
}

let index = 0;
const sections: string[] = [];
const nav: string[] = [];
for (const section of PALETTE_SECTIONS) {
  const id = section.category.toLowerCase().replace(/[^a-z]+/g, "-");
  const first = index + 1;
  const cards = section.modules
    .map((m) => card(m.slug, m.label ?? m.slug, ++index))
    .join("");
  nav.push(
    `<a href="#${id}">${escapeXml(section.category)}<span>${first}–${index}</span></a>`
  );
  sections.push(
    `<section id="${id}"><h2>${escapeXml(section.category)}` +
      `<span class="count">${section.modules.length}</span></h2>` +
      `<div class="grid">${cards}</div></section>`
  );
}

const STYLE = `
/* THE FACE THE PLANNER IS SET IN, and the one thing on this page that is a
   live question rather than a fact - Page Settings offers exactly these two,
   so the drawings have to be readable in both.

   It costs nothing to switch because a CSS rule BEATS a presentation
   attribute: toSvg writes font-family onto every text node it emits, and
   this rule overrides all of them at once. 3148 marks change face without a
   single one being re-rendered. Same trick the proof sheet uses. */
:root{--face:"Hanken Grotesk",system-ui,sans-serif}
body.serif{--face:Newsreader,Georgia,serif}
svg text,.ink{font-family:var(--face)}
.faces{display:flex;gap:6px;align-items:center;margin:20px 0 0;flex-wrap:wrap}
.faces b{font:600 11px/1 "Hanken Grotesk",system-ui,sans-serif;letter-spacing:.14em;
text-transform:uppercase;color:var(--muted);margin-right:3px}
.faces button{font:500 13px/1 "Hanken Grotesk",system-ui,sans-serif;cursor:pointer;
border:1px solid var(--rule);background:transparent;color:var(--ink);
border-radius:20px;padding:8px 14px}
.faces button[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.faces button:last-of-type{font-family:Newsreader,Georgia,serif;font-size:15px}
:root{--paper:#fbfbfa;--card:#fff;--ink:#231f20;--muted:#6b6f72;--rule:#e2dfd8;
--accent:#3f5a6c;--accent-soft:#eef2f5;--shadow:0 1px 2px rgba(35,31,32,.05),0 8px 24px rgba(35,31,32,.06)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
--paper:#1a1b1c;--card:#fff;--ink:#e9e6e0;--muted:#9aa0a4;--rule:#37393b;
--accent:#8fb4cc;--accent-soft:#252c31;--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.3)}}
:root[data-theme="dark"]{--paper:#1a1b1c;--card:#fff;--ink:#e9e6e0;--muted:#9aa0a4;
--rule:#37393b;--accent:#8fb4cc;--accent-soft:#252c31;--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.3)}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);
font:16px/1.55 Newsreader,Georgia,serif;padding-block:36px;padding-left:20px;padding-right:20px}
.wrap{max-width:1100px;margin:0 auto}
.eyebrow{font:600 11px/1 "Hanken Grotesk",system-ui,sans-serif;letter-spacing:.14em;
text-transform:uppercase;color:var(--muted);margin:0 0 10px}
h1{font-size:36px;font-weight:500;margin:0 0 12px;line-height:1.1;text-wrap:balance}
.lede{margin:0 0 6px;color:var(--muted);max-width:62ch}
.lede strong{color:var(--ink);font-weight:500}
nav{display:flex;flex-wrap:wrap;gap:7px;margin:24px 0 8px;position:sticky;top:0;
background:var(--paper);padding:10px 0;z-index:5;border-bottom:1px solid var(--rule)}
nav a{font:500 12px/1 "Hanken Grotesk",system-ui,sans-serif;text-decoration:none;
color:var(--ink);border:1px solid var(--rule);border-radius:20px;padding:7px 12px;
display:flex;gap:6px;align-items:center;background:var(--card)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) nav a{background:transparent}}
:root[data-theme="dark"] nav a{background:transparent}
nav a:hover{border-color:var(--accent);color:var(--accent)}
nav a span{color:var(--muted);font-variant-numeric:tabular-nums}
section{margin:38px 0 0;scroll-margin-top:70px}
h2{font-size:23px;font-weight:500;margin:0 0 16px;display:flex;align-items:baseline;gap:10px}
h2 .count{font:600 11px/1 "Hanken Grotesk",system-ui,sans-serif;letter-spacing:.1em;
color:var(--muted);text-transform:uppercase}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:22px}
.m{margin:0}
.m.full{grid-column:1/-1}
.paper{background:#fff;border:1px solid var(--rule);border-radius:3px;
box-shadow:var(--shadow);overflow:hidden;display:flex}
.paper svg{display:block}
figcaption{display:grid;grid-template-columns:auto 1fr;gap:3px 9px;margin-top:9px;align-items:baseline}
.n{grid-row:span 2;font:600 12px/1.3 "Hanken Grotesk",system-ui,sans-serif;
color:var(--accent);background:var(--accent-soft);border-radius:4px;padding:4px 7px;
font-variant-numeric:tabular-nums}
.nm{font-weight:500}
.sz{font:400 12px/1.3 "Hanken Grotesk",system-ui,sans-serif;color:var(--muted)}
@media (max-width:640px){h1{font-size:28px}.grid{grid-template-columns:1fr}
/* ONE ROW, scrolled sideways, on a phone. Twelve chips wrap to ten rows on
   a 375px screen - a third of the viewport, permanently stuck to the top,
   with the drawing it is meant to help you reach hidden behind it. The
   sideways scroll is contained to the nav; the page itself never moves. */
nav{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;
scrollbar-width:none;gap:6px}
nav::-webkit-scrollbar{display:none}
nav a{flex:0 0 auto}
section{scroll-margin-top:58px}}
`;

const html =
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1">` +
  `<title>Memari Module Catalogue</title>` +
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?` +
  `family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Hanken+Grotesk:wght@400;500;600&display=swap">` +
  `<style>${STYLE}</style></head><body><div class="wrap">` +
  `<p class="eyebrow">Memari · ${index} modules · ${PALETTE_SECTIONS.length} categories</p>` +
  `<h1>Catalogue</h1>` +
  `<div class="faces"><b>Typeface</b>` +
  `<button type="button" data-face="sans" aria-pressed="true">Sans-serif</button>` +
  `<button type="button" data-face="serif" aria-pressed="false">Serif</button></div>` +
  `<nav>${nav.join("")}</nav>` +
  sections.join("") +
  `</div>` +
  `<script>(function(){` +
  // ONE DEVICE PIXEL, INKED TO MATCH - see SvgOptions in proofSvg.ts. Each
  // hairline carries the width it would truly have on screen, in CSS px, as
  // --t. Below one device pixel it cannot be drawn at that width at all, so
  // it is drawn at exactly one device pixel and its ink is dropped in the
  // same proportion: a fifth of a pixel of ink becomes a whole pixel at a
  // fifth strength. Uniform, because every one of them gets the identical
  // treatment regardless of where it falls; and still light, because the
  // ink is not invented. Above one device pixel nothing is clamped.
  `function hair(){` +
  `var d=window.devicePixelRatio||1, floor=1/d;` +
  `document.querySelectorAll("line.hair").forEach(function(l){` +
  `var t=parseFloat(getComputedStyle(l).getPropertyValue("--t"))||floor;` +
  `l.setAttribute("stroke-width",String(Math.max(t,floor)));` +
  `l.setAttribute("stroke-opacity",String(Math.min(1,t/floor)));});}` +
  `hair();` +
  // devicePixelRatio changes when the page is zoomed or moved to another
  // screen, and the floor moves with it.
  `if(window.matchMedia){var mq=matchMedia("(resolution:"+(window.devicePixelRatio||1)+"dppx)");` +
  `if(mq.addEventListener)mq.addEventListener("change",hair);}` +
  `window.addEventListener("resize",hair);` +
  `var KEY="memari-catalogue-face";` +
  `var buttons=document.querySelectorAll(".faces button");` +
  `function apply(face){` +
  `document.body.classList.toggle("serif",face==="serif");` +
  `buttons.forEach(function(b){b.setAttribute("aria-pressed",String(b.dataset.face===face));});` +
  `}` +
  `var saved=null;try{saved=localStorage.getItem(KEY);}catch(e){}` +
  `apply(saved==="serif"?"serif":"sans");` +
  `buttons.forEach(function(b){b.addEventListener("click",function(){` +
  `apply(b.dataset.face);try{localStorage.setItem(KEY,b.dataset.face);}catch(e){}});});` +
  `})();</script>` +
  `</body></html>`;

writeFileSync("public/catalogue.html", html);

// The same page, where GitHub Pages can serve it.
//
// Pages' deploy-from-a-branch mode offers the branch root or /docs and
// nothing else, so this is the one path that yields a link short enough to
// read down a phone: cosmicquilt.github.io/memari. It is index.html rather
// than catalogue.html for the same reason - a typed URL should not need a
// filename on the end.
//
// .nojekyll turns off the static-site processor Pages otherwise runs. This
// page has no underscore-prefixed files for it to swallow today, but the
// generated proof sheets do, and one is a likely neighbour here later.
mkdirSync("docs", { recursive: true });
writeFileSync("docs/index.html", html);
writeFileSync("docs/.nojekyll", "");

if (threw.length > 0) {
  console.error(`${threw.length} module(s) failed to draw:`);
  for (const line of threw) console.error(`  ${line}`);
  process.exit(1);
}
console.log(
  `public/catalogue.html written: ${drawn} modules in ${PALETTE_SECTIONS.length} categories, ` +
    `${markCount} marks, ${(html.length / 1024).toFixed(0)} KB.`
);
console.log("Open http://localhost:3000/catalogue.html");
console.log("Also written to docs/index.html for GitHub Pages.");
