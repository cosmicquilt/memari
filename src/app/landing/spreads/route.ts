// The landing page's spreads, as JSON - fetched when the 3D journal loads,
// so the page's own HTML stays small and the title can animate at once.
// ~460 KB of drawing, ~30 KB over the wire.
//
// Dated to the week it is fetched in, so the journal opens on THIS week.
// Cached for an hour: a page an hour stale is still this week.

import { landingSpreads } from "../spreads";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(landingSpreads(), {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
