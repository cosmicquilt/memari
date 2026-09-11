// A proof sheet: every registered primitive drawn at a real size, on the
// real dot lattice, as one SVG page.
//
// The behaviour report says how a module's marks MOVE when its box
// changes. It says nothing about whether the drawing is any good, and a
// module can pass every column of that table while looking wrong. This is
// the other half: look at it.
//
// Two things it shows that no table can. The dots are the page's actual
// 1/4in lattice, drawn underneath, so a rule that fails to land on one is
// visible rather than inferred - which is the whole pitch rule, made
// legible. And the boxes sit at real grid placements, so a module drawn at
// the width it will actually have is what you see.
//
//   npm run check:proof    # writes public/primitive-proof.html
import { writeFileSync } from "node:fs";
import { renderModuleInstance, type RenderedPolotnoElement } from "./renderModuleInstance";
import { moduleDefinition } from "./moduleRegistry";
import { gridCellToAllocation, cellHeightPx, type PageGrid } from "./grid";

const PAGE: PageGrid = {
  widthPx: 2175,
  heightPx: 3075,
  gridColumns: 24,
  gridRows: 36,
  boxInsetPx: 6,
  marginPx: 187.5,
};

/** The seven primitives this sheet exists to check, at the placements
 *  they are actually likely to take: a sidebar column is 6 wide, the
 *  bottom zone 12 or 18. */
const LAYOUT: Array<{ slug: string; columnStart: number; rowStart: number; columnSpan: number; rowSpan: number }> = [
  { slug: "column-table", columnStart: 0, rowStart: 0, columnSpan: 6, rowSpan: 9 },
  { slug: "prompted-lines", columnStart: 6, rowStart: 0, columnSpan: 6, rowSpan: 9 },
  { slug: "rating-strip", columnStart: 12, rowStart: 0, columnSpan: 6, rowSpan: 9 },
  { slug: "mini-month", columnStart: 18, rowStart: 0, columnSpan: 6, rowSpan: 5 },
  { slug: "mini-month", columnStart: 18, rowStart: 5, columnSpan: 6, rowSpan: 9 },
  { slug: "text-block", columnStart: 0, rowStart: 9, columnSpan: 12, rowSpan: 6 },
  { slug: "progress-meter", columnStart: 12, rowStart: 14, columnSpan: 12, rowSpan: 5 },
  { slug: "axis-matrix", columnStart: 0, rowStart: 15, columnSpan: 12, rowSpan: 12 },
  { slug: "column-table", columnStart: 12, rowStart: 19, columnSpan: 12, rowSpan: 8 },
  { slug: "prompted-lines", columnStart: 0, rowStart: 27, columnSpan: 24, rowSpan: 9 },
];

/** Props that differ from the module's own preview values, where the
 *  point is to see a case the defaults do not cover. */
const OVERRIDES: Record<number, Record<string, unknown>> = {
  4: { year: 2026, month: 2, heading: "FEBRUARY", markable: true },
  5: {
    heading: "",
    body: "God, grant me the serenity to accept the things I cannot change,\ncourage to change the things I can,\nand wisdom to know the difference.",
    attribution: "Reinhold Niebuhr",
    align: "center",
  },
  6: { heading: "DAYS", total: 90, milestoneEvery: 10, numbered: true },
  7: {
    heading: "EISENHOWER",
    xLeft: "NOT URGENT",
    xRight: "URGENT",
    yTop: "IMPORTANT",
    yBottom: "NOT IMPORTANT",
    quadrants: ["Schedule", "Do", "Delete", "Delegate"],
  },
  8: {
    heading: "SPENDING",
    columns: ["Date", "Item", "Category", "Amount"],
    weights: [1, 3, 2, 1.2],
    totalsRow: true,
    totalsLabel: "TOTAL",
  },
  9: {
    heading: "EVENING REVIEW",
    prompts: ["What did I do badly?", "What did I do well?", "What did I leave undone?"],
    linesPerPrompt: 2,
  },
};

function escapeXml(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
}

/** One rendered element as SVG. Only the two shapes the app's own renderer
 *  understands, so what this draws is what the editor draws. */
function toSvg(element: RenderedPolotnoElement): string {
  if (element.type === "text") {
    const size = element.fontSize ?? 12;
    const anchor = element.align === "center" ? "middle" : element.align === "right" ? "end" : "start";
    const x =
      anchor === "middle"
        ? (element.x ?? 0) + (element.width ?? 0) / 2
        : anchor === "end"
        ? (element.x ?? 0) + (element.width ?? 0)
        : element.x ?? 0;
    return (
      `<text x="${x}" y="${(element.y ?? 0) + size}" font-size="${size}" ` +
      `font-family="Georgia, 'PT Serif', serif" fill="${element.fill ?? "#000"}" ` +
      `text-anchor="${anchor}" opacity="${element.opacity ?? 1}"` +
      (element.letterSpacing ? ` letter-spacing="${element.letterSpacing}"` : "") +
      `>${escapeXml(String(element.text ?? ""))}</text>`
    );
  }
  if (element.type !== "figure") return "";
  const hasStroke = !!element.stroke && element.stroke !== "none" && (element.strokeWidth ?? 0) > 0;
  const hasFill = !!element.fill && element.fill !== "transparent";
  const radius = typeof element.cornerRadius === "number" && element.cornerRadius > 0
    ? ` rx="${element.cornerRadius}"` : "";
  return (
    `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}"${radius} ` +
    `fill="${hasFill ? element.fill : "none"}" ` +
    (hasStroke ? `stroke="${element.stroke}" stroke-width="${element.strokeWidth}" ` : "") +
    `opacity="${element.opacity ?? 1}" />`
  );
}

