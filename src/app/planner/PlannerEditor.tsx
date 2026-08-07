"use client";

import dynamic from "next/dynamic";

// Polotno/Konva touch the DOM at module load time, so this must never be
// server-rendered — same reasoning as the standalone print-pipeline test,
// just expressed through Next's dynamic-import escape hatch instead of Vite.
const PlannerEditorCanvas = dynamic(
  () => import("./PlannerEditorCanvas").then((m) => m.PlannerEditorCanvas),
  { ssr: false, loading: () => <p style={{ padding: 16 }}>Loading editor…</p> }
);

// `import type` is fully erased at compile time, so this doesn't pull in
// Polotno/Konva the way the dynamic() runtime import above deliberately
// avoids — safe to import the real shapes here instead of hand-copying
// them.
import type { PageProp } from "./PlannerEditorCanvas";
import type { WeekSettings } from "./WeekSettingsPanel";

export function PlannerEditor(props: { pages: PageProp[]; weekSettings: WeekSettings }) {
  return <PlannerEditorCanvas {...props} />;
}
