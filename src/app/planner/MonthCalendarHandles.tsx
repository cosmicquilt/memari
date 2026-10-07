"use client";

// THE MONTH CALENDAR'S DATES AND DAY ICONS, ARRANGED ON THE PREVIEW.
//
// Asked 2026-10-06: the day icons "draggable as well as the line below the
// number to change the height of that row". Two handles over the left page's
// calendar, in CSS px outside the preview's transform as the table's column
// dividers are:
//
// - THE STRIP'S LINE, on the first week: dragged down or up a quarter cell at
//   a time, half a cell to a cell and a half. The strip's icons grow with it.
// - THE ICONS, on the first day that has any: picked up and dropped anywhere
//   in a day - in the strip, or in whichever corner of the writing space they
//   land nearest. Every day's icons go there; it is the calendar's setting,
//   not one day's.
//
// Both only change the draft; the calendar redraws from it, and the panel's
// menus say the same thing for anyone not dragging.

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { RenderedPolotnoElement } from "@/lib/renderModuleInstance";
import { STRIP_QUARTERS_MAX, STRIP_QUARTERS_MIN, STRIP_QUARTER_PT, type MonthIconPlace } from "@/lib/modules/monthGridCore";
import { ptToPx } from "@/lib/print-spec";

const ACCENT = "#4a5cff";

