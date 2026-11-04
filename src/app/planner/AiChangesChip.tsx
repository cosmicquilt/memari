"use client";

// "Your assistant made 5 changes": beside the journal's name in the editor's
// header while a connected assistant's changes can still be undone (2026-11-02,
// src/lib/connector/journalRuns.ts). Pressing it lists them and offers the undo:
// the editor's own undo buttons can't reach them, since they never passed
// through this browser.
//
// Through a context rather than a prop of the editor: EditorShell keeps the
// editor from rendering again for anything but its own inputs, and a chip's
// news isn't one of them.
//
// A COACH'S TEMPLATE WITH CLIENTS SINCE (2026-11-04): the changes are listed,
// with no undo. Their journals follow it now, and putting it back all at once
// would reach them (journalRuns.ts undoRun refuses it either way). So too a
// journal whose undo would copy a saved page or module back out into a
// template with clients (undoRun's reached-clients), said once it's pressed.

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { CREAM, cream } from "@/lib/cream";
import type { UndoResult } from "@/lib/connector/journalRuns";

export type AiChanges = {
  changes: string[];
  /** Clients on this template now: the changes can't be undone. */
  clients: number;
  undo: (evenEditsSince: boolean) => Promise<UndoResult>;
};

const AiChangesContext = createContext<AiChanges | null>(null);
export const AiChangesProvider = AiChangesContext.Provider;

export function AiChangesChip() {
  const context = useContext(AiChangesContext);
  const [open, setOpen] = useState(false);
  const [editedSince, setEditedSince] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Why undo was refused here: clients on this template, or the templates
   *  with clients it would reach through a saved item. */
  const [refused, setRefused] = useState<null | { reached: string[] | null }>(null);
  const root = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  if (!context || context.changes.length === 0) return null;
  const { changes, undo } = context;
  const count = changes.length;
  const withClients = context.clients > 0 || !!refused;
  const reached = refused?.reached;

  const runUndo = async (evenEditsSince: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      const result = await undo(evenEditsSince);
      setEditedSince(result.status === "edited-since");
      // clients moved onto it while this was open, or reached through a link:
      // said here, and kept open
      setRefused(result.status === "has-clients" ? { reached: null } : result.status === "reached-clients" ? { reached: result.templates } : null);
      if (result.status === "nothing" || result.status === "undone") setOpen(false);
    } catch (error) {
      console.error("Could not undo the assistant's changes:", error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span ref={root} data-ai-changes="" style={{ flexShrink: 0, marginLeft: 8 }}>
      <button
        type="button"
        aria-expanded={open}
        title="Changes made by an assistant you connected"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setAt({ left: box.left, top: box.bottom + 6 });
          setEditedSince(false);
          setRefused(null);
          setOpen(!open);
        }}
        style={{ font: "inherit", fontSize: 12, color: CREAM, background: "rgba(74, 92, 255, 0.35)", border: "none", borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap", cursor: "pointer" }}
      >
        Your assistant made {count === 1 ? "1 change" : `${count} changes`}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Your assistant's changes"
          style={{ position: "fixed", left: at.left, top: at.top, width: 320, maxWidth: "calc(100vw - 24px)", zIndex: 1000, background: "#1f1f1f", color: CREAM, borderRadius: 12, padding: 14, boxShadow: "0 8px 28px rgba(0,0,0,0.45)", fontSize: 13, lineHeight: 1.4, whiteSpace: "normal" }}
        >
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {changes.map((change, index) => (
              <li key={index} style={{ color: cream(0.85) }}>
                {change}
              </li>
            ))}
          </ul>
          <p style={{ margin: "12px 0 10px", color: cream(0.6), fontSize: 12 }}>
            {reached
              ? `Undoing would also change ${reached.length ? reached.map((name) => `“${name}”`).join(" and ") : "a template"}, which has clients now, through a page or module you saved and use in both: what changed here went out to it too. So these changes can't be undone all at once. Change anything back by hand: you'll see what each edit reaches.`
              : withClients
              ? "Clients have been moved onto this template since, and their journals follow it now, so these changes can't be undone all at once. Change anything back by hand: like any edit to a template, it reaches their journals."
              : editedSince
                ? "This journal has also been edited by hand since. Undoing puts it back as it was before your assistant started, so those edits go too."
                : "Undo puts this journal back as it was before your assistant started."}
          </p>
          {failed && <p style={{ margin: "0 0 10px", color: "#ffb4a8", fontSize: 12 }}>That didn&rsquo;t work. Try it again in a moment.</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ font: "inherit", fontSize: 12, color: CREAM, background: "#2a2a2a", border: "none", borderRadius: 999, padding: "5px 12px", cursor: "pointer" }}
            >
              {editedSince && !withClients ? "Keep it all" : "Close"}
            </button>
            {!withClients && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runUndo(editedSince)}
                style={{ font: "inherit", fontSize: 12, color: CREAM, background: "#4a5cff", border: "none", borderRadius: 999, padding: "5px 12px", cursor: busy ? "progress" : "pointer" }}
              >
                {busy ? "Undoing..." : editedSince ? "Undo anyway" : count === 1 ? "Undo it" : "Undo them"}
              </button>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
