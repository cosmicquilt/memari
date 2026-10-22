"use client";

// Sliders for the body's doodle wall, on the landing page itself - shown only
// in development (Landing.tsx renders it only then). Dragging one repacks the
// wall at once; Save writes the settings to bodyWallSettings.json
// (/dev/doodles/body), which is how they reach the live site: committed and
// pushed like any other change.

import { useEffect, useState } from "react";
import { BODY_WALL_DEFAULTS, INK_PAPERS, bodyWallSettings, onBodyWallSettings, pageVars, PAPER_LAYERS, setBodyWallSettings, type BodyWallSettings, type InkPaper } from "./bodyWall";

const SLIDERS: Array<{ key: keyof BodyWallSettings; label: string; min: number; max: number; step: number; unit: string }> = [
  // First: it changes every page of the site, not just this one.
  { key: "creamDepth", label: "Cream, whole site (0 white, 2 deep)", min: 0, max: 2, step: 0.01, unit: "x" },
  { key: "peekDesktop", label: "Cream on load, desktop", min: 0, max: 40, step: 1, unit: "% of screen" },
  { key: "heroCropDesktop", label: "Crop hero from the top, desktop", min: 0, max: 30, step: 0.5, unit: "% of screen" },
  { key: "heroParallax", label: "Hero parallax (below the paper)", min: 0, max: 0.6, step: 0.01, unit: "of the scroll" },
  { key: "peekMobile", label: "Cream on load, phone", min: 0, max: 40, step: 1, unit: "% of screen" },
  { key: "carouselGap", label: "Collage below the post-it", min: 0, max: 200, step: 1, unit: "px" },
  { key: "rowDoodleSize", label: "Doodles above the collage, size", min: 0.5, max: 4, step: 0.05, unit: "x" },
  { key: "carouselSpeed", label: "Collage speed", min: 5, max: 200, step: 1, unit: "px/s" },
  { key: "carouselBlur", label: "Collage edge blur width", min: 2, max: 30, step: 0.5, unit: "% of screen" },
  { key: "bandDesktop", label: "No doodles below hero, desktop", min: 0, max: 150, step: 1, unit: "% of screen" },
  { key: "bandMobile", label: "No doodles below hero, phone", min: 0, max: 150, step: 1, unit: "% of screen" },
  { key: "gap", label: "Gap between doodles", min: 0, max: 48, step: 1, unit: "px" },
  { key: "clearance", label: "Clearance round content", min: 0, max: 96, step: 1, unit: "px" },
  { key: "size", label: "Doodle size", min: 0.4, max: 1.8, step: 0.05, unit: "x" },
  { key: "density", label: "How many", min: 0.05, max: 2, step: 0.05, unit: "x" },
  { key: "ink", label: "Ink strength", min: 0.05, max: 1, step: 0.01, unit: "" },
  { key: "sideBlur", label: "Hero side blur, at the edge", min: 0, max: 16, step: 0.5, unit: "px" },
  { key: "sideBlurWidth", label: "Hero side blur, reaches in", min: 0, max: 40, step: 1, unit: "% of screen" },
  { key: "vignetteTop", label: "Hero vignette, top", min: 0, max: 1, step: 0.01, unit: "" },
  { key: "vignetteTopReach", label: "Top reaches down", min: 0, max: 60, step: 1, unit: "% of hero" },
  { key: "vignetteBottom", label: "Hero vignette, bottom", min: 0, max: 1, step: 0.01, unit: "" },
  { key: "vignetteBottomReach", label: "Bottom reaches up", min: 0, max: 60, step: 1, unit: "% of hero" },
  { key: "vignetteSides", label: "Hero vignette, sides", min: 0, max: 1, step: 0.01, unit: "" },
  { key: "vignetteSidesReach", label: "Sides reach in", min: 0, max: 50, step: 1, unit: "% of width" },
  { key: "vignetteCorners", label: "Hero vignette, corners", min: 0, max: 1, step: 0.01, unit: "" },
  { key: "tornScale", label: "Torn edge photo size", min: 0.2, max: 1, step: 0.01, unit: "x" },
  { key: "tornShadow", label: "Torn edge shadow", min: 0, max: 2, step: 0.05, unit: "x" },
  { key: "curlShade", label: "Post-it curl shade", min: 0, max: 0.5, step: 0.01, unit: "" },
  { key: "curlReach", label: "Post-it curl shade reaches", min: 0.1, max: 1, step: 0.05, unit: "of the curl" },
  // last, the papers: each its own strength, any together
  ...PAPER_LAYERS.map((p) => ({ key: p.key, label: p.label, min: 0, max: 1, step: 0.01, unit: "" })),
  // The very last ("bring the two sliders down so they are the last
  // sliders"): the paper in the ink, with its paper and switches under them.
  { key: "doodlePaper", label: "Paper through the doodles, whole site", min: 0, max: 3, step: 0.01, unit: "" },
  { key: "textPaper", label: "Paper through the text, whole site", min: 0, max: 3, step: 0.01, unit: "" },
];

/** The torn edges to choose from (TornEdge.tsx): the drawn deckle, Flow's
 *  two photographs (handoff/flow/torn edge), or none. */
const TORN_EDGES: Array<[BodyWallSettings["tornEdge"], string]> = [
  ["drawn", "Drawn deckle"],
  ["flow-fine", "Flow photo, fine"],
  ["flow-bold", "Flow photo, bold"],
  ["none", "None (straight)"],
];

/** Replay keeps the sliders as they are through the reload it takes (not
 *  saved - the page reads the saved file again otherwise). */
const REPLAY_KEY = "memari-tuner-replay";

/** The settings, live: the page's wall, hero and film follow at once. */
function apply(next: BodyWallSettings) {
  setBodyWallSettings(next);
  paint(next);
}

