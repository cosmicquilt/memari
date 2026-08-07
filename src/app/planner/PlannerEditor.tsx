"use client";

import dynamic from "next/dynamic";

// Polotno/Konva touch the DOM at module load time, so this must never be
// server-rendered — same reasoning as the standalone print-pipeline test,
// just expressed through Next's dynamic-import escape hatch instead of Vite.
const PlannerEditorCanvas = dynamic(
  () => import("./PlannerEditorCanvas").then((m) => m.PlannerEditorCanvas),
  { ssr: false, loading: () => <p style={{ padding: 16 }}>Loading editor…</p> }
);

import type { PageGrid } from "@/lib/grid";

export function PlannerEditor(props: {
  pages: Array<{
    pageId: string;
    elements: object[];
    pageGrid: PageGrid;
    moduleGridInfo: Record<string, { columnSpan: number; rowSpan: number }>;
    moduleConfig: Record<string, { slug: string; propValues: unknown }>;
    lockedRects: Array<{ columnStart: number; rowStart: number; columnSpan: number; rowSpan: number }>;
  }>;
  weekSettings: {
    weekNumber: number;
    weekTotal: number;
    dateRangeLabel: string;
    leftDates: number[];
    rightDates: number[];
  };
}) {
  return <PlannerEditorCanvas {...props} />;
}
