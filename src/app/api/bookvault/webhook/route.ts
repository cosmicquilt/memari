// POST /api/bookvault/webhook?sig=... - BookVault saying an order moved
// (ORDER_CREATED, _ACKNOWLEDGED, _SENTTOPRINT, _PRINTED, _SHIPPED).
//
// BookVault does not sign its webhooks, so nothing in the body is believed:
// the address carries our own key (fileUrls.ts, siteSignature - given to
// BookVault by scripts/setup-webhooks.mts), and the body only says WHICH
// order to read back from BookVault's API, whose answer is what is applied
// (orders.ts, refreshBookVaultOrder). A forged call can at most make us
// read an order again.

import { verifySiteSignature } from "@/lib/print/fileUrls";
import { webhookReferences } from "@/lib/print/bookvault";
import { refreshBookVaultOrder } from "@/lib/print/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!verifySiteSignature("bookvault-webhook", new URL(request.url).searchParams.get("sig"))) {
    return new Response("Bad signature.", { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Not JSON.", { status: 400 });
  }
  const refs = webhookReferences(body);
  try {
    await refreshBookVaultOrder(refs);
  } catch (error) {
    // Said to BookVault, which tries again; the daily read catches it too.
    console.error("[print] a BookVault webhook could not be applied:", error);
    return new Response("Could not read the order back.", { status: 502 });
  }
  return new Response("ok", { status: 200 });
}
