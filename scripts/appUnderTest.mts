// Starting the real app, and getting inside it as a guest.
//
// Extracted from check-routes.mts when check-browser.mts turned out to need
// exactly the same three things - a server on a known port, a signed guest
// cookie, and a real journal to look at. "How you start the app under test",
// written twice, is this project's oldest defect shape, and the two copies
// would drift the first time a port or a cookie name moved.
//
// Nothing in here asserts anything. It gets a caller to the point where it
// can start measuring, and cleans up after.

import { readFileSync } from "node:fs";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";

// .env FIRST, at module load. prisma.ts and guest.ts both read process.env
// when they are first evaluated, so anything that imports them has to come
// after this - which is why they are dynamic imports below rather than
// static ones at the top.
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

/** The port a dev server is usually already on while working. */
export const RUNNING_PORT = 3000;
/** Where to start one if it is not. Next 16 refuses a second dev server for
 *  the same directory, so a check that always started its own would fail
 *  whenever somebody had the app open. */
export const OWN_PORT = 3210;

/** Knock on /privacy: static, no database, no auth, so an answer means the
 *  server is listening and able to compile. */
export async function answers(base: string): Promise<boolean> {
  try {
    const response = await fetch(`${base}/privacy`, { redirect: "manual" });
    return response.status > 0;
  } catch {
    return false;
  }
}

export type AppServer = {
  base: string;
  /** True when this call started it, so the caller can say so. */
  started: boolean;
  stop: () => void;
};

/**
 * A server to test against: whatever is already up, or a new one.
 *
 * @param explicitBase from a `--base` argument; used as-is, never stopped.
 */
export async function ensureServer(explicitBase?: string): Promise<AppServer> {
  if (explicitBase) {
    return { base: explicitBase, started: false, stop: () => {} };
  }

  const running = `http://localhost:${RUNNING_PORT}`;
  if (await answers(running)) return { base: running, started: false, stop: () => {} };

  const base = `http://localhost:${OWN_PORT}`;
  const server: ChildProcess = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "dev", "--port", String(OWN_PORT)],
    { stdio: "ignore", detached: process.platform !== "win32", env: process.env }
  );

  // `next dev` runs its compiler in a child, and on Windows killing only the
  // parent orphans it - which holds the port and fails the NEXT run for a
  // reason that has nothing to do with the code.
  const stop = () => {
    if (!server.pid) return;
    try {
      if (process.platform === "win32") {
        execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(-server.pid, "SIGKILL");
      }
    } catch {
      /* already gone */
    }
  };

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await answers(base)) return { base, started: true, stop };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stop();
  throw new Error(`The dev server never answered on :${OWN_PORT}.`);
}

export type GuestJournal = {
  /** Ready for a `cookie:` header. */
  cookie: string;
  /** The cookie's name and value apart, for a browser that sets them that way. */
  cookieName: string;
  cookieValue: string;
  ownerId: string;
  journalId: string;
  /** Deletes the journal. Its pages and modules cascade. */
  remove: () => Promise<void>;
};

/**
 * A guest, and a real journal for them to open.
 *
 * Guest mode is how a check reaches the signed-in half of the app without a
 * password. The journal is made the way the start dialog makes one - through
 * createBookFor, the same function the Create action calls once it knows who
 * is asking - rather than by inserting rows, so a check is looking at a
 * journal the app itself would have built.
 */
export async function makeGuestJournal(title: string): Promise<GuestJournal> {
  const { GUEST_COOKIE, guestCookieValue, newGuestId, guestModeAvailable } = await import(
    "../src/lib/guest.js"
  );
  if (!guestModeAvailable()) {
    throw new Error(
      "GUEST_COOKIE_SECRET is not set, so this check cannot open a journal.\n" +
        "Add a throwaway value to .env - see handoff/HANDOFF.md."
    );
  }
  const { prisma } = await import("../src/lib/prisma.js");
  const { createBookFor, validateNewJournal } = await import("../src/app/planner/bookSeeding.js");

  const guestId = newGuestId();
  const ownerId = `guest:${guestId}`;
  const cookieValue = guestCookieValue(guestId)!;

  // Every level, so a journal page renders the timeline at each of them.
  const journal = await createBookFor(
    ownerId,
    validateNewJournal({
      title,
      trim: "bound7x10",
      startISO: "2026-01-01",
      endISO: "2026-03-31",
      levels: ["JOURNAL", "MONTHLY", "WEEKLY", "DAILY"],
      dated: true,
      weekStartDay: 0,
      font: "serif",
    })
  );

  return {
    cookie: `${GUEST_COOKIE}=${cookieValue}`,
    cookieName: GUEST_COOKIE,
    cookieValue,
    ownerId,
    journalId: journal.id,
    remove: async () => {
      await prisma.planner.deleteMany({ where: { ownerId } });
    },
  };
}

/** Close the database connection the two helpers above opened. */
export async function disconnect(): Promise<void> {
  const { prisma } = await import("../src/lib/prisma.js");
  await prisma.$disconnect();
}
