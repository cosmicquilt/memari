// The timeline previews, checked against the drawing they claim to be.
//
// A preview is the FIFTH consumer of the element list, and the one whose
// failure is hardest to see: a thumbnail is 72px wide, so a whole class of
// mark can go missing from it and look like detail lost to size. The
// specific way that happens here is known, because it nearly did:
//
//   A GLYPH IS STILL `type:"figure", subType:"rect"`. Its real shape rides
//   along in an ADDITIVE `pathD` field - see glyphs.ts for why. A consumer
//   written for rects and text alone therefore handles every glyph without
//   complaining and draws the wrong thing: the box the glyph is inscribed
//   in, or, since those boxes are unfilled, nothing at all. Every icon
//   strip in the catalogue disappears and no error is raised anywhere.
//
// So this does not check that conversion "works". It checks that the corpus
// contains all three kinds, that the count of each survives, and that every
// field of every mark still says what the element said. Sabotage any one
// branch of toPreviewMark and a line below goes red.
//
// Run: npm run check:preview

import { REGISTERED_SLUGS, moduleDefinition } from "@/lib/moduleRegistry";
import { renderModuleInstance, type RenderedPolotnoElement } from "@/lib/renderModuleInstance";
import { flatten } from "@/lib/proofSvg";
import { toPreviewMarks, type PreviewMark } from "@/lib/previewMarks";
import {
  widenHairline,
  MIN_ONSCREEN_INK,
  MIN_ONSCREEN_RECT_PX,
  HAIRLINE_ASPECT_RATIO,
} from "@/lib/hairline";
import { type PageGrid } from "@/lib/grid";
import { FONT_SERIF } from "@/lib/theme";

const PAGE: PageGrid = {
  widthPx: 2175,
  heightPx: 3075,
  gridColumns: 24,
  gridRows: 36,
  boxInsetPx: 6,
  marginPx: 187.5,
};

let failures = 0;
const fail = (message: string) => {
  console.error(`  ${message}`);
  failures++;
};

// ---------------------------------------------------------------------
// 0. The hairline rule, against values worked out by hand.
//
// Same reasoning as check:contrast verifying its own contrast formula
// before it reports: a rule that is wrong about its own arithmetic does not
// stay silent, it CERTIFIES. Every number below is derived on paper from
// the constants, not read off a run.
// ---------------------------------------------------------------------
{
  // A card at rest is 72 x 102 CSS px for a 2175 x 3075 page, so one device
  // pixel on a 1x display is 2175/72 = 30.208 print px. A 1.25px rule (0.3pt
  // at 300 DPI, the house hairline) is far under that.
  const scale = 72 / 2175;
  const needed = MIN_ONSCREEN_RECT_PX / scale;
  if (Math.abs(needed - 30.2083) > 0.001) {
    fail(`hairline maths: one device px at the resting card is ${needed.toFixed(4)} print px, expected 30.2083`);
  }

  const rule = widenHairline({ x: 100, y: 200, width: 600, height: 1.25 }, scale);
  if (Math.abs(rule.height - needed) > 1e-9) {
    fail(`hairline: a 1.25px rule came out ${rule.height.toFixed(4)} print px, not one device pixel`);
  }
  // 1.25 / 30.2083 = 0.0414, below the ink floor, so it clamps.
  if (rule.ink !== MIN_ONSCREEN_INK) {
    fail(`hairline: ink ${rule.ink} at the resting card, expected the ${MIN_ONSCREEN_INK} floor`);
  }
  // Grown about its own centre: the rule must not MOVE. A rule that shifts
  // as it thickens is a rule off the lattice.
  const centreBefore = 200 + 1.25 / 2;
  const centreAfter = rule.y + rule.height / 2;
  if (Math.abs(centreBefore - centreAfter) > 1e-9) {
    fail(`hairline: widening moved the rule's centre by ${(centreAfter - centreBefore).toFixed(4)}px`);
  }
  if (rule.x !== 100 || rule.width !== 600) {
    fail("hairline: widening touched the rule's LONG axis, which is its length, not its weight");
  }

  // The same rule zoomed in far enough needs no help at all.
  const big = widenHairline({ x: 0, y: 0, width: 600, height: 1.25 }, 1);
  if (big.height !== 1.25 || big.ink !== 1) {
    fail("hairline: a rule already thicker than a device pixel was widened anyway");
  }

  // A DATE BOX IS NOT A RULE. 40 x 30 is nowhere near the aspect ratio, and
  // widening it would turn a small square into a bar.
  const box = widenHairline({ x: 0, y: 0, width: 40, height: 30 }, scale);
  if (box.height !== 30 || box.width !== 40 || box.ink !== 1) {
    fail("hairline: a 40x30 box was treated as a rule");
  }
  // The boundary itself, stated: 40 x 6 is exactly at the ratio and must
  // NOT qualify; 40 x 5.9 is inside it and must.
  const atRatio = widenHairline({ x: 0, y: 0, width: 40, height: 40 * HAIRLINE_ASPECT_RATIO }, scale);
  if (atRatio.ink !== 1) fail("hairline: a box exactly at the aspect ratio was treated as a rule");
  const insideRatio = widenHairline({ x: 0, y: 0, width: 40, height: 40 * HAIRLINE_ASPECT_RATIO - 0.1 }, scale);
  if (insideRatio.ink === 1) fail("hairline: a box inside the aspect ratio was NOT treated as a rule");

  // A vertical rule is the same rule on the other axis - column dividers in
  // the hourly grid are these, and an implementation that only handles the
  // horizontal case looks entirely correct on a weekly page until you look
  // for the verticals.
  const vertical = widenHairline({ x: 100, y: 200, width: 1.25, height: 600 }, scale);
  if (Math.abs(vertical.width - needed) > 1e-9 || vertical.height !== 600) {
    fail("hairline: a VERTICAL rule was not widened on its thin axis");
  }
}

