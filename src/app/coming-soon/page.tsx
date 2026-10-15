// What memari.studio shows while the site is off (Andrew, 2026-10-14: "turn
// off memari.studio address and add a coming soon in the impressed type with
// a random texture in the background and logo"; src/proxy.ts sends every page
// there). One of the swatch book's plain textures, a different one each
// visit, with the m. and "coming soon." pressed into it as the covers' blind
// press is: the press is two grey pictures laid over the texture, one
// multiplied (the darker face, the shadowed wall), one colour-dodged (the lit
// wall), so it shows in the texture's own grain and colour. Each texture
// presses as deep as the covers' rule gives it; on a dark one the lit wall is
// a screen instead (a proportional brightening barely shows there) and the
// press deeper. Baked by scratchpad comingsoon_bake.py.
//
// At the foot, quietly, a way in for those with the password (2026-10-15):
// "Have a password?" opens a box (a details element - no script needed),
// which posts to /coming-soon/enter. A wrong one comes back here with
// ?wrong=1, and the box open saying so.

import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import TEXTURES from "./textures.json";
import styles from "./comingSoon.module.css";

export const metadata: Metadata = {
  title: "memari. coming soon",
  description: "A journal as unique as you. Coming soon.",
  // the page stands in for the site; search engines should wait for it
  robots: { index: false, follow: false },
};

/** A texture of its own each visit. */
function anyTexture() {
  return TEXTURES[Math.floor(Math.random() * TEXTURES.length)];
}

export default async function ComingSoon({ searchParams }: { searchParams: Promise<{ wrong?: string }> }) {
  await connection(); // per visit, so never prerendered
  const wrong = (await searchParams).wrong === "1";
  const t = anyTexture();
  return (
    <main className={styles.ground} style={{ backgroundColor: t.color, backgroundImage: `url(/coming-soon/textures/${t.id}.avif)` }}>
      <h1 className={styles.press} style={{ "--strength": t.strength, "--lit": t.lit } as CSSProperties}>
        <span className={styles.words}>memari. coming soon.</span>
        {/* eslint-disable-next-line @next/next/no-img-element -- blended into the texture behind it, which next/image's wrapper would cut off */}
        <img className={styles.shade} src="/coming-soon/press-shade.png" alt="" width={1600} height={807} />
        {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
        <img className={styles.light} src="/coming-soon/press-light.png" alt="" width={1600} height={807} />
      </h1>
      <details className={styles.pass} open={wrong}>
        <summary>Have a password?</summary>
        <form method="post" action="/coming-soon/enter" className={styles.passForm}>
          <label htmlFor="coming-soon-password" className={styles.words}>
            Password
          </label>
          <input id="coming-soon-password" name="password" type="password" autoComplete="current-password" required autoFocus={wrong} placeholder="Password" />
          <button type="submit">Enter</button>
        </form>
        {wrong && (
          <p className={styles.passWrong} role="alert">
            That isn&rsquo;t it. Try again.
          </p>
        )}
      </details>
    </main>
  );
}
