"use client";

// The title, arriving - asked for 2026-09-22: "first starting with a dot on
// the left side of where the dot will slide to the right revealing 'memari.'
// (all lower case). after studio should fade in same style as header of app.
// and 'a planner as unique as you.' should also fade in below that." The
// line became "a journal as unique as you." on 2026-09-23, its "you."
// handwritten in the editor's blue (scriptFont.ts, .you).
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
// The "you." is written, not faded in (2026-10-06: "trace out the 'you.' in
// the tagline instead of fading it in"): set in its script as SVG text, it is
// uncovered along the path a pen takes through it, a stroke at a time - see
// YOU_STROKES.
//
// Reduced motion: everything fades in, nothing slides or is written.

import { useEffect, useRef, type CSSProperties } from "react";
import { script } from "./scriptFont";
import styles from "./landing.module.css";

/** When the book may start to open: half a second into the tagline's
 *  arrival, as it settles. Matches the tagline's animation-delay. */
const OPEN_AFTER_MS = 2350 + 500;

/**
 * The pen's way through "you." in Cedarville Cursive (scriptFont.ts), traced
 * from its glyphs at 100 px with the text's origin at x 20 and its baseline
 * at y 100: the y and its loop running on into the o and its tail; the u;
 * the full stop. A band YOU_PEN wide along them covers every pixel of the
 * ink (measured: 12 left 0.5% of it bare, 14 none).
 *
 * Three strokes, not one path with pen-lifts in it: a dash can start again
 * at each lift, which would write all three at once. Each is timed by its
 * length (382, 156 and 32), at one pen speed, with a moment's lift between -
 * written from 3.15 s, when the line has settled, as the fade was. `at` and
 * `for` are seconds into the writing when it takes YOU_WRITTEN_IN; the dev
 * panel's "you." written in (bodyWall.ts, --you-seconds) stretches them all
 * alike (.youPen).
 */
const YOU_WRITTEN_IN = 1.41;
const YOU_STROKES: Array<{ d: string; at: number; for: number }> = [
  {
    d: "M33 66 C31 74 26 82 24 89 C23 95 27 96 31 92 C38 87 47 78 53 69 C50 82 46 100 42 118 C40 127 36 135 28 137 C21 138 18 130 19 121 C21 112 31 102 44 95 C55 89 65 84 76 80 C79 70 84 65 90 65 C98 65 103 70 102 77 C101 88 93 98 84 99 C77 100 73 96 73 90 C73 84 77 78 86 74 C92 72 100 73 106 72 C110 71 115 69 119 67.5",
    at: 0,
    for: 0.8,
  },
  { d: "M136 61 C131 70 126 80 124 90 C123 96 125 100 129 99 C137 96 148 84 157 64 C155 72 153 84 153 92 C153 97 157 98 162 96 C170 93 178 88 183 82", at: 0.9, for: 0.33 },
  { d: "M184 96 C186 92 195 91 198 94 C200 98 190 100 185 97", at: 1.31, for: 0.1 },
];
const YOU_PEN = 14;
/** Once written, all of it shown whatever the pen's band covered - so a
 *  fallback face, its letters elsewhere, is never left part hidden. */
const YOU_DONE = 1.45;

export function Wordmark({ onArrived, className }: { onArrived?: () => void; className?: string }) {
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
    <div className={className ? `${styles.title} ${className}` : styles.title}>
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
        a journal as unique as <span className={styles.srOnly}>you.</span>
        {/* The viewBox runs 40 units clear of the text's ink all round: room
            for its shadow - see .you. */}
        <svg
          className={`${styles.you} ${script.className}`}
          viewBox="-25 15 268 170"
          aria-hidden="true"
          focusable="false"
          style={{ "--you-base": YOU_WRITTEN_IN } as CSSProperties}
        >
          <defs>
            <mask id="you-pen" maskUnits="userSpaceOnUse" x="15" y="55" width="188" height="90">
              {YOU_STROKES.map((s) => (
                <path
                  key={s.at}
                  className={styles.youPen}
                  d={s.d}
                  pathLength={1}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={YOU_PEN}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ "--at": `${s.at}s`, "--for": `${s.for}s` } as CSSProperties}
                />
              ))}
              <rect className={styles.youDone} x="15" y="55" width="188" height="90" fill="#fff" style={{ "--at": `${YOU_DONE}s` } as CSSProperties} />
            </mask>
            {/* The line's shadow - 1px down, 12px of blur at the full 36px
                size, the tagline's colour - drawn after the pen's mask, over
                the whole box. The text-shadow the text would inherit is drawn
                cut to the mask's region, a box round it (2026-10-06: "the drop
                shadow of the you. ... looks like its getting clipped by its
                container"), so .you turns that off. */}
            <filter id="you-shadow" filterUnits="userSpaceOnUse" x="-25" y="15" width="268" height="170">
              <feDropShadow dx="0" dy="2.8" stdDeviation="16.7" floodColor="rgb(20, 12, 6)" floodOpacity="0.45" />
            </filter>
          </defs>
          <g filter="url(#you-shadow)">
            <text x="20" y="100" fontSize="100" fill="currentColor" mask="url(#you-pen)">
              you.
            </text>
          </g>
        </svg>
      </p>
    </div>
  );
}
