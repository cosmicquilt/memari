"use client";

// AN ICON CHOSEN WHERE IT PRINTS. Each group of an icon strip's marks on the
// preview is a button; clicking one opens a small chooser beside it - how far
// the choice reaches (the whole strip, this row, this day) and the icons
// drawn as they print. Asked 2026-10-01 for the icon strip's editor: "as
// simple and compact as possible without sacrificing usability ... and if
// needed edit it by clicking on the one". It replaced two lists of ten
// pictures per row and per day in the panel, the one panel that scrolled.
//
// A day's own icon wins in its column, then the row's, then the strip's -
// see iconStrip.ts - so the chooser opens on the reach the clicked icon
// already has.

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { GlyphSwatch } from "./ModuleFieldsForm";
import { CONTROL_RADIUS, PANEL_RADIUS, concentric } from "./editorStyle";
import type { GlyphShape } from "@/lib/modules/glyphs";
import type { RenderedPolotnoElement } from "@/lib/renderModuleInstance";

type Reach = "strip" | "row" | "day";

export type IconPicksField = {
  /** The strip's own icon, and the lists of a row's and a day's. */
  iconKey: string;
  rowKey: string;
  dayKey: string;
  /** A mark's id after the instance id, naming its row and day. */
  mark: string;
  options: Array<{ value: string; label: string }>;
};

type Group = { s: number; g: number; x: number; y: number; width: number; height: number };

