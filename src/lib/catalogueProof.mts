// A proof sheet for the WHOLE catalogue: every palette module drawn at the
// four sizes that decide whether it works, on the real dot lattice.
//
// primitiveProof.mts proves the eleven PRIMITIVES against two controls,
// with crops of the places defects have actually turned up. That sheet is
// about drawing quality and stays as it is. This one asks the different
// question the catalogue created: a hundred and fifteen modules are
// presets over those primitives, nobody has looked at most of them, and
// the way a preset goes wrong is not the way a primitive does. A preset is
// a LABEL SET, so its failures are label failures - a column head too long
// for its share of a narrow box, a heading shrunk to 6pt, a tracker given
// twelve columns where the primitive was written for seven.
//
// WHY FOUR SIZES. The first version drew each module once, at its own
// default, packed onto category pages. That is the size a user first sees,
// and it found real defects - but it is the only size it can ever find one
// at, and a module is dragged and resized from the moment it lands. The
// two that matter are the extremes of WIDTH, because width is what breaks
// a label, and at each of those the extremes of HEIGHT: the floor the
// editor will let it shrink to, and the height it arrives at.
//
// A COLUMN here is a sidebar column - 6 of the 24 grid cells, the width of
// the Notes/Reminders stack on the week page. So "1 column" is 6 cells and
// "3 columns" is 18, the narrowest and widest real placements a module
// gets.
//
// The layout is DERIVED, not written down. primitiveProof carries a
// hand-written LAYOUT of eleven placements, which is right for eleven and
// is the hardcoded-slug-list defect at any larger size: a module added to
// the catalogue would simply not appear, silently, which is how this
// codebase has lost modules from canCrossZones, from the palette drop
// width branch and from useEdgeResize already. So this sweeps
// PALETTE_SECTIONS and draws whatever it finds.
//
//   npm run check:catalogue    # writes public/catalogue-proof.html
import { writeFileSync } from "node:fs";
import { renderModuleInstance } from "./renderModuleInstance";
import { moduleDefinition, PALETTE_SECTIONS } from "./moduleRegistry";
import { getMinRowSpanForSlug } from "./moduleMinRowSpan";
import { gridCellToAllocation } from "./grid";
import {
  PROOF_PAGE as PAGE,
  escapeXml,
  toSvg,
  flatten,
  latticeDots,
  latticePattern,
  PROOF_FONT_LINK,
  PROOF_FONT_STYLE,
  PROOF_FONT_SWITCH,
} from "./proofSvg";

/** A sidebar column, in grid cells. The week page's Notes stack is one. */
const COLUMN_CELLS = 6;

const WIDTHS = [
  { label: "1 column", columnSpan: COLUMN_CELLS },
  { label: "3 columns", columnSpan: COLUMN_CELLS * 3 },
];

/**
 * Print px to CSS px for every crop on the sheet.
 *
 * ONE scale for all four, deliberately. Letting the narrow crops render
 * larger would use the row better and would also make the four
 * undecidable: the question a reader is asking is whether a module is
 * worse at 1 column than at 3, and that cannot be read off two drawings at
 * two magnifications. They are vector, so browser zoom recovers whatever
 * detail this costs.
 */
const SCALE = 0.29;

/** Half a cell of lattice showing around each crop, so a mark that escapes
 *  its own box is visible rather than cut off at the crop's edge. */
const CROP_MARGIN_PX = 37.5;

type Variant = { label: string; columnSpan: number; rowSpan: number; note: string };

function variantsFor(slug: string): Variant[] {
  const definition = moduleDefinition(slug);
  const variants: Variant[] = [];
  for (const width of WIDTHS) {
    const floor = getMinRowSpanForSlug(slug, PAGE, width.columnSpan);
    // A module's own default height, but never below the floor the editor
    // would enforce - the two are computed by different code, and a
    // default shorter than its own minimum is itself worth seeing.
    const preferred = Math.max(floor, definition?.db.defaultRowSpan ?? 8);
    variants.push({
      label: `${width.label} · min`,
      columnSpan: width.columnSpan,
      rowSpan: floor,
      note: `${width.columnSpan}x${floor}`,
    });
    variants.push({
      label: `${width.label} · default`,
      columnSpan: width.columnSpan,
      rowSpan: preferred,
      note: `${width.columnSpan}x${preferred}${preferred === floor ? " (= min)" : ""}`,
    });
  }
  return variants;
}

const threw: string[] = [];
let markCount = 0;
let cropCount = 0;

