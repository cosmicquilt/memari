// The daily page, in the native editor.
//
// ONE page, not a spread - see dayLayout on why a day is a day. Everything
// else is the week route: the same book, one of its levels, and the timeline
// drawer switching between them.

import { auth } from "@clerk/nextjs/server";
import { getOrCreateBook } from "../actions";
import { loadPlannerPages } from "../loadPlannerPages";
import { NativePlannerEditor } from "../NativePlannerEditor";

export default async function DayPlannerPage({
  searchParams,
}: {
  // ?variant=2026-02-14 opens that DAY's own layout instead of the default
  // one. Giving ninety days their own layouts one at a time is a lot of
  // clicking, but the machinery is a month's and refusing it here would be
  // an arbitrary exception.
  searchParams: Promise<{ variant?: string }>;
}) {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }

  const variantKey = (await searchParams).variant || null;
  const book = await getOrCreateBook("DAILY");
  const {
    pages,
    timeline,
    term,
    variantKey: openVariantKey,
    weekSettings,
    pageSettings,
  } = await loadPlannerPages(book, "DAILY", variantKey);

  return (
    <NativePlannerEditor
      pages={pages}
      timeline={timeline}
      term={term}
      variantKey={openVariantKey}
      weekSettings={weekSettings}
      pageSettings={pageSettings}
      level="DAILY"
    />
  );
}
