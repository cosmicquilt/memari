// The covers page (2026-10-26; rebuilt 2026-11-05 as board 4 of the covers
// mockups, https://claude.ai/artifact/At9mkReAMmapqQnv4342Xj): the chosen
// cover on a stage, the page's words, every cover as a sample card by
// material, and what is on a cover. /covers opens on the first cover;
// /covers/<slug> on that one, so the carousel and anything else can link to
// a cover.

import { SitePage } from "@/app/landing/SitePage";
import { COVERS, MATERIAL_COUNT, coverById } from "./catalogue";
import { CoversGallery } from "./CoversGallery";
import { CoverFront } from "./CoverFront";
import { photographedCoversOffered } from "@/lib/print/coverSource";
import { AiFreeSeal } from "./AiFreeSeal";
import css from "./covers.module.css";

// the covers the cards below are drawn on
const card = (id: string) => coverById(id) ?? COVERS[0];

export function CoversPage() {
  return (
    <SitePage>
      <CoversGallery
        orderable={photographedCoversOffered()}
        intro={
          <header className={css.intro}>
            <div className={css.introText}>
              <h2>Choose what is on the outside.</h2>
              {/* The words checked against the textures' sources (AiFreeSeal.tsx):
                  4K maps, most built by texture artists, the rest photographed -
                  not all "photo scans", and not 8K (2026-10-26). The opening his
                  (2026-11-05: "85 printed covers of 23 different types of
                  materials, ..."). */}
              <p>
                {COVERS.length} printed covers of {MATERIAL_COUNT} different types of materials, each from a 4K texture made by people, not AI: real stone, wood
                and cloth photographed, or surfaces built by texture artists.
              </p>
            </div>
            <AiFreeSeal />
          </header>
        }
      />

      <section className={css.made} aria-labelledby="made-title">
        <h2 id="made-title">What is on a cover</h2>
        <div className={css.cards}>
          <div className={css.card}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the front, already sized */}
            <img className={css.cardTexture} src={card("Travertine002").front} alt="Travertine, close up" width={420} height={600} loading="lazy" suppressHydrationWarning />
            <h3>A real texture</h3>
            <p>Each starts as a 4K texture: real stone, wood and cloth photographed, or a surface built by a texture artist. None of it is made by AI.</p>
          </div>
          <div className={css.card}>
            <div className={css.cardPics} data-paper-skip="">
              <CoverFront cover={card("Concrete047A")} options={{ mark: "m-centre", finish: "imprint", dates: false, name: false }} datesWords="" name="" label="An imprinted m. on concrete" />
              <CoverFront cover={card("Onyx002")} options={{ mark: "m-centre", finish: "gold", dates: false, name: false }} datesWords="" name="" label="A gold m. on dark onyx" />
            </div>
            <h3>Imprint or gold</h3>
            <p>The mark is printed on top, to look pressed in or gilded, so the cover stays smooth to the touch. Any cover takes either.</p>
          </div>
          <div className={css.card}>
            <div className={css.cardPics} data-paper-skip="">
              <CoverFront cover={card("Leather033C")} options={{ mark: "m-centre", finish: "imprint", dates: true, name: false }} datesWords="January to March 2027" name="" label="Leather with an imprinted m. and the dates January to March 2027, bottom right" />
            </div>
            <h3>Dates, if you like</h3>
            <p>Turn them on and the front prints your book&rsquo;s own dates, bottom right. Off, it leaves the front to the mark.</p>
          </div>
          <div className={css.card}>
            <div className={css.cardPics} data-paper-skip="">
              <CoverFront cover={card("Fabric066")} options={{ mark: "wordmark-serif", finish: "gold", dates: false, name: true }} datesWords="" name="Maya Okafor" label="Cloth with memari. in gold serif and the name Maya Okafor under it" />
            </div>
            <h3>Your name, if you like</h3>
            <p>Add a name under the mark, in its finish. The spine carries the journal&rsquo;s title either way.</p>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
