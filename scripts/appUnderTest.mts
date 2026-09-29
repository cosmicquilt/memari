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
  // `shell: true` ON WINDOWS, and it is not optional. Node 20 stopped
  // spawning `.cmd` files directly (the fix for CVE-2024-27980) and throws
  // EINVAL instead, so this whole branch failed the first time it ever ran -
  // every earlier run found a dev server already on :3000 and returned above
  // without reaching it. A fallback nobody has taken is a fallback nobody has
  // tested. The arguments here are fixed literals, so the usual objection to
  // a shell - that an argument could carry one - does not apply.
  const server: ChildProcess = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "dev", "--port", String(OWN_PORT)],
    {
      stdio: "ignore",
      detached: process.platform !== "win32",
      shell: process.platform === "win32",
      env: process.env,
    }
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
  /** Deletes the journal (its pages and modules cascade), and the guest's
   *  calendars and settings. */
  remove: () => Promise<void>;
  /** Forgets the guest's settings - their default time zone - so the next
   *  open is a first visit again. */
  forgetSettings: () => Promise<void>;
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
      // Everything the checks make for this guest, not just the journal: the
      // browser check adds events (which make a calendar) and opening a
      // journal seeds a default time zone. Events cascade from calendars.
      await prisma.planner.deleteMany({ where: { ownerId } });
      await prisma.calendar.deleteMany({ where: { ownerId } });
      await prisma.ownerSettings.deleteMany({ where: { ownerId } });
    },
    forgetSettings: async () => {
      await prisma.ownerSettings.deleteMany({ where: { ownerId } });
    },
  };
}

export type SpineSpread = {
  /** The weekly spread, left page first: each page's hours and what is under
   *  them, top to bottom, with each module's own minimum. */
  pages: Array<{ spineId: string; followers: Array<{ id: string; slug: string; minRowSpan: number }> }>;
  gridRows: number;
  /** Every other hourly grid in the book, and its span - none of which a
   *  drag on the weekly spread may move. */
  elsewhere: Array<{ id: string; rowSpan: number }>;
};

/**
 * The spread Andrew reported on 2026-09-29, built on a journal: increments
 * off, and a Habits tracker at its minimum under the right-hand to-do.
 *
 * Written the way the app stores it - the setting on every hourly grid in
 * the book, the tracker a row of its own with its schema defaults - so the
 * editor opens it exactly as it would have opened his.
 */
export async function incrementsOffSpread(journalId: string): Promise<SpineSpread> {
  const { prisma } = await import("../src/lib/prisma.js");
  const { getMinRowSpanForSlug } = await import("../src/lib/moduleMinRowSpan.js");
  const { moduleSchemaDefaults } = await import("../src/lib/moduleRegistry.js");

  const load = () =>
    prisma.page.findMany({
      where: { plannerId: journalId },
      orderBy: { position: "asc" },
      include: { moduleInstances: { include: { moduleType: true } } },
    });
  const gridOf = (page: Awaited<ReturnType<typeof load>>[number]) => ({
    widthPx: page.widthPx,
    heightPx: page.heightPx,
    gridColumns: page.gridColumns,
    gridRows: page.gridRows,
    boxInsetPx: page.gridGapPx / 2,
    marginPx: page.marginPx,
  });

  let pages = await load();
  for (const page of pages) {
    for (const mi of page.moduleInstances) {
      if (mi.moduleType.slug !== "hourly-grid-core") continue;
      await prisma.moduleInstance.update({
        where: { id: mi.id },
        data: { propValues: { ...((mi.propValues as object) ?? {}), intervalMode: "off" } },
      });
    }
  }

  const weekly = () => pages.filter((p) => p.level === "WEEKLY" && p.variantKey === null);
  const followersOf = (page: (typeof pages)[number]) => {
    const spine = page.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
    if (!spine || spine.rowStart === null) throw new Error(`no hours on the ${page.level} page at ${page.position}`);
    const end = spine.rowStart + spine.rowSpan;
    const followers = page.moduleInstances
      .filter(
        (mi) =>
          !mi.locked &&
          mi.columnStart === spine.columnStart &&
          mi.columnSpan === spine.columnSpan &&
          mi.rowStart !== null &&
          mi.rowStart >= end
      )
      .sort((a, b) => (a.rowStart as number) - (b.rowStart as number));
    return { spine, followers };
  };
  if (weekly().length !== 2) throw new Error(`expected a two-page weekly spread, found ${weekly().length} page(s)`);

  // Habits under the right-hand to-do, at its minimum, the to-do giving up
  // the rows.
  const right = weekly()[1];
  const { spine, followers } = followersOf(right);
  const last = followers[followers.length - 1];
  if (!last) throw new Error("nothing under the right page's hours to put Habits beneath");
  const habitType = await prisma.moduleType.findUnique({ where: { slug: "habit-tracker" } });
  if (!habitType) throw new Error("no habit-tracker module type in the database");
  const habitProps = moduleSchemaDefaults("habit-tracker");
  const habitFloor = getMinRowSpanForSlug("habit-tracker", gridOf(right), spine.columnSpan as number, habitProps);
  const lastFloor = getMinRowSpanForSlug(last.moduleType.slug, gridOf(right), last.columnSpan as number, (last.propValues as Record<string, unknown>) ?? {});
  if (last.rowSpan - habitFloor < lastFloor) throw new Error(`the right to-do (${last.rowSpan} rows) cannot make room for Habits (${habitFloor})`);
  await prisma.moduleInstance.update({ where: { id: last.id }, data: { rowSpan: last.rowSpan - habitFloor } });
  await prisma.moduleInstance.create({
    data: {
      pageId: right.id,
      moduleTypeId: habitType.id,
      placementMode: "GRID",
      columnStart: spine.columnStart,
      columnSpan: spine.columnSpan,
      rowStart: (last.rowStart as number) + last.rowSpan - habitFloor,
      rowSpan: habitFloor,
      propValues: habitProps as object,
    },
  });

  // And NO GAP under the LEFT page's hours: its to-do moved up flush with
  // them, keeping its own bottom edge. Andrew's book is like that - found
  // 2026-09-29, hours rows 0-12 and the to-do from row 12 - and the edge's
  // grab strip, which assumed the one-row gap the template leaves, covered
  // the to-do's header. The right page keeps the template's gap, so both
  // are in play.
  {
    const left = weekly()[0];
    const { spine: leftSpine, followers: leftFollowers } = followersOf(left);
    const first = leftFollowers[0];
    const end = (leftSpine.rowStart as number) + leftSpine.rowSpan;
    if (first && (first.rowStart as number) > end) {
      await prisma.moduleInstance.update({
        where: { id: first.id },
        data: { rowStart: end, rowSpan: first.rowSpan + ((first.rowStart as number) - end) },
      });
    }
  }

  pages = await load();
  const spreadIds = new Set(weekly().map((p) => p.id));
  return {
    pages: weekly().map((page) => {
      const { spine: s, followers: f } = followersOf(page);
      return {
        spineId: s.id,
        followers: f.map((mi) => ({
          id: mi.id,
          slug: mi.moduleType.slug,
          minRowSpan: getMinRowSpanForSlug(mi.moduleType.slug, gridOf(page), mi.columnSpan as number, (mi.propValues as Record<string, unknown>) ?? {}),
        })),
      };
    }),
    gridRows: weekly()[0].gridRows,
    elsewhere: pages
      .filter((p) => !spreadIds.has(p.id))
      .flatMap((p) => p.moduleInstances.filter((mi) => mi.moduleType.slug === "hourly-grid-core"))
      .map((mi) => ({ id: mi.id, rowSpan: mi.rowSpan })),
  };
}

