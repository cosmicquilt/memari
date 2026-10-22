"use client";

// A whole planner's picture on the site's Layouts page (2026-10-22: "on the
// layouts pages if i click planner selector at top then click first result
// only a month comes up no timeline either"). It opened the one-spread
// popup on the planner's cover spread, so a planner looked like one month.
// Now it opens the start dialog's zoom (planner/SpreadZoom.tsx), as
// Featured does: the planner's parts along the editor's timeline in small,
// opening on the part the card shows, with Save planner and its Use buttons
// in the header.

import { useEffect, useState } from "react";
import { SpreadZoom } from "@/app/planner/SpreadZoom";
import zoomCss from "@/app/planner/spreadZoom.module.css";
import { ZoomHint } from "./LayoutViewer";
import { SpreadPreview } from "./SpreadPreview";
import { loadSet } from "./previewSets";
import type { LandingSpread } from "./spreads";
import type { PlannerPart } from "./plannerTemplates";
import { UseThisWeek } from "./UseThisWeek";
import css from "./layoutViewer.module.css";

export function PlannerCard({
  plannerKey,
  title,
  cover,
  parts,
  orderAsIs,
}: {
  plannerKey: string;
  title: string;
  /** The spread the card shows, and the part the zoom opens on. */
  cover: string;
  parts: Array<{ part: PlannerPart; key: string }>;
  /** The same buttons as under the card (PlannerActions): Order as is and
   *  Change it first where ordering works, else Use this planner. */
  orderAsIs: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [spreads, setSpreads] = useState<Map<string, LandingSpread> | null>(null);
  // Every part's drawing: the gallery's one fetch, which the cards on the
  // page have usually made already.
  useEffect(() => {
    if (!open || spreads) return;
    let live = true;
    void loadSet("all").then((all) => live && setSpreads(new Map(all.map((spread) => [spread.key, spread]))));
    return () => {
      live = false;
    };
  }, [open, spreads]);
  return (
    <>
      <button type="button" className={css.card} onClick={() => setOpen(true)} aria-label={`Open the ${title} planner larger`}>
        <SpreadPreview spreadKey={cover} />
        <ZoomHint />
      </button>
      {open && (
        <SpreadZoom
          title={title}
          kind="Planner"
          parts={parts.map((p) => ({ key: p.key, level: p.part, spread: spreads?.get(p.key) ?? null }))}
          initial={Math.max(0, parts.findIndex((p) => p.key === cover))}
          save={{ kind: "planner", key: plannerKey }}
          actions={
            orderAsIs ? (
              <>
                <UseThisWeek spreadKey={plannerKey} label="Order as is" then="order" className={zoomCss.use} />
                <UseThisWeek spreadKey={plannerKey} label="Change it first" className={zoomCss.useQuiet} />
              </>
            ) : (
              <UseThisWeek spreadKey={plannerKey} label="Use this planner" className={zoomCss.use} />
            )
          }
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
