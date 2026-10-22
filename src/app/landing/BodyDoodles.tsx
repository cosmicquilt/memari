"use client";

// The doodle wall behind the landing page's body - see bodyWall.ts. Lies
// under every section after the hero, measures what they show, and packs
// the drawings round it; packs again when the page's width changes, or the
// sliders do (development).
//
// Each drawing is an element masked by its own drawing and filled with the
// blue, not a page-high canvas: at a 2x screen that canvas would hold about
// a hundred megabytes. The drawings are asked for as the wall mounts, at low
// priority, so the hero (asked for first, at high: VideoHero) never waits
// for them, and laid out once the type has settled - not after every picture
// on the page has loaded, which on a 9 Mb/s line left the paper bare for
// eleven seconds (2026-10-21: "the doodle loading in after the paper").

import { useEffect, useRef, useState, type CSSProperties } from "react";
import choices from "./doodleChoices.json";
import { wallClassOf } from "./doodleWall";
import { BODY_INK_RGB, PHONE_WIDTH, bodyWallSettings, onBodyWallSettings, packAround, type Keep, type Placed } from "./bodyWall";
import { WALL_PAPER_TILE, bakeWallPaper, wallPaperKey } from "./wallPaper";
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

/** The strip of cream between the hero's torn edge and the covers' collage
 *  (CoverCarousel, data-doodle-row; its tiles are its lower edge): filled
 *  with a row of small drawings that keep off the post-it but sit closer
 *  to the rip and the tiles than the clearance would let them. */
function rowsOf(holder: HTMLElement, layer: HTMLElement) {
  const band = holder.querySelector<HTMLElement>("[data-doodle-row]");
  const tile = band?.querySelector("li");
  if (!band || !tile) return [];
  const origin = holder.getBoundingClientRect();
  const torn = [...holder.querySelectorAll(`.${styles.tornEdge}`)].map((e) => e.getBoundingClientRect().bottom);
  const y0 = (torn.length ? Math.max(...torn) : band.getBoundingClientRect().top) - origin.top + 2;
  const y1 = tile.getBoundingClientRect().top - origin.top - 10;
  const avoid: Keep[] = [];
  for (const el of holder.querySelectorAll<HTMLElement>(BOXES)) {
    if (layer.contains(el) || band.contains(el) || el.closest(`.${styles.tornEdge}`)) continue;
    const r = el.getBoundingClientRect();
    const [top, bottom] = [r.top - origin.top, r.bottom - origin.top];
    if (r.width > 0 && bottom > y0 && top < y1) avoid.push([r.left - origin.left, top, r.width, r.height]);
  }
  return [{ y0, y1, avoid, margin: 10 }];
}

/** The blocks a drawing travels with: what text sits in, in page order. */
const ANCHORS = "header, section, details, h1, h2, h3, p, li, figure, article";

const loaded = new Map<string, Promise<HTMLImageElement | null>>();
const load = (src: string) => {
  if (!loaded.has(src))
    loaded.set(
      src,
      new Promise((resolve) => {
        const img = new Image();
        img.fetchPriority = "low";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      })
    );
  return loaded.get(src)!;
};

/** `band`: the height in px kept plain at the top. The landing page leaves
 *  the settings' band under its hero; the site's other pages (SitePage) have
 *  no hero, and start the drawings straight away. */
