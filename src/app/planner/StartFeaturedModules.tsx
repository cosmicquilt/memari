"use client";

// Featured > Modules: every module the palette offers, drawn as the palette
// draws it (ModulePreview, one day wide), by its group. Imported only when
// Modules is first shown (StartFeatured.tsx), since it brings the module
// registry and its renderers to a page that otherwise has neither.
//
// A module is looked at here, not used: it needs a page to go on, and at
// the start there is none, so the details say where to find it once a
// journal is open - the same answer Saved > Modules gives.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ModulePreview } from "./ModulePreview";
import { CADENCE_LABELS, GROUPS, GROUP_BLURBS, PALETTE_INFO, sectionsOf, whatItPrints, type PaletteModuleInfo } from "@/lib/paletteGroups";
import type { Category } from "@/lib/moduleRegistry";
import { describeModule } from "@/lib/moduleDescriptions";
import { FONT_SERIF } from "@/lib/theme";
import { PLANNER_TRIMS } from "@/lib/planner-trims";
import { cellHeightPx, dayUnitColumns, gridCellToPixels, type PageGrid } from "@/lib/grid";
import { getMinRowSpanForSlug } from "@/lib/moduleMinRowSpan";
import { revealDetails } from "./StartFeatured";
import { SaveButton } from "./templateSaved";

export type FeaturedModulesProps = {
  switcher: ReactNode;
  /** Modules with a page of their own at /modules/<slug>. */
  guides: string[];
};

const DIM = "rgba(var(--sd-ink-rgb), 0.6)";
const INK = "var(--sd-ink)";

/** The bound book's page, as the Layouts page's module cards draw on
 *  (landing/ModuleCards.tsx). */
const TRIM = PLANNER_TRIMS.bound7x10;
const GRID: PageGrid = { widthPx: TRIM.widthPx, heightPx: TRIM.heightPx, gridColumns: 24, gridRows: TRIM.gridRows, boxInsetPx: 6, marginPx: TRIM.marginPx };

type Filter = "All" | Category;

/** A card's drawing: its width, and the height it is cut at. */
const CARD = { widthPx: 116, heightPx: 102 };

/**
 * The rows a card draws its module at (2026-10-21): "I want the modules to
 * appear even if they are now smaller (note boxes) at the height of the
 * largest preview ... like habit trackers are", with the fade that says
 * there is more below. Its fewest rows if those already run past the card;
 * otherwise enough to pass it by a row, so a note box or a prompt is cut
 * and fades like the tall ones. The details draw the same rows, whole.
 */
function cardRows(module: PaletteModuleInfo): number {
  const columns = dayUnitColumns(GRID);
  const fewest = getMinRowSpanForSlug(module.slug, GRID, columns, module.previewProps);
  const drawnWidth = gridCellToPixels(GRID, { columnStart: 0, rowStart: 0, columnSpan: columns, rowSpan: 1 }).width;
  const scale = CARD.widthPx / drawnWidth;
  // r rows draw r cells less the box inset at each end; one row more than
  // the card shows, so the fade always has module under it.
  const past = Math.ceil((CARD.heightPx / scale + 2 * GRID.boxInsetPx) / cellHeightPx(GRID)) + 1;
  return Math.max(fewest, past);
}

/** Each group's modules in the palette's order: section by section. */
const BY_GROUP: Array<[Category, PaletteModuleInfo[]]> = GROUPS.map((group) => [
  group,
  sectionsOf(PALETTE_INFO.filter((m) => m.group === group)).flatMap((s) => s.modules),
]).filter(([, modules]) => (modules as PaletteModuleInfo[]).length > 0) as Array<[Category, PaletteModuleInfo[]]>;

