// Who an account page is for - or, nobody signed in, off to sign in and back
// to that same page (layout.tsx: the layout can't say which page it is).

import { redirect } from "next/navigation";
import { currentOwner, signInPath } from "@/lib/owner";

export async function requireAccountOwner(path: string) {
  const owner = await currentOwner();
  if (!owner) redirect(signInPath(path));
  return owner;
}
