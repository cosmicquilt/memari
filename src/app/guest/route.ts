// "Continue as guest" - POST from the sign-in page.
//
// Gives this browser a signed guest id (see src/lib/guest.ts) and sends it to
// the start dialog. POST only: a GET could be followed by a link preview or a
// prefetch, and each would mint a guest. A browser that is already a guest
// keeps its id - pressing the button twice must not orphan the journals the
// first press made.
//
// Also where abandoned guest journals are cleared: guest journals nobody has
// opened for GUEST_IDLE_DAYS are deleted whenever someone starts as a guest.
// Cheap - one indexed delete - and it needs no scheduled job to exist.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  GUEST_COOKIE,
  GUEST_COOKIE_MAX_AGE,
  GUEST_IDLE_DAYS,
  GUEST_OWNER_PREFIX,
  guestCookieValue,
  guestIdFromCookie,
  guestModeAvailable,
  newGuestId,
} from "@/lib/guest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!guestModeAvailable()) {
    return new Response("Guest mode is not available. Sign in to use Memari.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const cutoff = new Date(Date.now() - GUEST_IDLE_DAYS * 24 * 60 * 60 * 1000);
  await prisma.planner.deleteMany({
    where: { ownerId: { startsWith: GUEST_OWNER_PREFIX }, updatedAt: { lt: cutoff } },
  });

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
