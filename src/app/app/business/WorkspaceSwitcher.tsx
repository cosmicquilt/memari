"use client";

// Top left: which workspace you are in - your own journals, or the
// business - and the way to the other.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import css from "./business.module.css";

export function BusinessMark({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <span className={css.mark} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logoUrl ? <img src={logoUrl} alt="" /> : name.trim().charAt(0).toUpperCase() || "M"}
    </span>
  );
}

export function WorkspaceSwitcher({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className={css.switcher} ref={box}>
      <button type="button" className={css.switcherButton} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <BusinessMark name={name} logoUrl={logoUrl} />
        {name}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className={css.switcherMenu} role="menu">
          <Link href="/app/business" role="menuitem" className={css.switcherItem} onClick={() => setOpen(false)}>
            <BusinessMark name={name} logoUrl={logoUrl} />
            <span>
              {name}
              <small>memari. for businesses</small>
            </span>
            <span className={css.check} aria-label="Current">
              ✓
            </span>
          </Link>
          <Link href="/app" role="menuitem" className={css.switcherItem} onClick={() => setOpen(false)}>
            <span className={css.mark} style={{ background: "#1d1d1f" }} aria-hidden="true">
              m.
            </span>
            <span>
              Your journals
              <small>Your own planner</small>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
