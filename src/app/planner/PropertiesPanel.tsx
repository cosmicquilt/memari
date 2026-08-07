"use client";

import { useState } from "react";

// Content editing for whichever non-locked module is currently selected
// on the canvas — heading text, ruled/blank, habit names, resizing, etc.
// Locked structural blocks (week-title, hourly-grid-core) aren't
// selectable at all (see renderModuleInstance.ts), so they go through
// WeekSettingsPanel instead, not this one.

export type SelectedModule = {
  id: string;
  slug: string;
  propValues: Record<string, unknown>;
  columnSpan: number;
  rowSpan: number;
};

export function PropertiesPanel({
  selected,
  onSave,
  onResize,
}: {
  selected: SelectedModule | null;
  onSave: (instanceId: string, propValues: Record<string, unknown>) => Promise<void>;
  onResize: (instanceId: string, size: { columnSpan: number; rowSpan: number }) => Promise<void>;
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
  return <PropertiesForm key={selected.id} selected={selected} onSave={onSave} onResize={onResize} />;
}

function PropertiesForm({
  selected,
  onSave,
  onResize,
}: {
  selected: SelectedModule;
  onSave: (instanceId: string, propValues: Record<string, unknown>) => Promise<void>;
  onResize: (instanceId: string, size: { columnSpan: number; rowSpan: number }) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(selected.propValues);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resizing, setResizing] = useState(false);
  const [resizeError, setResizeError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
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
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Resize applies immediately on click rather than accumulating into a
  // draft — it's a discrete, already-confirmed action (grow/shrink by one
  // cell), not something you'd want to type-then-save. Column resize is
  // offered for labeled-box only: todo-checklist/habit-tracker's column
  // span is tied to matching the page's day count (see actions.ts's
  // addPaletteModuleAt), and letting it drift out of sync independently
  // would just recreate the "mismatched checklist" problem that sizing
  // was built to avoid in the first place.
  const handleResize = async (deltaColumns: number, deltaRows: number) => {
    setResizing(true);
    setResizeError(null);
    try {
      await onResize(selected.id, {
        columnSpan: selected.columnSpan + deltaColumns,
        rowSpan: selected.rowSpan + deltaRows,
      });
    } catch (err) {
      setResizeError(err instanceof Error ? err.message : String(err));
    } finally {
      setResizing(false);
    }
  };

  const label: Record<string, string> = {
    "labeled-box": "Labeled box",
    "habit-tracker": "Habit tracker",
    "todo-checklist": "To-do checklist",
  };

  const allowColumnResize = selected.slug === "labeled-box";

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
      {saveError && <span style={{ color: "#ff5555" }}>{saveError}</span>}

      <hr style={{ width: "100%", border: "none", borderTop: "1px solid #333", opacity: 0.3 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <strong style={{ fontSize: 12, color: "#555" }}>Size</strong>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 70, color: "#999" }}>Height</span>
          <button disabled={resizing} onClick={() => handleResize(0, -1)}>
            −
          </button>
          <span>{selected.rowSpan} rows</span>
          <button disabled={resizing} onClick={() => handleResize(0, 1)}>
            +
          </button>
        </div>

        {allowColumnResize && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 70, color: "#999" }}>Width</span>
            <button disabled={resizing} onClick={() => handleResize(-1, 0)}>
              −
            </button>
            <span>{selected.columnSpan} cols</span>
            <button disabled={resizing} onClick={() => handleResize(1, 0)}>
              +
            </button>
          </div>
        )}

        {resizeError && <span style={{ color: "#ff5555" }}>{resizeError}</span>}
      </div>
    </div>
  );
}
