"use client";

// Layouts: the same real spreads the journal turns through, laid out flat -
// weeks, months, facing days and pages of modules (heroSpreads.ts), with no
// captions (Andrew, 2026-10-06: "i dont want the 'use this week' button or
// name and descriptions"). Fetched when the section comes near the screen,
// drawn by the same painter the app's own timeline uses.

import { useEffect, useRef, useState } from "react";
import type { LandingSpread } from "./spreads";
import { PagePreview } from "@/app/planner/PagePreview";
import { heroSpreads } from "./heroSpreads";
import styles from "./landing.module.css";

/** The cards before the spreads arrive: blank pages, one pair a spread. */
const PLACEHOLDERS = heroSpreads().map(({ key }) => ({ key }) as LandingSpread);

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
      {(spreads ?? PLACEHOLDERS).map((spread) => (
        <figure key={spread.key} className={styles.spreadCard}>
          <div className={styles.spreadPages}>
            {[0, 1].map((i) => (
              <div key={i} className={styles.spreadPage}>
                {spread.pages && <PagePreview page={{ previewMarks: spread.pages[i].marks, pageWidthPx: 2175, pageHeightPx: 3075 }} />}
              </div>
            ))}
          </div>
        </figure>
      ))}
    </div>
  );
}
