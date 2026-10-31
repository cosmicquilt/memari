// memari. for businesses: the numbers behind the business's charts
// (2026-10-22: "it would be nice to have graphs and charts and visuals for
// them to look at ... make them fully planned and well thought out").
//
// Each answers one question a coach has:
//   - who is about to run out of pages?  coverage(): every client's books on
//     a calendar, and where the last one ends with nothing after it;
//   - the headline numbers               headline(): clients, books and spend
//     this quarter against the last, and who runs out within 30 days;
//   - books and spend over time          monthly(): per month, two series
//     drawn as two charts (never one chart with two scales);
//   - where the books are                pipeline(): the books on their way,
//     by the stage they are at - ordered stages, one hue light to dark;
//   - how setup is going                 setup(): clients through the steps
//     to a first book.
// Money is what the coach paid (totalCents), never what a book cost us; a
// book a client paid for themselves (paidByClient, 2026-10-22) is not the
// coach's spending - its share on top (markupCents) is what they earned.
//
// SERVER-ONLY.

import { prisma } from "@/lib/prisma";
import { GROUP_PLACE, bookAddressOf } from "@/lib/business";
import type { PrintOrderStatus } from "@/generated/prisma/enums";
import { coachReceives } from "@/lib/print/clientPays";
import { PAYMENT_CLEARING } from "@/lib/print/holdsDays";

const DAY = 24 * 60 * 60 * 1000;
/** Orders that are books - not a checkout left unpaid, cancelled or skipped. */
const BOOKS = { notIn: ["QUOTED", "CANCELED", "SKIPPED"] as PrintOrderStatus[] };

/** A book's stage, in the order a book passes through them. */
export const STAGES = ["Approved", "In production", "Shipped", "Delivered"] as const;
export type Stage = (typeof STAGES)[number];
const STAGE_OF: Record<string, Stage | null> = {
  // a bank payment clearing (holdsDays.ts): ordered, not yet paid
  QUOTED: "Approved",
  PAID: "Approved",
  SUBMITTED: "Approved",
  IN_PRODUCTION: "In production",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  FAILED: null,
};

async function businessBooks(businessId: string) {
  const clients = await prisma.businessClient.findMany({
    where: { businessId },
    select: { id: true, name: true, plannerId: true, startDate: true, bookMonths: true, archivedAt: true, shippingAddress: true, group: GROUP_PLACE, accessSeenAt: true, templateId: true },
  });
  const templates = await prisma.businessTemplate.findMany({ where: { businessId }, select: { plannerId: true } });
  const ids = [...clients.flatMap((c) => (c.plannerId ? [c.plannerId] : [])), ...templates.map((t) => t.plannerId)];
  const orders = ids.length
    ? await prisma.printOrder.findMany({
        // and a book whose bank payment is clearing: it covers its days
        // (holdsDays.ts, 2026-10-26)
        where: { plannerId: { in: ids }, OR: [{ status: BOOKS }, PAYMENT_CLEARING] },
        select: { id: true, plannerId: true, status: true, startDate: true, endDate: true, createdAt: true, totalCents: true, currency: true, title: true, paidByClient: true, markupCents: true },
        orderBy: { startDate: "asc" },
      })
    : [];
  return { clients, orders };
}

/** What the coach paid: books they ordered, not ones their clients paid for. */
const spentOn = (orders: Array<{ totalCents: number; paidByClient: boolean; status: string }>) =>
  orders.reduce((sum, o) => sum + (o.paidByClient || o.status === "QUOTED" ? 0 : o.totalCents), 0);
/** What reached them of books their clients paid for: each share after the
 *  card fee on it, as Stripe pays it out (clientPays.ts coachReceives). */
const earnedOn = (orders: Array<{ markupCents: number; paidByClient: boolean; status: string }>) =>
  orders.reduce((sum, o) => sum + (o.paidByClient && o.markupCents > 0 && o.status !== "QUOTED" ? coachReceives(o.markupCents) : 0), 0);

const quarterStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));

export type Headline = {
  activeClients: number;
  books: { now: number; before: number };
  spend: { now: number; before: number; currency: string };
  /** Their share of books clients paid for themselves. */
  earned: { now: number; before: number };
  /** Books this quarter a client paid for. */
  clientBooks: number;
  runningOut: number;
};

export type CoverageBook = { id: string; start: string; end: string; stage: Stage | "Needs attention" };
export type CoverageRow = {
  clientId: string;
  name: string;
  books: CoverageBook[];
  /** The last day a book of theirs covers, if any. */
  coveredTo: string | null;
  /** When their first book starts, if no book is ordered yet. */
  firstStart: string | null;
  /** "out": nothing covers today though they have started; "soon": what
   *  covers them ends within 30 days with nothing after it, or they start
   *  within 30 days with no book yet; "ok"; "not started": no book, and a
   *  start more than 30 days away (or none set). */
  state: "out" | "soon" | "ok" | "not started";
};

export type Monthly = Array<{ month: string; label: string; long: string; books: number; spend: number; earned: number }>;
export type Pipeline = Array<{ stage: Stage; count: number }>;
export type SetupStep = { label: string; count: number };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Everything the business's charts draw, in one read. `months` is how far
 *  back the monthly series runs: a count, or "all" - from the month of the
 *  first book, and never fewer than six. */
