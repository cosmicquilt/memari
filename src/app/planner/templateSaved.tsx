"use client";

// SAVE BUTTONS (2026-10-21): wherever something of ours is shown - a
// planner, a layout, a module - a bookmark to keep it in Saved. The same
// button everywhere, in three sizes:
//
//   - "pill": Save / Saved, beside Use this (the start dialog's details, the
//     zoom's header, the Layouts popup, a planner's buttons).
//   - "icon": a round bookmark beside a module's own preview (the module
//     list, the module pages).
//   - ModuleSaveRegions: over a spread, each module a region that shows
//     "Save" centred in it on hover - the nested part: save the whole
//     planner or page from the header, or any one module from inside it.
//
// One store for the page (what this person has saved, by source key -
// lib/templateSave.ts), fetched once, changed optimistically, and a short
// message after each change with the way to Saved. The server is
// app/saved/template; saving there makes a guest of someone new.

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { sourceKeyOf, type SavedWhere, type TemplateSave } from "@/lib/templateSave";
import css from "./templateSaved.module.css";

// ------------------------------------------------------------------ store

type Note = { id: number; text: string; href?: string; link?: string };
type State = { keys: ReadonlySet<string>; loaded: boolean; note: Note | null };

let state: State = { keys: new Set(), loaded: false, note: null };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const SERVER: State = { keys: new Set(), loaded: false, note: null };

let loading: Promise<void> | null = null;
function load() {
  loading ??= fetch("/app/saved/template", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { keys: [] }))
    .then((body: { keys?: string[] }) => set({ keys: new Set(body.keys ?? []), loaded: true }))
    .catch(() => {
      loading = null;
    });
  return loading;
}

/** Called after every change that reached the server: the start dialog
 *  refreshes its Saved lists from it. */
const afterChange = new Set<() => void>();
export function onTemplateSaved(callback: () => void): () => void {
  afterChange.add(callback);
  return () => afterChange.delete(callback);
}

const WHERE: Record<SavedWhere, string> = { journals: "Journals", pages: "Pages", modules: "Modules" };
let noteId = 0;
let noteTimer = 0;
function say(text: string, where?: SavedWhere) {
  window.clearTimeout(noteTimer);
  set({ note: { id: ++noteId, text, ...(where ? { href: `/app?saved=${where}`, link: "Open Saved" } : {}) } });
  noteTimer = window.setTimeout(() => set({ note: null }), 4200);
}

async function toggle(save: TemplateSave) {
  const key = sourceKeyOf(save);
  const was = state.keys.has(key);
  const next = new Set(state.keys);
  if (was) next.delete(key);
  else next.add(key);
  set({ keys: next });
  try {
    const r = await fetch("/app/saved/template", {
      method: was ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(save),
    });
    const body = (await r.json().catch(() => ({}))) as { keys?: string[]; where?: SavedWhere; name?: string; error?: string };
    if (!r.ok) throw new Error(body.error ?? "It did not save.");
    set({ keys: new Set(body.keys ?? [...next]) });
    if (was) say("Removed from Saved");
    else say(`${body.name ?? "It"} is in Saved › ${WHERE[body.where ?? "pages"]}`, body.where);
    afterChange.forEach((callback) => callback());
  } catch (error) {
    // Put it back as it was, and say why.
    const back = new Set(state.keys);
    if (was) back.add(key);
    else back.delete(key);
    set({ keys: back });
    say(error instanceof Error ? error.message : "It did not save.");
  }
}

function useSaved(save: TemplateSave): boolean {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER);
  useEffect(() => {
    void load();
  }, []);
  return s.keys.has(sourceKeyOf(save));
}

// ------------------------------------------------------------------ the message

