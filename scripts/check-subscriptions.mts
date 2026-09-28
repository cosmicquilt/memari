// A subscribed calendar, synced onto a real journal.
//
// The parser and the fetch guard have their own pure tests. What neither can
// see is the JOIN: an upsert by UID against real rows, run twice, with the
// feed changing underneath it. That is where the quiet failures are:
//
//   * a re-read duplicating every event (new ids each time), which shows as a
//     week drawn twice over itself;
//   * a re-read giving events NEW IDS, which silently breaks the editor's hit
//     areas and any link to them;
//   * an event dropped from the feed staying on the page for ever;
//   * a cancelled event coming back;
//   * a hidden subscription still printing.
//
// So this makes a guest journal, writes the feed as rows the way a fetch
// would, and asks loadPlannerPages what got drawn - the same function the
// canvas, the timeline and the PDF go through.
//
// NO NETWORK. `applyFeed` is driven directly with a parsed feed, so this is
// about the upsert and the drawing, not about somebody's server being up. The
// fetching half is icsFetch.test.mts.
//
//   npm run check:subscriptions

import { makeGuestJournal, disconnect } from "./appUnderTest.mjs";

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

type Loaded = Awaited<ReturnType<typeof import("../src/app/planner/loadPlannerPages.js").loadPlannerPages>>;

const markIds = (loaded: Loaded): string[] =>
  loaded.pages.flatMap((page) => page.moduleInstances.flatMap((mi) => mi.elements.map((e) => e.id)));

const feed = (body: string) => body.replace(/\n/g, "\r\n");

