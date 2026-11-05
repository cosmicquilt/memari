"use client";

// The covers page's gallery (2026-11-05, board 4 of the covers mockups,
// https://claude.ai/artifact/At9mkReAMmapqQnv4342Xj): the chosen cover on a
// dark stage - on its notebook as pictured, and its front flat as it prints
// with the person's own choices - then the page's words (intro, from the
// server), then every cover as a sample card in a swatch book, by material.
//
// MAKE IT YOURS: the mark, its finish, the dates and a name are choices on
// every cover (Andrew, 2026-11-05). They start as the first cover is
// pictured and stay with the person as they look through the covers, so one
// look can be tried on many materials. The photo keeps showing each cover as
// it was pictured; the flat front shows theirs.
//
// THE ADDRESS IS THE CHOICE (review, 2026-10-26): the cover on screen is
// read from the address, and choosing one replaces it with Next's own state
// (replaceState with null - passing the old state skipped Next's router), so
// Back, the header's Covers link and a copied link all show the cover their
// address names.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { COVERS, COVER_GROUPS, coverBySlug, coverNumber, groupMaterialsWords, type Cover, type CoverGroup } from "./catalogue";
import { CoverFront, MARK_WORDS, picturedOptions, type FrontMark, type FrontOptions } from "./CoverFront";
import { CoverZoom } from "./CoverZoom";
import { coverDatesWords } from "@/lib/print/coverDates";
import css from "./covers.module.css";

const MARKS: FrontMark[] = ["m-centre", "m-corner", "wordmark-serif", "wordmark-sans", "none"];

/** An example book's dates, as its cover would print them: the three whole
 *  months from next month ("December 2026 to February 2027"). */
function exampleDates(now = new Date()): string {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0));
  return coverDatesWords({ start, end });
}

/** `orderable`: the covers can be printed here (their scans' host is
 *  set), so the stage says where they are chosen. `intro`: the page's
 *  headline and words, between the stage and the covers. */
