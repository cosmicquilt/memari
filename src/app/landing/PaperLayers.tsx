// The papers under the cream, any number at once (2026-10-14: "could you
// turn each to a type of slider so i can combine more of them"): each a grey
// picture blended hard-light over what is under it - darker than mid-grey
// darkens, lighter lightens, mid-grey leaves it - at its slider's opacity
// (bodyWall.ts PAPER_LAYERS; baked by scratchpad paper_ink_bake.py).
//
// Laid straight into the sheet they texture (.body on the landing page,
// .page on the site's others), never in a wrapper: a wrapper below the
// content would be a stacking context of its own, and a blend only reaches
// the backdrop inside its stacking context - they would blend with nothing.
// The sheet is isolated, so z-index -1 puts them over its cream and under
// everything on it. They never move, so the blend is worked out once, not
// while the collage drifts over them.

import { PAPER_LAYERS } from "./bodyWall";
import styles from "./landing.module.css";

export function PaperLayers() {
  return PAPER_LAYERS.map((p) => (
    <span
      key={p.id}
      aria-hidden="true"
      className={styles.paperLayer}
      // --wall-shown: 0 until the doodle wall is laid out (BodyDoodles)
      style={{ backgroundImage: `var(--paper-${p.id}-img, none)`, backgroundSize: p.size, opacity: `calc(var(--paper-${p.id}, 0) * var(--wall-shown, 1))` }}
    />
  ));
}
