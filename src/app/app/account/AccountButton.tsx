"use client";

// The person, top right: their photo or initial (a guest gets a plain
// figure), opening a short menu - their journals, the account page's parts,
// and signing out (a guest: signing in). Asked for 2026-10-08, "a user icon
// in the top right on the landing header, /app, and in journals".
//
// One look everywhere it sits: the landing nav over the hero, the start
// dialog and the editor. The menu is the app's dark panel in all three.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { CREAM, cream } from "@/lib/cream";

const PANEL = "#1c1c1e";

const LINKS: Array<[href: string, label: string]> = [
  ["/app", "Your journals"],
  ["/app/account/profile", "Account"],
  ["/app/account/preferences", "Preferences"],
  ["/app/account/orders", "Orders"],
];

function GuestFigure({ size }: { size: number }) {
  return (
    <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <circle cx="10" cy="7" r="3.4" />
      <path d="M3.6 17.4c.9-3.3 3.4-5 6.4-5s5.5 1.7 6.4 5" />
    </svg>
  );
}

export function AccountButton({ guest, size = 32 }: { guest: boolean; size?: number }) {
  const { user, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Closed by a press anywhere else, or Escape (which gives focus back).
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = [...(wrap.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
        if (items.length === 0) return;
        e.preventDefault();
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
        items[next].focus();
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const signedIn = isSignedIn === true && !!user;
  const name = signedIn ? user.fullName || user.username || user.primaryEmailAddress?.emailAddress || "Your account" : "Guest";
  const email = signedIn ? user.primaryEmailAddress?.emailAddress : null;
  const initial = (signedIn ? user.firstName || user.username || email || "?" : "?").trim().charAt(0).toUpperCase();
  const photo = signedIn && user.hasImage ? user.imageUrl : null;
  const label = signedIn ? `Account: ${name}` : guest ? "Account: guest" : "Account";

  // `font` first: the shorthand resets the size, so the size comes after it.
  const item: React.CSSProperties = {
    font: "inherit",
    fontSize: 13.5,
    lineHeight: 1.35,
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 12px",
    borderRadius: 7,
    color: cream(0.88),
    textDecoration: "none",
    textAlign: "left",
    background: "none",
    border: "none",
    cursor: "pointer",
  };

  return (
    <div ref={wrap} className="memari-account" style={{ position: "relative", display: "inline-flex", fontFamily: "var(--font-ui, system-ui)" }}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: size,
          height: size,
          padding: 0,
          borderRadius: "50%",
          border: "none",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          background: photo ? "#2a2a2a" : signedIn ? "#4a5cff" : "#3a3a3c",
          color: "#fff",
          fontSize: size * 0.42,
          fontWeight: 650,
          boxShadow: `0 0 0 1px ${cream(0.22)}, 0 1px 6px rgba(0,0,0,0.25)`,
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- Clerk's own image host; a 32px avatar needs no optimiser
          <img src={photo} alt="" width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : signedIn ? (
          initial
        ) : (
          <GuestFigure size={size} />
        )}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          style={{
            position: "absolute",
            top: `calc(100% + 8px)`,
            right: 0,
            zIndex: 1000,
            width: 236,
            padding: 6,
            background: PANEL,
            border: `1px solid ${cream(0.12)}`,
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.38)",
            color: CREAM,
            textShadow: "none",
          }}
        >
          <div style={{ padding: "8px 12px 10px", borderBottom: `1px solid ${cream(0.08)}`, marginBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            <div style={{ fontSize: 12, lineHeight: 1.4, color: cream(0.55), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: email ? "nowrap" : "normal" }}>
              {email ?? "Sign in to keep your work on any device"}
            </div>
          </div>
          {LINKS.map(([href, text]) => (
            <Link key={href} role="menuitem" href={href} className="memari-account-item" style={item} onClick={() => setOpen(false)}>
              {text}
            </Link>
          ))}
          <div style={{ height: 1, background: cream(0.08), margin: "4px 0" }} />
          {signedIn ? (
            <button
              type="button"
              role="menuitem"
              className="memari-account-item"
              style={item}
              onClick={() => {
                setOpen(false);
                void signOut({ redirectUrl: "/" });
              }}
            >
              Sign out
            </button>
          ) : (
            <Link role="menuitem" className="memari-account-item" style={item} href={`/sign-in?redirect_url=${encodeURIComponent(path || "/app")}`} onClick={() => setOpen(false)}>
              Sign in
            </Link>
          )}
        </div>
      )}
      <style>{`
.memari-account-item:hover, .memari-account-item:focus-visible { background: ${cream(0.08)} !important; color: ${CREAM} !important; outline: none; }
.memari-account > button:focus-visible { outline: 2px solid #8a97ff; outline-offset: 2px; }
`}</style>
    </div>
  );
}
