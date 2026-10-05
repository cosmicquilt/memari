"use client";

// THE MODULE BROWSER (2026-10-05, the palette revamp). Every module, by
// group, in a pop-up over the editor: groups down the left, sections inside
// each, larger previews, and a pane with the chosen module large, what it
// is for (moduleDescriptions.ts) and what it prints (paletteGroups.ts).
// Drafted at true size on the palette mockup and built as drawn
// (https://claude.ai/artifact/RoEE2EzZ79tGymWVTXkuvL); the drawer keeps
// what you reach for, the catalogue lives here.
//
// PICKING A MODULE UP, as Andrew put it: "grab hand once you grab for a
// fraction of a second or move the pop disappears and you can drag it to
// where you want with the current live drag". So a card is a palette
// draggable like the drawer's (`palette:browse:<slug>`), feeding the same
// phantom and drop; the browser steps aside the moment it is held for
// HOLD_MS or carried, and the editor draws the module under the pointer
// until it reaches a page (NativePlannerEditor, the floating card). Let go
// anywhere but a page, or press Escape, and the browser is back where it
// was; a drop that lands closes it.

import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { ModulePreview } from "./ModulePreview";
import { CREAM, onCream } from "@/lib/cream";
import { CONTROL_RADIUS, PANEL_RADIUS } from "./editorStyle";
import { describeModule } from "@/lib/moduleDescriptions";
import {
  CADENCE_LABELS,
  GROUP_BLURBS,
  GROUPS,
  PALETTE_INFO,
  PALETTE_INFO_BY_SLUG,
  sectionsOf,
  whatItPrints,
  type PaletteModuleInfo,
} from "@/lib/paletteGroups";
import type { PageGrid } from "@/lib/grid";
import type { Cadence, Category } from "@/lib/moduleRegistry";
import type { SavedModuleCard } from "./savedItems";

/** A catalogue module's card here: `palette:browse:<slug>`. */
export const BROWSE_PALETTE_PREFIX = "palette:browse:";
/** A saved module's card here: `palette:browse-saved:<id>`. */
export const BROWSE_SAVED_PREFIX = "palette:browse-saved:";
/** Held this long, a card lifts and the browser steps aside. */
export const BROWSE_HOLD_MS = 180;

const INK = "#1a1a1a";
const MUTED = "#6b6b6b";
const ACCENT = "#4a5cff";
const FILL = onCream(0xf6);
const EDGE = onCream(0xe4);

type View = { kind: "group"; group: Category } | { kind: "recent" } | { kind: "saved" };
type Fits = "all" | Cadence;
const FITS: Array<[Fits, string]> = [
  ["all", "All pages"],
  ["day", "Daily"],
  ["week", "Weekly"],
  ["month", "Monthly"],
  ["journal", "Beginning & end"],
];

/** One card's worth: a catalogue module, or a saved one. */
type Entry = {
  key: string;
  dragId: string;
  slug: string;
  name: string;
  /** Under the name: its page, or "Saved". */
  note: string;
  previewProps: Record<string, unknown>;
  info: PaletteModuleInfo | null;
  saved: SavedModuleCard | null;
};

function catalogueEntry(m: PaletteModuleInfo): Entry {
  return {
    key: m.slug,
    dragId: `${BROWSE_PALETTE_PREFIX}${m.slug}`,
    slug: m.slug,
    name: m.name,
    note: m.cadence ? CADENCE_LABELS[m.cadence] : "Any page",
    previewProps: m.previewProps,
    info: m,
    saved: null,
  };
}
function savedEntry(s: SavedModuleCard): Entry {
  return {
    key: `saved:${s.id}`,
    dragId: `${BROWSE_SAVED_PREFIX}${s.id}`,
    slug: s.slug,
    name: s.name,
    note: `Saved · ${s.kind}`,
    previewProps: s.propValues,
    info: PALETTE_INFO_BY_SLUG.get(s.slug) ?? null,
    saved: s,
  };
}

