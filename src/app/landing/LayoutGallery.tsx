"use client";

// Layouts on the landing page: a few, one of each kind, and "View more"
// (2026-10-08: "there should be less layouts and just say view more at
// end"). No captions on the cards (2026-10-06: "i dont want the 'use this
// week' button or name and descriptions"); a click opens the layout big,
// with what it is, Use this and its similar layouts (LayoutViewer). The
// pictures are the Layouts gallery's, structure only, on lighter paper.

import Link from "next/link";
import { LayoutCard, LayoutViewer } from "./LayoutViewer";
import styles from "./landing.module.css";

export function LayoutGallery({ layouts }: { layouts: Array<{ key: string; title: string }> }) {
  return (
    <LayoutViewer>
      <div className={styles.gallery}>
        {layouts.map((layout) => (
          <figure key={layout.key} className={styles.spreadCard}>
            <LayoutCard spreadKey={layout.key} title={layout.title} set="home" />
          </figure>
        ))}
      </div>
      <p className={styles.more}>
        <Link href="/layouts">View more</Link>
      </p>
    </LayoutViewer>
  );
}
