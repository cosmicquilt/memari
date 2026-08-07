"use client";

import { useState } from "react";

// Content editing for whichever non-locked module is currently selected
// on the canvas — heading text, ruled/blank, habit names, etc. Locked
// structural blocks (week-title, hourly-grid-core) aren't selectable at
// all (see renderModuleInstance.ts), so they go through WeekSettingsPanel
// instead, not this one.

export type SelectedModule = {
  id: string;
  slug: string;
  propValues: Record<string, unknown>;
};

export function PropertiesPanel({
  selected,
  onSave,
}: {
  selected: SelectedModule | null;
  onSave: (instanceId: string, propValues: Record<string, unknown>) => Promise<void>;
}) {
  if (!selected) {
    return (
      <div style={{ padding: 12, fontSize: 13, color: "#999" }}>
        Select a module on the canvas to edit it here.
      </div>
    );
  }

  // Keyed by the selected module's id so switching to a *different*
  // module remounts this form with fresh state (its useState initial
  // value re-reads from props) instead of needing an effect to reset an
  // in-progress draft — React's own recommended pattern for "state that
  // should reset when a prop identity changes."
  return <PropertiesForm key={selected.id} selected={selected} onSave={onSave} />;
}

function PropertiesForm({
  selected,
  onSave,
}: {
  selected: SelectedModule;
  onSave: (instanceId: string, propValues: Record<string, unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(selected.propValues);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Trim/drop blank lines only at save time, not on every keystroke —
      // letting the textarea hold blank lines while the user is still
      // typing is friendlier than fighting their cursor position.
      const cleaned =
        selected.slug === "habit-tracker"
          ? {
              ...draft,
              habits: ((draft.habits as string[] | undefined) ?? [])
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : draft;
      await onSave(selected.id, cleaned);
    } finally {
      setSaving(false);
    }
  };

  const label: Record<string, string> = {
    "labeled-box": "Labeled box",
    "habit-tracker": "Habit tracker",
    "todo-checklist": "To-do checklist",
  };

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
      <strong style={{ fontSize: 13, color: "#555" }}>{label[selected.slug] ?? selected.slug}</strong>

      {selected.slug === "labeled-box" && (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            Heading
            <input
              type="text"
              value={(draft.heading as string) ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, heading: e.target.value }))}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={Boolean(draft.ruled)}
              onChange={(e) => setDraft((d) => ({ ...d, ruled: e.target.checked }))}
            />
            Ruled (lined) body
          </label>
        </>
      )}

      {selected.slug === "habit-tracker" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Habits (one per line)
          <textarea
            rows={8}
            value={((draft.habits as string[] | undefined) ?? []).join("\n")}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                habits: e.target.value.split("\n"),
              }))
            }
          />
        </label>
      )}

      {selected.slug === "todo-checklist" && (
        <span style={{ color: "#999" }}>
          This checklist&apos;s day columns follow whichever page it&apos;s on —
          nothing to edit here yet.
        </span>
      )}

      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
