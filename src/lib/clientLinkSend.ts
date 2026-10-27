// Emailing a client their link (memari. for businesses, 2026-10-22): what
// the "Email Maya their link" button does, apart from the request, so
// check:business can run it as a signed-in coach - a guest is refused.
//
// The link is always new (only its hash is kept, so an old one can't be
// sent again), and the earlier one stops working - which the card says.
//
// NOT FROM A GUEST, AND NOT WITHOUT LIMIT (review, 2026-10-26). Anyone can be
// a guest, so a guest's business could have Memari's own address mail any
// text, under any business name, to any address, as fast as new guest
// cookies could be made: spam complaints would land on the sending domain
// that also carries every order and shipping email. A guest can still make
// the link and send it themselves. A signed-in business sends at most
// LINKS_PER_DAY a day, counted from the emails, and one per client a minute.
//
// SERVER-ONLY.

import { prisma } from "@/lib/prisma";
import { makeClientLink } from "@/lib/clientPortal";
import { clientLinkEmail, sendableEmail } from "@/lib/clientLinkEmail";
import { sendEmail, type EmailSender } from "@/lib/email";

export type EmailLinkResult = { sent: true; to: string } | { sent: false; to?: string; url?: string; error: string };

/** Far past a coach's busiest day (a whole cohort at once), short of a
 *  spammer's. Counted from the emails themselves (ClientLinkEmail): counting
 *  clients with a link today let a turned-off link, or one client mailed
 *  every minute, send without end (second review, 2026-10-26). */
export const LINKS_PER_DAY = 50;

export async function emailClientLink(o: {
  owner: { id: string; guest: boolean };
  business: { id: string; name: string };
  clientId: string;
  /** the client's page for a new token, at the site's own address */
  portalUrl: (token: string) => Promise<string> | string;
  /** where replies go: the coach's own address, if they have one */
  replyTo: () => Promise<string | null> | string | null;
  send?: EmailSender;
  now?: Date;
}): Promise<EmailLinkResult> {
  const now = o.now ?? new Date();
  if (o.owner.guest) return { sent: false, error: "Sign in to have Memari email your clients. Until then, make their link and send it yourself." };
  const client = await prisma.businessClient.findFirst({
    where: { id: o.clientId, businessId: o.business.id, archivedAt: null },
    select: { id: true, name: true, email: true, accessMadeAt: true },
  });
  if (!client) return { sent: false, error: "That client is not one of yours." };
  const to = sendableEmail(client.email);
  if (!to) return { sent: false, error: `${client.name.split(" ")[0]} has no email address yet: add it below.` };
  if (client.accessMadeAt && now.getTime() - client.accessMadeAt.getTime() < 60_000) return { sent: false, to, error: "A link was made for them a moment ago. Give it a minute before sending another." };
  const today = await prisma.clientLinkEmail.count({ where: { businessId: o.business.id, createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } });
  if (today >= LINKS_PER_DAY)
    return { sent: false, to, error: `That's ${LINKS_PER_DAY} links in a day, the most Memari sends for one business. Try again tomorrow, or make their link and send it yourself.` };

  // counted before it goes, whether or not it gets there
  await prisma.clientLinkEmail.create({ data: { businessId: o.business.id, createdAt: now } });
  const token = await makeClientLink(o.owner.id, client.id);
  const url = await o.portalUrl(token);
  const result = await (o.send ?? sendEmail)(clientLinkEmail({ to, businessName: o.business.name, clientName: client.name, url, replyTo: await o.replyTo() }));
  if (result.sent) return { sent: true, to };
  return {
    sent: false,
    to,
    url,
    error:
      result.reason === "not configured"
        ? "Email is not set up on this site yet, so nothing was sent. Here is their new link to send yourself; the old one has stopped working."
        : "The email could not be sent. Here is their new link to send yourself; the old one has stopped working.",
  };
}
