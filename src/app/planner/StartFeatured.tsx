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
import { SpreadZoom, ZoomButton, zoomHolder, type ZoomPart } from "./SpreadZoom";
import { SaveButton } from "./templateSaved";
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

export type UseProps = { guestLimit: number | null; leaving: boolean; onLeave: () => void };

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
  const [zoom, setZoom] = useState<{ planner: FeaturedPlanner; at: number } | null>(null);
  const zoomParts = (planner: FeaturedPlanner): ZoomPart[] =>
    planner.parts.map((part) => ({ key: part.key, level: part.part, spread: spreads?.get(part.key) ?? null }));
  /** The zoom opens on the part the card shows. */
  const openPlanner = (planner: FeaturedPlanner, at?: number) =>
    setZoom({ planner, at: at ?? Math.max(0, planner.parts.findIndex((part) => part.key === planner.cover)) });
  return (
    <>
      <div className="sd-main">
        {switcher}
        <p className="sd-lede">Whole books made for one kind of life: the front pages, and a spread for every month, week or day, all laid out.</p>
        {/* The otter first, then a shelf per group; the planners come in
            shelf order (featured.ts), so a group is a run of them. */}
        {otterCard && <div className="sd-grid">{otterCard}</div>}
        {shelvesOf(planners).map(({ group, planners: shelf }) => (
          <section key={group} className="sd-group" aria-label={group}>
            <h3 className="sd-label">
              {group} <span style={{ opacity: 0.7, marginLeft: 6 }}>{shelf.length}</span>
            </h3>
            <div className="sd-grid">
              {shelf.map((planner) => (
                <div key={planner.key} className={zoomHolder}>
                  <button
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
                  <ZoomButton label={`See ${planner.title} larger`} onClick={() => openPlanner(planner)} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <aside className="sd-details" aria-live="polite">
        {selected && (
          <>
            <div style={{ display: "grid", gap: 6 }}>
              <div className="sd-label">Planner</div>
              <h2 className="sd-heading">{selected.title}</h2>
            </div>
            <div className={zoomHolder}>
              <button type="button" className="sd-zoomable" onClick={() => openPlanner(selected)} aria-label={`See ${selected.title} larger`}>
                <SpreadThumb spread={spreads?.get(selected.cover) ?? null} height={176} />
              </button>
              <ZoomButton label={`See ${selected.title} larger`} always onClick={() => openPlanner(selected)} />
            </div>
            <p className="sd-text">{selected.line}</p>
            <p className="sd-text" style={{ color: DIM }}>
              For {lowerFirst(selected.forWhom)}
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              <div className="sd-label">In the book</div>
              <ul className="sd-parts">
                {selected.parts.map((part, i) => (
                  <li key={part.key}>
                    {/* Each part opens the zoom on itself. */}
                    <button type="button" className="sd-zoomable" onClick={() => openPlanner(selected, i)} aria-label={`See the ${part.name.toLowerCase()} larger`}>
                      <SpreadThumb spread={spreads?.get(part.key) ?? null} height={58} />
                    </button>
                    <span>{part.name}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Makes text={selected.makes} />
            <UseThis
              spreadKey={selected.key}
              label="Use this planner"
              {...use}
              extra={<SaveButton save={{ kind: "planner", key: selected.key }} what={`the ${selected.title} planner`} />}
            />
          </>
        )}
      </aside>
      {zoom && (
        <SpreadZoom
          key={zoom.planner.key}
          title={zoom.planner.title}
          kind="Planner"
          parts={zoomParts(zoom.planner)}
          initial={zoom.at}
          save={{ kind: "planner", key: zoom.planner.key }}
          actions={<ZoomUse spreadKey={zoom.planner.key} label="Use this planner" {...use} />}
          onClose={() => setZoom(null)}
        />
      )}
    </>
  );
}

/** Runs of planners on one shelf, in the order given. */
function shelvesOf(planners: FeaturedPlanner[]): Array<{ group: string; planners: FeaturedPlanner[] }> {
  const shelves: Array<{ group: string; planners: FeaturedPlanner[] }> = [];
  for (const planner of planners) {
    const last = shelves[shelves.length - 1];
    if (last?.group === planner.group) last.planners.push(planner);
    else shelves.push({ group: planner.group, planners: [planner] });
  }
  return shelves;
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
  const [zoom, setZoom] = useState<FeaturedLayout | null>(null);
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
                  <div key={layout.key} className={zoomHolder}>
                    <button
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
                    <ZoomButton label={`See ${layout.title} larger`} onClick={() => setZoom(layout)} />
                  </div>
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
            <div className={zoomHolder}>
              <button type="button" className="sd-zoomable" onClick={() => setZoom(selected)} aria-label={`See ${selected.title} larger`}>
                <SpreadThumb spread={spreads?.get(selected.key) ?? null} height={176} />
              </button>
              <ZoomButton label={`See ${selected.title} larger`} always onClick={() => setZoom(selected)} />
            </div>
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
            <UseThis
              spreadKey={selected.key}
              label={selected.action}
              {...use}
              extra={<SaveButton save={{ kind: "layout", key: selected.key }} what={`the ${selected.title} layout`} />}
            />
          </>
        )}
      </aside>
      {zoom && (
        <SpreadZoom
          key={zoom.key}
          title={zoom.title}
          kind={zoom.hours ? `${KIND_WORD[zoom.kind]} · ${zoom.hours}` : KIND_WORD[zoom.kind]}
          parts={[{ key: zoom.key, level: zoom.kind, spread: spreads?.get(zoom.key) ?? null }]}
          save={{ kind: "layout", key: zoom.key }}
          actions={<ZoomUse spreadKey={zoom.key} label={zoom.action} {...use} />}
          onClose={() => setZoom(null)}
        />
      )}
    </>
  );
}

// --- Saved planners (Saved > Journals) -------------------------------------

/** Planners of ours somebody saved (templateSaving.ts), as cards: in Saved >
 *  Journals, under their own journals. */
export function SavedPlannerCards({
  planners,
  selectedKey,
  onSelect,
}: {
  planners: FeaturedPlanner[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const spreads = useSpreads();
  const [zoom, setZoom] = useState<FeaturedPlanner | null>(null);
  return (
    <section className="sd-group" aria-label="Saved planners">
      <h3 className="sd-label">
        Saved planners <span style={{ opacity: 0.7, marginLeft: 6 }}>{planners.length}</span>
      </h3>
      <div className="sd-grid">
        {planners.map((planner) => (
          <div key={planner.key} className={zoomHolder}>
            <button
              type="button"
              className="sd-card"
              aria-pressed={planner.key === selectedKey}
              onClick={() => {
                onSelect(planner.key);
                revealDetails();
              }}
            >
              <SpreadThumb spread={spreads?.get(planner.cover) ?? null} />
              <span className="sd-name">{planner.title}</span>
              <span className="sd-meta">Planner · {planner.parts.map((part) => part.name).join(" · ")}</span>
            </button>
            <ZoomButton label={`See ${planner.title} larger`} onClick={() => setZoom(planner)} />
          </div>
        ))}
      </div>
      {zoom && (
        <SpreadZoom
          key={zoom.key}
          title={zoom.title}
          kind="Planner"
          parts={zoom.parts.map((part) => ({ key: part.key, level: part.part, spread: spreads?.get(part.key) ?? null }))}
          initial={Math.max(0, zoom.parts.findIndex((part) => part.key === zoom.cover))}
          save={{ kind: "planner", key: zoom.key }}
          onClose={() => setZoom(null)}
        />
      )}
    </section>
  );
}

/** A saved planner, chosen in Saved: what it is, Use this planner, and
 *  Saved - pressed again, it leaves Saved. */
export function SavedPlannerDetails({ planner, guestLimit, leaving, onLeave }: { planner: FeaturedPlanner } & UseProps) {
  const spreads = useSpreads();
  return (
    <>
      <div style={{ display: "grid", gap: 6 }}>
        <div className="sd-label">Saved planner</div>
        <h2 className="sd-heading">{planner.title}</h2>
      </div>
      <SpreadThumb spread={spreads?.get(planner.cover) ?? null} height={176} />
      <p className="sd-text">{planner.line}</p>
      <p className="sd-text" style={{ color: DIM }}>
        For {lowerFirst(planner.forWhom)}
      </p>
      <Makes text={planner.makes} />
      <UseThis
        spreadKey={planner.key}
        label="Use this planner"
        guestLimit={guestLimit}
        leaving={leaving}
        onLeave={onLeave}
        extra={<SaveButton save={{ kind: "planner", key: planner.key }} what={`the ${planner.title} planner`} />}
      />
    </>
  );
}

// --- Shared -----------------------------------------------------------------

/** Use this, in the zoom's header: the same POST, a white pill on the
 *  dark. A guest at their limit is told so in the details, not here. */
function ZoomUse({ spreadKey, label, guestLimit, leaving, onLeave }: { spreadKey: string; label: string } & UseProps) {
  if (guestLimit !== null) return null;
  return (
    <form
      method="post"
      action={`/app/from/${encodeURIComponent(spreadKey)}`}
      onSubmit={(event) => {
        const zone = event.currentTarget.elements.namedItem("tz");
        if (zone instanceof HTMLInputElement) zone.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
        onLeave();
      }}
    >
      <input type="hidden" name="tz" defaultValue="" />
      <button type="submit" className="sd-zoomuse" disabled={leaving}>
        {leaving ? "Making it…" : label}
      </button>
    </form>
  );
}

/** Make a journal of your own laid out like it: the gallery's "Use this",
 *  a POST, so a link preview or a prefetch can never make one. */
function UseThis({
  spreadKey,
  label,
  guestLimit,
  leaving,
  onLeave,
  extra,
}: {
  spreadKey: string;
  label: string;
  /** Beside the button: Save. */
  extra?: ReactNode;
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
        {extra}
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
