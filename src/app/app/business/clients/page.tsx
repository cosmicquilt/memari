// memari. for businesses - Clients: everyone the business makes books for,
// with what each still needs. Archived clients on their own tab. Over the
// current list (2026-10-22): how many have reached each step on the way to
// a first book - where setup gets stuck, which the list shows one by one.

import Link from "next/link";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { requireBusiness, shippableAddress } from "@/lib/business";
import { businessStats } from "@/lib/businessStats";
import { BarList, ChartCard } from "../charts";
import { RestoreClientButton } from "../forms";
import css from "../business.module.css";

const date = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Not set");
const length = (m: number) => (m === 1 ? "1 month" : m === 12 ? "A year" : `${m} months`);

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { business } = await requireBusiness();
  const archived = (await searchParams).show === "archived";
  const clients = await prisma.businessClient.findMany({
    where: { businessId: business.id, archivedAt: archived ? { not: null } : null },
    orderBy: [{ name: "asc" }],
    include: { template: { include: { planner: { select: { title: true } } } } },
  });
  const setup = archived || !clients.length ? null : (await businessStats(business.id, 1)).setup;
  const cols = { "--cols": archived ? "minmax(0, 2fr) minmax(0, 1.4fr) auto" : "minmax(0, 2fr) minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr)" } as CSSProperties;
  return (
    <>
      <div className={css.head}>
        <h1>Clients</h1>
        <Link href="/app/business/clients/new" className={`${css.btn} ${css.primary}`}>
          Add client
        </Link>
      </div>
      {setup && (
        <ChartCard
          title="On the way to a first book"
          sub={`How many of your ${setup[0].count} current ${setup[0].count === 1 ? "client has" : "clients have"} done each step.`}
          table={{ head: ["Step", "Clients", "Of all"], rows: setup.map((s) => [s.label, s.count, `${Math.round((s.count / Math.max(1, setup[0].count)) * 100)}%`]) }}
        >
          <BarList steps={setup.slice(1)} of={setup[0].count} />
        </ChartCard>
      )}
      <div className={css.actions}>
        <Link href="/app/business/clients" className={css.btn} aria-current={archived ? undefined : "page"} style={archived ? undefined : { background: "var(--here)", color: "var(--accent)" }}>
          Current
        </Link>
        <Link href="/app/business/clients?show=archived" className={css.btn} aria-current={archived ? "page" : undefined} style={archived ? { background: "var(--here)", color: "var(--accent)" } : undefined}>
          Archived
        </Link>
      </div>
      {clients.length === 0 ? (
        <div className={css.list}>
          <div className={css.empty}>
            {archived ? (
              <p>No archived clients.</p>
            ) : (
              <>
                <p>No clients yet. Add one, and where their books go.</p>
                <Link href="/app/business/clients/new" className={`${css.btn} ${css.primary}`}>
                  Add client
                </Link>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className={css.list} style={cols}>
          <div className={`${css.row} ${css.rowHead}`}>
            <span>Name</span>
            <span>Template</span>
            {!archived && (
              <>
                <span>Starts</span>
                <span>Each book</span>
                <span>Needs</span>
              </>
            )}
            {archived && <span />}
          </div>
          {clients.map((c) => {
            const needs = [
              !shippableAddress(c.shippingAddress) && "Address",
              !c.templateId && "Template",
              !c.startDate && "Start date",
              c.templateId && !c.plannerId && "Journal",
            ].filter(Boolean) as string[];
            const cells = (
              <>
                <span className={`${css.cell} ${css.strong}`}>
                  {c.name}
                  {c.coverName && <span className={css.dim} style={{ fontWeight: 400 }}> · cover: {c.coverName}</span>}
                </span>
                <span className={css.cell}>
                  <span className={css.label}>Template</span>
                  {c.template?.planner.title ?? <span className={css.dim}>Not chosen</span>}
                </span>
              </>
            );
            if (archived)
              return (
                <div key={c.id} className={css.row}>
                  {cells}
                  <span>
                    <RestoreClientButton id={c.id} />
                  </span>
                </div>
              );
            return (
              <Link key={c.id} href={`/app/business/clients/${c.id}`} className={css.row}>
                {cells}
                <span className={css.cell}>
                  <span className={css.label}>Starts</span>
                  {date(c.startDate)}
                </span>
                <span className={css.cell}>
                  <span className={css.label}>Each book</span>
                  {length(c.bookMonths)}
                </span>
                <span className={css.cell}>
                  {needs.length ? (
                    needs.map((n) => (
                      <span key={n} className={`${css.tag} ${css.tagWarn}`} style={{ marginRight: 4 }}>
                        {n}
                      </span>
                    ))
                  ) : (
                    <span className={`${css.tag} ${css.tagOk}`}>Ready</span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
