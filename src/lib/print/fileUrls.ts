// THE ADDRESSES LULU FETCHES AN ORDER'S PDFs FROM.
//
// Lulu cannot sign in, so each file's URL carries its own key: an HMAC of
// the order and the file, under PRINT_FILE_SECRET. Unguessable without the
// secret, and good for that one file only. Server-only.

import { createHmac, timingSafeEqual } from "node:crypto";

export type PrintFileKind = "interior" | "cover";
export const PRINT_FILE_KINDS: readonly PrintFileKind[] = ["interior", "cover"];

function secret(): string {
  const value = process.env.PRINT_FILE_SECRET;
  if (value) return value;
  // A development fallback, as guest mode has (memory: memari-guest-mode):
  // never in production, where an unset secret must stop the order.
  if (process.env.NODE_ENV !== "production") return "memari-dev-print-files";
  throw new Error("PRINT_FILE_SECRET is not set: print files cannot be signed.");
}

export function signPrintFile(orderId: string, kind: PrintFileKind): string {
  return createHmac("sha256", secret()).update(`${orderId}:${kind}`).digest("hex");
}

export function verifyPrintFile(orderId: string, kind: PrintFileKind, signature: string | null): boolean {
  if (!signature) return false;
  const expected = signPrintFile(orderId, kind);
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** A key for an address we give a printer that does not sign what it sends
 *  there (BookVault's webhook): the same secret, over a label of its own. */
export function siteSignature(label: string): string {
  return createHmac("sha256", secret()).update(`site:${label}`).digest("hex");
}

export function verifySiteSignature(label: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = siteSignature(label);
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** The site's own public address - where Lulu and Stripe reach it. Set as
 *  APP_URL in production; a page's own origin otherwise. */
export function appUrl(requestOrigin?: string): string {
  return (process.env.APP_URL || requestOrigin || "http://localhost:3000").replace(/\/+$/, "");
}

export function printFileUrl(base: string, orderId: string, kind: PrintFileKind): string {
  return `${base}/api/print-files/${encodeURIComponent(orderId)}/${kind}.pdf?sig=${signPrintFile(orderId, kind)}`;
}
