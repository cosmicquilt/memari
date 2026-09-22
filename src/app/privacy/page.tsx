import type { Metadata } from "next";
import { LegalPage, Summary, H2, P, UL, LI, A, LEGAL_CONTACT, LEGAL_ENTITY } from "../legal/LegalPage";

// Every factual claim here was read out of the code rather than assumed,
// because a privacy policy describing flows an app does not have is worse
// than none - it is a promise about the wrong thing. Checked 2026-09-22:
//
//   - no analytics, no error reporting, no tag manager, no third-party
//     script of any kind (dependency tree and source both grepped)
//   - the `User` table in schema.prisma is NEVER read or written; identity
//     lives in Clerk and our rows key on Clerk's id string alone
//   - four first-party cookies, all named memari-*, in src/lib
//   - guest journals are deleted after GUEST_IDLE_DAYS idle, in
//     src/app/guest/route.ts, and their saved items follow
//   - the PDF is built on the server (src/app/app/export/route.ts) and
//     handed back; it is not stored and not sent anywhere
//
// If any of that changes, this page changes in the same commit.

export const metadata: Metadata = {
  title: "Privacy — Memari Studio",
  description: "What Memari Studio collects, what it does not, and how long anything is kept.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="22 September 2026">
      <Summary>
        <P>
          <strong>The short version.</strong> Memari stores the planners you build and, if you make
          an account, your sign-in details sit with our authentication provider. There is no
          advertising, no tracking, no analytics of any kind, and nothing is sold or shared for
          marketing. You can use it without an account at all. The detail below is what actually
          binds.
        </P>
      </Summary>

      <P>
        Memari Studio is run by {LEGAL_ENTITY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). This page
        covers memari.studio and the app on it.
      </P>

      <H2>What we hold</H2>

      <P>
        <strong>What you make.</strong> Your journals: their names, the term you set, the pages,
        and every module on them &mdash; including whatever you write inside those modules. A
        planner is a personal thing, and its contents can be too. We treat everything you type as
        yours and private. It is stored so we can show it back to you and print it; we do not read
        it, mine it, or train anything on it.
      </P>

      <P>
        <strong>If you sign in.</strong> Authentication is handled by Clerk. They hold your email
        address, your name if you gave one, and whatever your provider returns if you sign in with
        Google. <em>We do not copy any of that into our own database.</em> Our records identify you
        only by the opaque account id Clerk issues.
      </P>

      <P>
        <strong>If you continue as a guest.</strong> No account, no email, no name. Your browser is
        given a random identifier &mdash; 128 bits of randomness, signed so it cannot be forged or
        guessed &mdash; stored in a cookie that JavaScript on the page cannot read. That identifier
        is the only thing connecting you to the journals you make. Clear the cookie and they are
        unreachable; see how long we keep them below.
      </P>

      <P>
        <strong>Technical records.</strong> Our host keeps ordinary server logs, which include IP
        addresses and request details, for security and for working out why something broke. We do
        not combine them with your journals to build a profile.
      </P>

      <H2>What we do not do</H2>

      <UL>
        <LI>No advertising, and no advertising identifiers.</LI>
        <LI>
          No analytics and no tracking &mdash; not our own, and no third-party measurement script.
          There is no Google Analytics, no tag manager, no session recorder, no error reporter.
        </LI>
        <LI>We do not sell your information, and we do not share it for anyone else&rsquo;s marketing.</LI>
        <LI>We do not use what you write to train machine-learning models.</LI>
      </UL>

      <H2>Cookies</H2>

      <P>
        Memari sets four cookies of its own. All are first-party, none is used for advertising or
        measurement, and every one exists to make the app work or to put it back the way you left
        it.
      </P>

      <UL>
        <LI>
          <code>memari-guest</code> &mdash; your guest identifier, if you use the app without an
          account. Signed, and marked so page scripts cannot read it.
        </LI>
        <LI>
          <code>memari-journal</code> &mdash; which journal you had open, so the app reopens it.
        </LI>
        <LI>
          <code>memari-open</code> &mdash; which set of pages you were last editing.
        </LI>
        <LI>
          <code>memari-viewport</code> &mdash; your zoom and scroll position, so the canvas is where
          you left it rather than reset.
        </LI>
      </UL>

      <P>
        If you sign in, Clerk also sets its own cookies to keep you signed in. See{" "}
        <A href="https://clerk.com/legal/privacy">Clerk&rsquo;s privacy policy</A>.
      </P>

      <H2>Who else processes it</H2>

      <P>We use these companies to run the service. They act on our instructions.</P>

      <UL>
        <LI>
          <A href="https://vercel.com/legal/privacy-policy">Vercel</A> &mdash; hosting, and the
          server logs described above.
        </LI>
        <LI>
          <A href="https://neon.com/privacy-policy">Neon</A> &mdash; the database your journals are
          stored in.
        </LI>
        <LI>
          <A href="https://clerk.com/legal/privacy">Clerk</A> &mdash; accounts and sign-in, for
          people who choose to have one.
        </LI>
        <LI>
          <A href="https://polotno.com/">Polotno</A> &mdash; an editor component still loaded on one
          older page of the app, which may contact its own servers to check its licence.
        </LI>
      </UL>

      <H2>How long anything is kept</H2>

      <UL>
        <LI>
          <strong>Guest journals are deleted after 30 days without being opened.</strong> Saved
          pages and saved modules belonging to a guest go when that guest has no journals left.
          This is not a threat to get you to sign up &mdash; it is how we avoid keeping work nobody
          is coming back for. If you want a journal to last, sign in and it comes with you.
        </LI>
        <LI>
          <strong>Account journals are kept until you delete them.</strong> Deleting a journal
          removes its pages and modules.
        </LI>
        <LI>Server logs are kept for a short period by our host, on their schedule.</LI>
      </UL>

      <H2>Exports and printing</H2>

      <P>
        Exporting a PDF builds the file on our server from the journal already stored there and
        hands it straight back to your browser. The file is not kept and not sent anywhere else.
        Printing and posting a physical book is not available yet; when it is, this page will say
        who receives your address and what they receive, before it happens.
      </P>

      <H2>Your choices</H2>

      <UL>
        <LI>Use the app as a guest, and give us no personal details at all.</LI>
        <LI>Delete any journal, saved page or saved module from inside the app.</LI>
        <LI>Export your work as a PDF at any time.</LI>
        <LI>
          Ask us for a copy of what we hold about you, or ask us to delete it, by writing to{" "}
          <a href={`mailto:${LEGAL_CONTACT}`} style={{ color: "#8fa0ff" }}>{LEGAL_CONTACT}</a>. If
          you are in the UK, EU or California you have rights over your personal information under
          local law, and we will honour them wherever you are.
        </LI>
      </UL>

      <H2>Children</H2>

      <P>
        Memari is not aimed at children under 13, and we do not knowingly collect their personal
        information. If you believe a child has given us any, write to us and we will remove it.
      </P>

      <H2>Changes</H2>

      <P>
        If this page changes in a way that affects what we do with your information, we will change
        the date at the top and, for anything significant, tell account holders directly.
      </P>

      <H2>Contact</H2>

      <P>
        {LEGAL_ENTITY} &mdash;{" "}
        <a href={`mailto:${LEGAL_CONTACT}`} style={{ color: "#8fa0ff" }}>{LEGAL_CONTACT}</a>
      </P>
    </LegalPage>
  );
}
