"use client";

// memari. for businesses: Light, Dark or Automatic (2026-10-22: "I also
// want a dark mode switch for this ui too"). The choice is this browser's
// (localStorage - a per-viewer convenience, not an account setting), set on
// the root as data-mode by APPEARANCE_SCRIPT before the first paint, so a
// dark screen never flashes light. Automatic follows the system, and keeps
// following it while the page is open.
//
// Which dark: three looks are offered for choosing (business.module.css -
// Studio Night, Graphite, Midnight). In development the menu can switch
// between them; elsewhere it is Studio Night until one is chosen.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import css from "./business.module.css";

type Mode = "light" | "dark" | "auto";
type Look = "night" | "graphite" | "midnight";
const MODE_KEY = "memari-biz-appearance";
const LOOK_KEY = "memari-biz-dark-look";
const LOOKS: Array<{ key: Look; name: string; note: string }> = [
  { key: "night", name: "Studio Night", note: "Warm, cream type" },
  { key: "graphite", name: "Graphite", note: "Apple's dark" },
  { key: "midnight", name: "Midnight", note: "Pen-ink navy" },
];
const CHOOSING_LOOK = process.env.NODE_ENV !== "production";

/** Run first thing inside the root: the stored choice, applied before paint. */
export const APPEARANCE_SCRIPT = `(function(){var r=document.currentScript&&document.currentScript.parentElement;if(!r)return;var m="auto",l="night";try{m=localStorage.getItem("${MODE_KEY}")||"auto";${CHOOSING_LOOK ? `l=localStorage.getItem("${LOOK_KEY}")||"night";` : ""}}catch(e){}var d=m==="dark"||(m==="auto"&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches);r.setAttribute("data-mode",d?"dark":"light");r.setAttribute("data-dark-look",l)})()`;

const read = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const changed = new Set<() => void>();
const subscribe = (fn: () => void) => {
  changed.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    changed.delete(fn);
    window.removeEventListener("storage", fn);
  };
};
const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

function apply(mode: Mode, look: Look) {
  const root = document.querySelector<HTMLElement>("[data-biz-root]");
  if (!root) return;
  root.setAttribute("data-mode", mode === "dark" || (mode === "auto" && systemDark()) ? "dark" : "light");
  root.setAttribute("data-dark-look", look);
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // a private window: it holds for this page only
  }
  for (const fn of changed) fn();
}

export function AppearanceSwitch() {
  const mode = useSyncExternalStore(subscribe, () => read(MODE_KEY, "auto") as Mode, () => "auto" as Mode);
  const look = useSyncExternalStore(subscribe, () => (CHOOSING_LOOK ? (read(LOOK_KEY, "night") as Look) : "night"), () => "night" as Look);
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  // What is stored, on the page - and Automatic keeps up with the system.
  useEffect(() => {
    apply(mode, look);
    if (mode !== "auto") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => apply("auto", look);
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [mode, look]);

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

  const modes: Array<{ key: Mode; name: string }> = [
    { key: "light", name: "Light" },
    { key: "dark", name: "Dark" },
    { key: "auto", name: "Automatic" },
  ];
  return (
    <div ref={holder} className={css.switcher}>
      <button type="button" className={css.appearanceButton} aria-haspopup="menu" aria-expanded={open} aria-label={`Appearance: ${modes.find((m) => m.key === mode)?.name}`} onClick={() => setOpen((o) => !o)}>
        <ModeIcon mode={mode} />
      </button>
      {open && (
        <div className={css.appearanceMenu} role="menu" aria-label="Appearance">
          {modes.map((m) => (
            <button
              key={m.key}
              type="button"
              role="menuitemradio"
              aria-checked={mode === m.key}
              className={css.switcherItem}
              onClick={() => {
                save(MODE_KEY, m.key);
                setOpen(false);
              }}
            >
              <ModeIcon mode={m.key} />
              <span>
                {m.name}
                {m.key === "auto" && <small>As your system is set</small>}
              </span>
              {mode === m.key && <span className={css.check}>✓</span>}
            </button>
          ))}
          {CHOOSING_LOOK && (
            <>
              <div className={css.menuHeading}>Dark look (development, to choose)</div>
              {LOOKS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={look === l.key}
                  className={css.switcherItem}
                  onClick={() => {
                    save(LOOK_KEY, l.key);
                    if (mode === "light") save(MODE_KEY, "dark");
                  }}
                >
                  <span className={css.lookSwatch} data-look={l.key} aria-hidden="true" />
                  <span>
                    {l.name}
                    <small>{l.note}</small>
                  </span>
                  {look === l.key && <span className={css.check}>✓</span>}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ModeIcon({ mode }: { mode: Mode }) {
  if (mode === "light")
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
      </svg>
    );
  if (mode === "dark")
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
      </svg>
    );
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
