"use client";

// "Tell us" (2026-10-31, the first coaches): what's wrong, or what a coach
// wishes it did, from wherever they are in the workspace - with that page
// sent along, kept for the pilot page and emailed to us.

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendFeedback } from "./actions";
import css from "./business.module.css";

export function TellUs() {
  const page = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<{ sent?: boolean; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !holder.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={holder} className={css.switcher}>
      <button
        type="button"
        className={css.tellButton}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((o) => !o);
          if (state?.sent) setState(null);
        }}
      >
        Tell us
      </button>
      {open && (
        <form
          className={css.tellMenu}
          role="dialog"
          aria-label="Tell us"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const result = await sendFeedback(page, message);
              setState(result);
              if (result.sent) setMessage("");
            });
          }}
        >
          {state?.sent ? (
            <p role="status">Thank you: it&rsquo;s with us now, and we&rsquo;ll answer by email.</p>
          ) : (
            <>
              <label className={css.field}>
                <span>What&rsquo;s wrong, or what do you wish it did?</span>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} autoFocus required />
                <small>It reaches us straight away, with the page you&rsquo;re on.</small>
              </label>
              {state?.error && (
                <p className={css.error} role="alert">
                  {state.error}
                </p>
              )}
              <div className={css.actions}>
                <button type="submit" className={`${css.btn} ${css.primary}`} disabled={pending || !message.trim()}>
                  {pending ? "Sending…" : "Send"}
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