/** The page's variables and switches for some settings. */
function paint(next: BodyWallSettings) {
  // The hero's height, side blur and vignette: the page sets these from the
  // saved settings (Landing.tsx), so they are set on the same element here.
  const page = document.querySelector("main")?.parentElement;
  for (const [name, value] of Object.entries(pageVars(next))) page?.style.setProperty(name, String(value));
  // The paper in the text is drawn only while it is wanted (landing.module.css).
  page?.toggleAttribute("data-text-paper", (next.textPaper ?? 0) > 0);
  page?.toggleAttribute("data-text-paper-links", !!next.textPaperLinks);
  page?.toggleAttribute("data-text-paper-all", !!next.textPaperOffPaper);
  // and in the pen drawings (InkPaperFilter.tsx)
  page?.toggleAttribute("data-doodle-paper", (next.doodlePaper ?? 0) > 0);
}

export function BodyWallTuner() {
  const [open, setOpen] = useState(true);
  const [s, setS] = useState<BodyWallSettings>(bodyWallSettings());
  const [message, setMessage] = useState<string | null>(null);
  const update = (next: BodyWallSettings) => {
    setS(next);
    apply(next);
    setMessage(null);
  };
  // After a Replay: the sliders as they were (the panel follows the
  // settings it is subscribed to).
  useEffect(() => {
    const off = onBodyWallSettings(() => setS(bodyWallSettings()));
    try {
      const kept = sessionStorage.getItem(REPLAY_KEY);
      if (kept) {
        sessionStorage.removeItem(REPLAY_KEY);
        apply({ ...BODY_WALL_DEFAULTS, ...(JSON.parse(kept) as Partial<BodyWallSettings>) });
      }
    } catch {
      // No session storage: Replay shows the saved settings.
    }
    return () => void off();
  }, []);
  const replay = () => {
    try {
      sessionStorage.setItem(REPLAY_KEY, JSON.stringify(s));
    } catch {
      // Replays with the saved settings.
    }
    window.scrollTo(0, 0);
    location.reload();
  };
  const save = async () => {
    setMessage("Saving...");
    const res = await fetch("/dev/doodles/body", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
    const out = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Saved to bodyWallSettings.json" : `Not saved: ${out.error ?? res.statusText}`);
  };

  return (
    <div
      // Its own labels are not part of the page's look.
      data-paper-skip=""
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
        <strong style={{ flex: 1 }}>Landing tuning (dev)</strong>
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
          {/* Under the last two sliders, the paper in the ink: which paper,
              and where it reaches. */}
          <label style={{ display: "grid", gap: 2 }}>
            <span>Paper in the ink: which paper</span>
            <select
              value={s.inkPaper ?? "app"}
              onChange={(e) => update({ ...s, inkPaper: e.target.value as InkPaper })}
              // the panel's width, not its longest option's
              style={{ font: "inherit", fontSize: 12, padding: "3px 6px", borderRadius: 6, background: "#2a2622", color: "inherit", border: "1px solid rgba(245,234,213,0.4)", width: "100%", minWidth: 0 }}
            >
              {INK_PAPERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 2 }}>
            <span>Paper in the ink: how it meets the ink</span>
            <select
              value={s.inkBlend ?? "overlay"}
              onChange={(e) => update({ ...s, inkBlend: e.target.value as BodyWallSettings["inkBlend"] })}
              style={{ font: "inherit", fontSize: 12, padding: "3px 6px", borderRadius: 6, background: "#2a2622", color: "inherit", border: "1px solid rgba(245,234,213,0.4)", width: "100%", minWidth: 0 }}
            >
              <option value="overlay">Grain in the ink&rsquo;s colour (overlay)</option>
              <option value="hard-light">Flecks of paper through it (hard-light)</option>
              <option value="through">Paper showing through: gaps where the pen skips (strongest)</option>
            </select>
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={!!s.textPaperLinks} onChange={(e) => update({ ...s, textPaperLinks: e.target.checked })} />
            Paper in the text: links and buttons too
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={!!s.textPaperOffPaper} onChange={(e) => update({ ...s, textPaperOffPaper: e.target.checked })} />
            Paper in the text: off the paper too (hero, nav, popups)
          </label>
          {/* "have a switch or dev panel options for seeing the difference":
              held, the page as it would be with both at 0; let go, back.
              Only the page's variables - the settings are not touched. */}
          <button
            type="button"
            style={{ ...btn, justifySelf: "start", opacity: s.doodlePaper || s.textPaper ? 1 : 0.5 }}
            disabled={!s.doodlePaper && !s.textPaper}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              paint({ ...s, doodlePaper: 0, textPaper: 0 });
            }}
            onPointerUp={() => paint(s)}
            onPointerCancel={() => paint(s)}
            onKeyDown={(e) => (e.key === " " || e.key === "Enter") && paint({ ...s, doodlePaper: 0, textPaper: 0 })}
            onKeyUp={() => paint(s)}
            onBlur={() => paint(s)}
          >
            Hold to see without the paper
          </button>
          <hr style={{ border: 0, borderTop: "1px solid rgba(245,234,213,0.2)", margin: "4px 0" }} />
          <label style={{ display: "grid", gap: 2 }}>
            <span>Torn edge under the hero</span>
            <select
              value={s.tornEdge}
              onChange={(e) => update({ ...s, tornEdge: e.target.value as BodyWallSettings["tornEdge"] })}
              style={{ font: "inherit", fontSize: 12, padding: "3px 6px", borderRadius: 6, background: "#2a2622", color: "inherit", border: "1px solid rgba(245,234,213,0.4)" }}
            >
              {TORN_EDGES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
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
            <button type="button" style={btn} onClick={replay} title="Reload the page to watch the book open again, keeping these sliders">
              Replay
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
