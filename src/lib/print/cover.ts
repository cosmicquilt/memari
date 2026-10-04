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
// A first cover, plain on purpose: the journal's name and its dates on the
// front, the name up the spine where there is room for it, the studio's
// address small on the back - in the planner's own face on the landing
// page's cream. Designing covers is its own piece of work.

import { jsPDF } from "jspdf";
import { installFont } from "@/lib/pdfDocument";
import { FONT_FAMILY, plannerFontBase64 } from "@/lib/plannerPdf";

const PT_PER_IN = 72;
const CREAM: [number, number, number] = [0xf5, 0xea, 0xd5];
const INK: [number, number, number] = [0x23, 0x1f, 0x20];

export type CoverInput = {
  widthPt: number;
  heightPt: number;
  /** The book's trim, in inches - 7 x 10. */
  trimWidthIn: number;
  trimHeightIn: number;
  title: string;
  /** "4 Jan - 3 Apr 2027", or "" for an undated book. */
  dates: string;
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
  const layout = coverLayout(input);
  const doc = new jsPDF({ unit: "pt", format: [input.widthPt, input.heightPt], orientation: input.widthPt > input.heightPt ? "landscape" : "portrait", compress: true });
  const font = installFont(doc, FONT_FAMILY, plannerFontBase64());
  doc.setFont(font.name, font.style);

  // Cream to the edge of the bleed.
  doc.setFillColor(...CREAM);
  doc.rect(0, 0, input.widthPt, input.heightPt, "F");
  doc.setTextColor(...INK);

  const trimTop = layout.outerPt;
  const trimH = input.trimHeightIn * PT_PER_IN;
  const trimW = input.trimWidthIn * PT_PER_IN;
  const safe = 0.5 * PT_PER_IN;
  const title = input.title.trim() || "Journal";

  // FRONT: the name a third of the way down, its dates under it, a hairline
  // between - set to fit the panel inside its safety margin.
  let titleSize = 30;
  doc.setFontSize(titleSize);
  while (titleSize > 14 && doc.getTextWidth(title) > trimW - safe * 2) {
    titleSize -= 1;
    doc.setFontSize(titleSize);
  }
  const titleY = trimTop + trimH * 0.34;
  doc.text(title, layout.frontCentreX, titleY, { align: "center", baseline: "alphabetic" });
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(layout.frontCentreX - 36, titleY + 16, layout.frontCentreX + 36, titleY + 16);
  if (input.dates) {
    doc.setFontSize(11);
    doc.text(input.dates, layout.frontCentreX, titleY + 36, { align: "center", baseline: "alphabetic" });
  }

  // SPINE: the name, reading top to bottom, where the spine is wide enough.
  if (layout.spinePt >= SPINE_TEXT_MIN_PT) {
    const size = Math.min(11, layout.spinePt * 0.5);
    doc.setFontSize(size);
    let spineTitle = title;
    while (spineTitle.length > 1 && doc.getTextWidth(spineTitle) > trimH - safe * 2) spineTitle = spineTitle.slice(0, -1);
    // Turned a quarter clockwise, it reads down the spine as an English
    // spine does, the tops of its letters to the right - so the baseline
    // sits left of the spine's centre by half a capital. Placed from its
    // own start rather than with align: jsPDF does not centre rotated text.
    const width = doc.getTextWidth(spineTitle);
    doc.text(spineTitle, layout.spineCentreX - size * 0.35, trimTop + trimH / 2 - width / 2, { angle: -90 });
  }

  // BACK: the studio, small, near the foot.
  doc.setFontSize(8);
  doc.text("memari.studio", layout.backCentreX, trimTop + trimH - safe - 4, { align: "center", baseline: "alphabetic" });

  return { bytes: doc.output("arraybuffer"), layout, fontEmbedded: font.embedded };
}
