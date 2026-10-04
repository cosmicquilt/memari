// THE COVER: back, spine and front in one sheet, as Lulu prints it.
//
// Lulu gives the sheet's size for the binding and page count (lulu.ts,
// coverDimensions) - the spine is the paper's thickness, and a hardcover
// wraps its boards - so the layout is worked out from that size and the
// trim, never from a guessed spine:
//
//   outer = (sheet height - trim height) / 2    the bleed, or a hardcover's wrap
//   back  = outer .. outer + trim width
//   front = sheet width - outer - trim width .. sheet width - outer
//   spine = what is left between them (none on a coil book)
//
// FIVE STYLES (2026-10-04), drawn by this code for Andrew to choose from -
// the planner's own vocabulary on the outside:
//   plain    cream, the name a third of the way down, its dates under a rule
//   lattice  the quarter-inch dot lattice across the whole wrap, the name on
//            a label, the way a module's heading sits on the page
//   framed   a hairline frame on the front with a heading band - a module
//   ink      near-black, the type in cream
//   quarter  cream, an ink band round the spine like a cloth-spined book
// The name runs up the spine where the spine is wide enough to read; the
// studio's address is small on the back.

import { jsPDF } from "jspdf";
import { installFont } from "@/lib/pdfDocument";
import { FONT_FAMILY, plannerFontBase64 } from "@/lib/plannerPdf";

const PT_PER_IN = 72;
type Rgb = [number, number, number];
const CREAM: Rgb = [0xf5, 0xea, 0xd5];
const INK: Rgb = [0x23, 0x1f, 0x20];

export type CoverStyle = "plain" | "lattice" | "framed" | "ink" | "quarter";
export const COVER_STYLES: readonly CoverStyle[] = ["plain", "lattice", "framed", "ink", "quarter"];

export type CoverInput = {
  widthPt: number;
  heightPt: number;
  /** The book's trim, in inches - 7 x 10. */
  trimWidthIn: number;
  trimHeightIn: number;
  title: string;
  /** "4 Jan - 3 Apr 2027", or "" for an undated book. */
  dates: string;
  style?: CoverStyle;
};

export type CoverLayout = {
  outerPt: number;
  spinePt: number;
  frontCentreX: number;
  backCentreX: number;
  spineCentreX: number;
};

/** Where the panels are on a sheet of this size. */
export function coverLayout(input: Pick<CoverInput, "widthPt" | "heightPt" | "trimWidthIn" | "trimHeightIn">): CoverLayout {
  const trimW = input.trimWidthIn * PT_PER_IN;
  const trimH = input.trimHeightIn * PT_PER_IN;
  const outerPt = Math.max(0, (input.heightPt - trimH) / 2);
  const spinePt = Math.max(0, input.widthPt - 2 * outerPt - 2 * trimW);
  return {
    outerPt,
    spinePt,
    backCentreX: outerPt + trimW / 2,
    frontCentreX: input.widthPt - outerPt - trimW / 2,
    spineCentreX: outerPt + trimW + spinePt / 2,
  };
}

/** The spine carries the title only where it is wide enough to read: a
 *  quarter of an inch, about 70 pages of 60# paper. */
const SPINE_TEXT_MIN_PT = 0.25 * PT_PER_IN;

