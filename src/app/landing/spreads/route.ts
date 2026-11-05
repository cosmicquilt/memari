// The landing page's spreads, as JSON - fetched when the 3D journal loads,
// so the page's own HTML stays small and the title can animate at once.
// ~1.9 MB of drawing, ~45 KB over the wire (brotli).
//
// Dated to the week it is fetched in, so the journal opens on THIS week.
// Cached for an hour: a page an hour stale is still this week.

import { landingSpreads } from "../spreads";
import { resolveLayout } from "../similarLayouts";

export const dynamic = "force-dynamic";

/** Each with whether the layouts popup has it (the hero's expand button,
 *  VideoHero): the faith and recovery weeks are on the hero but held back
 *  from the layouts. */
export function GET() {
  return Response.json(landingSpreads().map((s) => ({ ...s, openable: resolveLayout(s.key) !== null })), {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
