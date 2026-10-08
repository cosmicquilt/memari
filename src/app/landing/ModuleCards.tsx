"use client";

// Modules on the Layouts page: each drawn as the palette draws it (the same
// ModulePreview, one day wide), with its name and what it is for.

import { ModulePreview } from "@/app/planner/ModulePreview";
import { PALETTE_INFO_BY_SLUG } from "@/lib/paletteGroups";
import { FONT_SERIF } from "@/lib/theme";
import { PLANNER_TRIMS } from "@/lib/planner-trims";
import type { PageGrid } from "@/lib/grid";
import type { ModuleSummary } from "./starterLayouts";
import site from "./site.module.css";

/** The bound book's page, as the landing page's spreads use it (spreads.ts,
 *  LANDING_PAGE_GRID - not imported: that module draws on the server). */
const TRIM = PLANNER_TRIMS.bound7x10;
const GRID: PageGrid = { widthPx: TRIM.widthPx, heightPx: TRIM.heightPx, gridColumns: 24, gridRows: TRIM.gridRows, boxInsetPx: 6, marginPx: TRIM.marginPx };

export function ModuleCards({ modules }: { modules: ModuleSummary[] }) {
  return (
    <ul className={site.moduleGrid} style={{ listStyle: "none", padding: 0, margin: "32px 0 0" }}>
      {modules.map((m) => (
        <li key={m.slug}>
          <div className={site.modulePaper}>
            <ModulePreview
              slug={m.slug}
              previewProps={PALETTE_INFO_BY_SLUG.get(m.slug)?.previewProps ?? {}}
              pageGrid={GRID}
              fontFamily={FONT_SERIF}
              draw
              initialWidthPx={180}
              maxHeightPx={220}
            />
          </div>
          <h3 className={site.moduleName}>{m.name}</h3>
          <p className={site.moduleText}>{m.description}</p>
        </li>
      ))}
    </ul>
  );
}
