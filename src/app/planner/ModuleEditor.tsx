"use client";

// Editing one module, at a size you can actually see it.
//
// Asked for directly: click the edit control on a module and it "will expand
// the module to page size and create a container around it to further edit
// it" - text, and in time icons, column spacing and rule style.
//
// THE FIELDS ARE THE EDITOR. Every module already declares what it has to
// set - a `fields` array of text, paragraph, lines, number, boolean, select -
// and that has always been the data model for this. What was missing was a
// reader: the native editor had two hand-written inline editors chosen by
// SLUG, for the two modules somebody needed. Driving it off `fields` gives all
// 122 an editor and means a module added tomorrow arrives with one.
//
// THE PREVIEW IS THE MODULE, redrawn from the draft on every keystroke by the
// same renderModuleInstance the page uses. Not a mock-up and not a
// screenshot: if what you are editing could look different here from how it
// prints, this panel would be worth nothing.
//
// Design follows the timeline drawer's, which followed the research: a solid
// surface rather than a blurred one, a 2px accent ring with an offset rather
// than a border, controls that are permanently present and quiet rather than
// revealed on hover, and a spring rather than an ease.

import { CONTROL_RADIUS, PANEL_RADIUS } from "./editorStyle";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { moduleDefinition, cleanPropsForSave, moduleSchemaDefaults, withCurrentSettings } from "@/lib/moduleRegistry";
import { renderOnPage, type PageRenderContext } from "@/lib/renderContext";
import type { PageGrid } from "@/lib/grid";
import { cellHeightPx, gridCellToPixels, pixelHeightToRowSpan } from "@/lib/grid";
import { DEFAULT_HOURLY_SETTINGS, getHourlyGridCoreContentHeightPx } from "@/lib/modules/hourlyGridCore";
import { HEADING_SIZES_PT, headingFits } from "@/lib/modules/moduleFrame";
import { canvasFields, canvasSlots, ghostValues, withItemAfter, withSlotText, withoutItem, type CanvasSlot } from "@/lib/canvasText";
import { CanvasTextFields } from "./CanvasTextFields";
import { IconPicksOnPage } from "./IconPicksOnPage";
import { weekdayShortNames } from "@/lib/weekDays";
import { flatten } from "@/lib/proofSvg";
import type { RenderedPolotnoElement } from "@/lib/renderModuleInstance";
import { PolotnoJsonRenderer, RESIZE_EASE_CURVE } from "./PolotnoJsonRenderer";
import { ModuleFieldsForm, type RuleSample } from "./ModuleFieldsForm";
import { HoursFields, type HoursDraft } from "./HoursFields";
import { ColumnDividers } from "./ColumnDividers";
import { saveModuleToSaved, updateHourlySettings, updateJournalModuleSettings, updateModuleConfig } from "./actions";
import { useJournalId } from "./journalContext";
import { useAsyncAction } from "./useAsyncAction";
import { useRefreshPages } from "./pagesRefreshContext";

const ACCENT = "#4a5cff";
const SURFACE = "#1c1c1e";
/** The widest the panel of fields gets. Beyond this a text input stops
 *  looking like a field and starts looking like a document. */
const FIELDS_WIDTH = 300;
const PADDING = 24;

export type EditingModule = {
  instanceId: string;
  slug: string;
  propValues: Record<string, unknown>;
  columnStart: number;
  rowStart: number;
  columnSpan: number;
  rowSpan: number;
  /** A use of a saved module - see savedItems.ts - or null. */
  savedModule: { id: string; name: string } | null;
  /** Where the module sits on screen as the editor opens, in viewport CSS
   *  px. The preview grows out of it, and shrinks back into it on close. */
  origin?: ScreenRect | null;
  /** The HOURS: every page's hours on the spread, as they sit on it. See
   *  SpreadPiece. Absent for every other module. */
  spread?: SpreadPiece[];
};

export type ScreenRect = { left: number; top: number; width: number; height: number };

/**
 * One page's hours, for an editor that shows the whole spread's.
 *
 * Asked 2026-09-29: "in the editing preview of hours section it should show
 * both sides in the popup". The hours are one setting across the book, and a
 * spread is one sheet, so the preview is the sheet's hours - each drawn with
 * its own page's dates, from the one draft.
 */
export type SpreadPiece = {
  instanceId: string;
  propValues: Record<string, unknown>;
  columnStart: number;
  rowStart: number;
  columnSpan: number;
  rowSpan: number;
  pageGrid: PageGrid;
  renderContext: PageRenderContext | null;
  /** Where it sits from the spread's hours' top-left, in print px - as on
   *  the canvas, so the preview is the canvas magnified. */
  offsetX: number;
  offsetY: number;
};

