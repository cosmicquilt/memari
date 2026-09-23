"use client";

// The title, arriving - asked for 2026-09-22: "first starting with a dot on
// the left side of where the dot will slide to the right revealing 'memari.'
// (all lower case). after studio should fade in same style as header of app.
// and 'a planner as unique as you.' should also fade in below that."
//
// The dot is the full stop of "memari." itself, set in the same face. It
// appears where the "m" will begin, then slides to its place at the end of
// the word, and the letters are uncovered behind it: a clip whose right edge
// follows the dot. The clip and the slide are two animations with the same
// timing on the same curve, so they cannot drift apart. "STUDIO" is set
// exactly as the app's header sets it (light, tracked, 0.8em, upper case),
// then the line under it.
//
// Reduced motion: everything fades in, nothing slides.

import { useLayoutEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

/** A considered, unhurried move: slow out, slow in. */
const GLIDE = "cubic-bezier(0.65, 0, 0.35, 1)";
/** Settling into place, the way Apple's text arrives. */
const SETTLE = "cubic-bezier(0.22, 1, 0.36, 1)";

const APPEAR_AT = 150;
const SLIDE_AT = 700;
const SLIDE_MS = 1300;
const STUDIO_AT = SLIDE_AT + SLIDE_MS - 100;
const TAGLINE_AT = STUDIO_AT + 450;

export function Wordmark({ onArrived }: { onArrived?: () => void }) {
  const letters = useRef<HTMLSpanElement>(null);
  const dotSlide = useRef<HTMLSpanElement>(null);
  const dotInk = useRef<HTMLSpanElement>(null);
  const studio = useRef<HTMLSpanElement>(null);
  const tagline = useRef<HTMLParagraphElement>(null);
  // Hidden until measured, so the first paint is the dot alone - never a
  // flash of the finished word.
  const [measured, setMeasured] = useState(false);

  useLayoutEffect(() => {
    let cancelled = false;
    let arrived = false;
    const arrive = () => {
      if (arrived) return;
      arrived = true;
      onArrived?.();
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const run = async () => {
      // The word's width depends on the face, so wait for it.
      try {
        await document.fonts.ready;
      } catch {
        // Measured in the fallback; still right once the face swaps.
      }
      const els = [letters.current, dotSlide.current, dotInk.current, studio.current, tagline.current];
      if (cancelled || els.some((el) => !el)) return;
      const [l, slide, ink, s, t] = els as [HTMLElement, HTMLElement, HTMLElement, HTMLElement, HTMLElement];
      const width = l.getBoundingClientRect().width;
      const at = (delay: number, duration: number, easing: string): KeyframeAnimationOptions => ({ delay, duration, easing, fill: "both" });
      if (reduce) {
        l.animate([{ opacity: 0 }, { opacity: 1 }], at(0, 600, "ease-out"));
        ink.animate([{ opacity: 0 }, { opacity: 1 }], at(0, 600, "ease-out"));
        s.animate([{ opacity: 0 }, { opacity: 1 }], at(250, 600, "ease-out"));
        t.animate([{ opacity: 0 }, { opacity: 1 }], at(500, 600, "ease-out")).finished.then(arrive, arrive);
        setMeasured(true);
        return;
      }
      // The dot: appears at the start of the word...
      ink.animate(
        [
          { opacity: 0, transform: "scale(0.2)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        at(APPEAR_AT, 420, "cubic-bezier(0.34, 1.56, 0.64, 1)")
      );
      // ...then crosses it, uncovering the letters behind it.
      slide.animate([{ transform: `translateX(${-width}px)` }, { transform: "translateX(0)" }], at(SLIDE_AT, SLIDE_MS, GLIDE));
      l.animate([{ clipPath: "inset(-25% 100% -25% 0)" }, { clipPath: "inset(-25% 0% -25% 0)" }], at(SLIDE_AT, SLIDE_MS, GLIDE));
      s.animate(
        [
          { opacity: 0, transform: "translateY(0.1em)", filter: "blur(6px)" },
          { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
        ],
        at(STUDIO_AT, 900, SETTLE)
      );
      t.animate(
        [
          { opacity: 0, transform: "translateY(12px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        at(TAGLINE_AT, 1000, SETTLE)
      );
      setMeasured(true);
      // The book starts to open as the line settles.
      window.setTimeout(arrive, TAGLINE_AT + 500);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [onArrived]);

  return (
    <div className={styles.title} style={{ visibility: measured ? "visible" : "hidden" }}>
      <h1 className={styles.wordmark} aria-label="memari. studio">
        <span className={styles.word} aria-hidden="true">
          <span ref={letters} className={styles.letters}>
            memari
          </span>
          <span ref={dotSlide} className={styles.dot}>
            <span ref={dotInk} className={styles.dotInk}>
              .
            </span>
          </span>
        </span>
        <span ref={studio} className={styles.studio} aria-hidden="true">
          studio
        </span>
      </h1>
      <p ref={tagline} className={styles.tagline}>
        a planner as unique as you.
      </p>
    </div>
  );
}
