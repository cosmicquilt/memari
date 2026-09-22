"use client";

// "Read this journal's pages again, and re-render" - without reloading the
// document.
//
// Every structural change in the editor - adding a page, deleting one,
// putting a saved page in its place, resetting to the template - ends by
// calling `window.location.reload()`. Seventeen call sites at the time of
// writing. The reasoning in each is sound and the same: the SERVER shapes
// the pages, so re-deriving the drawer, the canvas and the routes on the
// client would be a second description of what the server just did - this
// project's oldest defect class.
//
// The mistake is in the remedy, not the reasoning. A reload is not the only
// way to ask the server again; it is the way that also throws away
// everything the browser knew. Reported 2026-09-22, adding a daily page to a
// level that had none: "it did a full page reload and shifted the timeline
// view back to the beginning" - the drawer's scroll, its detent, the
// canvas's zoom and scroll, and every in-flight animation go with the
// document, and the whole journal is fetched and re-rendered from nothing.
//
// This asks the server again through the SAME path a level change already
// uses - loadLevel, in EditorShell - so there is still exactly one
// description of how a journal's pages are shaped, and it is the server's.
// The difference is only that the answer arrives as state rather than as a
// new document.

import { createContext, useContext } from "react";

/** Re-reads the open level from the server and re-renders with it. Resolves
 *  once the new pages are in state. */
export type RefreshPages = () => Promise<void>;

const NotProvided: RefreshPages = async () => {
  // Deliberately loud. A caller that reaches this is inside a tree with no
  // EditorShell, and the failure it would otherwise produce - a mutation
  // that saves but never appears - looks exactly like a broken action.
  throw new Error("useRefreshPages() outside a PagesRefreshProvider");
};

const PagesRefreshContext = createContext<RefreshPages>(NotProvided);

export const PagesRefreshProvider = PagesRefreshContext.Provider;

export function useRefreshPages(): RefreshPages {
  return useContext(PagesRefreshContext);
}
