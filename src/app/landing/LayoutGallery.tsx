"use client";

// Layouts on the landing page: a few, one of each kind, and "See all
// layouts" (2026-10-08: "there should be less layouts and just say view
// more at end"). A click opens the layout big, with what it is, Use this and
// its similar layouts (LayoutViewer). The pictures are the Layouts gallery's,
// structure only, on lighter paper.
//
// 2026-10-15: "make the layouts increase in size on hover and decrease off
// hover", "add names to layout previews and make view more button better".
// Each picture grows on a spring under the pointer and eases back off it
// (landing.module.css, .spreadCard); its name and kind sit under it; and
// the way on is a button. (The names had been taken off on 2026-10-06, "i
// dont want ... name and descriptions"; asked back now, without the
// descriptions.) The grow follows a mouse or pen over the card, not a media
// query, which a touchscreen laptop answers "no hover" (2026-10-22).

import Link from "next/link";
import type { PointerEvent } from "react";
import { LayoutCard, LayoutViewer } from "./LayoutViewer";
import type { StarterKind } from "./starterLayouts";
import styles from "./landing.module.css";

const KIND_WORDS: Record<StarterKind, string> = {
  week: "Weekly spread",
  month: "Monthly spread",
  day: "Daily page",
  pages: "Pages",
};

/** A mouse or pen over a card marks it (landing.module.css .spreadCard);
 *  a finger never does - a tap opens the layout, nothing to grow for. On
 *  any move too, not only on entering, so a pointer already resting on a
 *  card when the page's script arrives still grows it. */
const pointerOver = (e: PointerEvent<HTMLElement>) => {
  if (e.pointerType !== "touch") e.currentTarget.setAttribute("data-pointer-over", "");
};
const pointerOut = (e: PointerEvent<HTMLElement>) => e.currentTarget.removeAttribute("data-pointer-over");

export function LayoutGallery({ layouts }: { layouts: Array<{ key: string; title: string; kind: StarterKind }> }) {
  return (
    <LayoutViewer>
      <div className={styles.gallery}>
        {layouts.map((layout) => (
          <figure key={layout.key} className={styles.spreadCard} onPointerEnter={pointerOver} onPointerMove={pointerOver} onPointerLeave={pointerOut}>
            <LayoutCard spreadKey={layout.key} title={layout.title} set="home" />
            <figcaption className={styles.spreadName}>
              <strong>{layout.title}</strong>
              <span>{KIND_WORDS[layout.kind]}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className={styles.more}>
        <Link href="/layouts" className={styles.moreButton}>
          See all layouts
          <span aria-hidden="true" className={styles.moreArrow} data-paper-inline="">
            &rarr;
          </span>
        </Link>
      </p>
    </LayoutViewer>
  );
}
