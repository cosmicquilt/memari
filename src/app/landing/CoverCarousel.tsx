"use client";

// The covers, a collage drifting past under the hero (Andrew, 2026-10-09: "a
// carousel right below the hero before the demo ... with all of the covers
// i mentioned before", "just not the same base mockup photo visible at the
// same time next to each other", then "the images rounded corners and
// arranged in a collage carousel" and "not pause on hover or ever").
//
// Every swatch-book cover on a real notebook photo: each cover was rendered
// onto one of eleven photos, dealt evenly (handoff wrap/carousel.py writes
// public/landing/covers/<id>.webp and coverCarousel.json). The order is
// dealt again on every visit, round the photos in a shuffled turn, so the
// same photo comes back only after every other one has shown - at least 8
// pictures apart, even where the strip loops - and never beside itself.
//
// Two rows: big squares among columns of two small ones, the sizes fixed by
// position (so the first paint matches) and the pictures in them dealt. It
// moves at one speed, always: a CSS animation over two copies of the
// collage, the second where the first began. Reduced motion: it stands
// still and scrolls by hand.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import covers from "./coverCarousel.json";
import { coverById } from "@/app/covers/catalogue";
import { bodyWallSettings, onBodyWallSettings } from "./bodyWall";
import { whenArrived } from "./arrival";
import styles from "./coverCarousel.module.css";
import landing from "./landing.module.css";

type Cover = { id: string; name: string; photo: string };

/** Round the photos in one shuffled turn, each photo's covers in their own
 *  shuffled order: a photo returns only once every other has had its go. */
function deal(list: Cover[], random: () => number): Cover[] {
  const shuffle = <T,>(a: T[]) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  const byPhoto = new Map<string, Cover[]>();
  for (const c of list) byPhoto.set(c.photo, [...(byPhoto.get(c.photo) ?? []), c]);
  const groups = shuffle([...byPhoto.values()].map(shuffle));
  const out: Cover[] = [];
  for (let round = 0; out.length < list.length; round++) {
    for (const g of groups) if (round < g.length) out.push(g[round]);
  }
  return out;
}

function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

/** The collage's sizes, by position: units of one big square and then one
 *  or two columns of two small ones, mixed in a fixed shuffle. Every small
 *  comes in a pair, so no column is left with a hole. */
function sizes(n: number): ("big" | "small")[] {
  // n = 5a + 3b: a units with two small columns, b with one, about as many
  // of each
  let a = -1;
  for (let k = 0; 5 * k <= n; k++) {
    if ((n - 5 * k) % 3 === 0 && (a < 0 || Math.abs(5 * k - (n - 5 * k)) < Math.abs(5 * a - (n - 5 * a)))) a = k;
  }
  if (a < 0) a = 0; // (no exact split: the last column takes a single small)
  const b = Math.floor((n - 5 * a) / 3);
  const units = [...Array(a).fill(5), ...Array(b).fill(3)] as number[];
  const random = seeded(7);
  for (let i = units.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [units[i], units[j]] = [units[j], units[i]];
  }
  return units.flatMap((u) => ["big", ...Array(u - 1).fill("small")] as ("big" | "small")[]);
}

/** How many covers, from the strip's start, can be on the first screen (a
 *  wide screen shows about this many). */
const FIRST_SCREEN_COVERS = 9;

/** The longest the covers wait for the doodle wall before being fetched. */
const WARM_AFTER_MS = 6000;

/** Every cover in `track` fetched and decoded, once the page is idle; the
 *  returned function calls it off.
 *
 *  NOT ON A PHONE, NOR ANYWHERE ON iOS (2026-11-04: on Andrew's iPhone the
 *  layout "faded in then it paused then glitched out and page failed").
 *  All 85 covers decoded at once are 133 MB of pictures - measured on the
 *  live page at a phone's size, of 158 MB in all, with three to six covers on
 *  the screen - taken just as the layouts start writing, and iOS ends a page
 *  that asks too much (it had first dropped the hero's canvases: the "brown"
 *  hero). There the covers come as they always could: each fetched as it
 *  drifts near (loading="lazy") and decoded off the main thread. */
