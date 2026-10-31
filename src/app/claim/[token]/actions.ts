"use server";

// Claiming a prepared workspace (src/lib/businessClaim.ts): the button on
// /claim/<token>. A POST, so a link preview or a prefetch never claims.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { takeClaim } from "@/lib/businessClaim";
import { GUEST_COOKIE, GUEST_COOKIE_MAX_AGE, GUEST_OWNER_PREFIX, guestCookieValue, guestModeAvailable } from "@/lib/guest";
import { currentOwner, moveGuestWork } from "@/lib/owner";

export async function claimWorkspace(token: string): Promise<{ error: string }> {
  const owner = await currentOwner();
  // nobody here yet and no guest cookie can be made: say so before the link
  // is used up
  if (!owner && !guestModeAvailable()) return { error: "This workspace can't be opened just now. Sign in, then open the link again." };
  // the link's one use (businessClaim.ts): of two presses at once, one
  const target = await takeClaim(String(token));
  if (!target) redirect(`/claim/${encodeURIComponent(String(token))}`);
  if (owner && !owner.guest) {
    // signed in: theirs now, and the link is dead (moveGuestBusiness)
    await moveGuestWork(target.ownerId, owner.id);
  } else if (owner?.guest) {
    // a guest here already: the workspace joins what they made, so nothing of
    // theirs is left behind on a guest id no cookie names
    if (owner.id !== target.ownerId) await moveGuestWork(target.ownerId, owner.id);
  } else {
    // nobody here yet: this browser becomes the workspace's guest, and
    // signing in later brings it all to their account
    const value = guestCookieValue(target.ownerId.slice(GUEST_OWNER_PREFIX.length));
    if (!value) return { error: "This workspace can't be opened just now. Sign in, then open the link again." };
    (await cookies()).set(GUEST_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: GUEST_COOKIE_MAX_AGE });
  }
  redirect("/app/business?welcome=1");
}
