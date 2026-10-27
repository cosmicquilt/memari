"use client";

// Whether the journal open is one of a coach's clients' (memari. for
// businesses), for the words that say what a linked edit reaches. In a
// client's journal an edit to a linked page or module stays in that journal
// (savedItems.ts, review 2026-10-26), so "a change here changes it
// everywhere" would be untrue there. EditorShell provides it from the
// journal's business role.

import { createContext, useContext } from "react";

const ClientJournal = createContext<string | null>(null);

/** The client's name, or null for any other journal. */
export const ClientJournalProvider = ClientJournal.Provider;
export const useClientJournal = () => useContext(ClientJournal);
