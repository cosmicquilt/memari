"use client";

// The hours' own settings, in the hours' own editor.
//
// Moved out of Page Settings on 2026-09-29: "add edit button to center of
// hourly section on each page and move its settings from the side palette:
// Increments, week starts on, and also dotted vs blank when increments are
// off". Opened by the same centred pencil every other module has, on hover.
//
// STILL THE WHOLE JOURNAL'S. Every page's hours are sized from one set of
// settings - a weekly spread and a daily page are one book's day - and that
// is kept (asked, same day: "Whole journal"). The form says so, because an
// editor opened from one page's hours reads as editing those hours alone.
//
// PURE, like ModuleFieldsForm: it shows values and reports changes, and the
// editor owns the draft - so the preview beside it is redrawn from the same
// draft on every change, and saving is one place.

import { EDITOR_RADIUS } from "./editorStyle";
import type { CSSProperties } from "react";
import { ROW_HEIGHT_OPTIONS_PT } from "@/lib/modules/hourlyGridCore";
import { FOCUS_CSS, RuleSwatch, ruleSwatchWidth, type RuleSample } from "./ModuleFieldsForm";

export const WEEK_START_DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Snaps a raw "HH:MM" <input type="time"> value to the nearest 30-min
// mark — requested directly: "round inputs to the nearest 30 mins."
// Clamped to [00:00, 23:30] rather than wrapping past midnight (e.g. a
// typed 23:45 becomes 23:30, not 00:00) — this app has no notion of an
// overnight range yet (updateHourlySettings already rejects endTime <=
// startTime), so wrapping would just produce a value the server refuses.
export function roundToNearestHalfHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const snapped = Math.min(23 * 60 + 30, Math.max(0, Math.round((h * 60 + m) / 30) * 30));
  const snappedHour = Math.floor(snapped / 60);
  const snappedMinute = snapped % 60;
  return `${String(snappedHour).padStart(2, "0")}:${String(snappedMinute).padStart(2, "0")}`;
}

/** What the form edits: the hours' own props, and the book's week start. */
export type HoursDraft = {
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  intervalMode: "on" | "off";
  compactHourRows: boolean;
  rowHeightPt: number;
  offModeRule: "dotted" | "none";
  hourLineStyle: "full" | "low-transparency" | "gone";
  dayBorder: boolean;
  timeFormat: "12" | "24";
  weekStartDay: number;
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "rgba(255, 255, 255, 0.6)",
};

// The fields panel's own input look - see ModuleFieldsForm's inputStyle for
// why the border is 0.33 white.
const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 9px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "#f2f2f2",
  background: "rgba(255, 255, 255, 0.06)",
  border: "1px solid rgba(255, 255, 255, 0.33)",
  borderRadius: EDITOR_RADIUS,
  // The time inputs' picker button, light on the dark panel - reported
  // directly: "the view time picker button isn't very visible because it
  // is dark on a dark background."
  colorScheme: "dark",
};

const rowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

