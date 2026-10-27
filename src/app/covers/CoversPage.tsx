// The covers page (2026-10-26): the landing carousel's covers, every one,
// with the chosen one large. /covers opens on the first; /covers/<slug> on
// that one, so the carousel and anything else can link to a cover.

import { SitePage } from "@/app/landing/SitePage";
import { COVERS, MATERIAL_COUNT } from "./catalogue";
import { CoversGallery } from "./CoversGallery";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";

export function CoversPage() {
  return (
    <SitePage>
      <header className={site.head}>
        <p className={styles.eyebrow}>Covers</p>
        <h1 className={styles.headline}>Choose what is on the outside.</h1>
        <p className={styles.lede}>
          {COVERS.length} covers in {MATERIAL_COUNT} materials, each shown on a real notebook. The stone, wood and cloth are photographs
          of the real thing, printed on a matte cover. The m. is printed too, to look pressed in or gilded, so it feels smooth.
        </p>
      </header>
      <section className={`${site.block} ${site.blockWide}`} aria-label="Covers">
        <CoversGallery />
      </section>
    </SitePage>
  );
}