/** The one message on the page: shown by whichever button mounted first. */
let host: string | null = null;
const hostListeners = new Set<() => void>();
function SavedNote() {
  const id = useId();
  const [, rerender] = useState(0);
  useEffect(() => {
    const claim = () => {
      if (host === null) {
        host = id;
        rerender((n) => n + 1);
      }
    };
    claim();
    hostListeners.add(claim);
    return () => {
      hostListeners.delete(claim);
      if (host === id) {
        host = null;
        hostListeners.forEach((l) => l());
      }
    };
  }, [id]);
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER);
  if (host !== id || !s.note) return null;
  return createPortal(
    <div className={css.note} role="status" key={s.note.id}>
      <span>{s.note.text}</span>
      {s.note.href && (
        <a href={s.note.href} className={css.noteLink}>
          {s.note.link}
        </a>
      )}
    </div>,
    document.body
  );
}

// ------------------------------------------------------------------ buttons

function Bookmark({ filled, size = 16 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2-6.5 4.2v-16a1 1 0 0 1 1-1z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Save / Saved. `tone` is what it sits on: the start dialog's or the site's
 * own colours ("ink", taking the text colour around it), or the zoom's dark.
 */
export function SaveButton({
  save,
  variant = "pill",
  tone = "ink",
  label = "Save",
  savedLabel = "Saved",
  what,
}: {
  save: TemplateSave;
  variant?: "pill" | "icon";
  tone?: "ink" | "dark";
  label?: string;
  savedLabel?: string;
  /** For a screen reader: "the Stoic practice planner". */
  what: string;
}) {
  const saved = useSaved(save);
  return (
    <>
      <button
        type="button"
        className={variant === "icon" ? css.icon : css.pill}
        data-tone={tone}
        data-saved={saved || undefined}
        aria-pressed={saved}
        aria-label={saved ? `Saved: ${what}. Remove it from Saved` : `Save ${what}`}
        title={saved ? "In your Saved. Press to remove it." : "Keep it in your Saved"}
        onClick={(e) => {
          e.stopPropagation();
          void toggle(save);
        }}
      >
        <Bookmark filled={saved} />
        {variant === "pill" && <span>{saved ? savedLabel : label}</span>}
      </button>
      <SavedNote />
    </>
  );
}

/** One module over a spread: where it is drawn, as a fraction of its page. */
export type SaveRegion = { save: TemplateSave; name: string; box: [number, number, number, number] };

/**
 * A page's modules as regions to save from. Placed over the page it is
 * given (absolutely, filling it); each region lights and shows Save centred
 * in it on hover or focus, and keeps a small bookmark once saved.
 */
export function ModuleSaveRegions({ regions, pageWidthPx, pageHeightPx }: { regions: SaveRegion[]; pageWidthPx: number; pageHeightPx: number }) {
  return (
    <div className={css.regions}>
      {regions.map((r, i) => (
        <Region key={`${i}-${r.name}`} region={r} pageWidthPx={pageWidthPx} pageHeightPx={pageHeightPx} />
      ))}
      <SavedNote />
    </div>
  );
}

function Region({ region, pageWidthPx, pageHeightPx }: { region: SaveRegion; pageWidthPx: number; pageHeightPx: number }) {
  const saved = useSaved(region.save);
  const [x, y, w, h] = region.box;
  return (
    <div
      className={css.region}
      data-saved={saved || undefined}
      // Focusable but not a tab stop: a tap on a touch screen focuses it,
      // which shows its Save (:focus-within); the button itself is the tab
      // stop for a keyboard.
      tabIndex={-1}
      style={{ left: `${(x / pageWidthPx) * 100}%`, top: `${(y / pageHeightPx) * 100}%`, width: `${(w / pageWidthPx) * 100}%`, height: `${(h / pageHeightPx) * 100}%` }}
    >
      <button
        type="button"
        className={css.regionButton}
        aria-pressed={saved}
        aria-label={saved ? `Saved: ${region.name}. Remove it from Saved` : `Save the ${region.name} module`}
        onClick={(e) => {
          e.stopPropagation();
          void toggle(region.save);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Bookmark filled={saved} size={14} />
        <span>{saved ? "Saved" : "Save"}</span>
      </button>
      {saved && (
        <span className={css.regionMark} aria-hidden="true">
          <Bookmark filled size={12} />
        </span>
      )}
    </div>
  );
}