// ---------------------------------------------------------------------
// 1. The corpus: every registered module, at four widths by four heights.
// ---------------------------------------------------------------------
function render(slug: string, columnSpan: number, rowSpan: number, propValues: unknown) {
  return flatten(
    renderModuleInstance(
      {
        id: "t",
        locked: true,
        columnStart: 0,
        rowStart: 2,
        columnSpan,
        rowSpan,
        propValues,
        moduleType: { slug },
      },
      PAGE,
      FONT_SERIF
    )
  );
}

const counts = { r: 0, p: 0, t: 0 };
let elementsSeen = 0;
let combinations = 0;
let pathDElements = 0;
let skippedTotal = 0;

/**
 * Half a rounding step, plus float slop.
 *
 * previewMarks rounds to two decimals, so the worst honest drift is exactly
 * half of that - measured across the catalogue, exactly 0.005 and never
 * more. Written as HALF THE QUANTUM rather than as the number, because the
 * two have to move together: a tolerance typed beside a quantum is two
 * descriptions of one decision, and the first version of this line failed
 * the whole catalogue because 0.005 in binary is a hair over 0.005.
 *
 * What it is worth in the world: two decimals of a print pixel is a six
 * hundredth of an inch on paper, and at the size a preview is drawn, a
 * thousandth of a device pixel.
 */
const ROUNDING_QUANTUM = 0.01;
const EPS = ROUNDING_QUANTUM / 2 + 1e-9;

function checkFidelity(slug: string, element: RenderedPolotnoElement, mark: PreviewMark) {
  const where = `${slug} ${String(element.id)}`;
  const opacity = element.opacity ?? 1;
  if ((mark.o ?? 1) !== Math.round(opacity * 100) / 100) {
    fail(`${where}: opacity ${opacity} became ${mark.o ?? 1}`);
  }

  const fill = typeof element.fill === "string" && element.fill !== "transparent" ? element.fill : undefined;
  const strokeWidth = element.strokeWidth ?? 0;
  const stroke =
    typeof element.stroke === "string" && element.stroke !== "none" && strokeWidth > 0
      ? element.stroke
      : undefined;

  if (element.type === "text") {
    if (mark.k !== "t") return fail(`${where}: a text element became a "${mark.k}" mark`);
    if (mark.t !== String(element.text ?? "")) {
      fail(`${where}: text "${String(element.text)}" became "${mark.t}"`);
    }
    // THE FAMILY TRAVELS WITH THE MARK. A canvas has no cascade to fall back
    // on, so a mark with no family is a mark drawn in whatever the browser
    // feels like - and on a thumbnail that looks close enough to be
    // believed. proofSvg gets away with a hard-coded family because a proof
    // sheet has a stylesheet; this does not.
    if (!mark.ff) fail(`${where}: a text mark carries no font family`);
    if (mark.ff !== element.fontFamily) {
      fail(`${where}: font family "${String(element.fontFamily)}" became "${mark.ff}"`);
    }
    if (element.fill === "transparent") {
      // Would be drawn solid black by the painter's `?? "#000"` default.
      fail(`${where}: text with a transparent fill - the painter would draw it black`);
    }
    if ((mark.f ?? undefined) !== fill) fail(`${where}: text fill ${String(element.fill)} became ${String(mark.f)}`);
    const expectedAlign = element.align === "center" ? "c" : element.align === "right" ? "r" : "l";
    if (mark.a !== expectedAlign) fail(`${where}: align "${String(element.align)}" became "${mark.a}"`);
    if (Math.abs(mark.z - (element.fontSize ?? 12)) > EPS) fail(`${where}: font size drifted`);
    if (Math.abs(mark.x - (element.x ?? 0)) > EPS || Math.abs(mark.y - (element.y ?? 0)) > EPS) {
      fail(`${where}: text position drifted`);
    }
    if (Math.abs(mark.w - (element.width ?? 0)) > EPS) fail(`${where}: text box width drifted`);
    return;
  }

  if (typeof element.pathD === "string" && element.pathD.length > 0) {
    if (mark.k !== "p") {
      return fail(
        `${where}: a glyph carrying pathD became a "${mark.k}" mark - this is the icon strips vanishing`
      );
    }
    if (mark.d !== element.pathD) fail(`${where}: the path data changed`);
  } else {
    if (mark.k !== "r") return fail(`${where}: a figure became a "${mark.k}" mark`);
    if (Math.abs(mark.x - Number(element.x ?? 0)) > EPS) fail(`${where}: x drifted`);
    if (Math.abs(mark.y - Number(element.y ?? 0)) > EPS) fail(`${where}: y drifted`);
    if (Math.abs(mark.w - Number(element.width ?? 0)) > EPS) fail(`${where}: width drifted`);
    if (Math.abs(mark.h - Number(element.height ?? 0)) > EPS) fail(`${where}: height drifted`);
    const radius = typeof element.cornerRadius === "number" && element.cornerRadius > 0 ? element.cornerRadius : undefined;
    if (radius !== undefined && Math.abs((mark.r ?? 0) - radius) > EPS) {
      fail(`${where}: corner radius ${radius} became ${String(mark.r)}`);
    }
    if (radius === undefined && mark.r !== undefined) fail(`${where}: a square corner gained a radius`);
  }

  if ((mark.f ?? undefined) !== fill) fail(`${where}: fill ${String(element.fill)} became ${String(mark.f)}`);
  if ((mark.s ?? undefined) !== stroke) fail(`${where}: stroke ${String(element.stroke)} became ${String(mark.s)}`);
  if (stroke !== undefined && Math.abs((mark.sw ?? 0) - strokeWidth) > EPS) {
    fail(`${where}: stroke width ${strokeWidth} became ${String(mark.sw)}`);
  }
}

