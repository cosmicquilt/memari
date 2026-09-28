"use client";

// Page Settings > Calendars. The list, the toggle, and subscribing to a feed.
//
// WHY IT LIVES HERE. A calendar belongs to the OWNER and is shown or hidden
// PER JOURNAL - Andrew, 2026-09-26: "togglable and show up on other
// journals". The toggle is therefore a property of the book on screen, which
// is what Page Settings is for; the calendar itself is not, which is why
// renaming and recolouring change it everywhere and the switch does not.
//
// THE FEED'S ADDRESS IS A CREDENTIAL and is never shown. It is not even sent
// to this component - calendarsFor does not select it - so there is nothing
// here to leak. A subscribed calendar is identified by a badge, not by its
// URL.
//
// Deliberately plain: a row per calendar, a switch, and one disclosure for
// adding a feed. This is a settings list, not a page of the planner, so it
// takes the panel's own chrome rather than any of the drawing's.

import { useState, useTransition } from "react";
import {
  recolourCalendar,
  refreshCalendar,
  removeCalendar,
  renameCalendar,
  setCalendarVisible,
  subscribeCalendar,
} from "./actions";
import { useJournalId } from "./journalContext";
import type { LoadedCalendar } from "./loadPlannerPages";
import { CALENDAR_COLOURS } from "@/lib/calendarColours";
import { useRefreshPages } from "./pagesRefreshContext";

/** The one list - see src/lib/calendarColours.ts. It was a hand copy here
 *  until the drag preview became a third reader. */
const COLOURS: readonly string[] = CALENDAR_COLOURS;

// The row's shape is the server's - see LoadedCalendar. Declaring it again
// here is how a field ends up set on one side and read on the other.
export type { LoadedCalendar as CalendarRow } from "./loadPlannerPages";

const TEXT = "#1a1a1a";
const MUTED = "#6b6b6b";
const FAINT = "#9a9a9a";
const EDGE = "#e4e4e4";
const FILL = "#f6f6f6";

