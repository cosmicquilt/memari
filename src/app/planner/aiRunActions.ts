"use server";

// What the open editor asks about a connected assistant's changes to its
// journal (src/lib/connector/journalRuns.ts), and its way of undoing them.

import { currentOwnerId } from "@/lib/owner";
import { prisma } from "@/lib/prisma";
import { aiRunStatus, undoRun, type AiRunStatus, type UndoResult } from "@/lib/connector/journalRuns";

async function ownedJournal(journalId: string): Promise<{ ownerId: string; id: string }> {
  const ownerId = await currentOwnerId();
  if (!ownerId) throw new Error("Not signed in");
  const planner = typeof journalId === "string" ? await prisma.planner.findFirst({ where: { id: journalId, ownerId, isTemplate: false }, select: { id: true } }) : null;
  if (!planner) throw new Error("Journal not found");
  return { ownerId, id: planner.id };
}

export async function journalAiStatus(journalId: string): Promise<AiRunStatus> {
  const { id } = await ownedJournal(journalId);
  return aiRunStatus(id);
}

export async function undoJournalAiRun(journalId: string, evenEditsSince: boolean): Promise<UndoResult> {
  const { ownerId, id } = await ownedJournal(journalId);
  return undoRun(ownerId, id, { evenEditsSince: evenEditsSince === true });
}
