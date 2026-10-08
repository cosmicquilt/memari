// THE PRINTER: Lulu's Print API, for the few calls an order needs.
//
// Lulu prints and posts each book and charges the card saved on OUR Lulu
// account for it - printing, shipping and a fulfilment fee (USD 0.75 an
// order) - when the print job is created. So a print job is created only
// after the customer has paid us (see the Stripe webhook). Files are not
// uploaded: Lulu fetches the interior and cover PDFs from URLs we give it
// (src/app/api/print-files), and may fetch more than once.
//
// The sandbox (api.sandbox.lulu.com, its own account and keys) never prints
// and is paid with test cards; production is api.lulu.com. Which one is a
// setting, LULU_API_BASE, so nothing here can tell the two apart - and the
// keys are Andrew's to enter, never written anywhere in this repository.
//
// Field names are Lulu's, from their client libraries and the getting-
// started guide (2026): line_items, printable_normalization, source_url,
// pod_package_id, shipping_level, the Lulu-HMAC-SHA256 webhook header.
// Server-only: it reads secrets.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { ShippingLevel } from "./orderRange";
import { dottedPodPackageId } from "./products";

export const LULU_SANDBOX = "https://api.sandbox.lulu.com";

function config() {
  const key = process.env.LULU_CLIENT_KEY;
  const secret = process.env.LULU_CLIENT_SECRET;
  const base = (process.env.LULU_API_BASE || LULU_SANDBOX).replace(/\/+$/, "");
  return { key, secret, base };
}

/** Are Lulu's keys set? The order screen says so plainly when they are not,
 *  rather than failing at the last step. */
export function luluConfigured(): boolean {
  const { key, secret } = config();
  return !!key && !!secret;
}

export class LuluError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message);
  }
}

let cachedToken: { value: string; expires: number } | null = null;

/** An access token, from the client credentials, kept until a minute before
 *  it expires. */
