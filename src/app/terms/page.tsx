import type { Metadata } from "next";
import { LegalPage, Summary, H2, P, UL, LI, LEGAL_CONTACT, LEGAL_ENTITY } from "../legal/LegalPage";

// Written against what the app actually does today, not what it is planned
// to do. Two things follow from that and are easy to get wrong:
//
//   - printing and posting a book DOES NOT EXIST yet. There is no Lulu
//     integration, no checkout, no address collected. Terms that describe
//     an order process would be describing nothing.
//   - guest journals really are deleted after 30 days idle. That is a
//     material term, not a footnote, and it is stated where someone using
//     guest mode will meet it.

export const metadata: Metadata = {
  title: "Terms — Memari Studio",
  description: "The terms for using Memari Studio: your work stays yours, and what we each promise.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="22 September 2026">
      <Summary>
        <P>
          <strong>The short version.</strong> Your planners are yours. Use the app for anything
          lawful. If you use it as a guest, journals you do not open for 30 days are deleted. It is
          early software, provided as it is, and we cannot promise it will never lose anything
          &mdash; so export anything you would hate to lose.
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

      <H2>Printing</H2>

      <P>
        Printing and posting a physical book is <strong>not available yet</strong>. Today you can
        export a PDF and print it yourself. When we do offer printing, its prices, delivery and
        refunds will be set out before you order anything &mdash; nothing here commits you to a
        purchase.
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
