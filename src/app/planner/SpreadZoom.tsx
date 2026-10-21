"use client";

// THE ZOOM, in the start dialog (2026-10-21): "Planners and pages to show up
// on hover a magnifying glass, and then with a page pop up it with dark
// transparent background, smooth pinch zooming, and zooming % +/- ui. Now
// for planners I want the same thing but also a version of the canvas
// timeline, so the pages and repeats at different levels can be viewed."
//
// The spread is the Layouts popup's zoom stage (landing/LayoutViewer.tsx's
// ZoomStage) on a dark backdrop: a pinch is a GPU scale until it settles,
// then one sharp redraw; ctrl or trackpad pinch, two fingers, a double
// click, the -/%/+ bar; drag to look around. A planner adds the editor's
// timeline in small: its parts by level (BEGINNING, MONTHLY, WEEKLY, DAILY),
// each with how often it repeats in the book.
//
// Rendered into <body>, over the start dialog and everything else.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ZoomStage, loadDetail, moduleRegions } from "@/app/landing/LayoutViewer";
import type { LayoutModuleBox } from "@/app/landing/layoutDetail";
import type { TemplateSave } from "@/lib/templateSave";
import { SaveButton } from "./templateSaved";
import { SpreadPages } from "@/app/landing/SpreadPreview";
import type { LandingSpread } from "@/app/landing/spreads";
import css from "./spreadZoom.module.css";

export type ZoomLevel = "front" | "month" | "week" | "day" | "pages";

export type ZoomPart = {
  /** The spread's key: what the stage is keyed by, so zoom resets. */
  key: string;
  level: ZoomLevel;
  spread: LandingSpread | null;
};

/** The editor timeline's names for its levels, and how often each repeats. */
const LEVEL: Record<ZoomLevel, { name: string; repeats: string; part: string }> = {
  front: { name: "Beginning", repeats: "Once, at the front", part: "front pages" },
  month: { name: "Monthly", repeats: "Every month", part: "month" },
  week: { name: "Weekly", repeats: "Every week", part: "week" },
  day: { name: "Daily", repeats: "Every day", part: "day" },
  pages: { name: "Pages", repeats: "Where you put them", part: "pages" },
};

export function SpreadZoom({
  title,
  kind,
  parts,
  initial = 0,
  actions,
  save,
  onClose,
}: {
  title: string;
  /** "Planner", "Week": over the title. */
  kind: string;
  parts: ZoomPart[];
  initial?: number;
  /** Beside the close button: Use this. */
  actions?: ReactNode;
  /** The whole thing, saved from the header: the planner, or the page. A
   *  planner's parts are saved one by one too, and any module on a part,
   *  on hover - nested, as asked (2026-10-21). */
  save?: TemplateSave;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(Math.min(Math.max(0, initial), parts.length - 1));
  const part = parts[index];
  const closeButton = useRef<HTMLButtonElement>(null);
  const timeline = parts.length > 1;
  // Where the part's modules are drawn, for Save on hover: the Layouts
  // popup's detail, fetched once a page.
  const [modules, setModules] = useState<{ key: string; list: LayoutModuleBox[] } | null>(null);
  const partKey = part?.key;
  useEffect(() => {
    if (!partKey) return;
    let live = true;
    loadDetail(partKey)
      .then((detail) => live && setModules({ key: partKey, list: detail.modules }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [partKey]);
  const overlay = part && modules?.key === part.key ? moduleRegions(part.key, modules.list) : undefined;

  // The page under it stays put; focus starts on X and goes back on close;
  // Escape closes; the arrows step through a planner's parts.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const was = root.style.overflow;
    root.style.overflow = "hidden";
    closeButton.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (!timeline || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      e.preventDefault();
      setIndex((i) => Math.min(parts.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1))));
    };
    // Capture, so the start dialog's own Escape does not close it as well.
    window.addEventListener("keydown", key, true);
    return () => {
      root.style.overflow = was;
      window.removeEventListener("keydown", key, true);
      opener?.focus?.();
    };
  }, [onClose, timeline, parts.length]);

  if (!part) return null;
  return createPortal(
    <div
      className={css.backdrop}
      onMouseDown={(e) => {
        // A click on the dark itself closes it; a drag that ends there does not.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={css.frame} role="dialog" aria-modal="true" aria-labelledby="zoom-title" data-timeline={timeline || undefined}>
        <header className={css.head}>
          <div className={css.titles}>
            <p className={css.kind}>
              {kind}
              {timeline && <span className={css.partName}>{LEVEL[part.level].name}</span>}
            </p>
            <h2 id="zoom-title" className={css.title}>
              {title}
            </h2>
          </div>
          {timeline && (
            <div className={css.partSave}>
              <SaveButton
                save={{ kind: "layout", key: part.key }}
                tone="dark"
                label={`Save this ${LEVEL[part.level].part}`}
                savedLabel={`This ${LEVEL[part.level].part}, saved`}
                what={`the ${LEVEL[part.level].part} of ${title}`}
              />
            </div>
          )}
          <div className={css.headActions}>
            {save && <SaveButton save={save} tone="dark" label={timeline ? "Save planner" : "Save"} what={timeline ? `the ${title} planner` : `the ${title} layout`} />}
            {actions}
            <button ref={closeButton} type="button" className={css.close} onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        <div className={css.stage}>
          <ZoomStage key={part.key} spread={part.spread} tone="dark" overlay={overlay} />
        </div>

        {timeline && (
          <nav className={css.timeline} aria-label="Parts of the planner">
            {parts.map((p, i) => (
              <div key={p.key} className={css.level}>
                <span className={css.levelName}>{LEVEL[p.level].name}</span>
                <button
                  type="button"
                  className={css.tile}
                  aria-current={i === index || undefined}
                  aria-label={`${LEVEL[p.level].name}: ${LEVEL[p.level].repeats}`}
                  onClick={() => setIndex(i)}
                >
                  <span className={css.tilePages}>
                    <SpreadPages spread={p.spread} />
                  </span>
                </button>
                <span className={css.repeats}>{LEVEL[p.level].repeats}</span>
              </div>
            ))}
          </nav>
        )}
      </div>
    </div>,
    document.body
  );
}

/** The magnifier that opens it: over a card's picture on hover, always over
 *  the details' picture. A button of its own, beside the card's, since a
 *  button cannot hold another. */
export function ZoomButton({ label, onClick, always = false }: { label: string; onClick: () => void; always?: boolean }) {
  return (
    <button
      type="button"
      className={always ? `${css.zoomButton} ${css.zoomAlways}` : css.zoomButton}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title="See it larger"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" />
      </svg>
    </button>
  );
}

/** Where a ZoomButton sits: around a card, or around the details' picture. */
export const zoomHolder = css.holder;
