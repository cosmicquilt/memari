// memari. for businesses - Orders: every book made from the business's
// journals - samples of its templates and its clients' books - with where
// each one is.

import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { ORDER_WORDS, businessJournalIds, currentBusiness } from "@/lib/business";
import css from "../business.module.css";

const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const money = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

export default async function OrdersPage() {
  const business = (await currentBusiness())!.business!;
  const journals = await businessJournalIds(business.id);
  const ids = [...journals.templates, ...journals.clients];
  const [orders, clients] = await Promise.all([
    ids.length ? prisma.printOrder.findMany({ where: { plannerId: { in: ids }, status: { not: "QUOTED" } }, orderBy: { createdAt: "desc" } }) : [],
    prisma.businessClient.findMany({ where: { businessId: business.id, plannerId: { not: null } }, select: { plannerId: true, name: true } }),
  ]);
  const clientOf = new Map(clients.map((c) => [c.plannerId!, c.name]));
  const cols = { "--cols": "minmax(0, 1.6fr) minmax(0, 1.6fr) minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 0.8fr)" } as CSSProperties;
  return (
    <>
      <h1>Orders</h1>
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
            const word = ORDER_WORDS[o.status] ?? o.status;
            const tone = o.status === "FAILED" ? css.tagWarn : o.status === "DELIVERED" || o.status === "SHIPPED" ? css.tagOk : "";
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
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
