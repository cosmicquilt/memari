"use client";

// THE LAYOUTS POPUP (Andrew, 2026-10-08): click a layout - on /layouts, a
// layout's own page, or the landing page - and it opens big:
//
//   "fit screen so entire preview is visible in popup while being zoomable
//   to see detail and x in top right but also disappears if you click off
//   the popup ... use this button, and next to it also says similar
//   layouts ... allowing them to be clicked on to make big and same popup
//   screen but the new one they clicked on and a back button in the top
//   left to go back to previous one they were viewing."
//
// Zoom resizes the drawing rather than scaling a picture of it - the pages
// redraw at the new size (PagePreview), so detail stays sharp. Buttons,
// ctrl or a trackpad pinch over the spread, a two-finger pinch, or a double
// click; drag to look around once zoomed.
//
// The similar layouts are made on the server (similarLayouts.ts) and come
// with the layout (landing/layouts/<key>).

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { LayoutDetail, LayoutModuleBox } from "./layoutDetail";
import type { LandingSpread } from "./spreads";
import { SpreadPages, SpreadPreview, type PreviewSet } from "./SpreadPreview";
import { UseThisWeek } from "./UseThisWeek";
import { ModuleSaveRegions, SaveButton, type SaveRegion } from "@/app/planner/templateSaved";
import css from "./layoutViewer.module.css";
import landing from "./landing.module.css";

const ViewerContext = createContext<((key: string) => void) | null>(null);

const details = new Map<string, Promise<LayoutDetail>>();
/** A layout's detail, fetched once a page: the popup's, and the start
 *  dialog's zoom's for its modules' places (planner/SpreadZoom.tsx). */
export function loadDetail(key: string): Promise<LayoutDetail> {
  let hit = details.get(key);
  if (!hit) {
    hit = fetch(`/landing/layouts/${encodeURIComponent(key)}`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<LayoutDetail>;
    });
    hit.catch(() => details.delete(key));
    details.set(key, hit);
  }
  return hit;
}

