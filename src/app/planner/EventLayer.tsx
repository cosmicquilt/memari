"use client";

// Adding and editing calendar events, on the hourly grid itself.
//
// WHERE THE INTERACTION LIVES. Not in a sidebar list: a week of hours is
// already a picture of when things are, and both references Andrew looked at
// (Google and iCloud) do the same thing - "within it the event adders are
// popups". So this is a transparent sheet over the drawn grid that turns a
// click or a drag into a time, and a small popup that edits the row.
//
// WHAT IT DOES NOT DO. It does not draw events. Those are drawn by
// renderHourlyGridCore, from rows the server placed through
// renderContextForPage, exactly as they will print - so what is on screen
// while editing is the page, not a picture of it. The only marks this adds
// are the drag's own preview, which is not a page element and never prints.
//
// HOW IT KNOWS WHERE ANYTHING IS. Two pure functions, both reading the
// renderer's own geometry rather than guessing at it: hourlyGridGeometry for
// the rows and columns, and drawnEventBoxes, which reads the hit areas OFF
// THE MARKS. See src/lib/hourlyGridHit.ts - a second copy of the placement
// maths would be the "two descriptions of one geometry" defect that has cost
// this project more than any other.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  hourlyGridGeometry,
  renderHourlyGridCore,
  type HourlyGridCoreConfig,
  type HourlyGridEvent,
} from "@/lib/modules/hourlyGridCore";
import { UNTITLED_EVENT } from "@/lib/calendarEvents";
import { DEFAULT_CALENDAR_COLOUR } from "@/lib/calendarColours";
import { PolotnoJsonRenderer } from "./PolotnoJsonRenderer";
import {
  boxAt,
  drawnEventBoxes,
  endMinutesForDrag,
  hhmmOf,
  slotAt,
  type DrawnEventBox,
  type SlotHit,
} from "@/lib/hourlyGridHit";
import { placeAnchoredPanel } from "@/lib/anchoredPanel";
import type { RenderedPolotnoElement } from "@/lib/renderModuleInstance";
import type { LoadedCalendar, SerialisedEvent } from "./loadPlannerPages";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  deleteCalendarOccurrence,
  updateCalendarEvent,
  updateCalendarOccurrence,
} from "./actions";
import { useJournalId } from "./journalContext";
import { useRefreshPages } from "./pagesRefreshContext";
import { CREAM, onCream } from "@/lib/cream";

// Same shape the settings list uses, from the server - see LoadedCalendar.
export type { LoadedCalendar as CalendarChoice } from "./loadPlannerPages";

/** What the Repeat row offers. Kept to the rules calendarEvents.ts actually
 *  draws: an option that stored a rule this app cannot expand would save
 *  happily and then show nothing, which reads as a broken save. */
