// THE EMAILS AN ORDER SENDS. Server-only; sent through src/lib/email.ts.
//
//   placed          the book is with the printer (Stripe sends the receipt)
//   shipped         it is in the post, with the tracking links
//   reminder        auto-renew: "Your next quarter prints in 7 days. Change
//                   your pages, skip this one, or pause." (asked 2026-10-15) -
//                   each a link: the journal, and the signed skip and pause
//                   pages (src/app/renewal). Once per book
//                   (renewalReminderSentAt). Some US states' auto-renewal
//                   laws expect a reminder like it; this is that, not legal
//                   advice.
//   renewalFailed   a renewal was not ordered, why, and that nothing was
//                   charged
//   cancelled       the customer stopped it; the whole payment is coming
//                   back
//   bankFailed      a bank (ACH) payment did not clear: nothing taken, the
//                   book not ordered, order it again (2026-10-26)
//   groupPlaced     a group's books, paid for in one payment, are with the
//                   printer: one email listing them all, not one each
//                   (groupOrders.ts, 2026-10-31); each still emails when it
//                   ships, with its own tracking
//   groupBankFailed the same group payment's bank debit did not clear
//   adminAlert      to ADMIN_EMAIL: a paid order is not printing
//   arrival         "Has your book arrived?" about 12 days after it shipped
//                   (18 from the UK) - two signed links, yes and not yet
//                   (src/app/arrival, delivery.ts). Once per book.
//   deliveryAlert   to ADMIN_EMAIL: books that may not have arrived - no
//                   carrier scan, a return or failure, or the customer says
//                   not yet
//
// Plain words, short, one link back to Orders. The HTML is the text with a
// heading, so the two never say different things.

import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail, type Email, type EmailSender } from "@/lib/email";
import { appUrl } from "./fileUrls";
import { bindingDescription, bindingFromEnum } from "./products";
import { formatCents } from "./pricing";
import { nextRange } from "./orderRange";
import { rangeLabel } from "./orderBook";
import { RENEWABLE_STATUSES, renewalActionUrl, skipPreview } from "./renewalControls";
import { journalSlugOf } from "@/app/planner/journalSlugs";

type OrderLike = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  days: number;
  binding: string;
  /** Its SKU, which carries the paper colour. */
  podPackageId?: string;
  pageCount: number;
  totalCents: number;
  contactEmail: string | null;
  renewsAt?: Date | null;
  renewedFromId?: string | null;
  failureReason?: string | null;
  trackingUrls?: unknown;
  /** A coach's client paid (clientPays.ts): they have no account, so no
   *  link to one - their coach is who to ask. */
  paidByClient?: boolean;
};

function describe(order: OrderLike): string {
  return `${order.title} - ${rangeLabel({ start: order.startDate, end: order.endDate, days: order.days })}, ${order.days} days, ${bindingDescription(bindingFromEnum(order.binding), order.podPackageId ?? "").toLowerCase()}, ${order.pageCount} pages`;
}

/** A thing the email offers to do: a button in the HTML, a line in the text. */
type Action = { label: string; url: string; note: string };

/** `link`: the person's Orders page, or null for a coach's client, who has
 *  none - then they are told to ask their coach. */
function compose(to: string, subject: string, heading: string, paragraphs: string[], link: string | null, actions: Action[] = []): Email {
  const last = link ? `Your orders: ${link}` : CLIENT_ASKS;
  const text = [...paragraphs, ...actions.map((a) => `${a.label}: ${a.url}\n${a.note}`), last, "", "Memari Studio"].join("\n\n");
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#231f20;max-width:520px">` +
    `<h1 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 16px">${escapeHtml(heading)}</h1>` +
    paragraphs.map((p) => `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`).join("") +
    actions
      .map(
        (a) =>
          `<p style="margin:14px 0 0"><a href="${escapeHtml(a.url)}" style="display:inline-block;padding:8px 14px;background:#4a5cff;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px">${escapeHtml(a.label)}</a></p>` +
          `<p style="margin:4px 0 0;color:#6c6457;font-size:13px">${escapeHtml(a.note)}</p>`
      )
      .join("") +
    (link ? `<p style="margin:20px 0 0"><a href="${escapeHtml(link)}" style="color:#4a5cff">Your orders</a></p>` : `<p style="margin:20px 0 0">${escapeHtml(CLIENT_ASKS)}</p>`) +
    `<p style="margin:24px 0 0;color:#6c6457;font-size:13px">Memari Studio</p></div>`;
  return { to, subject, text, html };
}

const ordersLink = () => `${appUrl()}/app/account/orders`;
const CLIENT_ASKS = "Questions about your book? Ask your coach: they set it up for you.";
/** The Orders page for the person who ordered; none for a coach's client. */
const linkFor = (order: OrderLike) => (order.paidByClient ? null : ordersLink());

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
    linkFor(order)
  );
}

