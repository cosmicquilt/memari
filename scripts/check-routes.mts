// Every route, fetched, with the status read.
//
// WHY THIS EXISTS. On 2026-09-22 `2598cc1` broke server rendering of every
// journal page and it shipped, because the page LOOKED FINE. `expandedHeight`
// in TimelineDrawer reads `window.innerHeight`, and it was reachable only
// above the resting height, which the server never rendered. Moving the
// content floor down to the new compact detent - correct on its own terms -
// made the server reach it, and `/app/j/<id>` began throwing `window is not
// defined` on the server. React then rendered the page on the client, so the
// modules were there, the timeline was there, a screenshot showed nothing,
// and every check in this repo stayed green. The only visible trace was the
// HTTP status.
//
// NOTHING HERE READ A STATUS. Twenty-odd checks measure geometry, layout,
// levels, PDFs and saved items - all of them by calling functions. Not one
// asked the running app for a page. So this check is deliberately dumb: boot
// the app, ask for each route as a real browser would, and look at the number
// that comes back. It catches the whole class - a missing env var, a Prisma
// error, a bad import, a server component throwing - rather than the one bug
// that prompted it.
//
// It is also the only check that needs the app RUNNING, which is why it is
// not in `npm test`. Run it before a push that touches rendering:
//
//   npm run check:routes          uses the dev server on :3000 if one is up,
//                                 otherwise starts its own on :3210
//   npm run check:routes -- --base http://localhost:4000      somewhere else
//
// SABOTAGED 2026-09-22, and it bites: deleting the `typeof window` guard from
// TimelineDrawer's `expandedHeight` - which is precisely `2598cc1` - turns
// `/app/j/<id>` red at 500 and leaves the other nine green. Restoring it
// returns 0. The guest half cannot silently no-op either: `/app` is listed
// twice, once with the cookie expecting 200 and once without expecting 307,
// so a cookie that stopped working would fail the first row rather than
// quietly checking a signed-out page.
//
// NOT a replacement for looking at the page. A route that returns 200 and
// renders garbage passes this. It answers one question - did the server
// manage to render it at all - which is exactly the question nothing was
// asking.

import { readFileSync } from "node:fs";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { prisma } = await import("../src/lib/prisma.js");
const { createBookFor, validateNewJournal } = await import("../src/app/planner/bookSeeding.js");
const { GUEST_COOKIE, guestCookieValue, newGuestId, guestModeAvailable } = await import("../src/lib/guest.js");

// Next 16 refuses to start a second dev server for the same directory, and
// the usual state of this machine is one already running on 3000. So: use
// whatever is up, and only boot one if nothing is.
const RUNNING_PORT = 3000;
const OWN_PORT = 3210;
const baseArg = process.argv.indexOf("--base");
let BASE = baseArg === -1 ? `http://localhost:${RUNNING_PORT}` : process.argv[baseArg + 1];

