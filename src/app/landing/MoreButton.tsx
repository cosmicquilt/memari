// A way on, as a pill with an arrow that nudges on hover: See all layouts
// under the gallery (LayoutGallery), See all covers by the collage
// (CoverCarousel).
//
// The words and the arrow are each their own span, so each takes the paper
// through the text by itself (landing.module.css, PAPER THROUGH THE TEXT).
// Until 2026-11-05 the arrow was marked data-paper-inline, which made the
// link take the paper whole: the link's text clip held the arrow where it
// sits in the layout, the arrow painted its own on top, and the hover's
// translate moved only the second one, so it looked like an arrow with two
// heads. One painter per glyph, and the glyph moves with it.

import Link from "next/link";
import styles from "./landing.module.css";

export function MoreButton({ href, children, className }: { href: string; children: string; className?: string }) {
  return (
    <Link href={href} className={className ? `${styles.moreButton} ${className}` : styles.moreButton}>
      <span>{children}</span>
      <span aria-hidden="true" className={styles.moreArrow}>
        &rarr;
      </span>
    </Link>
  );
}
