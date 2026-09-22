"use client";

// "Read this journal's pages again, and re-render" - without reloading the
// document.
//
// Every structural change in the editor - adding a page, deleting one,
// putting a saved page in its place, resetting to the template - ended by
// calling `window.location.reload()`. SIXTEEN call sites; the eight in
// TimelineDrawer now use this and eight remain, listed at the bottom of this
// file. (An earlier draft of this comment said seventeen, having counted a
// line that only mentions the call in prose. Counting by grep and reporting
// the line count is how that happens.)
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

// THE EIGHT THAT STILL RELOAD, and why each was left for now. Not an
// oversight list: TWO would take this hook as it stands, FOUR change the
// journal rather than its pages, ONE needs data this does not fetch, and ONE
// has a reasoned defence in its own comment. Line numbers are a hint and
// will drift; each entry says what the call does, which will not.
//
// Would take refreshPages() unchanged:
//   ModuleEditor:177          a saved module used elsewhere changed too
//   NativePlannerEditor:4245  the hourly grid's row height, after a save
//
// Needs more than the open level. refreshPages() re-reads ONE level through
// loadLevel; these change the whole book, and trim also changes page SIZE,
// which the viewport cookie and the zoom are derived from:
//   NativePlannerEditor:3911  the book's font
//   NativePlannerEditor:4005  the term - pages appear and disappear at every level
//   NativePlannerEditor:4047  dated <-> undated
//   NativePlannerEditor:4096  the trim
//
// Needs something this does not do at all. loadLevel returns pages and the
// timeline, NOT Saved > Modules, which the palette lists:
//   ModuleEditor:191          saving a module to Saved
//
// Deliberate, and argued in place:
//   NativePlannerEditor:9509  reset to template. Its comment is explicit
//     that a Server Component refresh alone would not reset the editor's
//     OWN client state - placements, moduleLookup, zoom - and that the reset
//     needs all of it rebuilt rather than the data under it re-fetched.
//     Worth re-testing against this hook rather than assumed, but not
//     assumed to be wrong either.