async function main() {
  const { prisma } = await import("../src/lib/prisma.js");
  const { loadPlannerPages } = await import("../src/app/planner/loadPlannerPages.js");
  const { WITH_PAGES } = await import("../src/app/planner/bookSeeding.js");
  const { parseIcs } = await import("../src/lib/ics.js");
  const { applyFeed, ICS_SOURCE } = await import("../src/app/planner/calendarSubscriptions.js");

  const guest = await makeGuestJournal("Subscription check journal");
  const weekly = async (): Promise<Loaded> =>
    loadPlannerPages(
      await prisma.planner.findUniqueOrThrow({ where: { id: guest.journalId }, include: WITH_PAGES }),
      "WEEKLY"
    );

  try {
    // The days this book's own first week covers, asked of the page.
    const columns = (await weekly()).pages.flatMap((p) => p.renderContext?.columnDates ?? []);
    check(columns.length === 7, `the spread shows 7 dated columns, got ${columns.length}`);
    const dayA = columns[1]!;
    const dayB = columns[4]!;

    const calendar = await prisma.calendar.create({
      data: {
        ownerId: guest.ownerId,
        name: "Placeholder",
        colour: "#cfe3ff",
        source: ICS_SOURCE,
        externalId: "https://example.com/private-abc.ics",
      },
    });

    const build = (events: string) =>
      parseIcs(
        feed(`BEGIN:VCALENDAR
VERSION:2.0
X-WR-CALNAME:Work
${events}END:VCALENDAR`)
      );

    const standup = (day: string) => `BEGIN:VEVENT
UID:standup@example.com
DTSTART:${day.replace(/-/g, "")}T090000Z
DTEND:${day.replace(/-/g, "")}T093000Z
SUMMARY:Standup
END:VEVENT
`;
    const review = (day: string, extra = "") => `BEGIN:VEVENT
UID:review@example.com
DTSTART:${day.replace(/-/g, "")}T140000Z
DTEND:${day.replace(/-/g, "")}T150000Z
SUMMARY:Review
${extra}END:VEVENT
`;

    // --- FIRST SYNC ------------------------------------------------------
    const first = await applyFeed(guest.ownerId, calendar.id, "Work", build(standup(dayA) + review(dayB)));
    check(first.added === 2 && first.updated === 0 && first.removed === 0, `first sync should add 2, got ${JSON.stringify(first)}`);

    const rows = () =>
      prisma.calendarEvent.findMany({
        where: { calendarId: calendar.id },
        orderBy: { externalId: "asc" },
        select: { id: true, externalId: true, title: true, startsAt: true, deletedAt: true, origin: true },
      });
    const afterFirst = await rows();
    check(afterFirst.length === 2, `two rows after the first sync, got ${afterFirst.length}`);
    check(
      afterFirst.every((r) => r.origin === "IMPORTED"),
      "imported events should be marked IMPORTED, so they can be told from typed ones"
    );

    const drawn = markIds(await weekly());
    check(
      afterFirst.every((r) => drawn.some((id) => id.includes(`-ev${r.id}-box`))),
      "both subscribed events reached the page"
    );

    // --- A RE-READ OF THE SAME FEED CHANGES NOTHING ----------------------
    //
    // The one that matters most. Re-inserting instead of upserting would give
    // four rows, draw the week twice over itself, and hand every event a new
    // id - which breaks the editor's hit areas, since those are keyed by it.
    const again = await applyFeed(guest.ownerId, calendar.id, "Work", build(standup(dayA) + review(dayB)));
    check(again.added === 0 && again.removed === 0, `an unchanged re-read should add and remove nothing, got ${JSON.stringify(again)}`);
    const afterAgain = await rows();
    check(afterAgain.length === 2, `still two rows after a re-read, got ${afterAgain.length}`);
    check(
      afterAgain.map((r) => r.id).join(",") === afterFirst.map((r) => r.id).join(","),
      "THE IDS SURVIVED the re-read - a new id every sync breaks everything that points at an event"
    );

    // --- A CHANGE IN THE FEED IS A CHANGE HERE ---------------------------
    const moved = `BEGIN:VEVENT
UID:standup@example.com
DTSTART:${dayA.replace(/-/g, "")}T110000Z
DTEND:${dayA.replace(/-/g, "")}T113000Z
SUMMARY:Standup (moved)
END:VEVENT
`;
    await applyFeed(guest.ownerId, calendar.id, "Work", build(moved + review(dayB)));
    const afterMove = await rows();
    const standupRow = afterMove.find((r) => r.externalId === "standup@example.com")!;
    check(standupRow.title === "Standup (moved)", `the title should follow the feed, got "${standupRow.title}"`);
    check(
      standupRow.startsAt.toISOString() === `${dayA}T11:00:00.000Z`,
      `the time should follow the feed, got ${standupRow.startsAt.toISOString()}`
    );
    check(standupRow.id === afterFirst.find((r) => r.externalId === "standup@example.com")!.id, "and it kept its id");

    // --- GONE FROM THE FEED IS GONE FROM THE PAGE, BUT NOT FROM THE TABLE -
    const dropped = await applyFeed(guest.ownerId, calendar.id, "Work", build(moved));
    check(dropped.removed === 1, `dropping one event should remove 1, got ${dropped.removed}`);
    const reviewRow = (await rows()).find((r) => r.externalId === "review@example.com")!;
    check(reviewRow.deletedAt !== null, "an event gone from the feed should be tombstoned");
    check(
      !markIds(await weekly()).some((id) => id.includes(`-ev${reviewRow.id}-box`)),
      "and it should stop being drawn"
    );

    // --- AND IT COMES BACK IF THE FEED CHANGES ITS MIND ------------------
    const restored = await applyFeed(guest.ownerId, calendar.id, "Work", build(moved + review(dayB)));
    check(restored.added === 0, `a returning event should be an update, not an insert, got ${restored.added} added`);
    const backRow = (await rows()).find((r) => r.externalId === "review@example.com")!;
    check(backRow.deletedAt === null, "a returning event should be untombstoned");
    check(backRow.id === reviewRow.id, "and it should be the same row it always was");
    check(
      markIds(await weekly()).some((id) => id.includes(`-ev${backRow.id}-box`)),
      "and drawn again"
    );

    // --- STATUS:CANCELLED IS A TOMBSTONE ---------------------------------
    await applyFeed(guest.ownerId, calendar.id, "Work", build(moved + review(dayB, "STATUS:CANCELLED\n")));
    const cancelled = (await rows()).find((r) => r.externalId === "review@example.com")!;
    check(cancelled.deletedAt !== null, "a CANCELLED event should be tombstoned rather than left on the page");
    check(
      !markIds(await weekly()).some((id) => id.includes(`-ev${cancelled.id}-box`)),
      "and it should stop being drawn"
    );

    // --- HIDING THE SUBSCRIPTION ------------------------------------------
    await prisma.hiddenCalendar.create({ data: { plannerId: guest.journalId, calendarId: calendar.id } });
    check(
      markIds(await weekly()).every((id) => !/-ev|-allday-/.test(id)),
      "hiding a subscription takes its events off this journal"
    );
    await prisma.hiddenCalendar.deleteMany({ where: { plannerId: guest.journalId } });

    // --- THE FEED URL NEVER REACHES THE EDITOR ---------------------------
    //
    // A secret calendar address IS the authentication. Anything that sends it
    // to the browser publishes the calendar to anyone who opens dev tools.
    const loaded = await weekly();
    check(
      !JSON.stringify(loaded.calendars).includes("private-abc"),
      "THE FEED'S SECRET URL must not be in what the editor is handed"
    );
    check(
      !JSON.stringify(loaded.events).includes("private-abc"),
      "nor in the events"
    );
    const subscribed = loaded.calendars.find((c) => c.id === calendar.id);
    check(subscribed?.source === ICS_SOURCE, "the editor is told the calendar is a subscription, so it can show it read-only");
    check(subscribed?.eventCount === 1, `the editor is told how many events are on it, got ${subscribed?.eventCount}`);
    check(
      loaded.events.filter((e) => e.calendarId === calendar.id).every((e) => e.source === ICS_SOURCE),
      "and each event says where it came from"
    );

    // --- A SUBSCRIBED EVENT REFUSES TO BE EDITED -------------------------
    const { assertNotSubscribed } = await import("../src/app/planner/calendarSubscriptions.js");
    const live = (await rows()).find((r) => r.externalId === "standup@example.com")!;
    let refused = "";
    try {
      await assertNotSubscribed(live.id);
    } catch (error) {
      refused = (error as Error).message;
    }
    check(/subscribed calendar/i.test(refused), `editing a subscribed event should be refused, got "${refused}"`);

    // A typed event on a calendar of the owner's own is still editable - the
    // other half, without which the guard could simply refuse everything.
    const own = await prisma.calendar.create({
      data: { ownerId: guest.ownerId, name: "Mine", colour: "#ffe9b3" },
    });
    const typed = await prisma.calendarEvent.create({
      data: {
        ownerId: guest.ownerId,
        calendarId: own.id,
        title: "Typed",
        startsAt: new Date(`${dayA}T16:00:00.000Z`),
        endsAt: new Date(`${dayA}T17:00:00.000Z`),
      },
    });
    let threw = false;
    try {
      await assertNotSubscribed(typed.id);
    } catch {
      threw = true;
    }
    check(!threw, "an event typed here is still editable");
  } finally {
    await prisma.calendar.deleteMany({ where: { ownerId: guest.ownerId } });
    await guest.remove();
  }
}

try {
  await main();
} catch (error) {
  console.error(`  ${(error as Error).stack ?? (error as Error).message}`);
  failures++;
} finally {
  await disconnect();
}

// SABOTAGES THAT TURN IT RED:
//
//   * create instead of update in applyFeed          -> throws on the unique
//     key `[calendarId, externalId]` and the run exits non-zero. Note the
//     shape: the DATABASE refuses it before any clause here gets to, which is
//     the belt to this upsert's braces. It does not print a FAIL line, so
//     counting those alone says it passed - measured, and worth knowing about
//     every check in this repo.
//   * drop the `vanished` tombstoning                -> the gone-from-the-feed case
//   * set deletedAt only when cancelled, never null  -> the comes-back case
//   * select externalId in calendarsFor              -> the secret-URL case
//   * make assertNotSubscribed a no-op               -> the refusal case
//   * make it throw for everything                   -> the typed-event case

console.log(
  failures === 0
    ? "\nA subscribed feed syncs onto a real journal: re-reads keep every id, changes follow, gone and cancelled events are tombstoned and stop printing, a returning one comes back, and the feed's secret URL never leaves the server."
    : `\n${failures} problem(s).`
);
process.exit(failures === 0 ? 0 : 1);