export async function businessStats(businessId: string, range: number | "all" = 12, now = new Date()) {
  const { clients, orders } = await businessBooks(businessId);
  const first = orders.reduce<Date | null>((a, o) => (!a || o.createdAt < a ? o.createdAt : a), null);
  const months =
    range === "all"
      ? Math.max(6, first ? (now.getUTCFullYear() - first.getUTCFullYear()) * 12 + now.getUTCMonth() - first.getUTCMonth() + 1 : 6)
      : range;
  const active = clients.filter((c) => !c.archivedAt);
  const clientOf = new Map(clients.flatMap((c) => (c.plannerId ? [[c.plannerId, c] as const] : [])));

  // COVERAGE: each active client's books, and whether today and the next 30
  // days are covered
  const soon = new Date(now.getTime() + 30 * DAY);
  const coverage: CoverageRow[] = active
    .map((c) => {
      const books = orders
        .filter((o) => o.plannerId === c.plannerId)
        .map((o) => ({ id: o.id, start: iso(o.startDate), end: iso(o.endDate), stage: STAGE_OF[o.status] ?? ("Needs attention" as const) }));
      // a book that failed is drawn, but covers nobody: it never printed
      const real = books.filter((b) => b.stage !== "Needs attention");
      const last = real.length ? real.reduce((a, b) => (a.end > b.end ? a : b)) : null;
      const coveredTo = last?.end ?? null;
      const today = iso(now);
      const coversToday = real.some((b) => b.start <= today && b.end >= today);
      const startsLater = real.some((b) => b.start > today);
      let state: CoverageRow["state"] = "ok";
      if (!real.length) state = !c.startDate ? "not started" : iso(c.startDate) <= today ? "out" : iso(c.startDate) <= iso(soon) ? "soon" : "not started";
      else if (!coversToday && !startsLater) state = "out";
      else if (coveredTo && coveredTo <= iso(soon)) state = "soon";
      return { clientId: c.id, name: c.name, books, coveredTo, firstStart: c.startDate ? iso(c.startDate) : null, state };
    })
    // the ones that need a book first, then by when they run out
    .sort((a, b) => {
      const rank = { out: 0, soon: 1, ok: 2, "not started": 3 } as const;
      return rank[a.state] - rank[b.state] || (a.coveredTo ?? a.firstStart ?? "9").localeCompare(b.coveredTo ?? b.firstStart ?? "9") || a.name.localeCompare(b.name);
    });

  // HEADLINE: this quarter against the last
  const q = quarterStart(now);
  const lastQ = quarterStart(new Date(q.getTime() - DAY));
  const inRange = (d: Date, from: Date, to: Date) => d >= from && d < to;
  const thisQ = orders.filter((o) => inRange(o.createdAt, q, new Date(Date.UTC(q.getUTCFullYear(), q.getUTCMonth() + 3, 1))));
  const prevQ = orders.filter((o) => inRange(o.createdAt, lastQ, q));
  const headline: Headline = {
    activeClients: active.length,
    books: { now: thisQ.length, before: prevQ.length },
    spend: { now: spentOn(thisQ), before: spentOn(prevQ), currency: orders[0]?.currency ?? "USD" },
    earned: { now: earnedOn(thisQ), before: earnedOn(prevQ) },
    clientBooks: thisQ.filter((o) => o.paidByClient).length,
    runningOut: coverage.filter((r) => r.state === "out" || r.state === "soon").length,
  };

  // MONTHLY: books ordered and money spent, by the month they were ordered
  const monthly: Monthly = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const these = orders.filter((o) => inRange(o.createdAt, start, end));
    monthly.push({
      month: iso(start).slice(0, 7),
      label: start.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      long: start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
      books: these.length,
      spend: spentOn(these),
      earned: earnedOn(these),
    });
  }

  // PIPELINE: books on their way, and the ones delivered in the last 90 days
  const recent = new Date(now.getTime() - 90 * DAY);
  const pipeline: Pipeline = STAGES.map((stage) => ({
    stage,
    count: orders.filter((o) => STAGE_OF[o.status] === stage && (stage !== "Delivered" || o.createdAt >= recent)).length,
  }));
  const needsAttention = orders.filter((o) => o.status === "FAILED").length;

  // SETUP: active clients through the steps to a first book
  const ordered = new Set(orders.flatMap((o) => (o.plannerId && clientOf.has(o.plannerId) ? [o.plannerId] : [])));
  const setup: SetupStep[] = [
    { label: "Added", count: active.length },
    { label: "Address given", count: active.filter((c) => bookAddressOf(c)).length },
    { label: "Journal built", count: active.filter((c) => c.plannerId).length },
    { label: "Opened their page", count: active.filter((c) => c.accessSeenAt).length },
    { label: "First book ordered", count: active.filter((c) => c.plannerId && ordered.has(c.plannerId)).length },
  ];

  return { headline, coverage, monthly, pipeline, needsAttention, setup, currency: headline.spend.currency, today: iso(now), hasBooks: orders.length > 0 };
}

export type BusinessStats = Awaited<ReturnType<typeof businessStats>>;