for (const slug of REGISTERED_SLUGS) {
  const definition = moduleDefinition(slug);
  if (!definition?.render) continue;
  const preview = definition.previewProps ?? {};

  for (const columnSpan of [6, 12, 18, 24]) {
    for (const rowSpan of [4, 8, 13, 20]) {
      let elements: RenderedPolotnoElement[];
      try {
        elements = render(slug, columnSpan, rowSpan, preview);
      } catch (error) {
        fail(`${slug} ${columnSpan}x${rowSpan}: threw while rendering - ${error}`);
        continue;
      }
      combinations++;
      const { marks, skipped } = toPreviewMarks(elements);

      // TOTAL OVER THE VOCABULARY. A group wrapper cannot appear here -
      // flatten removed those - so anything skipped is an element kind the
      // previews have never heard of, drawn on the canvas and on the printed
      // page and missing from the thumbnail.
      for (const missed of skipped) {
        skippedTotal++;
        fail(`${slug} ${columnSpan}x${rowSpan}: no mark for a "${missed.type}" element (${String(missed.id)})`);
      }
      if (marks.length + skipped.length !== elements.length) {
        fail(`${slug} ${columnSpan}x${rowSpan}: ${elements.length} elements became ${marks.length} marks`);
      }

      let m = 0;
      for (const element of elements) {
        if (toPreviewMarks([element]).skipped.length > 0) continue;
        const mark = marks[m++];
        elementsSeen++;
        counts[mark.k]++;
        if (typeof element.pathD === "string" && element.pathD.length > 0) pathDElements++;
        checkFidelity(slug, element, mark);
      }
    }
  }
}

// ---------------------------------------------------------------------
// 2. The corpus actually exercises all three kinds.
//
// Without this, "nothing was skipped" is a claim about an empty set. The
// glyph count is the one that matters: it is the number this check exists
// for, and if a future refactor stops emitting pathD the honest failure is
// HERE rather than a quietly blank icon strip.
// ---------------------------------------------------------------------
if (counts.r === 0) fail("the corpus drew no rects - the check is not checking anything");
if (counts.t === 0) fail("the corpus drew no text - the check is not checking anything");
if (counts.p === 0) {
  fail("the corpus drew no glyph paths - either the glyphs stopped emitting pathD, or previewMarks stopped reading it");
}
if (counts.p !== pathDElements) {
  fail(`${pathDElements} elements carry pathD but ${counts.p} path marks came out`);
}

if (failures > 0) {
  console.error(`\nPreview marks disagree with the drawing in ${failures} case(s).`);
  process.exit(1);
}

console.log(
  `All preview mark checks passed (${combinations} module/size combinations, ` +
    `${elementsSeen} elements: ${counts.r} rects, ${counts.t} text, ${counts.p} glyph paths; ` +
    `${skippedTotal} skipped).`
);
console.log(
  `Hairline floor verified at the resting card: a 1.25px rule widens to one device pixel ` +
    `(${(MIN_ONSCREEN_RECT_PX / (72 / 2175)).toFixed(2)} print px) at ${MIN_ONSCREEN_INK} ink, ` +
    `without moving and without touching its length.`
);
