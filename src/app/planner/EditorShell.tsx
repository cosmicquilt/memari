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

import { useCallback, useRef, useState } from "react";
import type { PageLevel } from "@/lib/pageLevels";
import type { ViewportSize } from "@/lib/viewportCookie";
import { writeOpenLevelCookie } from "@/lib/openLevelCookie";
import type { LoadedPlanner } from "./loadPlannerPages";
import { NativePlannerEditor } from "./NativePlannerEditor";
import { loadLevel } from "./loadLevel";

type OpenLayout = LoadedPlanner & { level: PageLevel };

export function EditorShell({
  initial,
  initialViewport,
  load = loadLevel,
}: {
  initial: OpenLayout;
  initialViewport: ViewportSize | null;
  /** How a layout is fetched. Always loadLevel in the app; a stand-in lets a
   *  test drive the swap without a signed-in session. */
  load?: typeof loadLevel;
}) {
  const [open, setOpen] = useState<OpenLayout>(initial);
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
      setOpen({ ...loaded, level });
    } catch (error) {
      // Stay on the layout that is showing. Nothing was changed, so nothing
      // needs undoing; the click can simply be tried again.
      console.error("Could not open that layout:", error);
    } finally {
      if (request === latest.current) document.documentElement.style.cursor = "";
    }
  }, [load]);

  return (
    <NativePlannerEditor
      key={`${open.level}:${open.variantKey ?? ""}`}
      pages={open.pages}
      timeline={open.timeline}
      term={open.term}
      variantKey={open.variantKey}
      weekSettings={open.weekSettings}
      pageSettings={open.pageSettings}
      level={open.level}
      initialViewport={initialViewport}
      onOpenLevel={openLevel}
    />
  );
}
