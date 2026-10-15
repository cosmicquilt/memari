// The way past the coming-soon gate (src/proxy.ts) for those with the
// password (Andrew, 2026-10-15: "add password on coming soon gate").
//
// THE PASSWORD IS NOT IN THE CODE. This repository is public, so it lives in
// the environment, COMING_SOON_PASSWORD, set in Vercel; without it nobody
// gets past (the gate fails closed). The right password sets a cookie whose
// value is an HMAC of a fixed message under the password: the gate checks it
// by computing the same, so nothing is stored, and changing the password in
// Vercel signs everyone out.
//
// Web Crypto, not node:crypto: the same code runs in the proxy and in the
// route that takes the password.

export const PREVIEW_COOKIE = "memari_preview";
export const PREVIEW_MAX_AGE = 60 * 60 * 24 * 30;
const MESSAGE = "memari coming-soon preview v1";

/** The password, when one is set and long enough to mean something. */
function password(): string | null {
  const value = process.env.COMING_SOON_PASSWORD;
  return value && value.length >= 6 ? value : null;
}

async function hmacHex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", k, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Equal without saying where they first differ. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Whether `given` is the password. Compared as HMACs, so its length says
 *  nothing either. */
export async function isPreviewPassword(given: string): Promise<boolean> {
  const real = password();
  if (!real || !given) return false;
  const [a, b] = await Promise.all([hmacHex(MESSAGE, given), hmacHex(MESSAGE, real)]);
  return sameText(a, b);
}

/** The cookie's value for the current password, or null with none set. */
export async function previewToken(): Promise<string | null> {
  const real = password();
  return real ? hmacHex(real, MESSAGE) : null;
}

/** Whether this cookie value lets its browser past the gate. */
export async function hasPreview(cookie: string | undefined): Promise<boolean> {
  if (!cookie) return false;
  const want = await previewToken();
  return want !== null && sameText(want, cookie);
}
