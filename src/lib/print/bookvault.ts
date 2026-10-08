// THE UK PRINTER: BookVault's API (v4), for metal wire-o. Server-only.
//
// "this season i want wire-o" (2026-10-08), printed by BookVault on its
// 170 gsm premium bond. Read from its spec (handoff/research/bookvault,
// bookvault-api-v4.swagger.json) and help centre:
//
//   ONE-OFF BOOKS are "transient" order lines: each carries its own cover and
//   interior file URLs against a product SKU, with no title set up and no
//   title fee. They print ONLY at BookVault's UK site ("transient orders can
//   only be fulfilled in the UK"), so prices are in pounds and every book to
//   another country crosses a border.
//   CUSTOMS are ours to declare: an HS code and a shipping term per order.
//   A planner is a diary, HS 4820.10 - US Customs ruled a spiral day planner
//   so (N310081) - never a printed book (4901), which would be misdeclared.
//   Books to the US go duties paid (DDP), so nobody pays at the door; the
//   duties are only known once the order is placed, so the price carries an
//   allowance for them (US_DUTY_SHARE). Elsewhere the terms already say
//   import charges are the buyer's (DDU).
//   PRICES: /v4/title/calculate prices a specification at each print site;
//   /v4/dispatch lists the post for an address, with dates.
//   STATUS: webhooks for created, acknowledged, sent to print, printed and
//   shipped - not signed, and no event for a failure. So a webhook is only a
//   nudge: the order is read back from the API (getOrder) and that is what
//   counts, and the daily cron reads open orders back too (orders.ts,
//   refreshBookVaultOrders).
//
// Authenticated by the x-bookvault-api-key header. The key is Andrew's to
// enter (BOOKVAULT_API_KEY in .env, or where the site runs), never written
// here. There is no sandbox: every placed order is real.

import type { ShippingLevel } from "./orderRange";
import type { PrintCost, ShippingAddress } from "./lulu";
import type { PlannerTrimKey } from "@/lib/planner-trims";
import type { Binding } from "./products";

const BASE = "https://api.bookvault.app";

function config() {
  return { key: process.env.BOOKVAULT_API_KEY, base: (process.env.BOOKVAULT_API_BASE || BASE).replace(/\/+$/, "") };
}

/** Is BookVault's key set? Without it metal wire-o is not offered. */
export function bookVaultConfigured(): boolean {
  return !!config().key;
}

