// A PHOTOGRAPHED COVER (2026-11-01): the covers on /covers, printed - "do 1",
// Andrew's go for making them orderable. Until now every book printed one of
// cover.ts's drawn styles (always the plain one: nothing chose another), and
// the 85 covers the site shows under "Choose what is on the outside." could
// not be had.
//
// The ground is the cover's own scan (make-cover-scans.mts: the 4K texture
// it was pictured with, lit, at 3600 pixels at most), the same picture
// across both boards:
//
//   THE FRONT, and the spine where there is one, from the scan as it is,
//   held to the sheet's outer edge;
//   THE BACK from the scan turned half a turn, held to the other edge - so
//   where the scan is too narrow for both boards the back's stretch of stone
//   is upside down and back to front, and reads as another piece of it.
//
// The seam between them falls on the fold between the back and the spine
// (a wrap), or between the two pages (wire-o's panels), where a change in
// the stone reads as an edge. Each part is scaled to cover its stretch and
// no more, and printed only at 250 pixels to the inch or better (the 300 of
// the print rule is met by 80 of the 85 scans on every binding; the three
// 2:1 scans and the night sky come out at 247-309, and a hardcover's wider
// board is refused where it falls under 250).
//
// On the front, what the carousel's picture shows (catalogue.ts): "m." a
// third of the way down, or in the bottom corner, or "memari." in full, in
// imprint or gold (coverMarks.generated.ts), sized and placed from the 73
// pictures (measured 2026-11-01: m. 0.132 of the front's width at 0.34
// down, the corner m. 0.076 at 0.876 across and 0.922 down, the wordmark
// 0.257 at 0.32 down); the dates in words at the foot on the right where
// the cover is a dated one; a coach's name, and logo, at the foot on the
// left. No title: his call on the mockups (2026-10-14, "i dont like the one
// that just says journal"). The spine carries the name where it is wide
// enough to read, the back the studio's address, as the drawn styles do.

import type { jsPDF } from "jspdf";
import { GState } from "jspdf";
import type { CoverFinish, CoverGoldTone, CoverMarkKind } from "@/app/covers/catalogue";
import { COVER_MARKS } from "./coverMarks.generated";
import type { CoverBrand, CoverLayout } from "./cover";
import { DATES_BASELINE, DATES_REF, DATES_REF_WIDTH, DATES_RIGHT, MARK_PLACES, NAME_PLACES, NAME_ROOM, NAME_SIZE, NAME_TRACK, type FrontMark } from "./coverFront";

const PT_PER_IN = 72;
type Rgb = [number, number, number];
const CREAM: Rgb = [0xf5, 0xea, 0xd5];

/** What a photographed cover prints: its scan, and on its front the
 *  journal's own choices (coverFront.ts) - or the cover as pictured. */
export type TextureCover = {
  id: string;
  /** where the mark is, or "none" for a front with no mark */
  kind: CoverMarkKind | "none";
  face: "sans" | "serif";
  finish: CoverFinish;
  tone: CoverGoldTone | null;
  dated: boolean;
  /** a name on the front, in spaced capitals; "" for none */
  name: string;
};

/** A scan's pixels (a JPEG, carried into the PDF as it is) and size. */
export type CoverScan = { data: Uint8Array; width: number; height: number };

/** The least a scan is printed at. */
export const MIN_COVER_PPI = 250;

/** The ink a gold mark and its words are printed in (coverMarks: the same). */
const GOLD: Record<NonNullable<TextureCover["tone"]>, Rgb> = { gold: [194, 160, 96], deep: [158, 122, 60], dark: [94, 69, 32] };
/** An imprint's words: black at this strength over the cover, so its grain
 *  shows through, a little stronger than the mark's 30% so small type reads. */
const IMPRINT_INK = 0.45;

// Measured off the carousel's pictures (fractions of the front): one set,
// shared with the covers page's preview (coverFront.ts).
export { MARK_PLACES } from "./coverFront";

/** Where the back's picture ends and the front's begins: the fold between
 *  the back and the spine, or the middle of wire-o's two pages. */
export function scanFold(layout: CoverLayout, widthPt: number, trimWidthIn: number, form: "wrap" | "panels"): number {
  return form === "panels" ? widthPt / 2 : layout.outerPt + trimWidthIn * PT_PER_IN;
}

export type ScanPlacement = { x: number; y: number; w: number; h: number; ppi: number };