function flatten(elements: RenderedPolotnoElement[]): RenderedPolotnoElement[] {
  return elements.flatMap((e) => (e.type === "group" ? flatten(e.children ?? []) : [e]));
}

const parts: string[] = [];

// The lattice itself, under everything. A rule that misses these dots is
// a rule off the pitch, and there is no way to argue with the picture.
const pitch = cellHeightPx(PAGE);
for (let c = 0; c <= PAGE.gridColumns; c++) {
  for (let r = 0; r <= PAGE.gridRows; r++) {
    parts.push(
      `<circle cx="${PAGE.marginPx + c * pitch}" cy="${PAGE.marginPx + r * pitch}" r="2.2" fill="#b9b2a6" />`
    );
  }
}

const missing: string[] = [];
LAYOUT.forEach((placement, i) => {
  const definition = moduleDefinition(placement.slug);
  if (!definition) {
    missing.push(placement.slug);
    return;
  }
  const propValues = OVERRIDES[i] ?? definition.previewProps ?? {};
  const elements = renderModuleInstance(
    {
      id: `proof${i}`,
      locked: true,
      columnStart: placement.columnStart,
      rowStart: placement.rowStart,
      columnSpan: placement.columnSpan,
      rowSpan: placement.rowSpan,
      propValues,
      moduleType: { slug: placement.slug },
    },
    PAGE
  );
  for (const element of flatten(elements)) parts.push(toSvg(element));

  const allocation = gridCellToAllocation(PAGE, placement);
  parts.push(
    `<text x="${allocation.x + 4}" y="${allocation.y + allocation.height - 6}" font-size="15" ` +
      `font-family="monospace" fill="#c0392b" opacity="0.8">${escapeXml(placement.slug)}</text>`
  );
});

// Regions worth a closer look than a whole page at a glance gives - the
// places where a defect has actually turned up. Each is a viewBox over
// the same drawing, so a crop can never disagree with the page.
const DETAILS: Array<[string, number, number, number, number]> = [
  ["column-table, 6 columns wide - row pitch, head truncation", 187.5, 187.5, 450, 675],
  ["axis-matrix - the down axis in its gutter", 187.5, 1312.5, 900, 900],
  ["progress-meter + column-table with a totals row", 1087.5, 1237.5, 900, 800],
  ["mini-month, markable", 1537.5, 562.5, 460, 700],
];

const symbol =
  `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0">` +
  `<symbol id="page" viewBox="0 0 ${PAGE.widthPx} ${PAGE.heightPx}">` +
  `<rect width="${PAGE.widthPx}" height="${PAGE.heightPx}" fill="#fdfcf9" />` +
  parts.join("") +
  `</symbol></svg>`;

const view = (w: number, h: number, x: number, y: number, cw: number, ch: number) =>
  `<svg width="${w}" height="${h}" viewBox="${x} ${y} ${cw} ${ch}">` +
  `<use href="#page" x="0" y="0" width="${PAGE.widthPx}" height="${PAGE.heightPx}" /></svg>`;

const html =
  `<!doctype html><meta charset="utf-8"><title>Primitive proof sheet</title>` +
  `<style>body{margin:0;background:#2b2b2b;color:#ddd;` +
  `font:12px ui-monospace,monospace;padding:12px;display:flex;flex-wrap:wrap;` +
  `gap:14px;align-items:flex-start}` +
  `figure{margin:0}figcaption{padding:3px 0}svg.sheet{background:#fdfcf9}</style>` +
  symbol +
  `<figure><figcaption>whole page, 24 x 36 cells</figcaption>` +
  `<svg class="sheet" width="${PAGE.widthPx * 0.31}" height="${PAGE.heightPx * 0.31}" ` +
  `viewBox="0 0 ${PAGE.widthPx} ${PAGE.heightPx}">` +
  `<use href="#page" x="0" y="0" width="${PAGE.widthPx}" height="${PAGE.heightPx}" /></svg></figure>` +
  DETAILS.map(
    ([title, x, y, w, h]) =>
      `<figure><figcaption>${escapeXml(title)}</figcaption>` +
      view(w * 0.62, h * 0.62, x, y, w, h).replace("<svg ", '<svg class="sheet" ') +
      `</figure>`
  ).join("");

// Into public/ so the dev server serves it: an SVG this size is far
// easier to judge in a browser at a chosen zoom than as a file.
writeFileSync("public/primitive-proof.html", html);
console.log(
  `public/primitive-proof.html written: ${LAYOUT.length} placements, ${parts.length} marks.
` +
    `Open http://localhost:3000/primitive-proof.html`
);
if (missing.length) console.error(`Unregistered slugs in the layout: ${missing.join(", ")}`);
