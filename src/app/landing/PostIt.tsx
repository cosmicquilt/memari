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
// The otter is Flow's (handoff/flow/otter-kilroy-prompt.md), four takes of
// it, imported by handoff/flow/otter/import_otters.py: the paper divided out
// to graphite on transparent, cropped to its own pencil line's ends, and
// where that line sits recorded (otters.json) - so the line it was drawn
// with is the one put on the hero's edge. The waving one (otter-4) is not
// shown: Flow's take was drawn unlike the other three, and its arm set on
// otter-3 (handoff/flow/otter/wave_composite.py) went too - "just take out
// the last one ill make a new one in flow eventually" (2026-10-06).

import { useEffect, useRef, useState } from "react";
import otters from "../../../public/landing/otter/otters.json";
import flat from "./postitFlat.json";
import { loadPicture, paintPicture } from "./video/canvasPicture";
import styles from "./landing.module.css";

type Otter = keyof typeof otters;
/** Which otter when (Andrew, 2026-10-01): with the pointer on the note, the
 *  one looking straight at you (otter-3); pressed, the one lifting a paw
 *  (otter-2), then back to otter-3; the pointer gone, the resting ones
 *  again. All are drawn, only one shown, so a change never waits on a
 *  download. */
const AT: Record<"hover" | "press", Otter> = { hover: "otter-3", press: "otter-2" };
/** At rest (2026-10-02): looking at you (otter-3, the hover one) from the
 *  start, now and then glancing up and away (otter-1) and back - each held
 *  for a random while between these, ms. First with the waving one
 *  (otter-4), then "replace the new one with the hover one ... make it swap
 *  back and forth a bit quicker"; then (2026-10-06) "cycle the last
 *  currently unused otter into the idle swap ... make it switch a bit more
 *  often": the wave comes back, briefly, between glances - always from
 *  looking at you, the way a wave would - and every pose is held a little
 *  under two-thirds as long as before. The wave is out again until a new
 *  one is drawn; the quicker swap stays. Not with reduced motion: it stays
 *  on the first. */
const REST: Array<{ otter: Otter; ms: [number, number] }> = [
  { otter: "otter-3", ms: [1600, 3400] },
  { otter: "otter-1", ms: [1300, 2600] },
];
/** The ones drawn: those in use (otter-4, waving, is not, for now). */
const DRAWN = [...new Set<Otter>([...REST.map((r) => r.otter), AT.hover, AT.press])];
/** How long the paw stays up after a press, ms. */
const PRESS_MS = 420;

/** While the page is pinched in, the post-it is shown as flat pictures of
 *  itself (2026-10-02: "flatten the post-it while zoomed if it doesnt affect
 *  visual quality"): its curl is a chain of 3D layers, drawn again at every
 *  step of a zoom - most of what was still left white while zooming. The
 *  pictures are the real post-it drawn at 5x, alone, in each pose it can
 *  show (resting or reached for, with each otter then), by
 *  handoff/flow/otter/bake_postit_flat.mjs; postitFlat.json says where
 *  they sit, in note sides. Bake them again whenever its look changes.
 *  Fetched at the first zoom; shown, once all have loaded, in one canvas -
 *  which a zoom only scales, where pictures are drawn in tiles that can be
 *  missing as they come into view (video/canvasPicture.ts). */
const LIFT_REACHED = 16;

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
  const [rest, setRest] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [flatWanted, setFlatWanted] = useState(false);
  const [flatPics, setFlatPics] = useState<Record<string, HTMLImageElement> | null>(null);
  const flatCanvas = useRef<HTMLCanvasElement>(null);
  const timer = useRef(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const z = vv.scale > 1.001;
      setZoomed(z);
      if (z) setFlatWanted(true);
    };
    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let at = 0;
    let t = 0;
    const next = () => {
      const [lo, hi] = REST[at].ms;
      t = window.setTimeout(() => {
        at = (at + 1) % REST.length;
        setRest(at);
        next();
      }, lo + Math.random() * (hi - lo));
    };
    next();
    return () => window.clearTimeout(t);
  }, []);
  const shown: Otter = pressed ? AT.press : over ? AT.hover : REST[rest].otter;
  const pose = `${over ? LIFT_REACHED : LIFT}-${shown}`;
  const flatOn = zoomed && !!flatPics?.[pose];
  useEffect(() => {
    if (!flatWanted) return;
    let disposed = false;
    void Promise.all(flat.states.map((s) => loadPicture(`/landing/postit/flat-${s}.webp`))).then((pics) => {
      if (!disposed) setFlatPics(Object.fromEntries(flat.states.map((s, i) => [s, pics[i]])));
    });
    return () => {
      disposed = true;
    };
  }, [flatWanted]);
  useEffect(() => {
    const c = flatCanvas.current;
    const pic = flatPics?.[pose];
    if (c && pic) paintPicture(c, pic);
  }, [flatPics, pose]);
  const press = () => {
    setPressed(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPressed(false), PRESS_MS);
  };

  return (
    <a
      href="#how"
      className={flatOn ? `${styles.postit} ${styles.postitZoomed}` : styles.postit}
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
            {DRAWN.map((o) => (
              <OtterDrawing key={o} otter={o} shown={o === shown} />
            ))}
          </svg>
          <Band k={0} />
        </span>
      </span>
      {flatWanted && (
        <canvas
          ref={flatCanvas}
          className={styles.postitFlat}
          style={{
            left: `calc(var(--note) * ${flat.x})`,
            top: `calc(var(--note) * ${flat.y})`,
            width: `calc(var(--note) * ${flat.w})`,
            height: `calc(var(--note) * ${flat.h})`,
            visibility: flatOn ? "visible" : "hidden",
          }}
        />
      )}
    </a>
  );
}