/** The scan scaled to cover a stretch of the sheet, its full height and
 *  [x0, x1], held to one end of it: as small as covers it, so as sharp. */
export function placeScan(scan: { width: number; height: number }, x0: number, x1: number, heightPt: number, hold: "left" | "right"): ScanPlacement {
  const scale = Math.max(heightPt / scan.height, (x1 - x0) / scan.width);
  const w = scan.width * scale;
  const h = scan.height * scale;
  return { x: hold === "right" ? x1 - w : x0, y: (heightPt - h) / 2, w, h, ppi: PT_PER_IN / scale };
}

/** Both boards' pictures on a sheet, and the sharpness of the softer. */
export function scanPlacements(scan: { width: number; height: number }, sheet: { widthPt: number; heightPt: number; trimWidthIn: number }, layout: CoverLayout, form: "wrap" | "panels") {
  const fold = scanFold(layout, sheet.widthPt, sheet.trimWidthIn, form);
  const front = placeScan(scan, fold, sheet.widthPt, sheet.heightPt, "right");
  const back = placeScan(scan, 0, fold, sheet.heightPt, "left");
  return { fold, front, back, ppi: Math.min(front.ppi, back.ppi) };
}

/** The sharpness a scan would print at, before the printer has measured the
 *  sheet: a binding's sheet from the trim and the page count (a wire-o page
 *  is the trim with 3mm all round; a paperback's spine a 60# page in 444; a
 *  hardcover's boards wrapped 0.75in and its spine a little wider). */
export function estimatedScanPpi(scan: { width: number; height: number }, cover: { form: "wrap" | "panels"; hardcover: boolean }, trim: { widthIn: number; heightIn: number }, pageCount: number): number {
  if (cover.form === "panels") {
    const bleed = 3 / 25.4;
    const page = { w: (trim.widthIn + 2 * bleed) * PT_PER_IN, h: (trim.heightIn + 2 * bleed) * PT_PER_IN };
    return placeScan(scan, 0, page.w, page.h, "right").ppi;
  }
  const outer = (cover.hardcover ? 0.75 : 0.125) * PT_PER_IN;
  const spine = (pageCount / 444 + (cover.hardcover ? 0.25 : 0)) * PT_PER_IN;
  const heightPt = trim.heightIn * PT_PER_IN + outer * 2;
  const widthPt = 2 * (trim.widthIn * PT_PER_IN + outer) + spine;
  const layout: CoverLayout = { outerPt: outer, spinePt: spine, frontCentreX: 0, backCentreX: 0, spineCentreX: 0 };
  return scanPlacements(scan, { widthPt, heightPt, trimWidthIn: trim.widthIn }, layout, "wrap").ppi;
}

/** A cover sheet's scan prints too soft. */
export class CoverTooSoftError extends Error {}

/** The front's mark as the covers page names it. */
function frontMark(cover: TextureCover): FrontMark {
  if (cover.kind === "none") return "none";
  if (cover.kind === "wordmark") return cover.face === "serif" ? "wordmark-serif" : "wordmark-sans";
  return cover.kind;
}

/** The mark's picture for a cover: its shape and finish. */
export function markKey(cover: TextureCover & { kind: CoverMarkKind }): string {
  const shape = cover.kind === "wordmark" ? `memari-${cover.face}` : "m-sans";
  return `${shape}/${cover.finish === "imprint" ? "imprint" : (cover.tone ?? "gold")}`;
}

const markBytes = new Map<string, Uint8Array>();
function markPng(key: string): Uint8Array {
  let bytes = markBytes.get(key);
  if (!bytes) {
    const mark = COVER_MARKS[key];
    if (!mark) throw new Error(`No picture of the mark ${key}.`);
    bytes = new Uint8Array(Buffer.from(mark.png, "base64"));
    markBytes.set(key, bytes);
  }
  return bytes;
}

/** Where the mark goes on the front, kept inside the binding's safety
 *  margin (the corner m. sits within a hair of wire-o's 15mm). */
export function markBox(cover: TextureCover & { kind: CoverMarkKind }, front: { left: number; top: number; width: number; height: number }, safe: number): { x: number; y: number; w: number; h: number } {
  const place = MARK_PLACES[cover.kind];
  const mark = COVER_MARKS[markKey(cover)];
  const w = place.width * front.width;
  const h = (w * mark.height) / mark.width;
  let x = front.left + place.x * front.width - w / 2;
  let y = front.top + place.y * front.height - h / 2;
  x = Math.min(Math.max(x, front.left + safe), front.left + front.width - safe - w);
  y = Math.min(Math.max(y, front.top + safe), front.top + front.height - safe - h);
  return { x, y, w, h };
}

