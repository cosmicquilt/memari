"use client";

// The cream's torn top edge, over the hero's bottom edge (tornEdgeShape.ts says
// why it is shaped as it is). A half each side of the post-it, anchored to
// the note's sides by CSS (--note, .body's): the rip meets the note on its
// line at every width, with nothing measured. Under the post-it (z 6), over
// the hero.
//
// Which rip is the dev panel's (bodyWall.ts, `tornEdge`; 2026-10-06: "add it
// to dev popup panel on landing with the ones i added in the handoff/flow/
// torn edge"):
//   drawn  the deckle, drawn back to front the way torn paper on a desk
//          looks: a wide soft shadow, a tighter one, a contact shadow; the
//          white core where the sheet split, with a fuzz round it; loose
//          fibres; the cream.
//   flow-  one of Flow's photographs of a torn sheet, cut out of its black
//          (handoff/flow/torn edge/bake_torn.mjs, tornFlow.json): laid from
//          its deepest low point at the note outward, mirrored at its ends
//          so it runs on unbroken, at `tornScale` of its pixels; its shadows
//          cast from its own outline, every fibre.
//   none   the straight edge it replaced.
//
// Server-rendered with the saved settings, so the rip is in the first paint;
// in development the panel's changes follow at once.

import { useEffect, useState } from "react";
import { TORN_HEIGHT, TORN_LENGTH, tornHalf } from "./tornEdgeShape";
import { bodyWallSettings, onBodyWallSettings, type BodyWallSettings } from "./bodyWall";
import flow from "./tornFlow.json";
import styles from "./landing.module.css";

const HALVES = { left: tornHalf(5113), right: tornHalf(9241) };

/** The shadows on the desk: how far up the edge each is cast, its blur and
 *  its strength - measured against the film's wood, 2026-10-06. The panel's
 *  `tornShadow` scales the strengths. */
const SHADOWS: Array<[name: string, up: number, blur: number, opacity: number]> = [
  ["far", 3, 9, 0.3],
  ["mid", 1.5, 2.6, 0.42],
  ["contact", 0.6, 0.8, 0.62],
];
/** How far the drawn rip's fibres are pushed about, px. */
const FUZZ = 2.2;
const SHADOW_RGB = "rgb(20, 12, 4)";

type Side = "left" | "right";
type FlowKey = keyof typeof flow;

export function TornEdge() {
  const [s, setS] = useState<BodyWallSettings>(bodyWallSettings());
  useEffect(() => {
    const off = onBodyWallSettings(() => setS(bodyWallSettings()));
    return () => void off();
  }, []);
  if (s.tornEdge === "none") return null;
  if (s.tornEdge === "drawn") {
    return (
      <>
        <DrawnHalf side="left" shadow={s.tornShadow} />
        <DrawnHalf side="right" shadow={s.tornShadow} />
      </>
    );
  }
  return (
    <>
      <FlowHalf side="left" photo={s.tornEdge} scale={s.tornScale} shadow={s.tornShadow} />
      <FlowHalf side="right" photo={s.tornEdge} scale={s.tornScale} shadow={s.tornShadow} />
    </>
  );
}

/** A half's SVG: from the note's side outward, the line at y 0, `height`
 *  above it and `below` under it - just a pixel for the drawn rip, whose
 *  paper below the line is the body's own cream. */
