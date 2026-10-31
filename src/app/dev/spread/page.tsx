// /dev/spread (development only): one spread drawn large on white, for the
// editorial proof's photographs (2026-10-28). ?key=<spread key> draws a
// gallery, planner or hero spread; ?profile=<name>&part=<n> draws part n of
// what the otter quiz builds for one of PROOF_PROFILES.

import { notFound } from "next/navigation";
import { HERO_BY_KEY } from "@/app/landing/heroSpreads";
import { layoutPreview } from "@/app/landing/spreads";
import { planFromAnswers } from "@/app/planner/otterPlanner";
import { PROOF_PROFILES } from "./profiles";
import { BigSpread } from "./BigSpread";

export default async function DevSpread({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const q = await searchParams;
  const today = new Date("2026-11-02T12:00:00Z");
  let def = q.key ? HERO_BY_KEY[q.key] : undefined;
  if (!def && q.profile) {
    const answers = PROOF_PROFILES[q.profile];
    if (answers) def = planFromAnswers(answers, "serif", today).parts[Number(q.part ?? 0)]?.spread;
  }
  if (!def) notFound();
  return (
    <main style={{ background: "#fff", minHeight: "100vh", padding: 24 }}>
      <div id="shot" style={{ display: "inline-block", background: "#fff", padding: 12 }}>
        <BigSpread spread={layoutPreview(def, today)} />
      </div>
    </main>
  );
}
