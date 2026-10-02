"use client";

// Sliders for the body's doodle wall, on the landing page itself - shown only
// in development (Landing.tsx renders it only then). Dragging one repacks the
// wall at once; Save writes the settings to bodyWallSettings.json
// (/dev/doodles/body), which is how they reach the live site: committed and
// pushed like any other change.

import { useState } from "react";
import { BODY_WALL_DEFAULTS, bodyWallSettings, setBodyWallSettings, type BodyWallSettings } from "./bodyWall";

const SLIDERS: Array<{ key: keyof BodyWallSettings; label: string; min: number; max: number; step: number; unit: string }> = [
  { key: "peekDesktop", label: "Cream on load, desktop", min: 0, max: 40, step: 1, unit: "% of screen" },
  { key: "peekMobile", label: "Cream on load, phone", min: 0, max: 40, step: 1, unit: "% of screen" },
  { key: "bandDesktop", label: "No doodles below hero, desktop", min: 0, max: 150, step: 1, unit: "% of screen" },
  { key: "bandMobile", label: "No doodles below hero, phone", min: 0, max: 150, step: 1, unit: "% of screen" },
  { key: "gap", label: "Gap between doodles", min: 0, max: 48, step: 1, unit: "px" },
  { key: "clearance", label: "Clearance round content", min: 0, max: 96, step: 1, unit: "px" },
  { key: "size", label: "Doodle size", min: 0.4, max: 1.8, step: 0.05, unit: "x" },
  { key: "density", label: "How many", min: 0.05, max: 2, step: 0.05, unit: "x" },
  { key: "ink", label: "Ink strength", min: 0.05, max: 1, step: 0.01, unit: "" },
];

export function BodyWallTuner() {
  const [open, setOpen] = useState(true);
  const [s, setS] = useState<BodyWallSettings>(bodyWallSettings());
  const [message, setMessage] = useState<string | null>(null);
  const update = (next: BodyWallSettings) => {
    setS(next);
    setBodyWallSettings(next);
    // The hero's height follows at once: the page sets these from the saved
    // settings (Landing.tsx), so they are set on the same element here.
    const page = document.querySelector("main")?.parentElement;
    page?.style.setProperty("--peek", String(next.peekDesktop));
    page?.style.setProperty("--peek-phone", String(next.peekMobile));
    setMessage(null);
  };
  const save = async () => {
    setMessage("Saving...");
    const res = await fetch("/dev/doodles/body", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
    const out = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Saved to bodyWallSettings.json" : `Not saved: ${out.error ?? res.statusText}`);
  };

  return (
    <div
      style={{
        // Top right, under the nav: clear of the post-it at the hero's foot.
        position: "fixed",
        right: 12,
        top: 72,
        maxHeight: "calc(100vh - 84px)",
        overflowY: "auto",
        zIndex: 40,
        width: open ? 300 : "auto",
        background: "rgba(28, 25, 23, 0.92)",
        color: "#f5ead5",
        borderRadius: 10,
        padding: open ? "10px 12px 12px" : "6px 10px",
        font: "12.5px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ flex: 1 }}>Body doodles (dev)</strong>
        <button type="button" onClick={() => setOpen((o) => !o)} style={btn}>
          {open ? "Hide" : "Tune"}
        </button>
      </div>
      {open && (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {SLIDERS.map((d) => (
            <label key={d.key} style={{ display: "grid", gap: 2 }}>
              <span style={{ display: "flex" }}>
                <span style={{ flex: 1 }}>{d.label}</span>
                <span style={{ opacity: 0.75 }}>
                  {String(s[d.key])} {d.unit}
                </span>
              </span>
              <input
                type="range"
                min={d.min}
                max={d.max}
                step={d.step}
                value={s[d.key] as number}
                onChange={(e) => update({ ...s, [d.key]: Number(e.target.value) })}
              />
            </label>
          ))}
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={s.newEachLoad} onChange={(e) => update({ ...s, newEachLoad: e.target.checked })} />
            A new arrangement each load
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={btn} onClick={() => update({ ...s, seed: Math.floor(Math.random() * 1e9) })} title="Another arrangement">
              Shuffle
            </button>
            <button type="button" style={btn} onClick={() => update(BODY_WALL_DEFAULTS)}>
              Reset
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" style={{ ...btn, background: "#4a5cff", borderColor: "#4a5cff", color: "#fff" }} onClick={save}>
              Save
            </button>
          </div>
          {message && <div style={{ opacity: 0.8 }}>{message}</div>}
        </div>
      )}
    </div>
  );
}

const btn = {
  font: "inherit",
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid rgba(245,234,213,0.5)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
} as const;
