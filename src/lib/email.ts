// SENDING EMAIL - through Resend's HTTP API, the one call it takes.
//
// Without RESEND_API_KEY and EMAIL_FROM nothing is sent: the message is
// logged instead, so development and a site without the keys behave the
// same apart from the post. The keys - and verifying the sending address
// with Resend - are Andrew's. A send never throws: an email that fails must
// not undo the order it was about, so callers get a result to log.
// Server-only.

export type Email = { to: string; subject: string; text: string; html: string };
export type EmailResult = { sent: boolean; id?: string; reason?: string };
export type EmailSender = (email: Email) => Promise<EmailResult>;

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export const sendEmail: EmailSender = async (email) => {
  if (!email.to) return { sent: false, reason: "no address" };
  if (!emailConfigured()) {
    console.log(`[email] not configured - would send "${email.subject}" to ${email.to}`);
    return { sent: false, reason: "not configured" };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    });
    const body = await response.text();
    if (!response.ok) {
      console.error(`[email] Resend refused "${email.subject}" (${response.status}): ${body.slice(0, 300)}`);
      return { sent: false, reason: `refused (${response.status})` };
    }
    return { sent: true, id: (JSON.parse(body) as { id?: string }).id };
  } catch (error) {
    console.error(`[email] could not send "${email.subject}":`, error);
    return { sent: false, reason: "network" };
  }
};

/** Text into HTML, safely. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
