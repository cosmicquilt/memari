"use server";

// A client's own page (src/lib/clientPortal.ts): what they may change from
// it - where their books go. The token is checked again here; nothing else
// about the client is trusted from the form.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { saveAddressFromPortal } from "@/lib/clientPortal";
import { checkoutForClient, quoteForClient } from "@/lib/clientOrders";
import { COUNTRY_CODES } from "@/lib/print/countries";
import { appUrl } from "@/lib/print/fileUrls";
import { OrderError } from "@/lib/print/orderBook";
import { PriceMovedError } from "@/lib/print/orders";
import type { ShippingLevel } from "@/lib/print/orderRange";
import type { Binding } from "@/lib/print/products";

export type AddressState = { error?: string; saved?: boolean } | null;

const text = (form: FormData, key: string, max = 200) => String(form.get(key) ?? "").trim().slice(0, max);

export async function saveMyAddress(token: string, _: AddressState, form: FormData): Promise<AddressState> {
  const address = {
    name: text(form, "name", 120),
    street1: text(form, "street1"),
    street2: text(form, "street2") || undefined,
    city: text(form, "city", 120),
    stateCode: text(form, "stateCode", 40) || undefined,
    postcode: text(form, "postcode", 20),
    countryCode: text(form, "countryCode", 2).toUpperCase(),
    phoneNumber: text(form, "phoneNumber", 40),
  };
  if (!address.name || !address.street1 || !address.city || !address.postcode || !address.phoneNumber) return { error: "Fill in your name, address, city, postcode and phone." };
  if (!COUNTRY_CODES.includes(address.countryCode)) return { error: "Choose a country from the list." };
  if (!(await saveAddressFromPortal(token, address))) return { error: "This link no longer works. Ask for a new one." };
  revalidatePath(`/c/${token}`);
  return { saved: true };
}

/** Their book's prices, in a binding, to their address. */
export type MyQuote =
  | { ok: true; options: Array<{ level: ShippingLevel; label: string; totalCents: number; arrives?: { earliest: string; latest: string } }>; pageCount: number; range: { startISO: string; days: number; label: string } }
  | { ok: false; error: string };
export async function quoteMyBook(token: string, binding: Binding): Promise<MyQuote> {
  try {
    const quote = await quoteForClient(token, binding);
    return {
      ok: true,
      pageCount: quote.pageCount,
      range: { startISO: quote.range.startISO, days: quote.range.days, label: quote.range.label },
      options: quote.options.map((o) => ({ level: o.level, label: o.label, totalCents: o.price.totalCents, ...(o.arrives ? { arrives: o.arrives } : {}) })),
    };
  } catch (error) {
    return failure(error, "pricing your book");
  }
}

/** Stripe's payment page for their book. */
export async function payForMyBook(
  token: string,
  o: { binding: Binding; level: ShippingLevel; email: string; expectTotalCents: number; expectStartISO: string; expectDays: number }
): Promise<{ ok: true; url: string } | { ok: false; error: string; again?: boolean }> {
  if (!Number.isInteger(o.expectTotalCents) || o.expectTotalCents <= 0 || !Number.isInteger(o.expectDays) || !/^\d{4}-\d{2}-\d{2}$/.test(String(o.expectStartISO))) return { ok: false, error: "See prices again.", again: true };
  try {
    const list = await headers();
    const host = list.get("x-forwarded-host") ?? list.get("host");
    const proto = list.get("x-forwarded-proto") ?? "https";
    return { ok: true, url: await checkoutForClient(token, o, appUrl(host ? `${proto}://${host}` : undefined)) };
  } catch (error) {
    return failure(error, "opening the payment page");
  }
}

/** What went wrong, in words a client can act on; anything else is logged
 *  and said generally. */
function failure(error: unknown, doing: string): { ok: false; error: string; again?: boolean } {
  if (error instanceof PriceMovedError) return { ok: false, error: error.message, again: true };
  if (error instanceof OrderError) return { ok: false, error: error.message };
  console.error(`[portal] ${doing} failed:`, error);
  return { ok: false, error: `Something went wrong ${doing}. Try again in a moment.` };
}
