import { renderEditor } from "@/app/planner/levelPage";

// memari.studio/app/j/<id> - one journal, straight into the editor. Asked
// for 2026-09-21: the journal lives in the address, and a journal's own link
// opens it without the start dialog ("make it popup if you go to /app but
// not to a planner link"). Which layout is open inside it (weekly, monthly,
// a month's own layout) stays out of the address - see EditorShell.
export default async function JournalPage({ params }: { params: Promise<{ journalId: string }> }) {
  const { journalId } = await params;
  return renderEditor(journalId);
}
