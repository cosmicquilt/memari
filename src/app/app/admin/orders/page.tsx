// memari.studio/app/admin/orders - every order, the ones that need a person
// first: paid but not printing (FAILED, or stuck at PAID for over an hour),
// then shipped books that may not have arrived (src/lib/print/delivery.ts).
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
import { LISTED } from "@/lib/print/holdsDays";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const owner = await currentOwner();
  if (!owner || owner.guest || !isAdmin(owner.id)) notFound();

  const hourAgo = anHourAgo();
  const [attention, notArrived, recent] = await Promise.all([
    prisma.printOrder.findMany({
      where: {
        stripePaymentIntentId: { not: null },
        OR: [{ status: "FAILED" }, { status: "PAID", updatedAt: { lt: hourAgo } }],
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.printOrder.findMany({ where: { status: { in: ["SHIPPED", "DELIVERED"] }, deliveryProblem: { not: null } }, orderBy: { shippedAt: "asc" } }),
    prisma.printOrder.findMany({ where: { OR: LISTED }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const needing = new Set([...attention, ...notArrived].map((o) => o.id));

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
        {(order.shippedAt || order.trackingCode) && <Delivery order={order} />}
        <OrderActions
          orderId={order.id}
          canRetry={paid && (order.status === "FAILED" || order.status === "PAID")}
          canRefund={paid && order.status !== "CANCELED"}
          canMarkArrived={!!order.deliveryProblem || order.status === "SHIPPED"}
        />
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
        <h2 style={{ margin: "12px 0 0", fontSize: 13, color: cream(0.6), textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Not arrived ({notArrived.length})
        </h2>
        {notArrived.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: cream(0.5) }}>Every shipped book is moving or answered for.</p> : notArrived.map(row)}
        <h2 style={{ margin: "12px 0 0", fontSize: 13, color: cream(0.6), textTransform: "uppercase", letterSpacing: "0.06em" }}>Recent</h2>
        {recent.filter((o) => !needing.has(o.id)).map(row)}
      </div>
    </main>
  );
}

type Order = Awaited<ReturnType<typeof prisma.printOrder.findMany>>[number];

/** Where a shipped book is: days since it left, the carrier's last word, the
 *  customer's answer, and why it is flagged. */
function Delivery({ order }: { order: Order }) {
  const days = order.shippedAt ? daysSince(order.shippedAt) : null;
  const links = Array.isArray(order.trackingUrls) ? (order.trackingUrls as string[]) : [];
  const answer = order.arrivalAnswer === "ARRIVED" ? "customer: arrived" : order.arrivalAnswer === "NOT_YET" ? "customer: not yet" : order.arrivalAskedAt ? "customer: asked, no answer" : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, lineHeight: 1.5 }}>
      <div style={{ color: cream(0.6) }}>
        {order.shippedAt ? `shipped ${order.shippedAt.toISOString().slice(0, 10)} (${days} day${days === 1 ? "" : "s"} ago)` : "shipped (date unknown)"}
        {order.deliveredAt ? ` · delivered ${order.deliveredAt.toISOString().slice(0, 10)}` : ""}
        {` · carrier: ${order.trackerStatus ? order.trackerStatus.replace(/_/g, " ") : order.trackingCode ? "not read yet" : "no tracking number"}`}
        {answer ? ` · ${answer}` : ""}
        {links.map((url, index) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" style={{ color: "#8fa0ff", marginLeft: 8 }}>
            {links.length > 1 ? `tracking ${index + 1}` : "tracking"}
          </a>
        ))}
      </div>
      {order.deliveryProblem && <div style={{ color: "#ffb4a8" }}>{order.deliveryProblem}</div>}
    </div>
  );
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

/** "Stuck" means paid and still not with the printer an hour on - the
 *  printer's own cancellation window, after which it would have printed. */
function anHourAgo(): Date {
  return new Date(Date.now() - 60 * 60 * 1000);
}
