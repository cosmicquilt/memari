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

import { useEffect, useRef, useState } from "react";
import type { LandingSpread } from "./spreads";
import { Wordmark } from "./Wordmark";
import { HAND_FONT_CLASSES } from "./handFonts";
import { HERO_VIDEO, PAGE_OUTLINES } from "./video/heroVideo";
import styles from "./landing.module.css";

export function VideoHero() {
  const hero = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [still, setStill] = useState(false);
  /** The clip has reached the frame the drawing is laid on. */
  const [resting, setResting] = useState(false);

  useEffect(() => {
    const v = video.current;
    const canvas = overlay.current;
    if (!v || !canvas) return;
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Play at once; the drawing machinery loads alongside.
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
      loop.start(now());
    };
    v.addEventListener("ended", begin);

    let visible = true;
    const tick = () => {
      raf = 0;
      if (!visible || document.hidden) return;
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
      v.removeEventListener("ended", begin);
      cleanup();
    };
  }, []);

  return (
    <section ref={hero} className={`${styles.hero} ${HAND_FONT_CLASSES.join(" ")}`} aria-label="Memari Studio">
      <div className={styles.videoBackdrop} style={{ backgroundImage: `url(${HERO_VIDEO.first})` }} aria-hidden="true" />
      {/* Behind the clip, the still it is showing: its first frame, then its
          last. A background tab may drop the video's picture, and a window
          or tab preview then shows this instead of an empty page. */}
      <div className={styles.videoStage} style={{ backgroundImage: `url(${resting ? HERO_VIDEO.last : HERO_VIDEO.first})` }} aria-hidden="true">
        <video
          ref={video}
          className={styles.videoFrame}
          poster={HERO_VIDEO.first}
          muted
          playsInline
          preload="auto"
          disableRemotePlayback
          style={{ visibility: still ? "hidden" : "visible" }}
        >
          {/* The 4K film only where the screen has the pixels for it; the
              browser takes the first source whose media matches. */}
          <source src={HERO_VIDEO.src4k} type="video/mp4" media={HERO_VIDEO.media4k} />
          <source src={HERO_VIDEO.src} type="video/mp4" />
        </video>
        {still && (
          // The resting frame, for reduced motion - the page is drawn on it
          // without the clip ever playing.
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.videoFrame} src={HERO_VIDEO.last} alt="" />
        )}
        <canvas ref={overlay} className={styles.videoDrawing} style={{ opacity: drawn ? 1 : 0 }} />
      </div>
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
