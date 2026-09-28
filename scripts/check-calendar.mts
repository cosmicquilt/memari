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
    // A SERIES' marks carry WHICH OCCURRENCE too - `-ev<id>@<ms>-box` - so two
    // weeks of one series moved into one column cannot share an id. See
    // eventKey in hourlyGridCore.ts.
    const seriesMark = (eventId: string) => new RegExp(`-ev${eventId}@\\d+-box$`);
    check(drawn.some((id) => seriesMark(repeating.id).test(id)), "a weekly series started before the book still recurs into it");
    check(drawn.some((id) => /-allday-box$/.test(id)), "an all-day event fills the band");

    check(
      dateDrawnOn(after, new RegExp(`-d(\\d+)-ev${timed.id}-box$`)) === timedDay,
      `the timed event drew on the day it was written for (${timedDay}, drew on ${dateDrawnOn(after, new RegExp(`-d(\\d+)-ev${timed.id}-box$`))})`
    );
    check(
      dateDrawnOn(after, new RegExp(`-d(\\d+)-ev${repeating.id}@\\d+-box$`)) === timedDay,
      `the series recurred onto the right column (${timedDay}, drew on ${dateDrawnOn(after, new RegExp(`-d(\\d+)-ev${repeating.id}@\\d+-box$`))})`
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
      afterDelete.some((id) => seriesMark(repeating.id).test(id)),
      "and the others are untouched"
    );
    // The row above was tombstoned DIRECTLY, to test the drawing. It is
    // still there because nothing deleted it.
    check(
      (await prisma.calendarEvent.findUnique({ where: { id: timed.id } })) !== null,
      "a tombstoned row still exists - the mark going is a render decision, not a delete"
    );

    // --- BUT DELETING A TYPED EVENT REALLY DELETES IT --------------------
    //
    // Through deleteEventFor, which is what the editor calls. No externalId
    // means nothing outside can re-create it, so a tombstone would keep the
    // title and times of something a person asked to be rid of, for a feature
    // that does not exist - and the privacy page would have to say so. A
    // feed's event IS still tombstoned; that half is in check:subscriptions,
    // which is where a row with an externalId lives.
    {
      const { deleteEventFor } = await import("../src/app/planner/calendarStore.js");
      const doomed = await prisma.calendarEvent.create({
        data: {
          ownerId: guest.ownerId,
          calendarId: calendar.id,
          title: "Typed then deleted",
          startsAt: new Date(`${timedDay}T18:00:00.000Z`),
          endsAt: new Date(`${timedDay}T19:00:00.000Z`),
        },
      });
      await deleteEventFor(guest.ownerId, doomed.id);
      check(
        (await prisma.calendarEvent.findUnique({ where: { id: doomed.id } })) === null,
        "deleting an event that was only ever typed here removes the row, not just the mark"
      );

      // And the other direction, so "delete everything" is not how it passes.
      const fromAFeed = await prisma.calendarEvent.create({
        data: {
          ownerId: guest.ownerId,
          calendarId: calendar.id,
          title: "From a feed",
          startsAt: new Date(`${timedDay}T20:00:00.000Z`),
          endsAt: new Date(`${timedDay}T21:00:00.000Z`),
          externalId: "known-to-the-outside@example.com",
        },
      });
      await deleteEventFor(guest.ownerId, fromAFeed.id);
      const still = await prisma.calendarEvent.findUnique({ where: { id: fromAFeed.id } });
      check(
        still !== null && still.deletedAt !== null,
        "deleting one the outside world knows about leaves a tombstone, so the next sync learns of it"
      );
    }

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

    // --- A NEW YORK BOOK PRINTS NEW YORK TIME ----------------------------
    //
    // Everything above runs in a book with no zone, which draws in UTC - where
    // an instant and its wall clock read the same, and where the bug this
    // section is about could not be seen. A 9am New York meeting printed in
    // the 1pm row until 2026-09-28.
    //
    // Read off `renderContext.events`: the placed events every mark on the
    // page is drawn from, so a time here is the time the page shows.
    {
      // THE BOOK FOLLOWS ITS OWNER'S DEFAULT - no zone of its own. That is
      // how every book is made, and every book that existed before zones.
      await prisma.ownerSettings.upsert({
        where: { ownerId: guest.ownerId },
        create: { ownerId: guest.ownerId, timeZone: "America/New_York" },
        update: { timeZone: "America/New_York" },
      });
      await prisma.planner.update({ where: { id: guest.journalId }, data: { timeZone: null } });
      const { createEventFor } = await import("../src/app/planner/calendarStore.js");

      // The first week of this book is late December: New York is on EST,
      // UTC-5. So 9am New York is 14:00Z.
      const imported = await prisma.calendarEvent.create({
        data: {
          ownerId: guest.ownerId,
          calendarId: calendar.id,
          title: "Imported 9am New York",
          startsAt: new Date(`${timedDay}T14:00:00.000Z`),
          endsAt: new Date(`${timedDay}T15:00:00.000Z`),
          timeZone: "America/New_York",
          externalId: "ny-nine@example.com",
        },
      });
      // 9pm New York is 02:00Z THE NEXT DAY - which is the case that used to
      // move columns as well as rows.
      const late = await prisma.calendarEvent.create({
        data: {
          ownerId: guest.ownerId,
          calendarId: calendar.id,
          title: "Imported 9pm New York",
          startsAt: new Date(new Date(`${timedDay}T02:00:00.000Z`).getTime() + 86_400_000),
          endsAt: new Date(new Date(`${timedDay}T03:00:00.000Z`).getTime() + 86_400_000),
          timeZone: "America/New_York",
          externalId: "ny-late@example.com",
        },
      });
      // What a person TYPES: a date and two clock readings, which the server
      // turns into an instant in the book's zone.
      const typed = await createEventFor(guest.ownerId, guest.journalId, {
        title: "Typed at 10:30",
        date: timedDay,
        start: "10:30",
        end: "11:15",
        allDay: false,
        rrule: null,
      });
      // A FLOATING time - what the migration made of everything typed before
      // books had zones. It must NOT be converted.
      const floating = await prisma.calendarEvent.create({
        data: {
          ownerId: guest.ownerId,
          calendarId: calendar.id,
          title: "Floating 8am",
          startsAt: new Date(`${timedDay}T08:00:00.000Z`),
          endsAt: new Date(`${timedDay}T08:30:00.000Z`),
          timeZone: "floating",
        },
      });

      const ny = await weekly();
      const shown = (id: string) => {
        for (const page of ny.pages) {
          const hit = (page.renderContext?.events ?? []).find((e) => e.id === id);
          if (hit) return `${page.renderContext?.columnDates?.[hit.day]} ${hit.startTime}-${hit.endTime}`;
        }
        return "not drawn";
      };

      check(
        shown(imported.id) === `${timedDay} 09:00-10:00`,
        `a 9am New York event prints at 09:00 in a New York book (${shown(imported.id)})`
      );
      check(
        shown(late.id) === `${timedDay} 21:00-22:00`,
        `a 9pm New York event stays on its own day at 21:00 (${shown(late.id)})`
      );
      check(
        typed.startsAt.toISOString() === `${timedDay}T15:30:00.000Z`,
        `"10:30" typed in a New York book is stored as the instant 15:30Z (${typed.startsAt.toISOString()})`
      );
      check(typed.timeZone === "America/New_York", `and records the zone it was typed in (${typed.timeZone})`);
      check(
        shown(typed.id) === `${timedDay} 10:30-11:15`,
        `and prints where it was typed (${shown(typed.id)})`
      );
      check(
        shown(floating.id) === `${timedDay} 08:00-08:30`,
        `a floating 8am is NOT converted - it prints at 08:00 (${shown(floating.id)})`
      );

      // THE SAME BOOK GIVEN ITS OWN ZONE, LONDON. Nothing stored changes;
      // every zoned event moves to London's clock and the floating one stays.
      await prisma.planner.update({ where: { id: guest.journalId }, data: { timeZone: "Europe/London" } });
      const london = await weekly();
      const inLondon = (id: string) => {
        for (const page of london.pages) {
          const hit = (page.renderContext?.events ?? []).find((e) => e.id === id);
          if (hit) return `${page.renderContext?.columnDates?.[hit.day]} ${hit.startTime}`;
        }
        return "not drawn";
      };
      check(
        inLondon(imported.id) === `${timedDay} 14:00`,
        `the same meeting prints at 14:00 once the book is set to London (${inLondon(imported.id)})`
      );
      check(
        inLondon(floating.id) === `${timedDay} 08:00`,
        `while the floating 8am stays at 08:00 (${inLondon(floating.id)})`
      );
      check(
        ny.pageSettings.timeZone === null && ny.pageSettings.defaultTimeZone === "America/New_York",
        `the editor is told the book FOLLOWS a New York default (own: ${ny.pageSettings.timeZone}, default: ${ny.pageSettings.defaultTimeZone})`
      );

      // CHANGING THE DEFAULT MOVES A BOOK THAT FOLLOWS IT, and not one that
      // keeps its own. This is the whole difference between the two, and the
      // reason a book's own zone is null rather than a copy of the default.
      await prisma.ownerSettings.update({ where: { ownerId: guest.ownerId }, data: { timeZone: "Asia/Tokyo" } });
      // Still London: the book has its own zone.
      const stillLondon = await weekly();
      const at = (loaded: Loaded, id: string) => {
        for (const page of loaded.pages) {
          const hit = (page.renderContext?.events ?? []).find((e) => e.id === id);
          if (hit) return `${page.renderContext?.columnDates?.[hit.day]} ${hit.startTime}`;
        }
        return "not drawn";
      };
      check(
        at(stillLondon, imported.id) === `${timedDay} 14:00`,
        `a book with its OWN zone ignores a change of default (${at(stillLondon, imported.id)})`
      );
      // Back to following: now it is Tokyo. 9am New York is 14:00Z, which is
      // 23:00 the same day in Tokyo (UTC+9).
      await prisma.planner.update({ where: { id: guest.journalId }, data: { timeZone: null } });
      const tokyo = await weekly();
      check(
        at(tokyo, imported.id) === `${timedDay} 23:00`,
        `a book that FOLLOWS the default moves with it - 9am New York is 23:00 in Tokyo (${at(tokyo, imported.id)})`
      );
      check(
        at(tokyo, floating.id) === `${timedDay} 08:00`,
        `and the floating 8am still does not move (${at(tokyo, floating.id)})`
      );

      // THE SAVE PATH AGREES WITH THE PAGE. "10:30" typed in a book that
      // follows a Tokyo default is 01:30Z - resolved through the same
      // effectiveZone the page uses.
      const typedInTokyo = await createEventFor(guest.ownerId, guest.journalId, {
        title: "Typed at 10:30 Tokyo",
        date: timedDay,
        start: "10:30",
        end: "11:00",
        allDay: false,
        rrule: null,
      });
      check(
        typedInTokyo.startsAt.toISOString() === `${timedDay}T01:30:00.000Z` && typedInTokyo.timeZone === "Asia/Tokyo",
        `"10:30" typed in a book following Tokyo is 01:30Z, zone Tokyo (${typedInTokyo.startsAt.toISOString()}, ${typedInTokyo.timeZone})`
      );
      await prisma.ownerSettings.deleteMany({ where: { ownerId: guest.ownerId } });
    }

    // --- ONLY THIS WEEK OF A SERIES YOU TYPED ----------------------------
    //
    // Through the functions the popup's actions call. Weeks other than the
    // first are read through eventsForDays on the STORED rows - the book's
    // editor only ever shows its first week - which is the same placer the
    // page uses, fed the same select.
    {
      await prisma.planner.update({ where: { id: guest.journalId }, data: { timeZone: "America/New_York" } });
      const { createEventFor, updateEventFor, updateOccurrenceFor, deleteOccurrenceFor, eventsForJournal } =
        await import("../src/app/planner/calendarStore.js");
      const { eventsForDays } = await import("../src/lib/calendarEvents.js");
      const plus = (iso: string, days: number) =>
        new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
      const typedInput = (over: Partial<Parameters<typeof createEventFor>[2]> = {}) => ({
        title: "Seminar",
        date: timedDay,
        start: "09:00",
        end: "10:00",
        allDay: false,
        rrule: "FREQ=WEEKLY",
        ...over,
      });
      const seminar = await createEventFor(guest.ownerId, guest.journalId, typedInput());
      /** The seminar as drawn on the day `weeksOn` weeks after the first. */
      const onWeek = async (weeksOn: number) => {
        const rows = (await eventsForJournal(guest.ownerId, guest.journalId)).filter((e) => e.id === seminar.id);
        const day = plus(timedDay, weeksOn * 7);
        return eventsForDays(rows, [{ date: new Date(`${day}T00:00:00.000Z`) }], "America/New_York")
          .map((e) => `${e.startTime} ${e.label}`)
          .join(" | ");
      };
      check((await onWeek(1)) === "09:00 Seminar", `the control: week 2 at 09:00 (${await onWeek(1)})`);

      // THE OCCURRENCE IS NAMED BY WHAT THE PLACER DREW - exactly what the
      // popup is handed. Week 2's original start, 9am New York.
      const week2 = new Date(`${plus(timedDay, 7)}T14:00:00.000Z`).getTime(); // EST, UTC-5

      // Move week 2 to 11:00, and only week 2.
      await updateOccurrenceFor(guest.ownerId, guest.journalId, seminar.id, week2, typedInput({ date: plus(timedDay, 7), start: "11:00", end: "12:00" }));
      check((await onWeek(1)) === "11:00 Seminar", `week 2 moved to 11:00, drawn once (${await onWeek(1)})`);
      check((await onWeek(2)) === "09:00 Seminar", `week 3 untouched (${await onWeek(2)})`);
      check((await onWeek(0)) === "09:00 Seminar", `week 1 untouched (${await onWeek(0)})`);

      // Delete week 3, and only week 3.
      await deleteOccurrenceFor(guest.ownerId, seminar.id, new Date(`${plus(timedDay, 14)}T14:00:00.000Z`).getTime());
      check((await onWeek(2)) === "", `week 3 deleted (${await onWeek(2)})`);
      check((await onWeek(3)) === "09:00 Seminar", `week 4 untouched (${await onWeek(3)})`);

      // A rename at the same time is a RENAME, not a move to the same place.
      const week4 = new Date(`${plus(timedDay, 21)}T14:00:00.000Z`).getTime();
      await updateOccurrenceFor(guest.ownerId, guest.journalId, seminar.id, week4, typedInput({ date: plus(timedDay, 21), title: "Seminar (guest talk)" }));
      const renamedRow = await prisma.calendarEventOverride.findFirst({ where: { eventId: seminar.id, recurrenceId: new Date(week4) } });
      check(
        renamedRow?.title === "Seminar (guest talk)" && renamedRow.startsAt === null,
        `a same-time change is stored as a rename (startsAt ${renamedRow?.startsAt?.toISOString() ?? "null"})`
      );
      check((await onWeek(3)) === "09:00 Seminar (guest talk)", `and drawn at its own time with its own title (${await onWeek(3)})`);

      // EDITING THE SERIES FROM ITS FIFTH WEEK keeps its start. The popup
      // sends the column's date; used as the start, it deleted weeks 1-4 on
      // a title change. Measured before the fix, so pinned now.
      await updateEventFor(guest.ownerId, guest.journalId, seminar.id, typedInput({ date: plus(timedDay, 28), title: "Seminar series" }));
      const afterTitle = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: seminar.id } });
      check(
        afterTitle.startsAt.toISOString() === `${timedDay}T14:00:00.000Z`,
        `a series retitled from its fifth week still starts on its first (${afterTitle.startsAt.toISOString()})`
      );
      check((await onWeek(0)) === "09:00 Seminar series", `so week 1 is still there (${await onWeek(0)})`);
      check(
        (await prisma.calendarEventOverride.count({ where: { eventId: seminar.id } })) === 3,
        "and a RENAME of the series keeps its changed weeks"
      );

      // But MOVING the whole series drops them: they are named by where the
      // old rule put them, and would otherwise strand or silently return.
      await updateEventFor(guest.ownerId, guest.journalId, seminar.id, typedInput({ start: "13:00", end: "14:00", title: "Seminar series" }));
      check(
        (await prisma.calendarEventOverride.count({ where: { eventId: seminar.id } })) === 0,
        "moving the whole series clears its changed weeks"
      );
      check((await onWeek(2)) === "13:00 Seminar series", `and every week follows the new time (${await onWeek(2)})`);
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
