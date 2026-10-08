// GET /app/print-preview?journal=<id>&start=YYYY-MM-DD&days=N&binding=wireo|coil|paperback|hardcover&part=interior|cover
//
// THE BOOK BEFORE IT IS BOUGHT: the exact interior an order for these days
// and this binding would send to the printer - the pages for those dates,
// padded, with the binding's inside margin (printer.ts) - or its cover. The
// terms say "what you see is what we print"; this is where you see it.
//
// The cover's spine is the printer's own measure where its keys are set;
// otherwise an estimate from the page count (a 60# page is 1/444in), so the
// preview works before ordering is switched on. A wire-o cover is two pages,
// the front and the back, sized from the SKU alone. Only the journal's owner -
// signed in or a guest - can preview it.

import { currentOwnerId } from "@/lib/owner";
import { buildInterior, loadJournal, rangeLabel, trimInches, OrderError } from "@/lib/print/orderBook";
import { orderRange } from "@/lib/print/orderRange";
import { BINDINGS, type Binding } from "@/lib/print/products";
import { printerForBinding } from "@/lib/print/printer";
import { buildCoverPdf, COVER_STYLES, type CoverStyle } from "@/lib/print/cover";
import { pdfFilename } from "@/lib/plannerPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const say = (status: number, text: string) => new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(request: Request) {
  const ownerId = await currentOwnerId();
  if (!ownerId) return say(401, "Sign in to preview a book.");
  const params = new URL(request.url).searchParams;
  const binding = params.get("binding") as Binding;
  const part = params.get("part") === "cover" ? "cover" : "interior";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.get("start") ?? "");
  const days = Math.round(Number(params.get("days")));
  if (!BINDINGS.includes(binding) || !match || !(days >= 1)) return say(400, "Which days and binding? Preview from the order screen.");

  const journal = await loadJournal(ownerId, params.get("journal") ?? "");
  if (!journal) return say(404, "That journal could not be found.");
  const range = orderRange(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))), days);
  const printer = printerForBinding(binding);

  let interior;
  try {
    interior = buildInterior(journal, range, (pages) => printer.gutterInches(binding, pages));
  } catch (error) {
    if (error instanceof OrderError) return say(409, error.message);
    throw error;
  }
  const name = pdfFilename(`${journal.title} ${part === "cover" ? "cover" : "preview"}`);
  const headers = { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "private, no-store" };
  if (part === "interior") return new Response(new Uint8Array(interior.bytes), { headers });

  // The cover: the printer's measure where it can be asked, else an estimate.
  const trim = trimInches(interior.trim);
  const sku = printer.sku(binding, interior.trim);
  let size: { widthPt: number; heightPt: number } | null = null;
  if (sku && (printer.configured() || printer.coverForm === "panels")) {
    try {
      size = await printer.coverSize(sku, interior.pageCount);
    } catch {
      size = null;
    }
  }
  if (!size) {
    const bleed = 0.125 * 72;
    const spine = binding === "coil" || binding === "wireo" ? 0 : (interior.pageCount / 444) * 72;
    size = { widthPt: 2 * (trim.widthIn * 72 + bleed) + spine, heightPt: trim.heightIn * 72 + bleed * 2 };
  }
  const style = COVER_STYLES.includes(params.get("style") as CoverStyle) ? (params.get("style") as CoverStyle) : "plain";
  const cover = buildCoverPdf({
    ...size,
    form: printer.coverForm,
    trimWidthIn: trim.widthIn,
    trimHeightIn: trim.heightIn,
    title: journal.title,
    dates: journal.dated ? rangeLabel(range) : "",
    style,
  });
  return new Response(new Uint8Array(cover.bytes), { headers });
}
