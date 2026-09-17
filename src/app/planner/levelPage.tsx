// One level of the book, in the native editor.
//
// SHARED BY EVERY LEVEL'S ROUTE. There are five of them now and they differ
// by one word; five copies of this would be five places to remember when the
// editor's props change, which is the kind of duplication that quietly drifts
// - the month route already spent a while passing a prop the week route did
// not. Each route file is three lines and this is the page.
//
// Separate ROUTES rather than one /planner/[level], deliberately: /planner/next
// and /planner/month are the URLs that exist and are linked from comments,
// scripts and whatever Andrew has open. A dynamic segment would be tidier and
// is not worth breaking them for.

import { auth } from "@clerk/nextjs/server";
import { getOrCreateBook } from "./actions";
import { loadPlannerPages } from "./loadPlannerPages";
import { NativePlannerEditor } from "./NativePlannerEditor";
import type { PageLevel } from "@/lib/pageLevels";

export async function renderLevelPage(
  level: PageLevel,
  // ?variant=2026-02 opens THAT occurrence's own layout instead of the
  // default one. Without it a page created for a month could never be
  // edited, which breaks the rule the timeline exists to keep: every page
  // reachable.
  searchParams: Promise<{ variant?: string }>
) {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }

  const variantKey = (await searchParams).variant || null;
  const book = await getOrCreateBook(level);
  const {
    pages,
    timeline,
    term,
    variantKey: openVariantKey,
    weekSettings,
    pageSettings,
  } = await loadPlannerPages(book, level, variantKey);

  return (
    <NativePlannerEditor
      pages={pages}
      timeline={timeline}
      term={term}
      variantKey={openVariantKey}
      weekSettings={weekSettings}
      pageSettings={pageSettings}
      level={level}
    />
  );
}
