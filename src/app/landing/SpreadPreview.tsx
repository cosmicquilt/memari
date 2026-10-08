"use client";

// One of the landing page's spreads, drawn flat - the Layouts pages' picture
// of a week. Every preview on a page shares ONE fetch of /landing/spreads
// (the landing gallery's, cached an hour), started when the first of them
// comes near the screen.

import { useEffect, useRef, useState } from "react";
import type { LandingSpread } from "./spreads";
import { PagePreview } from "@/app/planner/PagePreview";
import styles from "./landing.module.css";

let spreads: Promise<LandingSpread[]> | null = null;
const loadSpreads = () =>
  (spreads ??= fetch("/landing/spreads")
    .then((r) => (r.ok ? (r.json() as Promise<LandingSpread[]>) : []))
    .catch(() => {
      spreads = null;
      return [];
    }));

export function SpreadPreview({ spreadKey, eager = false }: { spreadKey: string; eager?: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  const [spread, setSpread] = useState<LandingSpread | null>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    let live = true;
    const load = () => loadSpreads().then((all) => live && setSpread(all.find((s) => s.key === spreadKey) ?? null));
    if (eager) {
      void load();
      return () => {
        live = false;
      };
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        void load();
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [spreadKey, eager]);

  return (
    <div ref={holder} className={styles.spreadPages}>
      {[0, 1].map((i) => (
        // Lighter paper than the page it sits on (2026-10-08: "the spread
        // previews should be lighter ... not the background").
        <div key={i} className={styles.spreadPage} style={{ background: "#fffcf6" }}>
          {spread && <PagePreview page={{ previewMarks: spread.pages[i].marks, pageWidthPx: 2175, pageHeightPx: 3075 }} />}
        </div>
      ))}
    </div>
  );
}
