// memari. for businesses: whose business is asking, and what its Home
// shows. See the Business model (prisma/schema.prisma) and
// handoff/research/B2B-findings-summary.md.
//
// A business belongs to one owner id - an account, or a guest trying it
// out, whose business moves with their journals when they sign in
// (owner.ts, moveGuestWork). Its clients' journals and its templates are
// that owner's own journals, marked as the business's.
//
// SERVER-ONLY.

import type { Business } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { currentOwner, type Owner } from "@/lib/owner";
import type { ShippingAddress } from "@/lib/print/lulu";
import { nextRange } from "@/lib/print/orderRange";
import { HOLDS_DAYS } from "@/lib/print/holdsDays";

export type BusinessContext = { owner: Owner; business: Business | null };

/** The person asking and their business, if they have one; null when nobody
 *  is signed in or browsing as a guest. */
export async function currentBusiness(): Promise<BusinessContext | null> {
  const owner = await currentOwner();
  if (!owner) return null;
  const business = await prisma.business.findUnique({ where: { ownerId: owner.id } });
  return { owner, business };
}

/** Is this journal a client's? Their journal shows none of the coach's own
 *  calendars - a client's book must not carry the coach's appointments
 *  (calendarStore.ts). Here, not in businessJournals.ts, so the calendar
 *  code can ask without importing the saved-pages code. */
export async function isClientJournal(plannerId: string): Promise<boolean> {
  return !!(await prisma.businessClient.findUnique({ where: { plannerId }, select: { id: true } }));
}

/** What a journal is to its owner's business, for the editor's pill: a
 *  template (and how many clients' journals its edits reach), a client's
 *  journal, or neither. */
export type BusinessRole = { kind: "template"; reach: number } | { kind: "client"; clientId: string; name: string; templated: boolean } | null;

export async function businessRoleOf(plannerId: string): Promise<BusinessRole> {
  const [template, client] = await Promise.all([
    prisma.businessTemplate.findUnique({ where: { plannerId }, select: { id: true } }),
    prisma.businessClient.findUnique({ where: { plannerId }, select: { id: true, name: true, templateId: true } }),
  ]);
  if (client) return { kind: "client", clientId: client.id, name: client.name, templated: !!client.templateId };
  if (template)
    return { kind: "template", reach: await prisma.businessClient.count({ where: { templateId: template.id, plannerId: { not: null }, archivedAt: null } }) };
  return null;
}

/** How many months a client's book runs: the lengths the shop sells. */
export const BOOK_MONTHS = [1, 3, 6, 12] as const;

/** Those lengths in days, as an order counts them (src/lib/print/orderRange.ts:
 *  30, 90 and 365 are its presets; six months is a custom length). */
export const BOOK_DAYS: Record<number, number> = { 1: 30, 3: 90, 6: 182, 12: 365 };

/** A client's address as stored, if it has everything a printer needs. */
export function shippableAddress(raw: unknown): ShippingAddress | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const text = (k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");
  if (!text("name") || !text("street1") || !text("city") || !text("postcode") || !text("countryCode") || !text("phoneNumber")) return null;
  return {
    name: text("name"),
    street1: text("street1"),
    street2: text("street2") || undefined,
    city: text("city"),
    stateCode: text("stateCode") || undefined,
    countryCode: text("countryCode").toUpperCase(),
    postcode: text("postcode"),
    phoneNumber: text("phoneNumber"),
  };
}

/** The four steps a new business is walked through, and whether each is
 *  done: a logo, a template, a client, a sample book. */
export type ChecklistStep = { key: "logo" | "template" | "client" | "sample"; label: string; detail: string; href: string; done: boolean };

/** Something on Home that wants the coach: what, about whom, and where to
 *  go to see to it. */
export type HomeTask = { key: string; label: string; detail: string; href: string };

/** Every journal id the business uses: its templates' and its clients'. */
export async function businessJournalIds(businessId: string): Promise<{ templates: string[]; clients: string[] }> {
  const [templates, clients] = await Promise.all([
    prisma.businessTemplate.findMany({ where: { businessId }, select: { plannerId: true } }),
    prisma.businessClient.findMany({ where: { businessId, plannerId: { not: null } }, select: { plannerId: true } }),
  ]);
  return { templates: templates.map((t) => t.plannerId), clients: clients.map((c) => c.plannerId!) };
}

