"use client";

// The covers page's gallery (2026-11-05, board 4 of the covers mockups,
// https://claude.ai/artifact/At9mkReAMmapqQnv4342Xj): the chosen cover on a
// dark stage - on its notebook as pictured, and its front flat as it prints
// with the person's own choices - then the page's words (intro, from the
// server), then every cover as a sample card in a swatch book, by material,
// then what is on a cover (from the server) and how hearts come first.
//
// MAKE IT YOURS: the mark, its finish, the dates and a name are choices on
// every cover (Andrew, 2026-11-05). They start as the first cover is
// pictured and stay with the person as they look through the covers, so one
// look can be tried on many materials. The photo keeps showing each cover as
// it was pictured; the flat front shows theirs.
//
// HEARTS (part 3, 2026-11-05; his pick "Kept with you, first when
// ordering"): a heart on the stage and on every card, kept for the person
// (useCoverHearts, lib/coverHearts.ts) - a guest too, made by their first
// heart, and moved to their account when they sign in. "Your hearts" at the
// top of the rail shows only those; the order screen's Cover picker shows
// them first.
//
// A HEART TAKEN OFF IN "YOUR HEARTS" LEAVES ITS CARD WHERE IT IS (found by
// check:covers-page's quick taps): gone at once, the next card slid under
// the pointer, and a second tap took the heart off a cover nobody touched.
// The view keeps the cards it opened with - an outline heart puts one back -
// until it is opened again.
//
// THE ADDRESS IS THE CHOICE (review, 2026-10-26): the cover on screen is
// read from the address, and choosing one replaces it with Next's own state
// (replaceState with null - passing the old state skipped Next's router), so
// Back, the header's Covers link and a copied link all show the cover their
// address names.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { COVERS, COVER_GROUPS, coverById, coverBySlug, coverNumber, groupMaterialsWords, type Cover, type CoverGroup } from "./catalogue";
import { CoverFront, MARK_WORDS, picturedOptions, type FrontMark, type FrontOptions } from "./CoverFront";
import { CoverZoom } from "./CoverZoom";
import { HeartIcon } from "./Heart";
import { useCoverHearts } from "./useCoverHearts";
import { coverDatesWords } from "@/lib/print/coverDates";
import css from "./covers.module.css";

const MARKS: FrontMark[] = ["m-centre", "m-corner", "wordmark-serif", "wordmark-sans", "none"];

/** What the swatch book shows: every cover, one material's, or the hearted. */
type Showing = CoverGroup | "hearts" | null;

/** An example book's dates, as its cover would print them: the three whole
 *  months from next month ("December 2026 to February 2027"). */
function exampleDates(now = new Date()): string {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0));
  return coverDatesWords({ start, end });
}

const groupId = (g: string) => `group-${g.replace(/\W+/g, "-")}`;

/** the covers these ids name, any no longer in the catalogue left out */
const covers = (ids: string[]) => ids.map(coverById).filter((c): c is Cover => c !== null);

/** `orderable`: the covers can be printed here (their scans' host is
 *  set), so the stage says where they are chosen. `intro`: the page's
 *  headline and words, between the stage and the covers. `made`: what is on
 *  a cover, after them. */