async function token(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const { key, secret, base } = config();
  if (!key || !secret) throw new LuluError("Lulu's API keys are not set (LULU_CLIENT_KEY, LULU_CLIENT_SECRET).", 0, "");
  const response = await fetch(`${base}/auth/realms/glasstree/protocol/openid-connect/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const text = await response.text();
  if (!response.ok) throw new LuluError(`Lulu refused the API keys (${response.status}).`, response.status, text);
  const json = JSON.parse(text) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function call<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const { base } = config();
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new LuluError(`Lulu answered ${response.status} to ${method} ${path}.`, response.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Where a book goes, in Lulu's words. A phone number is required: carriers
 *  ask for one. */
export type ShippingAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  /** A state, province or region code where the country has them. */
  stateCode?: string;
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  postcode: string;
  phoneNumber: string;
  email?: string;
};

function luluAddress(address: ShippingAddress) {
  return {
    name: address.name,
    street1: address.street1,
    ...(address.street2 ? { street2: address.street2 } : {}),
    city: address.city,
    ...(address.stateCode ? { state_code: address.stateCode } : {}),
    country_code: address.countryCode,
    postcode: address.postcode,
    phone_number: address.phoneNumber,
    ...(address.email ? { email: address.email } : {}),
  };
}

/** Lulu's money is a decimal string; ours is whole cents. */
export function toCents(amount: string | number | undefined | null): number {
  const value = typeof amount === "number" ? amount : Number.parseFloat(amount ?? "0");
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export type PrintCost = {
  /** Printing the book(s), before tax. */
  printCents: number;
  /** The per-order fulfilment fee. */
  fulfillmentCents: number;
  shippingCents: number;
  taxCents: number;
  /** All of it, tax included - what Lulu will charge our card. */
  totalCents: number;
  currency: string;
};

/** What Lulu would charge to print `pageCount` pages as `podPackageId` and
 *  post it to `address` by `level`. Throws where the level does not serve
 *  the address - see quoteShipping. */
export async function printCost(podPackageId: string, pageCount: number, address: ShippingAddress, level: ShippingLevel): Promise<PrintCost> {
  type Money = { total_cost_excl_tax?: string; total_cost_incl_tax?: string };
  const json = await call<{
    line_item_costs?: Money[];
    shipping_cost?: Money;
    fulfillment_cost?: Money;
    total_tax?: string;
    total_cost_incl_tax?: string;
    currency?: string;
  }>("POST", "/print-job-cost-calculations/", {
    line_items: [{ page_count: pageCount, pod_package_id: dottedPodPackageId(podPackageId), quantity: 1 }],
    shipping_address: luluAddress(address),
    shipping_option: level,
  });
  return {
    printCents: (json.line_item_costs ?? []).reduce((sum, item) => sum + toCents(item.total_cost_excl_tax), 0),
    fulfillmentCents: toCents(json.fulfillment_cost?.total_cost_excl_tax),
    shippingCents: toCents(json.shipping_cost?.total_cost_excl_tax),
    taxCents: toCents(json.total_tax),
    totalCents: toCents(json.total_cost_incl_tax),
    currency: json.currency ?? "USD",
  };
}

/** Every shipping level that serves the address, with what Lulu charges -
 *  one calculation a level, the ones Lulu refuses left out. Lulu does not
 *  offer every level everywhere. */
export async function quoteShipping(
  podPackageId: string,
  pageCount: number,
  address: ShippingAddress,
  levels: readonly ShippingLevel[]
): Promise<Array<{ level: ShippingLevel; cost: PrintCost }>> {
  const results = await Promise.all(
    levels.map(async (level) => {
      try {
        return { level, cost: await printCost(podPackageId, pageCount, address, level) };
      } catch (error) {
        // An address Lulu cannot read at all fails every level the same
        // way: that one is the caller's to report, not a missing option.
        if (error instanceof LuluError && error.status >= 400 && error.status < 500) return null;
        throw error;
      }
    })
  );
  return results.filter((result): result is { level: ShippingLevel; cost: PrintCost } => result !== null);
}

/** The cover's size - back, spine and front in one sheet, bleed included -
 *  for this book. The spine is the page count's thickness, so this is asked
 *  of Lulu rather than worked out here. */
export async function coverDimensions(podPackageId: string, pageCount: number): Promise<{ widthPt: number; heightPt: number }> {
  const json = await call<{ width: string | number; height: string | number; unit?: string }>("POST", "/cover-dimensions/", {
    pod_package_id: dottedPodPackageId(podPackageId),
    interior_page_count: pageCount,
    unit: "pt",
  });
  return { widthPt: Number(json.width), heightPt: Number(json.height) };
}

export type PrintJob = { id: number; status: { name: string; message?: string }; line_items?: Array<{ tracking_urls?: string[]; tracking_id?: string }> };

/** Send a paid order to print. Lulu charges our card on file now. */
export async function createPrintJob(input: {
  externalId: string;
  title: string;
  podPackageId: string;
  interiorUrl: string;
  coverUrl: string;
  address: ShippingAddress;
  level: ShippingLevel;
  contactEmail: string;
}): Promise<PrintJob> {
  return call<PrintJob>("POST", "/print-jobs/", {
    contact_email: input.contactEmail,
    external_id: input.externalId,
    // An hour before printing starts, in which a mistaken order can still
    // be cancelled for nothing.
    production_delay: 60,
    shipping_level: input.level,
    shipping_address: luluAddress(input.address),
    line_items: [
      {
        external_id: input.externalId,
        title: input.title.slice(0, 255),
        quantity: 1,
        printable_normalization: {
          // An order saved before the dotted form still prints after
          // Lulu drops the old one (products.ts).
          pod_package_id: dottedPodPackageId(input.podPackageId),
          cover: { source_url: input.coverUrl },
          interior: { source_url: input.interiorUrl },
        },
      },
    ],
  });
}

export async function getPrintJob(id: number | string): Promise<PrintJob> {
  return call<PrintJob>("GET", `/print-jobs/${id}/`);
}

/** Is this webhook really Lulu's? Lulu signs the raw body with our API
 *  secret (HMAC-SHA256, hex) in the Lulu-HMAC-SHA256 header. */
export function verifyLuluWebhook(rawBody: string, signature: string | null, secret = config().secret): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", Buffer.from(secret, "utf8")).update(Buffer.from(rawBody, "utf8")).digest("hex");
  const given = signature.trim().toLowerCase();
  return expected.length === given.length && timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

/** Cancel a print job - possible only before Lulu starts printing it (the
 *  hour of production_delay, or while it is unpaid). */
export async function cancelPrintJob(id: number | string): Promise<void> {
  await call("PUT", `/print-jobs/${id}/status/`, { name: "CANCELED" });
}

export type LuluWebhook = { id: number | string; url: string; topics: string[]; is_active?: boolean };

/** The webhooks registered on this Lulu account. */
export async function listWebhooks(): Promise<LuluWebhook[]> {
  const json = await call<{ results?: LuluWebhook[] } | LuluWebhook[]>("GET", "/webhooks/");
  return Array.isArray(json) ? json : (json.results ?? []);
}

/** Ask Lulu to tell `url` whenever a print job's status changes. */
export async function createWebhook(url: string): Promise<LuluWebhook> {
  return call<LuluWebhook>("POST", "/webhooks/", { topics: ["PRINT_JOB_STATUS_CHANGED"], url });
}
