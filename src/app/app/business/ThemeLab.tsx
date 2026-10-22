"use client";

// Development only: the business screens' candidate themes, side by side
// (2026-10-22: "make a dev tools popup for me to compare potential themes you
// think would look good" - Apple's website, combined with our own style).
// Each sets data-theme on the business area; business.module.css has them.
// The choice is kept in this browser while comparing, and sent nowhere.

import { useEffect, useState } from "react";

const THEMES: Array<{ key: string; name: string; about: string; swatch: [bg: string, card: string, accent: string, ink: string] }> = [
  { key: "current", name: "Current", about: "As built: grey ground, outlined cards, square buttons.", swatch: ["#f5f5f7", "#ffffff", "#4a5cff", "#1d1d1f"] },
  { key: "apple", name: "Apple", about: "apple.com as it is: white cards without lines, big tight headlines, pills, Apple's blue.", swatch: ["#f5f5f7", "#ffffff", "#0071e3", "#1d1d1f"] },
  { key: "studio", name: "Studio", about: "Apple's structure in our words: a whisper of cream, ink type, the pen's blue, soft lifted cards.", swatch: ["#f7f4ee", "#ffffff", "#4a5cff", "#1c1917"] },
  { key: "paper", name: "Paper", about: "The book itself: the landing's cream, Newsreader headlines, paper cards.", swatch: ["#f3ecdf", "#fffdf8", "#4a5cff", "#1c1917"] },
  { key: "ink", name: "Ink", about: "Apple's greys with black pill buttons, like a pen; blue only for links and where you are.", swatch: ["#f5f5f7", "#ffffff", "#1d1d1f", "#4a5cff"] },
  { key: "graphite", name: "Graphite", about: "Apple's dark, the editor's chrome carried into the business.", swatch: ["#000000", "#1c1c1e", "#6b7bff", "#f5f5f7"] },
];

const KEY = "memari-business-theme";

function apply(theme: string) {
  const root = document.querySelector<HTMLElement>("[data-biz-root]");
  if (!root) return;
  if (theme === "current") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function ThemeLab() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("current");
  useEffect(() => {
    let kept = "current";
    try {
      kept = localStorage.getItem(KEY) ?? "current";
    } catch {
      // no storage: the current theme
    }
    apply(kept);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the choice kept in this browser, read once it is here
    setTheme(kept);
  }, []);
  const choose = (key: string) => {
    setTheme(key);
    apply(key);
    try {
      localStorage.setItem(KEY, key);
    } catch {
      // kept for this visit only
    }
  };
  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 60,
        font: "13px/1.4 var(--font-ui)",
        color: "#f5f5f7",
      }}
    >
      {open ? (
        <div
          role="dialog"
          aria-label="Themes"
          style={{
            width: 320,
            maxHeight: "calc(100vh - 32px)",
            overflowY: "auto",
            padding: 10,
            borderRadius: 16,
            background: "rgba(28, 28, 30, 0.92)",
            backdropFilter: "saturate(180%) blur(20px)",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.3)",
            display: "grid",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px 6px" }}>
            <strong style={{ flex: 1 }}>Themes</strong>
            <span style={{ fontSize: 11, opacity: 0.6 }}>development only</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ border: "none", background: "rgba(255,255,255,0.12)", color: "inherit", borderRadius: 999, width: 24, height: 24, cursor: "pointer" }}>
              ×
            </button>
          </div>
          {THEMES.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={theme === t.key}
              onClick={() => choose(t.key)}
              style={{
                display: "grid",
                gridTemplateColumns: "auto minmax(0, 1fr)",
                gap: 10,
                alignItems: "center",
                textAlign: "left",
                padding: 8,
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                color: "inherit",
                font: "inherit",
                background: theme === t.key ? "rgba(107, 123, 255, 0.28)" : "rgba(255, 255, 255, 0.06)",
                boxShadow: theme === t.key ? "inset 0 0 0 1.5px #8a97ff" : "none",
              }}
            >
              <span style={{ display: "grid", gridTemplateColumns: "repeat(2, 14px)", gap: 3 }} aria-hidden="true">
                {t.swatch.map((c, i) => (
                  <span key={i} style={{ width: 14, height: 14, borderRadius: 4, background: c, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)" }} />
                ))}
              </span>
              <span>
                <strong>{t.name}</strong>
                <br />
                <span style={{ opacity: 0.7, fontSize: 12 }}>{t.about}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            border: "none",
            borderRadius: 999,
            padding: "8px 14px",
            background: "rgba(28, 28, 30, 0.88)",
            color: "#f5f5f7",
            font: "inherit",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
          }}
        >
          Themes · {THEMES.find((t) => t.key === theme)?.name}
        </button>
      )}
    </div>
  );
}
