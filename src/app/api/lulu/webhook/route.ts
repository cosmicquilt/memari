// POST /api/lulu/webhook - Lulu saying where a book is (PRINT_JOB_STATUS_CHANGED).
//
// Signed with our Lulu API secret in the Lulu-HMAC-SHA256 header; refused
// otherwise. The body is the print job as Lulu's print-job endpoint returns
// it (wrapped in { topic, data } or not - both are read).

import { verifyLuluWebhook, type PrintJob } from "@/lib/print/lulu";
import { applyLuluStatus } from "@/lib/print/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyLuluWebhook(raw, request.headers.get("Lulu-HMAC-SHA256"))) {
    return new Response("Bad signature.", { status: 401 });
  }
  let body: { data?: PrintJob } & Partial<PrintJob>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Not JSON.", { status: 400 });
  }
  const job = (body.data ?? body) as PrintJob;
  if (job && job.id !== undefined) await applyLuluStatus(job);
  return new Response("ok", { status: 200 });
}
