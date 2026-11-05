// A CLIENT PRINTS THEIR OWN BOOK (2026-11-05: "theyll get a link and be able
// to print it from there as an option"): GET /c/<token>/print -> their whole
// journal as the print-ready PDF, the very file their coach's "Download as
// PDF" makes (app/export) - the same book, the same drawing.
//
// The link is the key, as it is for their page: a link turned off, an
// archived client, or a coach who has not switched printing on (Settings,
// Business.clientsMayPrint) gets nothing. A client's journal carries none of
// the coach's calendars (eventsForJournal), so neither does this.
//
// Making a book's PDF is heavy, so a link gets a few a minute: kept per
// server instance, enough against a button pressed over and over.

import { clientForToken } from "@/lib/clientPortal";
import { prisma } from "@/lib/prisma";
import { WITH_PAGES } from "@/app/planner/bookSeeding";
import { printableEvents } from "@/app/planner/calendarStore";
import { generateBook } from "@/lib/generateBook";
import { buildPlannerPdf, pdfFilename } from "@/lib/plannerPdf";
import { resolveFontFamily, type PlannerTheme } from "@/lib/theme";

// jsPDF and the font read want Node, as app/export does.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_MINUTE = 3;
const recent = new Map<string, number[]>();

const said = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = await clientForToken(token);
  // one answer for every way in that is not open, as their page's notFound
  if (!client || !client.business.clientsMayPrint || !client.plannerId) return said("Not found.", 404);

  const now = Date.now();
  const lately = (recent.get(client.id) ?? []).filter((t) => now - t < 60_000);
  if (lately.length >= PER_MINUTE) return said("That's a few downloads already. Try again in a minute.", 429);
  recent.set(client.id, [...lately, now]);

  try {
    const planner = await prisma.planner.findUnique({ where: { id: client.plannerId }, include: WITH_PAGES });
    if (!planner) return said("Not found.", 404);
    const theme = planner.theme as PlannerTheme | null;
    const book = generateBook({ ...planner, ...(await printableEvents(planner.ownerId, planner.id)) }, resolveFontFamily(theme?.fontFamily));
    if (book.pages.length === 0) return said("Your journal has no pages to print yet.", 409);
    const built = buildPlannerPdf(book.pages);
    return new Response(built.bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(built.bytes.byteLength),
        "Content-Disposition": `attachment; filename="${pdfFilename(planner.title)}"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    // said, never a half-drawn file with a 200 on it (as app/export)
    console.error("A client's PDF failed", error);
    return said("Your journal could not be made into a PDF just now. Try again in a little while.", 500);
  }
}
