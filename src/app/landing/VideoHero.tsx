"use client";

// The hero: the journal lying open on a lofi desk at a dot-grid page, then
// the planner layouts drawn onto its pages and written in, one after
// another, with no page turns. The title over it is the same Wordmark.
//
// It was a film (Andrew, 2026-09-23): the Veo clip of the journal opening,
// eased to rest, the layouts appearing as it settled. Since 2026-10-15 ("it
// would be better if the hero book is just open on load to dot journal page
// then layouts it fades in when tagline is finished animating") it is the
// clip's resting frame alone, the name kept: from the first paint the book
// is open on its own photographed dot grid (HERO_VIDEO.dots), and once the
// tagline's "you." is written the first layout fades onto the pages as the
// dots fade off them - the clean frame lying under the dotted one - and the
// writing begins. Nothing plays on load: no film to fetch (2.4 MB, 4 MB at
// 4K), and none to decode, or to clip the loose sheets to frame by frame,
// while the title arrives.
//
// And with nothing moving in it but the writing, its still layers are drawn
// into one picture (video/heroBake.ts) that is shown in their place - the
// compositor had been drawing all of them again on every frame of a scroll.
// The layers stay as they were underneath, shown again while that picture
// is being drawn, while the window is resized, and while pinched in.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { LandingSpread } from "./spreads";
import { Wordmark } from "./Wordmark";
import { HAND_FONT_CLASSES } from "./handFonts";
import { HERO_VIDEO, PAGE_OUTLINES } from "./video/heroVideo";
import { BOOK_ON_SHEETS, sheetClip, sheetShows, SHEET_IDS, SHEETS, sheetPath } from "./video/sheets";
import { loadPicture, paintPicture } from "./video/canvasPicture";
import { bakeHero, heroInStage } from "./video/heroBake";
import EXTEND from "./video/heroExtend.json";
import { bodyWallSettings, onBodyWallSettings } from "./bodyWall";
import styles from "./landing.module.css";

/** Seconds the first layout takes to fade onto the pages, and the dots off
 *  them (Andrew, 2026-09-24: "when the very first layout comes onto the
 *  page ... fade it in"). Writing starts once it is there. Later layouts
 *  replace the last one outright, as asked for. */
const LAYOUT_FADE = 1.2;

/** The blur at the screen's sides (.sideBlur): each side is this many
 *  layers, each reaching further in, so the blur grows toward the edge. */
const SIDE_BLUR_LAYERS = [1, 2, 3];

/** The clip's frame the book rests in - where the loose sheets show from
 *  under it (video/sheets.ts). */
const AT_REST = BOOK_ON_SHEETS.right.length - 1;

/** How long the hero's size must hold before its picture is drawn again. */
const REBAKE_AFTER_MS = 200;