/** One module at one size, cropped to its own allocation plus a margin. */
function cropSvg(slug: string, variant: Variant): string {
  const placement = {
    columnStart: 0,
    rowStart: 0,
    columnSpan: variant.columnSpan,
    rowSpan: variant.rowSpan,
  };
  const definition = moduleDefinition(slug);
  const parts: string[] = [latticeDots(PAGE)];
  try {
    const elements = flatten(
      renderModuleInstance(
        {
          id: `v${variant.columnSpan}x${variant.rowSpan}`,
          locked: true,
          ...placement,
          propValues: definition?.previewProps ?? {},
          moduleType: { slug },
        },
        PAGE
      )
    );
    markCount += elements.length;
    for (const element of elements) parts.push(toSvg(element));
  } catch (error) {
    threw.push(`${slug} ${variant.note}: ${error}`);
  }

  const allocation = gridCellToAllocation(PAGE, placement);
  const x = allocation.x - CROP_MARGIN_PX;
  const y = allocation.y - CROP_MARGIN_PX;
  const width = allocation.width + CROP_MARGIN_PX * 2;
  const height = allocation.height + CROP_MARGIN_PX * 2;
  cropCount++;

  return (
    `<div class="v">` +
    `<svg class="sheet" viewBox="${x} ${y} ${width} ${height}" ` +
    `width="${Math.round(width * SCALE)}" height="${Math.round(height * SCALE)}">` +
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#fdfcf9" />` +
    parts.join("") +
    `</svg>` +
    `<span class="vlabel">${escapeXml(variant.label)} <b>${escapeXml(variant.note)}</b></span>` +
    `</div>`
  );
}

const sections: string[] = [];
let moduleCount = 0;

for (const [index, section] of PALETTE_SECTIONS.entries()) {
  const figures: string[] = [];
  for (const entry of section.modules) {
    moduleCount++;
    const definition = moduleDefinition(entry.slug);
    const variants = variantsFor(entry.slug);
    const tallest = Math.max(...variants.map((v) => v.rowSpan));
    // A stated height for the offscreen case - see content-visibility
    // below. Without it the scrollbar jumps as figures render.
    const intrinsic = Math.round((tallest * 75 + CROP_MARGIN_PX * 2) * SCALE) + 34;
    figures.push(
      `<figure class="mod" style="contain-intrinsic-size:auto ${intrinsic}px">` +
        `<figcaption>${escapeXml(entry.label)}` +
        `<span class="slug">${escapeXml(entry.slug)}</span>` +
        // A primitive is its own primitive, so naming it again beside its
        // own slug reads as a rendering mistake rather than as
        // information. Shown only where it says something the slug does
        // not.
        (definition?.primitive && definition.primitive !== entry.slug
          ? `<span class="prim">drawn by ${escapeXml(definition.primitive)}</span>`
          : "") +
        `</figcaption>` +
        `<div class="row">${variants.map((v) => cropSvg(entry.slug, v)).join("")}</div>` +
        `</figure>`
    );
  }
  sections.push(
    `<details${index === 0 ? " open" : ""}>` +
      `<summary>${escapeXml(section.category)} <b>${section.modules.length}</b></summary>` +
      figures.join("") +
      `</details>`
  );
}


/**
 * A standing index of the categories down the left.
 *
 * With a category open the document runs to thousands of pixels, and the
 * only way back to another one was to scroll to the top and hunt. Clicking
 * an entry closes whatever is open and opens that one, which also keeps
 * the paint budget where the <details> arrangement put it: exactly one
 * category laid out at a time.
 */
const nav =
  `<nav class="catnav"><div class="navhead">CATEGORIES</div>` +
  PALETTE_SECTIONS.map(
    (section, i) =>
      `<button type="button" data-cat="${i}"${i === 0 ? ' class="on"' : ""}>` +
      `${escapeXml(section.category)}<b>${section.modules.length}</b></button>`
  ).join("") +
  `</nav>`;

const navScript =
  `<script>(function(){` +
  `var ds=document.querySelectorAll("details"),bs=document.querySelectorAll(".catnav button");` +
  `bs.forEach(function(b){b.addEventListener("click",function(){` +
  `var n=+b.dataset.cat;` +
  `ds.forEach(function(d,i){d.open=i===n;});` +
  `bs.forEach(function(o){o.classList.toggle("on",o===b);});` +
  `ds[n].scrollIntoView({block:"start"});` +
  `});});})();</script>`;

