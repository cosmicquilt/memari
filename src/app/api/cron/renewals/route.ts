// GET /api/cron/renewals - once a day (vercel.json): order the books whose
// auto-renew day has come (src/lib/print/renewals.ts), and delete print
// files past keeping. Vercel's cron calls it with CRON_SECRET as a bearer
// token; anything else is refused.

import { runRenewals, liveDeps, pruneOldPrintFiles, type RenewalOutcome } from "@/lib/print/renewals";
import { orderingConfigured } from "@/lib/print/orders";
import { appUrl } from "@/lib/print/fileUrls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Each renewal builds a book and asks Lulu and Stripe in turn - seconds,
// not milliseconds - so a run takes ten at most (renewals.ts's limit).
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Not authorised.", { status: 401 });
  }
  const now = new Date();
  // Without the keys there is nothing to renew with; the files are still
  // pruned on time.
  let renewals: RenewalOutcome[] | string = "ordering not configured";
  if (orderingConfigured().ok) {
    renewals = await runRenewals(now, liveDeps(appUrl(new URL(request.url).origin)), 10);
  }
  const pruned = await pruneOldPrintFiles(now);
  return Response.json({ renewals, pruned });
}
