"use client";

// The landing page's nav. Two looks were compared with a switch (2026-09-25:
// a faint frosted bar, or "transparent header with white text"); Andrew
// chose the clear one ("I like clear ... best"). Over the hero it has no
// bar at all and cream type; below the hero, where cream type would vanish
// into the cream page, it takes the faint frosted bar with dark type.

import Link from "next/link";
import { useSyncExternalStore } from "react";
import styles from "./landing.module.css";

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

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const clear = useSyncExternalStore(onOverHero, () => overHero, () => true);
  return (
    <header className={`${styles.nav} ${clear ? styles.navClear : ""}`}>
      {/* The mark: "m." (2026-09-25). */}
      <Link href="/" className={`${styles.brand} ${styles.brandMark}`} aria-label="Memari Studio, home">
        m.
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
  );
}
