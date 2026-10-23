// The email that gives a client their own page (clientLinkEmail.ts): it
// says who it is from, carries the link (in the text and behind the
// button), says no account is needed and that the link is theirs alone,
// sends replies to the coach when it can, never lets a name write HTML, and
// keeps the copy's one rule: no spaced dashes.
//
// Run as part of: npm test

import { clientLinkEmail, sendableEmail } from "./clientLinkEmail";

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failures++;
    console.error(`FAIL ${what}`);
  }
};

const url = "https://memari.studio/c/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const mail = clientLinkEmail({ to: "maya@example.com", businessName: "Northwind Coaching", clientName: "Maya Okafor", url, replyTo: "coach@example.com" });
check(mail.to === "maya@example.com", "it goes to the client");
check(mail.subject === "Northwind Coaching: your journal", `the subject says who it is from (${mail.subject})`);
check(mail.text.startsWith("Hi Maya,"), "it greets them by their first name");
check(mail.text.includes(`\n${url}\n`), "the link sits on a line of its own in the text");
check(mail.html.includes(`href="${url}"`) && mail.html.includes("Open your page"), "and behind the button in the HTML");
check(/No account or password needed/.test(mail.text) && /anyone who has it can open your page/.test(mail.text), "it says no account is needed, and that the link is theirs alone");
check(mail.replyTo === "coach@example.com" && mail.text.includes("Reply to this email and it goes to Northwind Coaching."), "replies go to the coach");
check(!/ - |–|—/.test(mail.text + mail.html), "no spaced dashes in its words");

const guest = clientLinkEmail({ to: "maya@example.com", businessName: "Northwind Coaching", clientName: "Maya", url });
check(guest.replyTo === undefined && guest.text.includes("Questions? Ask Northwind Coaching."), "with no coach address, it says to ask them, not to reply");

const hostile = clientLinkEmail({ to: "x@example.com", businessName: "<b>Evil</b> & Co", clientName: "<script>alert(1)</script>", url });
check(!hostile.html.includes("<script>") && !hostile.html.includes("<b>Evil</b>") && hostile.html.includes("&lt;b&gt;Evil&lt;/b&gt; &amp; Co"), "a name never writes HTML");

check(sendableEmail(" maya@example.com ") === "maya@example.com", "an address is trimmed");
check(sendableEmail("maya@example") === null && sendableEmail("not an email") === null && sendableEmail(null) === null, "and one that is not an address is not sent to");

if (failures) {
  console.error(`\n${failures} client link email check(s) failed.`);
  process.exit(1);
}
console.log("All client link email checks passed.");
