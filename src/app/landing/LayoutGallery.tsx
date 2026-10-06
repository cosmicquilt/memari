"use client";

// Layouts: the same real spreads the journal turns through, laid out flat -
// one per person (archetypes.ts), each with "Use this week" as in the hero.
// Fetched when the section comes near the screen, drawn by the same painter
// the app's own timeline uses.

import { useEffect, useRef, useState } from "react";
import type { LandingSpread } from "./spreads";
import { PagePreview } from "@/app/planner/PagePreview";
import { heroPeople } from "./archetypes";
import styles from "./landing.module.css";

/** The cards before the spreads arrive: their people, pages blank. */
const PLACEHOLDERS = heroPeople().map(({ key, name, age, archetype, week }) => ({ key, person: { name, age, archetype, week } }) as LandingSpread);

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
          <figcaption>
            <strong>
              {spread.person.archetype}: {spread.person.name}, {spread.person.age}
            </strong>
            <span>{spread.person.week}</span>
            <form
              method="post"
              action={`/app/from/${spread.key}`}
              className={styles.spreadUse}
              // The browser's zone, for a first journal's default (as the
              // start dialog sends it) - read as the form goes, since this
              // card is drawn on the server, which does not know it.
              onSubmit={(e) => {
                const tz = e.currentTarget.elements.namedItem("tz");
                if (tz instanceof HTMLInputElement) tz.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
              }}
            >
              <input type="hidden" name="tz" defaultValue="" />
              <button type="submit">Use {spread.person.name}&rsquo;s week &rarr;</button>
            </form>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
