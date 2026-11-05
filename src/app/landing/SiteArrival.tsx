"use client";

// The curtain over a site page's content until what the first screen shows
// has arrived (see arrival.ts): then it lifts, once, and the hero, the paper,
// the doodles, the torn edge, the post-it and the covers are all there
// together. The nav stays above it - it is the page's frame, not its
// content, and on the landing page reads as well on the curtain's dark as on
// the hero.
//
// What it waits for:
// - every picture on the first screen and a little below it: <img> and SVG
//   <image> elements laid out there (the hero's frame and sheets, the torn
//   edge, the otter, the covers in view), found on the page rather than
//   listed, so a picture added later is waited for too;
// - the paper's photos, which are backgrounds (the page's --*-img variables,
//   as pageVars sets them) and `pictures`, the backgrounds a part names;
// - the type;
// - and then, for at most a grace more, the doodle wall laid out. The wall
//   is the one part that waits for the page's script, and on a phone it was
//   the whole wait (2026-11-04, on his iPhone: "take a long time to load").
//   Past the grace the curtain lifts with the paper there and the drawings
//   fade in as they are laid out (BodyDoodles, data-late).
// Never longer than the limit; without script, the same by CSS alone
// (.curtain's animation).
//
// WHO LIFTS IT. On a page's first load, the head's script (arrivalScript.ts),
// as soon as its first screen has come - before hydration, which on a phone
// is long after; this follows it (data-site-arrived on <html>). On a page
// reached by a click inside the site the head's script does not run again,
// so this does the same looking itself (holdArrival is how the wall says it
// is ready here; there, by its data-wall-ready).
//
// Rendered FIRST on the page: the page's HTML streams in and is painted as
// it comes, so a curtain at the end arrived after everything it was to
// cover - the title and the post-it showed over the bare dark (measured,
// 2026-11-04). It looks for what to wait for a moment after mounting (a
// microtask: after every part's effects in the same commit have run and
// taken their holds).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { markArrived, resetArrival, takeHolds } from "./arrival";
import { ARRIVAL_LONGEST_MS, ARRIVAL_WALL_GRACE_MS } from "./arrivalScript";
import styles from "./landing.module.css";

/** Arriving from another of the site's pages, whose nav is already there to
 *  answer the click: never this long. Its paper and doodles are in hand
 *  already; a page's own pictures that are not yet come in after. */
const LONGEST_AFTER_NAV_MS = 1200;

/** How far below the first screen a picture still counts: the screen's
 *  height again by this. */
const BELOW = 0.25;

/** The curtain's fade (.curtain[data-lifted]), and a little over: then it
 *  is taken off the page. */
const GONE_AFTER_MS = 600;

/** No curtain has lifted yet in this document: this is the page it was
 *  loaded with, whose curtain the head's script lifts. */
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

  // A page reached by a click: the last page's lifting is still on <html>,
  // and would lift this curtain before it was ever seen. Taken off before
  // this page is painted.
  useLayoutEffect(() => {
    if (!firstPage) document.documentElement.removeAttribute("data-site-arrived");
  }, []);

  useEffect(() => {
    const el = curtain.current;
    const page = el?.parentElement;
    if (!el || !page) return;
    const html = document.documentElement;
    let done = false;
    let goneTimer = 0;
    const lift = () => {
      if (done) return;
      done = true;
      // A page arrived: any after it in this document come from another
      // page. Set here, not on mounting - React mounts a part twice in
      // development, and the second took itself for a later page (found by
      // check:arrival).
      firstPage = false;
      // the paper shows from now, with or without the doodle wall
      // (landing.module.css); and the curtain, if this is the one lifting it
      page.setAttribute("data-arrived", "");
      html.setAttribute("data-site-arrived", "");
      markArrived();
      setLifted(true);
      goneTimer = window.setTimeout(() => setGone(true), GONE_AFTER_MS);
    };
    // check:arrival can wait longer, to see what the curtain waits for rather
    // than how fast the machine running it is
    const hooks = window as { __arrivalLongestMs?: number; __arrivalWallGraceMs?: number };
    const longest = hooks.__arrivalLongestMs ?? ARRIVAL_LONGEST_MS;
    const grace = hooks.__arrivalWallGraceMs ?? ARRIVAL_WALL_GRACE_MS;

    if (firstPage) {
      // The head's script lifts it (arrivalScript.ts): follow. Its own limit
      // stands behind this one.
      const timer = window.setTimeout(lift, Math.max(0, longest - performance.now()));
      const follow = new MutationObserver(() => html.hasAttribute("data-site-arrived") && lift());
      follow.observe(html, { attributes: true, attributeFilter: ["data-site-arrived"] });
      if (html.hasAttribute("data-site-arrived")) lift();
      // the parts' holds are the head script's business here, by the page's
      // attributes; not left waiting for a later page
      void Promise.resolve().then(takeHolds);
      return () => {
        done = true;
        follow.disconnect();
        window.clearTimeout(timer);
        window.clearTimeout(goneTimer);
        resetArrival();
      };
    }

    const timer = window.setTimeout(lift, Math.min(longest, LONGEST_AFTER_NAV_MS));
    // once the rest of the page's effects have run (see the top)
    void Promise.resolve().then(() => {
      if (done) return;
      const fonts = document.fonts?.ready ?? Promise.resolve();
      const held = Promise.all(takeHolds());
      return Promise.all([...picturesInView(page), ...[...paperPictures(page), ...pictures].map(decoded), fonts])
        .then(() => Promise.race([held, new Promise((r) => window.setTimeout(r, grace))]))
        .then(() => {
          // drawn under the curtain before it goes: a frame for the pictures
          // to be painted, another for the wall's own fade to have settled
          // at once
          requestAnimationFrame(() => requestAnimationFrame(lift));
        });
    });
    return () => {
      done = true;
      window.clearTimeout(timer);
      window.clearTimeout(goneTimer);
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
      // for the head's script, which has no props to read (arrivalScript.ts)
      data-pictures={pictures.join(" ") || undefined}
      data-lifted={lifted ? "" : undefined}
      aria-hidden="true"
    />
  );
}
