// Turning rendered module elements into SVG, for the proof sheets.
//
// Lifted out of primitiveProof.mts when a second sheet needed it. Two
// copies of "how a mark becomes SVG" is the defect class this project
// keeps meeting from the other direction: the sheets would have drifted,
// and a proof that draws something other than what the editor draws is
// worse than no proof, because it is believed.
//
// Only the two shapes the app's own renderer understands are handled -
// axis-aligned rects and upright text - because those are the only two it
// can emit. See the renderer vocabulary note: anything else here would be
// a promise the editor cannot keep.

import type { RenderedPolotnoElement } from "./renderModuleInstance";
import { cellHeightPx, type PageGrid } from "./grid";

/** The real page: 7x10in trim plus bleed at 300 DPI, on the 1/4in lattice. */
export const PROOF_PAGE: PageGrid = {
  widthPx: 2175,
  heightPx: 3075,
  gridColumns: 24,
  gridRows: 36,
  boxInsetPx: 6,
  marginPx: 187.5,
};

export function escapeXml(s: string): string {
  return s.replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string)
  );
}

/**
 * Drawing a rule that is thinner than the screen can draw.
 *
 * A rule is a 1.25px filled rect - 0.3pt on paper, correct there. Shown at
 * a sixth of size it is a FIFTH of a device pixel, and below one device
 * pixel a rasteriser cannot draw a line: it can only tint pixels. How much
 * of which pixel it tints depends on where the rule's edges fall on the
 * grid, so identical rules on a regular pitch each land at a different
 * sub-pixel phase and come out different - some crisp, some split across
 * two rows so faintly that sRGB's gamma curve washes them out completely.
 * That is the reported "some lines show and adjacent ones vanish", and it
 * is a beat between the line pitch and the pixel grid, not a fault in the
 * geometry.
 *
 * ONE DEVICE PIXEL IS THE FLOOR. You cannot light a fraction of a pixel.
 * Every serious vector tool concedes this and does the same thing instead:
 * PostScript and PDF reserve width 0 to mean "thinnest the device can
 * draw"; Figma pins a hairline to one physical pixel however far you zoom
 * out. The trick that keeps it looking thin is that they drop the OPACITY
 * to match - one pixel at 40% ink reads as a hairline, where one pixel at
 * full ink reads as a heavy line. Two earlier attempts here clamped the
 * width and kept the ink, and both were rightly called too thick.
 *
 * So a hairline is emitted as a <line> down the rect's centre rather than
 * as the rect: stroking a rect draws its OUTLINE, which for something a
 * fifth of a pixel tall is two lines nearly on top of each other, doubling
 * the ink. Skia and WebRender also route strokes through hairline-specific
 * paths that preserve continuity, where a sliver-thin filled polygon is a
 * candidate for culling.
 *
 * `scale` is how far down the drawing will be shown, which is what turns a
 * print thickness into a screen one. The width and opacity themselves are
 * finished in the page, where devicePixelRatio is known - see the script
 * reviewCatalogue writes.
 */
export type SvgOptions = {
  /** Set by a caller drawing for a screen. Rules thinner than one device
   *  pixel at this scale get the hairline treatment. */
  hairlineScale?: number;
};

/** One rendered element as SVG. */
export function toSvg(element: RenderedPolotnoElement, options: SvgOptions = {}): string {
  if (element.type === "text") {
    const size = element.fontSize ?? 12;
    const anchor =
      element.align === "center" ? "middle" : element.align === "right" ? "end" : "start";
    const x =
      anchor === "middle"
        ? (element.x ?? 0) + (element.width ?? 0) / 2
        : anchor === "end"
        ? (element.x ?? 0) + (element.width ?? 0)
        : element.x ?? 0;
    return (
      `<text x="${x}" y="${(element.y ?? 0) + size}" font-size="${size}" ` +
      `font-family="Newsreader, Georgia, serif" fill="${element.fill ?? "#000"}" ` +
      `text-anchor="${anchor}" opacity="${element.opacity ?? 1}"` +
      (element.letterSpacing ? ` letter-spacing="${element.letterSpacing}"` : "") +
      `>${escapeXml(String(element.text ?? ""))}</text>`
    );
  }
  if (element.type !== "figure") return "";
  const hasStroke2 = !!element.stroke && element.stroke !== "none" && (element.strokeWidth ?? 0) > 0;
  // A glyph with a real shape carries its path alongside the box it is
  // inscribed in - see glyphs.ts, which explains why the shape is additive
  // rather than a new subType.
  if (typeof element.pathD === "string" && element.pathD.length > 0) {
    const filled = !!element.fill && element.fill !== "transparent";
    return (
      `<path d="${element.pathD}" fill="${filled ? element.fill : "none"}" ` +
      (hasStroke2
        ? `stroke="${element.stroke}" stroke-width="${element.strokeWidth}" stroke-linejoin="round" `
        : "") +
      `opacity="${element.opacity ?? 1}" />`
    );
  }
  const hasStroke = !!element.stroke && element.stroke !== "none" && (element.strokeWidth ?? 0) > 0;
  const hasFill = !!element.fill && element.fill !== "transparent";

  // A fill-only sliver, drawn as a centred line - see SvgOptions. Only
  // fill-only: a stroked box is already a stroke and scales as one.
  const scale = options.hairlineScale;
  const w = Number(element.width ?? 0);
  const h = Number(element.height ?? 0);
  if (scale && hasFill && !hasStroke && Math.min(w, h) * scale < 1) {
    const horizontal = h <= w;
    const cx = Number(element.x ?? 0) + (horizontal ? 0 : w / 2);
    const cy = Number(element.y ?? 0) + (horizontal ? h / 2 : 0);
    // What this rule WOULD be on screen, in CSS px. The page turns it into
    // a width and an ink level once it knows the pixel ratio.
    const trueCssPx = Math.min(w, h) * scale;
    return (
      `<line class="hair" style="--t:${trueCssPx.toFixed(4)}" ` +
      `x1="${cx}" y1="${cy}" ` +
      `x2="${horizontal ? cx + w : cx}" y2="${horizontal ? cy : cy + h}" ` +
      `stroke="${element.fill}" vector-effect="non-scaling-stroke" ` +
      `opacity="${element.opacity ?? 1}" />`
    );
  }

  const radius =
    typeof element.cornerRadius === "number" && element.cornerRadius > 0
      ? ` rx="${element.cornerRadius}"`
      : "";
  return (
    `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}"${radius} ` +
    `fill="${hasFill ? element.fill : "none"}" ` +
    (hasStroke ? `stroke="${element.stroke}" stroke-width="${element.strokeWidth}" ` : "") +
    `opacity="${element.opacity ?? 1}" />`
  );
}

