// THE EMAILS AN ORDER SENDS. Server-only; sent through src/lib/email.ts.
//
//   placed          the book is with the printer (Stripe sends the receipt)
//   shipped         it is in the post, with the tracking links
//   reminder        auto-renew: the next book is ordered in about a week, at
//                   its own price, and how to turn it off - once per book
//                   (renewalReminderSentAt). Some US states' auto-renewal
//                   laws expect a reminder like it; this is that, not legal
//                   advice.
//   renewalFailed   a renewal was not ordered, why, and that nothing was
//                   charged
//   cancelled       the customer stopped it; the whole payment is coming
//                   back
//   adminAlert      to ADMIN_EMAIL: a paid order is not printing
//
// Plain words, short, one link back to Orders. The HTML is the text with a
// heading, so the two never say different things.

import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail, type Email, type EmailSender } from "@/lib/email";
import { appUrl } from "./fileUrls";
import { BINDING_SPECS, bindingFromEnum } from "./products";
import { formatCents } from "./pricing";
import { nextRange } from "./orderRange";
import { rangeLabel } from "./orderBook";

type OrderLike = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  days: number;
  binding: string;
  pageCount: number;
  totalCents: number;
  contactEmail: string | null;
  renewsAt?: Date | null;
  renewedFromId?: string | null;
  failureReason?: string | null;
  trackingUrls?: unknown;
};

function describe(order: OrderLike): string {
  return `${order.title} - ${rangeLabel({ start: order.startDate, end: order.endDate, days: order.days })}, ${order.days} days, ${BINDING_SPECS[bindingFromEnum(order.binding)].label.toLowerCase()}, ${order.pageCount} pages`;
}

function compose(to: string, subject: string, heading: string, paragraphs: string[], link: string): Email {
  const text = [...paragraphs, `Your orders: ${link}`, "", "Memari Studio"].join("\n\n");
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#231f20;max-width:520px">` +
    `<h1 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 16px">${escapeHtml(heading)}</h1>` +
    paragraphs.map((p) => `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`).join("") +
    `<p style="margin:20px 0 0"><a href="${escapeHtml(link)}" style="color:#4a5cff">Your orders</a></p>` +
    `<p style="margin:24px 0 0;color:#6c6457;font-size:13px">Memari Studio</p></div>`;
  return { to, subject, text, html };
}

const ordersLink = () => `${appUrl()}/app/orders`;

export function placedEmail(order: OrderLike): Email {
  const renewal = !!order.renewedFromId;
  return compose(
    order.contactEmail ?? "",
    renewal ? `Your next journal is with the printer (auto-renew)` : `Your journal is with the printer`,
    renewal ? "Your next book is on its way" : "Your book is with the printer",
    [
      renewal ? "Auto-renew ordered your next book, as you asked:" : "Thank you - your book is ordered:",
      describe(order),
      `${formatCents(order.totalCents)}, charged to your card${renewal ? " on file" : ""}. Printing takes 3-5 business days, then the post; we'll email when it ships.`,
    ],
    ordersLink()
  );
}

export function shippedEmail(order: OrderLike, tracking: string[]): Email {
  return compose(
    order.contactEmail ?? "",
    "Your journal has shipped",
    "Your book is in the post",
    [describe(order), tracking.length > 0 ? `Track it: ${tracking.join("  ")}` : "The carrier has it; tracking will show under your orders if there is any."],
    ordersLink()
  );
}

export function reminderEmail(order: OrderLike): Email {
  const next = nextRange({ start: order.startDate, end: order.endDate, days: order.days });
  const when = order.renewsAt ? order.renewsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "soon";
  return compose(
    order.contactEmail ?? "",
    "Your next journal will be ordered soon",
    "Auto-renew: your next book",
    [
      `On ${when} we'll order your next book - ${rangeLabel(next)}, ${next.days} days - and charge the card you saved.`,
      `It is made from your journal as it is then, so its price is that book's own. This one was ${formatCents(order.totalCents)}.`,
      "To change anything, edit your journal before then. To stop, turn auto-renew off under your orders - nothing more is ordered.",
    ],
    ordersLink()
  );
}

export function renewalFailedEmail(renewal: OrderLike): Email {
  return compose(
    renewal.contactEmail ?? "",
    "Your next journal was not ordered",
    "Your renewal was not ordered",
    [renewal.failureReason ?? "Your renewal could not be ordered, and nothing was charged.", "You can order the next book from your journal whenever you're ready."],
    ordersLink()
  );
}

export function cancelledEmail(order: OrderLike): Email {
  return compose(
    order.contactEmail ?? "",
    "Your journal order is cancelled",
    "Your order is cancelled",
    [describe(order), `The printer has stopped it, and the whole ${formatCents(order.totalCents)} is refunded to your card - banks take 5-10 business days to show it.`, "Auto-renew is off for it. You can order again from your journal whenever you like."],
    ordersLink()
  );
}

export function adminAlertEmail(order: OrderLike, why: string): Email | null {
  const to = process.env.ADMIN_EMAIL;
  if (!to) return null;
  return compose(to, `Order needs attention: ${order.title}`, "A paid order is not printing", [describe(order), why, `Order ${order.id}`], `${appUrl()}/app/admin/orders`);
}

/** Send, and log - never throw. An email is never why an order fails. */
export async function notify(email: Email | null, send: EmailSender = sendEmail): Promise<void> {
  if (!email) return;
  try {
    await send(email);
  } catch (error) {
    console.error("[email] send failed:", error);
  }
}

/**
 * THE REMINDERS, from the daily job: every order whose renewal is between a
 * day and a week away and has not been reminded. Each is claimed before its
 * email goes, so two runs send one. An order renewing within a day gets no
 * reminder - the "ordered" email follows straight after.
 */
export async function sendRenewalReminders(now: Date, send: EmailSender = sendEmail): Promise<string[]> {
  const day = 86_400_000;
  const due = await prisma.printOrder.findMany({
    where: {
      autoRenew: true,
      renewalReminderSentAt: null,
      renewsAt: { gt: new Date(now.getTime() + day), lte: new Date(now.getTime() + 7 * day) },
      status: { in: ["SUBMITTED", "IN_PRODUCTION", "SHIPPED", "DELIVERED"] },
      renewals: { none: {} },
    },
  });
  const reminded: string[] = [];
  for (const order of due) {
    const claimed = await prisma.printOrder.updateMany({ where: { id: order.id, renewalReminderSentAt: null }, data: { renewalReminderSentAt: now } });
    if (claimed.count === 0) continue;
    await notify(reminderEmail(order), send);
    reminded.push(order.id);
  }
  return reminded;
}