/**
 * Closes the gap under one weekly page's hours: its first module moved up
 * flush against them, keeping its own bottom edge. A state the app used to
 * leave behind - a stack placed with increments ON can sit flush - and the
 * one that made a spread's two stacks start on different rows.
 */
export async function flushUnderHours(journalId: string, position = 0): Promise<void> {
  const { prisma } = await import("../src/lib/prisma.js");
  const page = await prisma.page.findFirst({
    where: { plannerId: journalId, level: "WEEKLY", variantKey: null, position },
    include: { moduleInstances: { include: { moduleType: true } } },
  });
  const hours = page?.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
  if (!page || !hours || hours.rowStart === null) throw new Error("no weekly hours to close the gap under");
  const end = hours.rowStart + hours.rowSpan;
  const first = page.moduleInstances
    .filter((mi) => !mi.locked && mi.columnStart === hours.columnStart && mi.columnSpan === hours.columnSpan && (mi.rowStart ?? -1) >= end)
    .sort((a, b) => (a.rowStart as number) - (b.rowStart as number))[0];
  if (!first || first.rowStart === end) return;
  await prisma.moduleInstance.update({
    where: { id: first.id },
    data: { rowStart: end, rowSpan: first.rowSpan + ((first.rowStart as number) - end) },
  });
}

/** Every module of a journal, by slug, with its stored props - for checking
 *  what a save actually wrote. */
export async function storedModules(journalId: string): Promise<Array<{ id: string; slug: string; level: string; propValues: Record<string, unknown> }>> {
  const { prisma } = await import("../src/lib/prisma.js");
  const rows = await prisma.moduleInstance.findMany({
    where: { page: { plannerId: journalId } },
    select: { id: true, propValues: true, moduleType: { select: { slug: true } }, page: { select: { level: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.moduleType.slug,
    level: r.page.level,
    propValues: (r.propValues as Record<string, unknown>) ?? {},
  }));
}

/** The spans and starts of some module rows, as stored. */
export async function storedRows(
  ids: string[]
): Promise<Record<string, { rowStart: number | null; rowSpan: number; pageId: string; columnStart: number | null; columnSpan: number }>> {
  const { prisma } = await import("../src/lib/prisma.js");
  const rows = await prisma.moduleInstance.findMany({
    where: { id: { in: ids } },
    select: { id: true, rowStart: true, rowSpan: true, pageId: true, columnStart: true, columnSpan: true },
  });
  return Object.fromEntries(
    rows.map((r) => [r.id, { rowStart: r.rowStart, rowSpan: r.rowSpan, pageId: r.pageId, columnStart: r.columnStart, columnSpan: r.columnSpan }])
  );
}

/** Close the database connection the two helpers above opened. */
export async function disconnect(): Promise<void> {
  const { prisma } = await import("../src/lib/prisma.js");
  await prisma.$disconnect();
}
