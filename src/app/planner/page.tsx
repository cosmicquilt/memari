import { auth } from "@clerk/nextjs/server";
import { getOrCreatePlanner } from "./actions";
import { PlannerEditor } from "./PlannerEditor";
import type { PageGrid } from "@/lib/grid";
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";
import { renderModuleInstance } from "@/lib/renderModuleInstance";

export default async function PlannerPage() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }

  const planner = await getOrCreatePlanner();

  // Two-page spread — shown together, matching the reference planner
  // viewed with the book open flat (left = Sun-Tue, right = Wed-Sat).
  const pages = planner.pages.map((page) => {
    const pageGrid: PageGrid = {
      widthPx: PRINT_WIDTH_PX,
      heightPx: PRINT_HEIGHT_PX,
      gridColumns: page.gridColumns,
      gridRows: page.gridRows,
      gridGapPx: page.gridGapPx,
      marginPx: page.marginPx,
    };
    const elements = page.moduleInstances
      .sort((a, b) => a.zIndex - b.zIndex)
      .flatMap((instance) => renderModuleInstance(instance, pageGrid));

    // Every grid-placed, non-locked instance renders as a draggable group
    // (see renderModuleInstance) — the editor needs each one's current
    // column/row span client-side to compute where a drag should snap to
    // and to recognize "this element on the canvas is module X" when
    // saving or deleting. Locked core blocks and freeform elements are
    // left out: they're either immovable or already freely positioned.
    const moduleGridInfo: Record<string, { columnSpan: number; rowSpan: number }> = {};
    for (const instance of page.moduleInstances) {
      if (
        !instance.locked &&
        instance.moduleType.slug !== "freeform-element" &&
        instance.columnStart !== null &&
        instance.rowStart !== null
      ) {
        moduleGridInfo[instance.id] = {
          columnSpan: instance.columnSpan,
          rowSpan: instance.rowSpan,
        };
      }
    }

    return { pageId: page.id, elements, pageGrid, moduleGridInfo };
  });

  return <PlannerEditor pages={pages} />;
}
