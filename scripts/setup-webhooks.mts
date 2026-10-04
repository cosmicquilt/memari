// Tell Lulu and Stripe where to send their news - once per site, run by
// hand with that site's keys:
//
//   npm run print:webhooks -- https://memari.studio
//
//   Lulu   PRINT_JOB_STATUS_CHANGED -> <site>/api/lulu/webhook
//          (signed with the Lulu API secret already set - nothing to copy)
//   Stripe checkout.session.completed and .async_payment_succeeded
//          -> <site>/api/stripe/webhook; Stripe shows the endpoint's signing
//          secret ONCE, when it is made: this prints it, to be set as
//          STRIPE_WEBHOOK_SECRET where the site runs.
//
// Safe to run again: an endpoint already registered for the address is left
// as it is. Keys come from the shell's environment, else from .env - the
// sandbox and test keys in development. For production, set the live keys
// in the shell first, the way migrations are run (memory: production ops).
import { readFileSync } from "node:fs";

try {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // No .env: the shell's environment is all there is.
}

const site = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https:\/\/[^/]+$/.test(site) || /localhost|127\.0\.0\.1/.test(site)) {
  console.error(
    "Give the site's public https address, e.g.  npm run print:webhooks -- https://memari.studio\n" +
      "Lulu and Stripe cannot reach localhost. To test Stripe locally, its CLI forwards events:\n" +
      "  stripe listen --forward-to localhost:3000/api/stripe/webhook"
  );
  process.exit(1);
}

const { listWebhooks, createWebhook, luluConfigured, LULU_SANDBOX } = await import("../src/lib/print/lulu.js");
const { stripe, stripeConfigured } = await import("../src/lib/print/stripe.js");
let failed = false;

// --- Lulu -----------------------------------------------------------------------
{
  const url = `${site}/api/lulu/webhook`;
  const where = process.env.LULU_API_BASE || `${LULU_SANDBOX} (sandbox)`;
  if (!luluConfigured()) {
    console.log("Lulu:   skipped - LULU_CLIENT_KEY and LULU_CLIENT_SECRET are not set.");
  } else {
    try {
      const existing = (await listWebhooks()).find((hook) => hook.url === url);
      if (existing) console.log(`Lulu:   already sends to ${url} (webhook ${existing.id}, ${where}).`);
      else {
        const made = await createWebhook(url);
        console.log(`Lulu:   now sends print-job status changes to ${url} (webhook ${made.id}, ${where}).`);
      }
    } catch (error) {
      failed = true;
      console.error(`Lulu:   failed - ${error instanceof Error ? error.message : String(error)}`);
      if (error && typeof error === "object" && "body" in error) console.error(`        ${String((error as { body: unknown }).body).slice(0, 400)}`);
    }
  }
}

// --- Stripe ----------------------------------------------------------------------
{
  const url = `${site}/api/stripe/webhook`;
  if (!stripeConfigured()) {
    console.log("Stripe: skipped - STRIPE_SECRET_KEY is not set.");
  } else {
    try {
      const live = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live") ? "live" : "test";
      const endpoints = await stripe().webhookEndpoints.list({ limit: 100 });
      const existing = endpoints.data.find((endpoint) => endpoint.url === url);
      if (existing) {
        console.log(`Stripe: already sends to ${url} (${existing.id}, ${live} mode). Its signing secret is in the Stripe dashboard under Developers > Webhooks.`);
      } else {
        const made = await stripe().webhookEndpoints.create({
          url,
          enabled_events: ["checkout.session.completed", "checkout.session.async_payment_succeeded"],
          description: "Memari: paid orders go to print",
        });
        console.log(`Stripe: now sends paid checkouts to ${url} (${made.id}, ${live} mode).`);
        console.log(`        Set this where the site runs - Stripe shows it only now:\n        STRIPE_WEBHOOK_SECRET=${made.secret}`);
      }
    } catch (error) {
      failed = true;
      console.error(`Stripe: failed - ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

process.exit(failed ? 1 : 0);
