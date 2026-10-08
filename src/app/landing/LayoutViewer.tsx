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
import type { LayoutDetail } from "./layoutDetail";
import { SpreadPages, SpreadPreview, type PreviewSet } from "./SpreadPreview";
import { UseThisWeek } from "./UseThisWeek";
import css from "./layoutViewer.module.css";

const ViewerContext = createContext<((key: string) => void) | null>(null);

const details = new Map<string, Promise<LayoutDetail>>();
function loadDetail(key: string): Promise<LayoutDetail> {
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
      {stack.length > 0 && (
        <Popup
          layoutKey={stack[stack.length - 1]}
          canGoBack={stack.length > 1}
          onBack={() => setStack((s) => s.slice(0, -1))}
          onOpen={(key) => setStack((s) => [...s, key])}
          onClose={close}
        />
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
      <span className={css.zoomHint} aria-hidden="true">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" />
        </svg>
      </span>
    </button>
  );
}

// ------------------------------------------------------------------ popup

/** Two pages side by side, and the line between them: width over height. */
const ASPECT = (2175 * 2 + 1) / 3075;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const PAD = 28;

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

        <ZoomStage key={layoutKey} detail={detail} />

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
                          <span className={css.similarCaption}>
                            {s.changes.length
                              ? s.changes.join(" · ")
                              : `The original ${s.title}`}
                          </span>
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

const KIND_WORD = {
  week: "A week",
  month: "A month",
  day: "A day",
  pages: "Pages",
} as const;

/** The spread, fitted to its space and zoomable. */
function ZoomStage({ detail }: { detail: LayoutDetail | null }) {
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);

  // The width that shows both pages whole.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () =>
      setFit(
        Math.max(
          120,
          Math.min(
            el.clientWidth - PAD * 2,
            (el.clientHeight - PAD * 2) * ASPECT,
          ),
        ),
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Zoom to `next`, keeping the point under (px, py) - in the stage's own
   *  box - where it is. */
  const zoomTo = useCallback((next: number, px?: number, py?: number) => {
    const el = stage.current;
    if (!el) return;
    const prev = zoomRef.current;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (z === prev) return;
    const x = px ?? el.clientWidth / 2;
    const y = py ?? el.clientHeight / 2;
    const cx = el.scrollLeft + x - PAD;
    const cy = el.scrollTop + y - PAD;
    zoomRef.current = z;
    setZoom(z);
    requestAnimationFrame(() => {
      el.scrollLeft = (cx * z) / prev + PAD - x;
      el.scrollTop = (cy * z) / prev + PAD - y;
    });
  }, []);

  // Ctrl + wheel, and a trackpad's pinch (which arrives as one): zoom, not
  // the page's own zoom.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      zoomTo(
        zoomRef.current * Math.exp(-e.deltaY * 0.01),
        e.clientX - box.left,
        e.clientY - box.top,
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoomTo]);

  // Drag to look around; two fingers to pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const spread = (fit || 0) * zoom;

  return (
    <div className={css.stageWrap}>
      <div
        ref={stage}
        className={css.stage}
        data-zoomed={zoom > 1 || undefined}
        onDoubleClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          zoomTo(
            zoomRef.current > 1 ? 1 : 2.5,
            e.clientX - box.left,
            e.clientY - box.top,
          );
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
            const box = el.getBoundingClientRect();
            zoomTo(
              pinch.current.zoom *
                (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance),
              (a.x + b.x) / 2 - box.left,
              (a.y + b.y) / 2 - box.top,
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
          if (pointers.current.size < 2) pinch.current = null;
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
        }}
      >
        <div className={css.canvas} style={{ padding: PAD }}>
          <div style={{ width: spread, flex: "none" }}>
            {fit > 0 && <SpreadPages spread={detail?.spread ?? null} />}
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
          type="button"
          onClick={() => zoomTo(1)}
          className={css.fitButton}
          aria-label="Fit the whole spread"
        >
          {Math.round(zoom * 100)}%
        </button>
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
