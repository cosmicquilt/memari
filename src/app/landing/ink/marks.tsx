// The marks the landing page is annotated with, in the hand and blue of the
// tagline's "you." (Andrew, 2026-09-23): words written by hand, words
// underlined or circled in pen, and doodles in the margins. Server
// components - the strokes are worked out here and Ink only draws them in.

import type { CSSProperties, ReactNode } from "react";
import { Ink } from "./Ink";
import { arrowBetween, arrowDrawing, circleDrawing, doodleDrawing, underlineDrawing, type DoodleKind } from "./pen";
import styles from "../landing.module.css";

/** Words in the handwriting face, in the editor's blue. data-paper-inline:
 *  the paper in the text (landing.module.css) may take the heading round it
 *  whole, and the words themselves. */
export function Hand({ children }: { children: ReactNode }) {
  return (
    <span className={styles.hand} data-paper-inline="">
      {children}
    </span>
  );
}

/** A word underlined in pen - `twice` for emphasis. */
export function Underlined({ children, seed, twice = false, delay = 0.35 }: { children: ReactNode; seed: number; twice?: boolean; delay?: number }) {
  return (
    <span className={styles.marked} data-paper-inline="">
      {children}
      <Ink drawing={underlineDrawing(seed, twice)} className={twice ? styles.underlineTwice : styles.underline} stretch delay={delay} />
    </span>
  );
}

/** A word with a loose loop drawn round it. */
export function Circled({ children, seed, delay = 0.3 }: { children: ReactNode; seed: number; delay?: number }) {
  return (
    <span className={styles.marked} data-paper-inline="">
      {children}
      <Ink drawing={circleDrawing(seed)} className={styles.circle} stretch delay={delay} />
    </span>
  );
}

/** A doodle in the margin: placed by `style` (position, size, turn).
 *  `outer`: out past the text column, shown only on wide screens. */
export function Doodle({
  kind,
  seed,
  style,
  delay = 0.2,
  faint = true,
  outer = false,
}: {
  kind: DoodleKind;
  seed: number;
  style: CSSProperties;
  delay?: number;
  faint?: boolean;
  outer?: boolean;
}) {
  const className = [faint ? styles.doodle : styles.doodleBold, outer ? styles.doodleOuter : ""].join(" ");
  return <Ink drawing={doodleDrawing(kind, seed)} className={className} style={style} delay={delay} />;
}

/** A hand-drawn arrow, from top left to bottom right; turn or flip it with `style`. */
export function Arrow({ seed, style, delay = 0.2 }: { seed: number; style: CSSProperties; delay?: number }) {
  return <Ink drawing={arrowDrawing(seed)} className={styles.arrow} style={style} delay={delay} />;
}

/** A hand-drawn arrow between two points of a `frame` (the hero's, in its
 *  pixels), leaving its start heading `leave` and arriving heading `arrive`
 *  (radians, y down - see arrowBetween); placed on the frame in %, as the
 *  hero's notes are. */
export function ArrowBetween({
  seed,
  from,
  to,
  leave,
  arrive,
  frame,
  delay = 0.2,
}: {
  seed: number;
  from: [number, number];
  to: [number, number];
  leave: number;
  arrive: number;
  frame: { width: number; height: number };
  delay?: number;
}) {
  const drawn = arrowBetween(seed, from, to, leave, arrive);
  const [x, y, w] = drawn.box;
  const style = { left: `${(x / frame.width) * 100}%`, top: `${(y / frame.height) * 100}%`, width: `${(w / frame.width) * 100}%` };
  return <Ink drawing={drawn} className={styles.arrow} style={style} delay={delay} />;
}
