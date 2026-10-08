"use client";

// The landing page's nav. Two looks were compared with a switch (2026-09-25:
// a faint frosted bar, or "transparent header with white text"); Andrew
// chose the clear one ("I like clear ... best"). Over the hero it has no
// bar at all and cream type; below the hero, where cream type would vanish
// into the cream page, it takes the faint frosted bar with dark type.
//
// The site's other pages (2026-10-08: Layouts, Pricing, About, Help) have
// no hero, so they ask for it `solid`: the bar from the first frame.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import styles from "./landing.module.css";
import { AccountButton } from "@/app/app/account/AccountButton";

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

/** The site's pages, in the nav. "How it works" is the landing page's own
 *  section; the rest are pages of their own. */
const PAGES: Array<[href: string, label: string]> = [
  ["/#how", "How it works"],
  ["/layouts", "Layouts"],
  ["/pricing", "Pricing"],
  ["/help", "Help"],
];

const never = () => () => {};

export function SiteHeader({ signedIn, guest = false, solid = false }: { signedIn: boolean; guest?: boolean; solid?: boolean }) {
  const clear = useSyncExternalStore(solid ? never : onOverHero, () => !solid && overHero, () => !solid);
  const path = usePathname();
  // On a phone the links do not fit beside the buttons: a Menu button
  // opens them under the bar. Open on the page it was opened on, so any
  // navigation closes it.
  const [menuOn, setMenuOn] = useState<string | null>(null);
  const menu = menuOn === path;
  const setMenu = (open: boolean | ((was: boolean) => boolean)) => setMenuOn((typeof open === "function" ? open(menu) : open) ? path : null);
  return (
    <header className={`${styles.nav} ${clear ? styles.navClear : ""}`}>
      {/* The mark: "m." (2026-09-25). */}
      <Link href="/" className={`${styles.brand} ${styles.brandMark}`} aria-label="Memari Studio, home">
        m.
      </Link>
      <nav className={styles.links} aria-label="Site">
        {PAGES.map(([href, label]) => {
          const here = path === href || path.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} aria-current={here ? "page" : undefined}>
              {label}
            </Link>
          );
        })}
      </nav>
      <div className={styles.actions}>
        <button type="button" className={styles.menuButton} aria-expanded={menu} aria-controls="site-menu" onClick={() => setMenu((m) => !m)}>
          {menu ? "Close" : "Menu"}
        </button>
        {signedIn ? (
          <>
            <Link href="/app" className={styles.primary}>
              Open Memari
            </Link>
            <AccountButton guest={guest} />
          </>
        ) : (
          <>
            <Link href="/sign-in?redirect_url=%2Fapp" className={styles.quiet}>
              Sign in
            </Link>
            {/* "Build for Free" (2026-09-25). */}
            <Link href="/app" className={styles.primary}>
              Build for Free
            </Link>
          </>
        )}
      </div>
      {menu && (
        <nav id="site-menu" className={styles.menuPanel} aria-label="Site">
          {PAGES.map(([href, label]) => (
            <Link key={href} href={href} onClick={() => setMenu(false)}>
              {label}
            </Link>
          ))}
          <Link href="/about" onClick={() => setMenu(false)}>
            About
          </Link>
          {!signedIn && (
            <Link href="/sign-in?redirect_url=%2Fapp" onClick={() => setMenu(false)}>
              Sign in
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
