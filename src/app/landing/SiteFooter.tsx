// The site's footer, on the landing page and every page beside it
// (2026-10-08, when one page became a site): what Memari is in a line, and
// every page, grouped the way people look for them - the whole site map
// since 2026-10-26 (siteMap.ts), with Privacy and Terms on the line under it.

import Link from "next/link";
import { LEGAL_ENTITY } from "@/app/legal/LegalPage";
import { FOOTER_COLUMNS, LEGAL_LINKS, type SiteLink } from "./siteMap";
import site from "./site.module.css";

function FooterLink({ href, label }: SiteLink) {
  return href.startsWith("mailto:") ? <a href={href}>{label}</a> : <Link href={href}>{label}</Link>;
}

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
        {FOOTER_COLUMNS.map(({ heading, links }) => (
          <nav key={heading} aria-label={heading} className={site.footerColumn}>
            <h2>{heading}</h2>
            <ul>
              {links.map((link) => (
                <li key={link.href}>
                  <FooterLink {...link} />
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className={site.footerSmall}>
        <span>
          © {new Date().getFullYear()} {LEGAL_ENTITY}
        </span>
        <nav aria-label="Legal" className={site.footerLegal}>
          {LEGAL_LINKS.map((link) => (
            <FooterLink key={link.href} {...link} />
          ))}
        </nav>
      </div>
    </footer>
  );
}
