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

export default async function NativePlannerPage({
  searchParams,
}: {
  // ?variant=2026-02 opens THAT month's own layout instead of the default
  // one. Without it a page created for a month could never be edited, which
  // breaks the rule the timeline exists to keep: every page reachable.
  searchParams: Promise<{ variant?: string }>;
}) {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }

  // ONE book, one LEVEL of it. This route is the weekly spread;
  // /planner/month is the same book's monthly one, and the timeline drawer
  // switches between them.
  const variantKey = (await searchParams).variant || null;
  const book = await getOrCreateBook("WEEKLY");
  const { pages, timeline, term, variantKey: openVariantKey, weekSettings, pageSettings } = await loadPlannerPages(
    book,
    "WEEKLY",
    variantKey
  );

  return <NativePlannerEditor
      pages={pages}
      timeline={timeline}
      term={term}
      variantKey={openVariantKey}
      weekSettings={weekSettings}
      pageSettings={pageSettings}
      level="WEEKLY"
    />;
}