export class BookVaultError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
    /** BookVault says it cannot make this book (too few pages, say) - a
     *  reason to tell the customer, not a fault. */
    readonly refusal = false
  ) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, options: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const { key, base } = config();
  if (!key) throw new BookVaultError("BookVault's API key is not set (BOOKVAULT_API_KEY).", 0, "");
  const query = options.query ? `?${new URLSearchParams(options.query)}` : "";
  const response = await fetch(`${base}${path}${query}`, {
    method,
    headers: { "x-bookvault-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!response.ok) throw new BookVaultError(`BookVault answered ${response.status} to ${method} ${path}.`, response.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

// --- The book -------------------------------------------------------------------

/** The paper: 170 gsm premium bond, uncoated white (Andrew's pick,
 *  2026-10-08) - thick, and sold for journals because ink does not come
 *  through. UK only, which transient orders are anyway. Wire-o holds at most
 *  350 pages of it (help centre, "What is the maximum page count"). */
export const BOOKVAULT_PAPER = { gsm: 170, code: "170UW", wireoMaxPages: 350 } as const;

/** A matte cover, as Lulu's. The wire is black, BookVault's standard. */
const LAMINATION = { code: "M", name: "Matte" } as const;

/** The finished size in whole millimetres, as the SKU writes it: 7 x 10 in is
 *  254 high by 178 wide (177.8, which BookVault takes as 178). */
const TRIM_MM: Partial<Record<PlannerTrimKey, { heightMm: number; widthMm: number }>> = {
  bound7x10: { heightMm: 254, widthMm: 178 },
};

/** BookVault's transient SKU - [paper][lamination][binding][height]H[width]W,
 *  each size in three digits (help centre, "Fulfilling personalized books"):
 *  170UWMWB254H178W for ours. Null where BookVault does not print it for us. */
export function bookVaultSku(binding: Binding, trim: PlannerTrimKey): string | null {
  const size = TRIM_MM[trim];
  if (binding !== "wireo" || !size) return null;
  const mm = (value: number) => String(value).padStart(3, "0");
  return `${BOOKVAULT_PAPER.code}${LAMINATION.code}WB${mm(size.heightMm)}H${mm(size.widthMm)}W`;
}

/** The size a SKU is for, read back from it. */
function skuSize(sku: string): { heightMm: number; widthMm: number } {
  const match = /(\d{3})H(\d{3})W$/.exec(sku);
  if (!match) throw new BookVaultError(`Not a BookVault SKU: ${sku}.`, 0, "");
  return { heightMm: Number(match[1]), widthMm: Number(match[2]) };
}

/** ROOM FOR THE WIRE, in inches, added to the inside margin. BookVault punches
 *  the binding edge and asks for content to keep "roughly 15mm" from it (PDF
 *  guide, wiro cover set-up). The page keeps everything half an inch (12.7mm)
 *  inside the trim; an eighth more puts it at 15.9mm. */
export const BOOKVAULT_GUTTER_IN = 0.125;

/** The cover of a wire-o book is not a wrap but separate pages - the front,
 *  then the back - each the trim with 3mm of bleed all round (PDF guide:
 *  "this needs the covers as individual pages"). In points, from the SKU's
 *  millimetres, which is the size BookVault checks the file against. */
export function bookVaultCoverPage(sku: string): { widthPt: number; heightPt: number } {
  const { heightMm, widthMm } = skuSize(sku);
  const pt = (mm: number) => (mm / 25.4) * 72;
  return { widthPt: pt(widthMm + 6), heightPt: pt(heightMm + 6) };
}

// --- Money ------------------------------------------------------------------------

/** What a pound costs us in dollars, with room for the rate moving and the
 *  card's fee on a charge in pounds: 1.35 and 4% (2026-10-08). PLACEHOLDER,
 *  Andrew's to set - or BOOKVAULT_GBP_TO_USD where the site runs. */
export function gbpToUsd(): number {
  const set = Number(process.env.BOOKVAULT_GBP_TO_USD);
  return Number.isFinite(set) && set > 0 ? set : 1.35 * 1.04;
}

/** US duty on a UK-made diary: HS 4820.10 is free, but UK goods carry 10%
 *  (Section 301, since 24 July 2026) - on the declared value, here the
 *  order's own. Plus a fixed allowance for the carrier's fee for paying it.
 *  PLACEHOLDERS until a real order shows BookVault's dutiesTaxesAndFees. */
export const US_DUTY_SHARE = 0.1;
export const DDP_FEE_GBP = 2.5;
/** UK VAT, which BookVault adds to a book posted within the UK: a diary is
 *  standard rated, not zero rated like a book. */
export const UK_VAT_SHARE = 0.2;

/** BookVault's charge for one book, in pounds, as our cost in dollars. Duty
 *  or VAT goes in as tax, so the price rule carries it with the book. */
export function bookVaultCost(printGbp: number, postGbp: number, countryCode: string, rate = gbpToUsd()): PrintCost {
  const goods = printGbp + postGbp;
  const taxGbp = countryCode === "US" ? goods * US_DUTY_SHARE + DDP_FEE_GBP : countryCode === "GB" ? goods * UK_VAT_SHARE : 0;
  const cents = (gbp: number) => Math.round(gbp * rate * 100);
  const printCents = cents(printGbp);
  const shippingCents = cents(postGbp);
  const taxCents = cents(taxGbp);
  return { printCents, fulfillmentCents: 0, shippingCents, taxCents, totalCents: printCents + shippingCents + taxCents, currency: "USD" };
}

/** The customs declaration for a book to this country: none within the UK,
 *  duties paid to the US, the buyer's elsewhere (the terms say so). */
export function customsFor(countryCode: string): { hsCode: string; incoTerms: "DDP" | "DDU"; useOrderValue: true; useIOSS: false } | undefined {
  if (countryCode === "GB") return undefined;
  return { hsCode: "482010", incoTerms: countryCode === "US" ? "DDP" : "DDU", useOrderValue: true, useIOSS: false };
}

// --- Prices -----------------------------------------------------------------------

type CodelistEntry = { id: number; value: string };

let stockCache: { text: number; cover: number } | null = null;

/** BookVault's ids for our text paper and its standard 250 gsm cover board,
 *  from its code lists - found by name, or set by hand where that fails
 *  (BOOKVAULT_TEXT_STOCK_ID, BOOKVAULT_COVER_STOCK_ID). The names are said
 *  in the error, so the first run with a key shows what to set. */
async function stockIds(): Promise<{ text: number; cover: number }> {
  if (stockCache) return stockCache;
  const setText = Number(process.env.BOOKVAULT_TEXT_STOCK_ID);
  const setCover = Number(process.env.BOOKVAULT_COVER_STOCK_ID);
  const [texts, covers] = await Promise.all([
    setText > 0 ? null : call<CodelistEntry[]>("GET", "/v4/codelist", { query: { type: "TextStocks" } }),
    setCover > 0 ? null : call<CodelistEntry[]>("GET", "/v4/codelist", { query: { type: "CoverStocks" } }),
  ]);
  const text = setText > 0 ? setText : texts?.find((entry) => /170/.test(entry.value) && /bond/i.test(entry.value))?.id;
  const cover = setCover > 0 ? setCover : covers?.find((entry) => /250/.test(entry.value))?.id;
  if (!text || !cover) {
    const list = (entries: CodelistEntry[] | null) => (entries ?? []).map((entry) => `${entry.id} ${entry.value}`).join("; ");
    throw new BookVaultError(`BookVault's paper names did not match: text stocks [${list(texts)}], cover stocks [${list(covers)}]. Set BOOKVAULT_TEXT_STOCK_ID and BOOKVAULT_COVER_STOCK_ID.`, 0, "");
  }
  stockCache = { text, cover };
  return stockCache;
}

type Partner = { name?: string; currencyID?: string };
type Product = { pricing?: Array<{ price?: number; canPrint?: boolean; messages?: string[]; partner?: Partner }>; messages?: Array<{ message?: string; errorText?: string; level?: string }> };

const isUk = (partner?: Partner) => !!partner && (partner.currencyID === "GBP" || /uk/i.test(partner.name ?? ""));

/** Printing and binding one book of `pages` at the UK site, in pounds. A book
 *  BookVault cannot make - too few pages, too many - is a refusal, with its
 *  reasons. */
export async function bookVaultPrintPrice(sku: string, pages: number): Promise<number> {
  const stocks = await stockIds();
  const { heightMm, widthMm } = skuSize(sku);
  const product = await call<Product>("POST", "/v4/title/calculate", {
    query: { calculationType: "Full" },
    body: {
      specifications: {
        monoPages: pages,
        colourPages: 0,
        binding: "WireBound",
        dimensions: { height: heightMm, width: widthMm, unit: "Millimeter" },
        stocks: { textStock: stocks.text, coverStock: stocks.cover },
        lamination: LAMINATION.name,
        premium: false,
      },
    },
  });
  const uk = (product.pricing ?? []).find((price) => isUk(price.partner));
  if (!uk || !uk.canPrint || typeof uk.price !== "number") {
    const why = [...(uk?.messages ?? []), ...(product.messages ?? []).map((m) => m.message || m.errorText || "")].filter(Boolean).join("; ");
    throw new BookVaultError(`BookVault cannot print this book${why ? `: ${why}` : "."}`, 0, JSON.stringify(product).slice(0, 2000), true);
  }
  return uk.price;
}

/** How each of our shipping levels is asked of BookVault. Two, not Lulu's
 *  five: the cheapest service that can be tracked - a book is worth tracking
 *  across an ocean - and the quickest. */
const SERVICE: Partial<Record<ShippingLevel, "CheapestTracked" | "Quickest">> = { MAIL: "CheapestTracked", EXPRESS: "Quickest" };
export const BOOKVAULT_LEVELS: readonly ShippingLevel[] = ["MAIL", "EXPRESS"];
export const BOOKVAULT_LEVEL_LABELS: Partial<Record<ShippingLevel, string>> = { MAIL: "Tracked post", EXPRESS: "Express courier" };

export type BookVaultService = {
  servID?: number;
  serviceName?: string;
  tracked?: boolean;
  deliveryTotal?: number;
  minDeliveryDays?: number;
  maxDeliveryDays?: number;
  minEstimatedDelivery?: string;
  maxEstimatedDelivery?: string;
};

/** The service BookVault would use: the one it names as requested, else -
 *  should it name none - the rule the level stands for. */
export function pickService(estimate: { services?: BookVaultService[]; requestedServices?: number[] }, want: "CheapestTracked" | "Quickest"): BookVaultService | null {
  const services = (estimate.services ?? []).filter((service) => typeof service.deliveryTotal === "number");
  const named = services.find((service) => service.servID === estimate.requestedServices?.[0]);
  if (named) return named;
  const byCost = (a: BookVaultService, b: BookVaultService) => (a.deliveryTotal ?? 0) - (b.deliveryTotal ?? 0);
  if (want === "CheapestTracked") return services.filter((service) => service.tracked).sort(byCost)[0] ?? null;
  const days = (service: BookVaultService) => service.maxDeliveryDays || service.minDeliveryDays || Number.POSITIVE_INFINITY;
  return [...services].sort((a, b) => days(a) - days(b) || byCost(a, b))[0] ?? null;
}

/** BookVault posts once printing is done: a week from today, to ask for the
 *  dates from. */
function shipmentDate(today = new Date()): string {
  return new Date(today.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
}

function transientLine(sku: string, pages: number, title: string, files?: { cover: string; interior: string }) {
  return {
    lineNumber: 1,
    quantity: 1,
    transient: {
      productSku: sku,
      lineTitle: title.slice(0, 100) || "Journal",
      monoPages: pages,
      colourPages: 0,
      ...(files ? { files: { Cover: files.cover, Text: files.interior } } : {}),
    },
  };
}

async function dispatchEstimate(sku: string, pages: number, address: ShippingAddress, want: "CheapestTracked" | "Quickest"): Promise<BookVaultService | null> {
  const estimate = await call<{ services?: BookVaultService[]; requestedServices?: number[] }>("POST", "/v4/dispatch", {
    body: {
      orderLines: [transientLine(sku, pages, "Journal")],
      countryCode: address.countryCode,
      serviceLevel: want,
      partner: "Bookvault_UK",
      currency: "GBP",
      shipmentDate: shipmentDate(),
      areaCode: address.postcode,
    },
  });
  return pickService(estimate, want);
}

export type BookVaultQuote = { level: ShippingLevel; cost: PrintCost; label: string; arrives?: { earliest: string; latest: string } };

/** Every level BookVault serves the address by, priced as our cost in
 *  dollars, with its delivery dates. One service offered for both levels is
 *  offered once, as the cheaper. */
export async function bookVaultQuotes(sku: string, pages: number, address: ShippingAddress, levels: readonly ShippingLevel[] = BOOKVAULT_LEVELS): Promise<BookVaultQuote[]> {
  const wanted = levels.filter((level) => SERVICE[level]);
  const [printGbp, ...services] = await Promise.all([bookVaultPrintPrice(sku, pages), ...wanted.map((level) => dispatchEstimate(sku, pages, address, SERVICE[level]!))]);
  const seen = new Set<number | undefined>();
  const quotes: BookVaultQuote[] = [];
  wanted.forEach((level, index) => {
    const service = services[index];
    if (!service || seen.has(service.servID)) return;
    seen.add(service.servID);
    const arrives = service.minEstimatedDelivery && service.maxEstimatedDelivery ? { earliest: service.minEstimatedDelivery.slice(0, 10), latest: service.maxEstimatedDelivery.slice(0, 10) } : undefined;
    quotes.push({ level, cost: bookVaultCost(printGbp, service.deliveryTotal ?? 0, address.countryCode), label: BOOKVAULT_LEVEL_LABELS[level] ?? level, arrives });
  });
  return quotes;
}

// --- Orders -----------------------------------------------------------------------

/** Where a book goes, in BookVault's words. US and Canadian addresses need
 *  the two-letter state or province. */
export function bookVaultAddress(address: ShippingAddress, email?: string) {
  return {
    addressee: address.name,
    address1: address.street1,
    ...(address.street2 ? { address2: address.street2 } : {}),
    town: address.city,
    ...(address.stateCode ? { county: address.stateCode } : {}),
    countryCode: address.countryCode,
    postCode: address.postcode,
    ...(address.phoneNumber ? { telNumber: address.phoneNumber } : {}),
    ...(email || address.email ? { email: email || address.email } : {}),
  };
}

/** What BookVault needs of an address that a carrier alone might not: a
 *  state for the US and Canada, and a first and last name for the US. */
export function bookVaultAddressProblem(address: ShippingAddress): string | null {
  if ((address.countryCode === "US" || address.countryCode === "CA") && !address.stateCode) return "The address needs its state or province, as two letters.";
  if (address.countryCode === "US" && !/\S\s+\S/.test(address.name)) return "The name needs a first and last name for a US address.";
  return null;
}

/** The order we place: one transient line, posted the level's way, made at
 *  the UK site at standard speed, declared at customs as a diary. */
export function bookVaultOrderBody(input: {
  externalId: string;
  title: string;
  sku: string;
  pages: number;
  interiorUrl: string;
  coverUrl: string;
  address: ShippingAddress;
  level: ShippingLevel;
  contactEmail: string;
}) {
  const customs = customsFor(input.address.countryCode);
  return {
    docRef: input.externalId,
    address: bookVaultAddress(input.address, input.contactEmail),
    orderLines: [transientLine(input.sku, input.pages, input.title, { cover: input.coverUrl, interior: input.interiorUrl })],
    dispatchRequest: { requestedService: SERVICE[input.level] ?? "CheapestTracked" },
    productionLevel: "Standard",
    partner: "Bookvault_UK",
    ...(customs ? { customsDeclaration: customs } : {}),
  };
}

/** Place a paid order. BookVault bills our account for it. */
export async function placeBookVaultOrder(input: Parameters<typeof bookVaultOrderBody>[0]): Promise<{ podRef: string; message?: string }> {
  const response = await call<{ podRef?: number | string; message?: string }>("POST", "/v4/order", { body: bookVaultOrderBody(input) });
  if (response.podRef === undefined || response.podRef === null || response.podRef === "") {
    throw new BookVaultError(`BookVault did not take the order${response.message ? `: ${response.message}` : "."}`, 0, JSON.stringify(response));
  }
  return { podRef: String(response.podRef), message: response.message };
}

export type BookVaultOrder = {
  identification?: { podRef?: string; docRef?: string };
  metadata?: { status?: string };
  financials?: { orderCost?: { grandTotal?: number; dutiesTaxesAndFees?: number; paymentLink?: string } };
  fulfillment?: { progress?: { status?: string }; trackingDetails?: { combinedURL?: string; trackingNumber?: string } };
  messages?: Array<{ message?: string; errorText?: string; level?: string }>;
  criticalError?: boolean;
};

export async function getBookVaultOrder(podRef: string): Promise<BookVaultOrder> {
  return call<BookVaultOrder>("GET", "/v4/order", { query: { type: "PodRef", value: podRef } });
}

/** Cancel an order BookVault has not sent to print. Throws if it refuses. */
export async function cancelBookVaultOrder(podRef: string): Promise<void> {
  const response = await call<{ success?: boolean; errors?: string[] }>("DELETE", "/v4/order", { query: { type: "PodRef", value: podRef } });
  if (!response.success) throw new BookVaultError(`BookVault would not cancel order ${podRef}${response.errors?.length ? `: ${response.errors.join("; ")}` : "."}`, 0, JSON.stringify(response));
}

/** BookVault's progress names in which an order can still be cancelled:
 *  before it is sent to print. */
export const BOOKVAULT_STOPPABLE = new Set(["Created", "Acknowledged"]);

export type JobReport = {
  /** The printer's own word for where it is, kept on the order. */
  name: string | null;
  status?: "SUBMITTED" | "IN_PRODUCTION" | "SHIPPED" | "DELIVERED" | "CANCELED" | "FAILED";
  tracking: string[];
  message?: string;
};

const PROGRESS: Record<string, JobReport["status"]> = {
  Created: "SUBMITTED",
  Acknowledged: "SUBMITTED",
  SentToPrint: "IN_PRODUCTION",
  Batched: "IN_PRODUCTION",
  Printed: "IN_PRODUCTION",
  Dispatched: "SHIPPED",
  Invoiced: "SHIPPED",
};

/** An order read back from BookVault, as the report orders.ts applies. A
 *  deleted order is cancelled; one BookVault could not process has failed. */
export function bookVaultReport(order: BookVaultOrder): JobReport {
  const tracking = order.fulfillment?.trackingDetails?.combinedURL ? [order.fulfillment.trackingDetails.combinedURL] : [];
  if (order.metadata?.status === "Deleted") return { name: "Deleted", status: "CANCELED", tracking };
  if (order.criticalError) {
    const why = (order.messages ?? []).filter((m) => m.level === "Error").map((m) => m.message || m.errorText).filter(Boolean).join("; ");
    return { name: "Error", status: "FAILED", tracking, message: why || undefined };
  }
  const name = order.fulfillment?.progress?.status ?? null;
  return { name, status: name ? PROGRESS[name] : undefined, tracking };
}

// --- Webhooks ---------------------------------------------------------------------

export const BOOKVAULT_TOPICS = ["ORDER_CREATED", "ORDER_ACKNOWLEDGED", "ORDER_SENTTOPRINT", "ORDER_PRINTED", "ORDER_SHIPPED"] as const;

export type BookVaultWebhook = { id?: number; url?: string; topic?: string; status?: string };

export async function listBookVaultWebhooks(): Promise<BookVaultWebhook[]> {
  const json = await call<{ webhooks?: BookVaultWebhook[] }>("GET", "/v4/webhooks", { query: { webhooksPerPage: "100", pageNumber: "1" } });
  return json.webhooks ?? [];
}

export async function createBookVaultWebhook(url: string, topic: string): Promise<BookVaultWebhook> {
  return call<BookVaultWebhook>("POST", "/v4/webhook", { body: { url, topic } });
}

/** The order a webhook is about, wherever in its body BookVault puts it: its
 *  own reference, or ours (the docRef we gave, our order's id). */
export function webhookReferences(body: unknown): { podRef?: string; docRef?: string } {
  const found: { podRef?: string; docRef?: string } = {};
  const walk = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > 4) return;
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      const name = key.toLowerCase();
      if ((typeof inner === "string" || typeof inner === "number") && String(inner)) {
        if (name === "podref" && !found.podRef) found.podRef = String(inner);
        if (name === "docref" && !found.docRef) found.docRef = String(inner);
      } else walk(inner, depth + 1);
    }
  };
  walk(body, 0);
  return found;
}
