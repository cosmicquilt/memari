import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SitePage } from "@/app/landing/SitePage";
import { GUEST_IDLE_DAYS, GUEST_JOURNAL_LIMIT } from "@/lib/guest";
import { LEGAL_CONTACT } from "@/app/legal/LegalPage";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";

// memari.studio/help (2026-10-08): the questions a first visit asks, each
// answered from what the app does - guest limits (guest.ts), ordering and
// cancelling (Terms), arrival times (orderRange.ts, leadDays, "never
// promised"), the account page. Plain <details>, so it works without script
// and every answer is in the page for search.

export const metadata: Metadata = {
  title: "Help & FAQ - Memari Studio",
  description: "How Memari works: accounts and guests, designing pages, printing at home, ordering a bound book, renewals, and your data.",
};

type QA = { q: string; a: ReactNode };

const GROUPS: Array<[heading: string, items: QA[]]> = [
  [
    "Getting started",
    [
      {
        q: "Do I need an account?",
        a: <>
          <p>
            No. Choose &ldquo;Continue as guest&rdquo; and start. A guest can keep up to {GUEST_JOURNAL_LIMIT} journals, and a
            journal left unopened for {GUEST_IDLE_DAYS} days is deleted. Sign in at any time and everything you made as a guest
            moves to your account, so you can open it on any device.
          </p>
        </>,
      },
      {
        q: "What is a journal?",
        a: <p>
          One book. You choose which pages repeat - a spread for every month, every week, a page for every day - design each
          one once, and set the dates the book covers. Memari lays out every page in between, each one dated.
        </p>,
      },
      {
        q: "Can I start from a ready-made layout?",
        a: <p>
          Yes. <Link href="/layouts">Layouts</Link> has weeks to start from - student, shift work, parent, ADHD and more.
          &ldquo;Use this week&rdquo; opens one as a journal of your own, and you can change all of it.
        </p>,
      },
      { q: "Is it free?", a: <p>The editor and your whole book as a PDF are free. You pay only for a printed, bound book - see <Link href="/pricing">Pricing</Link>.</p> },
    ],
  ],
  [
    "Designing pages",
    [
      {
        q: "How do I add things to a page?",
        a: <p>
          Open the module palette with the button at the top left of the editor and drag a module onto the page. It snaps to a
          quarter-inch dot grid; drag its edges to resize it, and the modules beside it make room.
        </p>,
      },
      {
        q: "Dated or undated?",
        a: <p>
          Your choice when you make a journal. Dated, Memari writes every date for you; undated, the pages print with the dates
          left for you to write - handy if you start mid-month or skip weeks.
        </p>,
      },
      {
        q: "Can I change the week start, font or page size?",
        a: <p>
          Yes. All three are chosen when you make a journal, under More options. Afterwards, the paper size and font are in the
          editor&rsquo;s Page Settings, and the week start is in the hours&rsquo; own settings. To change what a new journal
          starts with, go to <Link href="/app/account/preferences">Account → Preferences</Link>.
        </p>,
      },
      {
        q: "Can my calendar show up in the planner?",
        a: <p>
          Yes. Add events straight onto the hours, or subscribe to a calendar by its private .ics address from Google, Apple or
          Microsoft, under Page Settings → Calendars. Memari reads that calendar; it never writes to it.
        </p>,
      },
    ],
  ],
  [
    "Printing",
    [
      {
        q: "Can I print it myself?",
        a: <p>
          Yes. Export PDF, at the top right of the editor, gives you the whole book. Choose US Letter as the page size if you
          will print it on a home printer.
        </p>,
      },
      {
        q: "How do I order a printed book?",
        a: <p>
          In the editor, choose Order print. Pick the binding - coil-bound to lie flat, paperback or hardcover - how many days
          the book covers, where it goes and how fast; you see the full price before you pay. Ordering needs an account, so your
          books have somewhere to live. Printed books are 7 × 10 in.
        </p>,
      },
      {
        q: "How long does a book take to arrive?",
        a: <p>
          Printing takes three to five business days, then the post: from a few days by express to around three weeks by
          standard mail abroad. The order screen suggests a start date that leaves room, and you can change it.
        </p>,
      },
      {
        q: "Can I cancel an order?",
        a: <p>
          Until the printer starts it, about an hour after you pay - under Account → Orders - and the whole payment is
          refunded. After that it cannot be stopped, because it is made for you.
        </p>,
      },
      {
        q: "What if it arrives damaged or wrong?",
        a: <p>
          Tell us within 30 days at <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>, with a photo where there is
          something to see, and we will reprint it or refund you, whichever you prefer.
        </p>,
      },
      {
        q: "How does auto-renew work?",
        a: <p>
          It is off unless you turn it on. When it is on, the next book - the same number of days, starting the day after - is
          ordered early enough to arrive before this one runs out, made from your journal as it is then. We email you about a
          week before, and you can turn it off any time under Account → Orders.
        </p>,
      },
    ],
  ],
  [
    "Your account and data",
    [
      {
        q: "Where are my settings and orders?",
        a: <p>
          Under the round icon at the top right - on this site, on your journals and in the editor. Account has your profile,
          preferences, orders, and your data.
        </p>,
      },
      {
        q: "Can I take my work with me?",
        a: <p>
          Yes. Any journal downloads as a print-ready PDF, from the editor or from{" "}
          <Link href="/app/account/data">Account → Data &amp; account</Link>, whenever you like.
        </p>,
      },
      {
        q: "How do I delete my account?",
        a: <p>
          Under Account → Data &amp; account. It shows what will go, and asks you to type &ldquo;delete&rdquo; first. Records of
          printed books are kept as receipts, with auto-renew turned off. The details are in{" "}
          <Link href="/privacy">Privacy</Link>.
        </p>,
      },
    ],
  ],
];

export default function HelpPage() {
  return (
    <SitePage>
      <header className={site.head}>
        <p className={styles.eyebrow}>Help</p>
        <h1 className={styles.headline}>Questions, answered.</h1>
        <p className={styles.lede}>
          If yours is not here, write to <a href={`mailto:${LEGAL_CONTACT}`} style={{ color: "inherit" }}>{LEGAL_CONTACT}</a>.
        </p>
      </header>

      <section className={site.block}>
        <div className={site.faqGroups}>
          {GROUPS.map(([heading, items]) => (
            <div key={heading}>
              <h2 className={site.blockTitle} style={{ fontSize: 22, marginBottom: 14 }}>
                {heading}
              </h2>
              <div className={site.faq}>
                {items.map(({ q, a }) => (
                  <details key={q}>
                    <summary>{q}</summary>
                    <div>{a}</div>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={site.end}>
        <h2>Ready when you are.</h2>
        <Link href="/app" className={site.button}>
          Start your planner
        </Link>
        <p className={site.note}>Free, and no account needed to try it.</p>
      </section>
    </SitePage>
  );
}
