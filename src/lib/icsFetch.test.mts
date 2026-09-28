// The addresses this server will and will not fetch.
//
// A URL the browser supplies, fetched by the server, is server-side request
// forgery. The whole defence is `isBlockedAddress` and the rule that it runs
// on the RESOLVED ADDRESS at every hop - so this pins the ranges, and pins
// them from both sides: a range that is not blocked is as much a bug as a
// public address that is.
//
//   npx tsx src/lib/icsFetch.test.mts

import { isBlockedAddress, fetchIcs, IcsFetchError, MAX_ICS_BYTES } from "./icsFetch.js";

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`  FAIL  ${what}`);
    failures++;
  }
};

// --- WHAT MUST NEVER BE FETCHED -------------------------------------------
//
// 169.254.169.254 is the one to look at: it is the cloud metadata service on
// AWS, GCP and Azure alike, and reaching it from a server is how instance
// credentials get stolen. The rest are the ranges that put this server inside
// somebody's network.
const BLOCKED: Array<[string, number, string]> = [
  ["127.0.0.1", 4, "loopback"],
  ["127.1.2.3", 4, "the rest of loopback, not just .0.1"],
  ["0.0.0.0", 4, "this network"],
  ["10.0.0.7", 4, "private 10/8"],
  ["172.16.0.1", 4, "private 172.16/12, low end"],
  ["172.31.255.254", 4, "private 172.16/12, high end"],
  ["192.168.1.1", 4, "private 192.168/16"],
  ["169.254.169.254", 4, "THE CLOUD METADATA SERVICE"],
  ["169.254.0.1", 4, "link-local generally"],
  ["100.64.0.1", 4, "carrier-grade NAT"],
  ["192.0.0.1", 4, "IETF protocol assignments"],
  ["224.0.0.1", 4, "multicast"],
  ["255.255.255.255", 4, "broadcast"],
  ["::1", 6, "IPv6 loopback"],
  ["::", 6, "IPv6 unspecified"],
  ["::ffff:127.0.0.1", 6, "loopback written as IPv4-mapped IPv6"],
  ["::ffff:169.254.169.254", 6, "the metadata service, mapped"],
  ["fd00::1", 6, "IPv6 unique-local"],
  ["fe80::1", 6, "IPv6 link-local"],
  ["fe80::1%eth0", 6, "IPv6 link-local with a zone index"],
  ["not-an-address", 4, "something that is not an address at all"],
  ["1.2.3", 4, "a short address"],
  ["1.2.3.999", 4, "an out-of-range octet"],
];
for (const [address, family, what] of BLOCKED) {
  check(isBlockedAddress(address, family), `${address} must be blocked (${what})`);
}

// --- AND WHAT MUST STILL WORK ---------------------------------------------
//
// The other half. A guard that blocks everything passes the list above and
// makes the feature useless - these are real calendar hosts.
const ALLOWED: Array<[string, number, string]> = [
  ["142.250.72.14", 4, "google.com"],
  ["17.253.144.10", 4, "apple.com"],
  ["13.107.42.14", 4, "outlook.office365.com"],
  ["8.8.8.8", 4, "an ordinary public address"],
  ["172.15.0.1", 4, "just below the private 172 range"],
  ["172.32.0.1", 4, "just above the private 172 range"],
  ["192.167.1.1", 4, "just below 192.168"],
  ["192.169.1.1", 4, "just above 192.168"],
  ["100.63.0.1", 4, "just below carrier-grade NAT"],
  ["100.128.0.1", 4, "just above carrier-grade NAT"],
  ["223.255.255.255", 4, "just below multicast"],
  ["2607:f8b0:4004:c07::65", 6, "a public IPv6 address"],
  ["2001:4860:4860::8888", 6, "Google's public DNS over IPv6"],
];
for (const [address, family, what] of ALLOWED) {
  check(!isBlockedAddress(address, family), `${address} must be allowed (${what})`);
}

// --- REFUSED, AND REFUSED FOR THE RIGHT REASON ----------------------------
//
// The reason is asserted, not just the refusal. Measured: with the resolved-
// address check removed entirely, every one of these still "passed" - the
// fetch simply went ahead, failed to connect to 127.0.0.1, and threw the same
// kind of error. A test that cannot tell "the guard stopped it" from "nothing
// answered" is not testing the guard.
const rejects = async (url: string, reason: RegExp, what: string) => {
  try {
    await fetchIcs(url);
    check(false, `${what}: "${url}" was fetched and should not have been`);
  } catch (error) {
    if (!(error instanceof IcsFetchError)) {
      check(false, `${what}: "${url}" failed with ${(error as Error).name}, not a readable IcsFetchError`);
      return;
    }
    check(reason.test(error.message), `${what}: refused, but for the wrong reason - "${error.message}"`);
  }
};

const NOT_FETCHABLE = /not one this server will fetch/i;
const NOT_HTTPS = /has to be https/i;

await rejects("http://example.com/cal.ics", NOT_HTTPS, "plain http - a secret address over http is not secret");
await rejects("file:///etc/passwd", NOT_HTTPS, "a file: URL");
await rejects("ftp://example.com/cal.ics", NOT_HTTPS, "an unknown scheme");
await rejects("not a url at all", /does not look like a web address/i, "junk");
await rejects("https://127.0.0.1/cal.ics", NOT_FETCHABLE, "loopback by address");
await rejects("https://169.254.169.254/latest/meta-data/", NOT_FETCHABLE, "THE CLOUD METADATA SERVICE");
await rejects("https://[::1]/cal.ics", NOT_FETCHABLE, "IPv6 loopback");
// `localhost` may not resolve at all on a given machine, so either answer is
// honest here - what must not happen is the fetch going ahead.
await rejects("https://localhost/cal.ics", /not one this server will fetch|could not be found/i, "loopback by name");

// A NAME THAT RESOLVES TO LOOPBACK. The string looks public, so a check that
// reads the URL rather than the address lets it straight through - the
// standard way past a naive guard. This one needs DNS, so a lookup failure is
// accepted as an honest outcome; what is not accepted is a connection
// attempt.
await rejects(
  "https://localtest.me/cal.ics",
  /not one this server will fetch|could not be found/i,
  "a public NAME resolving to 127.0.0.1"
);

// --- webcal:// IS ACCEPTED AS https ---------------------------------------
//
// It is what Apple's and Google's own "subscribe" buttons hand out, so it is
// the most likely thing a person pastes. It must be READ (and then blocked
// here for the address behind it, not for its scheme).
{
  let message = "";
  try {
    await fetchIcs("webcal://127.0.0.1/cal.ics");
  } catch (error) {
    message = (error as Error).message;
  }
  check(
    /will fetch|not one this server/i.test(message),
    `webcal should be read as https and then judged on its address; got "${message}"`
  );
}

check(MAX_ICS_BYTES > 0 && MAX_ICS_BYTES <= 32 * 1024 * 1024, "the size cap should be set and sane");

if (failures > 0) {
  console.error(`\nics fetching: ${failures} problem(s).`);
  process.exit(1);
}
console.log(
  `All ics fetch checks passed (${BLOCKED.length} addresses blocked including the cloud metadata service, ` +
    `${ALLOWED.length} public ones still allowed, https only, and a public name resolving to loopback refused).`
);
