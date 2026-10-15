// memari.studio/app/account/orders - the person's printed books: what each
// covers, where it is, and whether it renews. It was /app/orders until the
// account page (2026-10-08); that address still comes here, so Stripe's
// payment page - which returns with ?placed=<order>, possibly before its
// webhook has said the order is paid - and the emails' links keep working.
//
// At the top, COMING UP: each journal's next book that auto-renew will
// order, with Change pages, Skip this one and Stop auto-renew one press away
// (2026-10-15: "One-click skip and cancel, never buried" - RenewalControls,
// renewalControls.ts). Below, every book. Besides auto-renew: ORDER THE
// NEXT one - on each journal's latest book, unless auto-renew will order it
// anyway - which opens the journal's order screen filled in from that book;
// CANCEL a book the printer has not begun (orders.ts, customerCanCancel);
// and UNDO a skip while the book after it has not been ordered.
//
// A GUEST sees the books they bought as a guest (2026-10-15, guest
// checkout), with no auto-renew - that needs an account - and a prompt to
// sign in, which brings the orders and the journal to the account.

import { redirect } from "next/navigation";
import { currentOwner, signInPath } from "@/lib/owner";
import { prisma } from "@/lib/prisma";
import { bindingDescription, bindingFromEnum } from "@/lib/print/products";
import { formatCents } from "@/lib/print/pricing";
import { customerCanCancel } from "@/lib/print/orders";
import { shippingLabel } from "@/lib/print/printer";
import { rangeLabel } from "@/lib/print/orderBook";
import { CREAM, cream } from "@/lib/cream";
import { CHAIN_STATUSES, RENEWABLE_STATUSES, skipPreview } from "@/lib/print/renewalControls";
import { AutoRenewSwitch } from "./AutoRenewSwitch";
import { CancelOrderButton } from "./CancelOrderButton";
import { ComingUpList, UndoSkipButton, type ComingUp } from "./RenewalControls";
import { journalSlugOf } from "@/app/planner/journalSlugs";

export const dynamic = "force-dynamic";

/** A journal's books in order: printed or being printed, or skipped. */
const CHAIN: readonly string[] = CHAIN_STATUSES;

const longDate = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const STATUS_LABELS: Record<string, string> = {
  QUOTED: "Confirming payment…",
  PAID: "Paid, sending to the printer",
  SUBMITTED: "With the printer",
  IN_PRODUCTION: "Printing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELED: "Cancelled",
  FAILED: "Needs attention. We will be in touch",
  SKIPPED: "Skipped: not printed or charged",
};


