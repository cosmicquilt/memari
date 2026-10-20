"use client";

// Featured, in the start dialog: what Memari has made, beside Saved (what
// you have) and Create (start blank). Asked for 2026-10-19. The lists are
// featured.ts's, built on the server; this draws them in the dialog's own
// chrome - its cards, its details column, its sd-* styles (StartDialog).
//
// JOURNALS are the prebuilt planners and PAGES the layouts the gallery
// lists: each one is used from here, making a journal of your own laid out
// like it (POST /app/from/<key>, the gallery's own "Use this"). MODULES have
// nowhere to go until a journal is open, as in Saved, so here they are
// looked at, and placed from the editor's Modules panel. Their pictures are
// the palette's real drawings, so that code is loaded only when Modules is
// first shown (StartFeaturedModules.tsx).

import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { LandingSpread } from "@/app/landing/spreads";
import { loadSet } from "@/app/landing/previewSets";
import { CREAM } from "@/lib/cream";
import { PagePreview } from "./PagePreview";
import type { Featured, FeaturedLayout, FeaturedPlanner } from "./featured";

export type FeaturedSection = "journals" | "pages" | "modules";

const DIM = "rgba(var(--sd-ink-rgb), 0.6)";
const INK = "var(--sd-ink)";

/** A gallery page's size: the layouts are drawn on the bound 7x10 book. */
const PAGE_W = 2175;
const PAGE_H = 3075;

/** The modules' view, imported the first time it is shown: it brings the
 *  module registry and its renderers, which nothing else here needs. */
const FeaturedModules = lazy(() => import("./StartFeaturedModules").then((loaded) => ({ default: loaded.FeaturedModules })));

const KIND_WORD: Record<FeaturedLayout["kind"], string> = { week: "Week", month: "Month", day: "Day", pages: "Pages" };

export function StartFeatured({
  featured,
  section,
  switcher,
  guestLimit,
  leaving,
  onLeave,
  otterCard,
}: {
  featured: Featured;
  section: FeaturedSection;
  switcher: ReactNode;
  /** Set when a guest already has as many journals as a guest may keep. */
  guestLimit: number | null;
  leaving: boolean;
  /** A "Use this" was pressed: the page is on its way to the new journal. */
  onLeave: () => void;
  /** The otter's card, first among the journals. */
  otterCard?: ReactNode;
}) {
  const spreads = useSpreads();
  const use = { guestLimit, leaving, onLeave };

  if (section === "modules") {
    return (
      <Suspense
        fallback={
          <>
            <div className="sd-main">
              {switcher}
              <p style={{ color: DIM, margin: 0 }}>Drawing the modules…</p>
            </div>
            <aside className="sd-details" />
          </>
        }
      >
        <FeaturedModules switcher={switcher} guides={featured.guides} />
      </Suspense>
    );
  }
  if (section === "pages") return <Layouts featured={featured} spreads={spreads} switcher={switcher} use={use} />;
  return <Planners planners={featured.planners} spreads={spreads} switcher={switcher} use={use} otterCard={otterCard} />;
}

type UseProps = { guestLimit: number | null; leaving: boolean; onLeave: () => void };

/** The gallery's pictures, one fetch for every card (previewSets.ts). */
function useSpreads(): Map<string, LandingSpread> | null {
  const [spreads, setSpreads] = useState<Map<string, LandingSpread> | null>(null);
  useEffect(() => {
    let live = true;
    void loadSet("all").then((all) => {
      if (live) setSpreads(new Map(all.map((spread) => [spread.key, spread])));
    });
    return () => {
      live = false;
    };
  }, []);
  return spreads;
}

// --- Journals: the prebuilt planners ----------------------------------------

