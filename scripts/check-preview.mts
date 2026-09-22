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
import { snapHairline, MIN_ONSCREEN_RECT_PX, MIN_ONSCREEN_INK, HAIRLINE_ASPECT_RATIO } from "@/lib/hairline";
import { type PageGrid } from "@/lib/grid";
import { FONT_SERIF } from "@/lib/theme";
import { readFileSync } from "node:fs";

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
  const onePixel = MIN_ONSCREEN_RECT_PX / scale;
  if (Math.abs(onePixel - 30.2083) > 0.001) {
    fail(`hairline maths: one device px at the resting card is ${onePixel.toFixed(4)} print px, expected 30.2083`);
  }

  const rule = snapHairline({ x: 100, y: 200, width: 600, height: 1.25 }, scale);
  if (Math.abs(rule.height - onePixel) > 1e-9) {
    fail(`hairline: a 1.25px rule came out ${rule.height.toFixed(4)} print px, not one device pixel`);
  }
  // A RESTING CARD IS THE CASE THE INK FLOOR EXISTS FOR. True coverage here
  // is 1.25 x 72/2175 = 0.0414 of a pixel - a rule nobody can see, and "0 of
  // 54 rules resolvable at a resting card" is the defect the canvas preview
  // work was done to fix. The floor holds it at 0.35.
  const trueInk = 1.25 * scale;
  if (trueInk >= MIN_ONSCREEN_INK) {
    fail(`this case is meant to be BELOW the ink floor, but true coverage is ${trueInk.toFixed(4)}`);
  }
  if (rule.ink !== MIN_ONSCREEN_INK) {
    fail(`hairline: ink ${rule.ink.toFixed(5)} at the resting card, expected the ${MIN_ONSCREEN_INK} floor`);
  }
  // And a zoom where the rule really is dark enough gets its own ink, not
  // the floor - otherwise the floor is just a constant and the "carries its
  // true ink" half of this is untested.
  const midZoom = snapHairline({ x: 0, y: 0, width: 600, height: 1.25 }, 0.37);
  const midTrue = 1.25 * 0.37;
  if (Math.abs(midZoom.ink - midTrue) > 1e-9) {
    fail(`hairline: at 37% a rule carrying ${midTrue.toFixed(4)} of ink got ${midZoom.ink.toFixed(4)}`);
  }
  if (rule.x !== 100 || rule.width !== 600) {
    fail("hairline: snapping touched the rule's LONG axis, which is its length, not its weight");
  }

  // ON THE GRID. This is the whole point, and the thing the old rule never
  // did: the rule's near edge lands on a whole device pixel.
  const edgeInDevicePx = rule.y * scale;
  if (Math.abs(edgeInDevicePx - Math.round(edgeInDevicePx)) > 1e-9) {
    fail(`hairline: the snapped edge sits at ${edgeInDevicePx.toFixed(4)} device px, not on a whole one`);
  }

  // AND IT BARELY MOVES. Snapping shifts a rule by at most half a device
  // pixel; more than that would be a different rule, not a crisper one.
  const moved = Math.abs(rule.y - 200) * scale;
  if (moved > 0.5 + 1e-9) {
    fail(`hairline: snapping moved the rule ${moved.toFixed(3)} device px, over the half-pixel bound`);
  }

  // EVERY RULE ON A REGULAR PITCH GETS THE SAME PHASE.
  //
  // THIS IS THE REPORTED DEFECT, stated as a property. 19 rules at the
  // to-do's real 75 print px pitch: under the old widening each landed on a
  // different sub-pixel phase and came out visibly unequal - measured at a
  // 0.218 coefficient of variation in peak darkness, which is what "some
  // lines show at skinny detailed lines" beside blurry grey ones actually
  // is. Snapped, every one is on a whole device row, so there is no phase
  // left to differ.
  for (const zoom of [0.2, 0.28, 0.37, 0.5, 0.64]) {
    for (const ratio of [1, 2, 3]) {
      const deviceScale = zoom * ratio;
      const phases = new Set<string>();
      for (let i = 0; i < 19; i++) {
        const snapped = snapHairline({ x: 0, y: 261.875 + i * 75, width: 600, height: 1.25 }, deviceScale);
        const edge = snapped.y * deviceScale;
        const phase = edge - Math.round(edge);
        // Normalised, because a phase of -1e-17 and one of +1e-17 are the
        // same phase but format as "-0.000000000" and "0.000000000". The
        // first run of this check reported "2 phases, not 1" on four of the
        // fifteen cases for exactly that and nothing else.
        phases.add(Math.abs(phase) < 1e-9 ? "0" : phase.toFixed(9));
        if (Math.abs(phase) > 1e-9) {
          fail(`${Math.round(zoom * 100)}% at ${ratio}x: rule ${i} sits at phase ${phase.toFixed(4)}`);
        }
      }
      if (phases.size !== 1) {
        fail(`${Math.round(zoom * 100)}% at ${ratio}x: 19 rules on one pitch landed on ${phases.size} phases, not 1`);
      }
    }
  }

  // A WHOLE NUMBER OF DEVICE PIXELS THICK, AT ANY PIXEL RATIO, NEVER UNDER
  // ONE. `scale` is output units per print px, and the editor once passed
  // CSS px per print px - so on a 3x display a rule came out three device
  // pixels wide. Stated as the invariant rather than as one case.
  for (const zoom of [0.28, 0.37, 0.5, 1, 1.5]) {
    for (const ratio of [1, 2, 3]) {
      const deviceScale = zoom * ratio;
      const HOUSE_HAIRLINE = 1.25;
      const snapped = snapHairline({ x: 0, y: 0, width: 600, height: HOUSE_HAIRLINE }, deviceScale);
      const onScreen = snapped.height * deviceScale;
      const where = `${Math.round(zoom * 100)}% zoom at ${ratio}x`;
      if (Math.abs(onScreen - Math.round(onScreen)) > 1e-9) {
        fail(`${where}: a snapped rule is ${onScreen.toFixed(3)} device px, not a whole number`);
      }
      if (onScreen < 1 - 1e-9) {
        fail(`${where}: a snapped rule came out ${onScreen.toFixed(3)} device px - under one, so it can vanish`);
      }
      // Ink times thickness is the ink the rule really has: snapping moves
      // where the ink goes, never how much of it there is. Two cases are
      // exempt and both are deliberate - a rule rounded DOWN would need more
      // ink than a pixel has, and one under MIN_ONSCREEN_INK is held up on
      // purpose so a thumbnail's rules stay visible.
      const trueArea = HOUSE_HAIRLINE * deviceScale;
      const roundedUp = Math.round(trueArea) >= trueArea;
      const aboveFloor = trueArea / Math.max(1, Math.round(trueArea)) >= MIN_ONSCREEN_INK;
      if (roundedUp && aboveFloor && Math.abs(snapped.ink * onScreen - trueArea) > 1e-9) {
        fail(`${where}: snapping changed the ink from ${trueArea.toFixed(4)} to ${(snapped.ink * onScreen).toFixed(4)}`);
      }
    }
  }

  // A DATE BOX IS NOT A RULE. 40 x 30 is nowhere near the aspect ratio, and
  // snapping it would move a small square off its own position.
  const box = snapHairline({ x: 0, y: 0, width: 40, height: 30 }, scale);
  if (box.height !== 30 || box.width !== 40 || box.ink !== 1) {
    fail("hairline: a 40x30 box was treated as a rule");
  }
  // The boundary itself, stated: 40 x 6 is exactly at the ratio and must
  // NOT qualify; 40 x 5.9 is inside it and must.
  const atRatio = snapHairline({ x: 7, y: 7, width: 40, height: 40 * HAIRLINE_ASPECT_RATIO }, scale);
  if (atRatio.ink !== 1 || atRatio.y !== 7) {
    fail("hairline: a box exactly at the aspect ratio was treated as a rule");
  }
  const insideRatio = snapHairline({ x: 7, y: 7, width: 40, height: 40 * HAIRLINE_ASPECT_RATIO - 0.1 }, scale);
  if (insideRatio.ink === 1) fail("hairline: a box inside the aspect ratio was NOT treated as a rule");

  // A vertical rule is the same rule on the other axis - column dividers in
  // the hourly grid are these, and an implementation that only handles the
  // horizontal case looks entirely correct on a weekly page until you look
  // for the verticals.
  const vertical = snapHairline({ x: 100, y: 200, width: 1.25, height: 600 }, scale);
  if (Math.abs(vertical.width - onePixel) > 1e-9 || vertical.height !== 600) {
    fail("hairline: a VERTICAL rule was not snapped on its thin axis");
  }
  const verticalEdge = vertical.x * scale;
  if (Math.abs(verticalEdge - Math.round(verticalEdge)) > 1e-9) {
    fail("hairline: a VERTICAL rule's edge did not land on a whole device pixel");
  }
  if (vertical.y !== 200) fail("hairline: snapping moved a vertical rule along its length");
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

