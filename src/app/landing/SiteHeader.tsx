"use client";

// The landing page's nav, in one of two looks to compare (Andrew,
// 2026-09-25: "make the header nav background min opacity that is visible
// also i want to compare that with transparent header with white text.
// make both with a floating switch absolute bottom right of screen"):
//   - frosted: a faint cream glass - as little of it as still reads;
//   - clear: no background at all, cream text, over the hero. Below the
//     hero, where cream text would vanish into the cream page, it takes
//     the frosted look.
// The switch shows in development, and on the live site with ?tune; the
// choice is remembered in this browser.

import Link from "next/link";
import { useSyncExternalStore } from "react";
import styles from "./landing.module.css";

type Look = "frosted" | "clear";
const KEY = "memari.landing.headerLook";

let look: Look | null = null;
const lookListeners = new Set<() => void>();
function getLook(): Look {
  if (look === null) {
    look = "frosted";
    try {
      if (window.localStorage.getItem(KEY) === "clear") look = "clear";
    } catch {
      // No storage: the default.
    }
  }
  return look;
}
function setLook(next: Look) {
  look = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // Not remembered; still applied.
  }
  for (const l of lookListeners) l();
}
function onLook(l: () => void) {
  lookListeners.add(l);
  return () => {
    lookListeners.delete(l);
  };
}

/** Whether the hero - the first section - is still under the nav. */
let overHero = true;
function onOverHero(cb: () => void) {
  const hero = document.querySelector("main > section");
  if (!hero) return () => {};
  const io = new IntersectionObserver(
    ([entry]) => {
      overHero = entry.isIntersecting;
      cb();
    },
    // The nav's own strip: the hero counts while any of it is behind it.
    { rootMargin: "0px 0px -100% 0px", threshold: 0 }
  );
  io.observe(hero);
  return () => io.disconnect();
}

const noop = () => () => {};
const tuning = () => process.env.NODE_ENV !== "production" || new URLSearchParams(window.location.search).has("tune");

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const current = useSyncExternalStore(onLook, getLook, () => "frosted" as Look);
  const hero = useSyncExternalStore(onOverHero, () => overHero, () => true);
  const showSwitch = useSyncExternalStore(noop, tuning, () => false);
  const clear = current === "clear" && hero;
  return (
    <>
      <header className={`${styles.nav} ${clear ? styles.navClear : ""}`}>
        <Link href="/" className={styles.brand} aria-label="Memari Studio, home">
          memari.<span>studio</span>
        </Link>
        <nav className={styles.links} aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#layouts">Layouts</a>
          <a href="#print">Print</a>
        </nav>
        <div className={styles.actions}>
          {signedIn ? (
            <Link href="/app" className={styles.primary}>
              Open Memari
            </Link>
          ) : (
            <>
              <Link href="/sign-in?redirect_url=%2Fapp" className={styles.quiet}>
                Sign in
              </Link>
              <Link href="/app" className={styles.primary}>
                Start your planner
              </Link>
            </>
          )}
        </div>
      </header>
      {showSwitch && (
        <div className={styles.lookSwitch} role="group" aria-label="Header look">
          <span className={styles.lookLabel}>Header</span>
          {(["frosted", "clear"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={current === l} className={current === l ? styles.lookOn : undefined} onClick={() => setLook(l)}>
              {l === "frosted" ? "Frosted" : "Clear"}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