export function VideoHero() {
  const hero = useRef<HTMLElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const dotsFrame = useRef<HTMLCanvasElement>(null);
  const cleanFrame = useRef<HTMLCanvasElement>(null);
  const sheetCanvases = useRef<Array<HTMLCanvasElement | null>>([]);
  const sides = useRef<Array<HTMLCanvasElement | null>>([]);
  const stage = useRef<HTMLDivElement>(null);
  const grainLayer = useRef<HTMLDivElement>(null);
  const baked = useRef<HTMLDivElement>(null);
  const bakedDots = useRef<HTMLCanvasElement>(null);
  const bakedClean = useRef<HTMLCanvasElement>(null);
  /** The resting frames are drawn into their canvases: the dotted one, which
   *  shows from load (a CSS background until then), and the clean one under
   *  it. */
  const [dotsUp, setDotsUp] = useState(false);
  const [cleanUp, setCleanUp] = useState(false);
  /** The first layout is on the pages (fading in), the dots going. */
  const [drawn, setDrawn] = useState(false);
  /** The dots have faded out, and their canvas is put away. */
  const [dotsGone, setDotsGone] = useState(false);
  /** Reduced motion: the layout is there at once, written, with no fade. */
  const [instant, setInstant] = useState(false);
  /** The side desk's and the sheets' canvases are drawn (see
   *  video/canvasPicture.ts). Until then they are plain pictures, there from
   *  the first frame. */
  const [sidesReady, setSidesReady] = useState(false);
  const [sheetsReady, setSheetsReady] = useState(false);
  /** Pinched in (see the side blur below). */
  const [zoomed, setZoomed] = useState(false);
  /** The flattened picture's state: `version` moves the moment the hero's
   *  size or the settings change (what was drawn is then out of date),
   *  `settled` catches up once they have held still, and `bakedAt` is the
   *  version each frame's picture was last drawn for. */
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState(0);
  const [bakedAt, setBakedAt] = useState({ dots: -1, clean: -1 });
  const [grain, setGrain] = useState<HTMLImageElement | null>(null);

  // The tagline's "you." is written. Wordmark can say so before this
  // component's effect has run (a child's effects run first, and a late
  // hydration finds the line long written), so it is kept, and the effect
  // looks at it when it is ready.
  const written = useRef(false);
  const afterWritten = useRef<() => void>(() => {});
  const taglineWritten = useCallback(() => {
    written.current = true;
    afterWritten.current();
  }, []);

  // The side blur only while the page is at its own scale: pinched in, the
  // page's sides are no longer the screen's, the blur is magnified with the
  // page (the desk there "gets blurry"), and redone at every step of the
  // zoom it cost most of the frames dropped (2026-10-02). See .sideBlur.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = hero.current;
    if (!vv || !el) return;
    const update = () => {
      const pinched = vv.scale > 1.001;
      el.toggleAttribute("data-zoomed", pinched);
      setZoomed(pinched);
    };
    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, []);

  // The desk beyond the frame's sides, each side drawn into its canvas, and
  // the sheets' drawings into theirs as they lie beside the open book - each
  // taking its picture's place once drawn.
  useEffect(() => {
    let disposed = false;
    const sidesDone = Promise.all(
      (["left", "right"] as const).map((side, i) =>
        loadPicture(`/landing/hero-extend-${side}.webp`).then((pic) => {
          const c = sides.current[i];
          if (!disposed && c) paintPicture(c, pic);
        }),
      ),
    );
    void sidesDone.then(() => !disposed && setSidesReady(true)).catch(() => {});
    const sheetsDone = Promise.all(
      SHEET_IDS.map((id, i) =>
        loadPicture(sheetPath(id)).then((pic) => {
          const c = sheetCanvases.current[i];
          if (disposed || !c) return;
          const [x0, y0, w, h] = SHEETS[id].box;
          const shows = sheetShows(id, AT_REST);
          paintPicture(c, pic, { clip: shows?.map(([X, Y]) => [((X - x0) / w) * pic.naturalWidth, ((Y - y0) / h) * pic.naturalHeight]) });
        }),
      ),
    );
    void sheetsDone.then(() => !disposed && setSheetsReady(true)).catch(() => {});
    return () => {
      disposed = true;
    };
  }, []);

  // What makes the flattened picture out of date: the hero's size, and the
  // dev panel's settings (the blur, the vignette).
  useEffect(() => {
    const el = hero.current;
    if (!el) return;
    let disposed = false;
    let current = 0;
    let timer = 0;
    let first = true;
    const changed = () => {
      current++;
      setVersion(current);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSettled(current), REBAKE_AFTER_MS);
    };
    const ro = new ResizeObserver(() => {
      // Its first call is the size it already has.
      if (first) first = false;
      else changed();
    });
    ro.observe(el);
    const off = onBodyWallSettings(changed);
    void loadPicture("/landing/grain.webp")
      .then((img) => !disposed && setGrain(img))
      .catch(() => {});
    return () => {
      disposed = true;
      ro.disconnect();
      off();
      window.clearTimeout(timer);
    };
  }, []);

  const dotsOut = dotsGone || (instant && drawn);

  // Draw the picture for each frame still to be shown, once everything in
  // it is drawn and the hero's size has held. Not upright (a phone): there
  // the stage is masked and laid out differently, and stays as it is.
  useEffect(() => {
    const el = hero.current;
    const st = stage.current;
    const wrap = baked.current;
    if (!el || !st || !wrap || !grainLayer.current || !grain || !sidesReady || !sheetsReady || settled !== version) return;
    if (window.matchMedia("(max-aspect-ratio: 1/1)").matches) return;
    const parts = { hero: el, stage: st, sides: sides.current, sheets: sheetCanvases.current, grainLayer: grainLayer.current, grain };
    const settings = bodyWallSettings();
    const next = { ...bakedAt };
    if (dotsUp && !dotsOut && bakedAt.dots !== version && dotsFrame.current && bakedDots.current) {
      bakeHero(bakedDots.current, { ...parts, frame: dotsFrame.current }, settings);
      next.dots = version;
    }
    if (cleanUp && bakedAt.clean !== version && cleanFrame.current && bakedClean.current) {
      bakeHero(bakedClean.current, { ...parts, frame: cleanFrame.current }, settings);
      next.clean = version;
    }
    if (next.dots === bakedAt.dots && next.clean === bakedAt.clean) return;
    const box = heroInStage(el, st);
    Object.assign(wrap.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- records what was just drawn into the canvases
    setBakedAt(next);
  }, [settled, version, grain, sidesReady, sheetsReady, dotsUp, cleanUp, dotsOut, bakedAt]);

  const dotsBaked = bakedAt.dots === version;
  const cleanBaked = bakedAt.clean === version;
  /** The flattened picture shows in place of the layers: what is on screen
   *  is drawn in it - the dotted frame until the layout comes, the clean one
   *  from then, both while one fades into the other. */
  const showBaked = !zoomed && (drawn ? cleanBaked && (dotsOut || dotsBaked) : dotsBaked);

  useEffect(() => {
    const canvas = overlay.current;
    if (!canvas) return;
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // The resting frames, their edges faded into the desk beyond as the
    // clip's were (hero-video-mask.png) - drawn in rather than masked on the
    // page, so a zoom has nothing to draw again. The dotted one first, as it
    // is what shows; the clean one after, wanted only when the layouts come.
    const big = window.matchMedia(HERO_VIDEO.media4k).matches;
    const mask = loadPicture("/landing/hero-video-mask.png");
    const frame = (src: string, into: { current: HTMLCanvasElement | null }) =>
      Promise.all([loadPicture(src), mask]).then(([pic, m]) => {
        const c = into.current;
        if (disposed || !c) return false;
        paintPicture(c, pic, { mask: m });
        return true;
      });
    let cleanDrawn = false;
    void frame(big ? HERO_VIDEO.dots4k : HERO_VIDEO.dots, dotsFrame)
      .then((ok) => ok && setDotsUp(true))
      .catch(() => {})
      .then(() => frame(big ? HERO_VIDEO.last4k : HERO_VIDEO.last, cleanFrame))
      .then((ok) => {
        if (!ok) return;
        setCleanUp(true);
        cleanDrawn = true;
        ready();
      })
      .catch(() => {});

    /** The first spread printed and its writing planned. */
    let pages: import("./video/pageLoop").PageLoop | null = null;
    /** The same, once writing: what the frames advance. */
    let loop: import("./video/pageLoop").PageLoop | null = null;
    let paint = () => {};
    /** Whether the layouts have appeared. */
    let drawing = false;
    const start = performance.now();
    const now = () => (performance.now() - start) / 1000;

    let visible = true;
    const tick = () => {
      raf = 0;
      if (!visible || document.hidden || !loop) return;
      loop.update(now());
      paint();
      raf = requestAnimationFrame(tick);
    };
    const run = () => {
      if (visible && !document.hidden && loop && !raf) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      run();
    });
    if (hero.current) io.observe(hero.current);
    document.addEventListener("visibilitychange", run);

    // The layout comes when all three are there: the tagline written, the
    // first spread printed, and the clean page drawn to show as the dots go.
    const begin = () => {
      if (drawing || !pages) return;
      drawing = true;
      if (reduce) {
        pages.still();
        paint();
        setInstant(true);
        setDrawn(true);
        return;
      }
      loop = pages;
      paint();
      setDrawn(true);
      loop.start(now() + LAYOUT_FADE);
      run();
    };
    function ready() {
      if (written.current && cleanDrawn && pages) begin();
    }
    afterWritten.current = ready;

    (async () => {
      const [{ PageWarp }, { PageLoop }, spreads] = await Promise.all([
        import("./video/pageWarp"),
        import("./video/pageLoop"),
        fetch("/landing/spreads").then((r) => r.json() as Promise<LandingSpread[]>),
      ]);
      if (disposed) return;
      let warp: InstanceType<typeof PageWarp>;
      // As many pixels as the stage shows, at most the frame's.
      const across = Math.min(HERO_VIDEO.width, Math.ceil((canvas.parentElement?.clientWidth ?? HERO_VIDEO.width) * window.devicePixelRatio));
      try {
        warp = new PageWarp(canvas, [PAGE_OUTLINES.left, PAGE_OUTLINES.right], HERO_VIDEO, {
          width: across,
          height: Math.round((across * HERO_VIDEO.height) / HERO_VIDEO.width),
        });
      } catch {
        // No WebGL: the book stays open on its dot grid.
        return;
      }
      const pictures: HTMLCanvasElement[] = [];
      const dirty = [false, false];
      const textureHeight = window.devicePixelRatio >= 2 && window.innerWidth > 900 ? 2048 : 1448;
      const printed = new PageLoop(spreads, textureHeight, (page, picture) => {
        pictures[page] = picture;
        dirty[page] = true;
      });
      await printed.ready();
      if (disposed) {
        warp.dispose();
        return;
      }
      paint = () => {
        let any = false;
        for (const page of [0, 1] as const) {
          if (!dirty[page]) continue;
          warp.upload(page, pictures[page]);
          dirty[page] = false;
          any = true;
        }
        if (any) warp.draw();
      };
      cleanup = () => warp.dispose();
      // Development only: reach the pieces from the console to inspect a
      // moment without waiting for it (see desk/Hero.tsx's __desk).
      if (process.env.NODE_ENV !== "production") (window as unknown as { __video?: unknown }).__video = { pages: printed, paint: () => paint(), begin, warp, canvas };
      pages = printed;
      ready();
    })();

    return () => {
      disposed = true;
      afterWritten.current = () => {};
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", run);
      cleanup();
    };
  }, []);

  // The hero lies below the paper (2026-10-14: "a very subtle parallax when
  // scrolling based on the hero is below the plane of the paper"): it moves
  // up slower than the page, by the dev panel's "Hero parallax" (a fraction
  // of the scroll), so the body's sheet slides over it; none for reduced
  // motion. Driven by a scroll timeline: the compositor moves it in the same
  // frame as the scroll. Set from scroll events it was "very choppy"
  // (2026-10-14) - they arrive a frame after the page has already moved, so
  // the hero shook against it. A browser without scroll timelines (Firefox
  // before 159) keeps the hero still rather than shaking.
  useEffect(() => {
    const el = hero.current;
    const Timeline = (window as { ScrollTimeline?: new (o: { source: Element; axis: "block" }) => AnimationTimeline }).ScrollTimeline;
    if (!el || !Timeline) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let factor = bodyWallSettings().heroParallax ?? 0.2;
    // animation ranges came later than timelines in some browsers (Firefox
    // had timelines without them); without, the sinking is placed by keyframe
    // offsets along the whole scroll, so it needs the page's height
    const ranged = "rangeEnd" in Animation.prototype;
    const page = document.documentElement;
    let sink: Animation | null = null;
    // past 1.5 heroes there is nothing of it left to see, so it stops there
    const build = () => {
      sink?.cancel();
      sink = null;
      const k = still.matches ? 0 : factor;
      if (!k) return;
      const reach = Math.round(el.offsetHeight * 1.5);
      const at = (y: number) => ({ transform: `translate3d(0, ${(y * k).toFixed(1)}px, 0)` });
      const timeline = new Timeline({ source: page, axis: "block" });
      if (ranged) {
        sink = el.animate([at(0), at(reach)], { timeline, rangeStart: "0px", rangeEnd: `${reach}px`, fill: "both", easing: "linear" } as KeyframeAnimationOptions);
      } else {
        const max = Math.max(1, page.scrollHeight - page.clientHeight);
        const stop = Math.min(reach, max);
        const frames: Keyframe[] = [{ ...at(0), offset: 0 }, { ...at(stop), offset: stop / max }];
        if (stop < max) frames.push({ ...at(stop), offset: 1 });
        sink = el.animate(frames, { timeline, fill: "both", easing: "linear" } as KeyframeAnimationOptions);
      }
    };
    const off = onBodyWallSettings(() => {
      factor = bodyWallSettings().heroParallax ?? 0.2;
      build();
    });
    build();
    // the hero's height follows the window; without ranges, so does the page's
    const resized = new ResizeObserver(() => build());
    resized.observe(el);
    if (!ranged) resized.observe(document.body);
    still.addEventListener("change", build);
    return () => {
      off();
      resized.disconnect();
      still.removeEventListener("change", build);
      sink?.cancel();
    };
  }, []);

  const fade = instant ? "none" : `opacity ${LAYOUT_FADE}s cubic-bezier(0.33, 0, 0.2, 1)`;
  return (
    <section
      ref={hero}
      className={`${styles.hero} ${HAND_FONT_CLASSES.join(" ")}`}
      aria-label="Memari Studio"
      data-off-paper=""
      data-baked={showBaked ? "" : undefined}
    >
      <div className={styles.videoBackdrop} style={{ backgroundImage: `url(${HERO_VIDEO.dots})` }} aria-hidden="true" />
      <div
        ref={stage}
        className={styles.videoStage}
        // The dotted frame from the first paint, until its canvas is drawn:
        // then nothing, or a zoom would draw it again under the canvas.
        style={{ backgroundImage: dotsUp ? "none" : `url(${HERO_VIDEO.dots})` }}
        aria-hidden="true"
      >
        {/* The still layers, in the flattened picture once it is drawn. */}
        <div className={styles.liveLayers}>
        {/* The desk beyond the frame's sides - see .videoExtend. */}
        <div className={styles.videoExtend}>
          {(["left", "right"] as const).map((side, i) => {
            const [x, w] = EXTEND[side];
            const place = { left: `${(x / EXTEND.width) * 100}%`, width: `${(w / EXTEND.width) * 100}%` };
            return [
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${side}-img`}
                className={styles.videoExtendSide}
                src={`/landing/hero-extend-${side}.webp`}
                alt=""
                style={{ ...place, visibility: sidesReady ? "hidden" : "visible" }}
              />,
              <canvas
                key={side}
                ref={(el) => {
                  sides.current[i] = el;
                }}
                className={styles.videoExtendSide}
                style={{ ...place, visibility: sidesReady ? "visible" : "hidden" }}
              />,
            ];
          })}
        </div>
        {/* The clean page, under the dotted one, there for when the dots
            fade off it. */}
        <canvas ref={cleanFrame} className={styles.videoStill} style={{ visibility: cleanUp ? "visible" : "hidden" }} />
        <canvas
          ref={dotsFrame}
          className={styles.videoStill}
          style={{ visibility: dotsUp && !dotsGone && !(instant && drawn) ? "visible" : "hidden", opacity: drawn ? 0 : 1, transition: fade }}
          onTransitionEnd={() => setDotsGone(true)}
        />
        {/* The loose sheets on the desk, drawn on (2026-09-28: "add two
            unique doodle wall drawings and paper texture to the two loose
            papers") - baked pictures of each sheet's box, multiplied like the
            pages, there from the first frame ("dont make it fade in") and
            clipped to where the open book lies across them. See
            video/sheets.ts. */}
        {SHEET_IDS.map((id, i) => {
          const [x, y, w, h] = SHEETS[id].box;
          const place = {
            left: `${(x / HERO_VIDEO.width) * 100}%`,
            top: `${(y / HERO_VIDEO.height) * 100}%`,
            width: `${(w / HERO_VIDEO.width) * 100}%`,
            height: `${(h / HERO_VIDEO.height) * 100}%`,
          };
          return [
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${id}-img`}
              src={sheetPath(id)}
              alt=""
              fetchPriority="high"
              className={styles.videoSheet}
              style={{ ...place, visibility: sheetsReady ? "hidden" : "visible", clipPath: sheetClip(id, AT_REST) }}
            />,
            <canvas
              key={id}
              ref={(el) => {
                sheetCanvases.current[i] = el;
              }}
              className={styles.videoSheet}
              style={{ ...place, visibility: sheetsReady ? "visible" : "hidden" }}
            />,
          ];
        })}
        </div>
        {/* The hero flattened (video/heroBake.ts), placed on the hero's box:
            clean under dotted, as the frames are. */}
        <div ref={baked} className={styles.bakedLayers}>
          <canvas ref={bakedClean} className={styles.videoStill} style={{ visibility: cleanBaked ? "visible" : "hidden" }} />
          <canvas
            ref={bakedDots}
            className={styles.videoStill}
            style={{ visibility: dotsBaked && !dotsOut ? "visible" : "hidden", opacity: drawn ? 0 : 1, transition: fade }}
            onTransitionEnd={() => setDotsGone(true)}
          />
        </div>
        <canvas ref={overlay} className={styles.videoDrawing} style={{ opacity: drawn ? 1 : 0, transition: fade }} />
      </div>
      <div className={styles.liveLayers} aria-hidden="true">
        {/* The blur toward the screen's sides - see .sideBlur. */}
        {(["left", "right"] as const).map((side) =>
          SIDE_BLUR_LAYERS.map((k) => (
            <div
              key={`${side}${k}`}
              className={`${styles.sideBlur} ${side === "left" ? styles.sideBlurLeft : styles.sideBlurRight}`}
              style={{ "--k": k } as CSSProperties}
            />
          )),
        )}
        <div className={styles.videoScrim} />
        {/* Darker toward the hero's edges - see .vignette. */}
        <div className={styles.vignette} />
        <div ref={grainLayer} className={styles.grain} />
      </div>
      <Wordmark className={styles.titleOverFilm} onWritten={taglineWritten} />
      <p className={styles.srOnly}>
        A journal lies open on a desk at a dot-grid page; a planner layout appears on its pages and is written in by hand, then
        another layout takes its place.
      </p>
    </section>
  );
}
