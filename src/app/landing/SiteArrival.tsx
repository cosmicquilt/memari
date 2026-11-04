"use client";

// The curtain over a site page's content until what the first screen shows
// has arrived (see arrival.ts): then it lifts, once, and the hero, the paper,
// the doodles, the torn edge, the post-it and the covers are all there
// together. The nav stays above it - it is the page's frame, not its
// content, and on the landing page reads as well on the curtain's dark as on
// the hero.
//
// It waits for:
// - every picture on the first screen and a little below it: <img> and SVG
//   <image> elements laid out there (the hero's frame and sheets, the torn
//   edge, the otter, the covers in view), found on the page rather than
//   listed, so a picture added later is waited for too;
// - the paper's photos, which are backgrounds (the page's --*-img variables,
//   as pageVars sets them) and `pictures`, the backgrounds a part names;
// - what the page's parts hold it for (holdArrival: the doodle wall laid out);
// - the type.
// Never longer than LONGEST_MS from the page's start (or from arriving on
// it from another page): then it lifts on whatever has come, and the rest
// comes in as it would have. Without script the same, by CSS alone
// (.curtain's animation).
//
// Rendered FIRST on the page: the page's HTML streams in and is painted as
// it comes, so a curtain at the end arrived after everything it was to
// cover - the title and the post-it showed over the bare dark (measured,
// 2026-11-04). It looks for what to wait for a moment after mounting (a
// microtask: after every part's effects in the same commit have run and
// taken their holds).

import { useEffect, useRef, useState } from "react";
import { markArrived, resetArrival, takeHolds } from "./arrival";
import styles from "./landing.module.css";

/** The longest the curtain waits, ms from the page's start. In step with
 *  .curtain's animation, which lifts it without script. Measured on a
 *  production build (2026-11-04), with nothing slowed but the processor (1.5
 *  times): the doodle wall ready at 2.5-2.7 s, the curtain lifting at
 *  2.7-2.9 s; the wall is the last to come, as it waits for the page's
 *  script. */
const LONGEST_MS = 3500;

/** Arriving from another of the site's pages, whose nav is already there to
 *  answer the click: never this long. Its paper and doodles are in hand
 *  already; a page's own pictures that are not yet come in after. */
const LONGEST_AFTER_NAV_MS = 1200;

/** How far below the first screen a picture still counts: the screen's
 *  height again by this. */
const BELOW = 0.25;

let firstPage = true;

function decoded(src: string): Promise<unknown> {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => {});
}

/** The pictures laid out on the first screen. */
function picturesInView(root: Element): Promise<unknown>[] {
  const bottom = window.innerHeight * (1 + BELOW);
  const out: Promise<unknown>[] = [];
  const inView = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top < bottom && r.bottom > 0 && r.left < window.innerWidth && r.right > 0;
  };
  for (const img of root.querySelectorAll<HTMLImageElement>("img:not([data-arrival-skip])")) {
    if (!inView(img)) continue;
    if (img.loading === "lazy") img.loading = "eager";
    out.push(img.decode().catch(() => {}));
  }
  for (const image of root.querySelectorAll<SVGImageElement>("image")) {
    const src = image.href.baseVal;
    if (src && inView(image)) out.push(decoded(src));
  }
  return out;
}

/** The background pictures the page's paper is made of: its --*-img and
 *  --*-image variables. */
function paperPictures(page: HTMLElement): string[] {
  const urls = new Set<string>();
  for (const m of page.getAttribute("style")?.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g) ?? []) urls.add(m[1]);
  return [...urls];
}

export function SiteArrival({ ground = "cream", pictures = [] }: { ground?: "cream" | "hero"; pictures?: string[] }) {
  const curtain = useRef<HTMLDivElement>(null);
  const [lifted, setLifted] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const el = curtain.current;
    const page = el?.parentElement;
    if (!el || !page) return;
    let done = false;
    const lift = () => {
      if (done) return;
      done = true;
      // A page arrived: any after it in this document come from another
      // page. Set here, not on mounting - React mounts a part twice in
      // development, and the second took itself for a later page (found by
      // check:arrival).
      firstPage = false;
      markArrived();
      setLifted(true);
    };
    // On the page's first load the wait began with the page; arriving from
    // another page, it begins now.
    // check:arrival waits longer, to see what the curtain waits for rather
    // than how fast the machine running it is
    const longest = (window as { __arrivalLongestMs?: number }).__arrivalLongestMs ?? LONGEST_MS;
    const left = firstPage ? Math.max(0, longest - performance.now()) : Math.min(longest, LONGEST_AFTER_NAV_MS);
    const timer = window.setTimeout(lift, left);
    // once the rest of the page's effects have run (see the top)
    void Promise.resolve().then(() => {
      if (done) return;
      const fonts = document.fonts?.ready ?? Promise.resolve();
      return Promise.all([
        ...takeHolds(),
        ...picturesInView(page),
        ...[...paperPictures(page), ...pictures].map(decoded),
        fonts,
      ]).then(() => {
        // drawn under the curtain before it goes: a frame for the pictures
        // to be painted, another for the wall's own fade to have settled at
        // once
        requestAnimationFrame(() => requestAnimationFrame(lift));
      });
    });
    return () => {
      done = true;
      window.clearTimeout(timer);
      resetArrival();
    };
    // the pictures are the page's, fixed for it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gone) return null;
  return (
    <div
      ref={curtain}
      className={styles.curtain}
      data-curtain=""
      data-ground={ground}
      data-lifted={lifted ? "" : undefined}
      aria-hidden="true"
      onTransitionEnd={(e) => e.target === e.currentTarget && lifted && setGone(true)}
      onAnimationEnd={(e) => e.target === e.currentTarget && setGone(true)}
    />
  );
}
