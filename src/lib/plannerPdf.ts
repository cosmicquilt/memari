// Assembling one planner into one PDF file.
//
// pdfDocument.ts knows how to draw a rect, a path and a line of text. This
// knows how to turn a LOADED PLANNER into a finished document: which font
// to install, how many pages, what came out the other end. It is the step
// between the two, and it exists so that there is exactly ONE of it.
//
// TWO CALLERS, ONE ASSEMBLY. `scripts/check-pdf.mts` verifies an export by
// reading the bytes back and counting the operators in them; the export
// route hands those same bytes to a person. If each built its own document,
// the check would be verifying a file nobody downloads. Everything specific
// to a document - page sizes, the font, the order of the pages - lives here,
// so the check's verdict is about the real artefact.
//
// Server-only: it reads a font off disk.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { jsPDF } from "jspdf";
import {
  createPdf,
  drawPage,
  installFont,
  emptyReport,
  pxToPt,
  type DrawReport,
  type PdfFont,
} from "./pdfDocument";
import type { PageGrid } from "./grid";
import type { RenderedPolotnoElement } from "./renderModuleInstance";
import { PLANNER_TRIMS, trimKeyForWidth } from "./planner-trims";

/**
 * The planner's own face.
 *
 * The variable font from google/fonts, which is what upstream ships - there
 * are no static instances in that repository. Committed rather than fetched
 * at build time so an export works offline and the file you proofed is the
 * file you send. Its SIL OFL licence sits beside it and must travel with it
 * wherever the font goes.
 */
export const FONT_FAMILY = "Newsreader";
export const FONT_PATH = "assets/fonts/Newsreader.ttf";

// Read once. It is 441KB on disk and about 588KB as base64, and a request
// that re-read and re-encoded it every time would spend more effort on the
// font than on the drawing. `undefined` means "looked and it was not there";
// `null` means "not looked yet", so a missing file is not re-statted on
// every export either.
let fontCache: string | null | undefined = null;

/**
 * The font file as base64, or undefined if it is not on disk.
 *
 * Resolved against cwd rather than import.meta.url because the two callers
 * run from different places - the script from the app root, the route from
 * inside .next - and cwd is the app root in both. In a traced production
 * build the file only exists because next.config.ts lists it under
 * outputFileTracingIncludes; nothing in a route's import graph mentions it,
 * so the tracer cannot find it on its own.
 */
export function plannerFontBase64(): string | undefined {
  if (fontCache !== null) return fontCache;
  const file = path.join(process.cwd(), FONT_PATH);
  fontCache = existsSync(file) ? readFileSync(file).toString("base64") : undefined;
  return fontCache;
}

/** The shape this needs from a loaded page - deliberately the smallest one.
 *  LoadedPage satisfies it, and so does anything else that can produce
 *  rendered elements for a page, which is what keeps the proof sheets and
 *  any future headless render from needing their own exporter. */
export type PdfPageInput = {
  pageGrid: PageGrid;
  moduleInstances: { elements: RenderedPolotnoElement[] }[];
};

export type PdfPageReport = {
  modules: number;
  elements: number;
  text: number;
  rects: number;
  paths: number;
};

/** What a page measures, in the two sizes that matter on paper. */
export type PdfPageSize = {
  /** The sheet in the file - trim plus bleed. This is the MediaBox. */
  sheetWidthPt: number;
  sheetHeightPt: number;
  /** The finished page, after the knife. This is the TrimBox. */
  trimWidthPt: number;
  trimHeightPt: number;
  bleedPt: number;
};

export type BuiltPdf = {
  /** The finished file. An ArrayBuffer rather than a Uint8Array because it
   *  is what jsPDF hands back and what `new Response(...)` takes directly,
   *  and a view over it would only have to be unwrapped again. */
  bytes: ArrayBuffer;
  /** Totals across the whole document. */
  report: DrawReport;
  /** Per page, in page order - what `check:pdf` prints a line for. */
  pages: PdfPageReport[];
  font: PdfFont;
  widthPt: number;
  heightPt: number;
  /** The first page's measurements, for a caller that wants to state them. */
  size: PdfPageSize;
};

/**
 * Tell the file where the knife goes.
 *
 * MEASURED FIRST, and the measurement is the argument: across both planners,
 * every mark sits at least 0.52in inside the trim line. NOTHING BLEEDS. So
 * the quarter-inch a 7x10 sheet carries is not ink that runs off the edge -
 * it is an instruction, and until now the instruction appeared nowhere in
 * the file. A printer handed a 7.25 x 10.25 page with only a MediaBox has to
 * infer that the extra is bleed, centre it, and cut; infer differently -
 * scale it to fit 7x10, say - and every measurement in the book is out by
 * 3.4% with nothing to catch it.
 *
 *   MediaBox  the sheet, as exported            (jsPDF writes this already)
 *   TrimBox   the finished page, inset by bleed
 *   BleedBox  how far ink may run past trim = the sheet, since that is all
 *             the room there is
 *
 * Letter has bleedPx 0, so all three coincide and the file says so rather
 * than staying silent - a home printer needs no trim box, but a reader that
 * looks for one should find the right answer, not nothing.
 *
 * Which trim a page is on is recovered from its own width by
 * trimKeyForWidth, the same helper the editor's trim switcher uses. A
 * PageGrid does not carry the bleed, and giving it one would mean the sheet
 * size being described in two places.
 */
