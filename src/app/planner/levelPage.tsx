// The editor's page, at memari.studio/app.
//
// ONE PAGE FOR THE WHOLE BOOK, since 2026-09-21. Each level used to have its
// own route - /planner/next for the week, /planner/month and three more -
// and moving between them in the timeline loaded a new document. Asked for
// instead: "I dont want site to change while swapping between their monthly
// weekly layout ... within same journal". The address is now /app whatever is
// open, and EditorShell swaps layouts in place through loadLevel. This file
// renders the FIRST layout: the one the browser last had open, from its
// cookie, or the weekly spread. The old addresses redirect here - see
// next.config.ts.

import { claimGuestWork, currentOwner, signInPath } from "@/lib/owner";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PageLevel } from "@/generated/prisma/enums";
import { VIEWPORT_COOKIE, parseViewportCookie } from "@/lib/viewportCookie";
import { OPEN_LEVEL_COOKIE, parseOpenLevelCookie } from "@/lib/openLevelCookie";
import { openBook } from "./actions";
import { loadPlannerPages } from "./loadPlannerPages";
import { EditorShell } from "./EditorShell";

/**
 * The editor on one of the signed-in person's journals - /app/j/<id>. A
 * journal id that is not theirs is a 404, the same as one that does not
 * exist, so the address cannot be used to learn which ids are real.
 */
export async function renderEditor(journalId: string) {
  const owner = await currentOwner();
  if (!owner) redirect(signInPath(`/app/j/${journalId}`));
  // Signed in on a browser that was used as a guest: bring that work along -
  // including this journal, if it was the guest's.
  if (!owner.guest) await claimGuestWork(owner.id);

  const cookieStore = await cookies();
  // The window size this browser last reported, so the canvas renders at
  // its real zoom from the first frame - see src/lib/viewportCookie.ts.
  const initialViewport = parseViewportCookie(cookieStore.get(VIEWPORT_COOKIE)?.value);
  // The layout this browser last had open, so a refresh comes back to it
  // rather than to the weekly spread. An occurrence's own layout (a month's,
  // say) is part of it: without that, a page made for one month could only
  // be reached by opening it from the timeline every time.
  const opened = parseOpenLevelCookie(cookieStore.get(OPEN_LEVEL_COOKIE)?.value) ?? {
    level: PageLevel.WEEKLY,
    variantKey: null,
  };

  let book;
  try {
    book = await openBook(journalId, opened.level);
  } catch (error) {
    if (error instanceof Error && error.message === "Journal not found") notFound();
    throw error;
  }
  const loaded = await loadPlannerPages(book, opened.level, opened.variantKey);

  return (
    <EditorShell initial={{ ...loaded, level: opened.level }} initialViewport={initialViewport} guest={owner.guest} />
  );
}
