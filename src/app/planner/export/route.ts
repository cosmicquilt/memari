// The export route: GET /planner/export?planner=WEEK -> a real PDF.
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
import { getOrCreatePlanner, getOrCreateMonthPlanner } from "../actions";
import { loadPlannerPages } from "../loadPlannerPages";
import { buildPlannerPdf, pdfFilename, printReadinessProblems } from "@/lib/plannerPdf";
import { PLANNER_TRIMS, trimKeyForWidth } from "@/lib/planner-trims";

// jsPDF and the font read both want Node, not the edge runtime.
export const runtime = "nodejs";
// The file is a snapshot of whatever the editor holds right now. Anything
// cached here would hand someone yesterday's planner.
export const dynamic = "force-dynamic";

/**
 * Which cadences can be exported, and how each one is fetched.
 *
 * A map rather than a chain of `if (type === "WEEK")`, because this is the
 * kind of list that gets extended and not updated - the codebase has undone
 * that same defect in the zone logic and in the edit affordance. Partial on
 * purpose: BaseType already names QUARTER and YEAR, and neither has a
 * planner to load yet, so asking for one says so rather than exporting the
 * wrong planner's pages.
 */
const LOADERS = {
  WEEK: getOrCreatePlanner,
  MONTH: getOrCreateMonthPlanner,
} as const;

type ExportableType = keyof typeof LOADERS;

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
  const requested = (params.get("planner") ?? "WEEK").toUpperCase();
  // hasOwnProperty, not `in`: `in` walks the prototype chain, so a request
  // for ?planner=constructor would pass the guard and then be CALLED. The
  // uppercasing above happens to save it today, which is not a reason to
  // leave a query parameter reaching Object.prototype.
  if (!Object.prototype.hasOwnProperty.call(LOADERS, requested)) {
    return new Response(
      `Cannot export "${requested}". Exportable planners: ${Object.keys(LOADERS).join(", ")}.`,
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
  const baseType = requested as ExportableType;

  let built: ReturnType<typeof buildPlannerPdf>;
  let title: string;
  let loadedWidthPx: number;
  try {
    const planner = await LOADERS[baseType]();
    title = planner.title;
    const loaded = await loadPlannerPages(planner);
    loadedWidthPx = loaded.pages[0]?.pageGrid.widthPx ?? 0;
    built = buildPlannerPdf(loaded.pages);
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