function declarePageBoxes(doc: jsPDF, pageNumber: number, page: PageGrid): PdfPageSize {
  const bleedPt = pxToPt(PLANNER_TRIMS[trimKeyForWidth(page.widthPx)].bleedPx);
  const sheetWidthPt = pxToPt(page.widthPx);
  const sheetHeightPt = pxToPt(page.heightPx);
  const box = {
    bottomLeftX: bleedPt,
    bottomLeftY: bleedPt,
    topRightX: sheetWidthPt - bleedPt,
    topRightY: sheetHeightPt - bleedPt,
  };
  const sheet = {
    bottomLeftX: 0,
    bottomLeftY: 0,
    topRightX: sheetWidthPt,
    topRightY: sheetHeightPt,
  };
  // pageContext is jsPDF's own per-page dictionary; putPage emits any of
  // these boxes that is not null. There is no public setter for them.
  const context = doc.getPageInfo(pageNumber).pageContext as {
    trimBox: typeof box | null;
    bleedBox: typeof sheet | null;
  };
  context.trimBox = box;
  context.bleedBox = sheet;
  return {
    sheetWidthPt,
    sheetHeightPt,
    trimWidthPt: sheetWidthPt - bleedPt * 2,
    trimHeightPt: sheetHeightPt - bleedPt * 2,
    bleedPt,
  };
}

/**
 * Every page of a planner, drawn into one document.
 *
 * The document is created at the FIRST page's size and every page after it
 * is added at its own, rather than assuming a spread is uniform: the trim is
 * a planner-level setting today (see planner-trims.ts), but a page carries
 * its own width and height, and taking the first one as gospel is exactly
 * the kind of restated geometry this pipeline exists to avoid.
 */
export function buildPlannerPdf(pageInputs: PdfPageInput[]): BuiltPdf {
  if (pageInputs.length === 0) {
    throw new Error("Nothing to export: this planner has no pages.");
  }

  const doc = createPdf(pageInputs[0].pageGrid);
  const font = installFont(doc, FONT_FAMILY, plannerFontBase64());
  const report = emptyReport();
  const pages: PdfPageReport[] = [];
  const sizes: PdfPageSize[] = [];

  pageInputs.forEach((page, index) => {
    if (index > 0) {
      doc.addPage([pxToPt(page.pageGrid.widthPx), pxToPt(page.pageGrid.heightPx)]);
    }
    // Every page, not just the first: pages carry their own size, and a
    // trim box written once would be wrong for any page that differed.
    sizes.push(declarePageBoxes(doc, index + 1, page.pageGrid));
    const before = { ...report };
    for (const instance of page.moduleInstances) {
      drawPage(doc, instance.elements, font, report);
    }
    pages.push({
      modules: page.moduleInstances.length,
      elements: report.elements - before.elements,
      text: report.text - before.text,
      rects: report.rects - before.rects,
      paths: report.paths - before.paths,
    });
  });

  return {
    bytes: doc.output("arraybuffer"),
    report,
    pages,
    font,
    widthPt: pxToPt(pageInputs[0].pageGrid.widthPx),
    heightPt: pxToPt(pageInputs[0].pageGrid.heightPx),
    size: sizes[0],
  };
}

/** "7.000 x 10.000 in trim, 0.125in bleed" - one phrasing, so the script,
 *  the route and anything else describing an export agree. */
export function describePageSize(size: PdfPageSize): string {
  const inches = (pt: number) => (pt / 72).toFixed(3);
  const trim = `${inches(size.trimWidthPt)} x ${inches(size.trimHeightPt)} in trim`;
  if (size.bleedPt === 0) return `${trim}, no bleed`;
  return `${trim}, ${(size.bleedPt / 72).toFixed(3)}in bleed (sheet ${inches(
    size.sheetWidthPt
  )} x ${inches(size.sheetHeightPt)} in)`;
}

/**
 * Everything wrong with a finished document, in the order it matters.
 *
 * Shared so the script's exit code and the button's warning agree about
 * what "print-ready" means. An export is still HANDED OVER when this is
 * non-empty - a file with one substituted face is more use to someone than
 * no file - but it is never handed over silently.
 */
export function printReadinessProblems(built: BuiltPdf): string[] {
  const problems: string[] = [];
  if (built.report.skipped > 0) {
    problems.push(
      `${built.report.skipped} mark${built.report.skipped === 1 ? "" : "s"} could not be drawn`
    );
  }
  if (built.report.unsupportedPathCommands.length > 0) {
    problems.push(
      `unsupported path command${built.report.unsupportedPathCommands.length === 1 ? "" : "s"}: ` +
        built.report.unsupportedPathCommands.join(", ")
    );
  }
  if (!built.font.embedded) {
    problems.push(`set in ${built.font.name}, not ${FONT_FAMILY} - no font file at ${FONT_PATH}`);
  }
  return problems;
}

/**
 * A planner title as a filename someone can find again.
 *
 * Dated, because the point of the file is to be printed, and a drawer full
 * of `planner.pdf` is a drawer full of one file. ASCII-folded to what every
 * filesystem and every Content-Disposition parser agrees on, with a fallback
 * for a title that folds away to nothing.
 */
export function pdfFilename(title: string, when: Date = new Date()): string {
  // NFKD splits an accented letter into a plain one plus a combining mark;
  // dropping everything non-ASCII then leaves the plain letter, so "Année"
  // becomes "annee" rather than "ann-e". Done by code point rather than by
  // a character-class regex on purpose - the combining range written out
  // literally is invisible in source, and it attaches itself to whatever
  // character precedes it in most editors.
  const folded = [...title.normalize("NFKD")]
    .filter((ch) => (ch.codePointAt(0) ?? 0) < 128)
    .join("");
  const slug = folded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const date = [
    when.getFullYear(),
    String(when.getMonth() + 1).padStart(2, "0"),
    String(when.getDate()).padStart(2, "0"),
  ].join("-");
  return `${slug || "planner"}-${date}.pdf`;
}
