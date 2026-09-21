import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

// memari.studio's front door, for now: sign in, then the planner. Asked for,
// 2026-09-21 - "for now sign in, then editor. I have an idea for a landing
// page but that works for now".
//
// It replaces the "pipeline check" that stood here through development,
// which counted the user table and, whenever the database was unreachable,
// printed the database's own error message on a public page.
//
// The weekly spread, because that is the editor's main route - see
// levelPage. Signing in from here returns to "/", which lands there too.
export default async function Home() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  redirect("/planner/next");
}
