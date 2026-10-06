"use client";

// The hero as a film (Andrew, 2026-09-23, to set beside the 3D desk): the
// Veo clip of the journal opening on a lofi desk, then the planner layouts
// drawn onto its pages and written in, one after another, with no page
// turns. The title over it is the same Wordmark.
//
// Veo's take did not start or end at rest ("the last and beginning seconds
// are not still ... if you can ease both"); the file is eased (see
// heroVideo.ts): it rises from rest, settles to rest on its final frame. It
// plays once and stays on that frame. The layouts appear as it comes to
// rest, about a second after the book has landed open (drawFrom), mapped
// onto the last frame's pages.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { LandingSpread } from "./spreads";
import { Wordmark } from "./Wordmark";
import { HAND_FONT_CLASSES } from "./handFonts";
import { HERO_VIDEO, PAGE_OUTLINES } from "./video/heroVideo";
import { BOOK_ON_SHEETS, filmFrame, sheetClip, sheetShows, SHEET_IDS, SHEETS, sheetPath } from "./video/sheets";
import { loadPicture, paintPicture } from "./video/canvasPicture";
import EXTEND from "./video/heroExtend.json";
import { bodyWallSettings, onBodyWallSettings } from "./bodyWall";
import styles from "./landing.module.css";

/** Seconds the first layout takes to fade onto the resting pages (Andrew,
 *  2026-09-24: "when the very first layout comes onto the page ... fade it
 *  in"). Writing starts once it is there. Later layouts replace the last
 *  one outright, as asked for. */
const LAYOUT_FADE = 1.2;

/** The blur at the screen's sides (.sideBlur): each side is this many
 *  layers, each reaching further in, so the blur grows toward the edge. */
const SIDE_BLUR_LAYERS = [1, 2, 3];