/** The bands of the curl above the otter, each hinged on the last
 *  (.postitBand), as shares of the note - thin, so the twist bends the sides
 *  smoothly; the top one taller, holding the turned-over corner and the
 *  curled one. Their paper's fibre runs on from the band below, the light
 *  ramping across. */
const BANDS = [0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.12];

/**
 * The top left corner curling toward us (2026-10-07: "make only the top
 * left corner of the postit curl a bit towards the camera"; then "i dont
 * want that crease type design ... i want it to curl towards the camera.
 * point of corner still visible"): a square `size` of the note on a side at
 * the top band's corner - reaching down into the bands below it, whose
 * faces are cut to match - cut along `steps` diagonal hinges evenly spaced to
 * the tip, each piece turned about every hinge from the outermost in to its
 * own. The turns grow toward the tip, adding up to `turn` degrees there - a
 * roll, too fine at every hinge to show as a fold, and short enough of a
 * right angle that the corner keeps its point. One light across all of it
 * (each piece shows its part of the same gradient), brighter toward the tip
 * as it lifts into the light, like the bands below. (Four hinges, up to 80
 * degrees and a shade in the bend read as creases and lost the point.)
 */
const CURL = { size: 0.16, steps: 14, turn: 60, light: 0.3 };

function Curl({ backgroundPosition, light }: { backgroundPosition: string; light: number }) {
  const s = CURL.size;
  const n = CURL.steps;
  const hinge = (i: number) => 1 - i / n;
  // The turn at each hinge, growing toward the tip: (i + 1) shares of it.
  const share = (n * (n + 1)) / 2;
  const turn = (i: number) => (CURL.turn * (i + 1)) / share;
  const about = (h: number, deg: number) => {
    const m = `calc(var(--note) * ${((s * h) / 2).toFixed(4)})`;
    const back = `calc(var(--note) * ${((-s * h) / 2).toFixed(4)})`;
    return `translate(${m}, ${m}) rotate3d(1, -1, 0, ${deg.toFixed(2)}deg) translate(${back}, ${back})`;
  };
  // The gradient on the corner's square, the same for every piece: "to top
  // left" runs across the hinges, 50% on the outermost, 100% at the tip.
  const lit = `linear-gradient(to top left, rgba(255,255,255,${light.toFixed(3)}) 50%, rgba(255,255,255,${(light + CURL.light).toFixed(3)}) 100%)`;
  return Array.from({ length: n }, (_, i) => {
    const out = hinge(i);
    const inner = i + 1 < n ? hinge(i + 1) : 0;
    // Out to its hinge and a little past it (3px at the full 168px note,
    // in proportion at any size - the zoom pictures are drawn at 5x), under
    // the piece outside it: at the hinge itself the film showed through the
    // two anti-aliased edges.
    const o = `calc(${(out * 100).toFixed(2)}% + var(--note) * 0.018)`;
    const clipPath = `polygon(${(inner * 100).toFixed(2)}% 0, ${o} 0, 0 ${o}, 0 ${(inner * 100).toFixed(2)}%)`;
    const transform = Array.from({ length: i + 1 }, (_, j) => about(hinge(j), turn(j))).join(" ");
    return (
      <span key={i} className={styles.postitCurl} style={{ backgroundPosition, clipPath, transform }}>
        <span className={styles.postitLight} style={{ background: lit }} />
      </span>
    );
  });
}

/** A band's face, cut where the curled corner reaches into it - `reach`
 *  note sides from its top left along each edge - and, on the top band,
 *  at its turned-over right corner. */
function faceClip(reach: number, top: boolean) {
  const left = reach > 0 ? [`calc(var(--note) * ${reach.toFixed(4)}) 0`] : ["0 0"];
  const right = top ? ["calc(100% - var(--note) * 0.075) 0", "100% calc(var(--note) * 0.075)"] : ["100% 0"];
  const end = reach > 0 ? [`0 calc(var(--note) * ${reach.toFixed(4)})`] : [];
  return `polygon(${[...left, ...right, "100% 100%", "0 100%", ...end].join(", ")})`;
}

function Band({ k }: { k: number }) {
  // Its top, from the top of the lifted part.
  const top = BANDS.slice(k + 1).reduce((a, b) => a + b, 0);
  const done = (i: number) => BANDS.slice(0, i).reduce((a, b) => a + b, 0) / (1 - STUCK - FLAT / 100);
  const light = (i: number) => (0.02 + 0.13 * done(i)).toFixed(3);
  const backgroundPosition = `0 calc(var(--note) * ${-top})`;
  const last = k === BANDS.length - 1;
  return (
    <span className={`${styles.postitSeg} ${styles.postitBand}`} style={{ ["--band" as string]: BANDS[k], ["--curl" as string]: CURL.size }}>
      <span className={`${styles.postitFace} ${last ? styles.postitTurned : ""}`} style={{ backgroundPosition, clipPath: faceClip(CURL.size - top, last) }}>
        <span className={styles.postitLight} style={{ background: `linear-gradient(to top, rgba(255,255,255,${light(k)}), rgba(255,255,255,${light(k + 1)}))` }} />
        {/* Where the curled corner reaches it, or nearly: its shadow. */}
        {CURL.size - top > -0.04 && <span className={styles.postitCurlShadow} style={{ top: `calc(var(--note) * ${-top})` }} />}
      </span>
      {last ? <Curl backgroundPosition={backgroundPosition} light={Number(light(k + 1))} /> : <Band k={k + 1} />}
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
