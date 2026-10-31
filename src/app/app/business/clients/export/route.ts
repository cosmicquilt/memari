// GET /app/business/clients/export - the coach's clients as a spreadsheet
// (businessExport.ts). Only ever the asker's own business.

import { NextResponse } from "next/server";
import { currentBusiness } from "@/lib/business";
import { clientRowsFor, toCsv } from "@/lib/businessExport";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await currentBusiness();
  if (!ctx?.business) return new NextResponse("No business here.", { status: 404 });
  const csv = toCsv(await clientRowsFor(ctx.business.id));
  const name = ctx.business.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "clients";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}-clients-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
