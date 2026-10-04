// memari.studio/app/admin/orders - every order, the ones that need a person
// first: paid but not printing (FAILED, or stuck at PAID for over an hour).
// Only for the accounts in ADMIN_OWNER_IDS; anyone else gets a 404, so the
// page does not say it exists.

import { notFound } from "next/navigation";
import { currentOwner } from "@/lib/owner";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/print/admin";
import { formatCents } from "@/lib/print/pricing";
import { rangeLabel } from "@/lib/print/orderBook";
import { BINDING_SPECS, bindingFromEnum } from "@/lib/print/products";
import { CREAM, cream, onCream } from "@/lib/cream";
import { OrderActions } from "./OrderActions";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const owner = await currentOwner();
  if (!owner || owner.guest || !isAdmin(owner.id)) notFound();

  const hourAgo = anHourAgo();
  const [attention, recent] = await Promise.all([
    prisma.printOrder.findMany({
      where: {
        stripePaymentIntentId: { not: null },
        OR: [{ status: "FAILED" }, { status: "PAID", updatedAt: { lt: hourAgo } }],
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.printOrder.findMany({ where: { status: { not: "QUOTED" } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const needing = new Set(attention.map((o) => o.id));

  const row = (order: (typeof recent)[number]) => {
    const paid = !!order.stripePaymentIntentId;
    return (
      <article key={order.id} style={{ padding: 12, background: "#1c1c1e", border: `1px solid ${needing.has(order.id) ? "#8a2a22" : cream(0.1)}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
          <strong style={{ flex: 1, minWidth: 0, color: CREAM, fontSize: 13 }}>{order.title}</strong>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatCents(order.totalCents)}</span>
          <span style={{ color: order.status === "FAILED" ? "#ff8a80" : CREAM }}>{order.status}</span>
        </div>
        <div style={{ color: cream(0.6), lineHeight: 1.5 }}>
          {rangeLabel({ start: order.startDate, end: order.endDate, days: order.days })} · {BINDING_SPECS[bindingFromEnum(order.binding)].label} · {order.pageCount} pages · {order.shippingLevel} ·{" "}
          {(order.shippingAddress as { countryCode?: string }).countryCode} · placed {order.createdAt.toISOString().slice(0, 16).replace("T", " ")}
        </div>
        <div style={{ color: cream(0.45), fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
          order {order.id} · owner {order.ownerId} · stripe {order.stripePaymentIntentId ?? "-"} · lulu {order.luluPrintJobId ?? "-"} {order.luluStatus ? `(${order.luluStatus})` : ""}
          {order.renewedFromId ? ` · renewal of ${order.renewedFromId}` : ""}
        </div>
        {order.failureReason && <div style={{ color: cream(0.75), lineHeight: 1.5 }}>{order.failureReason}</div>}
        <OrderActions orderId={order.id} canRetry={paid && (order.status === "FAILED" || order.status === "PAID")} canRefund={paid && order.status !== "CANCELED"} />
      </article>
    );
  };

  return (
    <main style={{ minHeight: "100vh", background: "#141414", color: onCream(0xdd), padding: "32px 16px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: 18, color: CREAM }}>Orders - admin</h1>
        <h2 style={{ margin: "8px 0 0", fontSize: 13, color: cream(0.6), textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Needs attention ({attention.length})
        </h2>
        {attention.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: cream(0.5) }}>Nothing paid is stuck.</p> : attention.map(row)}
        <h2 style={{ margin: "12px 0 0", fontSize: 13, color: cream(0.6), textTransform: "uppercase", letterSpacing: "0.06em" }}>Recent</h2>
        {recent.filter((o) => !needing.has(o.id)).map(row)}
      </div>
    </main>
  );
}

/** "Stuck" means paid and still not with the printer an hour on - the
 *  printer's own cancellation window, after which it would have printed. */
function anHourAgo(): Date {
  return new Date(Date.now() - 60 * 60 * 1000);
}
