import { auth } from "@clerk/nextjs/server";
import { getOrCreatePlanner } from "./actions";
import { PlannerEditor } from "./PlannerEditor";
import { gridCellToPixels, type PageGrid } from "@/lib/grid";
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";
import {
  renderHourlyGridCore,
  type HourlyGridCoreConfig,
} from "@/lib/modules/hourlyGridCore";
import { renderLabeledBox, type LabeledBoxConfig } from "@/lib/modules/labeledBox";

type ModuleInstanceWithType = Awaited<
  ReturnType<typeof getOrCreatePlanner>
>["pages"][number]["moduleInstances"][number];

function renderModuleInstance(
  instance: ModuleInstanceWithType,
  pageGrid: PageGrid
): object[] {
  // freeform-element is the one type that isn't grid-placed.
  if (instance.moduleType.slug === "freeform-element") {
    const props = instance.propValues as { polotnoElement?: object };
    return props.polotnoElement ? [props.polotnoElement] : [];
  }

  if (instance.columnStart === null || instance.rowStart === null) {
    return [];
  }
  const geometry = gridCellToPixels(pageGrid, {
    columnStart: instance.columnStart,
    rowStart: instance.rowStart,
    columnSpan: instance.columnSpan,
    rowSpan: instance.rowSpan,
  });

  switch (instance.moduleType.slug) {
    case "hourly-grid-core":
      return renderHourlyGridCore(
        geometry,
        instance.propValues as unknown as HourlyGridCoreConfig,
        instance.id
      );
    case "labeled-box":
      return renderLabeledBox(
        geometry,
        instance.propValues as unknown as LabeledBoxConfig,
        instance.id
      );
    default:
      // Other module types don't have renderers yet.
      return [];
  }
}

export default async function PlannerPage() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }

  const planner = await getOrCreatePlanner();
  const page = planner.pages[0];
  const pageGrid: PageGrid = {
    widthPx: PRINT_WIDTH_PX,
    heightPx: PRINT_HEIGHT_PX,
    gridColumns: page.gridColumns,
    gridRows: page.gridRows,
    gridGapPx: page.gridGapPx,
  };

  const initialElements = page.moduleInstances
    .sort((a, b) => a.zIndex - b.zIndex)
    .flatMap((instance) => renderModuleInstance(instance, pageGrid));

  return <PlannerEditor pageId={page.id} initialElements={initialElements} />;
}
