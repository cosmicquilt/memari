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
    check(again.added === 0 && again.removed === 0, `an unchanged re-read adds and removes nothing, got ${JSON.stringify(again)}`);
    // AND WRITES NOTHING AT ALL. Not a nicety: the first version rewrote
    // every row every time, which on a 317-event holiday feed measured 8.1
    // SECONDS, on the page-load path, inside a ten-second serverless budget.
    // `updated` counts rows that really changed, so this is the clause that
    // stops that coming back.
    check(
      again.updated === 0 && again.unchanged === 2,
      `an unchanged re-read must write NOTHING - ${again.updated} row(s) rewritten, ${again.unchanged} left alone`
    );
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
    // The other direction of the clause above: "write nothing" must not be
    // how it passes. One row moved, so exactly one row is written and the
    // other is left alone.
    const movedResult = await applyFeed(guest.ownerId, calendar.id, "Work", build(moved + review(dayB)));
    check(
      movedResult.updated === 0 && movedResult.unchanged === 2,
      `re-reading the same changed feed should settle to no writes, got ${JSON.stringify(movedResult)}`
    );

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
    const cancelling = await applyFeed(guest.ownerId, calendar.id, "Work", build(moved + review(dayB, "STATUS:CANCELLED\n")));
    check(cancelling.updated === 1, `cancelling one event should write one row, got ${cancelling.updated}`);
    // AN ALREADY-CANCELLED EVENT IS NOT A CHANGE. deletedAt is compared as a
    // presence, not as an instant - comparing the timestamp would make every
    // cancelled event count as changed on every sync for ever, which is the
    // 8 seconds back for any calendar with a cancellation in it.
    const cancelledAgain = await applyFeed(guest.ownerId, calendar.id, "Work", build(moved + review(dayB, "STATUS:CANCELLED\n")));
    check(
      cancelledAgain.updated === 0,
      `re-reading an already-cancelled event must write nothing, got ${cancelledAgain.updated}`
    );
    const cancelled = (await rows()).find((r) => r.externalId === "review@example.com")!;
    check(cancelled.deletedAt !== null, "a CANCELLED event should be tombstoned rather than left on the page");
    check(
      !markIds(await weekly()).some((id) => id.includes(`-ev${cancelled.id}-box`)),
      "and it should stop being drawn"
    );

    // --- ONE WEEK OF A SERIES MOVED, ANOTHER DELETED ---------------------
    //
    // What Google writes for a repeating meeting rescheduled once and
    // cancelled once. THIS IS THE CASE THAT BROKE: before the reader paired
    // exceptions with their series, the moved week came back as a second
    // event with the series' UID, and on the SECOND sync it overwrote the
    // whole series - rrule gone, every other week gone. So it is synced twice
    // here, on purpose, and the second sync is the one that matters.
    {
      const dayOf = (iso: string) => iso.replace(/-/g, "");
      const next = (iso: string, days: number) =>
        new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
      const series = `BEGIN:VEVENT
UID:weekly@example.com
DTSTART:${dayOf(dayA)}T080000Z
DTEND:${dayOf(dayA)}T083000Z
RRULE:FREQ=WEEKLY
EXDATE:${dayOf(next(dayA, 7))}T080000Z
SUMMARY:Weekly
END:VEVENT
BEGIN:VEVENT
UID:weekly@example.com
RECURRENCE-ID:${dayOf(dayA)}T080000Z
DTSTART:${dayOf(dayA)}T100000Z
DTEND:${dayOf(dayA)}T103000Z
SUMMARY:Weekly (moved)
END:VEVENT
`;
      const withSeries = build(moved + review(dayB) + series);
      await applyFeed(guest.ownerId, calendar.id, "Work", withSeries);
      const secondSync = await applyFeed(guest.ownerId, calendar.id, "Work", withSeries);

      const stored = await prisma.calendarEvent.findFirst({
        where: { calendarId: calendar.id, externalId: "weekly@example.com" },
        include: { overrides: true },
      });
      check(
        stored?.rrule === "FREQ=WEEKLY" && stored.title === "Weekly",
        `AFTER A SECOND SYNC the series is still the series - rule ${stored?.rrule}, title "${stored?.title}"`
      );
      check(stored?.overrides.length === 2, `and carries its two changed weeks, got ${stored?.overrides.length}`);
      check(
        secondSync.updated === 0,
        `a second read of the same feed writes nothing, changed weeks included - rewrote ${secondSync.updated}`
      );

      // On the page: moved to 10:00, not at 08:00 as well.
      const onPage = (await weekly()).pages.flatMap((p) =>
        (p.renderContext?.events ?? [])
          .filter((e) => e.id === stored!.id)
          .map((e) => `${p.renderContext?.columnDates?.[e.day]} ${e.startTime} ${e.label}`)
      );
      check(
        onPage.join() === `${dayA} 10:00 Weekly (moved)`,
        `this week's occurrence is drawn where it was MOVED, once: ${onPage.join(" | ") || "nothing"}`
      );

      // Un-moving it in the feed puts it back - the feed owns its weeks.
      const restoredWeek = await applyFeed(
        guest.ownerId,
        calendar.id,
        "Work",
        build(moved + review(dayB) + series.slice(0, series.indexOf("BEGIN:VEVENT", 10)))
      );
      const afterRestore = await prisma.calendarEvent.findFirst({
        where: { calendarId: calendar.id, externalId: "weekly@example.com" },
        include: { overrides: true },
      });
      check(
        restoredWeek.updated === 1 && afterRestore?.overrides.length === 1 && afterRestore.overrides[0].cancelled,
        `when the feed stops moving a week, only its deletion is left (${afterRestore?.overrides.length} change(s), updated ${restoredWeek.updated})`
      );

      // Put the feed back as the clauses below expect it: the moved standup
      // live, the review cancelled, and this series gone from it.
      await applyFeed(guest.ownerId, calendar.id, "Work", build(moved + review(dayB, "STATUS:CANCELLED\n")));
    }

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

    // --- A FEED THAT DOES NOT ANSWER ---------------------------------------
    //
    // 203.0.113.1 is TEST-NET-3 (RFC 5737): public, so the SSRF guard lets it
    // through, and routed nowhere, so a connection to it hangs - a feed server
    // that is down. MEASURED BEFORE THE FIX: a journal with one of these took
    // 11 seconds to open, two took 22, and because a failed read was never
    // recorded, EVERY open retried it.
    {
      const { syncDueSubscriptions } = await import("../src/app/planner/calendarSubscriptions.js");
      const { FETCH_TIMEOUT_MS } = await import("../src/lib/icsFetch.js");
      // TWO of them, so the sync's time says whether they were read at once
      // (one deadline) or in turn (two).
      const dead = await prisma.calendar.create({
        data: { ownerId: guest.ownerId, name: "Down", colour: "#d6f0d8", source: ICS_SOURCE, externalId: "https://203.0.113.1/down.ics" },
      });
      const alsoDead = await prisma.calendar.create({
        data: { ownerId: guest.ownerId, name: "Also down", colour: "#f7d6e0", source: ICS_SOURCE, externalId: "https://203.0.113.2/down.ics" },
      });

      // THE PAGE DOES NOT WAIT FOR IT. It draws what is stored.
      let t = Date.now();
      await weekly();
      const openMs = Date.now() - t;
      check(openMs < 2000, `a journal with an unreachable feed opens without waiting for it (${openMs} ms)`);

      // The sync, run as the editor runs it, gives up within its deadline...
      t = Date.now();
      const first = await syncDueSubscriptions(guest.ownerId);
      const syncMs = Date.now() - t;
      check(first.failed === 2 && !first.changed, `both dead feeds are counted as failed (${JSON.stringify(first)})`);
      check(
        syncMs < FETCH_TIMEOUT_MS + 3000,
        `and they cost ONE deadline, not two - read at once (${syncMs} ms, deadline ${FETCH_TIMEOUT_MS} ms each)`
      );

      // ...and RECORDS that it tried, so the next open does not try again.
      t = Date.now();
      await syncDueSubscriptions(guest.ownerId);
      const againMs = Date.now() - t;
      check(againMs < 1500, `a second sync straight after does not retry the dead feed (${againMs} ms)`);

      // The Calendars panel is told why, in words, and never the address.
      const shown = (await weekly()).calendars.find((c) => c.id === dead.id);
      check(Boolean(shown?.problem), `the panel is told the feed could not be read ("${shown?.problem}")`);
      check(!(shown?.problem ?? "").includes("203.0.113.1"), "and the reason does not contain the feed's address");
      await prisma.calendar.deleteMany({ where: { id: { in: [dead.id, alsoDead.id] } } });
    }
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
//   * write every row instead of comparing first     -> the writes-nothing
//     cases. That is the 8-second regression, and it is the only one of these
//     that a reader would not think to look for - the page still works, it
//     just quietly stops rendering in production once there are two feeds.
//   * compare deletedAt as an instant, not a presence -> the already-cancelled
//     case

console.log(
  failures === 0
    ? "\nA subscribed feed syncs onto a real journal: re-reads keep every id AND write nothing, changes follow, gone and cancelled events are tombstoned and stop printing, a returning one comes back, and the feed's secret URL never leaves the server."
    : `\n${failures} problem(s).`
);
process.exit(failures === 0 ? 0 : 1);
