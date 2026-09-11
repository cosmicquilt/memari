"use client";

import { useState } from "react";
import { useAsyncAction } from "./useAsyncAction";
import { moduleDefinition, cleanPropsForSave, type ModuleField } from "@/lib/moduleRegistry";

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

function SizeStepper({
  label,
  value,
  unit,
  disabled,
  onDecrement,
  onIncrement,
}: {
  label: string;
  value: number;
  unit: string;
  disabled: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 70, color: "#999" }}>{label}</span>
      <button disabled={disabled} onClick={onDecrement}>
        −
      </button>
      <span>
        {value} {unit}
      </span>
      <button disabled={disabled} onClick={onIncrement}>
        +
      </button>
    </div>
  );
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
  const [saving, saveError, runSave] = useAsyncAction();
  const [resizing, resizeError, runResize] = useAsyncAction();

  const handleSave = () =>
    runSave(async () => {
      // Trim/drop blank lines only at save time, not on every keystroke —
      // letting the textarea hold blank lines while the user is still
      // typing is friendlier than fighting their cursor position.
      // Which props need cleaning is a fact about the module's fields, so
      // the registry does it. This was a habit-tracker clause written into
      // this handler, and the next module with a list would have needed
      // another one beside it.
      await onSave(selected.id, cleanPropsForSave(selected.slug, draft));
    });

  // Resize applies immediately on click rather than accumulating into a
  // draft — it's a discrete, already-confirmed action (grow/shrink by one
  // cell), not something you'd want to type-then-save. Column resize is
  // offered for labeled-box only: todo-checklist/habit-tracker's column
  // span is tied to matching the page's day count (see actions.ts's
  // addPaletteModuleAt/updateModuleSize), and letting it drift out of
  // sync independently would just recreate the "mismatched checklist"
  // problem that sizing was built to avoid in the first place.
  const handleResize = (deltaColumns: number, deltaRows: number) =>
    runResize(() =>
      onResize(selected.id, {
        columnSpan: selected.columnSpan + deltaColumns,
        rowSpan: selected.rowSpan + deltaRows,
      })
    );

  // Everything this panel needs to know about the module comes from its
  // registry entry. It used to be a name map plus a run of `slug === ...`
  // blocks each holding its own JSX, which is three modules' worth of code
  // for three modules and a hundred modules' worth for a hundred - and the
  // catalogue is presets over a handful of primitives, so a preset should
  // need no panel code at all.
  const definition = moduleDefinition(selected.slug);
  const allowColumnResize = definition?.resizableWidth ?? false;

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
      <strong style={{ fontSize: 13, color: "#555" }}>{definition?.label ?? selected.slug}</strong>

      {(definition?.fields ?? []).map((field: ModuleField, i) =>
        field.kind === "note" ? (
          <span key={i} style={{ color: "#999" }}>
            {field.text}
          </span>
        ) : field.kind === "boolean" ? (
          <label key={field.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={Boolean(draft[field.key])}
              onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.checked }))}
            />
            {field.label}
          </label>
        ) : field.kind === "number" ? (
          <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {field.label}
            <input
              type="number"
              min={field.min}
              max={field.max}
              // Stored as a NUMBER, not as the string the input hands
              // back. A schema default of 5 meeting a saved "5" is the
              // same class of bug as any other pair of descriptions of one
              // fact - see the field kind's own comment in the registry.
              // An empty box is left as an empty string rather than
              // coerced to 0, so clearing it to retype does not first
              // redraw the module at zero.
              value={
                typeof draft[field.key] === "number" ? (draft[field.key] as number) : ""
              }
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  [field.key]: e.target.value === "" ? "" : Number(e.target.value),
                }))
              }
            />
          </label>
        ) : field.kind === "select" ? (
          <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {field.label}
            <select
              value={(draft[field.key] as string) ?? field.options[0]?.value ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : field.kind === "paragraph" ? (
          <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {field.label}
            <textarea
              rows={field.rows ?? 6}
              // One string, newlines included - the difference from
              // `lines`, which splits into an array. A passage keeps its
              // own line structure because that structure is part of the
              // passage.
              value={(draft[field.key] as string) ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
            />
          </label>
        ) : field.kind === "lines" ? (
          <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {field.label}
            <textarea
              rows={field.rows ?? 6}
              // Split on every keystroke and cleaned only at save, so a
              // blank line someone is still typing around survives instead
              // of the cursor being fought - see cleanPropsForSave.
              value={((draft[field.key] as string[] | undefined) ?? []).join("\n")}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [field.key]: e.target.value.split("\n") }))
              }
            />
          </label>
        ) : (
          <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {field.label}
            <input
              type="text"
              value={(draft[field.key] as string) ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
            />
          </label>
        )
      )}

      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      {saveError && <span style={{ color: "#ff5555" }}>{saveError}</span>}

      <hr style={{ width: "100%", border: "none", borderTop: "1px solid #333", opacity: 0.3 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <strong style={{ fontSize: 12, color: "#555" }}>Size</strong>

        <SizeStepper
          label="Height"
          value={selected.rowSpan}
          unit="rows"
          disabled={resizing}
          onDecrement={() => handleResize(0, -1)}
          onIncrement={() => handleResize(0, 1)}
        />

        {allowColumnResize && (
          <SizeStepper
            label="Width"
            value={selected.columnSpan}
            unit="cols"
            disabled={resizing}
            onDecrement={() => handleResize(-1, 0)}
            onIncrement={() => handleResize(1, 0)}
          />
        )}

        {resizeError && <span style={{ color: "#ff5555" }}>{resizeError}</span>}
      </div>
    </div>
  );
}
