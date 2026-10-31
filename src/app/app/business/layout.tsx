// memari.studio/app/business - memari. for businesses (2026-10-22: "find
// notes on memari. for businesses feature and start building";
// handoff/research/B2B-findings-summary.md). A coach's workspace: Home,
// Clients, Templates and Orders down the side, Settings and Help at the
// bottom, and a switcher at the top left between your own journals and the
// business. Light by default; Dark or Automatic from the switch at the top
// right (Appearance.tsx, 2026-10-22).

import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signInPath } from "@/lib/owner";
import { currentBusiness } from "@/lib/business";
import { APPEARANCE_SCRIPT, AppearanceSwitch } from "./Appearance";
import { BusinessNav } from "./BusinessNav";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { ToastHost } from "./Toast";
import { WALL_TILE, WALL_VARIANTS, wallPath } from "@/app/landing/doodleWall";
import css from "./business.module.css";

export const metadata: Metadata = { title: "memari. for businesses", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BusinessLayout({ children }: { children: ReactNode }) {
  const ctx = await currentBusiness();
  if (!ctx) redirect(signInPath("/app/business"));
  const { business } = ctx;
  // THE DOODLE WALL (2026-10-31: "add the doodle wall that's behind the /app
  // ... but even lower opacity"): the start dialog's blue-pen wall, baked
  // fainter on Studio's and Studio Night's own grounds (doodleWall.ts). One of
  // its walls for each coach each day - not a new one each load, as /app has:
  // this layout is drawn again after nearly every save (revalidatePath), and
  // the doodles would jump while the coach works. The coach's workspace only:
  // a client's page carries the coach's brand, not ours.
  const day = new Date().toISOString().slice(0, 10);
  const variant = [...`${ctx.owner.id}:${day}`].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % WALL_VARIANTS;
  const wall = {
    "--wall-studio": `url(${wallPath("studio", variant)})`,
    "--wall-night": `url(${wallPath("night", variant)})`,
    "--wall-size": `${WALL_TILE.w}px ${WALL_TILE.h}px`,
  } as CSSProperties;
  return (
    // data-mode is set by the script before React
    // arrives, hence suppressHydrationWarning on this one element.
    <main className={`${css.biz} ${css.wall}`} style={wall} data-biz-root="" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      <ToastHost>
        <header className={css.top}>
          {business ? (
            <WorkspaceSwitcher name={business.name} logoUrl={business.logoUrl} />
          ) : (
            <strong>
              memari. <span style={{ fontWeight: 400 }}>for businesses</span>
            </strong>
          )}
          <span className={css.spacer} />
          <AppearanceSwitch />
          <Link href="/app" className={css.back}>
            Your journals
          </Link>
        </header>
        {business ? (
          <div className={css.body}>
            <BusinessNav />
            <section className={css.page}>{children}</section>
          </div>
        ) : (
          <section className={css.start}>{children}</section>
        )}
      </ToastHost>
    </main>
  );
}
