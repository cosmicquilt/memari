// A stored event, drawn on a real journal's page.
//
// WHY THIS EXISTS. Everything between a row in CalendarEvent and a mark on
// paper is covered by pure tests - eventsForDays places a row on a column,
// hourlyGridHit inverts a click, the renderer draws a block - and not one of
// them touches the database or a real book. The join is where this can go
// wrong quietly:
//
//   * the events are fetched for the wrong owner, and a journal shows nothing;
//   * the page's columns are dated one way and the events placed another, so
//     a Tuesday event draws on the Monday;
//   * a hidden calendar is not actually excluded;
//   * a tombstoned event keeps printing.
//
// Each of those leaves a page that looks plausible. So this makes a guest
// journal the way the app makes one, writes events onto the days its own
// first week actually covers, and then asks loadPlannerPages - the one
// function the canvas, the timeline and the PDF all go through - what got
// drawn.
//
// Needs the database, not the server:
//
//   npm run check:calendar
//
// SABOTAGED, and it bites - see the end of this file for what each one does.

import { makeGuestJournal, disconnect } from "./appUnderTest.mjs";

let failures = 0;
/** @param what stated as the thing being checked - it prints on a pass too,
 *  and "ok  a tombstoned event was still drawn" says the opposite of what
 *  happened. Same shape as check-routes. */
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

const DAY_MS = 86_400_000;

type Loaded = Awaited<ReturnType<typeof import("../src/app/planner/loadPlannerPages.js").loadPlannerPages>>;

/** Every mark id on the spread. */
const markIds = (loaded: Loaded): string[] =>
  loaded.pages.flatMap((page) => page.moduleInstances.flatMap((mi) => mi.elements.map((e) => e.id)));

/** WHICH DAY A BLOCK LANDED ON, read back out of the drawing.
 *
 *  The renderer names each block by the column it drew it in, so the mark's
 *  own id says which column - and the page says which date that column is.
 *  Both sides come from the page; nothing here dates a column a second time,
 *  which is the mistake this whole check is watching for. */
