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
// descriptions.)

import Link from "next/link";
import { LayoutCard, LayoutViewer } from "./LayoutViewer";
import type { StarterKind } from "./starterLayouts";
import styles from "./landing.module.css";

const KIND_WORDS: Record<StarterKind, string> = {
  week: "Weekly spread",
  month: "Monthly spread",
  day: "Daily page",
  pages: "Pages",
};

export function LayoutGallery({ layouts }: { layouts: Array<{ key: string; title: string; kind: StarterKind }> }) {
  return (
    <LayoutViewer>
      <div className={styles.gallery}>
        {layouts.map((layout) => (
          <figure key={layout.key} className={styles.spreadCard}>
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
