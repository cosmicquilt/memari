import { currentOwner, signInPath } from "@/lib/owner";
import { redirect } from "next/navigation";

// memari.studio's front door, for now: sign in, then the planner. Asked for,
// 2026-09-21 - "for now sign in, then editor. I have an idea for a landing
// page but that works for now".
//
// It replaces the "pipeline check" that stood here through development,
// which counted the user table and, whenever the database was unreachable,
// printed the database's own error message on a public page.
//
// To /app, the editor's home - see src/app/app/page.tsx. Signing in from here
// returns to "/", which lands there too. "/" itself is kept free for the
// landing page Andrew has in mind.
export default async function Home() {
  // A guest counts: they already chose to try it without an account.
  if (!(await currentOwner())) redirect(signInPath("/app"));
  redirect("/app");
}
