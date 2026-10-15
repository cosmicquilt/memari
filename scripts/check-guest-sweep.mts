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
  // A guest who bought a book (2026-10-15, guest checkout), and one who only
  // opened a payment page and left.
  const customer = `guest:${tag}dddd`;
  const browser = `guest:${tag}eeee`;
  // Signing in: a guest who ordered, and the account they sign in to.
  const signer = `guest:${tag}ffff`;
  const signedIn = `user_${tag}claim`;
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
  const settings = async (ownerId: string, when: Date) => {
    await prisma.ownerSettings.create({ data: { ownerId, timeZone: "America/New_York" } });
    await prisma.$executeRaw`UPDATE "OwnerSettings" SET "updatedAt" = ${when} WHERE "ownerId" = ${ownerId}`;
  };
  /** A print order at `status`, as checkout leaves one. */
  const order = (ownerId: string, plannerId: string, status: "QUOTED" | "SUBMITTED") =>
    prisma.printOrder.create({
      data: {
        ownerId,
        plannerId,
        title: "Sweep test",
        startDate: new Date("2027-01-01T00:00:00Z"),
        endDate: new Date("2027-01-30T00:00:00Z"),
        days: 30,
        binding: "PAPERBACK",
        podPackageId: "0700X1000BWSTDPB060UW444MXX",
        pageCount: 64,
        shippingLevel: "GROUND",
        shippingAddress: { name: "Sweep", street1: "1 Main St", city: "Springfield", stateCode: "IL", countryCode: "US", postcode: "62701" },
        bookCents: 2499,
        shippingCents: 599,
        totalCents: 3098,
        costCents: 1774,
        status,
      },
    });
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
    await settings(abandoned, old);

    // ACTIVE: an idle calendar and saved page, but a journal still in use.
    // The rule is "no journals left", so both must stay - a guest who is
    // still here must not lose the calendar they subscribed to months ago
    // and have not touched since.
    await planner(active, new Date());
    const keptCalendar = await calendar(active, old);
    const keptSaved = await savedPage(active, old);
    await settings(active, old);

    // FRESH: everything recent. Nothing goes.
    const freshCalendar = await calendar(fresh, new Date());

    // AN ACCOUNT, not a guest, with everything idle. Never swept, whatever
    // its age - this is the clause that stops the sweep from one day eating
    // paying customers' work.
    const accountCalendar = await calendar(account, old);
    await savedPage(account, old);
    await settings(account, old);

    // A CUSTOMER: idle for months, but they paid for a book. Their journal and
    // settings (the Stripe customer) stay, and so does the order.
    const customerJournal = await planner(customer, old);
    await settings(customer, old);
    const bought = await order(customer, customerJournal.id, "SUBMITTED");
    // A guest who opened a payment page and never paid: swept as usual. The
    // order row stays - it is not the sweep's to delete.
    const browserJournal = await planner(browser, old);
    const abandonedCheckout = await order(browser, browserJournal.id, "QUOTED");

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

    // SETTINGS - the second kind of row the sweep had to be told about, the
    // day after calendars. A default time zone is not sensitive the way a
    // feed address is, but a row nobody will ever read again is still one to
    // clear, and the rule is the same for every kind or it is no rule.
    check(
      (await prisma.ownerSettings.findUnique({ where: { ownerId: abandoned } })) === null,
      "AND THEIR SETTINGS GO"
    );
    check(
      (await prisma.ownerSettings.findUnique({ where: { ownerId: active } })) !== null,
      "a guest still using their journals keeps their settings"
    );
    check(
      (await prisma.ownerSettings.findUnique({ where: { ownerId: account } })) !== null,
      "an account keeps its settings, however idle"
    );
    check(await exists("calendar", keptCalendar.id), "a guest still using their journals keeps an untouched calendar");
    check(await exists("savedPage", keptSaved.id), "and their untouched saved pages");
    check(await exists("calendar", freshCalendar.id), "a brand new guest's calendar is left alone");
    check(await exists("calendar", accountCalendar.id), "AN ACCOUNT IS NEVER SWEPT, however idle");
    check(
      (await prisma.savedPage.count({ where: { ownerId: account } })) === 1,
      "nor are an account's saved pages"
    );

    check(await exists("planner", customerJournal.id), "A GUEST WHO BOUGHT A BOOK KEEPS THEIR JOURNAL, however idle");
    check((await prisma.ownerSettings.findUnique({ where: { ownerId: customer } })) !== null, "and their settings");
    check((await prisma.printOrder.findUnique({ where: { id: bought.id } })) !== null, "and the order is never the sweep's to delete");
    check(!(await exists("planner", browserJournal.id)), "a guest who only opened a payment page is swept like any other");
    check((await prisma.printOrder.findUnique({ where: { id: abandonedCheckout.id } })) !== null, "though their unpaid order row stays");

    // SIGNING IN brings everything along, the orders included (2026-10-15):
    // a book bought as a guest is the account's from then on.
    const { moveGuestWork } = await import("../src/lib/owner.js");
    const signerJournal = await planner(signer, new Date());
    await calendar(signer, new Date());
    await settings(signer, new Date());
    const signerOrder = await order(signer, signerJournal.id, "SUBMITTED");
    await moveGuestWork(signer, signedIn);
    check((await prisma.planner.findUnique({ where: { id: signerJournal.id } }))?.ownerId === signedIn, "signing in moves a guest's journals to the account");
    check((await prisma.printOrder.findUnique({ where: { id: signerOrder.id } }))?.ownerId === signedIn, "AND THEIR ORDERS");
    check((await prisma.calendar.count({ where: { ownerId: signedIn } })) === 1 && (await prisma.calendarEvent.count({ where: { ownerId: signedIn } })) === 1, "and their calendars, events and all");
    check((await prisma.ownerSettings.findUnique({ where: { ownerId: signedIn } })) !== null, "and their settings, where the account had none");
    check((await prisma.printOrder.count({ where: { ownerId: signer } })) + (await prisma.planner.count({ where: { ownerId: signer } })) === 0, "leaving the guest owning nothing");

    // EVERY KIND OF ROW A GUEST CAN OWN is named above. If a new one is added
    // to the schema and not to the sweep, this is where it should have been.
    check(
      result.journals >= 1 && result.calendars >= 1 && result.savedPages >= 1,
      `the sweep reports what it took: ${JSON.stringify(result)}`
    );
  } finally {
    await prisma.printOrder.deleteMany({ where: { ownerId: { in: [customer, browser, signer, signedIn] } } });
    for (const ownerId of [abandoned, active, fresh, account, customer, browser, signer, signedIn]) {
      await prisma.calendar.deleteMany({ where: { ownerId } });
      await prisma.savedPage.deleteMany({ where: { ownerId } });
      await prisma.savedModule.deleteMany({ where: { ownerId } });
      await prisma.planner.deleteMany({ where: { ownerId } });
      await prisma.ownerSettings.deleteMany({ where: { ownerId } });
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
//   * drop OwnerSettings from it -> "AND THEIR SETTINGS GO"
//   * sweep on idleness alone, without the no-journals-left test
//     -> the "still using their journals" cases
//   * drop the `startsWith(GUEST_OWNER_PREFIX)` filter
//     -> "AN ACCOUNT IS NEVER SWEPT"
//   * drop printOrder from moveGuestWork (owner.ts) -> "AND THEIR ORDERS"
//   * drop the `notIn: customers` exclusion (2026-10-15)
//     -> "A GUEST WHO BOUGHT A BOOK KEEPS THEIR JOURNAL"

console.log(
  failures === 0
    ? "\nThe sweep takes an abandoned guest's journals, saved items and calendars - events and feed address included - and leaves everything belonging to a guest still using the app, or to an account."
    : `\n${failures} problem(s).`
);
process.exit(failures === 0 ? 0 : 1);
