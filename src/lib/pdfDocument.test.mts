// The PDF exporter draws what the renderers meant, at print scale.
//
// This is the end of the pipeline: whatever is wrong here is wrong on
// paper, where it cannot be patched. Three things are worth pinning.
//
// THE SCALE, because it is the only one in the file and everything rides
// on it. THE PATHS, because PDF has no arc operator and the crescent glyph
// is two arcs, so they are converted - the one piece of real geometry the
// exporter does on its own, and the one place it can be silently wrong.
// And TOTALITY: every shape the app can emit has to come out the other
// side, because a print pipeline that quietly omits a mark is worse than
// one that fails.
import {
  pxToPt,
  PX_PER_PT,
  hexToRgb,
  parsePathD,
  drawElement,
  drawPage,
  createPdf,
  installFont,
  emptyReport,
} from "./pdfDocument";
import { glyphElement, type GlyphShape } from "./modules/glyphs";
import { PROOF_PAGE } from "./proofSvg";
import type { RenderedPolotnoElement } from "./renderModuleInstance";

let failures = 0;
const fail = (message: string) => {
  console.error(`  ${message}`);
  failures++;
};
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

// --- the scale ---------------------------------------------------------
//
// 300dpi pixels to PDF's 72-per-inch points. Written out at the sizes that
// actually occur, because "72/300" being right in the abstract is not the
// same as a lattice cell landing on a whole number of points.
{
  if (PX_PER_PT !== 300 / 72) fail(`PX_PER_PT is ${PX_PER_PT}`);
  const cases: Array<[number, number, string]> = [
    [75, 18, "one 1/4in lattice cell"],
    [2175, 522, "page width, 7.25in with bleed"],
    [3075, 738, "page height, 10.25in with bleed"],
    [187.5, 45, "the page margin"],
    [1.25, 0.3, "a 0.3pt hairline rule"],
    [6, 1.44, "the box inset"],
  ];
  for (const [px, pt, what] of cases) {
    if (!near(pxToPt(px), pt, 1e-9)) fail(`${what}: ${px}px came out ${pxToPt(px)}pt, expected ${pt}`);
  }
}

// --- colour ------------------------------------------------------------
{
  const cases: Array<[string, [number, number, number]]> = [
    ["#231F20", [35, 31, 32]], // the planner's near-black
    ["#fff", [255, 255, 255]],
    ["000000", [0, 0, 0]],
  ];
  for (const [hex, want] of cases) {
    const got = hexToRgb(hex);
    if (got.join(",") !== want.join(",")) fail(`hexToRgb(${hex}) = ${got.join(",")}, expected ${want.join(",")}`);
  }
}

// --- paths: every glyph the app can draw survives the trip -------------
//
// Totality, checked against the real glyph builders rather than a list of
// commands written down here - so a glyph added tomorrow is covered by
// this without anyone remembering to add it.
// Each glyph's drawn extent, MEASURED IN A BROWSER rather than asserted
// here: every path below was set on a real <path> and read back with
// getBBox(), at x 100, y 200, size 40. That makes this a comparison against
// an independent SVG engine - the only way to know the exporter's own path
// walking agrees with what the proofs and the editor actually draw, rather
// than only with itself.
//
// Note `plant` reaching 97.93..142.05, OUTSIDE its nominal 100..140 box.
// That is the glyph's own doing, not the parser's - it is a traced shape
// whose outer leaves flare past the square it is inscribed in. It is
// harmless where glyphs are laid out (iconStrip leaves 16% between them,
// see GLYPH_WIDTH_SHARE) and it is recorded here so it cannot change
// unnoticed.
const GLYPH_BBOX: Record<string, [number, number, number, number]> = {
  droplet: [103.2, 136.8, 200.0, 240.0],
  heart: [101.8, 138.2, 201.4, 239.6],
  star: [100.98, 139.02, 200.0, 236.18],
  moon: [100.8, 128.03, 200.8, 239.2],
  flame: [106.4, 133.6, 200.0, 240.0],
  leaf: [103.6, 137.2, 202.8, 237.2],
  plant: [97.93, 142.05, 203.25, 236.75],
};