export type TexturedCoverInput = {
  widthPt: number;
  heightPt: number;
  trimWidthIn: number;
  trimHeightIn: number;
  title: string;
  /** The book's dates in words for this cover, "4 January to 3 April
   *  2027", or "" where the book or the cover has none. */
  datesWords: string;
  safeIn?: number;
  brand?: CoverBrand | null;
};

/** The whole sheet of a photographed cover, at its own size; `spineText` off
 *  where there is no spine to read. Returns the scan's sharpness. */
export function drawTexturedCover(
  doc: jsPDF,
  input: TexturedCoverInput,
  layout: CoverLayout,
  form: "wrap" | "panels",
  spineText: boolean,
  cover: TextureCover,
  scan: CoverScan
): { ppi: number } {
  const W = input.widthPt;
  const H = input.heightPt;
  const trimW = input.trimWidthIn * PT_PER_IN;
  const trimH = input.trimHeightIn * PT_PER_IN;
  const trimTop = layout.outerPt;
  const frontLeft = W - layout.outerPt - trimW;
  const safe = (input.safeIn ?? 0.5) * PT_PER_IN;
  const placed = scanPlacements(scan, input, layout, form);
  if (placed.ppi < MIN_COVER_PPI) throw new CoverTooSoftError(`The ${cover.id} cover would print at ${Math.round(placed.ppi)} ppi here, under ${MIN_COVER_PPI}.`);

  // THE GROUND: the front's stretch, then the back's, each clipped to its own
  // side of the fold; the scan is carried once and drawn twice.
  doc.saveGraphicsState();
  doc.rect(placed.fold, 0, W - placed.fold, H, null);
  doc.clip();
  doc.discardPath();
  doc.addImage(scan.data, "JPEG", placed.front.x, placed.front.y, placed.front.w, placed.front.h, `scan-${cover.id}`, "NONE");
  doc.restoreGraphicsState();
  doc.saveGraphicsState();
  doc.rect(0, 0, placed.fold, H, null);
  doc.clip();
  doc.discardPath();
  // half a turn about the picture's own middle, which is the sheet's middle
  // height, so the same in the page's coordinates as in PDF's
  const cx = placed.back.x + placed.back.w / 2;
  doc.setCurrentTransformationMatrix(doc.Matrix(-1, 0, 0, -1, 2 * cx, H));
  doc.addImage(scan.data, "JPEG", placed.back.x, placed.back.y, placed.back.w, placed.back.h, `scan-${cover.id}`, "NONE");
  doc.restoreGraphicsState();

  // THE MARK, unless the front has none (2026-11-05)
  if (cover.kind !== "none") {
    const marked = { ...cover, kind: cover.kind };
    const key = markKey(marked);
    const box = markBox(marked, { left: frontLeft, top: trimTop, width: trimW, height: trimH }, safe);
    doc.addImage(markPng(key), "PNG", box.x, box.y, box.w, box.h, `mark-${key}`, "MEDIUM");
  }

  // Words in the cover's finish: gold ink, or black faintly over the grain.
  const ink = (draw: () => void) => {
    doc.saveGraphicsState();
    if (cover.finish === "imprint") {
      doc.setGState(new GState({ opacity: IMPRINT_INK }));
      doc.setTextColor(0, 0, 0);
    } else doc.setTextColor(...GOLD[cover.tone ?? "gold"]);
    draw();
    doc.restoreGraphicsState();
  };
  const frontRight = frontLeft + trimW;
  const footBaseline = Math.min(trimTop + DATES_BASELINE * trimH, trimTop + trimH - safe - 3);

  // THE NAME, where one is given (2026-11-05: "as well as the persons
  // name"): spaced capitals centred under the mark, or in the mark's place a
  // third of the way down when the mark is in the corner or off - the places
  // the covers page draws (coverFront.ts) - made smaller rather than running
  // past most of the front's width
  const name = cover.name.trim().toUpperCase();
  if (name) {
    let size = NAME_SIZE * trimW;
    doc.setFontSize(size);
    const width = () => doc.getTextWidth(name) + NAME_TRACK * size * Math.max(0, name.length - 1);
    while (size > 6 && width() > NAME_ROOM * trimW) doc.setFontSize((size -= 0.25));
    // the capitals' middle on the place: Newsreader's capital is 0.67em tall
    const baseline = trimTop + NAME_PLACES[frontMark(cover)] * trimH + 0.335 * size;
    const left = frontLeft + trimW / 2 - width() / 2;
    ink(() => {
      doc.setCharSpace(NAME_TRACK * size);
      doc.text(name, left, baseline, { baseline: "alphabetic" });
      doc.setCharSpace(0);
    });
  }

  // THE DATES, at the foot on the right, in the size the carousel set them
  if (cover.dated && input.datesWords) {
    doc.setFontSize(10);
    let size = (10 * DATES_REF_WIDTH * trimW) / doc.getTextWidth(DATES_REF);
    doc.setFontSize(size);
    const right = frontRight - Math.max(DATES_RIGHT * trimW, safe);
    const room = trimW * 0.5;
    while (size > 7 && doc.getTextWidth(input.datesWords) > room) doc.setFontSize((size -= 0.5));
    const width = doc.getTextWidth(input.datesWords);
    ink(() => doc.text(input.datesWords, right - width, footBaseline, { baseline: "alphabetic" }));
  }

  // THE COACH, at the foot on the left: their name in small spaced
  // capitals, their logo over it on a cream card so a dark logo shows.
  const brand = input.brand?.name.trim() ? input.brand : null;
  if (brand) {
    const left = frontLeft + Math.max(DATES_RIGHT * trimW, safe);
    const room = trimW * 0.4;
    const name = brand.name.toUpperCase();
    const space = 1.2;
    let size = 9;
    doc.setFontSize(size);
    const width = () => doc.getTextWidth(name) + space * Math.max(0, name.length - 1);
    while (size > 6 && width() > room) doc.setFontSize(--size);
    ink(() => {
      doc.setCharSpace(space);
      doc.text(name, left, footBaseline, { baseline: "alphabetic" });
      doc.setCharSpace(0);
    });
    if (brand.logo) {
      let logo: { w: number; h: number } | null = null;
      try {
        const pixels = doc.getImageProperties(brand.logo.data);
        // the drawn styles' rule (cover.ts logoBox): never under 300 ppi
        let h = Math.min(0.55 * PT_PER_IN, (pixels.height / 300) * PT_PER_IN);
        let w = (h * pixels.width) / pixels.height;
        if (w > room) {
          w = room;
          h = (w * pixels.height) / pixels.width;
        }
        logo = h >= 0.15 * PT_PER_IN ? { w, h } : null;
      } catch {
        logo = null;
      }
      if (logo) {
        const y = footBaseline - size - 14 - logo.h;
        doc.setFillColor(...CREAM);
        doc.roundedRect(left - 6, y - 6, logo.w + 12, logo.h + 12, 4, 4, "F");
        try {
          doc.addImage(brand.logo.data, brand.logo.format, left, y, logo.w, logo.h, undefined, "SLOW");
        } catch {
          // a logo jsPDF cannot read is left off; the name has printed
        }
      }
    }
  }

  // THE SPINE: the name, reading down, where it is wide enough to read
  if (spineText && layout.spinePt >= 0.25 * PT_PER_IN) {
    const title = input.title.trim() || "Journal";
    const size = Math.min(11, layout.spinePt * 0.5);
    doc.setFontSize(size);
    let spineTitle = title;
    while (spineTitle.length > 1 && doc.getTextWidth(spineTitle) > trimH - safe * 2) spineTitle = spineTitle.slice(0, -1);
    const width = doc.getTextWidth(spineTitle);
    ink(() => doc.text(spineTitle, layout.spineCentreX - size * 0.35, trimTop + trimH / 2 - width / 2, { angle: -90 }));
  }

  // THE BACK: the coach's name, then the studio, small, near the foot
  const backX = layout.backCentreX;
  ink(() => {
    if (brand) {
      doc.setFontSize(10);
      let backName = brand.name;
      while (backName.length > 1 && doc.getTextWidth(backName) > trimW - safe * 2.4) backName = backName.slice(0, -1);
      doc.text(backName, backX, trimTop + trimH - safe - 4 - 16, { align: "center", baseline: "alphabetic" });
    }
    doc.setFontSize(8);
    doc.text("memari.studio", backX, trimTop + trimH - safe - 4, { align: "center", baseline: "alphabetic" });
  });
  return { ppi: placed.ppi };
}