const BrowserCard = memo(function BrowserCard({
  entry,
  selected,
  onSelect,
  onPress,
  pageGrid,
  fontFamily,
  draw,
  previewMaxPx,
}: {
  entry: Entry;
  selected: boolean;
  onSelect: (key: string) => void;
  onPress: () => void;
  pageGrid: PageGrid;
  fontFamily: string;
  draw: boolean;
  previewMaxPx: number;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: entry.dragId });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // Which module this card places - and, for a finger, that a hold
      // lifts it (PaletteTouchSensor reads this).
      data-browse-slug={entry.slug}
      data-browse-drag-id={entry.dragId}
      aria-pressed={selected}
      aria-label={`${entry.name}. Select to read about it; hold or drag to place it.`}
      onPointerDown={(event) => {
        if (event.button === 0) onPress();
        listeners?.onPointerDown?.(event);
      }}
      onClick={() => onSelect(entry.key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(entry.key);
        }
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 7,
        minWidth: 0,
        cursor: "grab",
        userSelect: "none",
        touchAction: "pan-y",
        WebkitTouchCallout: "none",
        outline: "none",
      }}
    >
      <div
        style={{
          border: `1px solid ${EDGE}`,
          borderRadius: 1,
          outline: selected ? `2px solid ${ACCENT}` : "none",
          outlineOffset: 2,
        }}
      >
        <ModulePreview
          slug={entry.slug}
          previewProps={entry.previewProps}
          pageGrid={pageGrid}
          fontFamily={fontFamily}
          draw={draw}
          initialWidthPx={200}
          maxHeightPx={previewMaxPx}
          instanceKey={entry.dragId}
        />
      </div>
      <span style={{ fontSize: 13.5, fontWeight: 500, color: INK }}>{entry.name}</span>
      <span style={{ fontSize: 12, color: MUTED, marginTop: -4 }}>{entry.note}</span>
    </div>
  );
});

