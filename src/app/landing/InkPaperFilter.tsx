"use client";

// The paper in the pen drawings (Ink: the underlines, the circled step
// numbers, the margin doodles that write themselves in), 2026-10-21: "the
// things that animate in ... aren't getting the paper effect". They are
// inline SVG strokes shown through masks drawn along them, so neither the
// text's background stacks nor the doodle wall's reach them. This filter
// lays the same steps on them (bodyWall.ts, inkSteps, from the doodles'
// slider): each photo tiled at its size on the page and blended in, each
// wash a mix back toward the drawing's own colour, the gaps' paper in
// darken, then clipped to the drawing - and it runs as they draw in.
//
// The stylesheet points [data-ink] drawings at it while the page has
// data-doodle-paper (landing.module.css). Applied to the outer svg, the
// filter works in the page's pixels, so the grain is the same size on every
// drawing whatever its viewBox. sRGB, so the blends match the CSS ones.

import { useSyncExternalStore, type ReactElement } from "react";
import { BODY_WALL_DEFAULTS, bodyWallSettings, creamRgb, drawingInkSteps, onBodyWallSettings } from "./bodyWall";

export function InkPaperFilter() {
  // the live settings; the saved ones as the server drew the page
  const s = useSyncExternalStore(onBodyWallSettings, bodyWallSettings, () => BODY_WALL_DEFAULTS);
  const paper = `rgb(${creamRgb(s.creamDepth ?? 1).join(", ")})`;
  const primitives: ReactElement[] = [];
  let current = "SourceGraphic";
  for (const [i, step] of drawingInkSteps(s).entries()) {
    const out = `r${i}`;
    if (step.kind === "wash") {
      primitives.push(<feComposite key={i} in={current} in2="SourceGraphic" operator="arithmetic" k2={1 - step.alpha} k3={step.alpha} result={out} />);
    } else if (step.kind === "paper") {
      primitives.push(<feFlood key={`${i}f`} floodColor={paper} result={`f${i}`} />, <feBlend key={i} in={`f${i}`} in2={current} mode="darken" result={out} />);
    } else {
      const [w, h] = step.size.split(" ").map((v) => parseFloat(v));
      primitives.push(
        <feImage key={`${i}i`} href={step.src} x={0} y={0} width={w} height={h} preserveAspectRatio="none" result={`i${i}`} />,
        <feTile key={`${i}t`} in={`i${i}`} result={`t${i}`} />,
        step.blend === "normal" ? (
          <feComposite key={i} in={`t${i}`} in2={current} operator="over" result={out} />
        ) : (
          <feBlend key={i} in={`t${i}`} in2={current} mode={step.blend} result={out} />
        )
      );
    }
    current = out;
  }
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <filter id="ink-paper" x="-50%" y="-100%" width="200%" height="300%" colorInterpolationFilters="sRGB">
        {primitives}
        <feComposite in={current} in2="SourceAlpha" operator="in" />
      </filter>
    </svg>
  );
}
