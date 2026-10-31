// /dev/pilot (development only): the admin pilot page's view
// (src/app/app/admin/coaches), without the admin check - for check:coach-kit
// and the roadmap's photographs, as a check cannot sign in as an admin.

import { notFound } from "next/navigation";
import { PilotView } from "@/app/app/admin/coaches/PilotView";

export const dynamic = "force-dynamic";

export default function DevPilot() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PilotView />;
}
