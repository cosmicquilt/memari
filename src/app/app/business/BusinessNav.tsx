"use client";

// The business's side menu: Home, Clients, Groups, Templates, Orders, then Settings
// and Help at the bottom (across the top on a phone).

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import css from "./business.module.css";

const icon = (d: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const MAIN: Array<[href: string, label: string, glyph: ReactNode]> = [
  ["/app/business", "Home", icon(<path d="M3.5 9 10 3.5 16.5 9v7a1 1 0 0 1-1 1h-3.5v-5h-4v5H4.5a1 1 0 0 1-1-1V9Z" />)],
  ["/app/business/clients", "Clients", icon(<><circle cx="7.5" cy="7" r="2.8" /><path d="M2.5 16.5c.7-2.6 2.6-4 5-4s4.3 1.4 5 4" /><circle cx="14" cy="7.5" r="2.2" /><path d="M13.5 12.6c2 .1 3.4 1.4 4 3.9" /></>)],
  ["/app/business/groups", "Groups", icon(<><circle cx="10" cy="5.8" r="2.3" /><circle cx="4.8" cy="9.4" r="1.9" /><circle cx="15.2" cy="9.4" r="1.9" /><path d="M6.6 16.8c.6-2.4 1.9-3.7 3.4-3.7s2.8 1.3 3.4 3.7M1.9 15.6c.4-1.7 1.4-2.7 2.9-2.8M18.1 15.6c-.4-1.7-1.4-2.7-2.9-2.8" /></>)],
  ["/app/business/templates", "Templates", icon(<><rect x="3.5" y="3" width="13" height="14" rx="1.5" /><path d="M3.5 7.5h13M8 7.5V17" /></>)],
  ["/app/business/orders", "Orders", icon(<><path d="M4 6.5 10 3.5l6 3v7l-6 3-6-3v-7Z" /><path d="M4 6.5 10 9.5l6-3M10 9.5v7" /></>)],
];

const BOTTOM: Array<[href: string, label: string, glyph: ReactNode]> = [
  ["/app/business/settings", "Settings", icon(<><circle cx="10" cy="10" r="2.6" /><path d="M10 2.8v2M10 15.2v2M2.8 10h2M15.2 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4" /></>)],
  ["/help", "Help", icon(<><circle cx="10" cy="10" r="7" /><path d="M8 8a2 2 0 1 1 2.7 1.9c-.5.2-.7.6-.7 1.1v.5M10 14.2v.1" /></>)],
];

export function BusinessNav() {
  const path = usePathname();
  const link = ([href, label, glyph]: (typeof MAIN)[number]) => {
    const here = href === "/app/business" ? path === href : path === href || path.startsWith(`${href}/`);
    return (
      <Link key={href} href={href} className={css.navLink} aria-current={here ? "page" : undefined}>
        {glyph}
        {label}
      </Link>
    );
  };
  return (
    <nav aria-label="Business" className={css.nav}>
      <div className={css.navGroup}>{MAIN.map(link)}</div>
      <span />
      <div className={css.navGroup}>{BOTTOM.map(link)}</div>
    </nav>
  );
}