function warmWhenIdle(track: HTMLElement | null) {
  if (coldCovers()) return () => {};
  const warm = () => {
    for (const img of track?.querySelectorAll("img") ?? []) {
      img.loading = "eager";
      img.decode?.().catch(() => {});
    }
  };
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(warm, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const t = setTimeout(warm, 1500);
  return () => clearTimeout(t);
}

/** A phone, or anywhere on iOS: the covers are not warmed (warmWhenIdle). */
function coldCovers() {
  return window.matchMedia("(max-aspect-ratio: 1/1)").matches || CSS.supports("-webkit-touch-callout", "none");
}

/** How far past the screen's right edge the covers coming are fetched where
 *  they are not warmed, in screens: at the strip's pace, seconds ahead. */
const AHEAD_SCREENS = 2;

/** Where the covers are not warmed, the ones coming fetched a little ahead
 *  of the screen (2026-11-05, his iPhone: "the carousel stops loading in new
 *  images even though it keeps moving, then after the hitch it loads and
 *  works"). WebKit starts a lazy picture only once it is nearly on the
 *  screen - Chrome some 1,250px ahead - so each cover was fetched at the last
 *  moment, and the first writing's burst (its doodles, the wall's, the
 *  sign-in scripts) left them coming as they came on. Fetched only, a few at
 *  a time as the strip drifts, not decoded: all 85 decoded at once is what
 *  crashed. The strip moves left at one speed and its covers come in the
 *  page's order, so only the next one is looked at; the second copy's are
 *  the same pictures, fetched by then. */
function fetchAhead(track: HTMLElement | null) {
  const imgs = [...(track?.firstElementChild?.querySelectorAll("img") ?? [])];
  let next = imgs.findIndex((img) => img.loading === "lazy");
  if (next < 0) return () => {};
  const tick = () => {
    const edge = window.innerWidth * (1 + AHEAD_SCREENS);
    while (next < imgs.length && imgs[next].getBoundingClientRect().left < edge) {
      imgs[next].loading = "eager";
      next++;
    }
    if (next >= imgs.length) window.clearInterval(id);
  };
  const id = window.setInterval(tick, 500);
  tick();
  return () => window.clearInterval(id);
}

/** `seed`: the visit's deal, drawn by the server for each visit (Landing),
 *  so the order the page opens with is the one it keeps. It was a fixed deal
 *  replaced by the visit's own once the page was live (2026-11-04): every
 *  cover on screen swapped for another just after load, each fetched twice
 *  over - the first ones while the rest of the first screen was still
 *  coming. */
export function CoverCarousel({ seed = 20261009 }: { seed?: number }) {
  const order = useMemo(() => deal(covers as Cover[], seeded(seed)), [seed]);
  const size = useMemo(() => sizes(covers.length), []);

  // One copy's width sets the loop's length, so the speed is the same at any
  // screen size: px a second, the dev panel's "Collage speed" (2026-10-14:
  // "faster carousel", from 26).
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [speed, setSpeed] = useState(() => bodyWallSettings().carouselSpeed ?? 45);
  useEffect(() => {
    const off = onBodyWallSettings(() => setSpeed(bodyWallSettings().carouselSpeed ?? 45));
    return () => {
      off();
    };
  }, []);
  useEffect(() => {
    const el = track.current?.firstElementChild as HTMLElement | null;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Still until the page has arrived (arrival.ts): drifting under the
  // curtain it brought covers into view that the curtain had not waited
  // for, and the page opened on them still coming (found by check:arrival).
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    let live = true;
    void whenArrived().then(() => live && setArrived(true));
    return () => {
      live = false;
    };
  }, []);
  const duration = arrived && width && speed > 0 ? width / speed : 0;

  // Where they are not warmed: the covers coming fetched ahead, from when
  // the strip starts to move - not after the doodle wall, as the warming
  // waits: the first writing's hitch comes before it (fetchAhead).
  useEffect(() => {
    if (!arrived || !coldCovers()) return;
    return fetchAhead(track.current);
  }, [arrived, order]);

  // Every picture fetched and decoded once the page is idle, not as it
  // drifts into view: decoding on arrival dropped frames ("carousel frame
  // drop. try to omptimize"). And not before the page has arrived (the
  // curtain, arrival.ts): 58 of them were coming down on a phone with the
  // first screen's doodles, and held them up by seconds (2026-11-04).
  // Nor before the doodle wall is laid out (or WARM_AFTER_MS have passed):
  // the curtain no longer waits for the wall on a slow phone, and the covers
  // fetched as it lifted queued its drawings behind them - laid out at 6.3 s
  // instead of 2.9 (measured 2026-11-04).
  useEffect(() => {
    let live = true;
    let cancel = () => {};
    let watching: MutationObserver | null = null;
    let fallback = 0;
    void whenArrived().then(() => {
      if (!live) return;
      const page = track.current?.closest(`.${landing.page}`) ?? null;
      let started = false;
      const warm = () => {
        if (started || !live) return;
        started = true;
        watching?.disconnect();
        window.clearTimeout(fallback);
        cancel = warmWhenIdle(track.current);
      };
      if (!page || page.hasAttribute("data-wall-ready")) return warm();
      watching = new MutationObserver(() => page.hasAttribute("data-wall-ready") && warm());
      watching.observe(page, { attributes: true, attributeFilter: ["data-wall-ready"] });
      fallback = window.setTimeout(warm, WARM_AFTER_MS);
    });
    return () => {
      live = false;
      watching?.disconnect();
      window.clearTimeout(fallback);
      cancel();
    };
  }, [order]);

  return (
    <section className={styles.band} aria-label="Covers on real notebooks" data-doodle-row data-paper-skip="">
      <div className={styles.strip}>
        {/* the ends blur away (2026-10-14: "instead of transparent gradient
            on sides of carousel can you make it more of a cool blur
            effect"): four still layers, each blurring what passes under it
            a little more toward the edge, and the paper's tan over them */}
        {[styles.blurStart, styles.blurEnd].map((side) => (
          <div key={side} className={side} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        ))}
        <div
          ref={track}
          className={styles.track}
          style={duration ? { animationDuration: `${duration.toFixed(1)}s` } : undefined}
          data-moving={duration ? "" : undefined}
        >
          {[0, 1].map((copy) => (
            <ul key={copy} className={styles.collage} aria-hidden={copy === 1 || undefined}>
              {order.map((c, i) => (
                <li key={c.id} className={size[i] === "big" ? styles.big : styles.small} data-photo={c.photo}>
                  {/* Each opens its cover on the covers page (2026-10-26), named
                      by its own cover ("Onyx 4"). Out of the Tab order, both
                      copies: the strip never stops moving, so a focused tile
                      drifts out of sight, and every cover is a click away
                      under Covers in the header (review, 2026-10-26). */}
                  <Link href={`/covers/${coverById(c.id)?.slug ?? ""}`} tabIndex={-1} draggable={false}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/landing/covers/${c.id}.webp`}
                      alt={copy === 1 ? "" : `A notebook with the ${coverById(c.id)?.name ?? c.name} cover`}
                      width={640}
                      height={640}
                      // the first few are on the first screen, and the curtain
                      // waits for them (arrival.ts): asked for at once, ahead
                      // of the doodle wall's drawings; the rest later
                      loading={copy === 0 && i < FIRST_SCREEN_COVERS ? "eager" : "lazy"}
                      fetchPriority={copy === 0 && i < FIRST_SCREEN_COVERS ? "high" : "low"}
                      decoding="async"
                      draggable={false}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
