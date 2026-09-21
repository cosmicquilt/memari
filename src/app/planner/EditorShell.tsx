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
//
// AND THE CLICKED CARD ANSWERS AT ONCE. The timeline used to show the new
// selection only when the new layout arrived - 437ms after the click,
// measured on the dev server, and a network round trip in production - so
// the card seemed to ignore the click and then jump. Now the timeline shows
// the choice immediately (`choosing`) and the card grows while the layout
// loads; the editor is rebuilt once that grow has finished (SLIDE_MS after
// the click, or when the layout arrives if that is later), so the one heavy
// piece of work - rebuilding the editor - never lands in the middle of the
// animation. And it is a TRANSITION, so React renders it in slices and
// the page stays responsive. Tried in one go instead, it was a single
// 417-648ms block on the dev server starting right as the grow ended -
// clipping its last frames and freezing everything - and the canvas changed
// no sooner (~1.0s after the click either way, in dev; production is
// several times faster).

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PageLevel } from "@/lib/pageLevels";
import type { ViewportSize } from "@/lib/viewportCookie";
import { writeOpenLevelCookie } from "@/lib/openLevelCookie";
import { writeLastJournalCookie } from "@/lib/lastJournalCookie";
import { JournalProvider } from "./journalContext";
import type { LoadedPlanner } from "./loadPlannerPages";
import { NativePlannerEditor, type EditorUi } from "./NativePlannerEditor";
import { TimelineDrawer, DRAWER_RESTING_HEIGHT, SLIDE_MS } from "./TimelineDrawer";
import { usePrefersReducedMotion } from "./useMediaQuery";
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
  // The layout just clicked, shown as selected in the timeline while it
  // loads. Null once it is open.
  const [choosing, setChoosing] = useState<{ level: PageLevel; variantKey: string | null } | null>(null);
  const reduceMotion = usePrefersReducedMotion();
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
  const journalId = initial.journal.id;

  // The journal to preselect the next time the start dialog opens - see
  // lastJournalCookie. Written here, by the page, for the same reason the
  // open-level cookie is: a cookie set by a server action refreshes the route.
  useEffect(() => {
    writeLastJournalCookie(journalId);
  }, [journalId]);

  const openLevel = useCallback(async (level: PageLevel, variantKey: string | null) => {
    const request = ++latest.current;
    const clickedAt = performance.now();
    setChoosing({ level, variantKey });
    document.documentElement.style.cursor = "progress";
    try {
      const loaded = await load(journalId, level, variantKey);
      if (request !== latest.current) return;
      // Let the card finish growing before the editor is rebuilt.
      const growLeft = reduceMotion ? 0 : SLIDE_MS - (performance.now() - clickedAt);
      if (growLeft > 0) await new Promise((resolve) => setTimeout(resolve, growLeft));
      if (request !== latest.current) return;
      // The layout ACTUALLY opened - loadPlannerPages falls back to the
      // default for a key with nothing behind it - so a refresh reopens it.
      writeOpenLevelCookie({ level, variantKey: loaded.variantKey });
      const ui = view.current;
      startTransition(() => {
        setOpen({ ...loaded, level, ui });
        setChoosing(null);
      });
    } catch (error) {
      // Stay on the layout that is showing, and put the timeline's selection
      // back on it. Nothing was changed, so nothing needs undoing; the click
      // can simply be tried again.
      console.error("Could not open that layout:", error);
      if (request === latest.current) setChoosing(null);
    } finally {
      if (request === latest.current) document.documentElement.style.cursor = "";
    }
  }, [load, reduceMotion, journalId]);

  // What the timeline shows as open: the one being opened, if any.
  const shownLevel = choosing?.level ?? open.level;
  const shownVariantKey = choosing ? choosing.variantKey : open.variantKey;

  // THE EDITOR IS NOT RE-RENDERED FOR THE TIMELINE'S SAKE. Showing the
  // clicked card as chosen is a change of this shell's state, and without
  // this the whole editor - every page, module and drawing - rendered again
  // with it, for nothing: measured as a 76-109ms stall right at the click,
  // which is exactly when the card should start to move. Memoised on the
  // editor's own inputs, React skips it unless one of them changed.
  const editor = useMemo(
    () => (
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
        journalTitle={open.journal.title}
      />
    ),
    [open, initialViewport, drawerHeight, reportView]
  );

  return (
    <JournalProvider value={journalId}>
      {editor}
      <TimelineDrawer
        pages={open.timeline}
        activeLevel={shownLevel}
        activeVariantKey={shownVariantKey}
        term={open.term}
        onHeightChange={setDrawerHeight}
        onOpen={(next, nextVariant) => {
          if (next === shownLevel && nextVariant === shownVariantKey) return;
          // A LEVEL, not a page: the editor draws a whole spread, so either
          // page of it means "show this spread". Instant, with no transition
          // of its own - swapping between two heavy documents is the case
          // Apple says must NOT animate.
          void openLevel(next, nextVariant);
        }}
      />
    </JournalProvider>
  );
}