export function FeaturedModules({ switcher, guides }: FeaturedModulesProps) {
  const [filter, setFilter] = useState<Filter>("All");
  const shown = useMemo(() => (filter === "All" ? BY_GROUP : BY_GROUP.filter(([group]) => group === filter)), [filter]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(BY_GROUP[0]?.[1][0]?.slug ?? null);
  const selected = selectedSlug ? PALETTE_INFO.find((m) => m.slug === selectedSlug) ?? null : null;
  const hasGuide = useMemo(() => new Set(guides), [guides]);

  const choose = (next: Filter) => {
    setFilter(next);
    // Keep the module chosen if it is still in view; else the first that is.
    const list = next === "All" ? BY_GROUP : BY_GROUP.filter(([group]) => group === next);
    if (!list.some(([, modules]) => modules.some((m) => m.slug === selectedSlug))) setSelectedSlug(list[0]?.[1][0]?.slug ?? null);
  };

  return (
    <>
      <div className="sd-main">
        {switcher}
        <div role="group" aria-label="Module groups" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(["All", ...BY_GROUP.map(([group]) => group)] as Filter[]).map((group) => (
            <button key={group} type="button" className="sd-chip" aria-pressed={filter === group} onClick={() => choose(group)}>
              {group}{" "}
              <span style={{ opacity: 0.7, marginLeft: 4 }}>
                {group === "All" ? PALETTE_INFO.length : BY_GROUP.find(([g]) => g === group)?.[1].length}
              </span>
            </button>
          ))}
        </div>
        {shown.map(([group, modules]) => (
          <section key={group} className="sd-group" aria-label={group}>
            {filter === "All" ? (
              <h3 className="sd-label">
                {group} <span style={{ opacity: 0.7, marginLeft: 6 }}>{modules.length}</span>
              </h3>
            ) : (
              <p className="sd-lede">{GROUP_BLURBS[group]}</p>
            )}
            <div className="sd-grid">
              {modules.map((module) => (
                <button
                  key={module.slug}
                  type="button"
                  className="sd-card"
                  aria-pressed={module.slug === selectedSlug}
                  onClick={() => {
                    setSelectedSlug(module.slug);
                    revealDetails();
                  }}
                >
                  <span className="sd-thumb" style={{ alignItems: "flex-start" }}>
                    <Drawn module={module} widthPx={CARD.widthPx} maxHeightPx={CARD.heightPx} rowSpan={cardRows(module)} />
                  </span>
                  <span className="sd-name">{module.name}</span>
                  <span className="sd-meta">{module.cadence ? CADENCE_LABELS[module.cadence] : module.section}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <aside className="sd-details" aria-live="polite">
        {selected && (
          <ModuleDetails key={selected.slug} module={selected} guide={hasGuide.has(selected.slug)} />
        )}
      </aside>
    </>
  );
}

function ModuleDetails({ module, guide }: { module: PaletteModuleInfo; guide: boolean }) {
  const description = describeModule(module.slug);
  const where = module.section && module.section !== module.group ? `${module.group}, ${module.section}` : module.group;
  return (
    <>
      <div style={{ display: "grid", gap: 6 }}>
        <div className="sd-label">Module</div>
        <h2 className="sd-heading">{module.name}</h2>
      </div>
      <span className="sd-thumb" style={{ height: "auto", minHeight: 120, padding: 12 }}>
        {/* The card's drawing, whole: what was under its fade. */}
        <Drawn module={module} widthPx={200} rowSpan={cardRows(module)} eager />
      </span>
      {description && <p className="sd-text">{description}</p>}
      <dl className="sd-facts">
        <dt>Prints</dt>
        <dd>{whatItPrints(module.slug, module.previewProps)}</dd>
        {module.cadence && (
          <>
            <dt>For</dt>
            <dd>{CADENCE_LABELS[module.cadence]} pages</dd>
          </>
        )}
      </dl>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <SaveButton save={{ kind: "module", slug: module.slug }} what={`the ${module.name} module`} label="Save module" />
      </div>
      <p style={{ color: DIM, fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
        Saved, it waits in the Modules panel&rsquo;s Saved section once a journal is open. Or drag it onto a page from {where}.
      </p>
      {guide && (
        <a href={`/modules/${module.slug}`} target="_blank" rel="noopener" className="sd-link" style={{ color: INK, fontSize: 13 }}>
          Read about the practice
        </a>
      )}
    </>
  );
}

/** A module's real drawing, made once its card comes near the visible part
 *  of the list - a hundred and more at once is what made the palette slow
 *  (memory: memari-editor-render-cost). The box is sized from the start. */
function Drawn({ module, widthPx, maxHeightPx, rowSpan, eager = false }: { module: PaletteModuleInfo; widthPx: number; maxHeightPx?: number; rowSpan?: number; eager?: boolean }) {
  const holder = useRef<HTMLSpanElement | null>(null);
  const [draw, setDraw] = useState(eager);
  useEffect(() => {
    const node = holder.current;
    if (draw || !node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setDraw(true);
      },
      // The list scrolls inside the dialog, not the window.
      { root: node.closest(".sd-main"), rootMargin: "240px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [draw]);
  return (
    <span ref={holder} style={{ display: "block", width: widthPx, maxWidth: "100%" }}>
      <ModulePreview
        slug={module.slug}
        previewProps={module.previewProps}
        pageGrid={GRID}
        fontFamily={FONT_SERIF}
        draw={draw}
        initialWidthPx={widthPx}
        maxHeightPx={maxHeightPx}
        rowSpan={rowSpan}
        instanceKey={eager ? "featured-detail" : "featured"}
      />
    </span>
  );
}
