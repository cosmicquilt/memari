// memari. for businesses - Groups (2026-10-31, src/lib/businessGroups.ts):
// people who start together - a cohort, a workshop, a retreat - with how
// many are in each, when they start, and where their books go.

import Link from "next/link";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { requireBusiness, shippableAddress } from "@/lib/business";
import css from "../business.module.css";

const date = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Not set");
const length = (m: number) => (m === 1 ? "1 month" : m === 12 ? "A year" : `${m} months`);

export default async function GroupsPage() {
  const { business } = await requireBusiness();
  const groups = await prisma.businessGroup.findMany({
    where: { businessId: business.id },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    include: { template: { include: { planner: { select: { title: true } } } }, _count: { select: { clients: { where: { archivedAt: null } } } } },
  });
  const cols = { "--cols": "minmax(0, 2fr) minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1.4fr)" } as CSSProperties;
  return (
    <>
      <div className={css.head}>
        <h1>Groups</h1>
        <Link href="/app/business/groups/new" className={`${css.btn} ${css.primary}`}>
          New group
        </Link>
      </div>
      <p className={css.dim} style={{ maxWidth: 640 }}>
        People who start together: a cohort, a workshop, a retreat. Add them in one go, on one template and one start date, and order all their books in one payment, sent to
        each of them or all to one place.
      </p>
      {groups.length === 0 ? (
        <div className={css.list}>
          <div className={css.empty}>
            <p>No groups yet.</p>
            <Link href="/app/business/groups/new" className={`${css.btn} ${css.primary}`}>
              New group
            </Link>
          </div>
        </div>
      ) : (
        <div className={css.list} style={cols}>
          <div className={`${css.row} ${css.rowHead}`}>
            <span>Group</span>
            <span>People</span>
            <span>Starts</span>
            <span>Template</span>
            <span>Books go</span>
          </div>
          {groups.map((g) => {
            const place = g.shipToVenue ? shippableAddress(g.venueAddress) : null;
            return (
              <Link key={g.id} href={`/app/business/groups/${g.id}`} className={css.row}>
                <span className={`${css.cell} ${css.strong}`}>{g.name}</span>
                <span className={css.cell}>
                  <span className={css.label}>People</span>
                  {g._count.clients}
                </span>
                <span className={css.cell}>
                  <span className={css.label}>Starts</span>
                  {date(g.startDate)}
                  <span className={css.dim}> · {length(g.bookMonths)}</span>
                </span>
                <span className={css.cell}>
                  <span className={css.label}>Template</span>
                  {g.template?.planner.title ?? <span className={css.dim}>Each their own</span>}
                </span>
                <span className={css.cell}>
                  <span className={css.label}>Books go</span>
                  {g.shipToVenue ? place ? `${place.name}, ${place.city}` : <span className={`${css.tag} ${css.tagWarn}`}>Place needs an address</span> : "Each to their own address"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
