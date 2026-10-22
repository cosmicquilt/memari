// What lies under the site's pages: their cream, not the app's background
// (2026-10-22: "on layouts page if i scroll fast it shows black"). A fast
// scroll reaches parts of the page the browser has not drawn yet, and for
// that moment it shows the document's own background - the app's, which is
// near-black in dark mode (globals.css). Under the site that is now the
// site's cream, so a part not yet drawn is the paper, not a black hole. An
// inline <style>, not a hoisted one, so it leaves with the page: the app
// keeps its own.

import { BODY_WALL_DEFAULTS, creamRgb } from "./bodyWall";

export function SiteGround() {
  return <style>{`html,body{background-color:rgb(${creamRgb(BODY_WALL_DEFAULTS.creamDepth ?? 1).join(",")})}`}</style>;
}