export function BodyDoodles({ band: bandOverride }: { band?: number } = {}) {
  const layer = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  // What is on the page now, for a pack that keeps what still fits.
  const current = useRef<Placed[]>([]);
  // Where the page's blocks were when it was packed: a drawing travels with
  // the block above it when the page grows (see pack).
  const anchors = useRef<Array<{ el: Element; top: number }>>([]);
  const [ink, setInk] = useState(bodyWallSettings().ink);
  // The paper in the drawings, baked into one picture (wallPaper.ts): a blob
  // URL once it is ready, and again whenever the sliders change its look.
  const [paper, setPaper] = useState<string | null>(null);

  useEffect(() => {
    let bakedFor = "";
    let url: string | null = null;
    let timer = 0;
    let live = true;
    const bake = () => {
      const settings = bodyWallSettings();
      const key = wallPaperKey(settings);
      if (key === bakedFor) return;
      bakedFor = key;
      void bakeWallPaper(settings).then((next) => {
        if (!live || bakedFor !== key) {
          if (next) URL.revokeObjectURL(next);
          return;
        }
        if (url) URL.revokeObjectURL(url);
        url = next;
        setPaper(next);
      });
    };
    bake();
    const off = onBodyWallSettings(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(bake, 150);
    });
    return () => {
      live = false;
      off();
      window.clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    const el = layer.current;
    const holder = el?.parentElement;
    if (!el || !holder) return;
    let run = 0;
    let lastWidth = -1;
    let lastHeight = -1;
    // One arrangement per visit if asked for, else the saved one.
    const visitSeed = Math.floor(Math.random() * 1e9);

    // `stay`: the content changed but the width did not - keep every drawing
    // that still fits where it is (packAround). A new width, or new
    // settings, lays the wall out again from nothing.
    const blocksOf = () => {
      const origin = holder.getBoundingClientRect().top;
      return [...holder.querySelectorAll(ANCHORS)].filter((el) => !el.contains(layer.current)).map((el) => ({ el, top: el.getBoundingClientRect().top - origin }));
    };
    const pack = async (stay = false) => {
      const mine = ++run;
      const settings = bodyWallSettings();
      setInk(settings.ink);
      const width = holder.clientWidth;
      const height = holder.clientHeight;
      // Each drawing moves as far as the block above it did - an answer
      // opened on the Help page pushes the questions under it down, and the
      // drawings beside them go with them, as if printed on the page.
      let keepPlaced: Placed[] | undefined;
      if (stay && width === lastWidth) {
        const origin = holder.getBoundingClientRect().top;
        const moved = anchors.current.map(({ el, top }) => ({ top, by: el.isConnected ? el.getBoundingClientRect().top - origin - top : 0 }));
        keepPlaced = current.current.map((p) => {
          // The nearest block starting above it (cards side by side are not
          // in page order, so by position, not by document order).
          let best = -Infinity;
          let by = 0;
          for (const a of moved) {
            if (a.top <= p.y && a.top >= best) {
              best = a.top;
              by = a.by;
            }
          }
          return by ? { ...p, y: p.y + by } : p;
        });
      }
      anchors.current = blocksOf();
      lastWidth = width;
      lastHeight = height;
      const phone = width < PHONE_WIDTH;
      const keep = measure(holder, el);
      // Plain cream under the hero before the doodles begin.
      const band = bandOverride ?? ((phone ? settings.bandMobile : settings.bandDesktop) / 100) * window.innerHeight;
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
        stay: keepPlaced,
        rows: rowsOf(holder, el),
      });
      if (out && mine === run) {
        current.current = out;
        setPlaced(out);
      }
    };

    // The drawings asked for now, behind the hero's pictures; the wall laid
    // out once the type is in (a face arriving later moves the lines the
    // drawings keep clear of) and the page has a quiet moment.
    for (const full of choices.body ?? choices.wall) void load(`/landing/doodles/${full}.webp`);
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      const go = () => void pack();
      if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 500 });
      else setTimeout(go, 100);
    };
    void (document.fonts?.ready ?? Promise.resolve()).then(start);

    // Again when the width changes (a phone's address bar only changes the
    // height), or the content grows or shrinks by more than a line.
    let timer = 0;
    const ro = new ResizeObserver(() => {
      if (!started) return;
      if (holder.clientWidth === lastWidth && Math.abs(holder.clientHeight - lastHeight) < 24) return;
      const sameWidth = holder.clientWidth === lastWidth;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pack(sameWidth), 250);
    });
    ro.observe(holder);
    // Not for the sliders that are the hero's (its side blur).
    const wallKey = () => {
      const wall: Partial<ReturnType<typeof bodyWallSettings>> = { ...bodyWallSettings() };
      delete wall.sideBlur;
      delete wall.sideBlurWidth;
      // Nor the paper sliders: they change how the drawings look, not where.
      delete wall.doodlePaper;
      delete wall.textPaper;
      delete wall.inkPaper;
      delete wall.inkBlend;
      return JSON.stringify(wall);
    };
    let packedFor = wallKey();
    const off = onBodyWallSettings(() => {
      if (wallKey() === packedFor) return;
      packedFor = wallKey();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void pack(), 120);
    });
    return () => {
      run++;
      // a page left before its type arrived does not start the wall after
      started = true;
      ro.disconnect();
      off();
      window.clearTimeout(timer);
    };
  }, [bandOverride]);

  return (
    <div
      ref={layer}
      className={styles.bodyDoodles}
      aria-hidden="true"
      data-paper={paper ? "" : undefined}
      style={paper ? ({ "--wall-paper": `url(${paper}) 0 0 / ${WALL_PAPER_TILE}px ${WALL_PAPER_TILE}px` } as CSSProperties) : undefined}
    >
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
              // a variable, so the baked paper can take the colour's place
              "--doodle-ink": `rgba(${BODY_INK_RGB}, ${ink})`,
              WebkitMaskImage: `url(${p.src})`,
              maskImage: `url(${p.src})`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
