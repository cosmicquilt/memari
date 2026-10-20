// The Layouts gallery's pictures as data (GET /landing/layouts), fetched
// once however many cards ask: the gallery's, the landing page's few, and
// the start dialog's Featured (planner/StartFeatured.tsx). Apart from
// SpreadPreview so that taking the data does not bring the landing page's
// stylesheet along with it.

import type { LandingSpread } from "./spreads";

export type PreviewSet = "all" | "home";

const sets = new Map<PreviewSet, Promise<LandingSpread[]>>();

export function loadSet(set: PreviewSet): Promise<LandingSpread[]> {
  let hit = sets.get(set);
  if (!hit) {
    hit = fetch(`/landing/layouts?set=${set}`)
      .then((r) => (r.ok ? (r.json() as Promise<LandingSpread[]>) : []))
      .catch(() => {
        sets.delete(set);
        return [];
      });
    sets.set(set, hit);
  }
  return hit;
}
