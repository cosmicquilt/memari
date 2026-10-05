"use client";

// THE DRAWER'S EDGE, TO DRAG (2026-10-05, the palette revamp). A thin strip
// over the drawer's right edge: drag it to make the drawer wider or
// narrower, double-click it for the default, or focus it and use the arrow
// keys (Shift for bigger steps). Lit in the accent while hovered or held.

import { useRef, useState } from "react";

const ACCENT = "#4a5cff";

export function PaletteResizeHandle({
  width,
  top,
  min,
  max,
  defaultWidth,
  onChange,
  onCommit,
}: {
  width: number;
  /** Where the drawer starts - under the header. */
  top: number;
  min: number;
  max: number;
  defaultWidth: number;
  /** Every step of a drag. */
  onChange: (width: number) => void;
  /** Once the drag (or a key, or the reset) is done. */
  onCommit: (width: number) => void;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const [held, setHeld] = useState(false);
  const [hover, setHover] = useState(false);
  const clamp = (w: number) => Math.round(Math.max(min, Math.min(max, w)));
  const lastWidth = useRef(width);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Drawer width"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize the drawer - double-click for the default"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, width };
        lastWidth.current = width;
        setHeld(true);
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        const next = clamp(start.current.width + event.clientX - start.current.x);
        if (next === lastWidth.current) return;
        lastWidth.current = next;
        onChange(next);
      }}
      onPointerUp={() => {
        if (!start.current) return;
        start.current = null;
        setHeld(false);
        onCommit(lastWidth.current);
      }}
      onPointerCancel={() => {
        start.current = null;
        setHeld(false);
        onCommit(lastWidth.current);
      }}
      onDoubleClick={() => {
        onChange(defaultWidth);
        onCommit(defaultWidth);
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 40 : 10;
        const next = event.key === "ArrowLeft" ? clamp(width - step) : event.key === "ArrowRight" ? clamp(width + step) : null;
        if (next === null) return;
        event.preventDefault();
        onChange(next);
        onCommit(next);
      }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        position: "fixed",
        top,
        bottom: 0,
        left: width - 5,
        width: 10,
        zIndex: 26,
        cursor: "col-resize",
        touchAction: "none",
        outline: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 4,
          width: 2,
          background: held || hover ? ACCENT : "transparent",
          transition: "background 120ms ease",
        }}
      />
    </div>
  );
}