const REPEATS: Array<{ label: string; rrule: string | null }> = [
  { label: "Never", rrule: null },
  { label: "Every day", rrule: "FREQ=DAILY" },
  { label: "Every week", rrule: "FREQ=WEEKLY" },
  { label: "Every weekday", rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  { label: "Every 2 weeks", rrule: "FREQ=WEEKLY;INTERVAL=2" },
];

const PANEL_WIDTH = 268;

/** The drawn preview's own event id - never a stored row's, so its marks can
 *  be picked out of a render that also holds the page's real events. */
const PREVIEW_ID = "preview";

/** The event being edited, as the popup holds it. A new one has no id. */
type Draft = {
  id: string | null;
  title: string;
  /** "YYYY-MM-DD" - the column's own day. */
  date: string;
  /** "HH:MM". */
  start: string;
  end: string;
  allDay: boolean;
  rrule: string | null;
  /** WHICH CALENDAR, because that is what carries the colour and what a
   *  future sync pushes to. Null lets the server use the owner's default,
   *  which it makes on first use. */
  calendarId: string | null;
  /** WHERE IT CAME FROM. Non-null means it belongs to a feed, and the next
   *  sync reads that feed again - so an edit here would be silently undone.
   *  The popup shows it, and says why, rather than letting that happen. */
  source: string | null;
  /** WHICH WEEK, when this is one occurrence of a repeating event - its
   *  original start in ms, as the placer drew it. Null for a one-off. */
  occurrence: string | null;
  /** The series' own rule as stored, so the popup knows it is one - `rrule`
   *  above is what the person is editing it TO. */
  seriesRule: string | null;
  /** "one": only this week. "all": the whole series. Google asks the same
   *  question and defaults the same way - the week you clicked is the one
   *  you were looking at. */
  scope: "one" | "all";
  /** Where the popup points, in viewport coordinates. */
  anchor: { top: number; bottom: number; right: number };
};

export function EventLayer({
  elements,
  propValues,
  geometry,
  lattice,
  originX,
  originY,
  scale,
  columnDates,
  events,
  placed,
  calendars,
  fontFamily,
  setAside,
}: {
  /** The marks this module drew. The hit areas are read from them. */
  elements: ReadonlyArray<RenderedPolotnoElement>;
  /** The props it was drawn from - already dated and rotated. */
  propValues: unknown;
  geometry: { x: number; y: number; width: number; height: number };
  lattice: { pitchPx: number; originX: number; originY: number; insetPx: number };
  /** The module box's own print-space origin, which is what the DOM box's
   *  top-left corresponds to. */
  originX: number;
  originY: number;
  /** CSS px per print px. */
  scale: number;
  /** Which day each column is, "YYYY-MM-DD", or null for a dateless one. */
  columnDates: Array<string | null>;
  /** The owner's stored rows, for the fields a drawing does not carry - the
   *  repeat rule, the calendar, where it came from. */
  events: SerialisedEvent[];
  /** THIS PAGE'S EVENTS AS DRAWN - day, start and end already in the book's
   *  zone, by the one function that placed them. The popup reads its times
   *  here and nowhere else. */
  placed: HourlyGridEvent[];
  /** The owner's calendars. One is the ordinary case and the popup does not
   *  ask; an imported calendar makes it a choice. */
  calendars: LoadedCalendar[];
  /** The book's font - the preview is drawn by the same renderer as the
   *  saved event, and that renderer sets the label in it. */
  fontFamily: string;
  /** Ask the module to set some of its own marks aside while the preview
   *  draws them re-laid-out - see previewMarks. */
  setAside?: (ids: ReadonlySet<string> | null) => void;
}) {
  const journalId = useJournalId();
  const refreshPages = useRefreshPages();
  const surface = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragging, setDragging] = useState<{ from: SlotHit; toSlot: number } | null>(null);
  const [saving, setSaving] = useState(false);
  /** A new event just SAVED, still drawn as a preview until the rebuild puts
   *  the real one there. Without it the block vanished for the length of the
   *  round trip and then reappeared, which reads as the save having failed. */
  const [landing, setLanding] = useState<Draft | null>(null);
  /** An event being deleted - its key, or "id@occurrence" for one week of a
   *  series - hidden until the drawing without it arrives. */
  const [removing, setRemoving] = useState<string | null>(null);

  // THE HAND-OVER. When the module's own marks change, the saved event (or
  // the deletion) has arrived in them, so the preview standing in for it
  // steps aside - in the same render, so the event is never missing and
  // never doubled. During render rather than in an effect, which would paint
  // one frame of both or neither.
  const [seenElements, setSeenElements] = useState(elements);
  if (seenElements !== elements) {
    setSeenElements(elements);
    setLanding(null);
    setRemoving(null);
  }

  const grid = useMemo(
    () => hourlyGridGeometry(geometry, propValues as HourlyGridCoreConfig, lattice),
    [geometry, propValues, lattice]
  );

  /**
   * WHAT A DRAG COVERS, whichever way it went - read by the preview AND by the
   * event it creates, so the two cannot disagree. They did: the save counted
   * from where the drag STARTED, so dragging upward previewed three rows and
   * saved one.
   */
  const spanOf = useCallback(
    (drag: { from: SlotHit; toSlot: number }) => {
      const top = Math.min(drag.from.slot, drag.toSlot);
      const bottom = Math.max(drag.from.slot, drag.toSlot);
      return {
        day: drag.from.day,
        top,
        bottom,
        start: grid.startMinutes + top * grid.intervalMinutes,
        end: endMinutesForDrag(grid, { ...drag.from, slot: top }, bottom),
      };
    },
    [grid]
  );
  const boxes = useMemo(() => drawnEventBoxes(elements), [elements]);
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  /** A pointer event's position in the drawing's own print px. */
  const pointAt = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const rect = surface.current?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: originX + (e.clientX - rect.left) / scale,
        y: originY + (e.clientY - rect.top) / scale,
      };
    },
    [originX, originY, scale]
  );

  /** A print-space rectangle, as a viewport rectangle - what the popup needs
   *  to point at the block it is editing. */
  const anchorOf = useCallback(
    (box: { x: number; y: number; width: number; height: number }) => {
      const rect = surface.current?.getBoundingClientRect();
      if (!rect) return { top: 0, bottom: 0, right: 0 };
      const top = rect.top + (box.y - originY) * scale;
      const left = rect.left + (box.x - originX) * scale;
      return { top, bottom: top + box.height * scale, right: left + box.width * scale };
    },
    [originX, originY, scale]
  );

  const openExisting = useCallback(
    (hit: DrawnEventBox) => {
      // THE BAND IS ONE BOX FOR A WHOLE DAY however many all-day things are
      // in it, and it labels the first with "+N" - see ALL_DAY_BAND_HEIGHT_PT.
      // So a click on it edits that first one, which is the one it names.
      //
      // WHAT WAS DRAWN, not the stored row, says what the popup shows. The
      // placer already worked out this column's instance in the book's zone -
      // its day, its start, its end - and reading the row's startsAt instead
      // gave the UTC clock: a 9am New York meeting opened as "13:00". It also
      // missed the second and third days of a multi-day all-day event, whose
      // stored start is only the first.
      const drawn = hit.eventId
        ? placed.find(
            (e) => e.id === hit.eventId && e.day === hit.day && (e.occurrence ?? null) === hit.occurrence
          )
        : placed.find((e) => e.allDay && e.day === hit.day);
      const row = drawn?.id ? byId.get(drawn.id) : undefined;
      const date = columnDates[hit.day];
      if (!drawn || !row || !date) return;
      setDraft({
        id: row.id,
        title: row.title,
        date,
        start: drawn.startTime,
        end: drawn.endTime,
        allDay: row.allDay,
        rrule: row.rrule,
        calendarId: row.calendarId,
        source: row.source,
        occurrence: drawn.occurrence ?? null,
        seriesRule: row.rrule,
        scope: row.rrule && drawn.occurrence ? "one" : "all",
        anchor: anchorOf(hit),
      });
    },
    [anchorOf, byId, columnDates, placed]
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const p = pointAt(e);
      if (!p) return;

      const onBlock = boxAt(boxes, p);
      if (onBlock) {
        e.stopPropagation();
        // No text selection from this press - see below.
        e.preventDefault();
        openExisting(onBlock);
        return;
      }

      const slot = slotAt(grid, p);
      // A MISS DOES NOTHING, and deliberately does not fall through to the
      // nearest slot - see slotAt. It also does not stop propagation, so a
      // click on the day tab or in the gutter still reaches whatever else
      // wanted it.
      if (!slot) return;
      e.stopPropagation();
      // A PRESS THAT STARTS A DRAG IS NOT THE START OF A TEXT SELECTION. Left
      // to its default, the browser anchored a selection here, and dragging
      // across the preview stretched it over "Untitled" - reported
      // 2026-09-28. Not on a miss: a press on the day tab or in the gutter is
      // left alone for whatever else wants it.
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDraft(null);
      setDragging({ from: slot, toSlot: slot.slot });
    },
    [boxes, grid, openExisting, pointAt]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const p = pointAt(e);
      if (!p) return;
      // Only the ROW follows the pointer. Dragging sideways onto another day
      // would make one gesture mean two things, and a diagonal drag would
      // then land somewhere neither end of it pointed at.
      const rowsHigh = p.y - grid.gridTop;
      const toSlot = Math.max(0, Math.min(grid.rowCount - 1, Math.floor(rowsHigh / grid.rowHeight)));
      if (toSlot !== dragging.toSlot) setDragging({ ...dragging, toSlot });
    },
    [dragging, grid, pointAt]
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      const span = spanOf(dragging);
      setDragging(null);
      const date = columnDates[span.day];
      // NO DATE, NO EVENT. An undated book has no day for a column, so there
      // is no instant to store - and storing one anyway would put a date on a
      // planner whose whole point is not having them.
      if (!date) return;
      setDraft({
        id: null,
        title: "",
        date,
        start: hhmmOf(span.start),
        end: hhmmOf(span.end),
        allDay: false,
        rrule: null,
        calendarId: calendars.find((c) => c.visible && !c.source)?.id ?? null,
        // A NEW event is always this app's own. It is never put on a
        // subscribed calendar, because the next sync would notice a row the
        // feed has no UID for and tombstone it.
        source: null,
        occurrence: null,
        seriesRule: null,
        scope: "all",
        anchor: anchorOf({
          x: grid.columnX[span.day],
          y: grid.gridTop + span.top * grid.rowHeight,
          width: grid.dayColumnWidth,
          height: (span.bottom - span.top + 1) * grid.rowHeight,
        }),
      });
    },
    [anchorOf, calendars, columnDates, dragging, grid, spanOf]
  );

  const save = useCallback(async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      // WALL-CLOCK TIMES, sent as what they are. This used to glue a Z on -
      // "2026-09-28T09:00:00.000Z" - which is an instant in UTC nobody meant.
      // The server knows the book's zone and turns these into an instant
      // there, in one place. See EventInput.
      const input = {
        title: draft.title,
        date: draft.date,
        start: draft.start,
        end: draft.end,
        allDay: draft.allDay,
        rrule: draft.rrule,
        calendarId: draft.calendarId,
      };
      if (draft.id && draft.scope === "one" && draft.occurrence) {
        await updateCalendarOccurrence(journalId, draft.id, draft.occurrence, input);
      } else if (draft.id) await updateCalendarEvent(journalId, draft.id, input);
      else await createCalendarEvent(journalId, input);
      if (!draft.id) setLanding(draft);
      setDraft(null);
      // NOT REBUILT. It was, and every event added made the whole canvas
      // visibly refresh. The editor now takes the hourly grid's fresh
      // drawing from the new props in place (see NativePlannerEditor), and
      // the preview stands in until it arrives - the hand-over is below.
      await refreshPages();
      setSaving(false);
    } catch (error) {
      console.error("Could not save that event:", error);
      setSaving(false);
    }
  }, [draft, journalId, refreshPages, saving]);

  const remove = useCallback(async () => {
    if (!draft?.id || saving) return;
    setSaving(true);
    try {
      // GONE AT ONCE, not when the server answers: its marks are set aside
      // now, and stay aside until the fresh drawing (without it) arrives.
      setRemoving(draft.scope === "one" && draft.occurrence ? `${draft.id}@${draft.occurrence}` : draft.id);
      if (draft.scope === "one" && draft.occurrence) await deleteCalendarOccurrence(draft.id, draft.occurrence);
      else await deleteCalendarEvent(draft.id);
      setDraft(null);
      await refreshPages();
      setSaving(false);
    } catch (error) {
      console.error("Could not delete that event:", error);
      setSaving(false);
    }
  }, [draft, refreshPages, saving]);

  // Escape closes, which is the one keyboard affordance a popup like this
  // must have - there is no other way out of it without saving.
  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft]);

  // THE EVENT BEING MADE, as the event it will be - while dragging, while
  // the popup is open (it disappeared then, reported 2026-09-28), and for the
  // moment between Add and the saved one arriving. An existing event being
  // edited has no preview: it is already drawn.
  const previewEvent: HourlyGridEvent | null = useMemo(() => {
    const colourOf = (calendarId: string | null) =>
      calendars.find((c) => c.id === calendarId)?.colour ?? calendars.find((c) => !c.source)?.colour ?? DEFAULT_CALENDAR_COLOUR;
    if (dragging) {
      const span = spanOf(dragging);
      return {
        id: PREVIEW_ID,
        day: span.day,
        startTime: hhmmOf(span.start),
        endTime: hhmmOf(span.end),
        label: UNTITLED_EVENT,
        source: "manual",
        colour: colourOf(calendars.find((c) => c.visible && !c.source)?.id ?? null),
      };
    }
    const making = draft && !draft.id ? draft : landing;
    if (!making) return null;
    const day = columnDates.indexOf(making.date);
    if (day < 0) return null;
    return {
      id: PREVIEW_ID,
      day,
      startTime: making.allDay ? "00:00" : making.start,
      endTime: making.allDay ? "23:59" : making.end,
      label: making.title.trim() || UNTITLED_EVENT,
      source: "manual",
      colour: colourOf(making.calendarId),
      ...(making.allDay ? { allDay: true } : {}),
    };
  }, [dragging, draft, landing, calendars, columnDates, spanOf]);

  // DRAWN BY THE RENDERER, not styled to resemble it. The preview used to be
  // a hand-made box - its own border, its own width, its own colour - and was
  // wrong in each: a heavier border, the full column width over the time
  // labels. A second description of what an event looks like will always
  // drift from the first; the only preview that looks like the final version
  // is the final version's own drawing. So the grid is drawn with this event
  // added - alongside the page's real ones, so a clash splits the column
  // exactly as it will once saved - and only this event's marks are kept.
  //
  // In the module's own print px, like every other mark in it: this sheet
  // sits inside the module box, which the canvas zoom shrinks. (Scaling it
  // here as well is what put every preview in the first day at the top.)
  //
  // THE WHOLE DAY, not just the new event. A new event dragged across an
  // existing one splits the column between them once saved; drawing only the
  // new one showed it at half width with the old one still full width
  // underneath, which is not what the page will look like. So every event
  // of that kind on that day is drawn from this render, and the module sets
  // its own copies of them aside for the moment (see `setAside`). The all-
  // day band works the same way: it is one box per day, so the new event's
  // band replaces the old one, "+1" and all.
  const dayOf = previewEvent?.day ?? null;
  const allDay = Boolean(previewEvent?.allDay);
  const inPreviewDay = useCallback(
    (id: string) =>
      dayOf !== null && (allDay ? id.includes(`-d${dayOf}-allday-`) : id.includes(`-d${dayOf}-ev`)),
    [dayOf, allDay]
  );
  const previewMarks = useMemo(() => {
    if (!previewEvent) return null;
    const config = propValues as HourlyGridCoreConfig;
    const marks = renderHourlyGridCore(
      geometry,
      { ...config, events: [...(config.events ?? []), previewEvent] },
      "event-preview",
      fontFamily,
      lattice
    );
    return marks.filter((m) => inPreviewDay(m.id));
  }, [previewEvent, propValues, geometry, lattice, fontFamily, inPreviewDay]);

  // The module's own marks for that day, set aside while the preview stands
  // in for them - and handed back the moment there is no preview.
  const standingIn = useMemo(() => {
    const ids = new Set<string>();
    if (previewMarks) for (const e of elements) if (inPreviewDay(e.id)) ids.add(e.id);
    // A deletion: every mark of that event (or of that one week of it).
    if (removing) {
      const key = removing.includes("@") ? `-ev${removing}-` : `-ev${removing}`;
      for (const e of elements) {
        if (removing.includes("@") ? e.id.includes(key) : e.id.includes(`${key}-`) || e.id.includes(`${key}@`)) ids.add(e.id);
      }
    }
    return ids.size > 0 ? ids : null;
  }, [previewMarks, elements, inPreviewDay, removing]);
  // BEFORE PAINT. As a passive effect this ran after the frame was drawn, so
  // the frame the preview stepped aside in still had the module hiding the
  // day's OLD marks - measured: a new event dragged across an existing one
  // showed one block, not two, for a frame while saving. In a layout effect
  // the module's update lands before that frame is painted.
  useLayoutEffect(() => {
    setAside?.(standingIn);
  }, [setAside, standingIn]);
  useEffect(() => () => setAside?.(null), [setAside]);

  return (
    <>
      <div
        ref={surface}
        data-event-layer
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDragging(null)}
        style={{
          position: "absolute",
          inset: 0,
          // Above the drawing, which is pointerEvents:none, and below the
          // module's own controls, which sit outside the box.
          zIndex: 1,
          cursor: "cell",
          touchAction: "none",
          // And nothing in the sheet - the preview's label included - can be
          // selected at all, whichever way a gesture reaches it.
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        {previewMarks && previewMarks.length > 0 ? (
          <div data-event-preview style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <PolotnoJsonRenderer
              elements={previewMarks}
              originX={originX}
              originY={originY}
              scale={scale}
              suppressOuterBorderSize={null}
            />
          </div>
        ) : null}
      </div>
      {draft ? (
        <EventPopup
          draft={draft}
          calendars={calendars}
          saving={saving}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={save}
          onDelete={remove}
        />
      ) : null}
    </>
  );
}

