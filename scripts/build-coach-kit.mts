// npm run build:coach-kit -- <kit.json> [--base https://memari.studio]
//
// THE FIRST COACHES (2026-10-31): builds the workspace we prepare for a
// coach from their kit (src/lib/coachKit.ts) and prints the one link that
// makes it theirs (src/lib/businessClaim.ts):
//   - a holding guest owns it until the coach claims it;
//   - their journal, laid out from the kit's spreads as "Use this planner"
//     lays out a planner (archetypeWeek.ts), is the business's template;
//   - the kit's questions asked of its modules (templateQuestions.ts);
//   - the coach as their own first client, their journal built from it.
// Run again for the same kit and it is rebuilt from scratch - until the
// coach has claimed it, when it is refused: it is theirs to change then.
//
// It writes to whichever database DATABASE_URL names: dev by default (.env),
// production when that is set to production's direct string, as for a
// migration (memory: production ops). The link is printed once; a new one
// is made from the admin pilot page, or by running this again.
//
// Kits are the coaches' words and their chapters' frameworks: keep them in
// coach-kits/ (ignored by git). scripts/coach-kit.example.json is made up.

import "./appUnderTest.mjs";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { kitCoverId, kitProblems, kitSpreads, type CoachKit, type KitPart } from "../src/lib/coachKit";
import { createJournalFromParts } from "../src/app/planner/archetypeWeek";
import { buildClientJournal } from "../src/lib/businessJournals";
import { askQuestion } from "../src/lib/templateQuestions";
import { claimUrl, makeClaimToken } from "../src/lib/businessClaim";
import { BOOK_DAYS } from "../src/lib/business";
import { GUEST_OWNER_PREFIX, newGuestId } from "../src/lib/guest";
import { PageLevel } from "../src/generated/prisma/enums";

const LEVEL: Record<KitPart, PageLevel> = { front: PageLevel.FRONT_MATTER, month: PageLevel.MONTHLY, week: PageLevel.WEEKLY, day: PageLevel.DAILY };
const DAY = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Next month's first Monday: a start that leaves time to order. */
function nextFirstMonday(today = new Date()): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}

export async function buildCoachKit(kit: CoachKit, siteBase: string): Promise<{ businessId: string; ownerId: string; url: string; rebuilt: boolean }> {
  const problems = kitProblems(kit);
  if (problems.length) throw new Error(`The kit can't be built:\n  ${problems.join("\n  ")}`);

  // the same kit again: rebuilt from scratch, unless the coach has it now
  const before = await prisma.business.findFirst({ where: { preparedKey: kit.key }, select: { id: true, ownerId: true, claimedAt: true } });
  if (before && (before.claimedAt || !before.ownerId.startsWith(GUEST_OWNER_PREFIX)))
    throw new Error(`${kit.key} has been claimed by the coach: it's theirs now, so change it in the app, not here.`);
  const ownerId = before?.ownerId ?? `${GUEST_OWNER_PREFIX}${newGuestId()}`;
  if (before) {
    await prisma.business.delete({ where: { id: before.id } });
    await prisma.planner.deleteMany({ where: { ownerId } });
    await prisma.savedPage.deleteMany({ where: { ownerId } });
  }

  const months = kit.journal.months ?? 3;
  const startISO = kit.firstClient?.startDate ?? nextFirstMonday();
  const days = BOOK_DAYS[months] ?? months * 30;
  const endISO = iso(new Date(Date.parse(`${startISO}T00:00:00Z`) + (days - 1) * DAY));
  const parts = kitSpreads(kit);
  const first = parts[0].spread.layout;
  const journal = await createJournalFromParts(
    ownerId,
    parts,
    {
      title: kit.journal.title.trim(),
      trim: "bound7x10",
      startISO,
      endISO,
      levels: [PageLevel.FRONT_MATTER, ...parts.filter((p) => p.part !== "front").map((p) => LEVEL[p.part]), PageLevel.BACK_MATTER],
      dated: true,
      weekStartDay: first.weekStartsMonday ? 1 : 0,
      font: first.font,
      browserTimeZone: null,
    },
    `coach:${kit.key}`
  );

  // its cover, from /covers: the template's, so the coach's own book and
  // every client's print on it (client journals take the template's theme)
  const cover = kitCoverId(kit);
  if (cover) {
    const made = await prisma.planner.findUniqueOrThrow({ where: { id: journal.id }, select: { theme: true } });
    await prisma.planner.update({ where: { id: journal.id }, data: { theme: { ...((made.theme as object | null) ?? {}), cover } } });
  }

  const business = await prisma.business.create({
    data: { ownerId, name: kit.business.name.trim(), logoUrl: kit.business.logoUrl ?? null, preparedAt: new Date(), preparedKey: kit.key },
  });
  const template = await prisma.businessTemplate.create({ data: { businessId: business.id, plannerId: journal.id } });

  // the questions, each on the first module of its part that matches
  for (const q of kit.questions ?? []) {
    const modules = await prisma.moduleInstance.findMany({
      where: { page: { plannerId: journal.id, level: LEVEL[q.part] }, moduleType: { slug: q.slug } },
      select: { id: true, propValues: true },
      orderBy: [{ page: { variantKey: "asc" } }, { page: { position: "asc" } }, { rowStart: "asc" }, { columnStart: "asc" }],
    });
    const found = modules.find((m) => !q.heading || String((m.propValues as Record<string, unknown>)?.heading ?? "").trim().toLowerCase() === q.heading.trim().toLowerCase());
    if (!found) throw new Error(`No ${q.slug}${q.heading ? ` headed "${q.heading}"` : ""} on the ${q.part} of the built journal.`);
    const asked = await askQuestion(ownerId, template.id, found.id, { prompt: q.prompt, max: q.max ?? 3 });
    if (asked.error) throw new Error(`Question "${q.prompt}": ${asked.error}`);
  }

  // the coach as their own first client
  const client = await prisma.businessClient.create({
    data: {
      businessId: business.id,
      name: kit.coach.name.trim(),
      coverName: kit.coach.coverName?.trim() || null,
      email: kit.coach.email?.trim() || null,
      startDate: new Date(`${startISO}T00:00:00Z`),
      bookMonths: months,
      templateId: template.id,
      note: "You, as your own first client: your own copy is one order away.",
    },
  });
  await buildClientJournal(ownerId, client.id);

  const token = await makeClaimToken(business.id);
  return { businessId: business.id, ownerId, url: claimUrl(siteBase, token), rebuilt: !!before };
}

// run as a script (check-coach-kit imports buildCoachKit instead)
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/build-coach-kit.mts")) {
  const { disconnect } = await import("./appUnderTest.mjs");
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const baseAt = args.indexOf("--base");
  const base = baseAt >= 0 ? args[baseAt + 1] : process.env.APP_URL || "http://localhost:3000";
  try {
    if (!file) throw new Error("Usage: npm run build:coach-kit -- <kit.json> [--base https://memari.studio]");
    const kit = JSON.parse(readFileSync(file, "utf8")) as CoachKit;
    const host = (process.env.DATABASE_URL ?? "").match(/@([^/:?]+)/)?.[1] ?? "?";
    console.log(`Database: ${host}`);
    const built = await buildCoachKit(kit, base);
    console.log(`${built.rebuilt ? "Rebuilt" : "Built"} ${kit.key}: "${kit.business.name}" for ${kit.coach.name}.`);
    console.log(`Their link (works 14 days; shown once):\n${built.url}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await disconnect();
  }
}
