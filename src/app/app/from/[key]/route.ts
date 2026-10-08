// "Use this" - a POST from the Layouts pages (/layouts and /layouts/<key>,
// 2026-10-08): a week, a month, a day or pages of modules. The landing
// page's own buttons came off 2026-10-06 ("i dont want the 'use this week'
// button").
//
// Makes a new journal laid out as that spread (see planner/archetypeWeek.ts)
// and opens it in the editor. Someone who has
// never used Memari becomes a guest here, the way "Continue as guest" makes
// one (app/guest/route.ts): one press from a Layouts page to their own
// copy of the week. POST only, for the same reason as that route - a GET
// could be followed by a link preview or a prefetch, and each would make a
// journal.

import { NextResponse, type NextRequest } from "next/server";
import { currentOwner, signInPath } from "@/lib/owner";
import {
  GUEST_COOKIE,
  GUEST_COOKIE_MAX_AGE,
  GUEST_JOURNAL_LIMIT,
  GUEST_OWNER_PREFIX,
  guestCookieValue,
  guestModeAvailable,
  newGuestId,
} from "@/lib/guest";
import { sweepIdleGuests } from "@/lib/guestSweep";
import { prisma } from "@/lib/prisma";
import { isTimeZone } from "@/lib/timeZone";
import { STARTER_BY_KEY, starterSpread } from "@/app/landing/starterLayouts";
import { WeekUnavailable, createJournalFromSpread } from "@/app/planner/archetypeWeek";
import { seedOwnerDefaultZone } from "@/app/planner/ownerSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  // Only what the gallery offers: a spread held for a read-through is not
  // in it, so it cannot be made from here either.
  const spread = starterSpread(key);
  if (!spread) {
    return new Response("There is no such layout.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const form = await request.formData().catch(() => null);
  const zone = form?.get("tz");

  let owner = await currentOwner();
  let newGuest: string | null = null;
  if (!owner) {
    if (!guestModeAvailable()) return NextResponse.redirect(new URL(signInPath("/app"), request.url), 303);
    await sweepIdleGuests();
    const id = newGuestId();
    newGuest = guestCookieValue(id);
    owner = { id: `${GUEST_OWNER_PREFIX}${id}`, guest: true };
  }
  if (owner.guest) {
    // At a guest's limit: the start dialog says so, and offers sign-in.
    const count = await prisma.planner.count({ where: { ownerId: owner.id, isTemplate: false } });
    if (count >= GUEST_JOURNAL_LIMIT) return NextResponse.redirect(new URL("/app", request.url), 303);
  }

  // A first journal is where a default zone comes from, as in createJournal.
  await seedOwnerDefaultZone(owner.id, isTimeZone(zone) ? zone : null);
  let where: string;
  try {
    const book = await createJournalFromSpread(owner.id, spread, `${STARTER_BY_KEY[key].title} journal`, isTimeZone(zone) ? zone : null);
    where = `/app/j/${book.slug}`;
  } catch (error) {
    // A module the database has no type for yet: the start dialog, where
    // a journal can still be made, rather than an error page. Logged, since
    // it means production needs seeding.
    if (!(error instanceof WeekUnavailable)) throw error;
    console.error(`[use this] ${error.message}`);
    where = "/app";
  }

  const response = NextResponse.redirect(new URL(where, request.url), 303);
  if (newGuest) {
    response.cookies.set(GUEST_COOKIE, newGuest, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: GUEST_COOKIE_MAX_AGE,
    });
  }
  return response;
}

/** The address typed or followed: that week's page, where the button is
 *  (STARTER_WEEKS; a week not in the gallery goes to the gallery). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return NextResponse.redirect(new URL(STARTER_BY_KEY[key] ? `/layouts/${key}` : "/layouts", request.url), 303);
}
