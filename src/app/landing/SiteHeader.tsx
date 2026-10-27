"use client";

// The landing page's nav. Two looks were compared with a switch (2026-09-25:
// a faint frosted bar, or "transparent header with white text"); Andrew
// chose the clear one ("I like clear ... best"). Over the hero it has no
// bar at all and cream type, only a blur of the hero once the page has
// moved from the top; below the hero, where cream type would vanish
// into the cream page, it takes the faint frosted bar with dark type.
//
// The site's other pages (2026-10-08: Layouts, Pricing, About, Help) have
// no hero, so they ask for it `solid`: the bar from the first frame.
//
// What it links to is the site map (siteMap.ts, 2026-10-26): a Layouts
// menu, Covers, How it works and Help, "For coaches" beside Sign in. The
// Layouts menu opens on a CLICK, never a hover - hover is unreliable on
// Andrew's touchscreen laptop (memari-pointer-not-media) and NN/g's 2024
// menu checklist says the same - and closes on Escape, a click outside,
// a link in it, or a new page. While a menu is open the bar is solid, so
// the cream panel never hangs under a clear bar over the hero.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import styles from "./landing.module.css";
import { AccountButton } from "@/app/app/account/AccountButton";
import { FOR_COACHES, HEADER_LINKS, LAYOUTS_MENU, headerSection } from "./siteMap";

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

/** Whether the page has moved from the top: over the hero the bar then
 *  blurs it (2026-10-14: "blurry header when moved from top spot, not
 *  starting at bottom of hero"). A boolean, so React renders only when it
 *  flips, not on every scroll event. */
function onScroll(cb: () => void) {
  window.addEventListener("scroll", cb, { passive: true });
  return () => window.removeEventListener("scroll", cb);
}

const never = () => () => {};

