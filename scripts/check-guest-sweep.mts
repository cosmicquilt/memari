// What the guest sweep takes, and what it leaves.
//
// WHY THIS EXISTS. The sweep is the only code in this app that deletes
// somebody's work without being asked, and its rule ("once the guest has no
// journals left, and the thing itself has sat as long") has to be re-applied
// BY HAND to every new kind of row. Calendars and their events arrived on
// 2026-09-27 and were not added, so a guest's feed address and every event on
// it would have stayed in the database for ever after their journals went.
//
// Nothing failed. It was noticed while checking whether a sentence written on
// the privacy page was true, which is not a process that can be relied on.
// Hence this: a check that names each kind of row, so the next one added is
// either here or conspicuously absent.
//
//   npm run check:guest-sweep

import "./appUnderTest.mjs";

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

const DAY_MS = 86_400_000;

async function main() {
  const { prisma } = await import("../src/lib/prisma.js");
  const { sweepIdleGuests } = await import("../src/lib/guestSweep.js");
  const { GUEST_IDLE_DAYS } = await import("../src/lib/guest.js");

  // Three guests, distinguishable from any real one.
  const tag = `sweeptest${Date.now().toString(36)}`;
  const abandoned = `guest:${tag}aaaa`;
  const active = `guest:${tag}bbbb`;
  const fresh = `guest:${tag}cccc`;
  const account = `user_${tag}`;

  const old = new Date(Date.now() - (GUEST_IDLE_DAYS + 5) * DAY_MS);
  /** A saved page's stored size. A Planner carries none - its pages do. */
  const page = {
    pageCount: 1,
    widthPx: 2100,
    heightPx: 3000,
    gridColumns: 24,
    gridRows: 34,
    gridGapPx: 12,
    marginPx: 150,
  };

  /** A planner, then back-dated: `updatedAt` is @updatedAt, so it cannot be
   *  set on create - anything written here is stamped now. */
  const planner = async (ownerId: string, when: Date) => {
    const row = await prisma.planner.create({ data: { ownerId, title: "Sweep test" } });
    await prisma.$executeRaw`UPDATE "Planner" SET "updatedAt" = ${when} WHERE id = ${row.id}`;
    return row;
  };
  const calendar = async (ownerId: string, when: Date) => {
    const row = await prisma.calendar.create({
      data: { ownerId, name: "Sweep test", colour: "#cfe3ff", source: "ics", externalId: `https://example.com/${ownerId}.ics` },
    });
    await prisma.calendarEvent.create({
      data: {
        ownerId,
        calendarId: row.id,
        title: "Something private",
        startsAt: new Date("2026-01-01T09:00:00Z"),
        endsAt: new Date("2026-01-01T10:00:00Z"),
        externalId: `e-${ownerId}`,
      },
    });
    await prisma.$executeRaw`UPDATE "Calendar" SET "updatedAt" = ${when} WHERE id = ${row.id}`;
    return row;
  };
  const savedPage = async (ownerId: string, when: Date) => {
    const row = await prisma.savedPage.create({
      data: { ownerId, name: "Sweep test", content: [], ...page },
    });
    await prisma.$executeRaw`UPDATE "SavedPage" SET "updatedAt" = ${when} WHERE id = ${row.id}`;
    return row;
  };

  try {
    // ABANDONED: an idle journal, an idle calendar, an idle saved page. All go.
    await planner(abandoned, old);
    const goneCalendar = await calendar(abandoned, old);
    const goneSaved = await savedPage(abandoned, old);

    // ACTIVE: an idle calendar and saved page, but a journal still in use.
    // The rule is "no journals left", so both must stay - a guest who is
    // still here must not lose the calendar they subscribed to months ago
    // and have not touched since.
    await planner(active, new Date());
    const keptCalendar = await calendar(active, old);
    const keptSaved = await savedPage(active, old);

    // FRESH: everything recent. Nothing goes.
    const freshCalendar = await calendar(fresh, new Date());

    // AN ACCOUNT, not a guest, with everything idle. Never swept, whatever
    // its age - this is the clause that stops the sweep from one day eating
    // paying customers' work.
    const accountCalendar = await calendar(account, old);
    await savedPage(account, old);

    const result = await sweepIdleGuests();
    console.log(`  swept: ${JSON.stringify(result)}`);

    const exists = async (kind: "calendar" | "savedPage" | "planner", id: string) =>
      kind === "calendar"
        ? (await prisma.calendar.findUnique({ where: { id } })) !== null
        : kind === "savedPage"
          ? (await prisma.savedPage.findUnique({ where: { id } })) !== null
          : (await prisma.planner.findUnique({ where: { id } })) !== null;

    check((await prisma.planner.count({ where: { ownerId: abandoned } })) === 0, "an abandoned guest's journals go");
    check(!(await exists("savedPage", goneSaved.id)), "and their saved pages go");
    // THE ONE THAT WAS MISSING. A subscribed calendar holds a feed address -
    // a credential - and every event read from it.
    check(!(await exists("calendar", goneCalendar.id)), "AND THEIR CALENDARS GO, address and all");
    check(
      (await prisma.calendarEvent.count({ where: { ownerId: abandoned } })) === 0,
      "and the events on them go with them, rather than being orphaned"
    );

    check(await exists("calendar", keptCalendar.id), "a guest still using their journals keeps an untouched calendar");
    check(await exists("savedPage", keptSaved.id), "and their untouched saved pages");
    check(await exists("calendar", freshCalendar.id), "a brand new guest's calendar is left alone");
    check(await exists("calendar", accountCalendar.id), "AN ACCOUNT IS NEVER SWEPT, however idle");
    check(
      (await prisma.savedPage.count({ where: { ownerId: account } })) === 1,
      "nor are an account's saved pages"
    );

    // EVERY KIND OF ROW A GUEST CAN OWN is named above. If a new one is added
    // to the schema and not to the sweep, this is where it should have been.
    check(
      result.journals >= 1 && result.calendars >= 1 && result.savedPages >= 1,
      `the sweep reports what it took: ${JSON.stringify(result)}`
    );
  } finally {
    for (const ownerId of [abandoned, active, fresh, account]) {
      await prisma.calendar.deleteMany({ where: { ownerId } });
      await prisma.savedPage.deleteMany({ where: { ownerId } });
      await prisma.savedModule.deleteMany({ where: { ownerId } });
      await prisma.planner.deleteMany({ where: { ownerId } });
    }
    await prisma.$disconnect();
  }
}

try {
  await main();
} catch (error) {
  console.error(`  ${(error as Error).stack ?? (error as Error).message}`);
  failures++;
}

// SABOTAGES THAT TURN IT RED:
//
//   * drop calendars from the sweep (what the code did until 2026-09-28)
//     -> "AND THEIR CALENDARS GO"
//   * sweep on idleness alone, without the no-journals-left test
//     -> the "still using their journals" cases
//   * drop the `startsWith(GUEST_OWNER_PREFIX)` filter
//     -> "AN ACCOUNT IS NEVER SWEPT"

console.log(
  failures === 0
    ? "\nThe sweep takes an abandoned guest's journals, saved items and calendars - events and feed address included - and leaves everything belonging to a guest still using the app, or to an account."
    : `\n${failures} problem(s).`
);
process.exit(failures === 0 ? 0 : 1);
