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
import styles from "./coverCarousel.module.css";

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

export function CoverCarousel() {
  // The server's order is a fixed deal (so the first paint matches); the
  // visit's own deal replaces it once the page is live.
  const fixed = useMemo(() => deal(covers as Cover[], seeded(20261009)), []);
  const [order, setOrder] = useState(fixed);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dealt once on arrival (random, so not on the server)
    setOrder(deal(covers as Cover[], Math.random));
  }, []);
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
  const duration = width && speed > 0 ? width / speed : 0;

  // Every picture fetched and decoded once the page is idle, not as it
  // drifts into view: decoding on arrival dropped frames ("carousel frame
  // drop. try to omptimize").
  useEffect(() => {
    const warm = () => {
      for (const img of track.current?.querySelectorAll("img") ?? []) {
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
                      loading="lazy"
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
