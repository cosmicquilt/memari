import type { Metadata } from "next";
import { LegalPage, Summary, H2, P, UL, LI, LEGAL_CONTACT, LEGAL_ENTITY } from "../legal/LegalPage";

// Written against what the app actually does today, not what it is planned
// to do. Things that follow from that and are easy to get wrong:
//
//   - printed books are ordered through src/lib/print (2026-10-04): priced
//     from Lulu's own quote and shown before paying, paid on Stripe's page,
//     printed and posted by Lulu, auto-renew OFF unless switched on. The
//     section below describes exactly that flow - if it changes, this page
//     changes in the same commit.
//   - a failed renewal is never retried: auto-renew is switched off and the
//     Orders page says why (renewals.ts). The terms promise that.
//   - guest journals really are deleted after 30 days idle. That is a
//     material term, not a footnote, and it is stated where someone using
//     guest mode will meet it.

export const metadata: Metadata = {
  title: "Terms — Memari Studio",
  description: "The terms for using Memari Studio: your work stays yours, and what we each promise.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="4 October 2026">
      <Summary>
        <P>
          <strong>The short version.</strong> Your planners are yours. Use the app for anything
          lawful. If you use it as a guest, journals you do not open for 30 days are deleted. A
          printed book is priced before you pay, made to order for you, and reprinted or refunded
          if it arrives damaged or misprinted; auto-renew is off unless you turn it on. It is early
          software, provided as it is, and we cannot promise it will never lose anything &mdash; so
          export anything you would hate to lose.
        </P>
      </Summary>

      <P>
        These terms are between you and {LEGAL_ENTITY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) and
        cover memari.studio. By using it you accept them.
      </P>

      <H2>Accounts and guest use</H2>

      <P>
        You can use Memari with an account or as a guest. With an account, keep your sign-in
        details to yourself; you are responsible for what happens under it.
      </P>

      <P>
        <strong>Guest journals are deleted after 30 days without being opened</strong>, and saved
        pages and modules go once a guest has no journals left. A guest&rsquo;s work is tied to one
        browser: clear your cookies, or switch device, and it is gone. Signing in keeps it &mdash;
        work made as a guest moves to your account when you sign in from the same browser.
      </P>

      <H2>Your work is yours</H2>

      <P>
        You keep every right you have in what you make: your journals, your text, your layouts. We
        claim no ownership of them.
      </P>

      <P>
        You give us only the permission we need to run the service for you &mdash; to store your
        work, show it back to you, render it to a page, and produce a PDF when you ask for one.
        That permission exists for your benefit, lasts as long as you keep the work with us, and
        ends when you delete it. We do not use what you write to promote Memari, and we do not use
        it to train machine-learning models.
      </P>

      <H2>What Memari is made of</H2>

      <P>
        The app, its module designs and its page layouts are ours. You may use them to make your
        own planners, print them, and use the results however you like, including commercially.
        You may not copy the app itself, or extract its module and layout designs, to build a
        competing product.
      </P>

      <H2>Fair use</H2>

      <P>Do not use Memari to:</P>

      <UL>
        <LI>break the law, or infringe somebody else&rsquo;s rights;</LI>
        <LI>store or share material that is unlawful;</LI>
        <LI>
          attack the service &mdash; probing it, overloading it, or trying to reach journals that
          are not yours;
        </LI>
        <LI>resell access to it, or run it as a service for other people, without asking us first.</LI>
      </UL>

      <H2>Printed books</H2>

      <P>
        You can order a journal printed and bound, for any number of days and in coil, paperback or
        hardcover. You need an account to order. Our print partner, Lulu, prints and posts it; you
        pay us, on Stripe&rsquo;s payment page.
      </P>

      <P>
        <strong>What you see is what we print.</strong> The book is made from your journal as it is
        when you pay, for the days you chose. Check it first with Export PDF &mdash; that file is the
        book. Changes you make afterwards go into your next book, not this one. You are responsible
        for having the right to print what you put in it.
      </P>

      <P>
        <strong>Price.</strong> The price of the book and of its postage is shown before you pay, in
        US dollars. It depends on the length, the binding and where it is going. If we are required
        to charge sales tax or VAT, it is shown before you pay too. Orders sent outside the United
        States may be charged import duties or taxes by the country they arrive in; those are yours
        to pay, and are not something we see or set.
      </P>

      <P>
        <strong>Delivery.</strong> Printing usually takes 3&ndash;5 business days, then the post
        takes what the shipping you chose takes. Times we show are estimates, not promises. You will
        find where your book is under Orders.
      </P>

      <P>
        <strong>Cancelling.</strong> Each book is made to order, for you. If you need to cancel,
        email us straight away: we can stop it until the printer starts, usually within an hour of
        your payment. After that it cannot be stopped, and we cannot take back a book for a change
        of mind &mdash; where the law gives a right to cancel a purchase, it does not cover goods
        made to the buyer&rsquo;s own design.
      </P>

      <P>
        <strong>If something is wrong with it.</strong> If your book arrives damaged, misprinted or
        not as you designed it, or does not arrive at all, tell us within 30 days of when it arrived
        or was due, with a photo where there is something to see. We will reprint it or refund you,
        whichever you prefer. This is on top of any rights the law gives you, not instead of them.
      </P>

      <H2>Auto-renew</H2>

      <P>
        <strong>Auto-renew is off unless you turn it on.</strong> When it is on, before your book
        runs out we order the next one &mdash; the same number of days, starting the day after it
        ends, to the same address and by the same shipping &mdash; and charge the card you paid with.
        The next book is made from your journal as it is then, so its price is that book&rsquo;s own:
        if your journal or the printing and postage costs have changed, the price can change too.
      </P>

      <P>
        The date the next book will be ordered is shown under Orders, and we email you about a week
        before it. Turn auto-renew off there at any time before that date and nothing more is
        ordered. If a renewal cannot be ordered
        &mdash; your card is declined, or the book no longer fits its binding &mdash; nothing is
        charged, auto-renew is turned off, and we tell you why, by email and under Orders. We do
        not try the card again.
      </P>

      <P>
        Your card is saved only when auto-renew is on, and it is held by Stripe, not by us.
      </P>

      <H2>Availability</H2>

      <P>
        This is early software and we change it often. It may be unavailable, and features may
        change or be withdrawn. We will not knowingly break your existing journals, but we cannot
        promise the service will be uninterrupted or that nothing will ever be lost.
      </P>

      <P>
        <strong>Keep your own copies of anything that matters.</strong> The Export PDF button is
        there for exactly that, and it is the backup we can actually promise you.
      </P>

      <H2>No warranty</H2>

      <P>
        Memari is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of
        any kind, whether express or implied, including any implied warranty of merchantability,
        fitness for a particular purpose, or non-infringement.
      </P>

      <H2>Limits on liability</H2>

      <P>
        To the fullest extent the law allows, we are not liable for indirect, incidental, special or
        consequential loss, or for lost profits, lost data or lost goodwill. Where liability cannot
        be excluded, it is limited to the greater of the amount you paid us in the twelve months
        before the claim, or one hundred US dollars.
      </P>

      <P>
        Nothing here removes rights you have as a consumer that cannot be removed by agreement.
      </P>

      <H2>Ending it</H2>

      <P>
        You can stop using Memari whenever you like and delete your journals from inside the app. We
        may suspend or end access that breaks these terms, or that puts the service or other people
        at risk.
      </P>

      <H2>Governing law</H2>

      <P>
        These terms are governed by the laws of the State of New Jersey, United States, and its
        courts will hear any dispute &mdash; except where the law of the country you live in gives
        you the right to bring a claim where you are.
      </P>

      <H2>Changes</H2>

      <P>
        We may update these terms. The date at the top changes with them, and we will tell account
        holders directly about anything significant. Continuing to use Memari after a change means
        you accept it.
      </P>

      <H2>Contact</H2>

      <P>
        {LEGAL_ENTITY} &mdash;{" "}
        <a href={`mailto:${LEGAL_CONTACT}`} style={{ color: "#8fa0ff" }}>{LEGAL_CONTACT}</a>
      </P>
    </LegalPage>
  );
}
