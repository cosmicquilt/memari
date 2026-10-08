// The Layouts gallery's pictures, as JSON: each layout as printing it gives
// you (spreads.ts layoutPreview - no calendar, no handwriting), for the
// cards on /layouts (?set=all) and the landing page (?set=home). Dated to
// the week it is fetched in; cached for an hour.

import { layoutPreview } from "../spreads";
import { HERO_BY_KEY } from "../heroSpreads";
import { HOME_KEYS, STARTERS } from "../starterLayouts";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const set = new URL(request.url).searchParams.get("set");
  const keys = set === "home" ? HOME_KEYS : STARTERS.map((s) => s.key);
  return Response.json(
    keys.map((key) => layoutPreview(HERO_BY_KEY[key])),
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } }
  );
}
