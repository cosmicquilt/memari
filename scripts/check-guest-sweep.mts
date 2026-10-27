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
import { readFileSync } from "node:fs";

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
  // Coaches trying memari. for businesses as guests (2026-10-27): one using
  // it, one whose client opens their page, one gone; and one who signs in
  // to an account that has a business of its own.
  const coachWorking = `guest:${tag}gggg`;
  const coachSeen = `guest:${tag}hhhh`;
  const coachGone = `guest:${tag}iiii`;
  const coachSigner = `guest:${tag}jjjj`;
  const coachAccount = `user_${tag}coach`;
  // From the review of the fixes (2026-10-27): one coach who has edited
  // just one journal lately; a sign-in whose second claim lags behind the
  // first; two claims at once; and a guest coach deleting everything.
  const coachEditing = `guest:${tag}kkkk`;
  const coachLagging = `guest:${tag}llll`;
  const lagAccount = `user_${tag}lag`;
  const coachTwice = `guest:${tag}mmmm`;
  const twiceAccount = `user_${tag}twice`;
  const coachLeaving = `guest:${tag}nnnn`;
  // and a guest coach who has had a book ordered, idle a month (the privacy
  // page says such a guest's journals and business are kept with the order)
  const coachCustomer = `guest:${tag}oooo`;
  const coaches = [coachWorking, coachSeen, coachGone, coachSigner, coachAccount, coachEditing, coachLagging, lagAccount, coachTwice, twiceAccount, coachLeaving, coachCustomer];

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
  /** A coach's business: a template and one client with their journal,
   *  the journals idle since `journals`, the business last changed `when`,
   *  its client `clientWhen`, the client's page last opened `seen`. */
  const business = async (ownerId: string, name: string, when: Date, journals: Date, seen: Date | null = null, clientWhen: Date = when) => {
    const template = await planner(ownerId, journals);
    const theirs = await planner(ownerId, journals);
    const row = await prisma.business.create({
      data: {
        ownerId,
        name,
        templates: { create: { plannerId: template.id } },
        linkEmails: { create: {} },
      },
      include: { templates: true },
    });
    const client = await prisma.businessClient.create({
      data: { businessId: row.id, name: `Client of ${name}`, email: "client@example.com", shippingAddress: { name: "Client", street1: "2 Elm St" }, templateId: row.templates[0].id, plannerId: theirs.id, accessSeenAt: seen },
    });
    await prisma.$executeRaw`UPDATE "Business" SET "updatedAt" = ${when} WHERE id = ${row.id}`;
    await prisma.$executeRaw`UPDATE "BusinessClient" SET "updatedAt" = ${clientWhen} WHERE id = ${client.id}`;
    return { id: row.id, clientId: client.id, journals: [template.id, theirs.id] };
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

    // COACHES. Working: every journal and client idle a month, only the
    // business looked at today (currentBusiness's touch). Seen: nothing
    // touched by the coach, but their client opened their page yesterday.
    // Editing: all idle but one journal of theirs edited today - the shape
    // of the original bug, which swept the idle ones one at a time. Gone:
    // nothing of theirs used in a month.
    const working = await business(coachWorking, "Working Coaching", new Date(), old, null, old);
    const seen = await business(coachSeen, "Seen Coaching", old, old, new Date(Date.now() - DAY_MS));
    const editing = await business(coachEditing, "Editing Coaching", old, old);
    await planner(coachEditing, new Date());
    const gone = await business(coachGone, "Gone Coaching", old, old);
    const ordered = await business(coachCustomer, "Ordered Coaching", old, old);
    await order(coachCustomer, ordered.journals[1], "SUBMITTED");

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

    const journalsLeft = async (ids: string[]) => prisma.planner.count({ where: { id: { in: ids } } });
    check((await journalsLeft(working.journals)) === 2, "A GUEST COACH STILL USING THEIR BUSINESS KEEPS EVERY JOURNAL, each untouched a month");
    check((await journalsLeft(seen.journals)) === 2, "and so does one whose client opened their page this month");
    check((await journalsLeft(editing.journals)) === 2, "AND ONE WHO EDITED ANY ONE JOURNAL THIS MONTH KEEPS THE IDLE ONES TOO");
    check((await prisma.business.count({ where: { id: { in: [working.id, seen.id, editing.id] } } })) === 3, "and all keep their business");
    check((await journalsLeft(gone.journals)) === 0, "a guest coach gone a month loses their journals like any guest");
    check((await prisma.business.count({ where: { id: gone.id } })) === 0, "AND THEIR BUSINESS GOES");
    check(
      (await prisma.businessClient.count({ where: { id: gone.clientId } })) + (await prisma.clientLinkEmail.count({ where: { businessId: gone.id } })) + (await prisma.businessTemplate.count({ where: { businessId: gone.id } })) === 0,
      "with its clients' names, emails and addresses, its templates and its emailed-link count"
    );
    check(result.businesses >= 1, `the sweep counts the business it took (${result.businesses})`);
    check(
      (await journalsLeft(ordered.journals)) === 2 && (await prisma.business.count({ where: { id: ordered.id } })) === 1,
      "A GUEST COACH WHO HAS HAD A BOOK ORDERED KEEPS THEIR JOURNALS AND BUSINESS, however idle (as the privacy page says)"
    );

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

    // SIGNING IN TO AN ACCOUNT WITH A BUSINESS (review, 2026-10-27): the
    // guest's clients, templates and link count join the account's, and the
    // guest's business is gone - before, it stayed the cookie's, and the next
    // guest on that browser had its clients.
    const theirs = await business(coachSigner, "Guest Coaching", new Date(), new Date());
    const accountBusiness = await prisma.business.create({ data: { ownerId: coachAccount, name: "Account Coaching" } });
    await moveGuestWork(coachSigner, coachAccount);
    const merged = await prisma.business.findUnique({ where: { ownerId: coachAccount }, include: { _count: { select: { clients: true, templates: true, linkEmails: true } } } });
    check((await prisma.business.count({ where: { ownerId: coachSigner } })) === 0, "SIGNING IN TO AN ACCOUNT WITH A BUSINESS LEAVES THE GUEST NONE");
    check(
      merged?.id === accountBusiness.id && merged.name === "Account Coaching" && merged._count.clients === 1 && merged._count.templates === 1 && merged._count.linkEmails === 1,
      `the account's business takes the guest's client, template and link count, and keeps its own name (${JSON.stringify(merged?._count)}, ${merged?.name})`
    );
    check((await prisma.businessClient.findUnique({ where: { id: theirs.clientId } }))?.plannerId === theirs.journals[1], "and the client keeps their journal, now the account's");

    // A CLAIM THAT LAGS BEHIND ANOTHER (review, 2026-10-27). Claims run on
    // every page that claims, so two can overlap; the second may have read
    // the guest's business just before the first moved it to the account.
    // Driven here with that stale read: it must leave the business alone -
    // before, it took the account's new business for the guest's, merged it
    // into itself and deleted it, every client with it.
    const { moveGuestBusiness, deleteOwnerWork } = await import("../src/lib/owner.js");
    const lagging = await business(coachLagging, "Lagging Coaching", new Date(), new Date());
    await moveGuestWork(coachLagging, lagAccount);
    await moveGuestBusiness(lagging.id, coachLagging, lagAccount);
    const kept = await prisma.business.findUnique({ where: { id: lagging.id }, include: { _count: { select: { clients: true, templates: true } } } });
    check(kept?.ownerId === lagAccount && kept._count.clients === 1 && kept._count.templates === 1, `A SIGN-IN CLAIM THAT LAGS BEHIND ANOTHER LEAVES THE MOVED BUSINESS WHOLE (${kept ? `${kept.ownerId === lagAccount ? "the account's" : kept.ownerId}, ${JSON.stringify(kept._count)}` : "deleted"})`);
    // and two claims at once into an account with a business: one merge, no error
    await business(coachTwice, "Twice Coaching", new Date(), new Date());
    await prisma.business.create({ data: { ownerId: twiceAccount, name: "Twice Account Coaching" } });
    const both = await Promise.allSettled([moveGuestWork(coachTwice, twiceAccount), moveGuestWork(coachTwice, twiceAccount)]);
    const twice = await prisma.business.findUnique({ where: { ownerId: twiceAccount }, include: { _count: { select: { clients: true } } } });
    check(both.every((r) => r.status === "fulfilled") && twice?._count.clients === 1 && (await prisma.business.count({ where: { ownerId: coachTwice } })) === 0, `two claims at once merge once and neither fails (${both.map((r) => r.status).join(", ")}; ${twice?._count.clients} client(s))`);

    // DELETING EVERYTHING takes the business too (account/actions.ts,
    // deleteAccount): before, a guest's stayed, out of anyone's reach, kept
    // for as long as any client opened their page.
    const leaving = await business(coachLeaving, "Leaving Coaching", new Date(), new Date());
    await deleteOwnerWork(coachLeaving);
    check(
      (await prisma.business.count({ where: { ownerId: coachLeaving } })) + (await prisma.businessClient.count({ where: { id: leaving.clientId } })) + (await prisma.planner.count({ where: { ownerId: coachLeaving } })) === 0,
      "DELETING EVERYTHING DELETES THE BUSINESS, its clients and its journals with it"
    );

    // EVERY KIND OF ROW HANGING OFF A BUSINESS is named in the merge above
    // (owner.ts). A new one added to the schema and not to the merge would
    // stay pointing at a business that is deleted - or block the delete.
    // Any field typed Business, optional or not, in any model.
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const hanging = schema
      .split(/^model /m)
      .slice(1)
      .filter((block) => /^\s+\w+\s+Business\??\s+@relation/m.test(block))
      .map((block) => block.slice(0, block.indexOf(" ")))
      .sort();
    check(hanging.join() === "BusinessClient,BusinessTemplate,ClientLinkEmail", `the rows that hang off a business are the three the merge moves (${hanging.join(", ")})`);

    // EVERY KIND OF ROW A GUEST CAN OWN is named above. If a new one is added
    // to the schema and not to the sweep, this is where it should have been.
    check(
      result.journals >= 1 && result.calendars >= 1 && result.savedPages >= 1,
      `the sweep reports what it took: ${JSON.stringify(result)}`
    );
  } finally {
    await prisma.business.deleteMany({ where: { ownerId: { in: coaches } } });
    await prisma.planner.deleteMany({ where: { ownerId: { in: coaches } } });
    await prisma.printOrder.deleteMany({ where: { ownerId: { in: [customer, browser, signer, signedIn, coachCustomer] } } });
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
//   * drop `working` from the exclusion (2026-10-27)
//     -> "A GUEST COACH STILL USING THEIR BUSINESS KEEPS EVERY JOURNAL"
//   * drop the business from the sweep -> "AND THEIR BUSINESS GOES"
//   * go back to moving the business only when the account has none
//     -> "SIGNING IN TO AN ACCOUNT WITH A BUSINESS LEAVES THE GUEST NONE"
//   * drop the business's own updatedAt from `working`
//     -> "A GUEST COACH STILL USING THEIR BUSINESS KEEPS EVERY JOURNAL"
//   * drop the recent-journal arm of `working`
//     -> "AND ONE WHO EDITED ANY ONE JOURNAL THIS MONTH KEEPS THE IDLE ONES TOO"
//   * drop both moveGuestBusiness guards (the same-id return and the
//     owner scope) -> "A SIGN-IN CLAIM THAT LAGS BEHIND ANOTHER..."
//   * drop the business from deleteOwnerWork
//     -> "DELETING EVERYTHING DELETES THE BUSINESS"

console.log(
  failures === 0
    ? "\nThe sweep takes an abandoned guest's journals, saved items and calendars - events and feed address included - and leaves everything belonging to a guest still using the app, or to an account."
    : `\n${failures} problem(s).`
);
process.exit(failures === 0 ? 0 : 1);
