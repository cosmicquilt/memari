import { renderEditor } from "@/app/planner/levelPage";

// memari.studio/app - the editor, asked for 2026-09-21: "make memari.studio/app
// the location of the editor". ONE address for the whole book: which layout
// is open (weekly, monthly, a month's own layout...) is the editor's state,
// not part of the address - "I dont want site to change while swapping
// between their monthly weekly layout". See EditorShell.
export default async function AppPage() {
  return renderEditor();
}