/** Home: the first-run checklist and the to-dos, in one read. */
export async function businessHome(business: Business): Promise<{ steps: ChecklistStep[]; tasks: HomeTask[] }> {
  const [templateCount, clients, journals] = await Promise.all([
    prisma.businessTemplate.count({ where: { businessId: business.id } }),
    prisma.businessClient.findMany({ where: { businessId: business.id, archivedAt: null }, select: { id: true, name: true, shippingAddress: true, templateId: true, plannerId: true } }),
    businessJournalIds(business.id),
  ]);
  const ids = [...journals.templates, ...journals.clients];
  const [ordered, failed] = await Promise.all([
    ids.length ? prisma.printOrder.count({ where: { plannerId: { in: ids }, status: { notIn: ["QUOTED", "CANCELED"] } } }) : 0,
    ids.length ? prisma.printOrder.findMany({ where: { plannerId: { in: ids }, status: "FAILED" }, select: { id: true, title: true } }) : [],
  ]);
  const steps: ChecklistStep[] = [
    { key: "logo", label: "Add your logo", detail: "It goes on your screens here, and later on your clients' books.", href: "/app/business/settings", done: !!business.logoUrl },
    { key: "template", label: "Make a template", detail: "One of your journals, as the design every client's journal starts from.", href: "/app/business/templates", done: templateCount > 0 },
    { key: "client", label: "Add a client", detail: "Their name, where their books go, and when their first one starts.", href: "/app/business/clients/new", done: clients.length > 0 },
    { key: "sample", label: "Order a sample book", detail: "Hold a copy before your clients do.", href: "/app/business/templates", done: ordered > 0 },
  ];
  const tasks: HomeTask[] = [
    ...failed.map((o) => ({ key: `failed-${o.id}`, label: "A book needs attention", detail: o.title, href: "/app/business/orders" })),
    ...clients
      .filter((c) => !shippableAddress(c.shippingAddress))
      .map((c) => ({ key: `address-${c.id}`, label: "No address to send to", detail: c.name, href: `/app/business/clients/${c.id}` })),
    ...(templateCount > 0
      ? clients.filter((c) => !c.templateId).map((c) => ({ key: `template-${c.id}`, label: "No template chosen", detail: c.name, href: `/app/business/clients/${c.id}` }))
      : []),
    ...clients
      .filter((c) => c.templateId && !c.plannerId)
      .map((c) => ({ key: `journal-${c.id}`, label: "Journal not built yet", detail: c.name, href: `/app/business/clients/${c.id}` })),
  ];
  return { steps, tasks };
}

/** A client's order screen, filled in: whose, their address, their book's
 *  length, and its start - the day after their last book ends, or their
 *  first book's start. Null for a journal that is not one of the owner's
 *  clients'. The action (printActions.ts) checks who is asking first. */
export type ClientOrderDefaults = { client: string; startISO: string | null; days: number; address: Partial<ShippingAddress> | null };

export async function clientOrderDefaultsFor(ownerId: string, journalId: string): Promise<ClientOrderDefaults | null> {
  const client = await prisma.businessClient.findFirst({ where: { plannerId: journalId, business: { ownerId } } });
  if (!client) return null;
  const days = BOOK_DAYS[client.bookMonths] ?? client.bookMonths * 30;
  const last = await prisma.printOrder.findFirst({
    // A FAILED order that was never paid - a renewal that could not be
    // charged - leaves its days still to come (review, 2026-10-23: it pushed
    // a client's next book past them). One that WAS paid - the printer
    // refused it, and it waits for a retry or a refund - still holds them,
    // or the same days would be sold again (second review).
    // A bank payment still clearing holds its days too (holdsDays.ts).
    where: { plannerId: journalId, ownerId, OR: HOLDS_DAYS },
    orderBy: { endDate: "desc" },
  });
  const start = last ? nextRange({ start: last.startDate, end: last.endDate, days: last.days }).start : client.startDate;
  return {
    client: client.name,
    startISO: start ? start.toISOString().slice(0, 10) : null,
    days,
    address: (client.shippingAddress as Partial<ShippingAddress> | null) ?? null,
  };
}

/** What an order's status says, in the business's words. */
export const ORDER_WORDS: Record<string, string> = {
  // The only QUOTED orders a list shows are payments clearing (holdsDays.ts).
  QUOTED: "Payment clearing",
  PAID: "Approved",
  SUBMITTED: "Approved",
  IN_PRODUCTION: "In production",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELED: "Cancelled",
  FAILED: "Needs attention",
  SKIPPED: "Skipped",
};