export function flatten(elements: RenderedPolotnoElement[]): RenderedPolotnoElement[] {
  return elements.flatMap((e) => (e.type === "group" ? flatten(e.children ?? []) : [e]));
}

/**
 * The page's actual dot lattice, to be drawn UNDER everything.
 *
 * This is the pitch rule made legible: a rule that misses these dots is a
 * rule off the pitch, and there is no arguing with the picture.
 *
 * Drawn as ONE rect filled with a repeating pattern, not as 925 circles.
 * The single-page sheet emitted them individually and it cost nothing; at
 * twenty-four pages that is 22,000 circles before a single module is
 * drawn, and Chrome quietly stopped painting the later pages - a blank
 * proof sheet, which is the one failure mode a proof sheet must not have.
 *
 * Emit latticePattern() once per document, in defs.
 */
export const LATTICE_PATTERN_ID = "lattice-dots";

export function latticePattern(page: PageGrid = PROOF_PAGE): string {
  const pitch = cellHeightPx(page);
  // The tile carries its dot at the CENTRE and is then offset by half a
  // pitch, so the dots land exactly on marginPx + n*pitch rather than at
  // the tile's own corner, where a circle would be clipped to a quarter.
  return (
    `<pattern id="${LATTICE_PATTERN_ID}" width="${pitch}" height="${pitch}" ` +
    `patternUnits="userSpaceOnUse" ` +
    `patternTransform="translate(${page.marginPx - pitch / 2} ${page.marginPx - pitch / 2})">` +
    `<circle cx="${pitch / 2}" cy="${pitch / 2}" r="2.2" fill="#b9b2a6" />` +
    `</pattern>`
  );
}

export function latticeDots(page: PageGrid = PROOF_PAGE): string {
  const pitch = cellHeightPx(page);
  return (
    `<rect x="${page.marginPx - 1}" y="${page.marginPx - 1}" ` +
    `width="${page.gridColumns * pitch + 2}" height="${page.gridRows * pitch + 2}" ` +
    `fill="url(#${LATTICE_PATTERN_ID})" />`
  );
}

/**
 * The two faces a planner can be set in, and a control to switch a proof
 * sheet between them - Page Settings offers the same choice, and a proof
 * that can only show one of them only proves half of what ships.
 *
 * It works because a CSS rule BEATS a presentation attribute. toSvg
 * writes font-family onto every text node, and `svg text {...}` overrides
 * it, so nothing has to be re-rendered to change face - which matters on
 * a sheet carrying five hundred drawings.
 */
export const PROOF_FONT_LINK =
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?` +
  `family=Newsreader:opsz,wght@6..72,400&family=Hanken+Grotesk:wght@400;600&display=swap">`;

export const PROOF_FONT_STYLE =
  `:root{--proof-font:"Newsreader"}` +
  `body.sans{--proof-font:"Hanken Grotesk"}` +
  `svg text{font-family:var(--proof-font),Georgia,serif}` +
  `.fontswitch{position:sticky;top:0;z-index:5;display:flex;gap:6px;align-items:center;` +
  `padding:8px 0 10px;background:#2b2b2b}` +
  `.fontswitch button{font:600 11px ui-monospace,monospace;letter-spacing:.4px;` +
  `padding:5px 12px;border-radius:5px;border:1px solid #4a4a4a;background:#242424;` +
  `color:#9a948a;cursor:pointer}` +
  `.fontswitch button[aria-pressed="true"]{background:#e8d9b0;color:#2b2b2b;` +
  `border-color:#e8d9b0}`;

/** The control. Sets the class and the pressed state, nothing else. */
export const PROOF_FONT_SWITCH =
  `<div class="fontswitch"><span style="color:#6b6b6b">FONT</span>` +
  `<button type="button" data-font="serif" aria-pressed="true">Newsreader</button>` +
  `<button type="button" data-font="sans" aria-pressed="false">Hanken Grotesk</button>` +
  `</div>` +
  `<script>document.querySelectorAll(".fontswitch button").forEach(function(b){` +
  `b.addEventListener("click",function(){var sans=b.dataset.font==="sans";` +
  `document.body.classList.toggle("sans",sans);` +
  `document.querySelectorAll(".fontswitch button").forEach(function(o){` +
  `o.setAttribute("aria-pressed",String((o.dataset.font==="sans")===sans));});});});` +
  `</script>`;
