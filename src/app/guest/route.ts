// "Continue as guest" - POST from the sign-in page.
//
// Gives this browser a signed guest id (see src/lib/guest.ts) and sends it to
// the start dialog. POST only: a GET could be followed by a link preview or a
// prefetch, and each would mint a guest. A browser that is already a guest
// keeps its id - pressing the button twice must not orphan the journals the
// first press made.
//
// Also where abandoned guest work is cleared, whenever someone starts as a
// guest. The sweep itself is in src/lib/guestSweep.ts - it moved there so a
// check can drive it, which is how it was noticed that calendars had never
// been added to it.

import { NextResponse, type NextRequest } from "next/server";
import {
  GUEST_COOKIE,
  GUEST_COOKIE_MAX_AGE,
  guestCookieValue,
  guestIdFromCookie,
  guestModeAvailable,
  newGuestId,
} from "@/lib/guest";
import { sweepIdleGuests } from "@/lib/guestSweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!guestModeAvailable()) {
    return new Response("Guest mode is not available. Sign in to use Memari.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  await sweepIdleGuests();

  const id = guestIdFromCookie(request.cookies.get(GUEST_COOKIE)?.value) ?? newGuestId();
  const value = guestCookieValue(id)!;
  const response = NextResponse.redirect(new URL("/app", request.url), 303);
  response.cookies.set(GUEST_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  });
  return response;
}

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/sign-in", request.url), 303);
}