function Planners({
  planners,
  spreads,
  switcher,
  use,
  otterCard,
}: {
  planners: FeaturedPlanner[];
  spreads: Map<string, LandingSpread> | null;
  switcher: ReactNode;
  use: UseProps;
  otterCard?: ReactNode;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(planners[0]?.key ?? null);
  const selected = planners.find((p) => p.key === selectedKey) ?? null;
  return (
    <>
      <div className="sd-main">
        {switcher}
        <p className="sd-lede">Whole books made for one kind of life: the front pages, and a spread for every month, week or day, all laid out.</p>
        <div className="sd-grid">
          {otterCard}
          {planners.map((planner) => (
            <button
              key={planner.key}
              type="button"
              className="sd-card"
              aria-pressed={planner.key === selectedKey}
              onClick={() => {
                setSelectedKey(planner.key);
                revealDetails();
              }}
            >
              <SpreadThumb spread={spreads?.get(planner.cover) ?? null} />
              <span className="sd-name">{planner.title}</span>
              <span className="sd-meta">{planner.parts.map((part) => part.name).join(" · ")}</span>
            </button>
          ))}
        </div>
      </div>
      <aside className="sd-details" aria-live="polite">
        {selected && (
          <>
            <div style={{ display: "grid", gap: 6 }}>
              <div className="sd-label">Planner</div>
              <h2 className="sd-heading">{selected.title}</h2>
            </div>
            <SpreadThumb spread={spreads?.get(selected.cover) ?? null} height={176} />
            <p className="sd-text">{selected.line}</p>
            <p className="sd-text" style={{ color: DIM }}>
              For {lowerFirst(selected.forWhom)}
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              <div className="sd-label">In the book</div>
              <ul className="sd-parts">
                {selected.parts.map((part) => (
                  <li key={part.key}>
                    <SpreadThumb spread={spreads?.get(part.key) ?? null} height={58} />
                    <span>{part.name}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Makes text={selected.makes} />
            <UseThis spreadKey={selected.key} label="Use this planner" {...use} />
          </>
        )}
      </aside>
    </>
  );
}

// --- Pages: weeks, months, days and pages -----------------------------------

function Layouts({
  featured,
  spreads,
  switcher,
  use,
}: {
  featured: Featured;
  spreads: Map<string, LandingSpread> | null;
  switcher: ReactNode;
  use: UseProps;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(featured.layouts[0]?.key ?? null);
  const selected = featured.layouts.find((l) => l.key === selectedKey) ?? null;
  return (
    <>
      <div className="sd-main">
        {switcher}
        {featured.kinds.map(({ kind, heading }) => {
          const layouts = featured.layouts.filter((layout) => layout.kind === kind);
          if (layouts.length === 0) return null;
          return (
            <section key={kind} className="sd-group" aria-label={heading}>
              <h3 className="sd-label">
                {heading} <span style={{ opacity: 0.7, marginLeft: 6 }}>{layouts.length}</span>
              </h3>
              <div className="sd-grid">
                {layouts.map((layout) => (
                  <button
                    key={layout.key}
                    type="button"
                    className="sd-card"
                    aria-pressed={layout.key === selectedKey}
                    onClick={() => {
                      setSelectedKey(layout.key);
                      revealDetails();
                    }}
                  >
                    <SpreadThumb spread={spreads?.get(layout.key) ?? null} />
                    <span className="sd-name">{layout.title}</span>
                    <span className="sd-meta">{layout.hours ?? KIND_WORD[layout.kind]}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <aside className="sd-details" aria-live="polite">
        {selected && (
          <>
            <div style={{ display: "grid", gap: 6 }}>
              <div className="sd-label">{KIND_WORD[selected.kind]}</div>
              <h2 className="sd-heading">{selected.title}</h2>
            </div>
            <SpreadThumb spread={spreads?.get(selected.key) ?? null} height={176} />
            {selected.kind === "day" && (
              <p className="sd-meta" style={{ margin: "-8px 0 0" }}>
                Shown as two facing days.
              </p>
            )}
            <p className="sd-text">{selected.line}</p>
            {selected.hours && (
              <dl className="sd-facts">
                <dt>Hours</dt>
                <dd>{selected.hours}</dd>
              </dl>
            )}
            {selected.modules.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                <div className="sd-label">On it</div>
                <ul className="sd-list">
                  {selected.modules.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            )}
            <Makes text={selected.makes} />
            <UseThis spreadKey={selected.key} label={selected.action} {...use} />
          </>
        )}
      </aside>
    </>
  );
}

// --- Shared -----------------------------------------------------------------

/** Make a journal of your own laid out like it: the gallery's "Use this",
 *  a POST, so a link preview or a prefetch can never make one. */
function UseThis({
  spreadKey,
  label,
  guestLimit,
  leaving,
  onLeave,
}: {
  spreadKey: string;
  label: string;
} & UseProps) {
  return (
    <form
      method="post"
      action={`/app/from/${encodeURIComponent(spreadKey)}`}
      className="sd-use"
      onSubmit={(event) => {
        const zone = event.currentTarget.elements.namedItem("tz");
        if (zone instanceof HTMLInputElement) zone.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
        onLeave();
      }}
    >
      <input type="hidden" name="tz" defaultValue="" />
      {guestLimit !== null && (
        <p style={{ color: DIM, fontSize: 12, margin: 0, lineHeight: 1.45 }}>
          A guest can keep {guestLimit} journals.{" "}
          <Link href="/sign-in?redirect_url=%2Fapp" style={{ color: INK }}>
            Sign in
          </Link>{" "}
          to make more. The ones you have come with you.
        </p>
      )}
      <div className="sd-actions">
        <button type="submit" className="sd-btn sd-primary" disabled={leaving || guestLimit !== null}>
          {leaving ? "Making it…" : label}
        </button>
      </div>
    </form>
  );
}

/** What "Use this" makes, said plainly (featured.ts). */
function Makes({ text }: { text: string }) {
  return <p style={{ color: DIM, fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>{text} Change anything.</p>;
}

/** On a phone the details come after the list: bring them into view when a
 *  card is chosen, or choosing looks like it did nothing. */
export function revealDetails() {
  if (typeof window === "undefined" || !window.matchMedia("(max-width: 760px)").matches) return;
  document.querySelector(".sd-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** A layout's two pages, each at its own shape, as Saved draws a journal's
 *  cover - blank paper until the pictures arrive, so nothing moves. */
export function SpreadThumb({ spread, height }: { spread: LandingSpread | null; height?: number }) {
  return (
    <span className="sd-thumb" style={height ? { height, padding: 0, background: "none" } : undefined}>
      <span style={{ display: "flex", gap: 1, height: "100%" }}>
        {[0, 1].map((i) => (
          <span key={i} style={{ position: "relative", display: "block", height: "100%", aspectRatio: `${PAGE_W} / ${PAGE_H}`, background: CREAM }}>
            {spread && <PagePreview page={{ previewMarks: spread.pages[i].marks, pageWidthPx: PAGE_W, pageHeightPx: PAGE_H }} />}
          </span>
        ))}
      </span>
    </span>
  );
}

/** "Freelance, gig..." reads as "For freelance, gig...". */
function lowerFirst(text: string): string {
  return text && /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}
