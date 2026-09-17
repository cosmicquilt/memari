// What an undated planner looks like, beside a dated one.
//
// Built to settle a design question - "can you show me what all three look
// like and I decide?" - with three candidate treatments for the title block
// drawn at true size. The label-plus-a-rule one was chosen; the other two
// (printed underscores, and nothing at all) are gone from the renderers, so
// this now draws the pair rather than the field.
//
// It stays because it is the only place undated can be SEEN at true size
// without flipping a real planner over to it, and because the rule it draws
// has to keep landing on the lattice - a thing that was wrong the first
// time. It draws the real renderers, not a mock-up.
//
// TRUE SIZE MEANS TRUE SIZE. The sidebar column is 1.5in wide; at 96 CSS px
// to the inch that is 144px on a nominal display, and the page is drawn at
// that scale in the first row so the type is the size it will be on paper.
// A second row repeats it at 3x, because a 0.3pt rule at true size is under
// one device pixel (this is the hairline problem - see the editor's ink
// floor) and you cannot judge a weight you cannot see.
//
//   npm run check:undated   ->   public/undated-proof.html
import { writeFileSync } from "node:fs";
import { renderWeekTitle } from "./modules/weekTitle.js";
import { renderMonthTitle } from "./modules/monthTitle.js";
import { renderHourlyGridCore } from "./modules/hourlyGridCore.js";
import { renderMonthGridCore } from "./modules/monthGridCore.js";
import { toSvg, escapeXml, PROOF_FONT_LINK, PROOF_FONT_STYLE } from "./proofSvg.js";
import type { RenderedPolotnoElement } from "./renderModuleInstance.js";

const PX_PER_IN = 300;
const CSS_PX_PER_IN = 96;

// The page's real lattice, so a rule snapped to it lands where it will on
// paper. 75px is the 1/4in cell; the inset is the box inset, and the origin
// is 0 here only because these crops are drawn from their own corner.
const LATTICE = { pitchPx: 75, originX: 0, originY: 0, insetPx: 6 };

type Variant = { key: "dated" | "undated"; label: string; blurb: string };
const VARIANTS: Variant[] = [
  { key: "dated", label: "Dated", blurb: "the week number, the date range, a number on every tab" },
  {
    key: "undated",
    label: "Undated",
    blurb: "the label stays, a hairline at the house 0.3pt weight takes the date's place",
  },
];

const DAY_NAMES = ["SUNDAY", "MONDAY", "TUESDAY"];

/** One variant of the top-left corner of a week page: the title block above
 *  the sidebar, and the day tabs beside it. Both are where a date shows. */
function weekCorner(variant: Variant, titleOnly = false): { elements: RenderedPolotnoElement[]; w: number; h: number } {
  const dated = variant.key === "dated";
  const elements: RenderedPolotnoElement[] = [];

  // The sidebar column is 6 lattice cells = 1.5in; the title block is the
  // top 2 cells of it. Real proportions, so the type sits where it will.
  const titleGeom = { x: 0, y: 0, width: 1.5 * PX_PER_IN, height: 0.5 * PX_PER_IN };
  elements.push(
    ...(renderWeekTitle(
      titleGeom,
      {
        weekNumber: dated ? 1 : null,
        weekTotal: dated ? 52 : null,
        dateRangeLabel: dated ? "DEC 31 - JAN 6" : "",
      },
      `wt-${variant.key}`,
      "Newsreader",
      LATTICE
    ) as RenderedPolotnoElement[])
  );

  // Cropped to the title block for the magnified row: at 3x the whole
  // corner is wider than a screen, and four of them stacked vertically is
  // not a comparison. The block in question is the only thing that differs.
  // 0.75in, not 0.6: the date line's baseline sits 169px down and B's
  // underscores hang below it, so a tighter crop clipped exactly the
  // variant it was meant to show fairly.
  if (titleOnly) return { elements, w: 1.6 * PX_PER_IN, h: 0.75 * PX_PER_IN };

  // Three day tabs beside it, at the real day-column width - this is where
  // the small date number lives, and it is the same answer in every variant
  // (the tab's border already encloses the space), so it is drawn once per
  // variant only to show the whole corner in context.
  const tabsX = 1.5 * PX_PER_IN + 0.25 * PX_PER_IN;
  const tabsGeom = { x: tabsX, y: 0, width: 4.5 * PX_PER_IN, height: 0.75 * PX_PER_IN };
  elements.push(
    ...(renderHourlyGridCore(
      tabsGeom,
      {
        dayCount: 3,
        dayLabels: DAY_NAMES.map((name, i) => ({ name, date: dated ? 31 + i : null })),
        startTime: "05:30",
        endTime: "07:30",
        intervalMinutes: 60,
        intervalMode: "on",
        hourLineStyle: "low-transparency",
        events: [],
      } as never,
      `hg-${variant.key}`,
      "Newsreader",
      LATTICE
    ) as RenderedPolotnoElement[])
  );

  return { elements, w: tabsX + 4.5 * PX_PER_IN, h: 0.85 * PX_PER_IN };
}