export function MonthCalendarHandles({
  elements,
  instanceId,
  box,
  scale,
  left,
  top,
  values,
  onChange,
}: {
  /** The left page's calendar as drawn, flattened - found by semantic ids. */
  elements: RenderedPolotnoElement[];
  instanceId: string;
  /** Its box, in print px. */
  box: { x: number; y: number; width: number; height: number };
  scale: number;
  /** Where the box's top-left is in the frame, in CSS px. */
  left: number;
  top: number;
  values: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const [stripActive, setStripActive] = useState(false);
  const [hover, setHover] = useState<"strip" | "icons" | null>(null);
  const [ghost, setGhost] = useState<{ dx: number; dy: number } | null>(null);
  const drag = useRef<{ kind: "strip" | "icons"; startY: number; startX: number; startQuarters: number } | null>(null);

  const find = (name: string) => elements.find((e) => e.id === `${instanceId}-${name}`);
  const centreY = (e: RenderedPolotnoElement | undefined) => (e ? Number(e.y ?? 0) + Number(e.height ?? 0) / 2 : NaN);
  const headerRule = find("header-rule");
  const contentTop = centreY(headerRule);
  const firstRule = find("w0-rule");
  const rowHeight = firstRule ? centreY(firstRule) - contentTop : NaN;
  if (!Number.isFinite(contentTop) || !Number.isFinite(rowHeight)) return null;
  const strip = values.dateStyle !== "faint";
  const quarter = ptToPx(STRIP_QUARTER_PT);
  const quarters = Math.min(STRIP_QUARTERS_MAX, Math.max(STRIP_QUARTERS_MIN, Math.round(Number(values.stripQuarters) || STRIP_QUARTERS_MIN)));
  const dayCount = Math.max(1, Number(values.dayCount) || 3);
  const colWidth = box.width / dayCount;
  const toScreenX = (x: number) => left + (x - box.x) * scale;
  const toScreenY = (y: number) => top + (y - box.y) * scale;

  // The first day with icons, and the rectangle they make.
  const icons = elements.filter((e) => new RegExp(`^${instanceId}-w\\d+-d\\d+-dayicon\\d+$`).test(String(e.id)));
  const firstCell = icons.length > 0 ? /-w(\d+)-d(\d+)-dayicon/.exec(String(icons[0].id)) : null;
  const cellIcons = firstCell ? icons.filter((e) => String(e.id).includes(`-w${firstCell[1]}-d${firstCell[2]}-dayicon`)) : [];
  const iconRect =
    cellIcons.length > 0
      ? {
          x: Math.min(...cellIcons.map((e) => Number(e.x))),
          y: Math.min(...cellIcons.map((e) => Number(e.y))),
          right: Math.max(...cellIcons.map((e) => Number(e.x) + Number(e.width))),
          bottom: Math.max(...cellIcons.map((e) => Number(e.y) + Number(e.height))),
        }
      : null;

  /** Where a drop at (x, y) in print px puts the icons, in the cell the drop is in. */
  const placeAt = (x: number, y: number): MonthIconPlace => {
    const w = Math.max(0, Math.floor((y - contentTop) / rowHeight));
    const d = Math.min(dayCount - 1, Math.max(0, Math.floor((x - box.x) / colWidth)));
    const rowTop = contentTop + w * rowHeight;
    const stripHeight = strip ? quarters * quarter : 0;
    if (strip && y < rowTop + stripHeight) return "strip";
    const writeMiddle = rowTop + stripHeight + (rowHeight - stripHeight) / 2;
    const cellMiddle = box.x + d * colWidth + colWidth / 2;
    return `${y < writeMiddle ? "top" : "bottom"}-${x < cellMiddle ? "left" : "right"}` as MonthIconPlace;
  };

  const down = (event: PointerEvent<HTMLDivElement>, kind: "strip" | "icons") => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind, startY: event.clientY, startX: event.clientX, startQuarters: quarters };
    if (kind === "strip") setStripActive(true);
    else setGhost({ dx: 0, dy: 0 });
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "strip") {
      const next = Math.min(STRIP_QUARTERS_MAX, Math.max(STRIP_QUARTERS_MIN, d.startQuarters + Math.round((event.clientY - d.startY) / (quarter * scale))));
      if (next !== quarters) onChange({ stripQuarters: next });
    } else {
      setGhost({ dx: event.clientX - d.startX, dy: event.clientY - d.startY });
    }
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    setStripActive(false);
    if (d?.kind === "icons" && iconRect) {
      const cx = (iconRect.x + iconRect.right) / 2 + (event.clientX - d.startX) / scale;
      const cy = (iconRect.y + iconRect.bottom) / 2 + (event.clientY - d.startY) / scale;
      const place = placeAt(cx, cy);
      if (place !== values.iconPlace) onChange({ iconPlace: place });
    }
    setGhost(null);
  };
  const stripKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const next = Math.min(STRIP_QUARTERS_MAX, Math.max(STRIP_QUARTERS_MIN, quarters + (event.key === "ArrowDown" ? 1 : -1)));
    if (next !== quarters) onChange({ stripQuarters: next });
  };

  const stripY = contentTop + quarters * quarter;
  const stripLit = stripActive || hover === "strip";
  return (
    <>
      {strip && (
        <div
          role="slider"
          tabIndex={0}
          aria-label="Height of the date strip, in quarter cells"
          aria-orientation="vertical"
          aria-valuemin={STRIP_QUARTERS_MIN}
          aria-valuemax={STRIP_QUARTERS_MAX}
          aria-valuenow={quarters}
          data-strip-handle
          onPointerDown={(event) => down(event, "strip")}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerEnter={() => setHover("strip")}
          onPointerLeave={() => setHover(null)}
          onKeyDown={stripKey}
          style={{
            position: "absolute",
            left: toScreenX(box.x),
            top: toScreenY(stripY) - 9,
            width: box.width * scale,
            height: 18,
            cursor: "row-resize",
            touchAction: "none",
            outline: "none",
          }}
        >
          <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 8, height: 2, background: ACCENT, opacity: stripLit ? 0.75 : 0, transition: "opacity 120ms ease-out" }} />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: Math.min(colWidth * scale, 72) - 14,
              top: 4,
              width: 28,
              height: 10,
              borderRadius: 5,
              background: ACCENT,
              boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
              opacity: stripLit ? 1 : 0.55,
              transition: "opacity 120ms ease-out",
            }}
          />
        </div>
      )}
      {iconRect && (
        <div
          role="button"
          tabIndex={-1}
          aria-label="Day icons - drag to move them"
          data-day-icons-handle
          onPointerDown={(event) => down(event, "icons")}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerEnter={() => setHover("icons")}
          onPointerLeave={() => setHover(null)}
          style={{
            position: "absolute",
            left: toScreenX(iconRect.x) - 3,
            top: toScreenY(iconRect.y) - 3,
            width: (iconRect.right - iconRect.x) * scale + 6,
            height: (iconRect.bottom - iconRect.y) * scale + 6,
            cursor: ghost ? "grabbing" : "grab",
            touchAction: "none",
            borderRadius: 4,
            boxShadow: ghost || hover === "icons" ? `0 0 0 2px ${ACCENT}` : "none",
            transform: ghost ? `translate(${ghost.dx}px, ${ghost.dy}px)` : undefined,
            background: ghost ? "rgba(74, 92, 255, 0.08)" : "transparent",
            transition: ghost ? undefined : "box-shadow 120ms ease-out",
          }}
        />
      )}
    </>
  );
}
