// memari. for businesses, v1.5: a client's own page (2026-10-22: "continue
// with client side"; handoff/research/B2B-findings-summary.md - "a sign-in
// link by email for clients").
//
// A PRIVATE LINK, NOT AN ACCOUNT. The coach makes a link for a client -
// /c/<token> - and gives it to them; opening it shows their journal, their
// books and where their books go, and lets them correct that address.
// Nothing else: the journal is the coach's, and changing it from here waits
// for the parts a coach leaves open (locks), not built yet.
//
// The token is 32 random bytes; only its SHA-256 is stored, so the database
// alone opens nobody's page. A new link replaces the old one, and turning it
// off clears it. An archived client's page is closed.
//
// A plain server module: what it is handed is checked here (the token), and
// the coach's actions check who the coach is before calling in.

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { fontFamilyFromTheme } from "@/lib/theme";
import { pageThumbnail } from "@/app/planner/loadPlannerPages";
import type { PreviewMark } from "@/lib/previewMarks";
import type { ShippingAddress } from "@/lib/print/lulu";
import { HOLDS_DAYS } from "@/lib/print/holdsDays";

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

/** A token's shape: what randomBytes(32) gives in base64url. Anything else
 *  is not looked up at all. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** Could this be a link's token at all - before anything else is done
 *  with it (clientOrders.ts keys a limiter by it). */
export const tokenShapeOk = (token: unknown): token is string => typeof token === "string" && TOKEN.test(token);

/** A new link for a client of the owner's business; the token, to be shown
 *  to the coach once. Any earlier link stops working. */
export async function makeClientLink(ownerId: string, clientId: string): Promise<string> {
  const client = await prisma.businessClient.findFirst({ where: { id: clientId, business: { ownerId } }, select: { id: true } });
  if (!client) throw new Error("That client is not one of yours.");
  const token = randomBytes(32).toString("base64url");
  await prisma.businessClient.update({ where: { id: client.id }, data: { accessTokenHash: hashOf(token), accessMadeAt: new Date(), accessSeenAt: null } });
  return token;
}

/** TURN A CLIENT'S LINK OFF: their page closes at once - with an undo
 *  (review, 2026-10-26: it sat beside "Make a new link" and could not be
 *  taken back, so a mis-click left the client's emailed link dead). The
 *  link's hash is kept and only the day it was made is cleared: a link with
 *  no day opens nothing (clientForToken). The Undo puts the day back, and so
 *  the same link, without the hash ever leaving the server. A new link
 *  replaces it for good. Returns the day, for the undo; null if there was
 *  no link on. */
export async function turnOffClientLink(ownerId: string, clientId: string): Promise<Date | null> {
  const client = await prisma.businessClient.findFirst({ where: { id: clientId, business: { ownerId } }, select: { id: true, accessMadeAt: true } });
  if (!client?.accessMadeAt) return null;
  const off = await prisma.businessClient.updateMany({ where: { id: client.id, accessMadeAt: client.accessMadeAt }, data: { accessMadeAt: null } });
  return off.count === 1 ? client.accessMadeAt : null;
}

/** The undo: the link turned off back on - only while it is still the one
 *  kept (no new link since) and still off. */
export async function restoreClientLink(ownerId: string, clientId: string, madeAt: Date): Promise<boolean> {
  const on = await prisma.businessClient.updateMany({ where: { id: clientId, business: { ownerId }, accessMadeAt: null, accessTokenHash: { not: null } }, data: { accessMadeAt: madeAt } });
  return on.count === 1;
}

/** The client a link is for: open, not turned off, and not archived. */
export async function clientForToken(token: string) {
  if (!TOKEN.test(token)) return null;
  const client = await prisma.businessClient.findUnique({
    where: { accessTokenHash: hashOf(token) },
    include: { business: { select: { name: true, logoUrl: true, ownerId: true, clientsPay: true, markupCents: true, payoutsReady: true, stripeAccountId: true } } },
  });
  // a link turned off keeps its hash for the undo, and has no day
  return client && !client.archivedAt && client.accessMadeAt ? client : null;
}

const LEVELS: Array<{ level: string; label: string }> = [
  { level: "FRONT_MATTER", label: "At the front" },
  { level: "MONTHLY", label: "Each month" },
  { level: "WEEKLY", label: "Each week" },
  { level: "DAILY", label: "Each day" },
  { level: "BACK_MATTER", label: "At the back" },
];

export type PortalPage = { marks: PreviewMark[]; widthPx: number; heightPx: number };
export type PortalData = {
  business: { name: string; logoUrl: string | null };
  client: { name: string; coverName: string | null; address: Partial<ShippingAddress> | null; startDate: Date | null; bookMonths: number };
  journal: Array<{ label: string; pages: PortalPage[] }> | null;
  books: Array<{ id: string; startDate: Date; endDate: Date; status: string; tracking: string | null }>;
};

/** What a client's page shows - and, as it is opened, when it was. */
export async function portalFor(token: string): Promise<PortalData | null> {
  const client = await clientForToken(token);
  if (!client) return null;
  // when it was last opened, for the coach - at most once an hour
  if (!client.accessSeenAt || Date.now() - client.accessSeenAt.getTime() > 60 * 60 * 1000)
    await prisma.businessClient.update({ where: { id: client.id }, data: { accessSeenAt: new Date() } });

  let journal: PortalData["journal"] = null;
  let books: PortalData["books"] = [];
  if (client.plannerId) {
    const [planner, orders] = await Promise.all([
      prisma.planner.findUnique({
        where: { id: client.plannerId },
        include: {
          pages: {
            where: { variantKey: null },
            orderBy: [{ level: "asc" }, { position: "asc" }],
            include: { moduleInstances: { include: { moduleType: { select: { slug: true } } } } },
          },
        },
      }),
      prisma.printOrder.findMany({
        // their books: the ones holding days - with a payment still
        // clearing, and without a renewal that failed unpaid, which would
        // never come (review, 2026-10-26; holdsDays.ts)
        where: { plannerId: client.plannerId, OR: HOLDS_DAYS },
        orderBy: { startDate: "desc" },
      }),
    ]);
    if (planner) {
      const font = fontFamilyFromTheme(planner.theme);
      // drawn as the template it is - a page for every week, not one week's
      const context = { dated: false, occurrence: null, dayLabels: null, weekStartDay: 0, events: null, columnDates: null };
      journal = LEVELS.map(({ level, label }) => ({
        label,
        pages: planner.pages
          .filter((p) => p.level === level)
          .map((p) => ({ marks: pageThumbnail(p, font, context), widthPx: p.widthPx, heightPx: p.heightPx })),
      })).filter((group) => group.pages.length > 0);
    }
    books = orders.map((o) => ({
      id: o.id,
      startDate: o.startDate,
      endDate: o.endDate,
      status: o.status,
      tracking: Array.isArray(o.trackingUrls) && typeof o.trackingUrls[0] === "string" ? (o.trackingUrls[0] as string) : null,
    }));
  }
  return {
    business: { name: client.business.name, logoUrl: client.business.logoUrl },
    client: {
      name: client.name,
      coverName: client.coverName,
      address: (client.shippingAddress as Partial<ShippingAddress> | null) ?? null,
      startDate: client.startDate,
      bookMonths: client.bookMonths,
    },
    journal,
    books,
  };
}

/** The client corrects where their books go, from their page. */
export async function saveAddressFromPortal(token: string, address: ShippingAddress): Promise<boolean> {
  const client = await clientForToken(token);
  if (!client) return false;
  await prisma.businessClient.update({ where: { id: client.id }, data: { shippingAddress: address } });
  return true;
}