export function CalendarsPanel({ calendars }: { calendars: LoadedCalendar[] }) {
  const journalId = useJournalId();
  const refreshPages = useRefreshPages();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  /** Every change here changes what is DRAWN, so it rebuilds - the editor
   *  seeds locked modules' marks from its first props. See EventLayer's own
   *  note, and pagesRefreshContext. */
  const commit = (work: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await work();
        await refreshPages({ rebuild: true });
      } catch (error) {
        console.error("That calendar change did not take:", error);
        setNote({ ok: false, message: "That did not take. Try again." });
      }
    });

  const add = () =>
    startTransition(async () => {
      const result = await subscribeCalendar(journalId, url);
      setNote(result);
      if (result.ok) {
        setUrl("");
        setAdding(false);
        await refreshPages({ rebuild: true });
      }
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {calendars.length === 0 ? (
        <div style={{ fontSize: 11, color: FAINT, lineHeight: 1.45 }}>
          None yet. Drag on the hours to write an event, or subscribe to a calendar below.
        </div>
      ) : null}

      {calendars.map((calendar) => (
        <div key={calendar.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* The swatch is the button that opens the row's settings - it is
                already the thing the eye goes to, and a separate cog beside a
                coloured dot is two targets for one job. */}
            <button
              type="button"
              aria-label={`Settings for ${calendar.name}`}
              aria-expanded={editing === calendar.id}
              onClick={() => setEditing(editing === calendar.id ? null : calendar.id)}
              style={{
                width: 14,
                height: 14,
                flex: "0 0 auto",
                borderRadius: "50%",
                background: calendar.colour,
                border: `1px solid ${editing === calendar.id ? TEXT : "#cfccc4"}`,
                padding: 0,
                cursor: "pointer",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  color: TEXT,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={calendar.name}
              >
                {calendar.name}
              </div>
              <div style={{ fontSize: 10, color: FAINT }}>
                {calendar.eventCount} event{calendar.eventCount === 1 ? "" : "s"}
                {calendar.source ? " · subscribed" : ""}
              </div>
              {/* A FEED THAT COULD NOT BE READ says so, in words fetchIcs
                  chose for a person. Silent, it would just go stale - the
                  page keeps drawing the last good copy, which looks exactly
                  like a calendar with nothing new in it. */}
              {calendar.problem ? (
                <div style={{ fontSize: 10, color: "#a3352f", lineHeight: 1.35, marginTop: 1 }}>
                  Could not be read: {calendar.problem}
                </div>
              ) : null}
            </div>
            {/* SHOWN ON THIS JOURNAL. Not a delete and not a per-owner
                setting: the same calendar can be on one book and off another. */}
            <input
              type="checkbox"
              aria-label={`Show ${calendar.name} on this journal`}
              checked={calendar.visible}
              disabled={pending}
              onChange={(e) =>
                commit(() => setCalendarVisible(journalId, calendar.id, e.target.checked))
              }
            />
          </div>

          {editing === calendar.id ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "8px 10px",
                background: FILL,
                border: `1px solid ${EDGE}`,
                borderRadius: 8,
              }}
            >
              <input
                defaultValue={calendar.name}
                aria-label="Calendar name"
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value !== calendar.name) {
                    commit(() => renameCalendar(calendar.id, e.target.value));
                  }
                }}
                style={{
                  font: "12px/1.3 ui-sans-serif, system-ui, sans-serif",
                  color: TEXT,
                  background: "#ffffff",
                  border: `1px solid ${EDGE}`,
                  borderRadius: 6,
                  padding: "5px 7px",
                }}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {COLOURS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    aria-pressed={calendar.colour.toLowerCase() === c}
                    disabled={pending}
                    onClick={() => commit(() => recolourCalendar(calendar.id, c))}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: c,
                      border: calendar.colour.toLowerCase() === c ? `2px solid ${TEXT}` : "1px solid #cfccc4",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
              {/* SCREEN ONLY, said here rather than left to be discovered on a
                  proof: the print grey is a settled decision, not a bug. */}
              <div style={{ fontSize: 10, color: FAINT, lineHeight: 1.4 }}>
                Colour is for the screen. Printed pages use grey.
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {calendar.source ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        setNote(await refreshCalendar(calendar.id));
                        await refreshPages({ rebuild: true });
                      })
                    }
                    style={secondary}
                  >
                    Refresh
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setEditing(null);
                    commit(() => removeCalendar(calendar.id));
                  }}
                  style={{ ...secondary, color: "#a3352f" }}
                >
                  {calendar.source ? "Unsubscribe" : "Delete"}
                </button>
              </div>
              {calendar.source ? (
                <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.4 }}>
                  Events on a subscribed calendar are read-only here. Change them where they live and
                  they will follow.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}

      {adding ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            value={url}
            autoFocus
            placeholder="https://…/basic.ics"
            aria-label="Calendar address"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim()) add();
              if (e.key === "Escape") setAdding(false);
            }}
            style={{
              font: "12px/1.3 ui-sans-serif, system-ui, sans-serif",
              color: TEXT,
              background: "#ffffff",
              border: `1px solid ${EDGE}`,
              borderRadius: 6,
              padding: "6px 8px",
            }}
          />
          {/* WHERE TO FIND THE ADDRESS, because nobody knows off-hand and a
              blank field with no hint is where this feature would die. */}
          <div style={{ fontSize: 10, color: FAINT, lineHeight: 1.45 }}>
            Google: Settings → your calendar → <em>Secret address in iCal format</em>. Apple: share the
            calendar, tick Public. Outlook: Settings → Calendar → Shared calendars → Publish.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" disabled={pending || !url.trim()} onClick={add} style={primary}>
              {pending ? "Reading…" : "Subscribe"}
            </button>
            <button type="button" disabled={pending} onClick={() => setAdding(false)} style={secondary}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => { setAdding(true); setNote(null); }} style={secondary}>
          Subscribe to a calendar…
        </button>
      )}

      {note ? (
        <div style={{ fontSize: 11, lineHeight: 1.4, color: note.ok ? MUTED : "#a3352f" }}>{note.message}</div>
      ) : null}
    </div>
  );
}

const secondary: React.CSSProperties = {
  font: "11px/1 ui-sans-serif, system-ui, sans-serif",
  color: TEXT,
  background: "#ffffff",
  border: `1px solid ${EDGE}`,
  borderRadius: 6,
  padding: "6px 9px",
  cursor: "pointer",
};

const primary: React.CSSProperties = {
  ...secondary,
  background: "#2f2d29",
  borderColor: "#2f2d29",
  color: "#ffffff",
};
