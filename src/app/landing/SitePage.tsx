// A page of the site beside the landing page - Layouts, Pricing, About,
// Help: the same paper, type and nav, with the nav's bar from the first
// frame (there is no hero to be clear over), and the shared footer.

import type { ReactNode } from "react";
import { currentOwner } from "@/lib/owner";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { sans } from "./sansFont";
import { script } from "./scriptFont";
import styles from "./landing.module.css";
import site from "./site.module.css";

export async function SitePage({ children }: { children: ReactNode }) {
  const owner = await currentOwner();
  return (
    <div className={`${styles.page} ${script.variable} ${sans.variable}`}>
      <SiteHeader signedIn={owner !== null} guest={owner?.guest ?? false} solid />
      <main className={site.main}>{children}</main>
      <SiteFooter />
    </div>
  );
}
