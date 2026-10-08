// memari.studio/app/account - the person's own page (2026-10-08: "a user
// page that can be accessed by a user icon in the top right on the landing
// header, /app, and in journals and have relevant user settings and
// features"). Four parts, each its own address so a link can go straight to
// one: Profile (name, photo, email, sign-in - Clerk's own panel), Preferences
// (defaults for new journals), Orders (printed books - what was /app/orders), and Data
// & account (downloads, signing out, deleting everything).
//
// In the app's dark chrome, the same as the printed-books page it absorbed
// and the sign-in page.

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentOwner, signInPath } from "@/lib/owner";
import { CREAM, cream, onCream } from "@/lib/cream";
import { AccountNav } from "./AccountNav";

export const metadata: Metadata = { title: "Account - memari. STUDIO", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const owner = await currentOwner();
  if (!owner) redirect(signInPath("/app/account"));
  return (
    <main style={{ minHeight: "100vh", background: "#141414", color: onCream(0xdd), boxSizing: "border-box", paddingBlock: "28px 64px", paddingInline: 16 }}>
      <div className="acct" style={{ maxWidth: 920, margin: "0 auto", display: "grid", gap: 28 }}>
        <header style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Link href="/app" style={{ color: CREAM, textDecoration: "none", flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 17 }}>
              memari. <span style={{ fontWeight: 200, fontSize: "0.8em", letterSpacing: "0.1em" }}>STUDIO</span>
            </strong>
          </Link>
          <Link href="/app" style={{ fontSize: 13, color: cream(0.65) }}>
            Back to your journals
          </Link>
        </header>
        <div className="acct-body">
          <AccountNav guest={owner.guest} />
          <section style={{ minWidth: 0, display: "grid", gap: 18, alignContent: "start" }}>{children}</section>
        </div>
      </div>
      <style>{`
.acct-body { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 32px; align-items: start; }
@media (max-width: 720px) { .acct-body { grid-template-columns: minmax(0, 1fr); gap: 18px; } }
.acct h1 { margin: 0; font-size: 22px; color: ${CREAM}; font-weight: 650; }
.acct h2 { margin: 0; font-size: 15px; color: ${CREAM}; font-weight: 650; }
.acct p { margin: 0; line-height: 1.55; }
.acct .acct-card { padding: 16px; background: #1c1c1e; border: 1px solid ${cream(0.1)}; border-radius: 10px; display: grid; gap: 12px; }
.acct .acct-dim { color: ${cream(0.6)}; font-size: 13px; }
.acct .acct-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 0 14px; border-radius: 8px; border: none; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; text-decoration: none; background: #2a2a2a; color: ${CREAM}; }
.acct .acct-btn:hover { background: #333; }
.acct .acct-primary { background: #4a5cff; color: #fff; }
.acct .acct-primary:hover { background: #5b6bff; }
.acct .acct-danger { background: #5a1f1f; color: #ffd9d4; }
.acct .acct-danger:hover { background: #6d2525; }
.acct .acct-btn:disabled { opacity: 0.45; cursor: default; }
.acct a:focus-visible, .acct button:focus-visible, .acct select:focus-visible, .acct input:focus-visible { outline: 2px solid #8a97ff; outline-offset: 2px; }
.acct select, .acct input[type="text"] { font: inherit; font-size: 13.5px; color: ${CREAM}; background: #2a2a2a; border: 1px solid ${cream(0.12)}; border-radius: 8px; min-height: 36px; padding: 0 10px; }
`}</style>
    </main>
  );
}