let failures = 0;
const check = (ok: boolean, message: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${message}`);
  if (!ok) failures++;
};

// Guest mode is how this check reaches the signed-in half of the app without
// a password. Without the secret there is no way in, and a check that
// silently skipped the journal page would be worse than one that stops.
if (!guestModeAvailable()) {
  console.error(
    "GUEST_COOKIE_SECRET is not set, so this check cannot open a journal.\n" +
      "Add a throwaway value to .env - see handoff/HANDOFF.md."
  );
  process.exit(1);
}

const THROWAWAY_TITLE = "Route check journal";
const guestId = newGuestId();
const ownerId = `guest:${guestId}`;
const cookie = `${GUEST_COOKIE}=${guestCookieValue(guestId)}`;

let server: ChildProcess | null = null;

/** Kill the dev server and everything it spawned. `next dev` runs its
 *  compiler in a child, and on Windows killing the parent orphans it, which
 *  leaves the port held and the next run failing for the wrong reason. */
function stopServer() {
  if (!server?.pid) return;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-server.pid, "SIGKILL");
    }
  } catch {
    /* already gone */
  }
  server = null;
}

/** Knock on /privacy: static, no database, no auth, so an answer means the
 *  server is listening and able to compile. */
async function answers(base: string): Promise<boolean> {
  try {
    const response = await fetch(`${base}/privacy`, { redirect: "manual" });
    return response.status > 0;
  } catch {
    return false;
  }
}

async function waitForReady(base: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await answers(base)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

type Expectation = {
  path: string;
  /** Statuses that mean the server did its job. */
  expect: number[];
  as: "guest" | "nobody";
  method?: "GET";
  what: string;
};

/** React can recover from a throw inside a client component by finishing the
 *  render on the browser, so a page that failed on the server does not always
 *  come back 5xx. The body is read as well for the strings that only a failed
 *  render leaves behind.
 *
 *  ONLY ON A 200. Next's own `redirect()` and `notFound()` work by throwing,
 *  and their responses carry `__next_error__` in the body as a matter of
 *  course - the first run of this check failed three healthy routes on it.
 *  That marker is gone; a digest on a page that claims to have rendered is
 *  what is left. */
const ERROR_MARKERS = [
  "window is not defined",
  "document is not defined",
  "Internal Server Error",
  "Application error: a server-side exception",
];

async function main() {
  if (baseArg === -1 && !(await answers(BASE))) {
    BASE = `http://localhost:${OWN_PORT}`;
    console.log(`Nothing on :${RUNNING_PORT}; starting next dev on :${OWN_PORT} ...`);
    server = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "--port", String(OWN_PORT)], {
      stdio: "ignore",
      detached: process.platform !== "win32",
      env: process.env,
    });
    if (!(await waitForReady(BASE, 180_000))) {
      console.error(`The dev server never answered on :${OWN_PORT}.`);
      failures++;
      return;
    }
  }
  console.log(`Base: ${BASE}${server ? " (started here)" : " (already running)"}\n`);

  // A real journal, made the way the start dialog makes one, owned by the
  // guest whose cookie we carry. Every level, so the journal page renders
  // the timeline at each level - which is where the SSR fault was.
  const journal = await createBookFor(
    ownerId,
    validateNewJournal({
      title: THROWAWAY_TITLE,
      trim: "bound7x10",
      startISO: "2026-01-01",
      endISO: "2026-03-31",
      levels: ["JOURNAL", "MONTHLY", "WEEKLY", "DAILY"],
      dated: true,
      weekStartDay: 0,
      font: "serif",
    })
  );

  const routes: Expectation[] = [
    // "/" is a redirect on purpose and always has been - src/app/page.tsx
    // sends everyone to /app or to sign-in, and is kept free for the landing
    // page Andrew has in mind. 200 here would mean someone built one.
    { path: "/", expect: [307, 302, 303], as: "nobody", what: "the front door redirects" },
    { path: "/privacy", expect: [200], as: "nobody", what: "privacy (Google fetches this one itself)" },
    { path: "/terms", expect: [200], as: "nobody", what: "terms" },
    { path: "/sign-in", expect: [200], as: "nobody", what: "sign-in" },
    { path: "/guest", expect: [303], as: "nobody", what: "GET /guest redirects rather than minting a guest" },
    { path: "/app", expect: [307, 302, 303], as: "nobody", what: "/app with no cookie is sent to sign-in" },
    { path: "/app", expect: [200], as: "guest", what: "the start dialog" },
    { path: `/app/j/${journal.id}`, expect: [200], as: "guest", what: "A JOURNAL PAGE - the route 2598cc1 broke" },
    { path: "/app/j/not-a-real-journal", expect: [404], as: "guest", what: "an unknown journal is 404, not 500" },
    { path: `/app/export?journal=${journal.id}`, expect: [200], as: "guest", what: "the PDF export" },
  ];

  try {
    for (const route of routes) {
      const headers: Record<string, string> = route.as === "guest" ? { cookie } : {};
      let status = 0;
      let body = "";
      try {
        const response = await fetch(`${BASE}${route.path}`, { headers, redirect: "manual" });
        status = response.status;
        // A PDF is not worth reading into memory to grep for words.
        const type = response.headers.get("content-type") ?? "";
        body = type.includes("html") ? await response.text() : "";
      } catch (error) {
        check(false, `${route.path} - ${route.what}: fetch failed (${(error as Error).message})`);
        continue;
      }

      const label = `${route.path} [${route.as}] - ${route.what}`;
      check(
        route.expect.includes(status),
        `${label}: ${status}${route.expect.includes(status) ? "" : ` (wanted ${route.expect.join(" or ")})`}`
      );

      if (status === 200) {
        const marker = ERROR_MARKERS.find((m) => body.includes(m));
        if (marker) check(false, `${label}: answered 200, but the HTML contains "${marker}"`);
      }
    }
  } finally {
    await prisma.planner.deleteMany({ where: { ownerId } });
  }
}

try {
  await main();
} finally {
  stopServer();
  await prisma.$disconnect();
}

console.log(failures === 0 ? "\nEvery route answered." : `\n${failures} problem(s).`);
process.exit(failures === 0 ? 0 : 1);
