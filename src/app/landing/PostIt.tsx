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
// THE OTTER IS A STAND-IN, drawn here in code, until the Flow drawing
// (handoff/flow/otter-kilroy-prompt.md) is imported.

import styles from "./landing.module.css";

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
          <Otter lineY={LINE_Y} />
        </svg>
      </span>
    </a>
  );
}

/** A pencil otter over a wall, Kilroy-style: head, ears, eyes, nose and
 *  whiskers above the line, paws curled over it. (Stand-in.) */
function Otter({ lineY: y }: { lineY: number }) {
  const g = { fill: "none", stroke: "#3d3a36", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <g>
      {/* The wall: a hand-drawn line, edge to edge. */}
      <path d={`M3 ${y + 0.4} C 20 ${y - 0.5}, 38 ${y + 0.6}, 52 ${y} S 82 ${y - 0.4}, 97 ${y + 0.3}`} {...g} strokeWidth={1.1} opacity={0.85} />
      {/* Head, peeking over. */}
      <path d={`M33 ${y} C 32 ${y - 15}, 40 ${y - 24}, 50 ${y - 24} C 60 ${y - 24}, 68 ${y - 15}, 67 ${y}`} {...g} strokeWidth={1.2} />
      {/* Ears. */}
      <path d={`M37 ${y - 17} C 34 ${y - 20}, 35 ${y - 24}, 39 ${y - 22}`} {...g} strokeWidth={1} />
      <path d={`M63 ${y - 17} C 66 ${y - 20}, 65 ${y - 24}, 61 ${y - 22}`} {...g} strokeWidth={1} />
      {/* Eyes, looking down at us. */}
      <circle cx={44} cy={y - 12} r={1.9} fill="#2f2c29" />
      <circle cx={56} cy={y - 12} r={1.9} fill="#2f2c29" />
      <circle cx={44.6} cy={y - 12.7} r={0.5} fill="#fff7c2" />
      <circle cx={56.6} cy={y - 12.7} r={0.5} fill="#fff7c2" />
      {/* Muzzle and nose resting on the wall. */}
      <path d={`M43 ${y} C 43 ${y - 6}, 57 ${y - 6}, 57 ${y}`} {...g} strokeWidth={0.9} opacity={0.8} />
      <ellipse cx={50} cy={y - 4.6} rx={2.6} ry={1.7} fill="#2f2c29" />
      {/* Whiskers. */}
      <path d={`M41 ${y - 4} L33 ${y - 6} M41 ${y - 2.6} L32 ${y - 2.8} M59 ${y - 4} L67 ${y - 6} M59 ${y - 2.6} L68 ${y - 2.8}`} {...g} strokeWidth={0.6} opacity={0.75} />
      {/* Paws over the wall, fingers hanging below it. */}
      <path d={`M22 ${y + 0.3} C 22 ${y - 4}, 30 ${y - 4}, 30 ${y + 0.3} M23.5 ${y + 0.3} L23.5 ${y + 3.2} M26 ${y + 0.3} L26 ${y + 3.6} M28.5 ${y + 0.3} L28.5 ${y + 3.2}`} {...g} strokeWidth={1} />
      <path d={`M70 ${y + 0.3} C 70 ${y - 4}, 78 ${y - 4}, 78 ${y + 0.3} M71.5 ${y + 0.3} L71.5 ${y + 3.2} M74 ${y + 0.3} L74 ${y + 3.6} M76.5 ${y + 0.3} L76.5 ${y + 3.2}`} {...g} strokeWidth={1} />
      {/* A little fur, pencil-hatched. */}
      <path d={`M46 ${y - 21} l1 -1.6 M50 ${y - 22} l0.4 -1.8 M54 ${y - 21} l-0.6 -1.6`} {...g} strokeWidth={0.6} opacity={0.6} />
    </g>
  );
}