export function ModuleBrowser({
  open,
  handoff,
  lifted,
  onClose,
  onLift,
  pageGrid,
  fontFamily,
  savedModules,
  recentSlugs,
}: {
  open: boolean;
  /** A card is being carried out: the browser steps aside but stays. */
  handoff: boolean;
  /** A card is held, not yet moved: see-through, still answering clicks. */
  lifted: boolean;
  onClose: () => void;
  /** A card held past BROWSE_HOLD_MS (true), or let go of (false). */
  onLift: (lifted: boolean) => void;
  pageGrid: PageGrid;
  fontFamily: string;
  savedModules: SavedModuleCard[];
  recentSlugs: string[];
}) {
  // Where the browser was left - it reopens there.
  const [view, setView] = useState<View>({ kind: "group", group: "Basics" });
  const [query, setQuery] = useState("");
  const [fits, setFits] = useState<Fits>("all");
  const [cols, setCols] = useState<2 | 3>(3);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Escape closes - unless a card is in hand, when Escape is the drag's.
  useEffect(() => {
    if (!open || handoff) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handoff, onClose]);
  useEffect(() => {
    if (open) searchRef.current?.focus({ preventScroll: true });
  }, [open]);

  // HOLD TO LIFT. A press starts the clock; held past BROWSE_HOLD_MS the
  // browser goes see-through so the page shows, and the drag itself starts
  // with the first few pixels of movement (the pointer sensor's own rule).
  // Letting go before moving brings it back - and the click selects.
  const holdTimer = useRef<number | null>(null);
  useEffect(() => {
    const release = () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
      onLift(false);
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [onLift]);
  const onPress = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      onLift(true);
    }, BROWSE_HOLD_MS);
  };

  const q = query.trim().toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(q);
  const fitsPage = (cadence: Cadence | null) => fits === "all" || cadence === null || cadence === fits;

  // What the main column shows, as titled sections of cards.
  const { title, blurb, sections } = (() => {
    if (q) {
      const found = PALETTE_INFO.filter(
        (m) => fitsPage(m.cadence) && (matches(m.name) || matches(m.label) || matches(m.slug) || matches(m.group) || matches(m.section))
      );
      const savedFound = savedModules.filter((s) => matches(s.name) || matches(s.kind));
      const byGroup = GROUPS.map((group) => ({
        section: group,
        entries: found.filter((m) => m.group === group).sort((a, b) => a.order - b.order).map(catalogueEntry),
      })).filter((s) => s.entries.length > 0);
      return {
        title: `Results for “${query.trim()}”`,
        blurb: `${found.length + savedFound.length} module${found.length + savedFound.length === 1 ? "" : "s"} match.`,
        sections: [...(savedFound.length ? [{ section: "Saved", entries: savedFound.map(savedEntry) }] : []), ...byGroup],
      };
    }
    if (view.kind === "recent") {
      const entries = recentSlugs.flatMap((slug) => {
        const m = PALETTE_INFO_BY_SLUG.get(slug);
        return m && fitsPage(m.cadence) ? [catalogueEntry(m)] : [];
      });
      return { title: "Recently used", blurb: "The modules you placed last, in this browser.", sections: entries.length ? [{ section: "", entries }] : [] };
    }
    if (view.kind === "saved") {
      const entries = savedModules.map(savedEntry);
      return {
        title: "Saved",
        blurb: "Modules you saved, with their own settings. Linked: change one and every page it is on follows.",
        sections: entries.length ? [{ section: "", entries }] : [],
      };
    }
    const members = PALETTE_INFO.filter((m) => m.group === view.group && fitsPage(m.cadence));
    return {
      title: view.group,
      blurb: GROUP_BLURBS[view.group],
      sections: sectionsOf(members).map((s) => ({ section: s.section, entries: s.modules.map(catalogueEntry) })),
    };
  })();

  const shown = sections.flatMap((s) => s.entries);
  const selected = shown.find((e) => e.key === selectedKey) ?? shown[0] ?? null;

  const pick = (next: View) => {
    setView(next);
    setQuery("");
    setSelectedKey(null);
  };

  if (!open) return null;
  const draw = open;
  const previewMax = cols === 3 ? 250 : 380;

  const railButton = (label: string, count: number, current: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-current={current}
      onClick={onClick}
      style={{
        all: "unset",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        height: 32,
        padding: "0 10px",
        borderRadius: 6,
        fontSize: 14,
        fontWeight: current ? 600 : 400,
        color: INK,
        background: current ? EDGE : "transparent",
        cursor: "pointer",
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: 12, color: MUTED, fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>{count}</span>
    </button>
  );
  const segButton = (label: string, pressed: boolean, onClick: () => void, aria?: string, children?: ReactNode) => (
    <button
      key={label}
      type="button"
      aria-pressed={pressed}
      aria-label={aria}
      onClick={onClick}
      style={{
        all: "unset",
        fontSize: 12.5,
        padding: children ? "5px 8px" : "5px 10px",
        borderRadius: 6,
        cursor: "pointer",
        color: pressed ? INK : "#3d382f",
        fontWeight: pressed ? 600 : 400,
        background: pressed ? CREAM : "transparent",
        boxShadow: pressed ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
        display: "grid",
        placeItems: "center",
      }}
    >
      {children ?? label}
    </button>
  );
  const labelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "rgba(26, 26, 26, 0.6)",
    display: "flex",
    justifyContent: "space-between",
  };

  // Stepping aside: see-through while held (clicks still land, so a slow
  // click selects), gone from the pointer's way once a card is carried.
  const away = handoff || lifted;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="All modules"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "grid",
        placeItems: "center",
        padding: 32,
        opacity: away ? 0 : 1,
        pointerEvents: handoff ? "none" : "auto",
        transition: away ? "opacity 110ms ease" : "opacity 160ms ease",
      }}
    >
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(28, 22, 12, 0.36)" }} />
      <div
        style={{
          position: "relative",
          width: "min(1280px, 100%)",
          height: "min(744px, 100%)",
          display: "grid",
          gridTemplateColumns: "224px minmax(0, 1fr) 344px",
          // One row, the browser's height: an auto row grows to fit its
          // content, and then nothing inside scrolls (found on the mockup).
          gridTemplateRows: "minmax(0, 1fr)",
          background: CREAM,
          borderRadius: PANEL_RADIUS,
          overflow: "hidden",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.06), 0 28px 80px rgba(30, 22, 8, 0.34)",
          color: INK,
          scrollbarColor: `${onCream(0xd2)} transparent`,
        }}
      >
        {/* The groups. */}
        <nav aria-label="Module groups" style={{ minHeight: 0, overflowY: "auto", background: FILL, padding: "18px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 15, fontWeight: 600, padding: "0 8px 12px" }}>Modules</div>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedKey(null);
            }}
            placeholder={`Search ${PALETTE_INFO.length} modules`}
            aria-label="Search all modules"
            style={{
              boxSizing: "border-box",
              width: "100%",
              height: 34,
              marginBottom: 14,
              padding: "0 12px",
              border: "none",
              borderRadius: 8,
              background: CREAM,
              fontFamily: "inherit",
              fontSize: 14,
              color: INK,
              outline: "none",
            }}
          />
          {railButton("Recently used", recentSlugs.length, !q && view.kind === "recent", () => pick({ kind: "recent" }))}
          {railButton("Saved", savedModules.length, !q && view.kind === "saved", () => pick({ kind: "saved" }))}
          <div style={{ height: 14, flex: "none" }} />
          {GROUPS.map((group) =>
            railButton(
              group,
              PALETTE_INFO.filter((m) => m.group === group).length,
              !q && view.kind === "group" && view.group === group,
              () => pick({ kind: "group", group })
            )
          )}
        </nav>

        {/* The modules. */}
        <div style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "20px 24px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
            <h2 style={{ margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h2>
            <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>{blurb}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <div role="group" aria-label="Which pages" style={{ display: "inline-flex", background: FILL, borderRadius: 8, padding: 3, gap: 2 }}>
                {FITS.map(([key, label]) => segButton(label, fits === key, () => setFits(key)))}
              </div>
              <div role="group" aria-label="Preview size" style={{ display: "inline-flex", background: FILL, borderRadius: 8, padding: 3, gap: 2, marginLeft: "auto" }}>
                {segButton("small", cols === 3, () => setCols(3), "Smaller previews", (
                  <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
                    <g fill="currentColor">
                      <rect x="0" y="0" width="4.4" height="6" rx=".8" />
                      <rect x="5.8" y="0" width="4.4" height="6" rx=".8" />
                      <rect x="11.6" y="0" width="4.4" height="6" rx=".8" />
                      <rect x="0" y="8" width="4.4" height="6" rx=".8" />
                      <rect x="5.8" y="8" width="4.4" height="6" rx=".8" />
                      <rect x="11.6" y="8" width="4.4" height="6" rx=".8" />
                    </g>
                  </svg>
                ))}
                {segButton("large", cols === 2, () => setCols(2), "Larger previews", (
                  <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
                    <g fill="currentColor">
                      <rect x="0" y="0" width="7.2" height="14" rx=".9" />
                      <rect x="8.8" y="0" width="7.2" height="14" rx=".9" />
                    </g>
                  </svg>
                ))}
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 24px 32px", display: "flex", flexDirection: "column", gap: 28 }}>
            {sections.length === 0 && (
              <p style={{ margin: 0, padding: "24px 0", fontSize: 14, color: MUTED, maxWidth: "46ch", lineHeight: 1.5 }}>
                {view.kind === "saved" && !q
                  ? "Nothing saved yet. Save a module from its settings and it appears here, ready to drag."
                  : view.kind === "recent" && !q
                    ? "Nothing placed yet. The modules you add appear here."
                    : `Nothing here${fits === "all" ? "" : ` for ${FITS.find((f) => f[0] === fits)![1].toLowerCase()} pages`}. Try All pages, or another word.`}
              </p>
            )}
            {sections.map((section) => (
              <section key={section.section || "all"} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {section.section && (
                  <div style={labelStyle}>
                    <span>{section.section}</span>
                    <span>{section.entries.length}</span>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "22px 18px" }}>
                  {section.entries.map((entry) => (
                    <BrowserCard
                      key={entry.key}
                      entry={entry}
                      selected={selected?.key === entry.key}
                      onSelect={setSelectedKey}
                      onPress={onPress}
                      pageGrid={pageGrid}
                      fontFamily={fontFamily}
                      draw={draw}
                      previewMaxPx={previewMax}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* The chosen module, large. */}
        <aside aria-live="polite" style={{ minHeight: 0, overflowY: "auto", borderLeft: `1px solid ${EDGE}`, padding: "54px 22px 0", display: "flex", flexDirection: "column", gap: 14 }}>
          {selected && (
            <>
              <div style={{ border: `1px solid ${EDGE}`, maxHeight: 270, overflowY: "auto", flex: "none" }}>
                <ModulePreview
                  slug={selected.slug}
                  previewProps={selected.previewProps}
                  pageGrid={pageGrid}
                  fontFamily={fontFamily}
                  draw={draw}
                  initialWidthPx={298}
                  instanceKey={`detail-${selected.dragId}`}
                />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>{selected.name}</div>
                <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>
                  {selected.saved
                    ? `Saved · ${selected.saved.kind}`
                    : `${selected.info?.cadence ? `${CADENCE_LABELS[selected.info.cadence]} pages` : "Any page"} · ${selected.info?.group} › ${selected.info?.section}`}
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
                {selected.saved
                  ? `Your saved ${selected.saved.kind.toLowerCase()}, with its own settings. Linked: change it on one page and every page it is on follows.`
                  : (describeModule(selected.slug) ?? "")}
              </p>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: MUTED }}>
                <b style={{ color: INK, fontWeight: 600 }}>On the page.</b> {whatItPrints(selected.slug, selected.previewProps)}
              </p>
              <div
                style={{
                  marginTop: "auto",
                  position: "sticky",
                  bottom: 0,
                  background: CREAM,
                  padding: "12px 0 18px",
                  boxShadow: "0 -10px 12px -10px rgba(60, 45, 20, 0.18)",
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12.5, lineHeight: 1.45, color: "#4b453a", background: FILL, borderRadius: 10, padding: "10px 12px" }}>
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flex: "none" }}>
                    <path
                      d="M6.2 8.6V3.4a1.2 1.2 0 0 1 2.4 0v4.4m0-.6V2.6a1.2 1.2 0 0 1 2.4 0v4.8m0-.4V3.8a1.2 1.2 0 0 1 2.4 0v5.6c0 3.2-1.9 6.4-5 6.4-2.3 0-3.4-1.2-4.6-3.2L2.6 9.8a1.1 1.1 0 0 1 1.7-1.3l1.9 1.9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Hold it for a moment, or start moving it, and drag it onto your page.</span>
                </div>
              </div>
            </>
          )}
        </aside>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close the browser"
          style={{
            all: "unset",
            position: "absolute",
            top: 14,
            right: 14,
            width: 30,
            height: 30,
            borderRadius: 15,
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            color: "#4b453a",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** The browser's module under the pointer while it is carried to a page -
 *  the browser itself has stepped aside, and a card cannot leave its own
 *  scrolling grid. Gone once the page's own preview (the phantom) takes
 *  over. */
export function FloatingModule({
  slug,
  previewProps,
  pageGrid,
  fontFamily,
  left,
  top,
  width,
}: {
  slug: string;
  previewProps: Record<string, unknown>;
  pageGrid: PageGrid;
  fontFamily: string;
  left: number;
  top: number;
  width: number;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left,
        top,
        width,
        zIndex: 80,
        pointerEvents: "none",
        boxShadow: "0 12px 28px rgba(0,0,0,0.24)",
        opacity: 0.94,
        borderRadius: CONTROL_RADIUS,
        overflow: "hidden",
      }}
    >
      <ModulePreview slug={slug} previewProps={previewProps} pageGrid={pageGrid} fontFamily={fontFamily} draw initialWidthPx={width} maxHeightPx={380} instanceKey="floating" />
    </div>
  );
}
