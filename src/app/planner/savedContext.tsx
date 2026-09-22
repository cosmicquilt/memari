"use client";

// The person's saved pages and saved modules, for the editor: the timeline's
// "+" and card menus offer the pages, the Modules panel offers the modules.
// Provided once by EditorShell, like the journal id, rather than threaded
// through the drawer's and the palette's memoised trees as props.

import { createContext, useContext, type ReactNode } from "react";
import type { SavedModuleCard, SavedPageCard } from "./savedItems";

/** A saved page, and whether it fits the open journal - a saved page keeps
 *  the page size it was saved at. */
export type SavedPageOption = SavedPageCard & { fits: boolean };

export type SavedItems = { pages: SavedPageOption[]; modules: SavedModuleCard[] };

const NONE: SavedItems = { pages: [], modules: [] };
const SavedContext = createContext<SavedItems>(NONE);

export function SavedProvider({ value, children }: { value: SavedItems | undefined; children: ReactNode }) {
  return <SavedContext.Provider value={value ?? NONE}>{children}</SavedContext.Provider>;
}

export function useSavedItems(): SavedItems {
  return useContext(SavedContext);
}
