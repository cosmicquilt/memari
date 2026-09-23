"use client";

// The hero: the desk, the journal on it, and the title over them.
//
// The title animates at once, from the page's own HTML; the 3D desk loads
// behind it (three.js and the spreads are fetched after first paint) and
// fades in when it is ready, closed. When the title has arrived the book
// opens. The scene only renders while the hero is on screen and the tab is
// visible - a desk nobody is looking at costs nothing.

import { useCallback, useEffect, useRef, useState } from "react";
import type { LandingSpread } from "./spreads";
import { Wordmark } from "./Wordmark";
import { PaceSlider } from "./PaceSlider";
import { HAND_FONT_CLASSES } from "./handFonts";
import styles from "./landing.module.css";

export function Hero() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hero = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  /** Ready while the tab was in the background: appear without the fade,
   *  which does not run there - a tab preview would find the desk still
   *  invisible. */
  const [readyHidden, setReadyHidden] = useState(false);
  const opener = useRef<{ open: () => void } | null>(null);
  const titleArrived = useRef(false);

  const onArrived = useCallback(() => {
    titleArrived.current = true;
    opener.current?.open();
  }, []);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    (async () => {
      const [{ createDeskScene }, { Director }, spreads] = await Promise.all([
        import("./desk/scene"),
        import("./desk/director"),
        fetch("/landing/spreads").then((r) => r.json() as Promise<LandingSpread[]>),
      ]);
      if (disposed || !canvas.current || !hero.current) return;
      const almarai = getComputedStyle(document.documentElement).getPropertyValue("--font-almarai").trim() || "sans-serif";
      await document.fonts.load(`700 80px ${almarai}`).catch(() => []);
      const desk = createDeskScene(canvas.current, almarai);
      const textureHeight = window.devicePixelRatio >= 2 && window.innerWidth > 900 ? 2048 : 1448;
      const director = new Director(desk, spreads, textureHeight);
      // The first spread printed, and the walnut and paper arrived - the desk
      // fades in whole rather than as flat colour that then gains its grain.
      await Promise.all([director.ready(), desk.loaded]);
      if (disposed) {
        desk.dispose();
        return;
      }

      const size = () => {
        const box = canvas.current!.getBoundingClientRect();
        desk.resize(Math.max(1, Math.round(box.width)), Math.max(1, Math.round(box.height)));
      };
      size();
      const observer = new ResizeObserver(() => {
        size();
        if (reduce) desk.frame(0);
      });
      observer.observe(canvas.current);

      // Development only: reach the scene from the console to inspect a
      // moment (a turn half-way, say) without waiting for it.
      if (process.env.NODE_ENV !== "production") (window as unknown as { __desk?: unknown }).__desk = { desk, director };
      const start = performance.now();
      const now = () => (performance.now() - start) / 1000;
      opener.current = { open: () => director.open(now()) };
      if (titleArrived.current) director.open(now());

      if (reduce) {
        director.still();
        desk.frame(0);
        setReadyHidden(document.hidden);
      setReady(true);
        cleanup = () => {
          observer.disconnect();
          director.dispose();
          desk.dispose();
        };
        return;
      }

      // Only while it can be seen.
      let visible = true;
      const io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(tick);
      });
      io.observe(hero.current);
      const tick = () => {
        raf = 0;
        if (!visible || document.hidden) return;
        const t = now();
        director.update(t);
        desk.frame(t);
        raf = requestAnimationFrame(tick);
      };
      const onVisibility = () => {
        if (!document.hidden && visible && !raf) raf = requestAnimationFrame(tick);
      };
      document.addEventListener("visibilitychange", onVisibility);
      const onPointer = (event: PointerEvent) => {
        const box = hero.current!.getBoundingClientRect();
        desk.lookToward(((event.clientX - box.left) / box.width) * 2 - 1, ((event.clientY - box.top) / box.height) * 2 - 1);
      };
      hero.current.addEventListener("pointermove", onPointer);
      // One frame now, even in a background tab where the loop does not
      // run yet - so a preview of the tab shows the desk, not an empty canvas.
      desk.frame(now());
      raf = requestAnimationFrame(tick);
      setReadyHidden(document.hidden);
      setReady(true);
      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        observer.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        hero.current?.removeEventListener("pointermove", onPointer);
        director.dispose();
        desk.dispose();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <section ref={hero} className={`${styles.hero} ${HAND_FONT_CLASSES.join(" ")}`} aria-label="Memari Studio">
      <div className={styles.backdrop} aria-hidden="true" />
      <canvas ref={canvas} className={styles.desk} style={{ opacity: ready ? 1 : 0, transition: readyHidden ? "none" : undefined }} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />
      <Wordmark onArrived={onArrived} />
      <PaceSlider />
      <p className={styles.srOnly}>
        A journal on a desk opens to a week and is written in by hand, then turns to the next week - a different layout,
        written in by someone else.
      </p>
    </section>
  );
}
