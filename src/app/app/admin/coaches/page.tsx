// memari.studio/app/admin/coaches - THE PILOT PAGE (2026-10-31, the first
// coaches): every workspace we prepared for a coach (scripts/build-coach-
// kit.mts, src/lib/businessClaim.ts), how far each coach has got - claimed,
// their journal made theirs, clients, answers, books - when they were last
// in, and what they've told us ("Tell us"). A new claim link for one not
// claimed yet. Only for the accounts in ADMIN_OWNER_IDS; anyone else gets a
// 404, so the page does not say it exists.

import { notFound } from "next/navigation";
import { currentOwner } from "@/lib/owner";
import { isAdmin } from "@/lib/print/admin";
import { PilotView } from "./PilotView";

export const dynamic = "force-dynamic";

export default async function PilotPage() {
  const owner = await currentOwner();
  if (!owner || owner.guest || !isAdmin(owner.id)) notFound();
  return <PilotView />;
}
