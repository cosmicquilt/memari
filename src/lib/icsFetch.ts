// Fetching an .ics feed from an address a person typed.
//
// THIS IS THE DANGEROUS HALF. The server fetches a URL the browser supplies,
// which is server-side request forgery in its purest form: left open, anyone
// with an account can make memari.studio fetch `http://169.254.169.254/...`
// and hand back the cloud metadata service's reply, or knock on whatever is
// listening on localhost. The parser is pure and harmless; this is the file
// that needs the argument.
//
// The rules, each for a reason:
//
//   https ONLY. A secret calendar address is a credential; sending it in
//   clear over http hands it to anything on the path. It also removes
//   redirect-to-http as a way around the rest of this.
//   NO PRIVATE OR SPECIAL ADDRESS. Loopback, link-local (which is where
//   169.254.169.254 lives), the RFC 1918 ranges, carrier-grade NAT, and the
//   IPv6 equivalents. Checked on the ADDRESS THE NAME RESOLVES TO, not on the
//   name: `evil.example.com` resolving to 127.0.0.1 is the standard way past
//   a check that only reads the string.
//   NO REDIRECTS FOLLOWED BLINDLY. A public URL that 302s to a private one
//   defeats a check done once up front, so each hop is checked again.
//   A SIZE CAP AND A TIMEOUT. A feed is text; an endless or enormous
//   response should not be able to hold a request open or fill memory.
//
// KNOWN AND ACCEPTED: this resolves the name, then fetches it, and a name
// that answers differently between the two calls slips through (a DNS
// rebind). Closing that needs a fetch pinned to an address we resolved
// ourselves, which Node's fetch does not offer without a custom agent. The
// ranges below are what a rebind would have to land on, and the reply is
// parsed as an .ics and never echoed back, so what leaks is at most "was
// this parseable". Worth revisiting if this ever returns a body.

import { lookup } from "node:dns/promises";

/** A feed is text. Anything larger than this is not one, and reading it would
 *  be someone using this as a way to make the server download a film. */
export const MAX_ICS_BYTES = 8 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export class IcsFetchError extends Error {}

/**
 * Is this an address the server must not be told to fetch?
 *
 * Exported for its own test. Takes an address, never a host name - resolving
 * the name is the caller's job, and doing it here would let a name that looks
 * fine be judged on how it looks.
 */
export function isBlockedAddress(address: string, family: number): boolean {
  if (family === 6) {
    const ip = address.toLowerCase().split("%")[0];
    if (ip === "::" || ip === "::1") return true;
    // IPv4 written as IPv6 - ::ffff:127.0.0.1 is loopback by another name.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped) return isBlockedAddress(mapped[1], 4);
    // fc00::/7 unique-local, fe80::/10 link-local.
    if (/^f[cd]/.test(ip)) return true;
    if (/^fe[89ab]/.test(ip)) return true;
    return false;
  }

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, and the metadata service
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast, and reserved above it
  return false;
}

/** Throws unless this URL is one the server may fetch. */
async function assertFetchable(raw: string): Promise<URL> {
  let url: URL;
  try {
    // webcal:// is what Apple and Google put behind a "subscribe" button; it
    // is https with a different name on it, and pasting one is the most
    // likely thing a person does.
    url = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    throw new IcsFetchError("That does not look like a web address.");
  }
  if (url.protocol !== "https:") {
    throw new IcsFetchError("A calendar address has to be https - a secret address sent over http is not secret.");
  }

  let resolved;
  try {
    resolved = await lookup(url.hostname, { all: true });
  } catch {
    throw new IcsFetchError("That address could not be found.");
  }
  // EVERY address it resolves to, not the first: a name with one public and
  // one private address would otherwise be a coin toss.
  if (resolved.length === 0 || resolved.some((a) => isBlockedAddress(a.address, a.family))) {
    throw new IcsFetchError("That address is not one this server will fetch.");
  }
  return url;
}

export type FetchedIcs = { text: string; url: string };

/**
 * The feed's text, or an IcsFetchError whose message can be shown.
 *
 * Redirects are followed by hand, up to MAX_REDIRECTS, so every hop goes
 * through the same check. `redirect: "manual"` is what makes that possible -
 * left on the default, fetch follows them itself and the checks above only
 * ever see the first URL.
 */
export async function fetchIcs(raw: string): Promise<FetchedIcs> {
  let url = await assertFetchable(raw);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1", "user-agent": "Memari/1.0 (+https://memari.studio)" },
      });
    } catch (error) {
      clearTimeout(timer);
      throw new IcsFetchError(
        (error as Error).name === "AbortError" ? "That calendar took too long to answer." : "That calendar could not be reached."
      );
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new IcsFetchError("That calendar redirected to nowhere.");
      url = await assertFetchable(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) {
      throw new IcsFetchError(
        response.status === 404
          ? "There is no calendar at that address."
          : response.status === 401 || response.status === 403
            ? "That calendar would not let us in - check the address is the secret one."
            : `That calendar answered ${response.status}.`
      );
    }

    // The header is a hint, not a promise, so the body is capped as it
    // arrives as well.
    const declared = Number(response.headers.get("content-length") ?? NaN);
    if (Number.isFinite(declared) && declared > MAX_ICS_BYTES) {
      throw new IcsFetchError("That calendar is too large to read.");
    }
    const text = await readCapped(response, MAX_ICS_BYTES);
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      throw new IcsFetchError("That address answered, but it is not a calendar feed.");
    }
    return { text, url: url.toString() };
  }
  throw new IcsFetchError("That calendar redirected too many times.");
}

/** The body, stopped at `limit` bytes - read as it arrives rather than with
 *  `response.text()`, which would buffer the whole of whatever is sent. */
async function readCapped(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new IcsFetchError("That calendar is too large to read.");
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}
