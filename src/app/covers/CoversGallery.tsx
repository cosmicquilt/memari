"use client";

// The covers page's gallery (2026-10-26): every carousel cover, filtered by
// material group and by mark, and one shown large with what it is. Choosing
// a cover puts its own address in the bar (/covers/onyx-4), so what is on
// screen can be sent to someone.
//
// THE ADDRESS IS THE CHOICE (review, 2026-10-26): the cover on screen is
// read from the address, and choosing one replaces it with Next's own state
// (replaceState with null - passing the old state skipped Next's router), so
// Back, the header's Covers link and a copied link all show the cover their
// address names.
//
// No "Use this cover" yet: Andrew chose to build printing these covers
// before the page offers them. Until then every printed book has the plain
// cover, and the panel says so rather than offering a choice that would
// not reach the book.

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { COVERS, COVER_GROUPS, coverBySlug, type Cover, type CoverFinish, type CoverGroup } from "./catalogue";
import css from "./covers.module.css";

const FINISH_WORDS: Record<CoverFinish, string> = {
  imprint: "printed to look pressed into the cover",
  gold: "printed in gold ink",
};

export function CoversGallery() {
  const [group, setGroup] = useState<CoverGroup | null>(null);
  const [finish, setFinish] = useState<CoverFinish | null>(null);
  const slug = usePathname().split("/")[2] ?? "";
  const chosen = coverBySlug(slug) ?? COVERS[0];
  // The tab names the cover the address names, as /covers/<slug>'s own
  // metadata does on a fresh load; plain /covers keeps its title.
  useEffect(() => {
    const named = coverBySlug(slug);
    if (named) document.title = `${named.name} cover - memari. STUDIO`;
  }, [slug]);
  const detail = useRef<HTMLElement>(null);
  const shown = useMemo(() => COVERS.filter((c) => (!group || c.group === group) && (!finish || c.finish === finish)), [group, finish]);
  const inGroup = (g: CoverGroup) => COVERS.filter((c) => c.group === g).length;
  const withFinish = (f: CoverFinish) => COVERS.filter((c) => c.finish === f).length;

  const choose = (cover: Cover) => {
    window.history.replaceState(null, "", `/covers/${cover.slug}`);
    // On a phone the panel is above the grid: bring it into view, without
    // the long animated scroll when motion is turned down.
    if (window.matchMedia("(max-width: 860px)").matches) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      detail.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    }
  };

  return (
    <div className={css.gallery}>
      <div className={css.filters}>
        <div className={css.chips} role="group" aria-label="Material">
          <button type="button" aria-pressed={group === null} onClick={() => setGroup(null)}>
            All <span>{COVERS.length}</span>
          </button>
          {COVER_GROUPS.map((g) => (
            <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}>
              {g} <span>{inGroup(g)}</span>
            </button>
          ))}
        </div>
        <div className={css.chips} role="group" aria-label="Mark">
          <button type="button" aria-pressed={finish === null} onClick={() => setFinish(null)}>
            Any mark
          </button>
          <button type="button" aria-pressed={finish === "imprint"} onClick={() => setFinish("imprint")}>
            Imprint <span>{withFinish("imprint")}</span>
          </button>
          <button type="button" aria-pressed={finish === "gold"} onClick={() => setFinish("gold")}>
            Gold <span>{withFinish("gold")}</span>
          </button>
        </div>
      </div>

      <div className={css.body}>
        <div className={css.gridSide}>
          <p className={css.count} aria-live="polite">
            {shown.length === COVERS.length ? `All ${COVERS.length} covers` : `${shown.length} of ${COVERS.length} covers`}
          </p>
          <ul className={css.grid}>
            {shown.map((cover) => (
              <li key={cover.id}>
                <button type="button" className={css.tile} aria-pressed={cover.id === chosen.id} onClick={() => choose(cover)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover.image} alt="" width={640} height={640} loading="lazy" decoding="async" />
                  <span>{cover.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <aside ref={detail} className={css.detail} aria-label={`${chosen.name} cover`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={chosen.image} alt={`A notebook with the ${chosen.name} cover`} width={640} height={640} />
          <p className={css.preview}>A preview: the cover drawn on a photo of a notebook.</p>
          <h2>{chosen.name}</h2>
          <dl className={css.facts}>
            <dt>Material</dt>
            <dd>
              {chosen.material}, a photograph printed on the cover
            </dd>
            <dt>On the front</dt>
            <dd>{chosen.mark}</dd>
            <dt>Finish</dt>
            <dd>
              {chosen.finishName}, {FINISH_WORDS[chosen.finish]}
            </dd>
            <dt>Dates</dt>
            <dd>{chosen.dated ? "On the front, bottom right" : "None"}</dd>
          </dl>
          <p className={css.soon}>Books with these covers are coming. Until then, printed books have a plain cover.</p>
        </aside>
      </div>
    </div>
  );
}
