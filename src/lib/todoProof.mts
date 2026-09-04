// Renders real modules at several sizes into one HTML page, so a geometry
// change can be looked at and not only measured. The companion to
// `npm run check:behaviour`: that one says what moved, this one says
// whether the result is worth looking at.
//
// Run with: npx tsx src/lib/todoProof.mts <output.html>
import { renderModuleInstance } from "./renderModuleInstance";
import { gridCellToPixels, type PageGrid } from "./grid";
import { writeFileSync } from "node:fs";

const PAGE: PageGrid = {
  widthPx: 2175, heightPx: 3075, gridColumns: 24, gridRows: 36, boxInsetPx: 6, marginPx: 187.5,
};

const SCALE = 0.34;

function svgFor(slug: string, columnSpan: number, rowSpan: number, props: Record<string, unknown>) {
  const els = renderModuleInstance(
    { id: "p", locked: false, columnStart: 0, rowStart: 0, columnSpan, rowSpan,
      propValues: props, moduleType: { slug } } as Parameters<typeof renderModuleInstance>[0],
    PAGE, "PT Serif"
  );
  const box = gridCellToPixels(PAGE, { columnStart: 0, rowStart: 0, columnSpan, rowSpan });
  const flat = (list: unknown[]): Record<string, unknown>[] =>
    list.flatMap((e) => {
      const el = e as Record<string, unknown>;
      return el.children ? [el, ...flat(el.children as unknown[])] : [el];
    });
  const parts: string[] = [];
  for (const e of flat(els as unknown[])) {
    if (e.type !== "figure" || e.subType !== "rect") continue;
    const x = Number(e.x) - box.x, y = Number(e.y) - box.y;
    const fill = e.fill === "transparent" ? "none" : String(e.fill ?? "none");
    const stroke = e.stroke && e.stroke !== "none" ? String(e.stroke) : "none";
    parts.push(
      `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Number(e.width).toFixed(2)}" ` +
      `height="${Number(e.height).toFixed(2)}" fill="${fill}" stroke="${stroke}" ` +
      `stroke-width="${Number(e.strokeWidth ?? 0).toFixed(2)}" opacity="${Number(e.opacity ?? 1)}"/>`
    );
  }
  return `<svg width="${(box.width * SCALE).toFixed(0)}" height="${(box.height * SCALE).toFixed(0)}" viewBox="0 0 ${box.width} ${box.height}">${parts.join("")}</svg>`;
}

type Case = { slug: string; c: number; r: number; props?: Record<string, unknown>; label: string };

const CASES: Case[] = [
  { slug: "todo-checklist", c: 18, r: 3, props: { dayCount: 3 }, label: "to-do 18x3" },
  { slug: "todo-checklist", c: 18, r: 6, props: { dayCount: 3 }, label: "to-do 18x6" },
  { slug: "habit-tracker", c: 18, r: 5, label: "habit 18x5" },
  { slug: "habit-tracker", c: 18, r: 8, label: "habit 18x8" },
  { slug: "habit-tracker", c: 18, r: 13, label: "habit 18x13" },
];

const cells = CASES.map((k) =>
  `<figure><figcaption>${k.label}</figcaption>${svgFor(k.slug, k.c, k.r, k.props ?? {})}</figure>`
).join("");

writeFileSync(
  process.argv[2] ?? "todo-proof.html",
  `<style>body{background:#fff;font:12px system-ui;margin:20px;display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
figure{margin:0}figcaption{margin-bottom:6px;color:#555;font-family:ui-monospace,monospace}</style>${cells}`
);
console.log("wrote proof page");
