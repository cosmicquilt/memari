"use server";

// One of the book's layouts, for the editor to swap to in place - see
// EditorShell. Exactly what the editor's page loads for its first layout
// (levelPage), so a layout opened from the timeline cannot differ from the
// same layout opened by a refresh.
//
// Its own file rather than in actions.ts, because loadPlannerPages imports
// from actions.ts and this imports loadPlannerPages.

import { LEVELS_IN_BINDING_ORDER, type PageLevel } from "@/lib/pageLevels";
import { getOrCreateBook } from "./actions";
import { loadPlannerPages, type LoadedPlanner } from "./loadPlannerPages";

export async function loadLevel(level: PageLevel, variantKey: string | null): Promise<LoadedPlanner> {
  // A server action is a public endpoint, whatever its type says: check the
  // level is one that exists before it reaches a query. Signing in is
  // getOrCreateBook's check, as it is for every action here.
  if (!(LEVELS_IN_BINDING_ORDER as readonly string[]).includes(level)) {
    throw new Error("No such level");
  }
  if (variantKey !== null && typeof variantKey !== "string") {
    throw new Error("No such layout");
  }
  const book = await getOrCreateBook(level);
  return loadPlannerPages(book, level, variantKey);
}
