// SAVING FROM THE SITE: a save from a public page (Save on a layout, a heart
// on a cover) belongs to whoever is asking - and somebody who has never used
// Memari becomes a guest right there, as "Use this" makes one
// (app/from/[key]), so what they kept is theirs when they open the app.
//
// Shared by the routes that do it (app/saved/template, app/saved/covers), so
// the guest cookie is set one way only. Moved out of the template route on
// 2026-11-05, unchanged, when hearts needed the same.
//
// SERVER-ONLY.

import type { NextRequest, NextResponse } from "next/server";
import { currentOwner, type Owner } from "@/lib/owner";
import {
  GUEST_COOKIE,
  GUEST_COOKIE_MAX_AGE,
  GUEST_OWNER_PREFIX,
  guestCookieValue,
  guestModeAvailable,
  newGuestId,
} from "@/lib/guest";
import { sweepIdleGuests } from "@/lib/guestSweep";

/** JSON in, same origin only: a form from another site cannot send JSON
 *  without a preflight it would fail, and this refuses the rest. */
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

/** Who a save belongs to: the person asking, else a new guest - whose
 *  cookie the response must carry (setGuestCookie). Null when nobody is
 *  asking and guests are off (production without GUEST_COOKIE_SECRET). */
export async function ownerOrNewGuest(): Promise<{ owner: Owner; cookie: string | null } | null> {
  const owner = await currentOwner();
  if (owner) return { owner, cookie: null };
  if (!guestModeAvailable()) return null;
  await sweepIdleGuests();
  const id = newGuestId();
  return { owner: { id: `${GUEST_OWNER_PREFIX}${id}`, guest: true }, cookie: guestCookieValue(id) };
}

/** The new guest's cookie on the response, when one was made. */
export function setGuestCookie<T extends NextResponse>(response: T, cookie: string | null): T {
  if (cookie) {
    response.cookies.set(GUEST_COOKIE, cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: GUEST_COOKIE_MAX_AGE,
    });
  }
  return response;
}