function HalfSvg({ side, height, below = 1, children }: { side: Side; height: number; below?: number; children: React.ReactNode }) {
  return (
    <svg
      className={`${styles.tornEdge} ${side === "left" ? styles.tornEdgeLeft : styles.tornEdgeRight}`}
      style={{ top: -height }}
      width={TORN_LENGTH}
      height={height + below}
      viewBox={`0 ${-height} ${TORN_LENGTH} ${height + below}`}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Every filter over the whole half, in its own px. */
const regionOf = (height: number) => ({ filterUnits: "userSpaceOnUse" as const, x: -20, y: -height - 20, width: TORN_LENGTH + 40, height: height + 80 });
/** Each half is drawn from the note outward; the left one mirrored. */
const outward = (side: Side) => (side === "left" ? `translate(${TORN_LENGTH} 0) scale(-1 1)` : undefined);

function DrawnHalf({ side, shadow }: { side: Side; shadow: number }) {
  const half = HALVES[side];
  const id = (name: string) => `torn-${side}-${name}`;
  const region = regionOf(TORN_HEIGHT);
  return (
    <HalfSvg side={side} height={TORN_HEIGHT}>
      <defs>
        <path id={id("core")} d={half.core} />
        {SHADOWS.map(([name, , blur]) => (
          <filter key={name} id={id(name)} {...region}>
            <feGaussianBlur stdDeviation={blur} />
          </filter>
        ))}
        {/* The core: fibrous at its edge, mottled a little, bright. */}
        <filter id={id("core-f")} {...region}>
          <feTurbulence type="fractalNoise" baseFrequency="1.6 0.9" numOctaves={3} seed={side === "left" ? 31 : 67} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={FUZZ} xChannelSelector="R" yChannelSelector="G" result="d" />
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={side === "left" ? 11 : 53} result="m" />
          <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 0.988  0 0 0 0 0.96  0 0 0 -0.3 1.08" result="mottle" />
          <feComposite in="mottle" in2="d" operator="in" result="c" />
          <feGaussianBlur in="c" stdDeviation={0.3} />
        </filter>
        {/* The fuzz round it: a fainter copy pushed about further. */}
        <filter id={id("halo-f")} {...region}>
          <feTurbulence type="fractalNoise" baseFrequency="2.4 1.2" numOctaves={2} seed={side === "left" ? 17 : 41} />
          <feDisplacementMap in="SourceGraphic" scale={FUZZ * 1.8} xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation={0.45} />
        </filter>
        {/* The cream's own edge, roughened a hair. */}
        <filter id={id("edge-f")} {...region}>
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves={2} seed={side === "left" ? 7 : 23} />
          <feDisplacementMap in="SourceGraphic" scale={FUZZ * 0.45} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g transform={outward(side)}>
        {SHADOWS.map(([name, up, , opacity]) => (
          <use key={name} href={`#${id("core")}`} transform={`translate(0 ${-up})`} fill={SHADOW_RGB} opacity={Math.min(1, opacity * shadow)} filter={`url(#${id(name)})`} />
        ))}
        <use href={`#${id("core")}`} transform="translate(0 -0.7)" fill="#fffdf8" opacity={0.38} filter={`url(#${id("halo-f")})`} />
        <use href={`#${id("core")}`} fill="#fffaf0" filter={`url(#${id("core-f")})`} />
        <path d={half.fibres[0]} fill="none" stroke="rgba(255, 252, 244, 0.42)" strokeWidth={0.3} strokeLinecap="round" />
        <path d={half.fibres[1]} fill="none" stroke="rgba(255, 252, 244, 0.72)" strokeWidth={0.4} strokeLinecap="round" />
        <path d={half.edge} style={{ fill: "var(--paper)" }} filter={`url(#${id("edge-f")})`} />
      </g>
    </HalfSvg>
  );
}

function FlowHalf({ side, photo, scale, shadow }: { side: Side; photo: FlowKey; scale: number; shadow: number }) {
  const p = flow[photo];
  // Each side starts at its own deepest low point (the bake picked two, far
  // apart), the paper's top there on the line.
  const start = p[side];
  const height = Math.ceil(p.reach * scale) + 30;
  // The photo runs on below the line, into the body's cream (the bake leaves
  // its flat cream there clear): cut at the line, its white core and cream
  // stopped in a straight line wherever the tear came low.
  const below = Math.ceil((p.height - start.y) * scale) + 1;
  const id = `torn-${photo}-${side}`;
  // The photo, then itself mirrored, then itself again: it runs on unbroken,
  // each copy meeting the last at the same column. Laid as images, not as a
  // pattern - a pattern's tile is drawn small and scaled up, and lost every
  // fibre (2026-10-06).
  const w = p.width * scale;
  const copies: Array<{ x: number; flipped: boolean }> = [];
  for (let i = 0; (i * p.width - start.x) * scale < TORN_LENGTH; i++) copies.push({ x: (i * p.width - start.x) * scale, flipped: i % 2 === 1 });
  const images = copies.map(({ x, flipped }) => (
    <image
      key={x}
      href={p.src}
      x={flipped ? undefined : x}
      y={-start.y * scale}
      width={w}
      height={p.height * scale}
      preserveAspectRatio="none"
      transform={flipped ? `translate(${x + w} 0) scale(-1 1)` : undefined}
    />
  ));
  return (
    <HalfSvg side={side} height={height} below={below}>
      <defs>
        {/* Its shadows, cast from its own outline - fibres and all - and
            only on the hero: the paper's lower edge, under the line, casts
            none onto the body. */}
        <clipPath id={`${id}-above`}>
          <rect x={-20} y={-height - 20} width={TORN_LENGTH + 40} height={height + 20} />
        </clipPath>
        <filter id={id} {...regionOf(height)}>
          {SHADOWS.map(([name, up, blur, opacity]) => [
            <feGaussianBlur key={`${name}-b`} in="SourceAlpha" stdDeviation={blur} result={`${name}-b`} />,
            <feOffset key={`${name}-o`} in={`${name}-b`} dy={-up} result={`${name}-o`} />,
            <feFlood key={`${name}-c`} floodColor={SHADOW_RGB} floodOpacity={Math.min(1, opacity * shadow)} />,
            <feComposite key={`${name}-s`} in2={`${name}-o`} operator="in" result={`${name}-s`} />,
          ])}
          <feMerge>
            {SHADOWS.map(([name]) => (
              <feMergeNode key={name} in={`${name}-s`} />
            ))}
          </feMerge>
        </filter>
      </defs>
      <g transform={outward(side)}>
        <g clipPath={`url(#${id}-above)`}>
          <g filter={`url(#${id})`}>{images}</g>
        </g>
        {images}
      </g>
    </HalfSvg>
  );
}
