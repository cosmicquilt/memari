// memari. for businesses: the email that gives a client their own page
// (2026-10-22, "Email the client their link" - until then the coach copied
// the link and sent it themselves). Sent from the client's page in the
// business (actions.ts emailLinkTo) through src/lib/email.ts; replies go to
// the coach when they are signed in, since the client's questions are for
// them, not for us.
//
// Plain words, short, the link on a line of its own, and the HTML the text
// with a button, so the two never say different things. What the page is,
// that it needs no account, that the link is theirs alone, and who to ask
// for a new one. A plain module, so a test can read every word.

import { escapeHtml, type Email } from "./email";

export function clientLinkEmail({ to, businessName, clientName, url, replyTo }: { to: string; businessName: string; clientName: string; url: string; replyTo?: string | null }): Email {
  const first = clientName.trim().split(/\s+/)[0] || "there";
  const business = businessName.trim() || "Your coach";
  const subject = `${business}: your journal`;
  const lines = [
    `Hi ${first},`,
    "",
    `${business} has made a journal for you. This link opens your own page: your journal's pages, your books and where they are, and the address they are sent to, which you can correct.`,
    "",
    url,
    "",
    "No account or password needed. Keep the link to yourself: anyone who has it can open your page. If you lose it, or think someone else has it, ask for a new one and this one stops working.",
    "",
    replyTo ? `Questions? Reply to this email and it goes to ${business}.` : `Questions? Ask ${business}.`,
  ];
  const text = `${lines.join("\n")}\n\nmemari. for ${business}`;
  const p = (s: string) => `<p style="margin:0 0 16px;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1917">${s}</p>`;
  const html =
    `<div style="max-width:520px">` +
    p(`Hi ${escapeHtml(first)},`) +
    p(`${escapeHtml(business)} has made a journal for you. This link opens your own page: your journal&rsquo;s pages, your books and where they are, and the address they are sent to, which you can correct.`) +
    `<p style="margin:0 0 16px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;border-radius:980px;background:#4a5cff;color:#ffffff;font:600 15px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-decoration:none">Open your page</a></p>` +
    p(`Or paste this into your browser: <span style="word-break:break-all;color:#57534e">${escapeHtml(url)}</span>`) +
    p("No account or password needed. Keep the link to yourself: anyone who has it can open your page. If you lose it, or think someone else has it, ask for a new one and this one stops working.") +
    p(escapeHtml(replyTo ? `Questions? Reply to this email and it goes to ${business}.` : `Questions? Ask ${business}.`)) +
    `<p style="margin:24px 0 0;font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#78716c">memari. for ${escapeHtml(business)}</p>` +
    `</div>`;
  return { to, subject, text, html, replyTo: replyTo ?? undefined };
}

/** An address worth sending to: something@somewhere.tld, nothing more. */
export const sendableEmail = (address: string | null | undefined): string | null => {
  const a = (address ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a) ? a : null;
};
