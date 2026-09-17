// The month spread, in the native editor.
//
// Structurally the week spread: a locked spine block filling the page with
// a title in the corner beside it, a sidebar of labeled boxes down the
// left of the first page, and a full-width box below the spine. What
// changes is which module plays each part - the calendar stands where the
// hours stand, and the month name where the week number does.
//
// This route used to render the Polotno editor, and its own comment
// explained why it had to: the zone logic looked for "hourly-grid-core"
// and "week-title" by name, so a month page had no zones, no sidebar and
// no dropzones. The registry names those roles now (isSpine, isTitle) and
// loadPlannerPages takes whichever planner the route hands it, so the two
// cadences share one editor rather than needing one each.
//
// The hours settings in the palette are inert here - loadPlannerPages
// falls back to defaults when a page has no hourly grid, and there is
// nothing for them to change.

import { auth } from "@clerk/nextjs/server";
import { getOrCreateBook } from "../actions";
import { loadPlannerPages } from "../loadPlannerPages";
import { NativePlannerEditor } from "../NativePlannerEditor";

export default async function MonthPlannerPage({
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

  // The SAME book as /planner/next, shown at its monthly level. It used to
  // be a different Planner row entirely - see getOrCreateBook on why that is
  // gone.
  const variantKey = (await searchParams).variant || null;
  const book = await getOrCreateBook("MONTHLY");
  const { pages, timeline, term, variantKey: openVariantKey, weekSettings, pageSettings } = await loadPlannerPages(
    book,
    "MONTHLY",
    variantKey
  );

  return <NativePlannerEditor
      pages={pages}
      timeline={timeline}
      term={term}
      variantKey={openVariantKey}
      weekSettings={weekSettings}
      pageSettings={pageSettings}
      level="MONTHLY"
    />;
}
