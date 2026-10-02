"use client";

// The doodle wall behind the landing page's body - see bodyWall.ts. Lies
// under every section after the hero, measures what they show, and packs
// the drawings round it; packs again when the page's width changes, or the
// sliders do (development).
//
// Each drawing is an element masked by its own drawing and filled with the
// blue, not a page-high canvas: at a 2x screen that canvas would hold about
// a hundred megabytes. The drawings load after the page has, so the hero
// never waits for them.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import choices from "./doodleChoices.json";
import { wallClassOf } from "./doodleWall";
import { BODY_INK_RGB, PHONE_WIDTH, bodyWallSettings, onBodyWallSettings, packAround, type Keep, type Placed } from "./bodyWall";
import styles from "./landing.module.css";

/** What the page shows, to keep clear of: text by its lines (a paragraph's
 *  box is as wide as the column even where its last line is short), the
 *  rest by its box. */
const TEXT = "h1, h2, h3, p";
const BOXES = "li, figure, a, button, canvas, img, svg, [data-keepout]";

function measure(holder: HTMLElement, layer: HTMLElement): Keep[] {
  const origin = holder.getBoundingClientRect();
  const keep: Keep[] = [];
  const add = (r: DOMRect) => {
    if (r.width > 0 && r.height > 0) keep.push([r.left - origin.left, r.top - origin.top, r.width, r.height]);
  };
  for (const el of holder.querySelectorAll<HTMLElement>(TEXT)) {
    if (layer.contains(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    for (const r of range.getClientRects()) add(r);
  }
  for (const el of holder.querySelectorAll<HTMLElement>(BOXES)) {
    if (layer.contains(el)) continue;
    add(el.getBoundingClientRect());
  }
  return keep;
}

const loaded = new Map<string, Promise<HTMLImageElement | null>>();
const load = (src: string) => {
  if (!loaded.has(src))
    loaded.set(
      src,
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      })
    );
  return loaded.get(src)!;
};

export function BodyDoodles() {
  const layer = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [ink, setInk] = useState(bodyWallSettings().ink);

  useEffect(() => {
    const el = layer.current;
    const holder = el?.parentElement;
    if (!el || !holder) return;
    let run = 0;
    let lastWidth = -1;
    let lastHeight = -1;
    // One arrangement per visit if asked for, else the saved one.
    const visitSeed = Math.floor(Math.random() * 1e9);

    const pack = async () => {
      const mine = ++run;
      const settings = bodyWallSettings();
      setInk(settings.ink);
      const width = holder.clientWidth;
      const height = holder.clientHeight;
      lastWidth = width;
      lastHeight = height;
      const phone = width < PHONE_WIDTH;
      const keep = measure(holder, el);
      // Plain cream under the hero before the doodles begin.
      const band = ((phone ? settings.bandMobile : settings.bandDesktop) / 100) * window.innerHeight;
      keep.push([0, 0, width, band]);
      const drawings = (
        await Promise.all(
          (choices.body ?? choices.wall).map(async (full) => {
            const src = `/landing/doodles/${full}.webp`;
            const img = await load(src);
            return img ? { src, img, cls: wallClassOf(full.split("/")[1].replace(/-\d+$/, "")) } : null;
          })
        )
      ).filter((d): d is NonNullable<typeof d> => d !== null);
      if (mine !== run) return;
      const out = await packAround({
        width,
        height,
        keep,
        drawings,
        settings,
        seed: settings.newEachLoad ? visitSeed : settings.seed,
        phone,
        cancelled: () => mine !== run,
      });
      if (out && mine === run) setPlaced(out);
    };

    // After the page has loaded and settled: the hero first.
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      const go = () => void pack();
      if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 1500 });
      else setTimeout(go, 300);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    // Again when the width changes (a phone's address bar only changes the
    // height), or the content grows or shrinks by more than a line.
    let timer = 0;
    const ro = new ResizeObserver(() => {
      if (!started) return;
      if (holder.clientWidth === lastWidth && Math.abs(holder.clientHeight - lastHeight) < 24) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pack(), 250);
    });
    ro.observe(holder);
    const off = onBodyWallSettings(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pack(), 120);
    });
    return () => {
      run++;
      ro.disconnect();
      off();
      window.clearTimeout(timer);
      window.removeEventListener("load", start);
    };
  }, []);

  return (
    <div ref={layer} className={styles.bodyDoodles} aria-hidden="true">
      {placed.map((p, i) => (
        <span
          key={i}
          className={styles.bodyDoodle}
          style={
            {
              left: p.x - p.w / 2,
              top: p.y - p.h / 2,
              width: p.w,
              height: p.h,
              transform: `rotate(${p.angle}rad)`,
              backgroundColor: `rgba(${BODY_INK_RGB}, ${ink})`,
              WebkitMaskImage: `url(${p.src})`,
              maskImage: `url(${p.src})`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
