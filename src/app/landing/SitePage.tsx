// A page of the site beside the landing page - Layouts, Pricing, About,
// Help, Print: the same paper, type and nav, with the nav's bar from the
// first frame (there is no hero to be clear over), the landing body's doodle
// wall behind it (Andrew, 2026-10-08: "add doodle wall in background of
// all"), and the shared footer.

import type { CSSProperties, ReactNode } from "react";
import { currentOwner } from "@/lib/owner";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { BodyDoodles } from "./BodyDoodles";
import { BODY_WALL_DEFAULTS, pageVars } from "./bodyWall";
import { sans } from "./sansFont";
import { script } from "./scriptFont";
import styles from "./landing.module.css";
import site from "./site.module.css";

export async function SitePage({ children }: { children: ReactNode }) {
  const owner = await currentOwner();
  return (
    <div className={`${styles.page} ${script.variable} ${sans.variable}`} style={pageVars(BODY_WALL_DEFAULTS) as CSSProperties}>
      <SiteHeader signedIn={owner !== null} guest={owner?.guest ?? false} solid />
      <main className={site.main}>
        <BodyDoodles band={0} />
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
