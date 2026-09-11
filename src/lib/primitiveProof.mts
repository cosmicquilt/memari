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

/**
 * What to draw, and where.
 *
 * Two of these are CONTROLS - a labeled-box and a to-do, the modules that
 * already existed. They are here so the new ones can be judged against
 * what is already on the page rather than against nothing, which is how
 * seven modules ended up with 12pt sentence-case headings while the rest
 * of the planner used 8pt uppercase.
 *
 * Placements are the ones these modules actually take: a sidebar column is
 * 6 wide, the bottom zone 12 or 18.
 */
const LAYOUT: Array<{ slug: string; columnStart: number; rowStart: number; columnSpan: number; rowSpan: number }> = [
  { slug: "labeled-box", columnStart: 0, rowStart: 0, columnSpan: 6, rowSpan: 10 },
  { slug: "column-table", columnStart: 6, rowStart: 0, columnSpan: 6, rowSpan: 10 },
  { slug: "prompted-lines", columnStart: 12, rowStart: 0, columnSpan: 6, rowSpan: 10 },
  { slug: "rating-strip", columnStart: 18, rowStart: 0, columnSpan: 6, rowSpan: 10 },

  { slug: "todo-checklist", columnStart: 0, rowStart: 10, columnSpan: 12, rowSpan: 10 },
  { slug: "axis-matrix", columnStart: 12, rowStart: 10, columnSpan: 12, rowSpan: 10 },

  { slug: "mini-month", columnStart: 0, rowStart: 20, columnSpan: 6, rowSpan: 8 },
  { slug: "mini-month", columnStart: 6, rowStart: 20, columnSpan: 6, rowSpan: 5 },
  { slug: "text-block", columnStart: 12, rowStart: 20, columnSpan: 12, rowSpan: 7 },

  { slug: "progress-meter", columnStart: 0, rowStart: 28, columnSpan: 12, rowSpan: 5 },
  { slug: "column-table", columnStart: 12, rowStart: 28, columnSpan: 12, rowSpan: 8 },
];

/** Props that differ from the module's own preview values, where the
 *  point is to see a case the defaults do not cover. */
const OVERRIDES: Record<number, Record<string, unknown>> = {
  0: { heading: "Notes", ruled: true, templateHeading: "" },
  4: { dayCount: 3 },
  6: { year: 2026, month: 2, heading: "", markable: true },
  8: {
    heading: "Serenity",
    body:
      "God, grant me the serenity to accept the things I cannot change,\n" +
      "courage to change the things I can,\n" +
      "and wisdom to know the difference.",
    attribution: "Reinhold Niebuhr",
    align: "center",
  },
  9: { heading: "Days", total: 90, milestoneEvery: 10, numbered: true },
  5: {
    heading: "Eisenhower",
    xLeft: "NOT URGENT",
    xRight: "URGENT",
    yTop: "IMPORTANT",
    yBottom: "NOT IMPORTANT",
    quadrants: ["Schedule", "Do", "Delete", "Delegate"],
  },
  10: {
    heading: "Spending",
    columns: ["Date", "Item", "Category", "Amount"],
    weights: [1, 2.4, 1.6, 1.2],
    totalsRow: true,
    totalsLabel: "Total",
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
      `font-family="PT Serif, Georgia, serif" fill="${element.fill ?? "#000"}" ` +
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
// [caption, x, y, w, h, magnification]. Most crops are shrunk to fit
// several on a screen; a line-weight crop has to be magnified instead -
// an 0.3pt rule is 1.25 print px, which at the 0.62 the others use is
// under a device pixel and tells you nothing about its weight.
const DETAILS: Array<[string, number, number, number, number, number?]> = [
  ["labeled-box (control) vs column-table - heading size, case, dot alignment", 187.5, 187.5, 900, 750],
  ["to-do (control) vs axis-matrix", 187.5, 937.5, 1800, 760],
  ["prompted-lines + rating-strip", 1087.5, 187.5, 900, 750],
  ["progress-meter + column-table with a totals row", 187.5, 2287.5, 1800, 620],
  ["axis-matrix cross at 1:1 - interior rule weight against the border", 1450, 1300, 420, 300, 2],];

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
  // The app's own face. Without it the sheet proves how the modules look
  // in Georgia, which is not a question anyone asked.
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&display=swap">` +
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
    ([title, x, y, w, h, magnification]) =>
      `<figure><figcaption>${escapeXml(title)}</figcaption>` +
      view(w * (magnification ?? 0.62), h * (magnification ?? 0.62), x, y, w, h).replace(
        "<svg ",
        '<svg class="sheet" '
      ) +
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
