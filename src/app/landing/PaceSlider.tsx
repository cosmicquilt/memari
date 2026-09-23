"use client";

// A slider for how fast the journal's handwriting goes, from instant to the
// pace it was built at (see pace.ts). For tuning it by eye: shown in
// development, and on the live site only with ?tune in the address.
//
// Its travel is quadratic in the pace, so the middle of the slider is the
// useful middle - four times faster - rather than a crawl near "original".

import { useSyncExternalStore } from "react";
import { getPace, onPace, setPace, DEFAULT_PACE } from "./pace";
import styles from "./landing.module.css";

const noop = () => () => {};
const wanted = () => process.env.NODE_ENV !== "production" || new URLSearchParams(window.location.search).has("tune");

export function PaceSlider() {
  const show = useSyncExternalStore(noop, wanted, () => false);
  const pace = useSyncExternalStore(onPace, getPace, () => DEFAULT_PACE);
  if (!show) return null;
  const position = Math.sqrt(pace);
  const reading = pace <= 0.0001 ? "Instant" : pace >= 0.999 ? "Original speed" : `${(1 / pace).toFixed(1)}× faster`;
  return (
    <div className={styles.paceSlider}>
      <label htmlFor="writing-pace" className={styles.paceLabel}>
        Writing speed <span className={styles.paceReading}>{reading}</span>
      </label>
      <input
        id="writing-pace"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={position}
        onChange={(event) => setPace(Number(event.target.value) ** 2)}
        aria-valuetext={reading}
      />
      <div className={styles.paceEnds} aria-hidden="true">
        <span>Instant</span>
        <span>Original</span>
      </div>
    </div>
  );
}
