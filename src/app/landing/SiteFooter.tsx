// The site's footer, on the landing page and every page beside it
// (2026-10-08, when one page became a site): what Memari is in a line, and
// every page, grouped the way people look for them.

import Link from "next/link";
import { LEGAL_CONTACT, LEGAL_ENTITY } from "@/app/legal/LegalPage";
import site from "./site.module.css";

const COLUMNS: Array<[heading: string, links: Array<[href: string, label: string]>]> = [
  [
    "Product",
    [
      ["/#how", "How it works"],
      ["/layouts", "Layouts"],
      ["/pricing", "Pricing"],
      ["/print", "Print it yourself"],
      ["/app", "Open Memari"],
    ],
  ],
  ["Company", [["/about", "About"]]],
  [
    "Support",
    [
      ["/help", "Help & FAQ"],
      [`mailto:${LEGAL_CONTACT}`, "Contact"],
    ],
  ],
  [
    "Legal",
    [
      ["/privacy", "Privacy"],
      ["/terms", "Terms"],
    ],
  ],
];

export function SiteFooter() {
  return (
    <footer className={site.footer}>
      <div className={site.footerTop}>
        <div className={site.footerAbout}>
          <Link href="/" className={site.footerBrand} aria-label="Memari Studio, home">
            memari.<span>studio</span>
          </Link>
          <p>Design a week once. Memari lays out the whole book, dated and ready to print.</p>
        </div>
        {COLUMNS.map(([heading, links]) => (
          <nav key={heading} aria-label={heading} className={site.footerColumn}>
            <h2>{heading}</h2>
            <ul>
              {links.map(([href, label]) => (
                <li key={href}>
                  {href.startsWith("mailto:") ? <a href={href}>{label}</a> : <Link href={href}>{label}</Link>}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className={site.footerSmall}>
        © {new Date().getFullYear()} {LEGAL_ENTITY}
      </p>
    </footer>
  );
}