function dateDrawnOn(loaded: Loaded, pattern: RegExp): string | null {
  for (const page of loaded.pages) {
    const dates = page.renderContext?.columnDates ?? [];
    for (const mi of page.moduleInstances) {
      for (const el of mi.elements) {
        const match = pattern.exec(el.id);
        if (match) return dates[Number(match[1])] ?? null;
      }
    }
  }
  return null;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma.js");
  const { loadPlannerPages } = await import("../src/app/planner/loadPlannerPages.js");
  const { WITH_PAGES } = await import("../src/app/planner/bookSeeding.js");

  const guest = await makeGuestJournal("Calendar check journal");
  const weekly = async (): Promise<Loaded> =>
    loadPlannerPages(
      await prisma.planner.findUniqueOrThrow({ where: { id: guest.journalId }, include: WITH_PAGES }),
      "WEEKLY"
    );

  try {
    // WHICH DAYS THIS BOOK'S WEEKLY SPREAD SHOWS, asked of the page rather
    // than worked out here.
    const before = await weekly();
    const columns = before.pages.flatMap((page) => page.renderContext?.columnDates ?? []);
    check(columns.length === 7, `the weekly spread should show 7 columns, got ${columns.length}`);
    check(
      columns.every((d) => typeof d === "string"),
      `every column should have a date, got ${JSON.stringify(columns)}`
    );
    check(
      markIds(before).every((id) => !/-ev|-allday-/.test(id)),
      "a journal with no events has no event marks - the control"
    );

    // AN ANCHOR OUTSIDE THE APP. Every check below compares a mark against
    // the date the page itself claims for that column, which catches the two
    // halves disagreeing but NOT both being wrong the same way - shifting
    // columnDates by a day passed all of them, because the events shifted
    // with the columns. Measured, not assumed: that sabotage was green until
    // this clause existed.
    //
    // So the columns are checked against the Gregorian calendar. The day NAME
    // on a weekly tab comes from the stored template, not from the dating, so
    // "the tab says SUNDAY and the date is a Monday" is a real second opinion.
    const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    let named = 0;
    for (const page of before.pages) {
      const labels = page.renderContext?.dayLabels ?? [];
      const dates = page.renderContext?.columnDates ?? [];
      labels.forEach((label, index) => {
        const iso = dates[index];
        if (!iso) return;
        named++;
        check(
          WEEKDAYS[new Date(`${iso}T00:00:00.000Z`).getUTCDay()] === String(label.name).toUpperCase(),
          `${iso} really is a ${String(label.name).toUpperCase()} (the tab and the calendar agree)`
        );
      });
    }
    check(named === 7, `all seven tabs were checked against the calendar, checked ${named}`);
    const spans = columns.map((iso) => new Date(`${iso}T00:00:00.000Z`).getTime());
    check(
      spans.every((t, i) => i === 0 || t - spans[i - 1] === DAY_MS),
      "the spread's seven columns are seven consecutive days"
    );

    // The second and fourth columns of the spread, so a placement that is
    // wrong by one cannot land on the right answer by accident.
    const timedDay = columns[1]!;
    const bandDay = columns[3]!;

    const calendar = await prisma.calendar.create({
      data: { ownerId: guest.ownerId, name: "Check calendar", colour: "#cfe3ff" },
    });
    const timed = await prisma.calendarEvent.create({
      data: {
        ownerId: guest.ownerId,
        calendarId: calendar.id,
        title: "Studio",
        startsAt: new Date(`${timedDay}T09:30:00.000Z`),
        endsAt: new Date(`${timedDay}T11:00:00.000Z`),
      },
    });
    await prisma.calendarEvent.create({
      data: {
        ownerId: guest.ownerId,
        calendarId: calendar.id,
        title: "Holiday",
        startsAt: new Date(`${bandDay}T00:00:00.000Z`),
        endsAt: new Date(`${bandDay}T23:59:00.000Z`),
        allDay: true,
      },
    });
    // A WEEKLY RULE STARTING FOUR WEEKS BEFORE THE BOOK, which must still
    // draw: a series is stored as a rule, so nothing in the database says it
    // happens in this particular week.
    const repeating = await prisma.calendarEvent.create({
      data: {
        ownerId: guest.ownerId,
        calendarId: calendar.id,
        title: "Standup",
        startsAt: new Date(new Date(`${timedDay}T08:00:00.000Z`).getTime() - 28 * DAY_MS),
        endsAt: new Date(new Date(`${timedDay}T08:30:00.000Z`).getTime() - 28 * DAY_MS),
        rrule: "FREQ=WEEKLY",
      },
    });

    // --- THEY REACH THE PAGE, ON THE RIGHT DAY ---------------------------
    const after = await weekly();
    const drawn = markIds(after);
    check(drawn.some((id) => id.includes(`-ev${timed.id}-box`)), "a stored timed event is drawn");
    check(drawn.some((id) => id.includes(`-ev${repeating.id}-box`)), "a weekly series started before the book still recurs into it");
    check(drawn.some((id) => /-allday-box$/.test(id)), "an all-day event fills the band");

    check(
      dateDrawnOn(after, new RegExp(`-d(\\d+)-ev${timed.id}-box$`)) === timedDay,
      `the timed event drew on the day it was written for (${timedDay}, drew on ${dateDrawnOn(after, new RegExp(`-d(\\d+)-ev${timed.id}-box$`))})`
    );
    check(
      dateDrawnOn(after, new RegExp(`-d(\\d+)-ev${repeating.id}-box$`)) === timedDay,
      `the series recurred onto the right column (${timedDay}, drew on ${dateDrawnOn(after, new RegExp(`-d(\\d+)-ev${repeating.id}-box$`))})`
    );
    check(
      dateDrawnOn(after, /-d(\d+)-allday-box$/) === bandDay,
      `the band drew on the day it was written for (${bandDay}, drew on ${dateDrawnOn(after, /-d(\d+)-allday-box$/)})`
    );

    // --- AND ON THE TIMELINE'S THUMBNAILS --------------------------------
    //
    // The drawer's cards are the same drawing reduced to marks. An event that
    // reaches the canvas and not the card means the two were placed by
    // different code, which is the reason renderContextForPage exists.
    const cardMarks = (loaded: Loaded) =>
      loaded.timeline
        .filter((card) => card.level === "WEEKLY")
        .reduce((n, card) => n + card.previewMarks.length, 0);
    check(
      cardMarks(after) > cardMarks(before),
      `the timeline thumbnails gained the same marks: ${cardMarks(before)} -> ${cardMarks(after)}`
    );

    // --- A HIDDEN CALENDAR DOES NOT PRINT --------------------------------
    await prisma.hiddenCalendar.create({
      data: { plannerId: guest.journalId, calendarId: calendar.id },
    });
    check(
      markIds(await weekly()).every((id) => !/-ev|-allday-/.test(id)),
      "hiding a calendar takes its events off the page"
    );
    await prisma.hiddenCalendar.deleteMany({ where: { plannerId: guest.journalId } });

    // --- A TOMBSTONE DOES NOT PRINT, AND THE ROW STAYS -------------------
    await prisma.calendarEvent.update({ where: { id: timed.id }, data: { deletedAt: new Date() } });
    const afterDelete = markIds(await weekly());
    check(
      !afterDelete.some((id) => id.includes(`-ev${timed.id}-box`)),
      "a tombstoned event stops being drawn"
    );
    check(
      afterDelete.some((id) => id.includes(`-ev${repeating.id}-box`)),
      "and the others are untouched"
    );
    check(
      (await prisma.calendarEvent.findUnique({ where: { id: timed.id } })) !== null,
      "the tombstoned ROW is still there, which is what a future sync reads"
    );

    // --- SOMEONE ELSE'S EVENTS ARE NOT ON THIS PAGE ----------------------
    const stranger = await prisma.calendar.create({
      data: { ownerId: `guest:${"f".repeat(32)}`, name: "Not yours", colour: "#ffe9b3" },
    });
    const theirs = await prisma.calendarEvent.create({
      data: {
        ownerId: stranger.ownerId,
        calendarId: stranger.id,
        title: "Private",
        startsAt: new Date(`${timedDay}T14:00:00.000Z`),
        endsAt: new Date(`${timedDay}T15:00:00.000Z`),
      },
    });
    check(
      !markIds(await weekly()).some((id) => id.includes(`-ev${theirs.id}-box`)),
      "another owner's event is not on this journal"
    );
    await prisma.calendar.deleteMany({ where: { ownerId: stranger.ownerId } });

    // --- AND THE CALENDARS REACH THE EDITOR ------------------------------
    check(
      (await weekly()).calendars.some((c) => c.id === calendar.id && c.visible),
      "the owner's calendar reaches the editor, visible"
    );
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

// SABOTAGES THAT TURN IT RED, each one a bug that would otherwise ship a page
// that looks fine:
//
//   * drop `deletedAt: null` from eventsForJournal AND the guard in
//     eventsForDays                                      -> the tombstone case.
//     Either one alone stays green: the tombstone is filtered twice, on purpose,
//     because this is the one read that does not go through the store.
//   * drop the `calendarId: { notIn }` clause             -> the hidden case
//   * drop `ownerId` from the same where clause           -> the stranger case
//   * shift columnDates by a day in renderContextForPage -> the tab-and-calendar
//                                                            cases. NOT the
//     right-day cases: the events shift with the columns, so those stay green.
//     That is why the Gregorian anchor above exists - it was added after
//     measuring exactly this.
//   * return `null` from renderContextForPage's events    -> every drawn case
//   * place events but not in pageThumbnail               -> the timeline case

console.log(
  failures === 0
    ? "\nStored events draw on a real journal, on the right day, in the canvas and in the thumbnails; hidden and deleted ones do not, and nobody else's do."
    : `\n${failures} problem(s).`
);
process.exit(failures === 0 ? 0 : 1);
