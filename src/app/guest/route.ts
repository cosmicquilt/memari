// "Continue as guest" - POST from the sign-in page.
//
// Gives this browser a signed guest id (see src/lib/guest.ts) and sends it to
// the start dialog. POST only: a GET could be followed by a link preview or a
// prefetch, and each would mint a guest. A browser that is already a guest
// keeps its id - pressing the button twice must not orphan the journals the
// first press made.
//
// Also where abandoned guest work is cleared: guest journals nobody has
// opened for GUEST_IDLE_DAYS (and then their saved items), deleted whenever
// someone starts as a guest. A few indexed queries, and no scheduled job.

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
  const idleGuest = { ownerId: { startsWith: GUEST_OWNER_PREFIX }, updatedAt: { lt: cutoff } };
  await prisma.planner.deleteMany({ where: idleGuest });
  // A guest's saved items go once the guest has no journals left and the
  // item itself has sat as long. Not on idleness alone: a saved page is only
  // touched when it is edited, and a guest still using their journals would
  // otherwise lose it from Saved.
  const savedOwners = new Set(
    [
      ...(await prisma.savedPage.findMany({ where: idleGuest, select: { ownerId: true }, distinct: ["ownerId"] })),
      ...(await prisma.savedModule.findMany({ where: idleGuest, select: { ownerId: true }, distinct: ["ownerId"] })),
    ].map((row) => row.ownerId)
  );
  if (savedOwners.size > 0) {
    const active = await prisma.planner.findMany({
      where: { ownerId: { in: [...savedOwners] } },
      select: { ownerId: true },
      distinct: ["ownerId"],
    });
    for (const row of active) savedOwners.delete(row.ownerId);
    const gone = { ...idleGuest, ownerId: { in: [...savedOwners] } };
    await prisma.$transaction([prisma.savedPage.deleteMany({ where: gone }), prisma.savedModule.deleteMany({ where: gone })]);
  }

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