export default async function PrintedBooksPage({ searchParams }: { searchParams: Promise<{ placed?: string }> }) {
  const owner = await currentOwner();
  if (!owner) redirect(signInPath("/app/account/orders"));
  const { placed } = await searchParams;
  const orders = await prisma.printOrder.findMany({
    where: { ownerId: owner.id, OR: [{ status: { not: "QUOTED" } }, ...(placed ? [{ id: placed }] : [])] },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { renewals: true } } },
  });

  // Each journal's latest book - by the last day it covers, then the newest
  // (isChainHead in renewalControls.ts) - or a renewal that was never
  // ordered, which IS the next one. Only the latest carries auto-renew and
  // "Order the next", so two books for one journal do not both offer the
  // days the second already covers.
  const latest = new Map<string, (typeof orders)[number]>();
  for (const order of orders) {
    const unordered = order.status === "FAILED" && !!order.renewedFromId;
    if (!order.plannerId || !(CHAIN.includes(order.status) || unordered)) continue;
    const held = latest.get(order.plannerId);
    if (!held || order.endDate > held.endDate || (order.endDate.getTime() === held.endDate.getTime() && order.createdAt > held.createdAt)) latest.set(order.plannerId, order);
  }
  const heads = new Set([...latest.values()].map((order) => order.id));
  const journalLinks = new Map<string, string>();
  for (const plannerId of latest.keys()) {
    try {
      journalLinks.set(plannerId, `/app/j/${await journalSlugOf(plannerId)}`);
    } catch {
      // The journal went between the two reads - no link.
    }
  }

  // Coming up: the books auto-renew will order, soonest first.
  const now = new Date();
  const comingUp: ComingUp[] = [...latest.values()]
    .filter((order) => order.autoRenew && order.renewsAt && (RENEWABLE_STATUSES as readonly string[]).includes(order.status) && order._count.renewals === 0)
    .sort((a, b) => a.renewsAt!.getTime() - b.renewsAt!.getTime())
    .map((order) => {
      const preview = skipPreview(order, now);
      return {
        key: order.plannerId!,
        orderId: order.id,
        title: order.title,
        range: rangeLabel(preview.skipped),
        days: preview.skipped.days,
        orderedOn: longDate(order.renewsAt!),
        afterRange: rangeLabel(preview.after),
        afterOrderedOn: longDate(preview.afterOrderedOn),
        pagesHref: journalLinks.get(order.plannerId!) ?? null,
      };
    });
  const nextLinks = new Map<string, string>();
  for (const [plannerId, order] of latest) {
    // Auto-renew will order it - no need to ask.
    if (order.autoRenew && order.status !== "FAILED") continue;
    const journal = journalLinks.get(plannerId);
    if (journal) nextLinks.set(order.id, `${journal}?reorder=${order.id}`);
  }

  return (
    <>
      <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 18 }}>
        <h1>Orders</h1>
        {placed && (
          <p style={{ margin: 0, padding: "10px 12px", fontSize: 13, background: cream(0.06), borderRadius: 6, lineHeight: 1.5 }}>
            Thank you, your order is placed. Stripe emails a receipt; the book goes to the printer as soon as the payment is confirmed, and we email you when it ships.
          </p>
        )}
        {owner.guest && orders.length > 0 && (
          <div className="acct-card" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ flex: "1 1 280px", minWidth: 0 }}>
              You ordered as a guest, so these live in this browser. Sign in to keep your orders and your journal together, on any device.
            </span>
            <a href={signInPath("/app/account/orders")} className="acct-btn acct-primary">
              Sign in
            </a>
          </div>
        )}
        <ComingUpList items={comingUp} />
        {/* 32px between groups, no rule between them: 18 of gap and 14 here. */}
        {comingUp.length > 0 && <h2 style={{ margin: "14px 0 0", fontSize: 11, fontWeight: 600, color: cream(0.6), textTransform: "uppercase", letterSpacing: "0.06em" }}>Your books</h2>}
        {orders.length === 0 && (
          <p style={{ margin: 0, fontSize: 13, color: cream(0.6) }}>
            No printed books yet. Order one from a journal with Order print{owner.guest ? ", no account needed" : ""}.
          </p>
        )}
        {orders.map((order) => {
          const binding = bindingDescription(bindingFromEnum(order.binding), order.podPackageId);
          const tracking = Array.isArray(order.trackingUrls) ? (order.trackingUrls as string[]) : [];
          // A renewal that was never ordered has no book and no price; nor
          // has a skipped one.
          const skipped = order.status === "SKIPPED";
          const unordered = (order.status === "FAILED" && !!order.renewedFromId) || skipped;
          // The switch belongs to the book that will renew next: the
          // journal's latest, not one that failed or was cancelled, and not
          // one already renewed - its renewal carries the switch on.
          const renewable = heads.has(order.id) && CHAIN.includes(order.status) && order._count.renewals === 0;
          const next = nextLinks.get(order.id);
          return (
            <article key={order.id} style={{ padding: 14, background: "#1c1c1e", border: `1px solid ${cream(0.1)}`, borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <strong style={{ flex: 1, minWidth: 0, color: CREAM, fontSize: 14 }}>{order.title}</strong>
                {!unordered && <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{formatCents(order.totalCents)}</span>}
              </div>
              <div style={{ fontSize: 12, color: cream(0.6), lineHeight: 1.5 }}>
                {rangeLabel({ start: order.startDate, end: order.endDate, days: order.days })} · {order.days} days{!skipped && ` · ${binding}`}
                {!unordered && ` · ${order.pageCount} pages · ${shippingLabel(order.printer, order.shippingLevel)}`}
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
              {renewable && !owner.guest && (
                <AutoRenewSwitch orderId={order.id} on={order.autoRenew} renewsAt={order.renewsAt?.toISOString() ?? null} days={order.days} />
              )}
              {skipped && order._count.renewals === 0 && <UndoSkipButton skippedId={order.id} />}
              {(customerCanCancel(order) || next) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start" }}>
                  {next && (
                    <a href={next} style={{ padding: "5px 10px", fontSize: 12, background: "rgba(74, 92, 255, 0.28)", color: CREAM, borderRadius: 6, textDecoration: "none" }}>
                      {order.status === "FAILED" ? `Order these ${order.days} days` : `Order the next ${order.days} days`}
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
