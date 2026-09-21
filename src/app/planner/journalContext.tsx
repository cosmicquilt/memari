"use client";

// Which journal the editor has open.
//
// A person has as many journals as they like, and the one being edited is
// the id in the address (/app/j/<id>). Everything that acts on the journal as
// a whole - its term, font, trim, hours, levels and occurrences - has to say
// which one, and the settings controls that do so sit several components
// deep; threading an id through each of them would be a prop on a dozen
// signatures for one fact. EditorShell provides it once.

import { createContext, useContext, type ReactNode } from "react";

const JournalContext = createContext<string | null>(null);

/** A component rather than the bare Provider, so a server component (the
 *  legacy /planner page) can render it too. */
export function JournalProvider({ value, children }: { value: string; children: ReactNode }) {
  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

/** The open journal's id. Throws outside the editor rather than returning a
 *  blank id that an action would then refuse with a less useful message. */
export function useJournalId(): string {
  const id = useContext(JournalContext);
  if (!id) throw new Error("useJournalId() was called outside an open journal");
  return id;
}
