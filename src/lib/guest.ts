// Guest mode: using Memari without an account.
//
// Asked for 2026-09-21 - "continue as guest" on the sign-in page - and
// decided the same day: a guest's journals live on the SERVER, owned by an
// id this browser carries in a signed cookie; signing in on that browser
// moves them to the account; a guest journal nobody has opened for 30 days
// is deleted.
//
// A guest's journals are ordinary journals whose ownerId is "guest:<id>"
// instead of a Clerk user id, so every ownership check the app already makes
// applies to guests unchanged. The only thing that is new is where the id
// comes from, and the signature is what stops anyone choosing it: an id
// without a valid signature is not a guest, it is nobody.
//
// SERVER-ONLY. The secret must never reach a browser.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GUEST_COOKIE = "memari-guest";
export const GUEST_OWNER_PREFIX = "guest:";
/** How many journals a guest may make. Enough to try Memari properly, few
 *  enough that one browser cannot fill the database. */
export const GUEST_JOURNAL_LIMIT = 3;
/** How many saved pages, and separately saved modules, a guest may keep -
 *  the same reasoning as the journal limit. */
export const GUEST_SAVED_LIMIT = 20;
/** A guest journal nobody has opened for this long is deleted. */
export const GUEST_IDLE_DAYS = 30;
/** The cookie outlives the idle limit: an active guest keeps their id; an
 *  idle one's journals are gone well before it expires. */
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The key guest cookies are signed with: GUEST_COOKIE_SECRET, at least 32
 * characters. Outside production a fixed development key stands in so the
 * dev server works without setup - dev is not reachable from outside. In
 * production with no key, guest mode is OFF: the button is hidden and every
 * guest cookie is ignored, rather than being signed with something guessable.
 */
export function guestSecret(): string | null {
  const configured = process.env.GUEST_COOKIE_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV !== "production") return "memari-dev-only-guest-cookie-key-not-secret";
  return null;
}

export function guestModeAvailable(): boolean {
  return guestSecret() !== null;
}

function signature(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

/** A fresh guest id, 128 random bits. */
export function newGuestId(): string {
  return randomBytes(16).toString("hex");
}

/** The cookie's value for a guest id: the id and its signature. */
export function guestCookieValue(id: string): string | null {
  const secret = guestSecret();
  return secret ? `${id}.${signature(id, secret)}` : null;
}

/** The guest id a cookie proves, or null when it proves nothing - missing,
 *  malformed, signed with another key, or guest mode off. */
export function guestIdFromCookie(value: string | undefined): string | null {
  const secret = guestSecret();
  if (!secret || !value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  if (!/^[0-9a-f]{32}$/.test(id)) return null;
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(signature(id, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return id;
}

export function isGuestOwner(ownerId: string): boolean {
  return ownerId.startsWith(GUEST_OWNER_PREFIX);
}
