// memari. for businesses - A WORKSPACE PREPARED FOR A COACH, AND THE LINK
// THAT MAKES IT THEIRS (2026-10-31, the first coaches: the eight co-authors
// of the book launched on 17 October). scripts/build-coach-kit.mts builds a
// coach's business - their own framework as its template, their questions,
// themselves as the first client - under a holding guest, and makes a link:
// /claim/<token>.
//
// The link opens a page naming the workspace; its button claims it (a POST,
// so a link preview or a prefetch never does - as "Continue as guest",
// src/app/guest/route.ts):
//   - signed in: the workspace moves to their account (moveGuestWork), and
//     the link is dead;
//   - a guest already, with their own work in this browser: the workspace
//     moves to that guest, so nothing of theirs is left behind;
//   - otherwise: this browser becomes the holding guest, and signing in
//     later moves it all to their account, as for any guest.
// THE LINK OPENS IT ONCE (review, 2026-10-31). Claiming moves whatever the
// workspace's owner holds, so a link that worked again would let whoever
// clicked a forwarded note next take the coach's guest work, journals and
// all, into their own browser. After its one use the coach reaches it by
// signing in (Home says so); lost before then, the pilot page makes a new
// link. It works for CLAIM_DAYS, and only its SHA-256 is kept, as for a
// client's link (clientPortal.ts).
//
// SERVER-ONLY.

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { GUEST_OWNER_PREFIX } from "@/lib/guest";

/** How long a claim link works. */
export const CLAIM_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Where a claim link points, on a site's address. */
export const claimUrl = (base: string, token: string) => `${base.replace(/\/+$/, "")}/claim/${token}`;

/** A new link for a prepared business, replacing any before it; the token
 *  is shown once. Refused for one an account has claimed already. */
export async function makeClaimToken(businessId: string, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const made = await prisma.business.updateMany({
    where: { id: businessId, preparedAt: { not: null }, claimedAt: null, ownerId: { startsWith: GUEST_OWNER_PREFIX } },
    data: { claimTokenHash: hashOf(token), claimExpiresAt: new Date(now.getTime() + CLAIM_DAYS * DAY) },
  });
  if (made.count !== 1) throw new Error("Only a prepared workspace nobody has claimed yet takes a claim link.");
  return token;
}

/** The workspace a link opens: prepared, not claimed by an account, not
 *  expired, and still a guest's. Null for anything else. */
export async function claimTargetFor(token: string, now = new Date()) {
  if (typeof token !== "string" || !TOKEN.test(token)) return null;
  const business = await prisma.business.findUnique({
    where: { claimTokenHash: hashOf(token) },
    select: { id: true, name: true, ownerId: true, preparedAt: true, claimedAt: true, claimExpiresAt: true, logoUrl: true },
  });
  if (!business?.preparedAt || business.claimedAt || !business.claimExpiresAt || business.claimExpiresAt <= now) return null;
  if (!business.ownerId.startsWith(GUEST_OWNER_PREFIX)) return null;
  return business;
}

/** The link used up, and the workspace it opens - by one press only: the
 *  hash is cleared by the update that matches it, so of two presses at once
 *  one gets the workspace and the other nothing. The pilot page reads a
 *  guest's workspace with no link as opened. */
export async function takeClaim(token: string, now = new Date()) {
  const target = await claimTargetFor(token, now);
  if (!target) return null;
  const taken = await prisma.business.updateMany({ where: { id: target.id, claimTokenHash: hashOf(token) }, data: { claimTokenHash: null } });
  return taken.count === 1 ? target : null;
}

/** An account has the workspace now: the link is dead, and the pilot page
 *  says when (owner.ts, moveGuestBusiness). */
export async function markClaimed(businessId: string, now = new Date()): Promise<void> {
  await prisma.business.updateMany({ where: { id: businessId, preparedAt: { not: null }, claimedAt: null }, data: { claimedAt: now, claimTokenHash: null } });
}