export function HoursFields({
  values,
  onChange,
  drawRule,
}: {
  values: HoursDraft;
  onChange: (next: HoursDraft) => void;
  /** Draws the hours with one setting changed, for the picture pickers. */
  drawRule: (key: "offModeRule" | "hourLineStyle", value: string) => RuleSample;
}) {
  const set = <K extends keyof HoursDraft>(key: K, value: HoursDraft[K]) => onChange({ ...values, [key]: value });
  const increments = values.intervalMode === "off" ? "off" : values.intervalMinutes === 60 ? "60" : "30";
  const fills = [
    { value: "dotted" as const, label: "Dotted" },
    { value: "none" as const, label: "Blank" },
  ];
  // The hour rules, drawn - the renderer has drawn all three since the first
  // template; nothing offered them until the module-edits list (2026-09-30).
  const hourRules = [
    { value: "full" as const, label: "Solid" },
    { value: "low-transparency" as const, label: "Faint" },
    { value: "gone" as const, label: "None" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{FOCUS_CSS}</style>
      <label style={rowStyle}>
        <span style={labelStyle}>Increments</span>
        <select
          value={increments}
          onChange={(event) => {
            const next = event.target.value;
            onChange(
              next === "off"
                ? { ...values, intervalMode: "off" }
                : { ...values, intervalMode: "on", intervalMinutes: next === "60" ? 60 : 30 }
            );
          }}
          className="memari-field"
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          <option value="30">30 min</option>
          <option value="60">1 hour</option>
          <option value="off">Off</option>
        </select>
      </label>

      {values.intervalMode === "off" ? (
        // What the free space is filled with. Only with increments off: with
        // them on the hours are ruled, and there is nothing to fill.
        <div style={rowStyle}>
          <span style={labelStyle}>Fill</span>
          <div role="radiogroup" aria-label="Fill" style={{ display: "flex", gap: 10 }}>
            {fills.map((fill) => (
              <RuleSwatch
                key={fill.value}
                sample={drawRule("offModeRule", fill.value)}
                label={fill.label}
                selected={values.offModeRule === fill.value}
                onPick={() => set("offModeRule", fill.value)}
                width={ruleSwatchWidth(fills.length)}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10 }}>
            <label style={{ ...rowStyle, flex: 1 }}>
              <span style={labelStyle}>Start</span>
              <input
                type="time"
                step={1800}
                value={values.startTime}
                onChange={(event) => set("startTime", roundToNearestHalfHour(event.target.value))}
                className="memari-field"
                style={inputStyle}
              />
            </label>
            <label style={{ ...rowStyle, flex: 1 }}>
              <span style={labelStyle}>End</span>
              <input
                type="time"
                step={1800}
                value={values.endTime}
                onChange={(event) => set("endTime", roundToNearestHalfHour(event.target.value))}
                className="memari-field"
                style={inputStyle}
              />
            </label>
          </div>
          <label style={rowStyle}>
            <span style={labelStyle}>Row height</span>
            <select
              value={String(values.rowHeightPt)}
              onChange={(event) => set("rowHeightPt", Number(event.target.value))}
              className="memari-field"
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {/* All three land on the 1/4in lattice, but only 9 and 18
                  divide the pitch, so only they put a rule on every cell
                  line. 12 repeats every two cells instead - roomier, and
                  still aligned. 18 at 30-minute increments is 9 inches of
                  rows, the whole usable page, so saving will report that it
                  does not fit rather than this hiding the option. */}
              {ROW_HEIGHT_OPTIONS_PT.map((pt) => (
                <option key={pt} value={pt}>
                  {pt === 9 ? "Compact" : pt === 12 ? "Roomy" : "Tall"}
                </option>
              ))}
            </select>
          </label>
          {values.intervalMinutes === 60 && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ddd" }}>
              <input
                type="checkbox"
                checked={values.compactHourRows}
                onChange={(event) => set("compactHourRows", event.target.checked)}
                className="memari-field"
              />
              Compact hour rows
            </label>
          )}
          <div style={rowStyle}>
            <span style={labelStyle}>Hour rules</span>
            <div role="radiogroup" aria-label="Hour rules" style={{ display: "flex", gap: 10 }}>
              {hourRules.map((rule) => (
                <RuleSwatch
                  key={rule.value}
                  sample={drawRule("hourLineStyle", rule.value)}
                  label={rule.label}
                  selected={(values.hourLineStyle ?? "full") === rule.value}
                  onPick={() => set("hourLineStyle", rule.value)}
                  width={ruleSwatchWidth(hourRules.length)}
                />
              ))}
            </div>
          </div>
          <label style={rowStyle}>
            <span style={labelStyle}>Time labels</span>
            <select
              value={values.timeFormat === "24" ? "24" : "12"}
              onChange={(event) => set("timeFormat", event.target.value === "24" ? "24" : "12")}
              className="memari-field"
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="12">12-hour</option>
              <option value="24">24-hour</option>
            </select>
          </label>
        </>
      )}


      <label style={rowStyle}>
        <span style={labelStyle}>Week starts on</span>
        <select
          value={values.weekStartDay}
          onChange={(event) => set("weekStartDay", Number(event.target.value))}
          className="memari-field"
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          {WEEK_START_DAY_LABELS.map((label, i) => (
            <option key={label} value={i}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "rgba(255, 255, 255, 0.5)" }}>
        Applies to the hours on every page of this journal.
      </p>
    </div>
  );
}
