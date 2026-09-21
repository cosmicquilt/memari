// The export route: GET /planner/export -> the whole book, as a real PDF.
//
// THE BOOK BY DEFAULT, one spread with ?level=WEEKLY. The book is the
// product - a term's worth of pages generated from a handful of templates
// with the dates filled in - and a single spread is a proofing tool. The
// default should be the thing somebody wants.
//
// This is the end of the pipeline, and the first thing in it a person can
// reach. Everything before it - the renderers, loadPlannerPages,
// pdfDocument, plannerPdf - already existed and was verified by a script;
// what did not exist was any way to get a file without a terminal.
//
// A ROUTE, NOT A SERVER ACTION. An action returns a value to React, and a
// 300KB PDF would have to be base64'd through the RSC payload and turned
// back into a Blob in the browser. A GET route hands the bytes straight to
// the browser's own download machinery with a real Content-Type and
// filename, which is also what makes the URL shareable, bookmarkable and
// testable with curl.
//
// DRAWN ON THE SERVER, deliberately. The elements are shaped server-side
// already (loadPlannerPages), the font is a 441KB file on disk, and the
// whole point of the drawing is that print and screen come from the same
// description - so the export must not be a second render that happens to
// agree. Nothing about this page is recomputed here.

import { auth } from "@clerk/nextjs/server";
import { getOrCreateBook } from "@/app/planner/actions";
import { loadPlannerPages } from "@/app/planner/loadPlannerPages";
import { buildPlannerPdf, pdfFilename, printReadinessProblems } from "@/lib/plannerPdf";
import { generateBook } from "@/lib/generateBook";
import { resolveFontFamily, type PlannerTheme } from "@/lib/theme";
import { PLANNER_TRIMS, trimKeyForWidth } from "@/lib/planner-trims";
import { LEVELS_IN_BINDING_ORDER, LEVEL_LABELS, type PageLevel } from "@/lib/pageLevels";

// jsPDF and the font read both want Node, not the edge runtime.
export const runtime = "nodejs";
// The file is a snapshot of whatever the editor holds right now. Anything
// cached here would hand someone yesterday's planner.
export const dynamic = "force-dynamic";

// There is no loader map any more. There used to be one entry per planner
// type, because a week planner and a month planner were two unrelated rows;
// there is ONE book now and a level picks which of its spreads to export, so
// the list that used to get extended-and-not-updated has nothing left in it.

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    // Not a redirect: this URL is fetched by a button, and a 200 page of
    // sign-in HTML would be downloaded as a .pdf full of markup.
    return new Response("Sign in to export a planner.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const params = new URL(request.url).searchParams;
  // No ?level= means the whole book.
  const wholeBook = !params.has("level");
  const requested = (params.get("level") ?? "WEEKLY").toUpperCase();
  // Checked against the levels that exist, not cast: a mistyped parameter
  // should say so rather than quietly exporting a different spread.
  if (!LEVELS_IN_BINDING_ORDER.includes(requested as PageLevel)) {
    return new Response(
      `Cannot export "${requested}". Levels: ${LEVELS_IN_BINDING_ORDER.join(", ")}.`,
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
  const level = requested as PageLevel;

  let built: ReturnType<typeof buildPlannerPdf>;
  let title: string;
  let loadedWidthPx: number;
  let scope: string;
  try {
    const planner = await getOrCreateBook(level);
    if (wholeBook) {
      const theme = planner.theme as PlannerTheme | null;
      const book = generateBook(planner, resolveFontFamily(theme?.fontFamily));
      if (book.pages.length === 0) {
        // Said plainly, with the way out. An empty PDF would be worse: it
        // looks like the export failed rather than like the book has not
        // been told how long it is.
        return new Response(
          [
            "This book has no pages to print yet.",
            "",
            "Set its start and end dates under Page Settings > Term, and the weekly and " +
              "monthly spreads will be printed for every week and month they cover.",
            "",
            `To export just the spread you are looking at instead, add ?level=${level} to this URL.`,
          ].join("\n"),
          { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
      title = planner.title;
      scope = `whole book`;
      loadedWidthPx = book.pages[0].pageGrid.widthPx;
      built = buildPlannerPdf(book.pages);
    } else {
      title = `${planner.title} ${LEVEL_LABELS[level]}`;
      scope = LEVEL_LABELS[level];
      const loaded = await loadPlannerPages(planner, level);
      loadedWidthPx = loaded.pages[0]?.pageGrid.widthPx ?? 0;
      built = buildPlannerPdf(
        loaded.pages.map((page) => ({
          pageGrid: page.pageGrid,
          elements: page.moduleInstances.flatMap((instance) => instance.elements),
        }))
      );
    }
  } catch (error) {
    // A failed export is reported. The alternative - a zero-byte or
    // half-drawn PDF with a 200 on it - is the failure mode this whole
    // pipeline is built to avoid, because the person who finds it is
    // holding a misprinted book.
    console.error("PDF export failed", error);
    return new Response(
      `Could not build the PDF: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const problems = printReadinessProblems(built);
  const filename = pdfFilename(title);
  // `?view=1` opens it in a tab instead of downloading - useful for looking
  // at what you are about to send to a printer without filling a downloads
  // folder with near-identical proofs.
  const disposition = params.get("view") === "1" ? "inline" : "attachment";

  return new Response(built.bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(built.bytes.byteLength),
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "no-store",
      // What the drawing actually produced, so the caller can tell someone.
      // A header rather than a body field because the body is the PDF; a
      // fetch() can read this and a plain <a download> can ignore it.
      // Header values are latin-1, so anything outside ASCII is escaped
      // rather than risking a mangled or rejected header.
      "X-Export-Report": JSON.stringify({
        pages: built.pages.length,
        marks: built.report.elements,
        text: built.report.text,
        rects: built.report.rects,
        paths: built.report.paths,
        widthPt: Number(built.widthPt.toFixed(2)),
        heightPt: Number(built.heightPt.toFixed(2)),
        // The whole book, or which spread of it.
        level: scope,
        // The FINISHED size, not the sheet. Someone reading this wants to
        // know what comes back from the printer, and the sheet is a
        // quarter-inch larger on both axes because of the bleed. The label
        // is ASCII-folded by the escaper below - it contains a real x.
        trim: PLANNER_TRIMS[trimKeyForWidth(loadedWidthPx)].label,
        trimWidthIn: Number((built.size.trimWidthPt / 72).toFixed(3)),
        trimHeightIn: Number((built.size.trimHeightPt / 72).toFixed(3)),
        bleedIn: Number((built.size.bleedPt / 72).toFixed(3)),
        font: built.font.name,
        embedded: built.font.embedded,
        problems,
      }).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`),
    },
  });
}
