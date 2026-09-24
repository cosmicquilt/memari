"use client";

// Layouts: the same real spreads the journal turns through, laid out flat.
// Fetched when the section comes near the screen, drawn by the same painter
// the app's own timeline uses.

import { useEffect, useRef, useState } from "react";
import type { LandingSpread } from "./spreads";
import { PagePreview } from "@/app/planner/PagePreview";
import styles from "./landing.module.css";

const NAMES: Record<string, [string, string]> = {
  classic: ["The classic week", "Hours, gratitude, reminders, to-dos"],
  wellness: ["A wellness week", "Mood, habits, meals and plants"],
  focus: ["A focus week", "Big three, brain dump, Eisenhower"],
  training: ["A training week", "Workouts, runs, stretches, sleep"],
  money: ["A money week", "Spending, budget, savings, bills"],
  creative: ["A creative week", "Sketches, prompts, a watchlist"],
};

export function LayoutGallery() {
  const holder = useRef<HTMLDivElement>(null);
  const [spreads, setSpreads] = useState<LandingSpread[] | null>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        fetch("/landing/spreads")
          .then((r) => r.json())
          .then(setSpreads)
          .catch(() => {});
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={holder} className={styles.gallery}>
      {(spreads ?? Object.keys(NAMES).map((key) => ({ key }) as LandingSpread)).map((spread) => (
        <figure key={spread.key} className={styles.spreadCard}>
          <div className={styles.spreadPages}>
            {[0, 1].map((i) => (
              <div key={i} className={styles.spreadPage}>
                {spread.pages && <PagePreview page={{ previewMarks: spread.pages[i].marks, pageWidthPx: 2175, pageHeightPx: 3075 }} />}
              </div>
            ))}
          </div>
          <figcaption>
            <strong>{NAMES[spread.key]?.[0] ?? spread.key}</strong>
            <span>{NAMES[spread.key]?.[1]}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
