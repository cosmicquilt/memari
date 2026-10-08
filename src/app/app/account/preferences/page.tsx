// Preferences: the defaults a new journal starts from (week start, page
// size, font), the time zone books follow, and - in this browser only - the
// start screen's theme.

import { cookies } from "next/headers";
import { currentOwner } from "@/lib/owner";
import { ownerDefaultZone, ownerPreferences } from "@/app/planner/ownerSettings";
import { BACKDROP_COOKIE, parseBackdropCookie } from "@/lib/backdropCookie";
import { effectiveZone } from "@/lib/timeZone";
import { PreferencesForm } from "./PreferencesForm";

export default async function PreferencesPage() {
  const owner = (await currentOwner())!;
  const [preferences, zone] = await Promise.all([ownerPreferences(owner.id), ownerDefaultZone(owner.id)]);
  const theme = parseBackdropCookie((await cookies()).get(BACKDROP_COOKIE)?.value);
  // The zone books follow now (with none chosen, the default), and the list
  // to choose from - both from the server, so the first paint and the
  // browser's agree.
  const current = effectiveZone(null, zone);
  const known = Intl.supportedValuesOf("timeZone");
  const zones = known.includes(current) ? known : [current, ...known];
  return (
    <>
      <h1>Preferences</h1>
      <PreferencesForm initial={preferences} zone={current} zones={zones} theme={theme} />
    </>
  );
}