export function buildCoverPdf(input: CoverInput): { bytes: ArrayBuffer; layout: CoverLayout; fontEmbedded: boolean } {
  const style = input.style ?? "plain";
  const layout = coverLayout(input);
  const doc = new jsPDF({ unit: "pt", format: [input.widthPt, input.heightPt], orientation: input.widthPt > input.heightPt ? "landscape" : "portrait", compress: true });
  const font = installFont(doc, FONT_FAMILY, plannerFontBase64());
  doc.setFont(font.name, font.style);

  const W = input.widthPt;
  const H = input.heightPt;
  const trimTop = layout.outerPt;
  const trimH = input.trimHeightIn * PT_PER_IN;
  const trimW = input.trimWidthIn * PT_PER_IN;
  const safe = 0.5 * PT_PER_IN;
  const frontLeft = W - layout.outerPt - trimW;
  const title = input.title.trim() || "Journal";
  const paper = style === "ink" ? INK : CREAM;
  const type = style === "ink" ? CREAM : INK;

  // The ground, to the edge of the bleed.
  doc.setFillColor(...paper);
  doc.rect(0, 0, W, H, "F");

  if (style === "lattice") {
    // The page's own quarter-inch lattice, lined up with the front's trim so
    // the front reads as a page of the journal. Light, as on the page.
    const pitch = 0.25 * PT_PER_IN;
    doc.setFillColor(0xb8, 0xae, 0x9c);
    const startX = frontLeft - Math.floor(frontLeft / pitch) * pitch;
    const startY = trimTop - Math.floor(trimTop / pitch) * pitch;
    for (let x = startX; x <= W; x += pitch) {
      for (let y = startY; y <= H; y += pitch) doc.circle(x, y, 0.55, "F");
    }
  }
  if (style === "quarter") {
    // An ink band round the spine, three quarters of an inch onto each board;
    // on a coil book, the binding edge of each.
    const reach = 0.75 * PT_PER_IN;
    doc.setFillColor(...INK);
    if (layout.spinePt > 0) doc.rect(layout.outerPt + trimW - reach, 0, layout.spinePt + reach * 2, H, "F");
    else {
      doc.rect(frontLeft - layout.outerPt, 0, reach + layout.outerPt, H, "F");
      doc.rect(layout.outerPt + trimW - reach, 0, reach + layout.outerPt, H, "F");
    }
  }

  // THE FRONT: the name, sized to fit inside the safety margin.
  const room = style === "quarter" ? trimW - 0.75 * PT_PER_IN - safe * 2 : trimW - safe * 2.4;
  const centreX = style === "quarter" ? frontLeft + 0.75 * PT_PER_IN + (trimW - 0.75 * PT_PER_IN) / 2 : layout.frontCentreX;
  let titleSize = style === "framed" ? 22 : 30;
  doc.setFontSize(titleSize);
  while (titleSize > 12 && doc.getTextWidth(style === "framed" ? title.toUpperCase() : title) > room) {
    titleSize -= 1;
    doc.setFontSize(titleSize);
  }
  doc.setTextColor(...type);
  doc.setDrawColor(...type);

  if (style === "framed") {
    // A module on the front: a hairline frame half an inch in, a heading band
    // with the name in capitals, the dates small at its foot.
    const left = frontLeft + safe;
    const top = trimTop + safe;
    const width = trimW - safe * 2;
    const height = trimH - safe * 2;
    const band = Math.max(titleSize * 2.2, 0.75 * PT_PER_IN);
    doc.setLineWidth(0.75);
    doc.rect(left, top, width, height, "S");
    doc.setLineWidth(0.5);
    doc.line(left, top + band, left + width, top + band);
    doc.setFontSize(titleSize);
    doc.text(title.toUpperCase(), centreX, top + band / 2 + titleSize * 0.35, { align: "center", baseline: "alphabetic" });
    if (input.dates) {
      doc.setFontSize(10);
      doc.text(input.dates, centreX, top + height - 0.3 * PT_PER_IN, { align: "center", baseline: "alphabetic" });
    }
  } else {
    const titleY = trimTop + trimH * 0.34;
    if (style === "lattice") {
      // A label for the name, cream over the dots, outlined like a module.
      doc.setFontSize(titleSize);
      const labelW = Math.min(trimW - safe * 2, doc.getTextWidth(title) + 0.9 * PT_PER_IN);
      const labelH = titleSize * 1.6 + (input.dates ? 30 : 0);
      doc.setFillColor(...CREAM);
      doc.setLineWidth(0.75);
      doc.rect(centreX - labelW / 2, titleY - titleSize * 1.15, labelW, labelH, "FD");
    }
    doc.setFontSize(titleSize);
    doc.text(title, centreX, titleY, { align: "center", baseline: "alphabetic" });
    doc.setLineWidth(0.5);
    doc.line(centreX - 36, titleY + 16, centreX + 36, titleY + 16);
    if (input.dates) {
      doc.setFontSize(11);
      doc.text(input.dates, centreX, titleY + 36, { align: "center", baseline: "alphabetic" });
    }
  }

  // SPINE: the name, reading top to bottom, where the spine is wide enough.
  if (layout.spinePt >= SPINE_TEXT_MIN_PT) {
    const size = Math.min(11, layout.spinePt * 0.5);
    doc.setFontSize(size);
    // On the quarter style's band, the spine type is cream.
    doc.setTextColor(...(style === "quarter" ? CREAM : type));
    let spineTitle = title;
    while (spineTitle.length > 1 && doc.getTextWidth(spineTitle) > trimH - safe * 2) spineTitle = spineTitle.slice(0, -1);
    // Turned a quarter clockwise, it reads down the spine as an English
    // spine does, the tops of its letters to the right - so the baseline
    // sits left of the spine's centre by half a capital. Placed from its
    // own start rather than with align: jsPDF does not centre rotated text.
    const width = doc.getTextWidth(spineTitle);
    doc.text(spineTitle, layout.spineCentreX - size * 0.35, trimTop + trimH / 2 - width / 2, { angle: -90 });
    doc.setTextColor(...type);
  }

  // BACK: the studio, small, near the foot.
  doc.setFontSize(8);
  doc.text("memari.studio", style === "quarter" ? layout.backCentreX - 0.375 * PT_PER_IN : layout.backCentreX, trimTop + trimH - safe - 4, {
    align: "center",
    baseline: "alphabetic",
  });

  return { bytes: doc.output("arraybuffer"), layout, fontEmbedded: font.embedded };
}
