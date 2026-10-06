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
import { GLYPH_SHAPES, glyphElement, type GlyphShape } from "./modules/glyphs";
import { PROOF_PAGE } from "./proofSvg";
import type { RenderedPolotnoElement } from "./renderModuleInstance";
import { readDrawingOps } from "./pdfContentStream";

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
// FLOW'S ICONS (2026-10-06), both drawings of each - "shape" plain and
// "shape+face" - re-measured the same way when they replaced the hand-built
// glyphs (scripts/_glyph-bbox.mts read them off; a stale table fails here).
// Each spans its box on its longer side, so one of each pair of edges is
// 100/140 or 200/240 to within the drawing's rounding.
const GLYPH_BBOX: Record<string, [number, number, number, number]> = {
  "droplet": [106.56, 133.46, 199.99, 240],
  "plant": [99.97, 139.98, 204.88, 235.18],
  "flame": [105.54, 134.48, 200, 240.04],
  "leaf": [102.88, 137.1, 200, 240.01],
  "heart": [99.99, 140, 202.37, 237.64],
  "star": [100, 139.99, 200.84, 239.19],
  "moon": [101.43, 138.6, 200, 240],
  "sun": [99.98, 140.05, 200.07, 239.92],
  "cloud": [99.97, 139.99, 206.88, 233.06],
  "spoon": [112.37, 127.73, 199.94, 240.04],
  "jar": [103.41, 136.59, 200.01, 240.02],
  "lotus": [100, 139.99, 202.48, 237.48],
  "pill": [102.49, 137.52, 199.98, 239.97],
  "medicine": [108.22, 131.73, 199.96, 240.06],
  "toothbrush": [113.84, 126.17, 200, 240.01],
  "bed": [99.96, 140.01, 202.99, 237],
  "mug": [100, 140, 202.98, 236.88],
  "glass": [104.49, 135.5, 199.97, 239.98],
  "trash": [106.57, 133.44, 200.02, 240.02],
  "recycling": [104.04, 135.99, 200.01, 240.06],
  "laundry": [99.99, 140.02, 201.53, 238.51],
  "broom": [110.1, 129.92, 199.99, 240.07],
  "watering-can": [99.99, 139.98, 203.18, 236.79],
  "washer": [103.03, 136.97, 199.96, 240.06],
  "bag": [102.09, 137.99, 200, 240.01],
  "cart": [99.99, 140.01, 202.02, 237.97],
  "envelope": [100, 140, 206.65, 233.31],
  "coins": [99.95, 140, 201.17, 238.89],
  "calendar": [100.07, 140, 200.01, 240],
  "house": [100.04, 139.99, 201.8, 238.2],
  "dumbbell": [100.01, 140.03, 209.57, 230.4],
  "shoe": [100.03, 140.05, 207.54, 232.46],
  "bicycle": [100.01, 139.99, 206.11, 233.83],
  "apple": [101, 139.01, 200, 240.03],
  "tooth": [101.25, 138.73, 200, 239.97],
  "paw": [100, 140, 202.06, 237.9],
  "cat": [100, 140, 204.47, 235.53],
  "car": [99.99, 140, 206.34, 233.6],
  "bus": [100, 140.04, 206.16, 233.83],
  "baby-bottle": [109.99, 130, 199.98, 240.03],
  "book": [99.98, 140, 202.79, 237.2],
  "scissors": [100.06, 139.97, 201.23, 238.83],
  "cake": [99.99, 140.01, 200.26, 239.8],
  "gift": [102.41, 137.62, 199.99, 239.99],
  "music": [101.86, 138.19, 200.04, 239.99],
  "plane": [100, 140.05, 206.76, 233.22],
  "palette": [100.02, 140, 200.86, 239.08],
  "key": [101.31, 138.67, 200.02, 239.99],
  "droplet+face": [105.9, 134.11, 200.03, 240],
  "plant+face": [100.02, 140.03, 201.36, 238.7],
  "flame+face": [104.9, 135.13, 200.01, 240.02],
  "leaf+face": [103.96, 136.02, 199.94, 240.01],
  "heart+face": [100.07, 140.05, 202.14, 237.88],
  "star+face": [100, 139.98, 200.92, 239.08],
  "moon+face": [101.4, 138.64, 199.97, 240.01],
  "sun+face": [99.95, 140.04, 200.01, 239.99],
  "cloud+face": [99.99, 139.99, 206.98, 232.96],
  "spoon+face": [112.66, 127.31, 200, 240.01],
  "jar+face": [103.58, 136.4, 199.98, 240],
  "lotus+face": [99.99, 140, 203.57, 236.4],
  "pill+face": [100.89, 139.13, 199.98, 240.03],
  "medicine+face": [107.88, 132.19, 199.97, 239.99],
  "toothbrush+face": [114.83, 125.21, 200, 240],
  "bed+face": [99.94, 140, 203.06, 236.98],
  "mug+face": [100.02, 140, 201.41, 238.53],
  "glass+face": [104.28, 135.72, 199.98, 240.07],
  "trash+face": [105.21, 134.8, 199.96, 240.07],
  "recycling+face": [103.72, 136.25, 199.95, 240],
  "laundry+face": [99.99, 139.97, 201.64, 238.35],
  "broom+face": [107.23, 132.8, 200, 240.01],
  "watering-can+face": [99.99, 140.01, 205.45, 234.6],
  "washer+face": [103.22, 136.81, 199.98, 240.02],
  "bag+face": [102.47, 137.5, 200, 240.05],
  "cart+face": [99.98, 139.97, 203, 237.05],
  "envelope+face": [100, 140, 205.48, 234.49],
  "coins+face": [100.22, 139.8, 199.93, 240.04],
  "calendar+face": [100.04, 139.96, 200.52, 239.48],
  "house+face": [99.99, 140.01, 200.86, 239.15],
  "dumbbell+face": [100.02, 140.03, 209.09, 230.95],
  "shoe+face": [100.04, 139.99, 206.92, 233.12],
  "bicycle+face": [99.99, 139.97, 205.2, 234.76],
  "apple+face": [101.58, 138.42, 199.98, 240.01],
  "tooth+face": [101.17, 138.85, 199.96, 239.99],
  "paw+face": [100, 140.01, 201.57, 238.46],
  "cat+face": [100, 140, 204.9, 235.13],
  "car+face": [99.98, 140, 206.02, 233.93],
  "bus+face": [99.99, 140.04, 204.8, 235.26],
  "baby-bottle+face": [109.65, 130.28, 200, 240.05],
  "book+face": [100, 140.01, 200.02, 240],
  "scissors+face": [101.46, 138.54, 200, 240],
  "cake+face": [100.47, 139.52, 200, 239.97],
  "gift+face": [101.65, 138.37, 199.98, 240.02],
  "music+face": [101.93, 138.03, 200.03, 239.95],
  "plane+face": [99.98, 140, 205.05, 235],
  "palette+face": [100.03, 140.01, 201.69, 238.33],
  "key+face": [101.26, 138.77, 200, 240.02],
};

