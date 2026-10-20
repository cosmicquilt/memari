"use server";

// The otter's quiz, on the server: the planner the answers make, drawn for
// the quiz's live preview, and made into a journal at the end. Both are
// public endpoints whatever their types say, so the answers are read
// through routedAnswers (only questions the route asks, only options they
// offer) and everything else is checked before use.

import type { FontChoice } from "@/lib/theme";
import { currentOwner } from "@/lib/owner";
import { GUEST_JOURNAL_LIMIT } from "@/lib/guest";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { isTimeZone } from "@/lib/timeZone";
import type { Answers } from "@/lib/otterQuiz";
import { layoutPreview, type LandingSpread } from "@/app/landing/spreads";
import type { PlannerPart } from "@/app/landing/plannerTemplates";
import { OTTER_PART_NAMES, planFromAnswers } from "./otterPlanner";
import { WeekUnavailable, createJournalFromParts, levelsForParts } from "./archetypeWeek";
import { JOURNAL_TITLE_MAX } from "./bookSeeding";
import { createEventFor } from "./calendarStore";
import { seedOwnerDefaultZone } from "./ownerSettings";

export type OtterPreview = {
  parts: Array<{ part: PlannerPart; name: string; spread: LandingSpread }>;
  guess: string;
  notes: string[];
  font: FontChoice;
};

/** Whatever was sent, as answers: lists of short strings, and the details
 *  the planner checks itself. */
function readAnswers(input: unknown): Answers {
  if (!input || typeof input !== "object") return {};
  const out: Answers = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key === "details") continue;
    if (Array.isArray(value)) (out as Record<string, string[]>)[key] = value.filter((v): v is string => typeof v === "string" && v.length < 40).slice(0, 12);
  }
  const details = (input as { details?: unknown }).details;
  if (details && typeof details === "object") out.details = details as Answers["details"];
  return out;
}

const readFont = (font: unknown): FontChoice | undefined => (font === "serif" || font === "sans" ? font : undefined);

/** The planner the answers make so far, drawn as the Layouts page draws a
 *  layout. */
export async function previewOtter(answers: unknown, font?: unknown): Promise<OtterPreview> {
  const owner = await currentOwner();
  if (!owner) throw new Error("Not signed in.");
  const plan = planFromAnswers(readAnswers(answers), readFont(font));
  return {
    parts: plan.parts.map(({ part, spread }) => ({ part, name: OTTER_PART_NAMES[part], spread: layoutPreview(spread) })),
    guess: plan.guess,
    notes: plan.notes,
    font: plan.font,
  };
}

export type OtterResult = { slug: string } | { error: string };

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** The first day on or after `startISO` that falls on one of `days`. */
function firstOf(startISO: string, days: number[]): string {
  const start = new Date(`${startISO}T00:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const day = new Date(start.getTime() + i * 86_400_000);
    if (days.includes(day.getUTCDay())) return day.toISOString().slice(0, 10);
  }
  return startISO;
}

/** The planner made: a journal of your own, its weekly events in your
 *  calendar and its day icons set. Retaking the quiz makes another; it
 *  never changes one you have. */
export async function createFromOtter(answers: unknown, title: unknown, font: unknown, timeZone: unknown): Promise<OtterResult> {
  const owner = await currentOwner();
  if (!owner) return { error: "Sign in, or continue as a guest, to make it." };
  if (owner.guest) {
    const count = await prisma.planner.count({ where: { ownerId: owner.id, isTemplate: false } });
    if (count >= GUEST_JOURNAL_LIMIT) return { error: `A guest can keep ${GUEST_JOURNAL_LIMIT} journals. Sign in to make more.` };
  }
  const plan = planFromAnswers(readAnswers(answers), readFont(font));
  const name = (typeof title === "string" ? title.trim() : "").slice(0, JOURNAL_TITLE_MAX) || "My planner";
  const zone = isTimeZone(timeZone) ? timeZone : null;
  // A first journal is where a default zone comes from, as in createJournal.
  await seedOwnerDefaultZone(owner.id, zone);
  let book;
  try {
    book = await createJournalFromParts(
      owner.id,
      plan.parts,
      {
        title: name,
        trim: "bound7x10",
        startISO: plan.startISO,
        endISO: plan.endISO,
        levels: levelsForParts(plan.parts),
        dated: plan.dated,
        weekStartDay: plan.weekStartDay,
        font: plan.font,
        browserTimeZone: zone,
      },
      "The otter's planner"
    );
  } catch (error) {
    if (error instanceof WeekUnavailable) {
      console.error("[otter]", error.message);
      return { error: "Part of this planner isn't available yet. Try again in a little while, or start blank." };
    }
    throw error;
  }
  if (plan.dayIcons.length > 0) {
    const theme = { ...((book.theme as Record<string, unknown> | null) ?? {}), dayIcons: plan.dayIcons };
    await prisma.planner.update({ where: { id: book.id }, data: { theme: theme as Prisma.InputJsonValue } });
  }
  if (plan.startISO) {
    for (const entry of plan.schedule) {
      const days = [...entry.days].sort((a, b) => a - b);
      await createEventFor(owner.id, book.id, {
        title: entry.title,
        date: firstOf(plan.startISO, days),
        start: entry.from,
        end: entry.to,
        allDay: false,
        rrule: `FREQ=WEEKLY;BYDAY=${days.map((d) => BYDAY[d]).join(",")}`,
      });
    }
  }
  return { slug: book.slug ?? book.id };
}
