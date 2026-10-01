"use client";

// THE TABLE'S COLUMN WIDTHS, DRAGGED ON THE PREVIEW.
//
// The column-spacing idea from the editor vision (2026-09-16): "free where a
// column needs more room for its text", quantised to whole lattice cells as
// agreed then. The renderer has taken a width per column all along and no
// control set it. A numeric field was the other option the research pass
// asked about; a divider you drag where it prints is the one a table
// already suggests, and the whole-cell snap keeps every divider on a dot.
//
// Handles sit OVER the drawn dividers, in CSS px outside the preview's
// transform - the heading field's arrangement - so the ring is a true 1px at
// any magnification. The drawing itself is untouched: the draft changes and
// the renderer redraws the table with the new widths.

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { RenderedPolotnoElement } from "@/lib/renderModuleInstance";
import { tableNumberCells } from "@/lib/modules/columnTable";

const ACCENT = "#4a5cff";

export function ColumnDividers({
  elements,
  instanceId,
  columnCount,
  rowNumbers,
  box,
  pitch,
  latticeOrigin,
  scale,
  pad,
  onChange,
}: {
  /** The module as drawn - the dividers are found by their semantic ids. */
  elements: RenderedPolotnoElement[];
  instanceId: string;
  columnCount: number;
  /** Whether the table numbers its rows - a one-cell column before its own. */
  rowNumbers: boolean;
  /** The module's box, in print px, and where it sits in the frame. */
  box: { x: number; y: number; width: number; height: number };
  /** One lattice cell, in print px, and the x of lattice column 0. */
  pitch: number;
  latticeOrigin: number;
  scale: number;
  pad: number;
  /** Whole cells per column, left to right. */
  onChange: (cellWidths: number[]) => void;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  // Keyboard focus shows as clearly as a hover - an arrow key moves it.
  const [focused, setFocused] = useState<number | null>(null);
  const drag = useRef<{ index: number; startX: number; startCell: number } | null>(null);

  const find = (name: string) => elements.find((e) => e.id === `${instanceId}-${name}`);
  const cellOf = (x: number) => Math.round((x - latticeOrigin) / pitch);
  const dividers: Array<{ index: number; x: number; top: number; bottom: number }> = [];
  for (let c = 1; c < columnCount; c++) {
    const e = find(`c${c}-divider`);
    if (!e) return null; // not on the lattice or not drawn: nothing to drag
    dividers.push({ index: c, x: (e.x ?? 0) + (e.width ?? 0) / 2, top: e.y ?? 0, bottom: (e.y ?? 0) + (e.height ?? 0) });
  }
  if (dividers.length === 0) return null;
  // The table's own edges, as lattice columns: after the number column when
  // there is one (it draws no line, so the rule the renderer uses is asked
  // here too), else the box's; the box's right.
  const boxLeftCell = cellOf(box.x);
  const rightCell = cellOf(box.x + box.width);
  const leftCell = boxLeftCell + tableNumberCells(rowNumbers, rightCell - boxLeftCell, columnCount);
  const cells = dividers.map((d) => cellOf(d.x));

  const move = (index: number, cell: number) => {
    const i = index - 1;
    const low = (i === 0 ? leftCell : cells[i - 1]) + 1;
    const high = (i === cells.length - 1 ? rightCell : cells[i + 1]) - 1;
    const next = Math.max(low, Math.min(high, cell));
    if (next === cells[i]) return;
    const boundaries = [leftCell, ...cells.map((c, k) => (k === i ? next : c)), rightCell];
    onChange(boundaries.slice(1).map((b, k) => b - boundaries[k]));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { index, startX: event.clientX, startCell: cells[index - 1] };
    setActive(index);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    move(d.index, d.startCell + Math.round((event.clientX - d.startX) / (pitch * scale)));
  };
  const onPointerUp = () => {
    drag.current = null;
    setActive(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    move(index, cells[index - 1] + (event.key === "ArrowLeft" ? -1 : 1));
  };

  return (
    <>
      {dividers.map((divider) => {
        const lit = active === divider.index || hovered === divider.index || focused === divider.index;
        const height = (divider.bottom - divider.top) * scale;
        return (
          <div
            key={divider.index}
            role="slider"
            tabIndex={0}
            aria-label={`Width of column ${divider.index}`}
            aria-orientation="horizontal"
            aria-valuemin={1}
            aria-valuemax={rightCell - leftCell - 1}
            aria-valuenow={cells[divider.index - 1] - (divider.index === 1 ? leftCell : cells[divider.index - 2])}
            data-column-divider={divider.index}
            onPointerDown={(event) => onPointerDown(event, divider.index)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerEnter={() => setHovered(divider.index)}
            onPointerLeave={() => setHovered(null)}
            onKeyDown={(event) => onKeyDown(event, divider.index)}
            onFocus={() => setFocused(divider.index)}
            onBlur={() => setFocused(null)}
            className="memari-divider-handle"
            style={{
              position: "absolute",
              left: pad + (divider.x - box.x) * scale - 11,
              top: pad + (divider.top - box.y) * scale,
              width: 22,
              height,
              cursor: "col-resize",
              touchAction: "none",
              outline: "none",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 10,
                top: 0,
                width: 2,
                height,
                background: ACCENT,
                opacity: lit ? 0.75 : 0,
                transition: "opacity 120ms ease-out",
              }}
            />
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 6,
                top: Math.min(height / 2, 36) - 14,
                width: 10,
                height: 28,
                // A capsule, as Apple's grabbers are.
                borderRadius: 5,
                background: ACCENT,
                boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                opacity: lit ? 1 : 0.55,
                transition: "opacity 120ms ease-out",
              }}
            />
          </div>
        );
      })}
    </>
  );
}