export function IconPicksOnPage({
  field,
  marks,
  instanceId,
  values,
  onChange,
  box,
  scale,
  pad,
  frame,
  dayNames,
}: {
  field: IconPicksField;
  marks: RenderedPolotnoElement[];
  instanceId: string;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  box: { x: number; y: number; width: number; height: number };
  scale: number;
  pad: number;
  /** The preview's frame, so the chooser stays inside it. */
  frame: { width: number; height: number };
  /** Each group's day, where the strip names its days. */
  dayNames: string[] | null;
}) {
  const [open, setOpen] = useState<{ s: number; g: number; reach: Reach } | null>(null);
  const chooser = useRef<HTMLDivElement | null>(null) as MutableRefObject<HTMLDivElement | null>;

  // The marks, gathered into one target per row and day.
  const pattern = new RegExp(`^${instanceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${field.mark}`);
  const byGroup = new Map<string, Group>();
  for (const mark of marks) {
    const match = pattern.exec(String(mark.id));
    if (!match) continue;
    const s = Number(match[1]);
    const g = Number(match[2]);
    const key = `${s}:${g}`;
    const x = mark.x ?? 0;
    const y = mark.y ?? 0;
    const right = x + (mark.width ?? 0);
    const bottom = y + (mark.height ?? 0);
    const had = byGroup.get(key);
    if (!had) byGroup.set(key, { s, g, x, y, width: right - x, height: bottom - y });
    else {
      const left = Math.min(had.x, x);
      const top = Math.min(had.y, y);
      byGroup.set(key, {
        s,
        g,
        x: left,
        y: top,
        width: Math.max(had.x + had.width, right) - left,
        height: Math.max(had.y + had.height, bottom) - top,
      });
    }
  }
  const groups = [...byGroup.values()];
  const rows = new Set(groups.map((group) => group.s)).size;
  const days = new Set(groups.map((group) => group.g)).size;

  const list = (key: string) => (Array.isArray(values[key]) ? (values[key] as unknown[]).map((v) => (typeof v === "string" ? v : "")) : []);
  const valid = new Set(field.options.map((option) => option.value));
  const own = (key: string, index: number) => {
    const value = list(key)[index];
    return value && valid.has(value) ? value : null;
  };
  const stripIcon = typeof values[field.iconKey] === "string" ? (values[field.iconKey] as string) : field.options[0]?.value;
  // What the clicked icon is at each reach - the one each would show.
  const current = (reach: Reach, s: number, g: number) =>
    reach === "day"
      ? own(field.dayKey, g) ?? own(field.rowKey, s) ?? stripIcon
      : reach === "row"
      ? own(field.rowKey, s) ?? stripIcon
      : stripIcon;

  const set = (key: string, index: number, value: string) => {
    const next = list(key);
    while (next.length <= index) next.push("");
    next[index] = value;
    onChange(key, next);
  };
  const pick = (value: string) => {
    if (!open) return;
    if (open.reach === "strip") onChange(field.iconKey, value);
    else if (open.reach === "row") set(field.rowKey, open.s, value);
    else set(field.dayKey, open.g, value);
  };

  // Away, or Escape, closes it - and only it: Escape is not the editor's
  // while the chooser is open.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (chooser.current && !chooser.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest?.("[data-icon-group]")) setOpen(null);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(null);
      }
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);

  const at = (group: Group) => ({
    left: pad + (group.x - box.x) * scale,
    top: pad + (group.y - box.y) * scale,
    width: group.width * scale,
    height: group.height * scale,
  });
  const name = (group: { s: number; g: number }) =>
    `${rows > 1 ? `row ${group.s + 1}` : "the strip"}${days > 1 ? `, ${dayNames?.[group.g] ?? `group ${group.g + 1}`}` : ""}`;

  const openGroup = open ? groups.find((group) => group.s === open.s && group.g === open.g) : null;
  // Sized from what it holds: the icons in one row inside its padding and
  // border (box-sizing is border-box here), which is the panel's radius less
  // a control's so what sits in its corners is concentric with them. A fixed
  // 248 spilt the row into the padding once that grew to 11 (panel 14,
  // controls 3).
  const SWATCH = 20;
  const GAP = 3;
  const CHOOSER_PADDING = PANEL_RADIUS - CONTROL_RADIUS;
  const CHOOSER_WIDTH = field.options.length * (SWATCH + GAP) - GAP + CHOOSER_PADDING * 2 + 2;
  // Reach buttons, the icons, the reset line, the gaps between them.
  const CHOOSER_HEIGHT = CHOOSER_PADDING * 2 + 2 + 26 + 8 + SWATCH + 8 + 18;
  const place = openGroup ? at(openGroup) : null;
  const chooserLeft = place ? Math.max(4, Math.min(place.left + place.width / 2 - CHOOSER_WIDTH / 2, frame.width - CHOOSER_WIDTH - 4)) : 0;
  const below = place ? place.top + place.height + 8 : 0;
  const chooserTop = place ? (below + CHOOSER_HEIGHT > frame.height ? Math.max(4, place.top - CHOOSER_HEIGHT - 8) : below) : 0;
  const reaches: Reach[] = ["strip", ...(rows > 1 ? (["row"] as Reach[]) : []), ...(days > 1 ? (["day"] as Reach[]) : [])];

  return (
    <>
      {groups.map((group) => {
        const r = at(group);
        const isOpen = open?.s === group.s && open?.g === group.g;
        return (
          <button
            key={`${group.s}:${group.g}`}
            type="button"
            data-icon-group={`${group.s}:${group.g}`}
            aria-label={`Icons for ${name(group)}`}
            aria-expanded={isOpen}
            onClick={() =>
              setOpen(
                isOpen
                  ? null
                  : {
                      s: group.s,
                      g: group.g,
                      reach: own(field.dayKey, group.g) ? "day" : own(field.rowKey, group.s) ? "row" : "strip",
                    }
              )
            }
            className="memari-icon-group"
            style={{
              position: "absolute",
              left: r.left - 3,
              top: r.top - 3,
              width: r.width + 6,
              height: r.height + 6,
              padding: 0,
              border: "none",
              borderRadius: 2,
              background: isOpen ? "rgba(35, 31, 32, 0.08)" : "transparent",
              cursor: "pointer",
            }}
          />
        );
      })}
      <style>{`.memari-icon-group:hover { background: rgba(35, 31, 32, 0.06) !important; }`}</style>
      {open && openGroup && (
        <div
          ref={chooser}
          role="dialog"
          aria-label={`Icon for ${name(openGroup)}`}
          style={{
            position: "absolute",
            left: chooserLeft,
            top: chooserTop,
            width: CHOOSER_WIDTH,
            padding: CHOOSER_PADDING,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: "#26262a",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: PANEL_RADIUS,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
            color: "#eee",
            fontSize: 12,
            zIndex: 2,
            colorScheme: "dark",
          }}
        >
          {reaches.length > 1 && (
            <div role="radiogroup" aria-label="How far it reaches" style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: CONTROL_RADIUS, padding: 2 }}>
              {reaches.map((reach) => (
                <button
                  key={reach}
                  type="button"
                  role="radio"
                  aria-checked={open.reach === reach}
                  onClick={() => setOpen({ ...open, reach })}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    border: "none",
                    borderRadius: concentric(CONTROL_RADIUS, 2),
                    background: open.reach === reach ? "rgba(255,255,255,0.16)" : "transparent",
                    color: open.reach === reach ? "#fff" : "rgba(255,255,255,0.65)",
                    font: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {reach === "strip" ? "Strip" : reach === "row" ? "Row" : "Day"}
                </button>
              ))}
            </div>
          )}
          <div role="radiogroup" aria-label="Icon" style={{ display: "flex", gap: GAP }}>
            {field.options.map((option) => (
              <GlyphSwatch
                key={option.value}
                size={SWATCH}
                shape={option.value as GlyphShape}
                label={option.label}
                selected={current(open.reach, open.s, open.g) === option.value}
                onPick={() => pick(option.value)}
              />
            ))}
          </div>
          {open.reach !== "strip" && own(open.reach === "row" ? field.rowKey : field.dayKey, open.reach === "row" ? open.s : open.g) && (
            <button
              type="button"
              onClick={() => (open.reach === "row" ? set(field.rowKey, open.s, "") : set(field.dayKey, open.g, ""))}
              style={{ alignSelf: "flex-start", padding: 0, border: "none", background: "transparent", color: "rgba(255,255,255,0.7)", font: "inherit", cursor: "pointer" }}
            >
              Use the {open.reach === "day" && own(field.rowKey, open.s) ? "row's" : "strip's"} icon
            </button>
          )}
        </div>
      )}
    </>
  );
}
