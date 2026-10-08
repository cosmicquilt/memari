"use client";

// The preferences, saved as they change: a new journal starts from them (the
// start dialog's Create form), and a journal already made keeps its own.

import { useState, useTransition } from "react";
import type { Preferences } from "@/lib/preferences";
import { BACKDROP_LABELS, BACKDROP_THEMES, writeBackdropCookie, type BackdropTheme } from "@/lib/backdropCookie";
import { CREAM, cream } from "@/lib/cream";
import { savePreferences, saveTimeZone } from "../actions";

function Choice<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-label`} style={{ display: "grid", gap: 8 }}>
      <span id={`${id}-label`} style={{ fontSize: 13, color: cream(0.75) }}>
        {label}
      </span>
      <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={v === value}
            onClick={() => onChange(v)}
            className="acct-btn"
            style={v === value ? { background: "#2d3170", color: CREAM, boxShadow: "inset 0 0 0 1px #4a5cff" } : undefined}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PreferencesForm({ initial, zone: initialZone, zones, theme: initialTheme }: { initial: Preferences; zone: string; zones: string[]; theme: BackdropTheme }) {
  const [prefs, setPrefs] = useState(initial);
  const [zone, setZone] = useState(initialZone);
  const [theme, setTheme] = useState(initialTheme);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const change = (next: Preferences) => {
    setPrefs(next);
    setError(null);
    start(async () => {
      try {
        await savePreferences(next);
        setSaved("Saved. New journals start from these.");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <>
      <div className="acct-card">
        <h2>New journals</h2>
        <p className="acct-dim">What a new journal starts with. You can still change each one when you make it, and journals you already have keep their own.</p>
        <Choice id="week" label="Week starts on" value={String(prefs.weekStartDay) as "0" | "1"} options={[["0", "Sunday"], ["1", "Monday"]]} onChange={(v) => change({ ...prefs, weekStartDay: v === "1" ? 1 : 0 })} />
        <Choice id="size" label="Page size" value={prefs.trim} options={[["bound7x10", "7 × 10 in (bound)"], ["letter", "US Letter (print at home)"]]} onChange={(v) => change({ ...prefs, trim: v })} />
        <Choice id="font" label="Font" value={prefs.font} options={[["serif", "Serif"], ["sans", "Sans"]]} onChange={(v) => change({ ...prefs, font: v })} />
      </div>

      <div className="acct-card">
        <h2>Time zone</h2>
        <p className="acct-dim">The dates and times your books follow, unless a journal has a zone of its own. Changing it redraws those journals.</p>
        <label style={{ display: "grid", gap: 8, maxWidth: 360 }}>
          <span style={{ fontSize: 13, color: cream(0.75) }}>Time zone</span>
          <select
            id="time-zone"
            value={zone}
            onChange={(e) => {
              const next = e.target.value;
              setZone(next);
              setError(null);
              start(async () => {
                try {
                  await saveTimeZone(next);
                  setSaved("Saved. Your journals now follow this time zone.");
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              });
            }}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="acct-card">
        <h2>Start screen</h2>
        <p className="acct-dim">The background behind your journals when you open Memari. Kept in this browser.</p>
        <Choice
          id="theme"
          label="Theme"
          value={theme}
          options={BACKDROP_THEMES.map((t) => [t, BACKDROP_LABELS[t]] as [BackdropTheme, string])}
          onChange={(t) => {
            setTheme(t);
            writeBackdropCookie(t);
            setSaved("Saved in this browser.");
          }}
        />
      </div>

      <p role="status" aria-live="polite" className="acct-dim" style={{ minHeight: 20, color: error ? "#ff8f7a" : cream(0.6) }}>
        {error ?? (pending ? "Saving…" : saved)}
      </p>
    </>
  );
}