/** The month page's own two: the big month name, and a block of date cells. */
function monthCorner(variant: Variant, titleOnly = false): { elements: RenderedPolotnoElement[]; w: number; h: number } {
  const dated = variant.key === "dated";
  const elements: RenderedPolotnoElement[] = [];

  elements.push(
    ...(renderMonthTitle(
      { x: 0, y: 0, width: 1.5 * PX_PER_IN, height: 0.4 * PX_PER_IN },
      { monthName: dated ? "JANUARY" : "" },
      `mt-${variant.key}`,
      "Newsreader",
      LATTICE
    ) as RenderedPolotnoElement[])
  );

  if (titleOnly) return { elements, w: 1.6 * PX_PER_IN, h: 0.45 * PX_PER_IN };

  const gridX = 1.5 * PX_PER_IN + 0.25 * PX_PER_IN;
  elements.push(
    ...(renderMonthGridCore(
      { x: gridX, y: 0, width: 4.5 * PX_PER_IN, height: 1.4 * PX_PER_IN },
      {
        dayCount: 3,
        dayLabels: DAY_NAMES.map((name) => ({ name })),
        weekCount: 4,
        cells: Array.from({ length: 4 }, (_, w) =>
          Array.from({ length: 3 }, (_, d) => ({
            date: dated ? w * 7 + d + 1 : null,
            inCurrentMonth: true,
          }))
        ),
      } as never,
      `mg-${variant.key}`,
      "Newsreader",
      LATTICE
    ) as RenderedPolotnoElement[])
  );

  return { elements, w: gridX + 4.5 * PX_PER_IN, h: 1.5 * PX_PER_IN };
}

function svg(
  drawing: { elements: RenderedPolotnoElement[]; w: number; h: number },
  magnification: number
): string {
  const cssW = (drawing.w / PX_PER_IN) * CSS_PX_PER_IN * magnification;
  const cssH = (drawing.h / PX_PER_IN) * CSS_PX_PER_IN * magnification;
  return (
    `<svg class="sheet" width="${cssW.toFixed(1)}" height="${cssH.toFixed(1)}" ` +
    `viewBox="0 0 ${drawing.w} ${drawing.h}">` +
    drawing.elements.map((e) => toSvg(e)).join("") +
    `</svg>`
  );
}

const rows = [
  { title: "Week page, top-left corner", make: weekCorner },
  { title: "Month page, top-left corner", make: monthCorner },
];

type Zoom = { mag: number; note: string; titleOnly: boolean };
const ZOOMS: Zoom[] = [
  { mag: 1, note: "true size, whole corner - this is what it measures on paper", titleOnly: false },
  {
    mag: 3,
    note: "3x, title block only - a 0.3pt rule is under one device pixel at true size",
    titleOnly: true,
  },
];

const body = rows
  .map(
    (row) =>
      `<h2>${escapeXml(row.title)}</h2>` +
      ZOOMS
        .map(
          (zoom) =>
            `<h3>${escapeXml(zoom.note)}</h3><div class="strip">` +
            VARIANTS.map(
              (v) =>
                `<figure><figcaption><b>${escapeXml(v.label)}</b><br>` +
                `<span class="blurb">${escapeXml(v.blurb)}</span></figcaption>` +
                svg(row.make(v, zoom.titleOnly), zoom.mag) +
                `</figure>`
            ).join("") +
            `</div>`
        )
        .join("")
  )
  .join("");

const html =
  `<!doctype html><meta charset="utf-8"><title>Undated treatments</title>` +
  PROOF_FONT_LINK +
  `<style>` +
  PROOF_FONT_STYLE +
  `body{margin:0;background:#2b2b2b;color:#ddd;font:13px ui-monospace,monospace;padding:20px}` +
  `h2{font-size:15px;margin:28px 0 4px;color:#fff;border-bottom:1px solid #444;padding-bottom:6px}` +
  `h3{font-size:12px;font-weight:400;color:#999;margin:16px 0 8px}` +
  `.strip{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}` +
  `figure{margin:0}figcaption{padding:0 0 6px;max-width:520px;line-height:1.5}` +
  `.blurb{color:#999}svg.sheet{background:#fdfcf9;display:block}</style>` +
  `<h1 style="font-size:16px;color:#fff">Undated planner, beside a dated one</h1>` +
  `<p style="color:#aaa;max-width:70ch;line-height:1.6">Undated is the ABSENCE of the date ` +
  `values, not a flag: the day tab keeps its bordered box and loses its number, the month ` +
  `grid keeps every date box and loses the numbers in them, and the title block keeps its ` +
  `label and gets a hairline to write on. Applied at read time, so the stored dates are ` +
  `still there and turning them back on restores exactly what was entered.</p>` +
  body;

writeFileSync("public/undated-proof.html", html);
console.log(
  `public/undated-proof.html written: ${VARIANTS.length} variants x ${rows.length} pages, ` +
    `at true size and 3x.\nOpen http://localhost:3000/undated-proof.html`
);
