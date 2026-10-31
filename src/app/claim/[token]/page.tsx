// memari.studio/claim/<token> - a workspace prepared for a coach
// (src/lib/businessClaim.ts): what it is, and the button that makes it
// theirs. The link is private; this page tells nothing about the workspace
// beyond its name until the button is pressed.

import type { Metadata } from "next";
import Link from "next/link";
import { claimTargetFor, CLAIM_DAYS } from "@/lib/businessClaim";
import { BusinessMark } from "@/app/app/business/WorkspaceSwitcher";
import { ClaimButton } from "./ClaimButton";
import css from "@/app/app/business/business.module.css";

export const metadata: Metadata = { title: "Your workspace", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await claimTargetFor(token);
  return (
    <main className={css.biz} data-mode="light" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "48px 16px" }}>
      <div className={css.card} style={{ maxWidth: 520, width: "100%", display: "grid", gap: 16 }}>
        {target ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <BusinessMark name={target.name} logoUrl={target.logoUrl} />
              <strong>{target.name}</strong>
            </div>
            <h1 style={{ margin: 0, fontSize: "var(--h1-size)", fontWeight: 700, lineHeight: 1.15 }}>Your workspace is ready</h1>
            <p>
              Set up for you on memari.: your framework as a journal, ready to print for your clients, with you as the first client so your own copy is one order away.
            </p>
            <div className={css.actions}>
              <ClaimButton token={token} />
            </div>
            <p className={css.dim}>
              It&rsquo;s yours. This link opens it once; sign in, or make an account, to keep it and reach it from anywhere. Until then it lives in this browser.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ margin: 0, fontSize: "var(--h1-size)", fontWeight: 700, lineHeight: 1.15 }}>This link has stopped working</h1>
            <p>It opens a workspace once, and it&rsquo;s been used, or it&rsquo;s more than {CLAIM_DAYS} days old.</p>
            <p className={css.dim}>
              If you opened it before and signed in, <Link href="/sign-in?redirect_url=%2Fapp%2Fbusiness" className={css.textLink}>sign in</Link> again to reach it. Otherwise, ask the person who sent it for a new link.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
