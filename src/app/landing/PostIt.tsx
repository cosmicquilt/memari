"use client";

// The way down from the hero (Andrew, 2026-10-01): "a realistic post it note
// stickied upside down attached to the section below the hero (crease from
// where adhesive stops visible from the other side which is our view, and on
// the post it note there is a sketch ... an otter in the kilroy was here
// position with a line draw on the post it note that coincide with the border
// of the hero".
//
// Stuck by its sticky strip - at its bottom, the note being upside down - to
// the cream section; the fold where the strip ends shows through; the rest
// lifts off the page and over the hero, curling toward us. On it, a pencil
// line exactly on the hero's bottom edge, the otter peeking over it.
//
// The line lands on the edge at any size because everything here is a share
// of the note: the fold is GAP of the note below the hero's edge, and the
// line is drawn that far above the fold on the lifted part, lengthened by
// its tilt (see LINE_Y). A link to "How it works", so it works without
// script; with script it scrolls there smoothly unless motion is reduced.
//
// The otter is Flow's (handoff/flow/otter-kilroy-prompt.md), three takes of
// it, imported by handoff/flow/otter/import_otters.py: the paper divided out
// to graphite on transparent, cropped to its own pencil line's ends, and
// where that line sits recorded (otters.json) - so the line it was drawn
// with is the one put on the hero's edge.

import otters from "../../../public/landing/otter/otters.json";
import styles from "./landing.module.css";

/** Which otter: 1 glances up and away, 2 lifts a paw, 3 looks straight at
 *  you (chosen 2026-10-01 - the classic Kilroy, both paws over the wall). */
const OTTER = "otter-3" as keyof typeof otters;

/** Shares of the note's side: the sticky strip, and how far below the hero's
 *  edge the fold is. Mirrored in the stylesheet (.postit). */
const STUCK = 0.24;
const GAP = 0.08;
/** How far the free part lifts, degrees - the stylesheet's resting tilt. */
const LIFT = 22;
/** The lifted part's own picture: 100 across, (1 - STUCK) * 100 down; the line
 *  GAP above the fold, as it lies on the tilted part. */
const FREE_H = (1 - STUCK) * 100;
const LINE_Y = FREE_H - (GAP * 100) / Math.cos((LIFT * Math.PI) / 180);

export function PostIt() {
  return (
    <a
      href="#how"
      className={styles.postit}
      aria-label="Scroll down to how Memari works"
      onClick={(e) => {
        const target = document.getElementById("how");
        if (!target) return;
        e.preventDefault();
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
      }}
    >
      <span className={styles.postitShadow} />
      <span className={styles.postitStuck} />
      <span className={styles.postitFree}>
        <svg className={styles.postitDrawing} viewBox={`0 0 100 ${FREE_H}`} aria-hidden="true">
          <OtterDrawing />
        </svg>
      </span>
    </a>
  );
}

/** The otter, as wide as the note, its line on LINE_Y. */
function OtterDrawing() {
  const { width, height, lineY } = otters[OTTER];
  const h = (100 * height) / width;
  return <image href={`/landing/otter/${OTTER}.webp`} x={0} y={LINE_Y - (lineY / height) * h} width={100} height={h} />;
}