const SHAPES: GlyphShape[] = [
  "circle", "square", "rounded", "droplet", "heart", "star", "moon", "flame", "leaf", "plant",
];
for (const shape of SHAPES) {
  const element = glyphElement({ id: "g", x: 100, y: 200, sizePx: 40, shape }) as
    RenderedPolotnoElement & { pathD?: string };
  if (typeof element.pathD !== "string" || element.pathD.length === 0) continue; // a plain rect
  const { ops, unsupported } = parsePathD(element.pathD);
  if (unsupported.length > 0) {
    fail(`${shape}: exporter cannot draw path command(s) ${unsupported.join(", ")}`);
  }
  if (ops.length === 0) fail(`${shape}: path parsed to nothing`);

  // The extent of what the exporter would actually put on the page, by
  // walking its own output. Sampled rather than solved for extrema: at 64
  // points a cubic's bounds are within a hundredth of a pixel, which is far
  // inside the tolerance below.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const see = (x: number, y: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  let from = { x: 0, y: 0 };
  for (const op of ops) {
    if (op.op === "m" || op.op === "l") {
      see(op.x, op.y);
      from = { x: op.x, y: op.y };
    } else if (op.op === "c") {
      for (let i = 0; i <= 64; i++) {
        const t = i / 64, u = 1 - t;
        see(
          u * u * u * from.x + 3 * u * u * t * op.x1 + 3 * u * t * t * op.x2 + t * t * t * op.x,
          u * u * u * from.y + 3 * u * u * t * op.y1 + 3 * u * t * t * op.y2 + t * t * t * op.y
        );
      }
      from = { x: op.x, y: op.y };
    }
  }
  const want = GLYPH_BBOX[shape];
  if (!want) {
    fail(`${shape}: no measured bbox recorded - add one read off a real <path>`);
    continue;
  }
  const got: [number, number, number, number] = [minX, maxX, minY, maxY];
  const labels = ["left", "right", "top", "bottom"];
  for (let i = 0; i < 4; i++) {
    if (!near(got[i], want[i], 0.05)) {
      fail(
        `${shape}: ${labels[i]} edge came out ${got[i].toFixed(2)}, ` +
          `but a browser draws that path at ${want[i].toFixed(2)}`
      );
    }
  }
}

// --- paths: the grammar ------------------------------------------------
{
  // Relative commands, and the SVG rule that coordinates repeated after a
  // moveto continue as linetos.
  const { ops } = parsePathD("M 10 10 l 5 0 5 5 Z");
  const kinds = ops.map((o) => o.op).join("");
  if (kinds !== "mllz") fail(`repeated relative pairs after a moveto should be linetos, got "${kinds}"`);
  const last = ops[2];
  if (last.op !== "l" || !near(last.x, 20, 1e-9) || !near(last.y, 15, 1e-9)) {
    fail(`relative linetos should accumulate to (20,15), got ${JSON.stringify(last)}`);
  }
  // H and V.
  const hv = parsePathD("M 0 0 H 10 V 10");
  if (hv.ops.length !== 3) fail(`H/V should each add one lineto, got ${hv.ops.length} ops`);
  // Something genuinely unknown is reported, not silently dropped.
  const odd = parsePathD("M 0 0 Q 5 5 10 0");
  if (!odd.unsupported.includes("Q")) fail(`an unsupported command must be reported, got ${JSON.stringify(odd.unsupported)}`);
}

// --- arcs: the conversion actually follows the ellipse ------------------
//
// The one piece of geometry this file does itself. Checked by sampling the
// cubics it produced and asking whether those points lie on the circle the
// arc described - which is the question, rather than whether the control
// points look plausible.
{
  const R = 50;
  const CX = 100;
  const CY = 100;
  // A half circle from (50,100) to (150,100), sweeping through the bottom.
  const { ops, unsupported } = parsePathD(`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`);
  if (unsupported.length > 0) fail(`a plain arc should be supported, got ${unsupported.join(",")}`);
  const curves = ops.filter((o) => o.op === "c");
  if (curves.length < 2) fail(`a half circle should split into at least two cubics, got ${curves.length}`);

  // Walk each cubic and measure every sampled point's distance from the
  // centre. 4/3*tan(d/4) is accurate to about one part in a thousand over
  // a quarter turn, so a tenth of a percent of the radius is a real bound,
  // not a loose one.
  let worst = 0;
  let from = { x: CX - R, y: CY };
  for (const op of ops) {
    if (op.op !== "c") continue;
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const u = 1 - t;
      const x =
        u * u * u * from.x + 3 * u * u * t * op.x1 + 3 * u * t * t * op.x2 + t * t * t * op.x;
      const y =
        u * u * u * from.y + 3 * u * u * t * op.y1 + 3 * u * t * t * op.y2 + t * t * t * op.y;
      worst = Math.max(worst, Math.abs(Math.hypot(x - CX, y - CY) - R));
    }
    from = { x: op.x, y: op.y };
  }
  if (worst > R * 0.001) {
    fail(`arc cubics stray ${worst.toFixed(4)}px from the circle, past the ${(R * 0.001).toFixed(4)}px bound`);
  }
  // And it ends where it was told to, or the next subpath starts adrift.
  const end = ops[ops.length - 1];
  if (end.op !== "c" || !near(end.x, CX + R, 1e-6) || !near(end.y, CY, 1e-6)) {
    fail(`the arc must end exactly at its stated endpoint, got ${JSON.stringify(end)}`);
  }
  // The sweep flag has to pick the side SVG picks, which is the half of
  // this that cannot be reasoned out safely: SVG's y axis points down, so
  // sweep=1 ("positive angle direction") appears CLOCKWISE on screen, and
  // clockwise from the left point to the right point passes over the TOP -
  // the smaller y. Checked in a browser rather than argued: setting this
  // exact path on a real <path> and sampling its midpoint with
  // getPointAtLength gives (100, 50) for sweep=1 and (100, 150) for
  // sweep=0. Getting this backwards mirrors every crescent.
  const sweep1 = parsePathD(`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`).ops;
  const sweep0 = parsePathD(`M ${CX - R} ${CY} A ${R} ${R} 0 0 0 ${CX + R} ${CY}`).ops;
  const midpoint = (list: typeof sweep1) => {
    // Halfway along, which for a half circle split into two cubics is the
    // join between them.
    const curves = list.filter((o) => o.op === "c");
    const join = curves[Math.floor(curves.length / 2) - 1];
    return join && join.op === "c" ? { x: join.x, y: join.y } : { x: 0, y: 0 };
  };
  const over = midpoint(sweep1);
  const under = midpoint(sweep0);
  if (!near(over.x, CX, 1e-6) || !near(over.y, CY - R, 1e-6)) {
    fail(`sweep=1 must pass over the top at (${CX}, ${CY - R}), got (${over.x.toFixed(2)}, ${over.y.toFixed(2)})`);
  }
  if (!near(under.x, CX, 1e-6) || !near(under.y, CY + R, 1e-6)) {
    fail(`sweep=0 must pass under at (${CX}, ${CY + R}), got (${under.x.toFixed(2)}, ${under.y.toFixed(2)})`);
  }
}

