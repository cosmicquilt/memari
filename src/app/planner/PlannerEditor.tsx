"use client";

import dynamic from "next/dynamic";

// Polotno/Konva touch the DOM at module load time, so this must never be
// server-rendered — same reasoning as the standalone print-pipeline test,
// just expressed through Next's dynamic-import escape hatch instead of Vite.
const PlannerEditorCanvas = dynamic(
  () => import("./PlannerEditorCanvas").then((m) => m.PlannerEditorCanvas),
  { ssr: false, loading: () => <p style={{ padding: 16 }}>Loading editor…</p> }
);

export function PlannerEditor(props: {
  pageId: string;
  initialElements: object[];
}) {
  return <PlannerEditorCanvas {...props} />;
}
