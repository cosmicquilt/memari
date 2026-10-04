// GET /api/print-files/<order>/<interior|cover>.pdf?sig=... - an order's
// print-ready PDF, for Lulu to fetch when it prints the book. See
// src/lib/print/fileUrls.ts: the signature is the only key, so this route
// asks nobody to sign in.

import { prisma } from "@/lib/prisma";
import { PRINT_FILE_KINDS, verifyPrintFile, type PrintFileKind } from "@/lib/print/fileUrls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ orderId: string; file: string }> }) {
  const { orderId, file } = await context.params;
  const kind = file.replace(/\.pdf$/, "") as PrintFileKind;
  const signature = new URL(request.url).searchParams.get("sig");
  // One answer for every refusal, so the route says nothing about which
  // orders exist.
  const refuse = () => new Response("Not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (!PRINT_FILE_KINDS.includes(kind) || !verifyPrintFile(orderId, kind, signature)) return refuse();

  const stored = await prisma.printFile.findUnique({ where: { orderId_kind: { orderId, kind } } });
  if (!stored) return refuse();
  return new Response(new Uint8Array(stored.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${kind}.pdf"`,
      "Content-Length": String(stored.bytes.length),
      "Cache-Control": "private, no-store",
    },
  });
}
