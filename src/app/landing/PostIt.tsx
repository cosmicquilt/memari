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

import { useEffect, useRef, useState } from "react";
import otters from "../../../public/landing/otter/otters.json";
import styles from "./landing.module.css";

type Otter = keyof typeof otters;
/** Which otter when (Andrew, 2026-10-01): at rest the one glancing up and
 *  away (otter-1, "A_single_drawing..."); with the pointer on the note, the
 *  one looking straight at you (otter-3); pressed, the one lifting a paw
 *  (otter-2), then back to otter-3; the pointer gone, otter-1 again. All
 *  three are drawn, only one shown, so a change never waits on a download. */
const AT: Record<"rest" | "hover" | "press", Otter> = { rest: "otter-1", hover: "otter-3", press: "otter-2" };
/** How long the paw stays up after a press, ms. */
const PRESS_MS = 420;

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
/** How much of the lifted part stays flat, from the fold: through the
 *  otter's head (.postitSeg1, 0.36 of the note). */
const FLAT = 36;

export function PostIt() {
  const [over, setOver] = useState(false);
  const [pressed, setPressed] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const shown: Otter = pressed ? AT.press : over ? AT.hover : AT.rest;
  const press = () => {
    setPressed(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPressed(false), PRESS_MS);
  };

  return (
    <a
      href="#how"
      className={styles.postit}
      aria-label="Scroll down to how Memari works"
      onPointerEnter={(e) => e.pointerType === "mouse" && setOver(true)}
      onPointerLeave={() => setOver(false)}
      onFocus={() => setOver(true)}
      onBlur={() => setOver(false)}
      onPointerDown={press}
      onClick={(e) => {
        // A key press (Enter) has no pointer down: the paw goes up here.
        if (e.detail === 0) press();
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
        {/* Flat from the fold through the otter; the bands above it curl
            (see .postitSeg). The drawing is all in the first band: its
            slice of the lifted part, FREE_H - FLAT down to FREE_H. */}
        <span className={`${styles.postitSeg} ${styles.postitSeg1}`}>
          <svg className={styles.postitDrawing} viewBox={`0 ${FREE_H - FLAT} 100 ${FLAT}`} aria-hidden="true">
            {(Object.keys(otters) as Otter[]).map((o) => (
              <OtterDrawing key={o} otter={o} shown={o === shown} />
            ))}
          </svg>
          <Band k={0} />
        </span>
      </span>
    </a>
  );
}

/** The bands of the curl above the otter, each hinged on the last
 *  (.postitBand), as shares of the note - thin, so the twist bends the sides
 *  smoothly; the top one taller, holding the turned-over corner. Their
 *  paper's fibre runs on from the band below, the light ramping across. */
const BANDS = [0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.12];
function Band({ k }: { k: number }) {
  // Its top, from the top of the lifted part.
  const top = BANDS.slice(k + 1).reduce((a, b) => a + b, 0);
  const done = (i: number) => BANDS.slice(0, i).reduce((a, b) => a + b, 0) / (1 - STUCK - FLAT / 100);
  const light = (i: number) => (0.02 + 0.13 * done(i)).toFixed(3);
  const last = k === BANDS.length - 1;
  return (
    <span
      className={`${styles.postitSeg} ${styles.postitBand} ${last ? styles.postitCorner : ""}`}
      style={{ backgroundPosition: `0 calc(var(--note) * ${-top})`, ["--band" as string]: BANDS[k] }}
    >
      <span className={styles.postitLight} style={{ background: `linear-gradient(to top, rgba(255,255,255,${light(k)}), rgba(255,255,255,${light(k + 1)}))` }} />
      {!last && <Band k={k + 1} />}
    </span>
  );
}

/** An otter, as wide as the note, its own line on LINE_Y. */
function OtterDrawing({ otter, shown }: { otter: Otter; shown: boolean }) {
  const { width, height, lineY } = otters[otter];
  const h = (100 * height) / width;
  return (
    <image
      href={`/landing/otter/${otter}.webp`}
      x={0}
      y={LINE_Y - (lineY / height) * h}
      width={100}
      height={h}
      opacity={shown ? 1 : 0}
    />
  );
}
