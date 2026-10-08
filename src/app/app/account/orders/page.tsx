// memari.studio/app/account/orders - the person's printed books: what each
// covers, where it is, and whether it renews. It was /app/orders until the
// account page (2026-10-08); that address still comes here, so Stripe's
// payment page - which returns with ?placed=<order>, possibly before its
// webhook has said the order is paid - and the emails' links keep working.
//
// Two things to do from here besides auto-renew: ORDER THE NEXT one - on
// each journal's latest book, unless auto-renew will order it anyway - which
// opens the journal's order screen filled in from that book; and CANCEL a
// book the printer has not begun (orders.ts, customerCanCancel).

import { redirect } from "next/navigation";
import { currentOwner, signInPath } from "@/lib/owner";
import { prisma } from "@/lib/prisma";
import { BINDING_SPECS, bindingFromEnum } from "@/lib/print/products";
import { formatCents } from "@/lib/print/pricing";
import { customerCanCancel, SHIPPING_LABELS } from "@/lib/print/orders";
import { rangeLabel } from "@/lib/print/orderBook";
import type { ShippingLevel } from "@/lib/print/orderRange";
import { CREAM, cream } from "@/lib/cream";
import { AutoRenewSwitch } from "./AutoRenewSwitch";
import { CancelOrderButton } from "./CancelOrderButton";
import { journalSlugOf } from "@/app/planner/journalSlugs";

export const dynamic = "force-dynamic";

/** A book that was, or is being, printed. */
const PRINTED = ["PAID", "SUBMITTED", "IN_PRODUCTION", "SHIPPED", "DELIVERED"];

const STATUS_LABELS: Record<string, string> = {
  QUOTED: "Confirming payment…",
  PAID: "Paid, sending to the printer",
  SUBMITTED: "With the printer",
  IN_PRODUCTION: "Printing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELED: "Cancelled",
  FAILED: "Needs attention. We will be in touch",
};


export default async function PrintedBooksPage({ searchParams }: { searchParams: Promise<{ placed?: string }> }) {
  const owner = await currentOwner();
  if (!owner) redirect(signInPath("/app/account/orders"));
  const { placed } = await searchParams;
  const orders = owner.guest
    ? []
    : await prisma.printOrder.findMany({
        where: { ownerId: owner.id, OR: [{ status: { not: "QUOTED" } }, ...(placed ? [{ id: placed }] : [])] },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { renewals: true } } },
      });

  // "Order the next": each journal's latest book - by the last day it
  // covers - or a renewal that was never ordered, which IS the next one.
  // Only the latest, so two books for one journal do not both offer the
  // days the second already covers.
  const latest = new Map<string, (typeof orders)[number]>();
  for (const order of orders) {
    const unordered = order.status === "FAILED" && !!order.renewedFromId;
    if (!order.plannerId || !(PRINTED.includes(order.status) || unordered)) continue;
    const held = latest.get(order.plannerId);
    if (!held || order.endDate > held.endDate) latest.set(order.plannerId, order);
  }
  const nextLinks = new Map<string, string>();
  for (const [plannerId, order] of latest) {
    // Auto-renew will order it - no need to ask.
    if (order.autoRenew && order.status !== "FAILED") continue;
    try {
      nextLinks.set(order.id, `/app/j/${await journalSlugOf(plannerId)}?reorder=${order.id}`);
    } catch {
      // The journal went between the two reads - no link.
    }
  }

  return (
    <>
      <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 18 }}>
        <h1>Orders</h1>
        {placed && (
          <p style={{ margin: 0, padding: "10px 12px", fontSize: 13, background: cream(0.06), borderRadius: 6, lineHeight: 1.5 }}>
            Thank you, your order is placed. Stripe emails a receipt; the book goes to the printer as soon as the payment is confirmed.
          </p>
        )}
        {owner.guest && <p style={{ margin: 0, fontSize: 13 }}>Sign in to order printed books and see them here.</p>}
        {!owner.guest && orders.length === 0 && (
          <p style={{ margin: 0, fontSize: 13, color: cream(0.6) }}>No printed books yet. Order one from a journal with Order print.</p>
        )}
        {orders.map((order) => {
          const binding = BINDING_SPECS[bindingFromEnum(order.binding)];
          const tracking = Array.isArray(order.trackingUrls) ? (order.trackingUrls as string[]) : [];
          // A renewal that was never ordered has no book and no price.
          const unordered = order.status === "FAILED" && !!order.renewedFromId;
          // The switch belongs to the book that will renew next: not one that
          // failed or was cancelled, and not one already renewed - its
          // renewal carries the switch on.
          const renewable = PRINTED.includes(order.status) && order._count.renewals === 0;
          const next = nextLinks.get(order.id);
          return (
            <article key={order.id} style={{ padding: 14, background: "#1c1c1e", border: `1px solid ${cream(0.1)}`, borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <strong style={{ flex: 1, minWidth: 0, color: CREAM, fontSize: 14 }}>{order.title}</strong>
                {!unordered && <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{formatCents(order.totalCents)}</span>}
              </div>
              <div style={{ fontSize: 12, color: cream(0.6), lineHeight: 1.5 }}>
                {rangeLabel({ start: order.startDate, end: order.endDate, days: order.days })} · {order.days} days · {binding.label}
                {!unordered && ` · ${order.pageCount} pages · ${SHIPPING_LABELS[order.shippingLevel as ShippingLevel] ?? order.shippingLevel}`}
              </div>
              <div style={{ fontSize: 13, color: order.status === "FAILED" ? "#ff8a80" : CREAM }}>
                {order.status === "FAILED" && order.renewedFromId
                  ? "Renewal not ordered"
                  : (STATUS_LABELS[order.status] ?? order.status)}
              </div>
              {/* A failed RENEWAL's reason is written for the customer (renewals.ts);
                  any other failure's is ours, and stays off the page. */}
              {order.status === "FAILED" && order.renewedFromId && order.failureReason && (
                <p style={{ margin: 0, fontSize: 12, color: cream(0.7), lineHeight: 1.5 }}>{order.failureReason}</p>
              )}
              {tracking.length > 0 && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
                  {tracking.map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" style={{ color: "#8a97ff" }}>
                      Track parcel{tracking.length > 1 ? ` ${index + 1}` : ""}
                    </a>
                  ))}
                </div>
              )}
              {renewable && (
                <AutoRenewSwitch orderId={order.id} on={order.autoRenew} renewsAt={order.renewsAt?.toISOString() ?? null} days={order.days} />
              )}
              {(customerCanCancel(order) || next) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start" }}>
                  {next && (
                    <a href={next} style={{ padding: "5px 10px", fontSize: 12, background: "rgba(74, 92, 255, 0.28)", color: CREAM, borderRadius: 6, textDecoration: "none" }}>
                      {unordered ? `Order these ${order.days} days` : `Order the next ${order.days} days`}
                    </a>
                  )}
                  {customerCanCancel(order) && <CancelOrderButton orderId={order.id} total={formatCents(order.totalCents)} />}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
