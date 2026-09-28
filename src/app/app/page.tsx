import { claimGuestWork, currentOwner, signInPath } from "@/lib/owner";
import { GUEST_IDLE_DAYS, GUEST_JOURNAL_LIMIT } from "@/lib/guest";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { journalsOf, templatePreviews } from "@/app/planner/journals";
import { StartDialog } from "@/app/planner/StartDialog";
import { savedModulesOf, savedPagesOf } from "@/app/planner/savedItems";
import { LAST_JOURNAL_COOKIE, parseLastJournalCookie } from "@/lib/lastJournalCookie";
import { BACKDROP_COOKIE, parseBackdropCookie } from "@/lib/backdropCookie";
import { WALL_VARIANTS } from "@/app/landing/doodleWall";

// memari.studio/app - the start dialog: open one of your journals, or create
// one. Asked for 2026-09-21, modelled on Photoshop's New Document dialog. A
// journal's own address, /app/j/<id>, skips this and opens it directly.
export default async function AppPage() {
  const owner = await currentOwner();
  if (!owner) redirect(signInPath("/app"));
  // Signed in on a browser that was used as a guest: bring that work along.
  if (!owner.guest) await claimGuestWork(owner.id);

  const [journals, savedPages, savedModules] = await Promise.all([
    journalsOf(owner.id),
    savedPagesOf(owner.id),
    savedModulesOf(owner.id),
  ]);
  const jar = await cookies();
  const remembered = parseLastJournalCookie(jar.get(LAST_JOURNAL_COOKIE)?.value);
  // Only if it is still one of theirs: a deleted journal, or another
  // person's id in a shared browser, is simply not preselected.
  const lastJournalId = journals.some((j) => j.id === remembered) ? remembered : null;

  return (
    <StartDialog
      journals={journals}
      savedPages={savedPages}
      savedModules={savedModules}
      lastJournalId={lastJournalId}
      templates={templatePreviews()}
      defaultTerm={nextQuarter(new Date())}
      guest={owner.guest ? { journalLimit: GUEST_JOURNAL_LIMIT, idleDays: GUEST_IDLE_DAYS } : null}
      backdrop={{ theme: parseBackdropCookie(jar.get(BACKDROP_COOKIE)?.value), variant: pickWall() }}
    />
  );
}

/** Which of the doodle walls this load shows ("rotate random drawings on
 *  each load"). Picked here, on the server, so the first frame is already
 *  the wall the page will keep. */
function pickWall() {
  return Math.floor(Math.random() * WALL_VARIANTS);
}

/** A new journal's term to start from: three months from the first of next
 *  month - the quarter the subscription ships by default. */
function nextQuarter(today: Date): { start: string; end: string } {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}