/**
 * THE FLIGHT. The preview is laid out where it ends up and starts over the
 * module on the canvas, inverted by a transform - the FLIP technique - and
 * only the transform animates. Asked 2026-09-29: "could we get the modules
 * to animate from their current position and size in view of canvas to
 * final size in preview, would that lag?" A transform is composited: the
 * drawing is laid out and painted once and the GPU moves the result, so the
 * cost is the preview's first render, not the frames - measured in
 * check:browser's module editor probe.
 *
 * The canvas's own move curve, so it reads like the rest of the editor.
 */
const OPEN_MS = 360;
const CLOSE_MS = 280;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Paper around the module in the preview, in CSS px - asked 2026-09-29: "in
 * the preview can you make it so the module has a bit of whitespace padding
 * around it". Fixed on screen rather than a share of the module, so a small
 * module magnified 3x does not sit in a moat.
 */
const FRAME_PAD = 24;

/**
 * The transform that puts the MODULE inside `element` - everything but its
 * `pad` of paper - over `target`, with the element's top-left as the
 * transform origin. The paper travels with it, scaled the same, so the
 * module leaves the canvas exactly the size it was there and its margin
 * grows in around it on the way.
 */
function flight(element: HTMLElement, target: ScreenRect, pad = FRAME_PAD): string | null {
  const rect = element.getBoundingClientRect();
  const width = rect.width - pad * 2;
  const height = rect.height - pad * 2;
  if (!(width > 0 && height > 0 && target.width > 0 && target.height > 0)) return null;
  const sx = target.width / width;
  const sy = target.height / height;
  return (
    `translate(${target.left - rect.left - pad * sx}px, ${target.top - rect.top - pad * sy}px) ` +
    `scale(${sx}, ${sy})`
  );
}