/**
 * The popup. A portal to the body, not a child of the module.
 *
 * It has to be: every module sits inside the canvas's zoom wrapper, which is
 * a CSS transform, and a transform makes its element the containing block for
 * anything fixed inside it - so a popup rendered in place would be scaled by
 * the zoom and clipped by the page. Out here it is at 100%, over everything,
 * wherever the block it belongs to happens to be on screen.
 */
function EventPopup({
  draft,
  calendars,
  saving,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  draft: Draft;
  calendars: LoadedCalendar[];
  saving: boolean;
  onChange: (draft: Draft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const title = useRef<HTMLInputElement | null>(null);
  // AN EVENT FROM A FEED IS NOT OURS TO CHANGE. The next sync overwrites it,
  // so an editable field here is a field whose edits quietly vanish - which
  // is worse than not offering one. Shown, explained, and left alone.
  const readOnly = draft.source !== null;
  // ONE WEEK OF A SERIES: its time and title can change, its rule and its
  // all-day-ness cannot - those are the series', and changing them for a
  // single week is what "all events" is for.
  const oneWeek = draft.scope === "one";
  const isSeries = Boolean(draft.seriesRule && draft.occurrence);
  const place = placeAnchoredPanel(
    draft.anchor,
    { width: window.innerWidth, height: window.innerHeight },
    PANEL_WIDTH
  );

  // Before the first paint, so the caret is in the title field by the time
  // the popup is visible rather than one frame later.
  useLayoutEffect(() => {
    title.current?.focus();
    title.current?.select();
  }, []);

  const field: React.CSSProperties = {
    font: "13px/1.3 var(--font-ui)",
    color: "#1a1a1a",
    background: CREAM,
    border: "1px solid #d5d3cd",
    borderRadius: 6,
    padding: "6px 8px",
    width: "100%",
    boxSizing: "border-box",
  };
  const label: React.CSSProperties = {
    font: "11px/1 var(--font-ui)",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#7a7871",
  };

  return createPortal(
    <>
      {/* A click anywhere else closes it without saving. Escape does too -
          see the handler in EventLayer. */}
      <div
        onPointerDown={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 60 }}
      />
      <div
        role="dialog"
        aria-label={draft.id ? "Edit event" : "New event"}
        style={{
          position: "fixed",
          left: place.left,
          ...(place.place === "above" ? { bottom: place.offset } : { top: place.offset }),
          width: PANEL_WIDTH,
          maxHeight: Math.max(place.maxHeight, 240),
          overflowY: "auto",
          zIndex: 61,
          background: onCream(0xf9),
          border: "1px solid #ddd9d1",
          borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <input
          ref={title}
          value={draft.title}
          placeholder="Event"
          readOnly={readOnly}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !readOnly) onSave();
          }}
          style={{
            ...field,
            font: "14px/1.3 var(--font-ui)",
            ...(readOnly ? { background: onCream(0xef), color: "#55534e" } : {}),
          }}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 8, ...label, textTransform: "none", fontSize: 12 }}>
          <input
            type="checkbox"
            checked={draft.allDay}
            disabled={readOnly || oneWeek}
            onChange={(e) => onChange({ ...draft, allDay: e.target.checked })}
          />
          All day
        </label>

        {/* THE DATE IS THE COLUMN'S, not a field. The event was put on a day
            by being drawn there; offering a date box as well would let the two
            disagree, and the one on screen would be wrong. Moving an event to
            another day is a drag, which is not built yet. */}
        <div style={label}>{draft.date}</div>

        {draft.allDay ? null : (
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...label, marginBottom: 4 }}>Starts</div>
              <input
                type="time"
                value={draft.start}
                step={300}
                disabled={readOnly}
                onChange={(e) => onChange({ ...draft, start: e.target.value })}
                style={field}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...label, marginBottom: 4 }}>Ends</div>
              <input
                type="time"
                value={draft.end}
                step={300}
                disabled={readOnly}
                onChange={(e) => onChange({ ...draft, end: e.target.value })}
                style={field}
              />
            </div>
          </div>
        )}

        <div>
          <div style={{ ...label, marginBottom: 4 }}>Repeat</div>
          <select
            value={draft.rrule ?? ""}
            disabled={readOnly || oneWeek}
            onChange={(e) => onChange({ ...draft, rrule: e.target.value || null })}
            style={field}
          >
            {REPEATS.map((r) => (
              <option key={r.label} value={r.rrule ?? ""}>
                {r.label}
              </option>
            ))}
            {/* An imported rule this app does not expand is kept rather than
                silently rewritten - see recursOn. It shows here so editing
                the title of such an event cannot quietly turn it into a
                weekly one. */}
            {draft.rrule && !REPEATS.some((r) => r.rrule === draft.rrule) ? (
              <option value={draft.rrule}>Custom ({draft.rrule})</option>
            ) : null}
          </select>
        </div>

        {/* CALENDAR - only when there is a choice to make. A person with one
            calendar has nothing to pick, and a select with a single option is
            a control that does nothing; the server files the event on the
            owner's default, which it makes on first use. The row appears by
            itself the moment a second calendar exists, which is what
            importing a Google or holiday calendar will do.

            The colour belongs to the CALENDAR, not to the event, and it is a
            SCREEN affordance either way - print takes grey, because colour
            pages cost money. Recolouring or renaming a calendar is not here
            yet; it belongs wherever calendars are listed and toggled. */}
        {calendars.length > 1 ? (
          <div>
            <div style={{ ...label, marginBottom: 4 }}>Calendar</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  flex: "0 0 auto",
                  background:
                    calendars.find((c) => c.id === draft.calendarId)?.colour ?? calendars[0].colour,
                  border: "1px solid #cfccc4",
                }}
              />
              <select
                value={draft.calendarId ?? calendars[0].id}
                onChange={(e) => onChange({ ...draft, calendarId: e.target.value })}
                style={field}
              >
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {isSeries && !readOnly ? (
          <div
            role="radiogroup"
            aria-label="Change which"
            style={{ display: "flex", gap: 2, background: onCream(0xed), borderRadius: 8, padding: 2 }}
          >
            {(
              [
                ["one", "This event"],
                ["all", "All events"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={draft.scope === value}
                onClick={() =>
                  // Back to the series' own rule when widening to all events:
                  // a rule edited while it was greyed out cannot have moved,
                  // but a stale one must not ride along either.
                  onChange({ ...draft, scope: value, rrule: draft.seriesRule })
                }
                style={{
                  flex: 1,
                  font: "12px/1 var(--font-ui)",
                  padding: "6px 0",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: draft.scope === value ? CREAM : "transparent",
                  color: draft.scope === value ? "#1a1a1a" : "#7a7871",
                  boxShadow: draft.scope === value ? "0 1px 2px rgba(0,0,0,0.12)" : "none",
                }}
              >
                {text}
              </button>
            ))}
          </div>
        ) : null}

        {readOnly ? (
          <div style={{ fontSize: 11, lineHeight: 1.45, color: "#6b6b6b", marginTop: 2 }}>
            This event comes from a subscribed calendar. Change it where it lives and it will follow
            on the next read.
          </div>
        ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            style={{
              flex: 1,
              font: "13px/1 var(--font-ui)",
              padding: "8px 10px",
              borderRadius: 7,
              border: "1px solid #2f2d29",
              background: saving ? "#8b8880" : "#2f2d29",
              color: CREAM,
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "Saving…" : draft.id ? "Save" : "Add"}
          </button>
          {draft.id ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={saving}
              style={{
                font: "13px/1 var(--font-ui)",
                padding: "8px 10px",
                borderRadius: 7,
                border: "1px solid #d5d3cd",
                background: CREAM,
                color: "#a3352f",
                cursor: saving ? "default" : "pointer",
              }}
            >
              Delete
            </button>
          ) : null}
        </div>
        )}
      </div>
    </>,
    document.body
  );
}
