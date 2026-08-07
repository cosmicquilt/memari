"use client";

import { useEffect, useMemo, useState } from "react";
import { createStore } from "polotno/model/store";
import { PolotnoApp } from "polotno/polotno-app";
import "polotno/ui.css";
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";
import { savePageElements } from "./actions";

const apiKey = process.env.NEXT_PUBLIC_POLOTNO_API_KEY;

export function PlannerEditorCanvas({
  pageId,
  initialElements,
}: {
  pageId: string;
  initialElements: object[];
}) {
  // One store per mounted editor instance, not module-level like the
  // standalone test — this page can be visited by many different users.
  const store = useMemo(
    () => createStore({ key: apiKey, showCredit: !apiKey }),
    []
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    store.loadJSON({
      width: PRINT_WIDTH_PX,
      height: PRINT_HEIGHT_PX,
      pages: [
        {
          id: pageId,
          width: PRINT_WIDTH_PX,
          height: PRINT_HEIGHT_PX,
          children: initialElements,
        },
      ],
    });
    // Only ever load the initial snapshot once per mount — reloading on
    // every render would stomp in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const json = store.toJSON();
      const elements = (json.pages[0]?.children ?? []) as Array<{
        id: string;
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
      await savePageElements(pageId, elements);
      setLastSavedAt(new Date());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          padding: "8px 16px",
          background: "#1a1a1a",
          color: "white",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <strong>Memari planner editor</strong>
        <button onClick={handleSave} disabled={saving} style={{ marginLeft: "auto" }}>
          {saving ? "Saving…" : "Save"}
        </button>
        {lastSavedAt && (
          <span style={{ color: "#7CFC00" }}>
            Saved {lastSavedAt.toLocaleTimeString()}
          </span>
        )}
        {saveError && <span style={{ color: "#ff5555" }}>Save failed: {saveError}</span>}
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <PolotnoApp store={store} />
      </div>
    </div>
  );
}
