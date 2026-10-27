// The covers page (2026-10-26): the landing carousel's covers, every one,
// with the chosen one large. /covers opens on the first; /covers/<slug> on
// that one, so the carousel and anything else can link to a cover.

import { SitePage } from "@/app/landing/SitePage";
import { COVERS, MATERIAL_COUNT } from "./catalogue";
import { CoversGallery } from "./CoversGallery";
import { AiFreeSeal } from "./AiFreeSeal";
import css from "./covers.module.css";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";

export function CoversPage() {
  return (
    <SitePage>
      <header className={site.head}>
        <p className={styles.eyebrow}>Covers</p>
        <h1 className={styles.headline}>Choose what is on the outside.</h1>
        {/* The words checked against the textures' sources (AiFreeSeal.tsx):
            4K maps, most built by texture artists, the rest photographed -
            not all "photo scans", and not 8K (2026-10-26). */}
        <div className={css.ledeRow}>
          <p className={styles.lede}>
            {COVERS.length} covers in {MATERIAL_COUNT} materials, each from a 4K texture made by people, not AI: real stone, wood and cloth
            photographed, or surfaces built by texture artists. The m. is printed on top, to look pressed in or gilded, so it feels smooth.
          </p>
          <AiFreeSeal />
        </div>
      </header>
      <section className={`${site.block} ${site.blockWide}`} aria-label="Covers">
        <CoversGallery />
      </section>
    </SitePage>
  );
}
