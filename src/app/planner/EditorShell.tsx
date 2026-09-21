"use client";

// The editor at memari.studio/app, and the ONE place that knows which of the
// book's layouts is open.
//
// Asked for, 2026-09-21: "I dont want site to change while swapping between
// their monthly weekly layout ... within same journal". Each level used to be
// its own page, so opening one from the timeline loaded a whole new document:
// the address changed, the page went blank and everything was rebuilt. Now
// the address stays put and only the editor is swapped. The new layout's
// pages are fetched by a server action (loadLevel) - the same loading a page
// did - and the editor is remounted with them. The old editor stays on screen
// until the new one is ready, and the swap itself is a single frame: a canvas
// swap must be instant, never faded (see memari-editor-design-language).
//
// REMOUNTED, keyed by the layout, rather than fed new props. The editor seeds
// a great deal of its own state from its first props - the pages it draws,
// its undo history, what is selected - exactly as it did on a page load, and
// a remount is what gives each layout a clean start, as a load used to.
//
// BUT NOTHING ELSE MAY LOOK RELOADED - "I want it to not seem like page is
// reloading visually". The first version remounted the timeline drawer with
// the editor, and it snapped back to the size it opens at ("when I switch
// pages it resizes the timeline back to size it loads in on") and its row
// scrolled back to the start. So:
//   - the DRAWER lives here, beside the editor, and is never rebuilt - its
//     size, its scroll and anything mid-animation carry straight on; the
//     canvas's room for it (its settled height) is held here too;
//   - the ZOOM and the PALETTE carry over: the editor reports them as they
//     change, and the next layout starts from them.
// What changes is the pages on the canvas, which is the point.

import { useCallback, useRef, useState } from "react";
import type { PageLevel } from "@/lib/pageLevels";
import type { ViewportSize } from "@/lib/viewportCookie";
import { writeOpenLevelCookie } from "@/lib/openLevelCookie";
import type { LoadedPlanner } from "./loadPlannerPages";
import { NativePlannerEditor, type EditorUi } from "./NativePlannerEditor";
import { TimelineDrawer, DRAWER_RESTING_HEIGHT } from "./TimelineDrawer";
import { loadLevel } from "./loadLevel";

/** A layout, and the view it opens with - the view the previous one left. */
type OpenLayout = LoadedPlanner & { level: PageLevel; ui: EditorUi | null };

export function EditorShell({
  initial,
  initialViewport,
  load = loadLevel,
}: {
  initial: LoadedPlanner & { level: PageLevel };
  initialViewport: ViewportSize | null;
  /** How a layout is fetched. Always loadLevel in the app; a stand-in lets a
   *  test drive the swap without a signed-in session. */
  load?: typeof loadLevel;
}) {
  const [open, setOpen] = useState<OpenLayout>({ ...initial, ui: null });
  // The drawer's SETTLED height - the canvas's room for it. Here rather than
  // in the editor because the drawer is here.
  const [drawerHeight, setDrawerHeight] = useState(DRAWER_RESTING_HEIGHT);
  // The open editor's view, as it last reported it. A ref, written from the
  // editor's report and read in the switch below - both outside rendering -
  // so reporting a zoom does not re-render this shell.
  const view = useRef<EditorUi | null>(null);
  const reportView = useCallback((ui: EditorUi) => {
    view.current = ui;
  }, []);
  // Only the latest request may land. Two quick clicks in the timeline race,
  // and the one asked for LAST is the one that should be on screen.
  const latest = useRef(0);

  const openLevel = useCallback(async (level: PageLevel, variantKey: string | null) => {
    const request = ++latest.current;
    document.documentElement.style.cursor = "progress";
    try {
      const loaded = await load(level, variantKey);
      if (request !== latest.current) return;
      // The layout ACTUALLY opened - loadPlannerPages falls back to the
      // default for a key with nothing behind it - so a refresh reopens it.
      writeOpenLevelCookie({ level, variantKey: loaded.variantKey });
      setOpen({ ...loaded, level, ui: view.current });
    } catch (error) {
      // Stay on the layout that is showing. Nothing was changed, so nothing
      // needs undoing; the click can simply be tried again.
      console.error("Could not open that layout:", error);
    } finally {
      if (request === latest.current) document.documentElement.style.cursor = "";
    }
  }, [load]);

  return (
    <>
      <NativePlannerEditor
        key={`${open.level}:${open.variantKey ?? ""}`}
        pages={open.pages}
        term={open.term}
        weekSettings={open.weekSettings}
        pageSettings={open.pageSettings}
        initialViewport={initialViewport}
        drawerHeight={drawerHeight}
        initialUi={open.ui}
        onUiChange={reportView}
      />
      <TimelineDrawer
        pages={open.timeline}
        activeLevel={open.level}
        activeVariantKey={open.variantKey}
        term={open.term}
        onHeightChange={setDrawerHeight}
        onOpen={(next, nextVariant) => {
          if (next === open.level && nextVariant === open.variantKey) return;
          // A LEVEL, not a page: the editor draws a whole spread, so either
          // page of it means "show this spread". Instant, with no transition
          // of its own - swapping between two heavy documents is the case
          // Apple says must NOT animate.
          void openLevel(next, nextVariant);
        }}
      />
    </>
  );
}
