"use client";

import { useState } from "react";
import { useAsyncAction } from "./useAsyncAction";

export type WeekSettings = {
  weekNumber: number;
  weekTotal: number;
  dateRangeLabel: string;
  leftDates: number[]; // [Sun, Mon, Tue]
  rightDates: number[]; // [Wed, Thu, Fri, Sat]
};

const LEFT_LABELS = ["Sun", "Mon", "Tue"];
const RIGHT_LABELS = ["Wed", "Thu", "Fri", "Sat"];

function updateDateAt(list: number[], index: number, value: string): number[] {
  const n = parseInt(value, 10);
  const next = [...list];
  next[index] = Number.isFinite(n) ? n : 0;
  return next;
}

function DateNumbersRow({
  title,
  dayLabels,
  dates,
  setDates,
}: {
  title: string;
  dayLabels: string[];
  dates: number[];
  setDates: (v: number[]) => void;
}) {
  return (
    <div>
      <div style={{ marginBottom: 4, color: "#777" }}>{title}</div>
      <div style={{ display: "flex", gap: 6 }}>
        {dayLabels.map((dayLabel, i) => (
          <label key={dayLabel} style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
            <span style={{ fontSize: 11, color: "#999" }}>{dayLabel}</span>
            <input
              type="number"
              value={dates[i] ?? ""}
              onChange={(e) => setDates(updateDateAt(dates, i, e.target.value))}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

// Editing for week-title + both pages' hourly-grid-core day numbers —
// locked/structural blocks that aren't individually selectable on the
// canvas, so they're edited here as one batch instead of through
// PropertiesPanel's select-a-module flow.
export function WeekSettingsPanel({
  initial,
  onSave,
}: {
  initial: WeekSettings;
  onSave: (settings: WeekSettings) => Promise<void>;
}) {
  const [weekNumber, setWeekNumber] = useState(initial.weekNumber);
  const [weekTotal, setWeekTotal] = useState(initial.weekTotal);
  const [dateRangeLabel, setDateRangeLabel] = useState(initial.dateRangeLabel);
  const [leftDates, setLeftDates] = useState(initial.leftDates);
  const [rightDates, setRightDates] = useState(initial.rightDates);
  const [saving, saveError, runSave] = useAsyncAction();

  const handleSave = () =>
    runSave(async () => {
      await onSave({ weekNumber, weekTotal, dateRangeLabel, leftDates, rightDates });
      // onSave reloads the page on success (see PlannerEditorCanvas), so
      // there's no "saved" state to show here — if we get past the
      // await, the reload is already in flight.
    });

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
      <strong style={{ fontSize: 13, color: "#555" }}>Week settings</strong>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        Week number
        <input
          type="number"
          min={1}
          max={weekTotal}
          value={weekNumber}
          onChange={(e) => setWeekNumber(parseInt(e.target.value, 10) || 1)}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        Weeks per year
        <input
          type="number"
          min={1}
          value={weekTotal}
          onChange={(e) => setWeekTotal(parseInt(e.target.value, 10) || 52)}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        Date range label
        <input
          type="text"
          value={dateRangeLabel}
          onChange={(e) => setDateRangeLabel(e.target.value)}
          placeholder="e.g. DEC 31 - JAN 6"
        />
      </label>

      <DateNumbersRow title="Left page day numbers" dayLabels={LEFT_LABELS} dates={leftDates} setDates={setLeftDates} />
      <DateNumbersRow
        title="Right page day numbers"
        dayLabels={RIGHT_LABELS}
        dates={rightDates}
        setDates={setRightDates}
      />

      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save week settings"}
      </button>
      {saveError && <span style={{ color: "#ff5555" }}>{saveError}</span>}
      <span style={{ fontSize: 11, color: "#999" }}>Reloads the page after saving.</span>
    </div>
  );
}