// ---------------------------------------------------------------------
// 3. The callers hand it a DEVICE scale.
//
// snapHairline's `scale` is output units per print px, and the snap is
// meaningless if a caller passes the wrong unit. The editor passed CSS
// pixels per print pixel: on a 3x display that put every ruled line on a
// three-device-pixel grid, beside stroked outlines the browser drew crisp at
// full ink. Reported as lines that "look blurry because they are wider
// versions that are grey".
//
// A unit check cannot catch that - the function was handed a number and used
// it exactly as documented. This reads the call sites instead.
// ---------------------------------------------------------------------
{
  const editor = readFileSync("src/app/planner/PolotnoJsonRenderer.tsx", "utf8");
  if (!/markGeometry\(element, originX, originY, scale \* dpr,/.test(editor)) {
    fail(
      "PolotnoJsonRenderer must pass scale * devicePixelRatio - a CSS scale floors every rule " +
        "at one CSS pixel, which is three device pixels on a 3x display"
    );
  }
  if (!/deviceScale: number/.test(editor)) {
    fail("markGeometry's scale parameter must be named deviceScale, so a CSS scale reads as wrong where it is passed");
  }
  // The canvas previews size their own backing store in device pixels, so
  // their scale already carries the ratio - see drawPreview.
  const preview = readFileSync("src/app/planner/drawPreview.ts", "utf8");
  if (!/const scale = Math\.min\(width \/ pageWidth, height \/ pageHeight\)/.test(preview)) {
    fail("drawPreview must take its scale from the canvas's own device-pixel backing store");
  }
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
  `Hairline snap verified at the resting card: a 1.25px rule lands on one whole device pixel ` +
    `(${(MIN_ONSCREEN_RECT_PX / (72 / 2175)).toFixed(2)} print px) held at the ` +
    `${MIN_ONSCREEN_INK} ink floor a thumbnail needs, and 19 rules on the to-do's 75px pitch share ` +
    `one phase at every zoom and pixel ratio tested.`
);
