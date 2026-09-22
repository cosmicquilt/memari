// A guest cookie proves a guest id, and nothing else proves one.
//
// The cookie is the whole of a guest's identity: whoever holds a valid one
// owns that guest's journals. So the property checked here is that only a
// cookie this server signed, for exactly that id, is accepted - a changed
// id, a changed signature, another key's signature or a bare id all read as
// no guest at all - and that production with no key accepts nothing.
//
// Run as part of: npm test
import { guestCookieValue, guestIdFromCookie, guestModeAvailable, newGuestId } from "@/lib/guest";
import { createHmac } from "node:crypto";

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (!condition) {
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

const env = process.env as Record<string, string | undefined>;
const withEnv = <T,>(nodeEnv: string, secret: string | undefined, run: () => T): T => {
  const before = { nodeEnv: env.NODE_ENV, secret: env.GUEST_COOKIE_SECRET };
  env.NODE_ENV = nodeEnv;
  if (secret === undefined) delete env.GUEST_COOKIE_SECRET;
  else env.GUEST_COOKIE_SECRET = secret;
  try {
    return run();
  } finally {
    env.NODE_ENV = before.nodeEnv;
    if (before.secret === undefined) delete env.GUEST_COOKIE_SECRET;
    else env.GUEST_COOKIE_SECRET = before.secret;
  }
};

const KEY = "k".repeat(32);
const OTHER_KEY = "o".repeat(32);

withEnv("production", KEY, () => {
  const id = newGuestId();
  check("a new id is 32 hex characters", /^[0-9a-f]{32}$/.test(id), id);
  check("two new ids differ", newGuestId() !== newGuestId());

  const cookie = guestCookieValue(id)!;
  check("a cookie this server signed proves its id", guestIdFromCookie(cookie) === id, cookie);

  const [, sig] = cookie.split(".");
  const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === "a" ? "b" : "a") + s.slice(i + 1);
  const otherId = newGuestId();
  const refused: Array<[string, string | undefined]> = [
    ["no cookie", undefined],
    ["an empty cookie", ""],
    ["a bare id", id],
    ["an id with an empty signature", `${id}.`],
    ["another id with this id's signature", `${otherId}.${sig}`],
    ["this id with one character of its signature changed", `${id}.${flip(sig, 5)}`],
    ["this id with one character changed", `${flip(id, 0)}.${sig}`],
    ["a signature cut short", `${id}.${sig.slice(0, -1)}`],
    ["a signature made with another key", `${id}.${createHmac("sha256", OTHER_KEY).update(id).digest("base64url")}`],
    ["an id that is not 32 hex characters", `guest.${createHmac("sha256", KEY).update("guest").digest("base64url")}`],
  ];
  for (const [name, value] of refused) {
    check(`refused: ${name}`, guestIdFromCookie(value) === null, String(value));
  }
});

withEnv("production", KEY, () => {
  const id = newGuestId();
  const cookie = guestCookieValue(id)!;
  withEnv("production", OTHER_KEY, () =>
    check("changing the key retires every cookie signed with the old one", guestIdFromCookie(cookie) === null)
  );
});

withEnv("production", undefined, () => {
  check("production with no key: guest mode is off", !guestModeAvailable());
  check("production with no key: nothing is signed", guestCookieValue(newGuestId()) === null);
  const devCookie = withEnv("development", undefined, () => guestCookieValue(newGuestId())!);
  check("production with no key: a development cookie proves nothing", guestIdFromCookie(devCookie) === null, devCookie);
});

withEnv("production", "too-short", () =>
  check("production with a key under 32 characters: guest mode is off", !guestModeAvailable())
);

withEnv("development", undefined, () =>
  check("development works with no key set", guestModeAvailable() && guestIdFromCookie(guestCookieValue("0".repeat(32))!) === "0".repeat(32))
);

if (failures > 0) {
  console.error(`${failures} guest cookie check(s) failed.`);
  process.exit(1);
}
console.log(
  "All guest cookie checks passed (only this server's signature on exactly that id is accepted; production with no key accepts nothing)."
);