export function shippedEmail(order: OrderLike, tracking: string[]): Email {
  return compose(
    order.contactEmail ?? "",
    "Your journal has shipped",
    "Your book is in the post",
    [describe(order), tracking.length > 0 ? `Track it: ${tracking.join("  ")}` : `The carrier has it; tracking will show ${order.paidByClient ? "on your page" : "under your orders"} if there is any.`],
    linkFor(order)
  );
}

/** "quarter" for a 90-day book, and so on: what the reminder calls it. */
export function periodWord(days: number): string {
  if (days >= 28 && days <= 31) return "month";
  if (days >= 89 && days <= 92) return "quarter";
  if (days >= 365 && days <= 366) return "year";
  return "book";
}

const longDate = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/** Where the reminder's three links go: the journal (to change pages), and
 *  the signed skip and pause pages. */
export type ReminderLinks = { pages: string; skip: string; pause: string };

/** `afterOrderedOn`: when the book after a skipped one is ordered - from
 *  skipPreview, the date a skip really sets; without it, worked out from
 *  this book's own lead. */
export function reminderEmail(order: OrderLike, links: ReminderLinks, now: Date = new Date(), afterOrderedOn?: Date): Email {
  const next = nextRange({ start: order.startDate, end: order.endDate, days: order.days });
  const after = nextRange(next);
  const printsOn = order.renewsAt ?? now;
  const daysAway = Math.max(1, Math.round((printsOn.getTime() - now.getTime()) / 86_400_000));
  const word = periodWord(order.days);
  const when = longDate(printsOn);
  const afterOn = longDate(afterOrderedOn ?? new Date(next.end.getTime() - (order.endDate.getTime() - printsOn.getTime())));
  return compose(
    order.contactEmail ?? "",
    `Your next ${word} prints in ${daysAway} day${daysAway === 1 ? "" : "s"}`,
    `Your next ${word} prints on ${when}`,
    [
      `${order.title}: ${rangeLabel(next)}, ${next.days} days. We'll print it on ${when} and charge the card you saved.`,
      `It's made from your journal as it is then, so its price is that book's own. This one was ${formatCents(order.totalCents)}.`,
      "Before then you can change your pages, skip this one, or pause.",
    ],
    ordersLink(),
    [
      { label: "Change your pages", url: links.pages, note: `Anything you change before ${when} is in the book.` },
      { label: "Skip this one", url: links.skip, note: `Nothing is printed or charged for ${rangeLabel(next)}. The one after (${rangeLabel(after)}) is ordered on ${afterOn}.` },
      { label: "Pause auto-renew", url: links.pause, note: "Nothing more is ordered until you turn it back on." },
    ]
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
    [
      describe(order),
      `The printer has stopped it, and the whole ${formatCents(order.totalCents)} is refunded to your card - banks take 5-10 business days to show it.`,
      order.paidByClient ? "You can order it again from your page whenever you like." : "Auto-renew is off for it. You can order again from your journal whenever you like.",
    ],
    linkFor(order)
  );
}

/** A payment that takes days to clear (a US bank account) came back
 *  refused: nothing was taken and the book was not ordered (holdsDays.ts). */
export function bankPaymentFailedEmail(order: OrderLike): Email {
  return compose(
    order.contactEmail ?? "",
    "Your bank payment didn't go through",
    "Your bank payment didn't go through",
    [
      describe(order),
      `Your bank didn't clear the ${formatCents(order.totalCents)} payment, so the book wasn't ordered and nothing was taken.`,
      order.paidByClient ? "You can order it again from your page, by card or from another account." : "You can order it again from your journal whenever you like.",
    ],
    linkFor(order)
  );
}

/** "Maya Okafor - 4 Jan – 3 Apr 2027, coil" for a group email's list. */
const groupLine = (order: OrderLike) =>
  `${order.title} - ${rangeLabel({ start: order.startDate, end: order.endDate, days: order.days })}, ${bindingDescription(bindingFromEnum(order.binding), order.podPackageId ?? "").toLowerCase()}`;

/** A group's books are with the printer: all of them in one email. Those
 *  the printer would not take yet are said apart - we have been told, and
 *  they are ours to put right or refund. */
export function groupPlacedEmail(group: string, orders: Array<OrderLike & { status: string }>): Email {
  const placed = orders.filter((o) => o.status !== "FAILED");
  const stuck = orders.filter((o) => o.status === "FAILED");
  const total = orders.reduce((sum, o) => sum + o.totalCents, 0);
  const books = (n: number) => `${n} ${n === 1 ? "book" : "books"}`;
  return compose(
    orders[0]?.contactEmail ?? "",
    `${group}: ${books(placed.length)} with the printer`,
    `${group}'s books are with the printer`,
    [
      `Thank you - ${books(orders.length)} ordered for ${group}, ${formatCents(total)} in all:`,
      ...placed.map(groupLine),
      ...(stuck.length
        ? [`${stuck.length === 1 ? "One of them" : `${stuck.length} of them`} the printer would not take yet: ${stuck.map((o) => o.title).join(", ")}. We have been told, and will put it right or refund it.`]
        : []),
      "Printing takes 3-5 business days, then the post. Each book is posted on its own; we'll email as each one ships, with its tracking.",
    ],
    ordersLink()
  );
}

