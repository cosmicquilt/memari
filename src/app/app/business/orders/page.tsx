// memari. for businesses - Orders: every book made from the business's
// journals - samples of its templates and its clients' books - with where
// each one is. Over the list (2026-10-22), the charts: first where the books
// are now, as one bar split by stage; then books ordered and money spent by
// month, as two charts side by side (two measures, never one chart with two
// scales), the months they cover chosen in one row above them.

import Link from "next/link";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { ORDER_WORDS, businessJournalIds, currentBusiness } from "@/lib/business";
import { businessStats } from "@/lib/businessStats";
import { coachReceives } from "@/lib/print/clientPays";
import { ChartCard, Columns, StageBar, WarnIcon } from "../charts";
import css from "../business.module.css";
import { LISTED } from "@/lib/print/holdsDays";
import { refundDue } from "@/lib/print/refundDue";

const RANGES = [
  { key: "6", label: "6 months" },
  { key: "12", label: "12 months" },
  { key: "all", label: "All" },
] as const;

const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const money = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const business = (await currentBusiness())!.business!;
  const asked = (await searchParams).range;
  const range = RANGES.find((r) => r.key === asked)?.key ?? "12";
  const [journals, stats] = await Promise.all([businessJournalIds(business.id), businessStats(business.id, range === "all" ? "all" : Number(range))]);
  const ids = [...journals.templates, ...journals.clients];
  const [orders, clients] = await Promise.all([
    ids.length ? prisma.printOrder.findMany({ where: { plannerId: { in: ids }, OR: LISTED }, orderBy: { createdAt: "desc" } }) : [],
    prisma.businessClient.findMany({ where: { businessId: business.id, plannerId: { not: null } }, select: { plannerId: true, name: true } }),
  ]);
  const clientOf = new Map(clients.map((c) => [c.plannerId!, c.name]));
  const cols = { "--cols": "minmax(0, 1.6fr) minmax(0, 1.6fr) minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 0.8fr)" } as CSSProperties;
  const spend = stats.monthly.map((m) => ({ label: m.label, long: m.long, value: m.spend / 100 }));
  const books = stats.monthly.map((m) => ({ label: m.label, long: m.long, value: m.books }));
  const onTheirWay = stats.pipeline.reduce((s, p) => s + p.count, 0);
  return (
    <>
      <h1>Orders</h1>
      {stats.hasBooks && (
        <>
          <ChartCard
            title="Where the books are"
            sub={
              <>
                {onTheirWay} {onTheirWay === 1 ? "book" : "books"} on the way or delivered in the last 90 days.
                {stats.needsAttention > 0 && (
                  <span className={css.attention}>
                    <WarnIcon /> {stats.needsAttention} {stats.needsAttention === 1 ? "needs" : "need"} attention, below
                  </span>
                )}
              </>
            }
            table={{ head: ["Stage", "Books"], rows: stats.pipeline.map((p) => [p.stage, p.count]) }}
          >
            <StageBar stages={stats.pipeline.map((p) => ({ label: p.stage, count: p.count }))} label="Books by stage" />
          </ChartCard>
          <section className={css.chartGroup} aria-label="By month">
          <nav className={css.range} aria-label="Months the charts cover">
            {RANGES.map((r) => (
              <Link key={r.key} href={r.key === "12" ? "/app/business/orders" : `/app/business/orders?range=${r.key}`} aria-current={r.key === range ? "page" : undefined} scroll={false}>
                {r.label}
              </Link>
            ))}
          </nav>
          <div className={css.chartPair}>
            <ChartCard
              title="Books ordered"
              sub="By the month each was ordered, samples included."
              table={{ head: ["Month", "Books"], rows: books.map((b) => [b.long, b.value]) }}
            >
              <Columns data={books} label="Books ordered" />
            </ChartCard>
            <ChartCard
              title="Spent"
              sub="What you paid each month, shipping included. Books your clients paid for are not in it."
              table={{ head: ["Month", "Spent"], rows: spend.map((b) => [b.long, money(b.value * 100, stats.currency)]) }}
            >
              <Columns data={spend} label="Spent" currency={stats.currency} />
            </ChartCard>
          </div>
          </section>
        </>
      )}
      {orders.length === 0 ? (
        <div className={css.list}>
          <div className={css.empty}>
            <p>No books ordered yet. Start with a sample of a template, from Templates.</p>
          </div>
        </div>
      ) : (
        <div className={css.list} style={cols}>
          <div className={`${css.row} ${css.rowHead}`}>
            <span>For</span>
            <span>Book</span>
            <span>Covers</span>
            <span>Status</span>
            <span>Total</span>
          </div>
          {orders.map((o) => {
            const who = o.plannerId && clientOf.get(o.plannerId);
            // cancelled with the money still taken: the printer stopped
            // it, or a refund failed (refundDue.ts) - ours to refund
            const owed = o.status === "CANCELED" && refundDue(o);
            const word = owed ? "Cancelled, refund due" : (ORDER_WORDS[o.status] ?? o.status);
            const tone = o.status === "FAILED" || owed ? css.tagWarn : o.status === "DELIVERED" || o.status === "SHIPPED" ? css.tagOk : "";
            return (
              <div key={o.id} className={css.row}>
                <span className={`${css.cell} ${css.strong}`}>{who ?? <span className={css.dim}>Sample for you</span>}</span>
                <span className={css.cell}>
                  <span className={css.label}>Book</span>
                  {o.title}
                </span>
                <span className={css.cell}>
                  <span className={css.label}>Covers</span>
                  {date(o.startDate)} to {date(o.endDate)}
                </span>
                <span className={css.cell}>
                  <span className={`${css.tag} ${tone}`}>{word}</span>
                </span>
                <span className={css.cell}>
                  <span className={css.label}>Total</span>
                  {money(o.totalCents, o.currency)}
                  {o.paidByClient && (
                    <span className={css.dim} style={{ display: "block", fontSize: 12 }}>
                      {o.status === "CANCELED"
                        ? owed
                          ? "Paid by them, not refunded yet"
                          : "Paid by them, refunded"
                        : o.status === "QUOTED"
                          ? "Paid by them from a bank account, still clearing"
                          : `Paid by them${o.markupCents ? `, you receive ${money(coachReceives(o.markupCents), o.currency)}` : ""}`}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