export function CoversGallery({ orderable, intro }: { orderable: boolean; intro: ReactNode }) {
  const slug = usePathname().split("/")[2] ?? "";
  const chosen = coverBySlug(slug) ?? COVERS[0];
  const [group, setGroup] = useState<CoverGroup | null>(null);
  const [options, setOptions] = useState<FrontOptions>(() => picturedOptions(chosen));
  const [name, setName] = useState("");
  const dates = useMemo(() => exampleDates(), []);
  const stage = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(false);

  // The tab names the cover the address names, as /covers/<slug>'s own
  // metadata does on a fresh load; plain /covers keeps its title.
  useEffect(() => {
    const named = coverBySlug(slug);
    if (named) document.title = `${named.name} cover - memari. STUDIO`;
  }, [slug]);

  const shown = useMemo(() => COVERS.filter((c) => !group || c.group === group), [group]);
  const inGroup = (g: CoverGroup) => COVERS.filter((c) => c.group === g).length;

  const choose = (cover: Cover) => {
    window.history.replaceState(null, "", `/covers/${cover.slug}`);
    // from the covers below, bring the stage back into view to see it
    const top = stage.current?.getBoundingClientRect().top ?? 0;
    if (top < -40) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      stage.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    }
  };
  // back and on through the covers in view (all of them, or one material's)
  const order = shown.some((c) => c.id === chosen.id) ? shown : COVERS;
  const at = order.findIndex((c) => c.id === chosen.id);
  const before = order[(at - 1 + order.length) % order.length];
  const after = order[(at + 1) % order.length];

  const set = (change: Partial<FrontOptions>) => setOptions((o) => ({ ...o, ...change }));
  const frontLabel = [
    options.mark === "none" ? `The ${chosen.name} front, flat, with no mark` : `The ${chosen.name} front, flat, with ${MARK_WORDS[options.mark]} in ${options.finish}`,
    options.dates ? `dated ${dates}` : "",
    options.name && name.trim() ? `named ${name.trim()}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <section ref={stage} className={css.stage} aria-label={`${chosen.name} cover`} data-paper-skip="">
        <div className={css.stageInner}>
          <figure className={css.photo}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the carousel's own pictures, already sized */}
            <img src={chosen.image} alt={`A notebook with the ${chosen.name} cover`} width={640} height={640} fetchPriority="high" />
            <figcaption>On a notebook, as pictured</figcaption>
          </figure>

          <figure className={css.flat}>
            {/* a close look: the front large, on the cover's whole scan (CoverZoom) */}
            <button type="button" className={css.flatButton} onClick={() => setZoom(true)} aria-label={`${frontLabel}. See it up close`} aria-haspopup="dialog">
              <CoverFront cover={chosen} options={options} datesWords={dates} name={name} eager />
            </button>
            <figcaption>The front, flat, as it prints · click to look closer</figcaption>
          </figure>

          <div className={css.details}>
            <p className={css.eyebrow}>Covers</p>
            <h1 className={css.coverName}>
              {chosen.material} <span className={css.coverNumber}>{coverNumber(chosen)}</span>
            </h1>
            <p className={css.material}>{chosen.material}, a photograph printed on the cover</p>

            <div className={css.panel}>
              <p className={css.panelTitle}>Make it yours</p>
              <div className={css.option}>
                <span className={css.optionLabel} id="opt-mark">
                  Mark
                </span>
                <div className={css.choices} role="group" aria-labelledby="opt-mark">
                  {MARKS.map((m) => (
                    <button key={m} type="button" aria-pressed={options.mark === m} onClick={() => set({ mark: m })}>
                      {MARK_WORDS[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div className={css.option}>
                <span className={css.optionLabel} id="opt-finish">
                  Finish
                </span>
                <div className={css.choices} role="group" aria-labelledby="opt-finish">
                  <button type="button" aria-pressed={options.finish === "imprint"} onClick={() => set({ finish: "imprint" })}>
                    Imprint
                  </button>
                  <button type="button" aria-pressed={options.finish === "gold"} onClick={() => set({ finish: "gold" })}>
                    Gold
                  </button>
                </div>
              </div>
              <div className={css.option}>
                <span className={css.optionLabel} id="opt-dates">
                  Dates
                </span>
                <div className={css.choices} role="group" aria-labelledby="opt-dates">
                  <button type="button" aria-pressed={options.dates} onClick={() => set({ dates: true })}>
                    On
                  </button>
                  <button type="button" aria-pressed={!options.dates} onClick={() => set({ dates: false })}>
                    Off
                  </button>
                </div>
              </div>
              <div className={css.option}>
                <span className={css.optionLabel} id="opt-name">
                  Name
                </span>
                <div className={css.choices} role="group" aria-labelledby="opt-name">
                  <button type="button" aria-pressed={options.name} onClick={() => set({ name: true })}>
                    On
                  </button>
                  <button type="button" aria-pressed={!options.name} onClick={() => set({ name: false })}>
                    Off
                  </button>
                </div>
              </div>
              {options.name && (
                <label className={css.nameField}>
                  Name on the cover
                  <input type="text" value={name} maxLength={40} autoComplete="name" placeholder="Your name" onChange={(e) => setName(e.target.value)} />
                </label>
              )}
              <p className={css.dim}>Every option works on every cover. The photo shows the cover as pictured; the flat front shows yours.</p>
            </div>

            <div className={css.navRow}>
              <button type="button" className={css.navButton} onClick={() => choose(before)} aria-label={`Back to ${before.name}`}>
                ‹
              </button>
              <button type="button" className={css.navButton} onClick={() => choose(after)} aria-label={`On to ${after.name}`}>
                ›
              </button>
              <span className={css.dim}>
                {at + 1} of {order.length}
                {group ? ` in ${group}` : ""}
              </span>
            </div>
            <p className={css.dim}>
              {orderable
                ? "Choose it, and what is on its front, when you order a printed book, under Cover. Every book after prints it too."
                : "Books with these covers are coming. Until then, printed books have a plain cover."}
            </p>
          </div>
        </div>
      </section>

      {zoom && <CoverZoom cover={chosen} options={options} datesWords={dates} name={name} label={frontLabel} onClose={() => setZoom(false)} />}

      <div className={css.book}>
        {intro}
        <div className={css.body}>
          <aside className={css.rail} aria-label="Materials">
            <div>
              <p className={css.railTitle}>Material</p>
              <div className={css.railList}>
                <button type="button" aria-pressed={group === null} onClick={() => setGroup(null)}>
                  <span>All</span>
                  <span>{COVERS.length}</span>
                </button>
                {COVER_GROUPS.map((g) => (
                  <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}>
                    <span>{g}</span>
                    <span>{inGroup(g)}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className={css.railNote}>The mark, its finish, dates and your name are yours to choose, on any cover.</p>
          </aside>

          <div className={css.groups} aria-live="polite">
            {COVER_GROUPS.filter((g) => !group || g === group).map((g) => (
              <section key={g} className={css.group} aria-labelledby={`group-${g.replace(/\W+/g, "-")}`}>
                <div className={css.groupHead}>
                  <h3 id={`group-${g.replace(/\W+/g, "-")}`}>{g}</h3>
                  <p>
                    {inGroup(g)} covers · {groupMaterialsWords(g)}
                  </p>
                </div>
                <ul className={css.swatches} data-paper-skip="">
                  {shown
                    .filter((c) => c.group === g)
                    .map((cover) => (
                      <li key={cover.id} className={css.swatch}>
                        <button type="button" aria-pressed={cover.id === chosen.id} onClick={() => choose(cover)}>
                          <span className={css.hole} aria-hidden="true" />
                          {/* eslint-disable-next-line @next/next/no-img-element -- the front, already sized */}
                          <img src={cover.front} alt="" width={420} height={600} loading="lazy" decoding="async" suppressHydrationWarning />
                          <span className={css.swatchName}>
                            {cover.material} <span className={css.swatchNumber}>{coverNumber(cover)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
