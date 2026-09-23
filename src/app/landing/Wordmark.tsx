"use client";

// The title, arriving - asked for 2026-09-22: "first starting with a dot on
// the left side of where the dot will slide to the right revealing 'memari.'
// (all lower case). after studio should fade in same style as header of app.
// and 'a planner as unique as you.' should also fade in below that." The
// line became "a journal as unique as you." on 2026-09-23.
//
// The dot is the full stop of "memari." itself, set in the same face. It
// appears where the "m" will begin, then slides to its place at the end of
// the word, and the letters are uncovered behind it.
//
// All of it is CSS keyframes on transform and opacity, which the browser
// runs off the main thread - it plays at first paint, before any JavaScript,
// and nothing the page does while loading can make it stutter. (It was
// driven from JavaScript, and "laggily appears" was the 3D desk building its
// textures on the main thread through the whole reveal.) The uncovering is
// a window sliding over the word while the word is slid back the same
// distance inside it: two transforms on one curve, so the letters stand
// still and the window's edge - where the dot rides - moves across them.
// The window is laid OVER an invisible copy of the word, which is what sits
// on the line: a box that clips is aligned by its bottom edge, not by its
// text, and set in the line it lifted "memari." 0.18em above "STUDIO".
//
// Reduced motion: everything fades in, nothing slides.

import { useEffect, useRef } from "react";
import styles from "./landing.module.css";

/** When the book may start to open: half a second into the tagline's
 *  arrival, as it settles. Matches the tagline's animation-delay. */
const OPEN_AFTER_MS = 2350 + 500;

export function Wordmark({ onArrived }: { onArrived?: () => void }) {
  const tagline = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const line = tagline.current;
    if (!line) return;
    // Timed off the tagline's own animation, which started at first paint -
    // not off this effect, which runs whenever hydration gets here.
    const [animation] = line.getAnimations();
    const elapsed = animation && typeof animation.currentTime === "number" ? animation.currentTime : Infinity;
    const timer = window.setTimeout(() => onArrived?.(), Math.max(0, OPEN_AFTER_MS - elapsed));
    return () => window.clearTimeout(timer);
  }, [onArrived]);

  return (
    <div className={styles.title}>
      <h1 className={styles.wordmark} aria-label="memari. studio">
        <span className={styles.word} aria-hidden="true">
          <span className={styles.reveal}>
            <span className={styles.ghost}>memari</span>
            <span className={styles.window}>
              <span className={styles.revealInner}>memari</span>
            </span>
          </span>
          <span className={styles.dotRail}>
            <span className={styles.dotMover}>
              <span className={styles.dot}>.</span>
            </span>
          </span>
        </span>
        <span className={styles.studio} aria-hidden="true">
          studio
        </span>
      </h1>
      <p ref={tagline} className={styles.tagline}>
        a journal as unique as you.
      </p>
    </div>
  );
}
