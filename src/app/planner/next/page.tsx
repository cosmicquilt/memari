// Parallel route for the native (non-Polotno) editor, per the migration
// plan's "build behind a parallel route, not an in-place rewrite"
// decision — /planner keeps working throughout on the existing
// Polotno-hosted editor. This route reuses loadPlannerPages.ts (shared
// with the upcoming export route) and renders NativePlannerEditor, a
// plain client component with no SSR-avoidance needed (unlike
// PlannerEditor.tsx's dynamic(..., {ssr:false}) for PlannerEditorCanvas
// — that existed only because Polotno/Konva touch the DOM at module
// load time; NativePlannerEditor imports neither).

import { auth } from "@clerk/nextjs/server";
import { loadPlannerPages } from "../loadPlannerPages";
import { getOrCreateBook } from "../actions";
import { NativePlannerEditor } from "../NativePlannerEditor";

export default async function NativePlannerPage() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }

  // ONE book, one LEVEL of it. This route is the weekly spread; /planner/month
  // is the same book's monthly one. Two routes rather than one with a level
  // picker, because the picker is the timeline drawer and it is not built yet.
  const book = await getOrCreateBook("WEEKLY");
  const { pages, weekSettings, pageSettings } = await loadPlannerPages(book, "WEEKLY");

  return <NativePlannerEditor pages={pages} weekSettings={weekSettings} pageSettings={pageSettings} level="WEEKLY" />;
}
