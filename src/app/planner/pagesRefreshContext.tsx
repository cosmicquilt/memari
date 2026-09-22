"use client";

// "Read this journal's pages again, and re-render" - without reloading the
// document.
//
// Every structural change in the editor - adding a page, deleting one,
// putting a saved page in its place, resetting to the template - ended by
// calling `window.location.reload()`. SIXTEEN call sites, all of them now
// here instead - see the note at the bottom of this file for what the sweep
// taught. (An earlier draft said seventeen, having counted a line that only
// mentions the call in prose. Counting by grep and reporting the line count
// is how that happens.)
//
// The reasoning in each is sound and the same: the SERVER shapes
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

/**
 * Re-reads the open level from the server and re-renders with it. Resolves
 * once the new pages are in state.
 *
 * @param saved   also re-read Saved > Pages and Saved > Modules. They do not
 *   come from loadLevel - the palette's list belongs to the owner, not the
 *   book - so only a change to a saved item needs this.
 * @param rebuild also build the editor again from scratch, rather than
 *   re-rendering it with new props. For a change that invalidates
 *   NativePlannerEditor's OWN client state - placements, moduleLookup, zoom.
 *   Resetting to the template and changing the trim are the two.
 */
export type RefreshPages = (options?: { saved?: boolean; rebuild?: boolean }) => Promise<void>;

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

// ALL SIXTEEN ARE CONVERTED. What the sweep taught, which the first eight
// did not:
//
// A DATA REFRESH IS NOT ENOUGH FOR ALREADY-COMMITTED CONTENT. The editor
// seeds a great deal of its own state from its FIRST props - placements,
// moduleLookup, the locked content the server rendered - so new props alone
// leave a font change invisible. Measured: clicking the serif/sans switch
// left every label in Newsreader, and it turned Hanken Grotesk only when the
// NEXT setting happened to rebuild the editor. So anything that changes
// committed content passes `rebuild`, which bumps a key rather than
// reloading: the drawer's scroll and detent still survive.
//
//   rebuild   font, term, dated, trim, the hourly grid's rows, reset to
//             template, and a saved module changing where it is used
//   saved     saving a module to Saved - the palette's list is the owner's,
//             not the book's, so loadLevel does not carry it
//   neither   everything in the timeline drawer: adding, deleting and
//             replacing pages, which the editor does take from props
//
// AND THE REBUILD MUST COMMIT WITH THE PAGES. setOpen is inside a
// transition; bumping the key outside it flushed first, rebuilt the editor
// from the data it already had, and the change appeared one action late.
// Both now happen in the same transition - see EditorShell.