export function ModuleEditor({
  editing,
  pageGrid,
  fontFamily,
  renderContext,
  weekStartDay = 0,
  getOrigin,
  onClose,
  onSaved,
}: {
  editing: EditingModule;
  pageGrid: PageGrid;
  fontFamily: string;
  /** The module's page's - see src/lib/renderContext.ts. The draft is the
   *  stored props; the preview shows them as the page prints them. */
  renderContext: PageRenderContext | null;
  /** The book's week start - edited alongside the hours, which own it now. */
  weekStartDay?: number;
  /** Where the module is on screen NOW - measured at close, since the canvas
   *  may have scrolled or zoomed while the editor was open. */
  getOrigin?: () => ScreenRect | null;
  onClose: () => void;
  /** The committed props, so the page behind can redraw without a reload. */
  onSaved: (instanceId: string, propValues: Record<string, unknown>) => void;
}) {
  const refreshPages = useRefreshPages();
  const journalId = useJournalId();
  const definition = moduleDefinition(editing.slug);
  // THE HOURS edit the journal's hour settings rather than one module's
  // props - see HoursFields. Their draft is those settings, read from this
  // block's props with the defaults under them, plus the week start.
  const hours = definition?.pageSettingsForm === "hours";
  const [openedDraft] = useState<Record<string, unknown>>(() =>
    hours
      ? {
          ...editing.propValues,
          ...Object.fromEntries(
            Object.entries(DEFAULT_HOURLY_SETTINGS).map(([key, value]) => [key, editing.propValues[key] ?? value])
          ),
        }
      : // Old settings read as the ones that replaced them, so the picker
        // opens on what the module actually draws - see `current`.
        withCurrentSettings(editing.slug, editing.propValues)
  );
  const [draft, setDraft] = useState<Record<string, unknown>>(openedDraft);
  const [weekStart, setWeekStart] = useState(weekStartDay);
  const [pending, error, run] = useAsyncAction();
  // Against what the editor OPENED with, not the stored props: the hours'
  // draft fills in every setting a grid stored before it existed, and
  // compared with the stored props that read as a change nobody made.
  const dirty = JSON.stringify(draft) !== JSON.stringify(openedDraft) || weekStart !== weekStartDay;
  // Saving it to Saved > Modules: closed, or open with the name to give it.
  const [saveName, setSaveName] = useState<string | null>(null);

  const frameRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Out the way it came in: the preview shrinks back onto the module, which
  // the canvas shows again once it lands - see NativePlannerEditor's lifted
  // modules. The editor goes when the flight ends.
  const closing = useRef(false);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const frame = frameRef.current;
    const target = getOrigin?.() ?? editing.origin ?? null;
    if (!frame || !target || prefersReducedMotion()) {
      onClose();
      return;
    }
    // Closed mid-way through opening: from where it is laid out, not from
    // wherever the opening had got to.
    for (const animation of frame.getAnimations()) animation.cancel();
    const to = flight(frame, target);
    if (!to) {
      onClose();
      return;
    }
    const flights = [
      frame.animate([{ transform: "none" }, { transform: to }], {
        duration: CLOSE_MS,
        easing: RESIZE_EASE_CURVE,
        fill: "forwards",
      }),
      scrimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, easing: "ease-in", fill: "forwards" }),
      panelRef.current?.animate([{ opacity: 1 }, { opacity: 0, transform: "translateX(18px)" }], {
        duration: CLOSE_MS * 0.6,
        easing: "ease-in",
        fill: "forwards",
      }),
    ];
    void Promise.all(flights.map((animation) => animation?.finished)).then(onClose, onClose);
  }, [getOrigin, editing.origin, onClose]);

  // Escape closes. A full-screen panel that can only be dismissed by finding
  // its own button is a trap, and this one covers the page you were editing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // The module's own box, at the size it occupies on the page. Its geometry
  // is the page's, not a guess: a habit tracker changes layout below a width
  // and would lay out differently in a box of the wrong shape.
  //
  // The HOURS change height with their settings - more rows, taller rows - so
  // their preview is sized the way updateHourlySettings sizes the block: the
  // content height of those settings, in whole cells. With increments off the
  // block keeps the height it has, as the save does.
  const rowSpan =
    hours && draft.intervalMode !== "off"
      ? pixelHeightToRowSpan(
          pageGrid,
          getHourlyGridCoreContentHeightPx(draft as Parameters<typeof getHourlyGridCoreContentHeightPx>[0])
        )
      : editing.rowSpan;
  const box = useMemo(
    () =>
      gridCellToPixels(pageGrid, {
        columnStart: editing.columnStart,
        rowStart: editing.rowStart,
        columnSpan: editing.columnSpan,
        rowSpan,
      }),
    [pageGrid, editing.columnStart, editing.rowStart, editing.columnSpan, rowSpan]
  );

  // Redrawn from the DRAFT, so the preview is what saving would produce.
  const draw = useCallback(
    (propValues: Record<string, unknown>) =>
      renderOnPage(
        {
          id: editing.instanceId,
          locked: true,
          columnStart: editing.columnStart,
          rowStart: editing.rowStart,
          columnSpan: editing.columnSpan,
          rowSpan,
          propValues,
          moduleType: { slug: editing.slug },
        },
        pageGrid,
        fontFamily,
        renderContext
      ),
    [editing, rowSpan, pageGrid, fontFamily, renderContext]
  );
  const elements = useMemo(() => draw(draft), [draw, draft]);

  // A LINE STYLE, drawn: the module as it is being edited with that one
  // option changed, and its bottom-left corner - the border, a column line
  // and a row or two of whatever fills it. Every module has that corner, and
  // it is where the rules meet the border, which is most of what tells one
  // style from another.
  const drawRule = useCallback(
    (key: string, value: string | number): RuleSample => {
      const cell = cellHeightPx(pageGrid);
      // The part of the module the option changes - see SwatchWindow. The
      // bottom-left corner unless the field says otherwise.
      const field = definition?.fields?.find((f) => f.kind === "rule" && f.key === key);
      const spec = field?.kind === "rule" ? field.window : undefined;
      const width = cell * (spec?.columns ?? 2.4);
      const height = cell * (spec?.rows ?? 2.1);
      const x =
        spec?.x === "centre"
          ? box.x + box.width / 2 - width / 2
          : spec?.x === "right"
            ? box.x + box.width - width + 4
            : box.x - 4;
      const y = spec?.y === "top" ? box.y - 4 : box.y + box.height - height + 4;
      return {
        elements: draw({ ...draft, [key]: value }),
        window: { x, y, width, height },
      };
    },
    [draw, draft, pageGrid, box, definition]
  );
  const defaults = useMemo(() => moduleSchemaDefaults(editing.slug), [editing.slug]);

  // EVERY TEXT SETTING IS EDITED WHERE IT IS DRAWN - the heading first ("it
  // should allow you to edit the title cleanly with a text hover", 2026-09-29),
  // then everything typed: rows, columns, prompts, levels, labels ("have them
  // only editable through hovering the region it will display and clicking
  // to edit text normally and live", 2026-09-30). lib/canvasText.ts finds
  // each place from the drawing - and from a ghost drawing with the empty
  // ones written in, for where they would print - and CanvasTextFields lays a
  // real text field over each. Only the text under the field being edited
  // is left out of the drawing, so its field's letters stand in exactly
  // where they print.
  const headingId = `${editing.instanceId}-heading`;
  const everyMark = useMemo(() => flatten(elements), [elements]);
  const hasCanvasText = useMemo(() => canvasFields(definition?.fields).length > 0, [definition]);
  const ghostMarks = useMemo(
    () => (hasCanvasText ? flatten(draw(ghostValues(definition?.fields, draft, defaults))) : []),
    [hasCanvasText, draw, definition, draft, defaults]
  );
  const ghostBlankMarks = useMemo(
    () => (hasCanvasText ? flatten(draw(ghostValues(definition?.fields, draft, defaults, false))) : []),
    [hasCanvasText, draw, definition, draft, defaults]
  );
  const places = useMemo(
    () =>
      canvasSlots({
        fields: hours ? [] : definition?.fields,
        values: draft,
        defaults,
        real: everyMark,
        ghost: ghostMarks,
        ghostBlanks: ghostBlankMarks,
        instanceId: editing.instanceId,
      }),
    [hours, definition, draft, defaults, everyMark, ghostMarks, ghostBlankMarks, editing.instanceId]
  );
  const [focusedSlotId, setFocusedSlotId] = useState<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const focusedSlot = places.slots.find((slot) => slot.id === focusedSlotId) ?? null;
  const drawnElements = useMemo(
    () => (focusedSlot ? focusedSlot.elementIds.reduce((kept, id) => withoutElement(kept, id), elements) : elements),
    [elements, focusedSlot]
  );
  // The panel keeps only the text settings that would print but have no
  // place on the drawing yet. One the module does not print as it is set -
  // a totals label with no totals row - is not offered anywhere.
  const onCanvasKeys = useMemo(
    () => new Set(canvasFields(definition?.fields).map((field) => field.key).filter((key) => !places.panelKeys.has(key))),
    [definition, places.panelKeys]
  );

  // A HEADING STOPS WHERE THE SMALLEST PRINT STOPS. The page shrinks a long
  // heading 8, 7, 6, 5pt as it grows; a letter that would not fit even at
  // 5pt is refused - asked 2026-09-29, "shrink longer headlines when they
  // start to get cut off until you stop letting typing". Asked through
  // headingFits, the same function the renderer sizes the heading with, in
  // the width the renderer gave it, so the editor and the page agree about
  // where the end is. Deleting is always allowed, even from a heading saved
  // before there was an end.
  const [headingFull, setHeadingFull] = useState(false);
  const headingFullTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const takeText = (slot: CanvasSlot, next: string) => {
    const isHeading = slot.elementIds.includes(headingId);
    const current = slot.value;
    if (isHeading && next.length > current.length && !headingFits(next, slot.rect.width, slot.font.family)) {
      setHeadingFull(true);
      if (headingFullTimer.current) clearTimeout(headingFullTimer.current);
      headingFullTimer.current = setTimeout(() => setHeadingFull(false), 2500);
      return;
    }
    setDraft((currentDraft) => withSlotText(currentDraft, places, slot, next));
  };
  const headingSlotId = places.slots.find((slot) => slot.elementIds.includes(headingId))?.id ?? null;

  // Fit the module into whatever room is left beside the fields. Measured
  // from the viewport rather than assumed, because a module can be a sixth of
  // a page or the whole of it.
  //
  // READ AT MOUNT, not corrected after it. This started at a guessed 1280x800
  // and an effect put the real size in once mounted - a second render of the
  // whole preview at a new scale, which landed in the middle of the flight:
  // measured as a 125ms frame opening the hours, whose preview is two pages
  // of them, and a frame that moved after the flight had been aimed at it.
  // The editor only ever mounts in the browser, on a click.
  const [viewport, setViewport] = useState(() =>
    typeof window === "undefined"
      ? { width: 1280, height: 800 }
      : { width: window.innerWidth, height: window.innerHeight }
  );
  useEffect(() => {
    const sync = () =>
      setViewport((current) =>
        current.width === window.innerWidth && current.height === window.innerHeight
          ? current
          : { width: window.innerWidth, height: window.innerHeight }
      );
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  // WHAT THE FRAME SHOWS: the module - or, for the hours, every page's hours
  // on the spread, where they sit on it, each dated as its page is and all
  // drawn from the one draft. See SpreadPiece.
  const pieces = useMemo(() => {
    // The whole spread for the hours and for any module whose settings are
    // the journal's - each page's copy drawn with the draft's settings, so
    // both sides change together as they will when saved.
    const journalWide = !!definition?.journalWideSettings;
    const spread = hours || journalWide ? editing.spread : undefined;
    if (!spread || spread.length < 2) {
      return [{ key: editing.instanceId, elements: drawnElements, box, offsetX: 0, offsetY: 0 }];
    }
    const settingKeys = hours
      ? Object.keys(DEFAULT_HOURLY_SETTINGS)
      : (definition?.fields ?? []).flatMap((field) => ("key" in field ? [field.key] : []));
    const settings = Object.fromEntries(settingKeys.filter((key) => key in draft).map((key) => [key, draft[key]]));
    return spread.map((member) => {
      const memberRowSpan =
        hours && draft.intervalMode !== "off"
          ? pixelHeightToRowSpan(
              member.pageGrid,
              getHourlyGridCoreContentHeightPx(draft as Parameters<typeof getHourlyGridCoreContentHeightPx>[0])
            )
          : member.rowSpan;
      const placement = {
        columnStart: member.columnStart,
        rowStart: member.rowStart,
        columnSpan: member.columnSpan,
        rowSpan: memberRowSpan,
      };
      return {
        key: member.instanceId,
        elements: renderOnPage(
          {
            id: member.instanceId,
            locked: true,
            ...placement,
            propValues: { ...member.propValues, ...settings },
            moduleType: { slug: editing.slug },
          },
          member.pageGrid,
          fontFamily,
          member.renderContext
        ),
        box: gridCellToPixels(member.pageGrid, placement),
        offsetX: member.offsetX,
        offsetY: member.offsetY,
      };
    });
  }, [hours, definition, editing, drawnElements, box, draft, fontFamily]);
  const groupWidth = Math.max(...pieces.map((piece) => piece.offsetX + piece.box.width));
  const groupHeight = Math.max(...pieces.map((piece) => piece.offsetY + piece.box.height));

  const frameWidth = Math.max(240, viewport.width - FIELDS_WIDTH - PADDING * 5);
  const frameHeight = Math.max(240, viewport.height - PADDING * 6);
  const scale = Math.min(
    (frameWidth - FRAME_PAD * 2) / groupWidth,
    (frameHeight - FRAME_PAD * 2) / groupHeight,
    3
  );

  // LIFTED: the module leaves the canvas as its preview leaves it, so it
  // reads as the module itself flying rather than a copy - and it is back as
  // the preview lands on its spot and the editor goes.
  //
  // ON THE ELEMENTS THEMSELVES, not through a stylesheet or through state. It
  // changes on the frame the flight starts, and both of those cost that
  // frame: a new rule makes the browser re-check the whole canvas's styles,
  // and a render re-renders it. Measured as a 39ms frame at departure with
  // the stylesheet. React leaves an inline property it does not set alone.
  const lifted = useRef<HTMLElement[]>([]);
  const lift = useCallback(() => {
    if (lifted.current.length > 0 || typeof document === "undefined") return;
    const ids = editing.spread?.map((piece) => piece.instanceId) ?? [editing.instanceId];
    for (const id of ids) {
      const element = document.querySelector<HTMLElement>(`[data-module-instance-id="${CSS.escape(id)}"]`);
      if (!element) continue;
      element.style.visibility = "hidden";
      lifted.current.push(element);
    }
  }, [editing.spread, editing.instanceId]);
  useEffect(
    () => () => {
      for (const element of lifted.current) element.style.visibility = "";
      lifted.current = [];
    },
    []
  );

  // IN: from the module on the canvas to here, once, as it opens.
  //
  // PAINTED FIRST, THEN FLOWN. The preview's first paint costs 50-60ms, and
  // an animation started at once spent that paint with its clock running,
  // then jumped to catch up - measured as the to-do sitting at 379-381px
  // for 59ms and then leaping to 432px. So it is laid out and painted where
  // it ends, all but invisible, while the module is still on the canvas, and
  // the flight starts on the frame after that paint, from a drawing that is
  // ready. What makes the browser paint it is the layer (will-change); the
  // 0.001 keeps it painted even if the layer is not.
  //
  // WHAT IT BUYS, measured again once the mark fades were gone: the FIRST
  // open of the heaviest preview - the two pages of hours, cold - went from a
  // 42-44ms frame to 18-28ms. A second open, or a lighter module, was smooth
  // either way. Small, but it is the open a person sees first.
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const frame = frameRef.current;
    const panel = panelRef.current;
    const origin = editing.origin;
    // Asked directly rather than through usePrefersReducedMotion, which is
    // false on the first render by design and would let this one flight run.
    if (!frame || !origin || prefersReducedMotion()) {
      lift();
      return;
    }
    frame.style.opacity = "0.001";
    // Its own layer from the start, so that first paint is the one the flight
    // moves. Promoted only when the flight began, it was painted a second
    // time - into the new layer - on the flight's first frame.
    frame.style.willChange = "transform";
    // The fields panel too: fully transparent, it was not painted until it
    // appeared - on the flight's first frame, which measured 33-43ms. Painted
    // now, every frame of the flight comes in at the display's rate.
    if (panel) {
      panel.style.opacity = "0.001";
      panel.style.willChange = "opacity, transform";
    }
    scrimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: "ease-out" });
    // No cleanup cancelling these: React's development double-invoke would
    // cancel the only flight, and `opened` keeps it to one.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!frame.isConnected) return;
        const from = flight(frame, origin);
        frame.style.opacity = "";
        if (panel) panel.style.opacity = "";
        lift();
        if (!from) return;
        const flying = frame.animate([{ transform: from }, { transform: "none" }], { duration: OPEN_MS, easing: RESIZE_EASE_CURVE });
        // Landed: back to an ordinary element, so the preview and the heading
        // field are drawn crisply at rest rather than from a cached layer.
        void flying.finished.then(
          () => (frame.style.willChange = ""),
          () => undefined
        );
        const arriving = panel?.animate([{ opacity: 0, transform: "translateX(18px)" }, { opacity: 1, transform: "none" }], {
          duration: OPEN_MS,
          delay: OPEN_MS * 0.25,
          easing: RESIZE_EASE_CURVE,
          fill: "backwards",
        });
        void arriving?.finished.then(
          () => (panel!.style.willChange = ""),
          () => undefined
        );
      })
    );
  }, [editing.origin, lift]);

  // THE HOURS SAVE AS THE JOURNAL'S HOUR SETTINGS, through the one action
  // that sizes every page's hours and makes room below them. It shrinks
  // what is below fairly and only refuses when everything there is already
  // at its minimum - and then says by how much and what is in the way, so
  // this can offer the one remaining option rather than just reporting a
  // wall. Moved here from Page Settings with the rest of the form.
  const saveHours = () =>
    run(async () => {
      const settings = draft as unknown as HoursDraft;
      const send = (deleteLowestBelowToFit?: boolean) =>
        updateHourlySettings(journalId, {
          deleteLowestBelowToFit,
          startTime: settings.startTime,
          endTime: settings.endTime,
          intervalMinutes: settings.intervalMinutes === 60 ? 60 : 30,
          intervalMode: settings.intervalMode === "off" ? "off" : "on",
          compactHourRows: settings.compactHourRows,
          rowHeightPt: settings.rowHeightPt,
          offModeRule: settings.offModeRule === "none" ? "none" : "dotted",
          hourLineStyle:
            settings.hourLineStyle === "low-transparency" || settings.hourLineStyle === "gone" ? settings.hourLineStyle : "full",
          dayBorder: settings.dayBorder === true,
          timeFormat: settings.timeFormat === "24" ? "24" : "12",
          weekStartDay: weekStart,
        });
      try {
        await send();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const match = /^HOURS_DO_NOT_FIT:(\d+):(.*)$/.exec(message);
        if (!match) throw err;
        const short = Number(match[1]);
        const names = match[2] ? match[2].split("|") : [];
        const rows = `${short} row${short === 1 ? "" : "s"}`;
        if (names.length === 0) {
          throw new Error(`These hours need ${rows} more than the page has. Try a shorter range or a smaller row height.`);
        }
        const lowest = names[names.length - 1];
        const ok = window.confirm(
          `These hours need ${rows} more than the page has, even with ${names.join(" and ")} shrunk as far as they go.\n\n` +
            `Delete "${lowest}" to make room?`
        );
        if (!ok) {
          throw new Error(`Not enough room - ${rows} short. Shorten the range, choose a smaller row height, or remove a module below the hours.`);
        }
        await send(true);
      }
      // Rebuilt: the hours' height moves what is below them on every page,
      // and a new week start renames the days. This closes the editor too.
      await refreshPages({ rebuild: true });
    });

  const save = () =>
    run(async () => {
      // Cleaned at SAVE, not on every keystroke - see cleanPropsForSave and
      // the `lines` field, where a blank line somebody is typing around has
      // to survive until they stop.
      const cleaned = cleanPropsForSave(editing.slug, draft);
      // A locked module with journal-wide settings - the month calendar -
      // sets every copy of itself, and the pages are read again, as the
      // hours are. See updateJournalModuleSettings.
      if (definition?.journalWideSettings) {
        await updateJournalModuleSettings(journalId, editing.slug, cleaned);
        await refreshPages({ rebuild: true });
        return;
      }
      const result = await updateModuleConfig(editing.instanceId, cleaned);
      // A saved module used elsewhere in this journal changed there too.
      // The server has it right; the canvas and the timeline are showing the
      // old settings, so they are read again rather than patched one by one.
      if (result.otherUsesChanged) {
        await refreshPages({ rebuild: true });
        return;
      }
      onSaved(editing.instanceId, cleaned);
      close();
    });

  // Save to Saved > Modules, with the draft committed first so what is saved
  // is what is on screen. The page reloads: the palette lists saved modules,
  // and this one is now one of them.
  const saveToSaved = (name: string) =>
    run(async () => {
      if (dirty) await updateModuleConfig(editing.instanceId, cleanPropsForSave(editing.slug, draft));
      await saveModuleToSaved(editing.instanceId, name);
      await refreshPages({ saved: true });
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${definition?.label ?? editing.slug}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: PADDING * 1.5,
        padding: PADDING,
      }}
    >
      {/* A scrim, not a blur. The canvas behind is a flat pale page, so a
          backdrop-filter would cost real GPU time to blur nothing - the same
          reasoning the timeline drawer's surface follows. Its own layer, so
          it can fade while the module flies. It dismisses; the panels do
          not. */}
      <div
        ref={scrimRef}
        onClick={close}
        style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.55)" }}
      />
      {/* THE MODULE, at a size you can see. On the page's own paper colour
          rather than on the dark chrome, because that is the ground it is
          designed against and a hairline reads differently on each. */}
      <div
        ref={frameRef}
        style={{
          width: groupWidth * scale + FRAME_PAD * 2,
          height: groupHeight * scale + FRAME_PAD * 2,
          flexShrink: 0,
          background: "#fdfcf9",
          // Square-cornered, as the palette cards are.
          outline: `2px solid ${ACCENT}`,
          outlineOffset: 3,
          position: "relative",
          overflow: "hidden",
          transformOrigin: "top left",
        }}
      >
        {/* MAGNIFIED BY A TRANSFORM, as the canvas and the palette cards
            are. The renderer draws in print px - one SVG unit to one CSS
            px - and takes `scale` only for the hairline floor; it never
            enlarges anything itself. Without this the module drew at 1:1 in
            the top-left of a frame sized for `scale`: measured 438x437 in a
            604x604 frame, the "white space outside it" that was reported. */}
        {/* ALREADY THERE, not arriving. The renderer fades every mark in
            as it mounts - right on the canvas, where a mark appearing is
            news - and here that was hundreds of fades at once as the
            preview mounted: SVG marks cannot fade on the GPU, so the whole
            drawing repainted on every frame of the flight, and the module
            left the page blank and filled in on the way. */}
        <style>{"[data-editor-piece] * { animation: none !important; }"}</style>
        {pieces.map((piece) => (
          <div
            key={piece.key}
            data-editor-piece={piece.key}
            style={{
              position: "absolute",
              left: FRAME_PAD + piece.offsetX * scale,
              top: FRAME_PAD + piece.offsetY * scale,
              width: piece.box.width,
              height: piece.box.height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <PolotnoJsonRenderer
              elements={piece.elements}
              originX={piece.box.x}
              originY={piece.box.y}
              scale={scale}
              suppressOuterBorderSize={null}
              textElements={null}
            />
          </div>
        ))}

        {/* Every text setting, as a field over where it prints - see
            CanvasTextFields. One piece only: the hours and the month calendar
            have no text to type. */}
        {pieces.length === 1 && places.slots.length > 0 && (
          <CanvasTextFields
            slots={places.slots}
            box={box}
            scale={scale}
            pad={FRAME_PAD}
            focusedId={focusedSlotId}
            pendingFocusId={pendingFocusId}
            onPendingFocusDone={() => setPendingFocusId(null)}
            onFocusChange={setFocusedSlotId}
            onText={takeText}
            onEnterItem={(slot) => {
              const next = withItemAfter(draft, places, slot.key, slot.index ?? 0);
              setDraft(next.values);
              setPendingFocusId(`${slot.key}#${next.index}`);
            }}
            onRemoveItem={(slot, focusPrevious) => {
              setDraft((current) => withoutItem(definition?.fields, current, places, slot.key, slot.index ?? 0));
              if (focusPrevious && (slot.index ?? 0) > 0) setPendingFocusId(`${slot.key}#${(slot.index ?? 0) - 1}`);
            }}
            headingSlotId={headingSlotId}
          />
        )}

        {/* A row's or a day's own icon, chosen where it prints - see
            IconPicksOnPage. */}
        {pieces.length === 1 &&
          definition?.fields?.map((field) =>
            field.kind === "iconsOnPage" ? (
              <IconPicksOnPage
                key={field.key}
                field={field}
                marks={everyMark}
                instanceId={editing.instanceId}
                values={draft}
                onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
                box={box}
                scale={scale}
                pad={FRAME_PAD}
                frame={{ width: groupWidth * scale + FRAME_PAD * 2, height: groupHeight * scale + FRAME_PAD * 2 }}
                dayNames={
                  draft.groupLabels === "days"
                    ? weekdayShortNames(weekStart).map((day) => day.charAt(0) + day.slice(1).toLowerCase())
                    : null
                }
              />
            ) : null
          )}

        {/* The table's column widths, dragged where they print. */}
        {!hours && definition?.fields?.some((field) => field.kind === "columnWidths") && (
          <ColumnDividers
            elements={flatten(drawnElements)}
            instanceId={editing.instanceId}
            columnCount={Math.max(1, ((draft.columns as unknown[] | undefined) ?? []).length)}
            rowNumbers={draft.rowNumbers === true}
            box={box}
            pitch={cellHeightPx(pageGrid)}
            latticeOrigin={pageGrid.marginPx}
            scale={scale}
            pad={FRAME_PAD}
            onChange={(cellWidths) => setDraft((current) => ({ ...current, cellWidths }))}
          />
        )}
      </div>

      <div
        ref={panelRef}
        style={{
          width: FIELDS_WIDTH,
          maxHeight: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: SURFACE,
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: PANEL_RADIUS,
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
          color: "#ddd",
          overflow: "hidden",
          // The browser's own controls in here - a dropdown's open list, a
          // checkbox, a time picker, the scrollbar - drawn for a dark panel.
          // A dropdown's list was the field's light text on the browser's
          // default white: reported 2026-09-29, "light grey text on white".
          colorScheme: "dark",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <strong style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#fff" }}>
            {definition?.label ?? editing.slug}
          </strong>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            style={{
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              border: "none",
              borderRadius: CONTROL_RADIUS,
              background: "transparent",
              color: "rgba(255,255,255,0.5)",
              cursor: "pointer",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 5l14 14M19 5L5 19"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
          {hours ? (
            <HoursFields
              values={{ ...(draft as unknown as HoursDraft), weekStartDay: weekStart }}
              onChange={({ weekStartDay: nextWeekStart, ...next }) => {
                setWeekStart(nextWeekStart);
                setDraft((current) => ({ ...current, ...next }));
              }}
              drawRule={drawRule}
            />
          ) : (
            <ModuleFieldsForm
              fields={(definition?.fields ?? []).filter((field) => !("key" in field) || !onCanvasKeys.has(field.key))}
              values={draft}
              defaults={defaults}
              drawRule={drawRule}
              // No hint that the words are edited on the preview - asked
              // 2026-10-01 to remove it; the text cursor on hover says so.
              textOnPage={onCanvasKeys.size > 0}
              onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
            />
          )}
        </div>

        {/* SAVED > MODULES. A use of a saved module says so - its settings
            are every use's, and Done changes them all. Anything else can be
            saved, to place again from the Modules panel's Saved section. */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            fontSize: 11,
            lineHeight: 1.45,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          {hours ? (
            <>A page&rsquo;s hours are part of its layout, so they cannot be saved to place again.</>
          ) : definition?.journalWideSettings ? (
            <>This is part of every page&rsquo;s layout, so it cannot be saved to place again.</>
          ) : editing.savedModule ? (
            <>
              <div style={{ color: "#fff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Saved as &ldquo;{editing.savedModule.name}&rdquo;
              </div>
              Linked: a change here changes it everywhere it is used.
            </>
          ) : saveName === null ? (
            <button
              type="button"
              onClick={() => setSaveName(definition?.label ?? "")}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                color: "#fff",
                font: "inherit",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Save this module&hellip;
            </button>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveToSaved(saveName);
              }}
              style={{ display: "grid", gap: 6 }}
            >
              <label htmlFor="memari-save-module-name">Save to Saved, to place it again anywhere</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  id="memari-save-module-name"
                  value={saveName}
                  onChange={(event) => setSaveName(event.target.value)}
                  maxLength={60}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "5px 8px",
                    font: "inherit",
                    fontSize: 12,
                    color: "#fff",
                    background: "rgba(255,255,255,0.06)",
                    // No border, as the fields have none (2026-10-01).
                    border: "none",
                    borderRadius: CONTROL_RADIUS,
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={pending || saveName.trim().length === 0}
                  style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: CONTROL_RADIUS,
                    background: ACCENT,
                    color: "#fff",
                    cursor: pending ? "default" : "pointer",
                    opacity: pending || saveName.trim().length === 0 ? 0.5 : 1,
                  }}
                >
                  Save
                </button>
              </div>
              <span>It stays linked: a change to any use changes them all.</span>
            </form>
          )}
        </div>

        <footer
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          {error && (
            <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: "#ff8f5c" }}>{error}</span>
          )}
          {!error && (
            <span
              role="status"
              style={{ flex: 1, minWidth: 0, fontSize: 11, color: headingFull || focusedSlot?.truncated ? "#ffffff" : "rgba(255,255,255,0.35)" }}
            >
              {headingFull
                ? `The heading is as long as fits at ${HEADING_SIZES_PT[HEADING_SIZES_PT.length - 1]}pt, the smallest print size`
                : focusedSlot?.truncated
                ? "Longer than its space: the page cuts it off"
                : dirty
                ? "Unsaved changes"
                : "No changes"}
            </span>
          )}
          <button
            type="button"
            onClick={hours ? saveHours : save}
            disabled={pending || !dirty}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              borderRadius: CONTROL_RADIUS,
              background: dirty ? ACCENT : "rgba(255,255,255,0.1)",
              color: dirty ? "#fff" : "rgba(255,255,255,0.4)",
              cursor: pending || !dirty ? "default" : "pointer",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "Saving…" : "Done"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** The element list without one element, wherever it sits - groups included,
 *  since a module that is not locked arrives wrapped in one. */
function withoutElement(elements: RenderedPolotnoElement[], id: string): RenderedPolotnoElement[] {
  return elements
    .filter((element) => element.id !== id)
    .map((element) =>
      element.type === "group" ? { ...element, children: withoutElement(element.children ?? [], id) } : element
    );
}