function Caret() {
  return (
    <svg className={styles.caret} viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SiteHeader({ signedIn, guest = false, solid = false }: { signedIn: boolean; guest?: boolean; solid?: boolean }) {
  const clear = useSyncExternalStore(solid ? never : onOverHero, () => !solid && overHero, () => !solid);
  const moved = useSyncExternalStore(solid ? never : onScroll, () => !solid && window.scrollY > 0, () => false);
  const path = usePathname();
  const section = headerSection(path);
  // Each menu is open on the page it was opened on, so any navigation
  // closes it. Menu = the phone's; layouts = the desktop Layouts menu and,
  // on the phone, its group in the Menu.
  const [menuOn, setMenuOn] = useState<string | null>(null);
  const [layoutsOn, setLayoutsOn] = useState<string | null>(null);
  const menu = menuOn === path;
  const layouts = layoutsOn === path;
  const setMenu = (open: boolean) => setMenuOn(open ? path : null);
  const setLayouts = (open: boolean) => setLayoutsOn(open ? path : null);
  const header = useRef<HTMLElement>(null);
  const layoutsButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Escape closes the open menu and gives focus back to the button that
  // opened it (the phone's Menu, or Layouts); a press outside the header,
  // or focus tabbing out of it, closes it - an open panel must not hang
  // over the control focus has moved on to (review, 2026-10-26).
  useEffect(() => {
    if (!layouts && !menu) return;
    const outside = (target: EventTarget | null) => !!header.current && !header.current.contains(target as Node);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      (menu ? menuButton : layoutsButton).current?.focus();
      setLayoutsOn(null);
      setMenuOn(null);
    };
    const onDown = (e: PointerEvent) => {
      if (outside(e.target)) {
        setLayoutsOn(null);
        setMenuOn(null);
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (outside(e.target)) {
        setLayoutsOn(null);
        setMenuOn(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("focusin", onFocus);
    };
  }, [layouts, menu]);

  const close = () => {
    setLayoutsOn(null);
    setMenuOn(null);
  };
  const bare = clear && !layouts && !menu;
  // The Layouts menu comes straight after its button, and the phone's panel
  // straight after Menu, in the page's order: Tab goes into a menu as soon
  // as it opens, and it sits in the Site navigation landmark (review,
  // 2026-10-26). Both are still placed under the bar by the fixed header.
  const layoutsMenu = (
    <div id="layouts-menu" className={styles.mega}>
      <div className={styles.megaColumn}>
        <Link href={LAYOUTS_MENU.planners.href} className={styles.megaHead} onClick={close}>
          {LAYOUTS_MENU.planners.label} <small>{LAYOUTS_MENU.planners.note}</small>
        </Link>
        <ul className={`${styles.megaList} ${styles.megaShelves}`}>
          {LAYOUTS_MENU.shelves.map(([label, id]) => (
            <li key={id}>
              <Link href={`/layouts#${id}`} onClick={close}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.megaColumn}>
        <Link href={LAYOUTS_MENU.spreads.href} className={styles.megaHead} onClick={close}>
          {LAYOUTS_MENU.spreads.label} <small>{LAYOUTS_MENU.spreads.note}</small>
        </Link>
        <ul className={styles.megaList}>
          {LAYOUTS_MENU.kinds.map(([label, id]) => (
            <li key={id}>
              <Link href={`/layouts#${id}`} onClick={close}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/layouts" className={styles.megaAll} onClick={close}>
          All layouts →
        </Link>
      </div>
      <div className={styles.megaColumn}>
        <span className={styles.megaHead}>Start from</span>
        {LAYOUTS_MENU.start.map(({ href, label, note }) => (
          <Link key={href} href={href} className={styles.megaCard} onClick={close}>
            <strong>{label}</strong>
            <span>{note}</span>
          </Link>
        ))}
      </div>
    </div>
  );
  const phoneMenu = (
    <nav id="site-menu" className={styles.menuPanel} aria-label="Site">
      <button type="button" className={styles.menuGroup} aria-expanded={layouts} aria-controls="site-menu-layouts" onClick={() => setLayouts(!layouts)}>
        Layouts <Caret />
      </button>
      {layouts && (
        <div id="site-menu-layouts" className={styles.menuSub}>
          <Link href={LAYOUTS_MENU.planners.href} onClick={close}>
            Planners
          </Link>
          <Link href={LAYOUTS_MENU.spreads.href} onClick={close}>
            Weeks, months &amp; days
          </Link>
          {LAYOUTS_MENU.start.slice(0, 2).map(({ href, label }) => (
            <Link key={href} href={href} onClick={close}>
              {label}
            </Link>
          ))}
        </div>
      )}
      {HEADER_LINKS.map(({ href, label }) => (
        <Link key={href} href={href} onClick={close}>
          {label}
        </Link>
      ))}
      <div className={styles.menuSmall}>
        <Link href={FOR_COACHES.href} onClick={close}>
          {FOR_COACHES.label}
        </Link>
        <Link href="/about" onClick={close}>
          About
        </Link>
        {!signedIn && (
          <Link href="/sign-in?redirect_url=%2Fapp" onClick={close}>
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
  return (
    <header ref={header} className={`${styles.nav} ${bare ? styles.navClear : ""} ${bare && moved ? styles.navMoved : ""} ${layouts || menu ? styles.navOpen : ""}`} data-off-paper="">
      {/* The mark: "m." (2026-09-25). On the home page itself it changes no
          address, so it closes an open menu by hand. */}
      <Link href="/" className={`${styles.brand} ${styles.brandMark}`} aria-label="Memari Studio, home" onClick={close}>
        m.
      </Link>
      <nav className={styles.links} aria-label="Site">
        <button
          ref={layoutsButton}
          type="button"
          className={styles.linkButton}
          aria-expanded={layouts && !menu}
          aria-controls="layouts-menu"
          aria-current={section === "layouts" ? "page" : undefined}
          onClick={() => {
            // Opens whatever aria-expanded says is shut - also after the
            // phone Menu's Layouts group was left open and the screen
            // widened (review, 2026-10-26).
            const opening = !(layouts && !menu);
            setMenu(false);
            setLayouts(opening);
          }}
        >
          Layouts <Caret />
        </button>
        {layouts && !menu && layoutsMenu}
        {HEADER_LINKS.map(({ href, label }) => (
          <Link key={href} href={href} aria-current={section === href ? "page" : undefined} onClick={close}>
            {label}
          </Link>
        ))}
      </nav>
      <div className={styles.actions}>
        <button
          ref={menuButton}
          type="button"
          className={styles.menuButton}
          aria-expanded={menu}
          aria-controls="site-menu"
          onClick={() => {
            setLayouts(false);
            setMenu(!menu);
          }}
        >
          {menu ? "Close" : "Menu"}
        </button>
        {menu && phoneMenu}
        <Link href={FOR_COACHES.href} className={`${styles.quiet} ${styles.quietWide}`}>
          {FOR_COACHES.label}
        </Link>
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
    </header>
  );
}
