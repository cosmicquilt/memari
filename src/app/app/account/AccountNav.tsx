"use client";

// The account page's parts, down the side (across the top on a phone).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CREAM, cream } from "@/lib/cream";

const PARTS: Array<[href: string, label: string]> = [
  ["/app/account/profile", "Profile"],
  ["/app/account/preferences", "Preferences"],
  ["/app/account/orders", "Orders"],
  ["/app/account/data", "Data & account"],
];

export function AccountNav({ guest }: { guest: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Account" className="acct-nav">
      {PARTS.map(([href, label]) => {
        const here = path === href || path.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={here ? "page" : undefined} className="acct-nav-link" data-here={here || undefined}>
            {label}
          </Link>
        );
      })}
      {guest && <p className="acct-nav-note">You&rsquo;re using Memari as a guest.</p>}
      <style>{`
.acct-nav { display: grid; gap: 2px; position: sticky; top: 24px; }
.acct-nav-link { display: block; padding: 8px 12px; border-radius: 8px; color: ${cream(0.7)}; text-decoration: none; font-size: 14px; }
.acct-nav-link:hover { background: ${cream(0.05)}; color: ${CREAM}; }
.acct-nav-link[data-here] { background: ${cream(0.08)}; color: ${CREAM}; font-weight: 600; }
.acct-nav-note { margin: 10px 12px 0; font-size: 12px; color: ${cream(0.5)}; line-height: 1.45; }
@media (max-width: 720px) {
  .acct-nav { position: static; display: flex; flex-wrap: wrap; gap: 6px; }
  .acct-nav-link { background: ${cream(0.05)}; }
  .acct-nav-note { flex-basis: 100%; margin: 4px 0 0; }
}
`}</style>
    </nav>
  );
}