export function CoversGallery({ orderable, intro, made }: { orderable: boolean; intro: ReactNode; made: ReactNode }) {
  const slug = usePathname().split("/")[2] ?? "";
  const chosen = coverBySlug(slug) ?? COVERS[0];
  const [group, setGroup] = useState<Showing>(null);
  const [options, setOptions] = useState<FrontOptions>(() => picturedOptions(chosen));
  const [name, setName] = useState("");
  const dates = useMemo(() => exampleDates(), []);
  const stage = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(false);
  const hearts = useCoverHearts();
  // the hearts as "Your hearts" was opened (above)
  const [opened, setOpened] = useState<string[]>([]);

  // The tab names the cover the address names, as /covers/<slug>'s own
  // metadata does on a fresh load; plain /covers keeps its title.
  useEffect(() => {
    const named = coverBySlug(slug);
    if (named) document.title = `${named.name} cover - memari. STUDIO`;
  }, [slug]);

  const hearted = useMemo(() => covers(hearts.list), [hearts.list]);
  // in "Your hearts": any heart made since, first, then the cards it opened with
  const inHearts = useMemo(() => covers([...hearts.list.filter((id) => !opened.includes(id)), ...opened]), [hearts.list, opened]);
  const shown = useMemo(() => (group === "hearts" ? inHearts : COVERS.filter((c) => !group || c.group === group)), [group, inHearts]);
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
  // back and on through the covers in view (all of them, one material's, or
  // the hearted)
  const order = shown.some((c) => c.id === chosen.id) ? shown : COVERS;
  const at = order.findIndex((c) => c.id === chosen.id);
  const before = order[(at - 1 + order.length) % order.length];
  const after = order[(at + 1) % order.length];
  const inView = order === shown && group ? (group === "hearts" ? " in your hearts" : ` in ${group}`) : "";

  const set = (change: Partial<FrontOptions>) => setOptions((o) => ({ ...o, ...change }));
  const frontLabel = [
    options.mark === "none" ? `The ${chosen.name} front, flat, with no mark` : `The ${chosen.name} front, flat, with ${MARK_WORDS[options.mark]} in ${options.finish}`,
    options.dates ? `dated ${dates}` : "",
    options.name && name.trim() ? `named ${name.trim()}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const chosenHearted = hearts.has(chosen.id);

  const card = (cover: Cover) => {
    const on = hearts.has(cover.id);
    return (
      <li key={cover.id} className={css.swatch}>
        <button type="button" className={css.swatchCard} aria-pressed={cover.id === chosen.id} onClick={() => choose(cover)}>
          <span className={css.hole} aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element -- the front, already sized */}
          <img src={cover.front} alt="" width={420} height={600} loading="lazy" decoding="async" suppressHydrationWarning />
          <span className={css.swatchName}>
            {cover.material} <span className={css.swatchNumber}>{coverNumber(cover)}</span>
          </span>
        </button>
        <button type="button" className={css.swatchHeart} aria-pressed={on} aria-label={`Heart ${cover.name}`} onClick={() => hearts.toggle(cover.id)} data-heart={cover.id}>
          <HeartIcon filled={on} />
        </button>
      </li>
    );
  };

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
              <button type="button" className={css.heartPill} aria-pressed={chosenHearted} onClick={() => hearts.toggle(chosen.id)} data-stage-heart="">
                <HeartIcon filled={chosenHearted} size={20} fill="#f5ead5" stroke="#f5ead5" />
                {chosenHearted ? "Hearted" : "Heart it"}
              </button>
              <button type="button" className={css.navButton} onClick={() => choose(before)} aria-label={`Back to ${before.name}`}>
                ‹
              </button>
              <button type="button" className={css.navButton} onClick={() => choose(after)} aria-label={`On to ${after.name}`}>
                ›
              </button>
              <span className={css.dim}>
                {at + 1} of {order.length}
                {inView}
              </span>
            </div>
            {hearts.problem && (
              <p className={css.heartProblem} role="status">
                {hearts.problem}
              </p>
            )}
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
            <button
              type="button"
              className={css.heartsFilter}
              aria-pressed={group === "hearts"}
              onClick={() => {
                setOpened(hearts.list);
                setGroup(group === "hearts" ? null : "hearts");
              }}
              data-hearts-filter=""
            >
              <span>
                <HeartIcon filled size={18} />
                Your hearts
              </span>
              <span data-hearts-count="">{hearts.ready ? hearted.length : ""}</span>
            </button>
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
            {hearts.ready && !hearts.account && (
              <p className={css.railNote} data-hearts-note="">
                Your hearts are kept on this browser. Sign in and they come with you, to any device.
              </p>
            )}
          </aside>

          <div className={css.groups} aria-live="polite">
            {group === "hearts" ? (
              inHearts.length === 0 ? (
                <div className={css.heartsEmpty} data-hearts-empty="">
                  <p className={css.heartsEmptyTitle}>No hearts yet</p>
                  <p>Tap the heart on any swatch. Hearted covers come first when you order a printed book.</p>
                </div>
              ) : (
                <section className={css.group} aria-labelledby={groupId("hearts")}>
                  <div className={css.groupHead}>
                    <h3 id={groupId("hearts")}>Your hearts</h3>
                    <p>They come first when you order a printed book</p>
                  </div>
                  <ul className={css.swatches} data-paper-skip="">
                    {inHearts.map(card)}
                  </ul>
                </section>
              )
            ) : (
              COVER_GROUPS.filter((g) => !group || g === group).map((g) => (
                <section key={g} className={css.group} aria-labelledby={groupId(g)}>
                  <div className={css.groupHead}>
                    <h3 id={groupId(g)}>{g}</h3>
                    <p>
                      {inGroup(g)} covers · {groupMaterialsWords(g)}
                    </p>
                  </div>
                  <ul className={css.swatches} data-paper-skip="">
                    {shown.filter((c) => c.group === g).map(card)}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      </div>

      {made}

      {orderable && <FirstInLine hearted={hearted} ready={hearts.ready} onOpen={choose} />}
    </>
  );
}

/** "When you order, your hearts come first": an example of the order
 *  screen's Cover picker, with the person's own hearts at its head. */
function FirstInLine({ hearted, ready, onOpen }: { hearted: Cover[]; ready: boolean; onOpen: (cover: Cover) => void }) {
  // enough to run past the widest panel: one row, fading out (CSS)
  const others = COVERS.filter((c) => !hearted.some((h) => h.id === c.id)).slice(0, 14);
  return (
    <section className={css.firstInLine} aria-labelledby="first-in-line-title">
      <div className={css.firstText}>
        <p className={css.handNote} aria-hidden="true">
          your hearts, first in line
        </p>
        <h2 id="first-in-line-title">When you order, your hearts come first.</h2>
        <p>The order screen&rsquo;s Cover picker opens on the covers you hearted, then every cover by material.</p>
      </div>
      <div className={css.example} data-paper-skip="" data-first-in-line="">
        <div className={css.exampleHead}>
          <span>Cover</span>
          <span>Example order screen</span>
        </div>
        <p className={css.exampleLabel}>Your hearts</p>
        {hearted.length > 0 ? (
          <div className={css.exampleRow}>
            {hearted.map((c) => (
              <button key={c.id} type="button" className={css.exampleHearted} onClick={() => onOpen(c)} aria-label={`Open ${c.name}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the carousel's own pictures, already sized */}
                <img src={c.image} alt="" width={84} height={84} loading="lazy" decoding="async" />
                <HeartIcon filled size={16} stroke="#fffaf0" />
              </button>
            ))}
          </div>
        ) : (
          <div className={css.exampleRow}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={css.exampleSlot} aria-hidden="true">
                <HeartIcon filled={false} size={18} />
              </span>
            ))}
            <p className={css.exampleHint}>{ready ? "Heart a cover above and it waits here." : ""}</p>
          </div>
        )}
        <p className={css.exampleLabel}>All covers</p>
        <div className={`${css.exampleRow} ${css.exampleOthers}`} aria-hidden="true">
          {others.map((c) => (
            // eslint-disable-next-line @next/next/no-img-element -- the carousel's own pictures, already sized
            <img key={c.id} className={css.exampleOther} src={c.image} alt="" width={60} height={60} loading="lazy" decoding="async" />
          ))}
        </div>
      </div>
    </section>
  );
}