export function VideoHero() {
  const hero = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const sheets = useRef<Array<HTMLImageElement | null>>([]);
  const sheetCanvases = useRef<Array<HTMLCanvasElement | null>>([]);
  const sides = useRef<Array<HTMLCanvasElement | null>>([]);
  const lastFrame = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [still, setStill] = useState(false);
  /** The clip has reached the frame the drawing is laid on. */
  const [resting, setResting] = useState(false);
  /** The clip has ended, and its last frame has been drawn in its place. */
  const [ended, setEnded] = useState(false);
  const [lastReady, setLastReady] = useState(false);
  const frozen = still || (ended && lastReady);
  /** The side desk's and the sheets' canvases are drawn (see
   *  video/canvasPicture.ts). Until then - and the sheets' until the film
   *  rests - they are plain pictures, there from the first frame. */
  const [sidesReady, setSidesReady] = useState(false);
  const [sheetsReady, setSheetsReady] = useState(false);

  // The side blur only while the page is at its own scale: pinched in, the
  // page's sides are no longer the screen's, the blur is magnified with the
  // page (the desk there "gets blurry"), and redone at every step of the
  // zoom it cost most of the frames dropped (2026-10-02). See .sideBlur.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = hero.current;
    if (!vv || !el) return;
    const update = () => el.toggleAttribute("data-zoomed", vv.scale > 1.001);
    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, []);

  // The desk beyond the film's sides, each side drawn into its canvas, and
  // the sheets' drawings into theirs as they will be at rest - each taking
  // its picture's place once drawn (the sheets' once the film rests).
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
    const atRest = BOOK_ON_SHEETS.right.length - 1;
    const sheetsDone = Promise.all(
      SHEET_IDS.map((id, i) =>
        loadPicture(sheetPath(id)).then((pic) => {
          const c = sheetCanvases.current[i];
          if (disposed || !c) return;
          const [x0, y0, w, h] = SHEETS[id].box;
          const shows = sheetShows(id, atRest);
          paintPicture(c, pic, { clip: shows?.map(([X, Y]) => [((X - x0) / w) * pic.naturalWidth, ((Y - y0) / h) * pic.naturalHeight]) });
        }),
      ),
    );
    void sheetsDone.then(() => !disposed && setSheetsReady(true)).catch(() => {});
    return () => {
      disposed = true;
    };
  }, []);

  // The resting frame, once wanted: the 4K one where the 4K film plays, its
  // edges faded as the film's are (hero-video-mask.png) - drawn in rather
  // than masked on the page, so a zoom has nothing to draw again.
  const wantLast = still || ended;
  useEffect(() => {
    if (!wantLast) return;
    let disposed = false;
    const src = window.matchMedia(HERO_VIDEO.media4k).matches ? HERO_VIDEO.last4k : HERO_VIDEO.last;
    void Promise.all([loadPicture(src), loadPicture("/landing/hero-video-mask.png")]).then(([pic, mask]) => {
      const c = lastFrame.current;
      if (disposed || !c) return;
      paintPicture(c, pic, { mask });
      setLastReady(true);
    });
    return () => {
      disposed = true;
    };
  }, [wantLast]);

  useEffect(() => {
    const v = video.current;
    const canvas = overlay.current;
    if (!v || !canvas) return;
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // As fast as the book should open (bodyWallSettings' openSeconds; the
    // dev sliders change it live). Then play at once; the drawing machinery
    // loads alongside.
    const setRate = () => {
      v.playbackRate = v.defaultPlaybackRate = HERO_VIDEO.seconds / bodyWallSettings().openSeconds;
    };
    setRate();
    const offRate = onBodyWallSettings(setRate);
    if (!reduce) void v.play().catch(() => {});

    let loop: import("./video/pageLoop").PageLoop | null = null;
    let paint = () => {};
    /** Whether the layouts have appeared. */
    let drawing = false;
    const start = performance.now();
    const now = () => (performance.now() - start) / 1000;
    const begin = () => {
      if (drawing || !loop) return;
      drawing = true;
      paint();
      setDrawn(true);
      setResting(true);
      loop.start(now() + LAYOUT_FADE);
    };
    const onEnded = () => {
      setEnded(true);
      begin();
    };
    v.addEventListener("ended", onEnded);

    // The loose sheets' drawings go under the book as it opens over them:
    // each is clipped to where the book is in the frame on screen.
    let sheetFrame = 0;
    const clipSheets = (frame: number) => {
      if (frame === sheetFrame) return;
      sheetFrame = frame;
      SHEET_IDS.forEach((id, i) => {
        const img = sheets.current[i];
        if (img) img.style.clipPath = sheetClip(id, frame);
      });
    };
    if (reduce) clipSheets(BOOK_ON_SHEETS.right.length - 1);

    let visible = true;
    const tick = () => {
      raf = 0;
      if (!visible || document.hidden) return;
      clipSheets(v.ended ? BOOK_ON_SHEETS.right.length - 1 : filmFrame(v.currentTime));
      if (!drawing && v.currentTime >= HERO_VIDEO.drawFrom) begin();
      if (drawing && loop) {
        loop.update(now());
        paint();
      }
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf && !reduce) raf = requestAnimationFrame(tick);
    });
    if (hero.current) io.observe(hero.current);
    const onVisibility = () => {
      if (!document.hidden && visible && !raf && !reduce) raf = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (!reduce) raf = requestAnimationFrame(tick);

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
        // No WebGL: the clip plays and rests on its blank pages.
        return;
      }
      const pictures: HTMLCanvasElement[] = [];
      const dirty = [false, false];
      const textureHeight = window.devicePixelRatio >= 2 && window.innerWidth > 900 ? 2048 : 1448;
      const pages = new PageLoop(spreads, textureHeight, (page, picture) => {
        pictures[page] = picture;
        dirty[page] = true;
      });
      await pages.ready();
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
      if (process.env.NODE_ENV !== "production") (window as unknown as { __video?: unknown }).__video = { video: v, pages, paint: () => paint(), begin, warp, canvas };
      if (reduce) {
        pages.still();
        paint();
        setStill(true);
        setDrawn(true);
        return;
      }
      loop = pages;
      if (v.ended || v.currentTime >= HERO_VIDEO.drawFrom) begin();
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      v.removeEventListener("ended", onEnded);
      offRate();
      cleanup();
    };
  }, []);

  return (
    <section ref={hero} className={`${styles.hero} ${HAND_FONT_CLASSES.join(" ")}`} aria-label="Memari Studio">
      <div className={styles.videoBackdrop} style={{ backgroundImage: `url(${HERO_VIDEO.first})` }} aria-hidden="true" />
      {/* Behind the clip, the still it is showing: its first frame, then its
          last. A background tab may drop the video's picture, and a window
          or tab preview then shows this instead of an empty page. */}
      <div
        className={styles.videoStage}
        // Not once the resting frame's picture is up: it would only be
        // drawn again, under it, at every step of a zoom.
        style={{ backgroundImage: frozen ? "none" : `url(${resting ? HERO_VIDEO.last : HERO_VIDEO.first})` }}
        aria-hidden="true"
      >
        {/* The desk beyond the film's sides - see .videoExtend. */}
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
        <video
          ref={video}
          className={styles.videoFrame}
          poster={HERO_VIDEO.first}
          muted
          playsInline
          preload="auto"
          disableRemotePlayback
          style={{ visibility: frozen ? "hidden" : "visible" }}
        >
          {/* The 4K film only where the screen has the pixels for it; the
              browser takes the first source whose media matches. */}
          <source src={HERO_VIDEO.src4k} type="video/mp4" media={HERO_VIDEO.media4k} />
          <source src={HERO_VIDEO.src} type="video/mp4" />
        </video>
        {/* The resting frame. For reduced motion the page is drawn on it
            without the clip ever playing; otherwise it takes the ended clip's
            place once drawn, so nothing rests on the video: a window in the
            background can lose a video's picture, and the app switcher's
            preview showed no hero (Andrew, 2026-10-02). */}
        <canvas ref={lastFrame} className={styles.videoStill} style={{ visibility: frozen ? "visible" : "hidden" }} />
        <canvas
          ref={overlay}
          className={styles.videoDrawing}
          style={{ opacity: drawn ? 1 : 0, transition: still ? "none" : `opacity ${LAYOUT_FADE}s cubic-bezier(0.33, 0, 0.2, 1)` }}
        />
        {/* The loose sheets on the desk, drawn on (2026-09-28: "add two
            unique doodle wall drawings and paper texture to the two loose
            papers") - baked pictures of each sheet's box, multiplied like the
            pages, there from the first frame ("dont make it fade in") and
            clipped to the book as it opens across them. See video/sheets.ts. */}
        {SHEET_IDS.map((id, i) => {
          const [x, y, w, h] = SHEETS[id].box;
          const place = {
            left: `${(x / HERO_VIDEO.width) * 100}%`,
            top: `${(y / HERO_VIDEO.height) * 100}%`,
            width: `${(w / HERO_VIDEO.width) * 100}%`,
            height: `${(h / HERO_VIDEO.height) * 100}%`,
          };
          const canvasUp = frozen && sheetsReady;
          return [
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${id}-img`}
              ref={(el) => {
                sheets.current[i] = el;
              }}
              src={sheetPath(id)}
              alt=""
              fetchPriority="high"
              className={styles.videoSheet}
              style={{
                ...place,
                visibility: canvasUp ? "hidden" : "visible",
                // The first frame's; the film's own frames take over as it plays.
                clipPath: sheetClip(id, 0),
              }}
            />,
            <canvas
              key={id}
              ref={(el) => {
                sheetCanvases.current[i] = el;
              }}
              className={styles.videoSheet}
              style={{ ...place, visibility: canvasUp ? "visible" : "hidden" }}
            />,
          ];
        })}
      </div>
      {/* The blur toward the screen's sides - see .sideBlur. */}
      {(["left", "right"] as const).map((side) =>
        SIDE_BLUR_LAYERS.map((k) => (
          <div
            key={`${side}${k}`}
            className={`${styles.sideBlur} ${side === "left" ? styles.sideBlurLeft : styles.sideBlurRight}`}
            style={{ "--k": k } as CSSProperties}
            aria-hidden="true"
          />
        )),
      )}
      <div className={styles.videoScrim} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />
      <Wordmark className={styles.titleOverFilm} />
      <p className={styles.srOnly}>
        A journal on a desk opens to a blank week; a planner layout appears on its pages and is written in by hand, then another
        layout takes its place.
      </p>
    </section>
  );
}