// --- totality: every mark reaches the page -----------------------------
//
// A page of one of everything, drawn for real, then counted. skipped > 0
// is the thing this is here to catch: an element type the exporter does
// not recognise costs a mark on paper and nothing anywhere else.
{
  const page: RenderedPolotnoElement[] = [
    { id: "a", type: "figure", subType: "rect", x: 100, y: 100, width: 300, height: 75, stroke: "#231F20", strokeWidth: 1.25 },
    { id: "b", type: "figure", subType: "rect", x: 100, y: 200, width: 40, height: 40, fill: "#231F20", cornerRadius: 20 },
    { id: "c", type: "text", x: 100, y: 300, width: 300, height: 24, text: "Newsreader", fontSize: 20, fill: "#231F20", align: "center" },
    { id: "d", type: "text", x: 100, y: 340, width: 300, height: 24, text: "faded", fontSize: 20, fill: "#231F20", opacity: 0.45 },
    glyphElement({ id: "e", x: 500, y: 100, sizePx: 40, shape: "droplet" }) as RenderedPolotnoElement,
    glyphElement({ id: "f", x: 560, y: 100, sizePx: 40, shape: "moon" }) as RenderedPolotnoElement,
    { id: "g", type: "group", x: 0, y: 0, width: 0, height: 0, children: [
      { id: "g1", type: "text", x: 100, y: 400, width: 100, height: 20, text: "nested", fontSize: 16, fill: "#231F20" },
    ] },
  ];
  const doc = createPdf(PROOF_PAGE);
  const font = installFont(doc, "Newsreader");
  const report = drawPage(doc, page, font, emptyReport());
  if (report.skipped > 0) fail(`${report.skipped} element(s) of a one-of-everything page were not drawn`);
  if (report.unsupportedPathCommands.length > 0) {
    fail(`unsupported path commands: ${report.unsupportedPathCommands.join(", ")}`);
  }
  if (report.text !== 3) fail(`expected 3 text marks (one nested in a group), got ${report.text}`);
  if (report.rects !== 2) fail(`expected 2 rects, got ${report.rects}`);
  if (report.paths !== 2) fail(`expected 2 paths, got ${report.paths}`);

  // An unknown element type must be counted as skipped rather than pass
  // silently - that count is what check-pdf.mts refuses to ship on.
  const odd = drawElement.length >= 0 ? emptyReport() : emptyReport();
  drawElement(doc, { id: "x", type: "video", x: 0, y: 0, width: 10, height: 10 }, font, odd);
  if (odd.skipped !== 1) fail(`an unknown element type must be reported as skipped, got ${odd.skipped}`);
}

if (failures > 0) {
  console.error(`\n${failures} PDF export problem(s).`);
  process.exit(1);
}
console.log(
  "All PDF export checks passed (scale exact at print sizes, every glyph's path convertible, " +
    "arc cubics within 0.1% of the true circle, nothing skipped)."
);
