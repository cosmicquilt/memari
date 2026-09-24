"use client";

// A pen drawing (pen.ts) that writes itself in the first time it comes into
// view: each stroke's outline shows through a mask drawn along its centre
// line, one stroke after another, at a pen's pace. With reduced motion it is
// simply there (.inkLine in the stylesheet). The colour is the element's
// `color`.

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { Drawing } from "./pen";
import styles from "../landing.module.css";

/** Drawing units per second: a quick hand. */
const PACE = 700;

export function Ink({
  drawing,
  className,
  style,
  stretch = false,
  delay = 0,
}: {
  drawing: Drawing;
  className?: string;
  style?: CSSProperties;
  /** Fit the box to the element in both directions (an underline under a
   *  word of any length) rather than keeping its shape. */
  stretch?: boolean;
  /** Seconds to wait after it comes into view. */
  delay?: number;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState(false);
  const id = `ink${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    const el = svg.current;
    // Reduced motion: the stylesheet shows every stroke as it is (.inkLine).
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setDrawn(true);
        io.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const [x, y, w, h] = drawing.box;
  // One stroke after another, each as long as the pen takes to travel it.
  const timing: { start: number; seconds: number }[] = [];
  for (const s of drawing.strokes) {
    const last = timing[timing.length - 1];
    timing.push({ start: last ? last.start + last.seconds + 0.06 : delay, seconds: Math.max(0.14, s.length / PACE) });
  }
  return (
    <svg
      ref={svg}
      viewBox={`${x} ${y} ${w} ${h}`}
      preserveAspectRatio={stretch ? "none" : "xMidYMid meet"}
      className={className}
      style={style}
      overflow="visible"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {drawing.strokes.map((s, i) => {
          const { start, seconds } = timing[i];
          return (
            <mask key={i} id={`${id}-${i}`} maskUnits="userSpaceOnUse" x={x - w} y={y - h} width={w * 3} height={h * 3}>
              <path
                className={styles.inkLine}
                d={s.line}
                fill="none"
                stroke="#fff"
                strokeWidth={drawing.pen * 3}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray="1 2"
                strokeDashoffset={drawn ? 0 : 1.01}
                style={{ transition: drawn ? `stroke-dashoffset ${seconds}s cubic-bezier(0.4, 0, 0.3, 1) ${start}s` : "none" }}
              />
            </mask>
          );
        })}
      </defs>
      {drawing.strokes.map((s, i) => (
        <path key={i} d={s.d} fill="currentColor" mask={`url(#${id}-${i})`} />
      ))}
    </svg>
  );
}