// Every glyph there is, not a list kept here: a glyph added tomorrow with no
// measured box above fails rather than going unchecked.
const SHAPES: readonly GlyphShape[] = GLYPH_SHAPES;
for (const [shape, faces] of SHAPES.flatMap((s) => [[s, false], [s, true]] as const)) {
  const element = glyphElement({ id: "g", x: 100, y: 200, sizePx: 40, shape, faces }) as
    RenderedPolotnoElement & { pathD?: string };
  const key = faces ? `${shape}+face` : shape;
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
  const want = GLYPH_BBOX[key];
  if (!want) {
    fail(`${key}: no measured bbox recorded - add one read off a real <path>`);
    continue;
  }
  const got: [number, number, number, number] = [minX, maxX, minY, maxY];
  const labels = ["left", "right", "top", "bottom"];
  for (let i = 0; i < 4; i++) {
    if (!near(got[i], want[i], 0.05)) {
      fail(
        `${key}: ${labels[i]} edge came out ${got[i].toFixed(2)}, ` +
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

// --- rounded corners actually reach the paper --------------------------
//
// Calendar events are drawn as translucent ROUNDED rectangles, in the editor,
// the previews and in print. The exporter has honoured `cornerRadius` since
// it was added - pdfDocument's drawRect calls doc.roundedRect when the radius
// is over zero - but nothing proved it: the one rounded rect in the totality
// page above is only COUNTED, and `report.rects` is 2 either way. Delete the
// branch and that check still passes.
//
// So read the file back. jsPDF draws a rounded rect as lines and four bezier
// curves and emits NO `re` operator; a plain rect is a single `re` and no
// curves. The two are distinguishable in the bytes, which is the only place
// that settles what a printer will see.
{
  const square = createPdf(PROOF_PAGE);
  drawPage(
    square,
    [{ id: "sq", type: "figure", subType: "rect", x: 100, y: 100, width: 80, height: 40, fill: "#231F20" }],
    installFont(square, "Newsreader"),
    emptyReport()
  );
  const squareOps = readDrawingOps(square.output("arraybuffer"));

  const rounded = createPdf(PROOF_PAGE);
  drawPage(
    rounded,
    [{ id: "rd", type: "figure", subType: "rect", x: 100, y: 100, width: 80, height: 40, fill: "#231F20", cornerRadius: 6 }],
    installFont(rounded, "Newsreader"),
    emptyReport()
  );
  const roundedOps = readDrawingOps(rounded.output("arraybuffer"));

  if (squareOps.rects !== 1 || squareOps.curves !== 0) {
    fail(`a square rect should be 1 re and no curves, got ${squareOps.rects} re and ${squareOps.curves} curves`);
  }
  if (roundedOps.curves < 4) {
    fail(
      `a rounded rect should reach the file as at least 4 bezier curves - one per corner - ` +
        `got ${roundedOps.curves}. cornerRadius is being dropped between the element and the page.`
    );
  }
  if (roundedOps.rects !== 0) {
    fail(`a rounded rect should emit no plain re operator, got ${roundedOps.rects}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} PDF export problem(s).`);
  process.exit(1);
}
console.log(
  "All PDF export checks passed (scale exact at print sizes, every glyph's path convertible, " +
    "arc cubics within 0.1% of the true circle, nothing skipped)."
);
