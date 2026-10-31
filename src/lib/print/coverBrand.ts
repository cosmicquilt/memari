// THE COACH ON THE COVER (2026-10-30). A coach's client used to receive a
// book naming only themselves and memari.studio; the book is the coach's
// product, so a client's journal, and a sample of a coach's template, carry
// the business's name and logo (cover.ts draws them). His call, after the
// coach research: "the coach's brand on the book" before the first test.
//
// The logo is the https address the coach gave in Settings, fetched when
// the cover is made. A logo that can't be fetched, isn't a PNG or JPEG, or
// is too small to print sharply is left off; the name always prints. The
// cover is never held up by it.
//
// SERVER-ONLY.

import { prisma } from "@/lib/prisma";
import type { CoverBrand } from "./cover";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TIMEOUT_MS = 4000;

/** The business a journal belongs to, as a client's journal or a template. */
export async function coverBrandFor(journalId: string, fetchLogo: (url: string) => Promise<CoverBrand["logo"]> = logoFrom): Promise<CoverBrand | null> {
  const [client, template] = await Promise.all([
    prisma.businessClient.findUnique({ where: { plannerId: journalId }, select: { business: { select: { name: true, logoUrl: true } } } }),
    prisma.businessTemplate.findUnique({ where: { plannerId: journalId }, select: { business: { select: { name: true, logoUrl: true } } } }),
  ]);
  const business = client?.business ?? template?.business;
  if (!business?.name.trim()) return null;
  const logo = business.logoUrl ? await fetchLogo(business.logoUrl).catch(() => undefined) : undefined;
  return { name: business.name.trim(), ...(logo ? { logo } : {}) };
}

/** Only an https address on a named host: never an IP or this machine, so a
 *  coach's logo address can't make the server ask inside its own network. */
export function logoAddressOk(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return null;
  return url;
}

/** The logo's bytes, by what they are rather than what the server says. */
export function logoFormat(bytes: Uint8Array): "PNG" | "JPEG" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "PNG";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "JPEG";
  return null;
}

async function logoFrom(raw: string): Promise<CoverBrand["logo"]> {
  const url = logoAddressOk(raw);
  if (!url) return undefined;
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) });
  if (!response.ok) return undefined;
  if (Number(response.headers.get("content-length") ?? 0) > LOGO_MAX_BYTES) return undefined;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > LOGO_MAX_BYTES) return undefined;
  const format = logoFormat(bytes);
  return format ? { data: bytes, format } : undefined;
}
