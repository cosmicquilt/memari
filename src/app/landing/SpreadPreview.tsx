"use client";

// A layout's picture, drawn flat: the Layouts gallery's cards, the landing
// page's few, and the popup (LayoutViewer). Every card on a page shares ONE
// fetch of /landing/layouts (structure only - no calendar, no handwriting),
// started when the first of them comes near the screen.

import { useEffect, useRef, useState } from "react";
import type { LandingSpread } from "./spreads";
import { PagePreview } from "@/app/planner/PagePreview";
import styles from "./landing.module.css";

/** Lighter paper than the page it sits on (2026-10-08: "the spread
 *  previews should be lighter ... not the background"). */
export const PREVIEW_PAPER = "#fffcf6";

/** A spread's two pages, from what was fetched; blank pages until then. */
export function SpreadPages({ spread }: { spread: LandingSpread | null }) {
  return (
    <div className={styles.spreadPages}>
      {[0, 1].map((i) => (
        <div key={i} className={styles.spreadPage} style={{ background: PREVIEW_PAPER }}>
          {spread && <PagePreview page={{ previewMarks: spread.pages[i].marks, pageWidthPx: 2175, pageHeightPx: 3075 }} />}
        </div>
      ))}
    </div>
  );
}

export type PreviewSet = "all" | "home";

const sets = new Map<PreviewSet, Promise<LandingSpread[]>>();
const loadSet = (set: PreviewSet) => {
  let hit = sets.get(set);
  if (!hit) {
    hit = fetch(`/landing/layouts?set=${set}`)
      .then((r) => (r.ok ? (r.json() as Promise<LandingSpread[]>) : []))
      .catch(() => {
        sets.delete(set);
        return [];
      });
    sets.set(set, hit);
  }
  return hit;
};

export function SpreadPreview({ spreadKey, eager = false, set = "all" }: { spreadKey: string; eager?: boolean; set?: PreviewSet }) {
  const holder = useRef<HTMLDivElement>(null);
  const [spread, setSpread] = useState<LandingSpread | null>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    let live = true;
    const load = () => loadSet(set).then((all) => live && setSpread(all.find((s) => s.key === spreadKey) ?? null));
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
  }, [spreadKey, eager, set]);

  return (
    <div ref={holder}>
      <SpreadPages spread={spread} />
    </div>
  );
}
