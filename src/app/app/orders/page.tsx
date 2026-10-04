// memari.studio/app/orders - the person's printed books: what each covers,
// where it is, and whether it renews. Stripe's payment page returns here
// (?placed=<order>), possibly before its webhook has said the order is paid,
// so that order is shown even while it is still waiting.

import { redirect } from "next/navigation";
import { currentOwner, signInPath } from "@/lib/owner";
import { prisma } from "@/lib/prisma";
import { BINDING_SPECS, type Binding } from "@/lib/print/products";
import { formatCents } from "@/lib/print/pricing";
import { SHIPPING_LABELS } from "@/lib/print/orders";
import { rangeLabel } from "@/lib/print/orderBook";
import type { ShippingLevel } from "@/lib/print/orderRange";
import { CREAM, cream, onCream } from "@/lib/cream";
import { AutoRenewSwitch } from "./AutoRenewSwitch";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  QUOTED: "Confirming payment…",
  PAID: "Paid - sending to the printer",
  SUBMITTED: "With the printer",
  IN_PRODUCTION: "Printing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELED: "Cancelled",
  FAILED: "Needs attention - we will be in touch",
};

const BINDING_KEY: Record<string, Binding> = { COIL: "coil", PAPERBACK: "paperback", HARDCOVER: "hardcover" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ placed?: string }> }) {
  const owner = await currentOwner();
  if (!owner) redirect(signInPath("/app/orders"));
  const { placed } = await searchParams;
  const orders = owner.guest
    ? []
    : await prisma.printOrder.findMany({
        where: { ownerId: owner.id, OR: [{ status: { not: "QUOTED" } }, ...(placed ? [{ id: placed }] : [])] },
        orderBy: { createdAt: "desc" },
      });

  return (
    <main style={{ minHeight: "100vh", background: "#141414", color: onCream(0xdd), padding: "40px 16px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <header style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 20, color: CREAM, flex: 1 }}>Your printed books</h1>
          <a href="/app" style={{ fontSize: 13, color: cream(0.6) }}>Back to your journals</a>
        </header>
        {placed && (
          <p style={{ margin: 0, padding: "10px 12px", fontSize: 13, background: cream(0.06), borderRadius: 6, lineHeight: 1.5 }}>
            Thank you - your order is placed. Stripe emails a receipt; the book goes to the printer as soon as the payment is confirmed.
          </p>
        )}
        {owner.guest && <p style={{ margin: 0, fontSize: 13 }}>Sign in to order printed books and see them here.</p>}
        {!owner.guest && orders.length === 0 && (
          <p style={{ margin: 0, fontSize: 13, color: cream(0.6) }}>No printed books yet. Order one from a journal with Order print.</p>
        )}
        {orders.map((order) => {
          const binding = BINDING_SPECS[BINDING_KEY[order.binding]];
          const tracking = Array.isArray(order.trackingUrls) ? (order.trackingUrls as string[]) : [];
          return (
            <article key={order.id} style={{ padding: 14, background: "#1c1c1e", border: `1px solid ${cream(0.1)}`, borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <strong style={{ flex: 1, minWidth: 0, color: CREAM, fontSize: 14 }}>{order.title}</strong>
                <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{formatCents(order.totalCents)}</span>
              </div>
              <div style={{ fontSize: 12, color: cream(0.6), lineHeight: 1.5 }}>
                {rangeLabel({ start: order.startDate, end: order.endDate, days: order.days })} · {order.days} days · {binding.label} · {order.pageCount} pages ·{" "}
                {SHIPPING_LABELS[order.shippingLevel as ShippingLevel] ?? order.shippingLevel}
              </div>
              <div style={{ fontSize: 13, color: order.status === "FAILED" ? "#ff8a80" : CREAM }}>{STATUS_LABELS[order.status] ?? order.status}</div>
              {tracking.length > 0 && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
                  {tracking.map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" style={{ color: "#8a97ff" }}>
                      Track parcel{tracking.length > 1 ? ` ${index + 1}` : ""}
                    </a>
                  ))}
                </div>
              )}
              {order.status !== "QUOTED" && order.status !== "CANCELED" && (
                <AutoRenewSwitch orderId={order.id} on={order.autoRenew} renewsAt={order.renewsAt?.toISOString() ?? null} days={order.days} />
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
