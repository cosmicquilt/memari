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

import { ensureServer, makeGuestJournal, disconnect } from "./appUnderTest.mjs";

const baseArg = process.argv.indexOf("--base");
const explicitBase = baseArg === -1 ? undefined : process.argv[baseArg + 1];

let failures = 0;
const check = (ok: boolean, message: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${message}`);
  if (!ok) failures++;
};

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

let stopServer: () => void = () => {};

async function main() {
  const server = await ensureServer(explicitBase);
  stopServer = server.stop;
  console.log(`Base: ${server.base}${server.started ? " (started here)" : " (already running)"}\n`);

  const guest = await makeGuestJournal("Route check journal");
  const { cookie } = guest;
  const BASE = server.base;
  // A journal's address is its words since 2026-10-04 (journalSlug.ts); its
  // id is the old address, which now redirects there.
  const { prisma } = await import("../src/lib/prisma.js");
  const slug = (await prisma.planner.findUnique({ where: { id: guest.journalId }, select: { slug: true } }))?.slug;
  if (!slug) throw new Error("A new journal was made without its address in words (slug).");
  const journal = { id: guest.journalId, slug };
  // Somebody else's journal: its real words must be a 404 to this guest.
  const stranger = await makeGuestJournal("Route check stranger");
  const strangerSlug = (await prisma.planner.findUnique({ where: { id: stranger.journalId }, select: { slug: true } }))?.slug ?? "";

  const routes: Expectation[] = [
    // "/" IS the landing page now, for everyone, signed in or not (the
    // landing session, 2026-09-25). It used to redirect to sign-in and this
    // row used to expect that, with a comment saying "200 here would mean
    // someone built one". Someone did, and this is the row that noticed -
    // the first time the check ever started its own dev server, since every
    // run before that had found one already on :3000.
    { path: "/", expect: [200], as: "nobody", what: "the landing page" },
    { path: "/privacy", expect: [200], as: "nobody", what: "privacy (Google fetches this one itself)" },
    { path: "/terms", expect: [200], as: "nobody", what: "terms" },
    { path: "/sign-in", expect: [200], as: "nobody", what: "sign-in" },
    { path: "/guest", expect: [303], as: "nobody", what: "GET /guest redirects rather than minting a guest" },
    { path: "/app", expect: [307, 302, 303], as: "nobody", what: "/app with no cookie is sent to sign-in" },
    { path: "/app", expect: [200], as: "guest", what: "the start dialog" },
    { path: `/app/j/${journal.slug}`, expect: [200], as: "guest", what: "A JOURNAL PAGE, at its words - the route 2598cc1 broke" },
    { path: `/app/j/${journal.id}`, expect: [307, 308], as: "guest", what: "an old id address redirects to the words" },
    { path: "/app/j/not-a-real-journal", expect: [404], as: "guest", what: "an unknown journal is 404, not 500" },
    { path: "/app/j/frosty-otter-1234", expect: [404], as: "guest", what: "words that are no journal of yours are 404" },
    { path: `/app/j/${strangerSlug}`, expect: [404], as: "guest", what: "ANOTHER PERSON'S journal, by its words, is 404 - as if it did not exist" },
    { path: `/app/j/${journal.slug}`, expect: [307, 302, 303], as: "nobody", what: "a journal's words with no cookie are sent to sign-in" },
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
    await guest.remove();
    await stranger.remove();
  }
}

try {
  await main();
} catch (error) {
  console.error(`  ${(error as Error).message}`);
  failures++;
} finally {
  stopServer();
  await disconnect();
}

console.log(failures === 0 ? "\nEvery route answered." : `\n${failures} problem(s).`);
process.exit(failures === 0 ? 0 : 1);
