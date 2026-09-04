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
import { getOrCreateMonthPlanner } from "../actions";
import { loadPlannerPages } from "../loadPlannerPages";
import { NativePlannerEditor } from "../NativePlannerEditor";

export default async function MonthPlannerPage() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }

  const { pages, weekSettings, pageSettings } = await loadPlannerPages(
    await getOrCreateMonthPlanner()
  );

  return <NativePlannerEditor pages={pages} weekSettings={weekSettings} pageSettings={pageSettings} />;
}