/** Around anything that shows layouts: one popup for all of them. */
export function LayoutViewer({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<string[]>([]);
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback((key: string) => {
    opener.current = document.activeElement as HTMLElement | null;
    setStack([key]);
  }, []);
  const close = useCallback(() => {
    setStack([]);
    opener.current?.focus?.();
  }, []);
  return (
    <ViewerContext.Provider value={open}>
      {children}
      {/* Into the page's own root, beside the nav (2026-10-21: "the header
          should be behind popup not over it"): where the cards are - inside
          the landing's body, which is a stacking context of its own - no
          z-index lifts it over the nav, which sits above that body. The
          page's root still carries the site's fonts and colours. */}
      {stack.length > 0 &&
        createPortal(
          <Popup
            layoutKey={stack[stack.length - 1]}
            canGoBack={stack.length > 1}
            onBack={() => setStack((s) => s.slice(0, -1))}
            onOpen={(key) => setStack((s) => [...s, key])}
            onClose={close}
          />,
          document.querySelector(`.${landing.page}`) ?? document.body
        )}
    </ViewerContext.Provider>
  );
}

/** A layout's picture that opens the popup. Outside a LayoutViewer it is
 *  a link to the layout's page instead. */
export function LayoutCard({
  spreadKey,
  title,
  set = "all",
  eager = false,
}: {
  spreadKey: string;
  title: string;
  set?: PreviewSet;
  eager?: boolean;
}) {
  const open = useContext(ViewerContext);
  if (!open) {
    return (
      <Link
        href={`/layouts/${spreadKey}`}
        className={css.card}
        aria-label={`${title}: see what is on it`}
      >
        <SpreadPreview spreadKey={spreadKey} set={set} eager={eager} />
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={css.card}
      onClick={() => open(spreadKey)}
      aria-label={`Open ${title} larger`}
    >
      <SpreadPreview spreadKey={spreadKey} set={set} eager={eager} />
      <ZoomHint />
    </button>
  );
}

/** The round magnifier over a layout that opens bigger - always shown, so
 *  it reads as something to click (2026-10-08). */
function ZoomHint({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? `${css.zoomHint} ${css.zoomHintSmall}` : css.zoomHint} aria-hidden="true">
      <svg width={small ? 14 : 16} height={small ? 14 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" />
      </svg>
    </span>
  );
}

// ------------------------------------------------------------------ popup

/** Two pages side by side, and the line between them: width over height. */
const ASPECT = (2175 * 2 + 1) / 3075;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const PAD = 28;
/** How long after the last pinch event the zoom is committed (the editor's
 *  PINCH_SETTLE_MS, memory: pinch zoom). */
const PINCH_SETTLE_MS = 150;

function Popup({
  layoutKey,
  canGoBack,
  onBack,
  onOpen,
  onClose,
}: {
  layoutKey: string;
  canGoBack: boolean;
  onBack: () => void;
  onOpen: (key: string) => void;
  onClose: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  // What arrived, and for which layout: shown only while it is still the
  // one asked for.
  const [loaded, setLoaded] = useState<{ key: string; attempt: number; detail?: LayoutDetail } | null>(null);
  const current = loaded && loaded.key === layoutKey && loaded.attempt === attempt ? loaded : null;
  const detail = current?.detail ?? null;
  const failed = current !== null && !current.detail;
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    loadDetail(layoutKey)
      .then((d) => live && setLoaded({ key: layoutKey, attempt, detail: d }))
      .catch(() => live && setLoaded({ key: layoutKey, attempt }));
    return () => {
      live = false;
    };
  }, [layoutKey, attempt]);

  // The page under it stays where it was; Escape closes; focus starts on X.
  useEffect(() => {
    const root = document.documentElement;
    const was = root.style.overflow;
    root.style.overflow = "hidden";
    closeButton.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => {
      root.style.overflow = was;
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  return (
    <div
      className={css.backdrop}
      onMouseDown={(e) => {
        // A click off the popup closes it - one that starts and ends there,
        // not a drag that wandered out of the spread.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={css.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="layout-title"
      >
        {canGoBack && (
          <button type="button" className={css.back} onClick={onBack}>
            <span aria-hidden="true">←</span> Back
          </button>
        )}
        <button
          ref={closeButton}
          type="button"
          className={css.close}
          onClick={onClose}
          aria-label="Close"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M6 6l12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <ZoomStage key={layoutKey} spread={detail?.spread ?? null} overlay={detail ? moduleRegions(detail.key, detail.modules) : undefined} />

        <aside className={css.side}>
          {failed ? (
            <div className={css.failed}>
              <p>This layout did not load.</p>
              <button
                type="button"
                className={css.retry}
                onClick={() => setAttempt((n) => n + 1)}
              >
                Try again
              </button>
            </div>
          ) : !detail ? (
            <p className={css.loading}>Loading…</p>
          ) : (
            <>
              <p className={css.kind}>
                {detail.changes.length
                  ? `A variation of ${detail.title}`
                  : KIND_WORD[detail.kind]}
              </p>
              <h2 id="layout-title" className={css.title}>
                {detail.title}
              </h2>
              {detail.hours && !detail.changes.length && (
                <p className={css.hours}>{detail.hours}</p>
              )}
              {detail.changes.length > 0 ? (
                <ul className={css.changes}>
                  {detail.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : (
                <p className={css.line}>{detail.line}</p>
              )}
              <div className={css.actions}>
                <UseThisWeek spreadKey={detail.key} label={detail.action} />
                <SaveButton save={{ kind: "layout", key: detail.key }} what={`the ${detail.title} layout`} />
                {!detail.changes.length && (
                  <Link
                    href={`/layouts/${detail.baseKey}`}
                    className={css.more}
                  >
                    Everything on it
                  </Link>
                )}
              </div>
              <p className={css.makes}>{detail.makes}</p>
              {/* A planner's part: the whole book is one press too. */}
              {detail.planner && (
                <div style={{ marginTop: 18, display: "grid", gap: 10, justifyItems: "start" }}>
                  <p className={css.makes}>
                    Part of the{" "}
                    <Link href={`/layouts/${detail.planner.key}`} className={css.more}>
                      {detail.planner.title}
                    </Link>{" "}
                    planner, which lays out every part of the book.
                  </p>
                  <UseThisWeek spreadKey={detail.planner.key} label="Use the whole planner" quiet />
                </div>
              )}

              {detail.similar.length > 0 && (
                <section
                  aria-labelledby="similar-title"
                  className={css.similar}
                >
                  <h3 id="similar-title">Similar layouts</h3>
                  <ul>
                    {detail.similar.map((s) => (
                      <li key={s.key}>
                        <button
                          type="button"
                          onClick={() => onOpen(s.key)}
                          aria-label={`Open ${s.changes.length ? `${s.title}, ${s.changes.join(", ")}` : `${s.title}, the original`}`}
                        >
                          <SpreadPages spread={s.spread} />
                          <ZoomHint small />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/** A layout's modules as regions to save from, page by page, for the zoom
 *  stage's overlay (2026-10-21): Save on hover, centred in each module. */
export function moduleRegions(layoutKey: string, modules: LayoutModuleBox[]): [ReactNode, ReactNode] {
  const page = (p: 0 | 1) => {
    const regions: SaveRegion[] = modules
      .filter((m) => m.page === p)
      .map((m) => ({ save: { kind: "layout-module", key: layoutKey, slot: m.slot }, name: m.name, box: m.box }));
    return <ModuleSaveRegions regions={regions} pageWidthPx={2175} pageHeightPx={3075} />;
  };
  return [page(0), page(1)];
}

const KIND_WORD = {
  week: "A week",
  month: "A month",
  day: "A day",
  pages: "Pages",
} as const;

/** The spread, fitted to its space and zoomable.
 *
 * A PINCH IS A GPU SCALE UNTIL IT STOPS (2026-10-15: "touchpad pinch zooming
 * is very jittery ... it doesn't smoothly zoom into where my mouse is"). It
 * used to set React's zoom on every event, redrawing both pages at a new
 * size each time, and corrected the scroll a frame later - after the next
 * event had already read the old one - from a left-aligned picture of a
 * spread that is centred. Now, as the editor does (memory: pinch zoom):
 * while the pinch lasts, only a transform on the spread; PINCH_SETTLE_MS
 * after its last event, one commit that redraws it sharp and sets the scroll
 * in the same frame. Both ask `plan` where the spread will sit - centred on
 * an axis it fits, else scrolled so the point under the pointer stays put,
 * clamped as the browser will clamp - so the preview lands where the commit
 * does. The point is fixed where the pinch starts.
 *
 * Also the start dialog's zoom (planner/SpreadZoom.tsx, 2026-10-21), there
 * on a dark see-through backdrop: `tone="dark"` drops the paper behind the
 * spread and lifts the spread off the dark with a shadow. */
export function ZoomStage({
  spread,
  tone = "paper",
  overlay,
}: {
  spread: LandingSpread | null;
  tone?: "paper" | "dark";
  /** Over each page, scaled with it: the modules' Save regions. */
  overlay?: [ReactNode, ReactNode];
}) {
  const stage = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLButtonElement>(null);
  const [fit, setFit] = useState(0);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const fitRef = useRef(0);
  // On the dark, the zoom bar sits under the spread rather than over its
  // foot: room for it below.
  const padBottom = tone === "dark" ? PAD + 44 : PAD;

  // The width that shows both pages whole.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const next = Math.max(120, Math.min(el.clientWidth - PAD * 2, (el.clientHeight - PAD - padBottom) * ASPECT));
      fitRef.current = next;
      setFit(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [padBottom]);

  /** Where the spread sits at zoom `z` with the point at fraction (u, v) of
   *  it under (mx, my), in the stage's own box: its left and top there, and
   *  the scroll that puts it so. */
  const plan = useCallback((z: number, u: number, v: number, mx: number, my: number) => {
    const el = stage.current!;
    const width = fitRef.current * z;
    const height = width / ASPECT;
    const axis = (size: number, view: number, frac: number, at: number, before: number, after: number) => {
      // The canvas centres a spread that fits, inside its padding.
      const start = size + before + after <= view ? before + (view - before - after - size) / 2 : before;
      const room = Math.max(0, size + before + after - view);
      const scroll = Math.min(room, Math.max(0, start + frac * size - at));
      return { scroll, at: start - scroll };
    };
    const x = axis(width, el.clientWidth, u, mx, PAD, PAD);
    const y = axis(height, el.clientHeight, v, my, PAD, padBottom);
    return { scrollLeft: x.scroll, scrollTop: y.scroll, left: x.at, top: y.at };
  }, [padBottom]);

  /** Where a zoom anchors: the point under (clientX, clientY), as a fraction
   *  of the spread, and that point in the stage's box. */
  const anchorAt = useCallback((clientX: number, clientY: number) => {
    const box = stage.current!.getBoundingClientRect();
    const r = layer.current!.getBoundingClientRect();
    return {
      u: r.width ? (clientX - r.left) / r.width : 0.5,
      v: r.height ? (clientY - r.top) / r.height : 0.5,
      mx: clientX - box.left,
      my: clientY - box.top,
      left0: r.left - box.left,
      top0: r.top - box.top,
    };
  }, []);

  type Anchor = ReturnType<typeof anchorAt>;
  const committing = useRef<Anchor | null>(null);
  const pinching = useRef<{ anchor: Anchor; from: number; target: number; timer: number } | null>(null);

  const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  /** Commit `next` at `anchor`: React redraws, the layout effect scrolls. */
  const commit = useCallback((next: number, anchor: Anchor) => {
    const z = clamp(next);
    committing.current = anchor;
    if (z === zoomRef.current) {
      // Nothing to redraw; just put the picture back as it was.
      if (layer.current) layer.current.style.transform = "";
      committing.current = null;
      return;
    }
    zoomRef.current = z;
    setZoom(z);
  }, []);

  /** A step (the buttons, a double click): straight to the commit. */
  const zoomTo = useCallback(
    (next: number, clientX?: number, clientY?: number) => {
      const el = stage.current;
      if (!el || !layer.current) return;
      const box = el.getBoundingClientRect();
      commit(next, anchorAt(clientX ?? box.left + el.clientWidth / 2, clientY ?? box.top + el.clientHeight / 2));
    },
    [anchorAt, commit]
  );

  /** A pinch, frame by frame: a transform toward where the commit will put
   *  the spread, the label updated, and the commit once it settles. */
  const pinchTo = useCallback(
    (next: number, clientX: number, clientY: number, settleNow = false) => {
      if (!layer.current) return;
      let p = pinching.current;
      if (!p) {
        p = { anchor: anchorAt(clientX, clientY), from: zoomRef.current, target: zoomRef.current, timer: 0 };
        pinching.current = p;
        layer.current.style.willChange = "transform";
      }
      p.target = clamp(next);
      const { anchor } = p;
      const at = plan(p.target, anchor.u, anchor.v, anchor.mx, anchor.my);
      const scale = p.target / p.from;
      layer.current.style.transform = `translate(${at.left - anchor.left0}px, ${at.top - anchor.top0}px) scale(${scale})`;
      if (label.current) label.current.textContent = `${Math.round(p.target * 100)}%`;
      window.clearTimeout(p.timer);
      const settle = () => {
        const done = pinching.current;
        if (!done) return;
        pinching.current = null;
        commit(done.target, done.anchor);
      };
      if (settleNow) settle();
      else p.timer = window.setTimeout(settle, PINCH_SETTLE_MS);
    },
    [anchorAt, commit, plan]
  );

  // The commit's frame: the transform off and the scroll set, before paint.
  useLayoutEffect(() => {
    const el = stage.current;
    const a = committing.current;
    // The label is written here and by pinchTo, never by React: a pinch
    // replaces its text, and React would then go on updating the text it
    // had - detached - so after one pinch the label stayed where the pinch
    // left it whatever the zoom became (found 2026-10-21: 498% after Fit).
    if (label.current) label.current.textContent = `${Math.round(zoom * 100)}%`;
    if (layer.current) {
      layer.current.style.transform = "";
      layer.current.style.willChange = "";
    }
    if (!el || !a) return;
    committing.current = null;
    const at = plan(zoom, a.u, a.v, a.mx, a.my);
    el.scrollLeft = at.scrollLeft;
    el.scrollTop = at.scrollTop;
  }, [zoom, plan]);

  // Ctrl + wheel, and a trackpad's pinch (which arrives as one): zoom, not
  // the page's own zoom. A mouse wheel's big steps are evened out.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = Math.max(-40, Math.min(40, e.deltaY));
      const from = pinching.current?.target ?? zoomRef.current;
      pinchTo(from * Math.exp(-delta * 0.01), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [pinchTo]);

  // Drag to look around; two fingers to pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const spreadWidth = (fit || 0) * zoom;

  return (
    <div className={css.stageWrap} data-tone={tone}>
      <div
        ref={stage}
        className={css.stage}
        data-tone={tone}
        data-zoomed={zoom > 1 || undefined}
        onDoubleClick={(e) => {
          zoomTo(zoomRef.current > 1 ? 1 : 2.5, e.clientX, e.clientY);
        }}
        onPointerDown={(e) => {
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = {
              distance: Math.hypot(a.x - b.x, a.y - b.y),
              zoom: zoomRef.current,
            };
          }
          if (e.pointerType === "mouse" && zoomRef.current > 1)
            e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const was = pointers.current.get(e.pointerId);
          if (!was) return;
          const now = { x: e.clientX, y: e.clientY };
          pointers.current.set(e.pointerId, now);
          const el = e.currentTarget;
          if (pinch.current && pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinchTo(
              pinch.current.zoom *
                (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance),
              (a.x + b.x) / 2,
              (a.y + b.y) / 2,
            );
            return;
          }
          if (
            e.pointerType === "mouse" &&
            zoomRef.current > 1 &&
            e.buttons === 1
          ) {
            el.scrollLeft -= now.x - was.x;
            el.scrollTop -= now.y - was.y;
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2 && pinch.current) {
            pinch.current = null;
            // Fingers off: commit now rather than after the settle.
            const p = pinching.current;
            if (p) pinchTo(p.target, 0, 0, true);
          }
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
          const p = pinching.current;
          if (p) pinchTo(p.target, 0, 0, true);
        }}
      >
        <div className={css.canvas} style={{ padding: `${PAD}px ${PAD}px ${padBottom}px` }}>
          <div ref={layer} data-zoom-layer="" style={{ position: "relative", width: spreadWidth, flex: "none", transformOrigin: "0 0" }}>
            {fit > 0 && <SpreadPages spread={spread} />}
            {/* The pages' places, as SpreadPages lays them: side by side, a
                pixel apart. */}
            {fit > 0 && overlay && (
              <div style={{ position: "absolute", inset: 0, display: "flex", gap: 1 }}>
                {overlay.map((node, i) => (
                  <div key={i} style={{ position: "relative", flex: "1 1 0" }}>
                    {node}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className={css.zoomBar}>
        <button
          type="button"
          onClick={() => zoomTo(zoomRef.current / 1.5)}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          ref={label}
          type="button"
          onClick={() => zoomTo(1)}
          className={css.fitButton}
          aria-label="Fit the whole spread"
        />
        <button
          type="button"
          onClick={() => zoomTo(zoomRef.current * 1.5)}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
}
