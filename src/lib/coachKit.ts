// memari. for businesses - A COACH'S KIT (2026-10-31, the first coaches).
// One written description of the workspace we prepare for a coach: who they
// are, their business, their own framework as a journal - laid out as the
// planners' spreads are (challenges.ts), front pages and a week or a day -
// the questions their clients answer (clientAnswers.ts), and themselves as
// the first client. scripts/build-coach-kit.mts builds it; this reads it and
// says, before anything is made, what is wrong with it.
//
// A kit is the coach's words and their chapter's framework: kept as a JSON
// file out of the public repository (coach-kits/, ignored by git), with a
// made-up example in scripts/coach-kit.example.json.
//
// Pure: no database (tested in coachKit.test.mts).

import type { HeroLayout, HeroSpread } from "@/app/landing/heroSpreads";
import { UNWRITTEN } from "@/app/landing/plannerLibrary";
import { spreadPlacements, spreadProblems } from "@/app/landing/spreads";
import { BOOK_MONTHS } from "@/lib/business";
import { fillTargetOf, LIST_MAX } from "@/lib/clientAnswers";

export const KIT_PARTS = ["front", "month", "week", "day"] as const;
export type KitPart = (typeof KIT_PARTS)[number];

export type CoachKit = {
  /** Its name for the builder and the pilot page: lowercase, a-z 0-9 and -. */
  key: string;
  coach: { name: string; coverName?: string; email?: string };
  business: { name: string; logoUrl?: string };
  journal: {
    title: string;
    /** How long each of their books runs (1, 3, 6 or 12), 3 if left out. */
    months?: number;
    /** Each part of the book as a spread: at least the front or a week. */
    parts: Partial<Record<KitPart, HeroLayout>>;
  };
  /** Modules their clients fill in, found by part, kind and heading. */
  questions?: Array<{ part: KitPart; slug: string; heading?: string; prompt: string; max?: number }>;
  /** The coach as their own first client, so their own copy is one order
   *  away. Their first book's start, "2027-01-04"; next month's first
   *  Monday if left out. */
  firstClient?: { startDate?: string };
};

/** Which kind of spread each part is laid out as. */
const PART_KINDS: Record<KitPart, ReadonlyArray<HeroLayout["kind"]>> = { front: ["pages"], month: ["month"], week: ["week", "pages"], day: ["day"] };

const KEY = /^[a-z0-9][a-z0-9-]{1,40}$/;
const text = (v: unknown, max = 120) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;

/** The kit's spreads, as the planners' are: each part's layout, unwritten. */
export function kitSpreads(kit: CoachKit): Array<{ part: KitPart; spread: HeroSpread }> {
  return KIT_PARTS.flatMap((part) => {
    const layout = kit.journal?.parts?.[part];
    return layout ? [{ part, spread: { key: `coach-${kit.key}-${part}`, layout, ...UNWRITTEN } as HeroSpread }] : [];
  });
}

/** Everything wrong with a kit, in words; none when it can be built. */
export function kitProblems(raw: unknown): string[] {
  const kit = raw as CoachKit;
  const problems: string[] = [];
  if (!kit || typeof kit !== "object") return ["The kit is not a JSON object."];
  if (!KEY.test(String(kit.key ?? ""))) problems.push('"key" is lowercase letters, digits and dashes, 2 to 41 of them.');
  if (!text(kit.coach?.name)) problems.push('"coach.name" is needed.');
  if (kit.coach?.coverName !== undefined && !text(kit.coach.coverName)) problems.push('"coach.coverName", if given, is a name.');
  if (kit.coach?.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(kit.coach.email))) problems.push('"coach.email" does not look like an email address.');
  if (!text(kit.business?.name, 80)) problems.push('"business.name" is needed (80 characters at most).');
  if (kit.business?.logoUrl !== undefined && !/^https:\/\/[^\s]+$/.test(String(kit.business.logoUrl))) problems.push('"business.logoUrl", if given, starts with https://.');
  if (!text(kit.journal?.title, 120)) problems.push('"journal.title" is needed.');
  const months = kit.journal?.months ?? 3;
  if (!(BOOK_MONTHS as readonly number[]).includes(months)) problems.push('"journal.months" is 1, 3, 6 or 12.');
  const start = kit.firstClient?.startDate;
  if (start !== undefined && !(/^\d{4}-\d{2}-\d{2}$/.test(start) && !Number.isNaN(Date.parse(`${start}T00:00:00Z`)))) problems.push('"firstClient.startDate" is a date like 2027-01-04.');

  const parts = kit.journal?.parts ?? {};
  const unknown = Object.keys(parts).filter((p) => !(KIT_PARTS as readonly string[]).includes(p));
  if (unknown.length) problems.push(`"journal.parts" has parts no book has: ${unknown.join(", ")} (front, month, week, day).`);
  if (!parts.front && !parts.week && !parts.day) problems.push('"journal.parts" needs the front, a week or a day.');
  for (const part of KIT_PARTS) {
    const layout = parts[part];
    if (!layout) continue;
    if (!PART_KINDS[part].includes(layout.kind)) problems.push(`The ${part} is laid out as "${layout.kind}"; it takes ${PART_KINDS[part].join(" or ")}.`);
  }
  if (problems.length) return problems;
  const spreads = kitSpreads(kit);
  for (const { part, spread } of spreads) {
    try {
      for (const p of spreadProblems(spread)) problems.push(`The ${part}: ${p.replace(`${spread.key}: `, "")}.`);
    } catch (error) {
      problems.push(`The ${part} could not be laid out: ${error instanceof Error ? error.message : String(error)}.`);
    }
  }
  if (problems.length) return problems;

  // each question names one module of its part a client could fill
  const seen = new Set<string>();
  for (const [i, q] of (kit.questions ?? []).entries()) {
    const where = `Question ${i + 1}`;
    if (!text(q?.prompt, 200)) {
      problems.push(`${where} needs its "prompt", as the client reads it (200 characters at most).`);
      continue;
    }
    const spread = spreads.find((s) => s.part === q.part)?.spread;
    if (!spread) {
      problems.push(`${where} is on the ${q.part}, which the book doesn't have.`);
      continue;
    }
    if (!fillTargetOf(q.slug)) problems.push(`${where}: a ${q.slug} has nothing a client could fill in.`);
    const matches = spreadPlacements(spread).filter((p) => p.slug === q.slug && (!q.heading || String(p.props.heading ?? "").trim().toLowerCase() === q.heading.trim().toLowerCase()));
    if (matches.length === 0) problems.push(`${where}: the ${q.part} has no ${q.slug}${q.heading ? ` headed "${q.heading}"` : ""}.`);
    if (q.max !== undefined && !(Number.isInteger(q.max) && q.max >= 1 && q.max <= LIST_MAX)) problems.push(`${where}: "max" is 1 to ${LIST_MAX}.`);
    const id = `${q.part}|${q.slug}|${(q.heading ?? "").toLowerCase()}`;
    if (seen.has(id)) problems.push(`${where} asks about the same module as one before it.`);
    seen.add(id);
  }
  return problems;
}
