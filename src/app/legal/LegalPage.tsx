import type { ReactNode } from "react";
import Link from "next/link";

// The shell both legal pages sit in.
//
// Long-form reading rather than app chrome: a single measured column, dark
// like the rest of the site but at a comfortable line length, and no
// navigation to get lost in. Someone reaching these from Google's OAuth
// consent screen has never seen the app and has one question; the page
// should answer it and nothing else.
//
// Deliberately NOT a client component and deliberately not behind auth -
// Google's consent screen fetches these URLs itself, and a policy you have
// to sign in to read is not a published policy.

export const LEGAL_CONTACT = "hello@memari.studio";

/** The entity these documents bind. */
export const LEGAL_ENTITY = "Memari LLC";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** ISO date. Shown as written, so it cannot drift with a timezone. */
  updated: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0c0c0c",
        color: "#e8e8e8",
        padding: "48px 20px 96px",
        font: '16px/1.65 var(--font-almarai), Arial, Helvetica, sans-serif',
      }}
    >
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <Link
          href="/"
          style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none", fontSize: 14 }}
        >
          Memari <span style={{ fontWeight: 200, letterSpacing: "0.1em" }}>STUDIO</span>
        </Link>
        <h1 style={{ fontSize: 30, margin: "22px 0 6px", lineHeight: 1.2 }}>{title}</h1>
        <p style={{ margin: "0 0 34px", color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
          Last updated {updated}
        </p>
        {children}
        <hr style={{ border: 0, borderTop: "1px solid rgba(255,255,255,0.12)", margin: "44px 0 20px" }} />
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
          Questions about either document: <a href={`mailto:${LEGAL_CONTACT}`} style={linkStyle}>{LEGAL_CONTACT}</a>.
          {" "}
          <Link href="/privacy" style={linkStyle}>Privacy</Link>
          {" · "}
          <Link href="/terms" style={linkStyle}>Terms</Link>
        </p>
      </div>
    </main>
  );
}

const linkStyle = { color: "#8fa0ff", textDecoration: "underline" } as const;

export function H2({ children }: { children: ReactNode }) {
  return <h2 style={{ fontSize: 19, margin: "34px 0 10px", lineHeight: 1.3 }}>{children}</h2>;
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: "0 0 14px" }}>{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul style={{ margin: "0 0 14px", paddingLeft: 22 }}>{children}</ul>;
}

export function LI({ children }: { children: ReactNode }) {
  return <li style={{ margin: "0 0 7px" }}>{children}</li>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" style={linkStyle}>
      {children}
    </a>
  );
}

/** A plain-English summary above the detail. Not a substitute for it, and it
 *  says so - but most people read one box and leave, and they deserve an
 *  accurate one. */
export function Summary({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.045)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10,
        padding: "16px 18px",
        margin: "0 0 26px",
      }}
    >
      {children}
    </div>
  );
}