/** The bank did not clear a group's payment: none of its books was ordered. */
export function groupBankFailedEmail(group: string, orders: OrderLike[]): Email {
  const total = orders.reduce((sum, o) => sum + o.totalCents, 0);
  return compose(
    orders[0]?.contactEmail ?? "",
    "Your bank payment didn't go through",
    "Your bank payment didn't go through",
    [
      `Your bank didn't clear the ${formatCents(total)} payment for ${group}'s ${orders.length === 1 ? "book" : `${orders.length} books`}, so they weren't ordered and nothing was taken.`,
      "You can order them again from the group's page, by card or from another account.",
    ],
    ordersLink()
  );
}

export function adminAlertEmail(order: OrderLike, why: string): Email | null {
  const to = process.env.ADMIN_EMAIL;
  if (!to) return null;
  return compose(to, `Order needs attention: ${order.title}`, "A paid order is not printing", [describe(order), why, `Order ${order.id}`], `${appUrl()}/app/admin/orders`);
}

/** Where the arrival email's two answers go: signed pages (delivery.ts). */
export type ArrivalLinks = { yes: string; notYet: string };

export function arrivalEmail(order: OrderLike & { shippedAt?: Date | null }, links: ArrivalLinks): Email {
  const left = order.shippedAt ? `It left the printer on ${longDate(order.shippedAt)}, so it should be with you by now.` : "It should be with you by now.";
  return compose(
    order.contactEmail ?? "",
    "Has your journal arrived?",
    "Has your book arrived?",
    [describe(order), left, "If it hasn't come, tell us and we'll track it down and put it right."],
    linkFor(order),
    [
      { label: "Yes, it's here", url: links.yes, note: "Thank you. Nothing else to do." },
      { label: "Not yet", url: links.notYet, note: "We'll look into it straight away and email you." },
    ]
  );
}

/** A book that may not have arrived, for the admin alert. */
export type DeliveryAlertItem = OrderLike & { shippedAt?: Date | null; deliveryProblem: string | null };

export function deliveryAlertEmail(orders: DeliveryAlertItem[]): Email | null {
  const to = process.env.ADMIN_EMAIL;
  if (!to || orders.length === 0) return null;
  const one = orders.length === 1;
  return compose(
    to,
    one ? `A book may not have arrived: ${orders[0].title}` : `${orders.length} books may not have arrived`,
    one ? "A book may not have arrived" : `${orders.length} books may not have arrived`,
    orders.flatMap((order) => {
      const links = Array.isArray(order.trackingUrls) ? (order.trackingUrls as string[]) : [];
      return [
        `${describe(order)}. Shipped ${order.shippedAt ? longDate(order.shippedAt) : "(date unknown)"}; to ${order.contactEmail ?? "no email"}.`,
        `${order.deliveryProblem ?? "No reason recorded."} Order ${order.id}.${links.length > 0 ? ` Tracking: ${links.join("  ")}` : ""}`,
      ];
    }),
    `${appUrl()}/app/admin/orders`
  );
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
      // A skipped book renews like a printed one (renewalControls.ts).
      status: { in: [...RENEWABLE_STATUSES] },
      renewals: { none: {} },
    },
  });
  // Not a client the coach has archived: that renewal stops, uncharged, when
  // it comes (renewals.ts), so "prints in 5 days" would be untrue (review,
  // 2026-10-26). Found here rather than in the query: a NOT over the
  // journal's relation would also drop orders whose journal is gone.
  const plannerIds = due.map((order) => order.plannerId).filter((id): id is string => !!id);
  const archived = new Set(
    plannerIds.length
      ? (await prisma.businessClient.findMany({ where: { plannerId: { in: plannerIds }, archivedAt: { not: null } }, select: { plannerId: true } })).map((client) => client.plannerId)
      : []
  );
  const reminded: string[] = [];
  for (const order of due) {
    if (order.plannerId && archived.has(order.plannerId)) continue;
    const claimed = await prisma.printOrder.updateMany({ where: { id: order.id, renewalReminderSentAt: null }, data: { renewalReminderSentAt: now } });
    if (claimed.count === 0) continue;
    await notify(reminderEmail(order, await reminderLinks(order), now, skipPreview(order, now).afterOrderedOn), send);
    reminded.push(order.id);
  }
  return reminded;
}

/** The reminder's links for one order. The journal's own page when there
 *  still is one, else the orders list. */
async function reminderLinks(order: { id: string; plannerId: string | null }): Promise<ReminderLinks> {
  let pages = ordersLink();
  if (order.plannerId) {
    try {
      pages = `${appUrl()}/app/j/${await journalSlugOf(order.plannerId)}`;
    } catch {
      // The journal went; the orders list will say so.
    }
  }
  return { pages, skip: renewalActionUrl(order.id, "skip"), pause: renewalActionUrl(order.id, "pause") };
}
