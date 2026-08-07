"use client";

import { useEffect, useMemo, useState } from "react";
import { createStore } from "polotno/model/store";
import { PolotnoApp } from "polotno/polotno-app";
import "polotno/ui.css";
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";
import { savePageElements, addPaletteModule } from "./actions";

const apiKey = process.env.NEXT_PUBLIC_POLOTNO_API_KEY;

// Module types with a real renderer, available to add from the palette.
// habit-tracker and quote-block are seeded but don't have renderers yet
// (page.tsx's renderModuleInstance returns [] for them), so they're left
// out here rather than offering something that would render as nothing.
const PALETTE_MODULES = [{ slug: "labeled-box", label: "Labeled Box" }];

export function PlannerEditorCanvas({
  pages,
}: {
  pages: Array<{ pageId: string; elements: object[] }>;
}) {
  // One store per mounted editor instance, not module-level like the
  // standalone test — this page can be visited by many different users.
  const store = useMemo(
    () => createStore({ key: apiKey ?? "", showCredit: !apiKey }),
    []
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [addingSlug, setAddingSlug] = useState<string | null>(null);

  useEffect(() => {
    // Both pages loaded together — a week spread is two pages viewed as
    // one unit when the book is open flat, so the editor shows both.
    store.loadJSON({
      width: PRINT_WIDTH_PX,
      height: PRINT_HEIGHT_PX,
      pages: pages.map((p) => ({
        id: p.pageId,
        width: PRINT_WIDTH_PX,
        height: PRINT_HEIGHT_PX,
        children: p.elements,
      })),
    });
    // Only ever load the initial snapshot once per mount — reloading on
    // every render would stomp in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const json = store.toJSON() as unknown as {
        pages: Array<{
          id: string;
          children?: Array<{
            id: string;
            x: number;
            y: number;
            width: number;
            height: number;
          }>;
        }>;
      };
      // Save each page separately — savePageElements only ever touches
      // the freeform elements for the pageId it's given, so this can't
      // cross-contaminate the two pages' locked core content.
      await Promise.all(
        json.pages.map((jsonPage) => {
          const elements = jsonPage.children ?? [];
          return savePageElements(jsonPage.id, elements);
        })
      );
      setLastSavedAt(new Date());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddModule = async (slug: string) => {
    setAddingSlug(slug);
    try {
      // The palette only targets the left page's sidebar for now — the
      // right page has no sidebar content yet (To-Do/Habits renderers
      // don't exist), so there's nowhere else for it to go.
      await addPaletteModule(pages[0].pageId, slug);
      // Full reload rather than a soft refresh: the canvas only loads its
      // initial snapshot once on mount (see the effect above), so a
      // client-side re-render wouldn't pick up the new server data
      // without extra plumbing. Fine for this first pass — proper live
      // sync is part of the drag-and-drop work still to come.
      window.location.reload();
    } catch (err) {
      setAddingSlug(null);
      // eslint-disable-next-line no-alert
      alert(err instanceof Error ? err.message : String(err));
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
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <aside
          style={{
            width: 180,
            borderRight: "1px solid #ddd",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <strong style={{ fontSize: 13, color: "#555" }}>Add module</strong>
          {PALETTE_MODULES.map((m) => (
            <button
              key={m.slug}
              onClick={() => handleAddModule(m.slug)}
              disabled={addingSlug === m.slug}
              style={{ textAlign: "left", padding: "6px 8px" }}
            >
              {addingSlug === m.slug ? "Adding…" : m.label}
            </button>
          ))}
          <span style={{ fontSize: 11, color: "#999", marginTop: 8 }}>
            Adds to the next open sidebar slot on the left page. Drag-to-position
            isn&apos;t built yet.
          </span>
        </aside>
        <div style={{ flex: 1, minHeight: 0 }}>
          <PolotnoApp store={store} />
        </div>
      </div>
    </div>
  );
}
