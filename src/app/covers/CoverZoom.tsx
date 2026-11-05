"use client";

// A front up close (2026-11-05: "mag glass cursor when hover the front as it
// print at top and when clicked, cover pops up in full detail zoomable"):
// the stage's flat front, large, drawn on the cover's whole scan - the 4K
// texture the printer prints from (/covers/<slug>/scan) - with the person's
// own mark, finish, dates and name on it, as the stage shows them.
//
// It opens on the small front it already has and takes the scan once it has
// loaded. Zoom: the wheel or a trackpad's pinch about the pointer, two
// fingers on a phone, a double click (or tap) between fit and 2.5 times, or
// the buttons; drag to look about once zoomed. The marks are type, so they
// stay sharp at any zoom. Esc, the close button or a click on the dark
// around it closes it, and the front that opened it has the focus again.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { coverNumber, type Cover } from "./catalogue";
import { CoverFront, type FrontOptions } from "./CoverFront";
import css from "./covers.module.css";

const MIN = 1;
const MAX = 5;
const STEP = 1.5;

type View = { scale: number; x: number; y: number };
const FIT: View = { scale: 1, x: 0, y: 0 };

export function CoverZoom({
  cover,
  options,
  datesWords,
  name,
  label,
  onClose,
}: {
  cover: Cover;
  options: FrontOptions;
  datesWords: string;
  name: string;
  label: string;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>(FIT);
  const [scan, setScan] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; view: View } | null>(null);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean; onDark: boolean } | null>(null);

  // the whole scan, fetched once; the small front shows until it is in
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => live && setScan(img.src);
    img.src = `/covers/${cover.slug}/scan`;
    return () => {
      live = false;
    };
  }, [cover.slug]);

  // the page under it still, and back where it was after
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      root.style.overflow = before;
      opener?.focus?.();
    };
  }, []);

  /** A view kept so the board never leaves the screen: it may move only as
   *  far as it is larger than the area. */
  const clamp = useCallback((next: View): View => {
    const a = area.current?.getBoundingClientRect();
    const b = board.current;
    if (!a || !b) return next;
    const scale = Math.min(MAX, Math.max(MIN, next.scale));
    const w = b.offsetWidth * scale;
    const h = b.offsetHeight * scale;
    const limX = Math.max(0, (w - a.width) / 2);
    const limY = Math.max(0, (h - a.height) / 2);
    return { scale, x: Math.min(limX, Math.max(-limX, next.x)), y: Math.min(limY, Math.max(-limY, next.y)) };
  }, []);

  /** Zoom to `scale` keeping the point under (cx, cy), in page pixels, where it is. */
  const zoomAt = useCallback(
    (scale: number, cx: number, cy: number, from: View) => {
      const a = area.current?.getBoundingClientRect();
      if (!a) return from;
      const s = Math.min(MAX, Math.max(MIN, scale));
      const px = cx - (a.left + a.width / 2);
      const py = cy - (a.top + a.height / 2);
      const k = s / from.scale;
      return clamp({ scale: s, x: px - (px - from.x) * k, y: py - (py - from.y) * k });
    },
    [clamp]
  );

  const centre = () => {
    const a = area.current?.getBoundingClientRect();
    return a ? { x: a.left + a.width / 2, y: a.top + a.height / 2 } : { x: 0, y: 0 };
  };
  const zoomBy = (factor: number) => {
    const c = centre();
    setView((v) => zoomAt(v.scale * factor, c.x, c.y, v));
  };

  // the wheel and a trackpad's pinch (a wheel with ctrl): not passive, so the
  // page doesn't scroll or zoom itself
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
      setView((v) => zoomAt(v.scale * factor, e.clientX, e.clientY, v));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // keys: Esc closes, + and - zoom, 0 fits; Tab stays inside
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "+" || e.key === "=") zoomBy(STEP);
      else if (e.key === "-") zoomBy(1 / STEP);
      else if (e.key === "0") setView(FIT);
      else if (e.key === "Tab") {
        const items = [...(dialog.current?.querySelectorAll<HTMLElement>("button") ?? [])];
        if (!items.length) return;
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at === items.length - 1 ? 0 : at + 1;
        e.preventDefault();
        items[next].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // zoomBy reads the latest view through setView
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, zoomAt]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // where it began - once captured, every event is the area's own
    const onDark = e.target === e.currentTarget;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [p, q] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(p.x - q.x, p.y - q.y), view };
      drag.current = null;
    } else drag.current = { x: e.clientX, y: e.clientY, view, moved: false, onDark };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [p, q] = [...pointers.current.values()];
      const ratio = Math.hypot(p.x - q.x, p.y - q.y) / pinch.current.distance;
      setView(zoomAt(pinch.current.view.scale * ratio, (p.x + q.x) / 2, (p.y + q.y) / 2, pinch.current.view));
    } else if (drag.current) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        drag.current.moved = true;
        setDragging(true);
      }
      if (drag.current.view.scale > 1) setView(clamp({ ...drag.current.view, x: drag.current.view.x + dx, y: drag.current.view.y + dy }));
    }
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    setDragging(false);
    const was = drag.current;
    drag.current = null;
    // a click on the dark around the board closes; one on the board does not
    if (was && !was.moved && was.onDark && view.scale <= 1.01) onClose();
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    setView((v) => (v.scale > 1.05 ? FIT : zoomAt(2.5, e.clientX, e.clientY, v)));
  };

  const zoomed = view.scale > 1.01;
  return (
    <div ref={dialog} className={css.zoom} role="dialog" aria-modal="true" aria-label={`${cover.material} ${coverNumber(cover)}, the front up close`} data-paper-skip="" data-cover-zoom="">
      <div className={css.zoomBar}>
        <p>
          <strong>
            {cover.material} <span className={css.coverNumber}>{coverNumber(cover)}</span>
          </strong>
          <span className={css.zoomNote}>{scan ? "The front as it prints, from the cover's 4K texture" : "Loading the full texture…"}</span>
        </p>
        <div className={css.zoomTools}>
          <button type="button" onClick={() => zoomBy(1 / STEP)} disabled={view.scale <= MIN} aria-label="Zoom out">
            −
          </button>
          <span className={css.zoomLevel} aria-live="polite">
            {Math.round(view.scale * 100)}%
          </span>
          <button type="button" onClick={() => zoomBy(STEP)} disabled={view.scale >= MAX} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => setView(FIT)} disabled={!zoomed}>
            Fit
          </button>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Close" className={css.zoomClose}>
            ×
          </button>
        </div>
      </div>
      <div
        ref={area}
        className={`${css.zoomArea} ${zoomed ? css.zoomedIn : ""} ${dragging ? css.zoomDragging : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <div ref={board} className={css.zoomBoard} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <CoverFront cover={cover} options={options} datesWords={datesWords} name={name} label={label} src={scan ?? undefined} hold={scan ? "right" : undefined} eager />
        </div>
      </div>
    </div>
  );
}