const html =
  `<!doctype html><meta charset="utf-8"><title>Catalogue proof sheet</title>` +
  // The app's own face. Without it the sheet proves how the modules look
  // in Georgia, which is not a question anyone asked.
  PROOF_FONT_LINK +
  `<style>` +
  PROOF_FONT_STYLE +
  `body{margin:0;background:#2b2b2b;color:#ddd;font:12px ui-monospace,monospace;` +
  `display:flex;align-items:flex-start;gap:14px;padding:14px}` +
  `.catnav{position:sticky;top:14px;flex:0 0 190px;max-height:calc(100vh - 28px);` +
  `overflow:auto;display:flex;flex-direction:column;gap:2px}` +
  `.navhead{color:#6b6b6b;font-size:10px;letter-spacing:.6px;padding:0 0 6px}` +
  `.catnav button{text-align:left;font:600 11px ui-monospace,monospace;letter-spacing:.3px;` +
  `padding:7px 10px;border-radius:5px;border:1px solid transparent;background:none;` +
  `color:#9a948a;cursor:pointer;display:flex;justify-content:space-between;gap:8px}` +
  `.catnav button:hover{background:#242424;border-color:#3d3d3d}` +
  `.catnav button.on{background:#e8d9b0;color:#2b2b2b}` +
  `.catnav button b{font-weight:400;opacity:.65}` +
  `main{flex:1;min-width:0}` +
  `body.navhidden .catnav{display:none}` +
  `.navtoggle{font:600 11px ui-monospace,monospace;letter-spacing:.4px;padding:5px 10px;` +
  `border-radius:5px;border:1px solid #4a4a4a;background:#242424;color:#9a948a;` +
  `cursor:pointer;margin-right:4px}` +
  `h1{font:600 14px ui-monospace,monospace;color:#fff;margin:0 0 4px}` +
  `p.note{color:#9a9a9a;margin:0 0 14px;max-width:78ch;line-height:1.55}` +
  `p.note b{color:#ddd;font-weight:400}` +
  // One <details> per category, all but the first closed, and
  // content-visibility on every figure inside them.
  //
  // Not decoration. Every module drawn four times is 460 drawings, and a
  // document that tall does not paint: an earlier version of this sheet
  // put 24 full pages in a 32,000px document, and past about half that
  // height Chrome silently stopped rasterising - the figures were in the
  // DOM, correctly positioned and full of elements, and simply did not
  // draw. A proof sheet whose later pages are blank is worse than none.
  // Collapsed content is never laid out, so the document is only ever as
  // tall as the categories actually open.
  `details{border:1px solid #3d3d3d;border-radius:6px;margin-bottom:8px;background:#242424}` +
  `summary{cursor:pointer;padding:8px 12px;font:600 12px ui-monospace,monospace;` +
  `color:#e8d9b0;letter-spacing:.4px;text-transform:uppercase}` +
  `summary b{color:#7a7a7a;font-weight:400;margin-left:6px}` +
  `figure.mod{margin:0;padding:8px 12px 12px;border-top:1px solid #333;content-visibility:auto}` +
  `figcaption{padding:0 0 6px;color:#fff;font-size:12px}` +
  `figcaption .slug{color:#c0392b;margin-left:10px}` +
  `figcaption .prim{color:#6b6b6b;margin-left:10px}` +
  `.row{display:flex;flex-wrap:wrap;gap:10px 12px;align-items:flex-start}` +
  `.v{display:flex;flex-direction:column;gap:3px;flex:0 0 auto}` +
  `.vlabel{color:#8a8a8a;font-size:10px}.vlabel b{color:#b9b2a6;font-weight:400}` +
  `svg.sheet{background:#fdfcf9;display:block}` +
  `</style>` +
  nav +
  `<main>` +
  PROOF_FONT_SWITCH.replace(
    `<div class="fontswitch">`,
    `<div class="fontswitch">` +
      `<button type="button" class="navtoggle">&#9776; Categories</button>` +
      `<button type="button" class="navtoggle collapseall">Collapse all</button>`
  ) +
  `<h1>catalogue proof &mdash; ${moduleCount} modules &times; 4 sizes = ${cropCount} drawings, ` +
  `${PALETTE_SECTIONS.length} categories, ${markCount} marks</h1>` +
  `<p class="note">Each module at the narrowest and widest real placement, and at each of ` +
  `those its editor minimum and its own default height. A <b>column</b> is a sidebar column ` +
  `&mdash; ${COLUMN_CELLS} of the 24 grid cells &mdash; so 1 column is ${COLUMN_CELLS} cells ` +
  `wide and 3 columns is ${COLUMN_CELLS * 3}. All four are at one scale so they can be ` +
  `compared; zoom for detail, it is vector. The dots are the page&rsquo;s own 1/4in lattice ` +
  `at true position, so a rule that misses one is a rule off the pitch. Half a cell of ` +
  `lattice shows around every box, so a mark that escapes its module is visible rather than ` +
  `cropped away. Categories open one at a time.</p>` +
  // The lattice pattern, defined once for every crop on the sheet.
  `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0">` +
  `<defs>${latticePattern(PAGE)}</defs></svg>` +
  sections.join("") +
  `</main>` +
  navScript +
  `<script>document.querySelector(".navtoggle").addEventListener("click",function(){` +
  `document.body.classList.toggle("navhidden");});` +
  // Collapsing everything also clears the nav highlight - leaving a
  // category marked current when nothing is open would be a lie about
  // the state of the page.
  `document.querySelector(".collapseall").addEventListener("click",function(){` +
  `document.querySelectorAll("details").forEach(function(d){d.open=false;});` +
  `document.querySelectorAll(".catnav button").forEach(function(b){b.classList.remove("on");});` +
  `window.scrollTo(0,0);});</script>`;

writeFileSync("public/catalogue-proof.html", html);
console.log(
  `public/catalogue-proof.html written: ${moduleCount} modules at 4 sizes ` +
    `(${cropCount} drawings, ${markCount} marks).\n` +
    `Open http://localhost:3000/catalogue-proof.html`
);
if (threw.length) {
  console.error(`\n${threw.length} drawing(s) threw:`);
  for (const line of threw) console.error(`  ${line}`);
  process.exit(1);
}
