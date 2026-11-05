"use client";

// The hero's controls (Andrew, 2026-11-04: "subtle liquid glass play pause
// forward backward buttons expand layout on hero", and "play pause forward
// back should steer layout and writing should still fill out with writing
// even if you pause the layout should just not go to the next").
//
// - Back / forward: the layout before or after the one on the book, shown
//   blank and written in, as one coming on its own is (PageLoop.jump).
// - Pause: the one on the book still writes itself in, then stays; play goes
//   on to the next (PageLoop.setPaused).
// - Expand: the layout on the book in the layouts popup - zoom, Save, Use
//   this week - where it is one of the layouts (the faith and recovery weeks
//   are held back from those, so they have no expand).
//
// Frosted for now: the liquid glass with its red and blue fringing waits on
// the research (handoff/research/gemini-prompt-liquid-glass.md).

import { useState, type RefObject } from "react";
import type { PageLoop } from "./video/pageLoop";
import type { LandingSpread } from "./spreads";
import { useOpenLayout } from "./LayoutViewer";
import styles from "./landing.module.css";

export function HeroControls({ steer, showing }: { steer: RefObject<PageLoop | null>; showing: LandingSpread }) {
  const [paused, setPaused] = useState(false);
  const open = useOpenLayout();
  const toggle = () => {
    const next = !paused;
    steer.current?.setPaused(next);
    setPaused(next);
  };
  return (
    <div className={styles.heroControls} role="group" aria-label="The layouts on the book" data-off-paper="">
      <button type="button" className={styles.heroControl} onClick={() => void steer.current?.jump(-1)} aria-label="The layout before">
        <Icon d="M5.5 6h2.2v12H5.5zM18.5 6v12l-9-6z" />
      </button>
      <button type="button" className={styles.heroControl} onClick={toggle} aria-label={paused ? "Go on to the next layouts" : "Stay on this layout"} aria-pressed={paused}>
        {paused ? <Icon d="M8 5.5v13l11-6.5z" /> : <Icon d="M8.5 6v12M15.5 6v12" stroke />}
      </button>
      <button type="button" className={styles.heroControl} onClick={() => void steer.current?.jump(1)} aria-label="The layout after">
        <Icon d="M16.3 6h2.2v12h-2.2zM5.5 6v12l9-6z" />
      </button>
      {open && showing.openable && (
        <button type="button" className={styles.heroControl} onClick={() => open(showing.key)} aria-label="See this layout larger">
          <Icon d="M14 5h5v5M10 19H5v-5M19 5l-6 6M5 19l6-6" stroke />
        </button>
      )}
    </div>
  );
}

/** A 24-unit icon: filled shapes, or `stroke` lines. */
function Icon({ d, stroke = false }: { d: string; stroke?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d={d}
        fill={stroke ? "none" : "currentColor"}
        stroke="currentColor"
        strokeWidth={stroke ? 2.2 : 1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
