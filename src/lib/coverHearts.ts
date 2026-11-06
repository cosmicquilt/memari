// HEARTED COVERS (2026-11-05, part 3 of the covers work; his pick: "Kept
// with you, first when ordering"). A heart on /covers is kept for whoever is
// asking - an account, or a guest made by the heart itself (siteSave.ts) -
// and moves to the account on sign-in (owner.ts moveGuestWork). The order
// screen's Cover picker shows them first.
//
// Only covers in the catalogue can be hearted, so one person holds at most
// one row per cover (85 today), with no limit of its own needed. A heart on a
// cover since taken out of the catalogue stays in the table but is not shown,
// and comes back if the cover does.
//
// SERVER-ONLY.

import { prisma } from "@/lib/prisma";
import { coverById } from "@/app/covers/catalogue";

/** The cover a request names, if it is one of ours: `{ coverId: "Onyx009" }`. */
export function heartedCoverOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { coverId?: unknown }).coverId;
  return typeof id === "string" && coverById(id) ? id : null;
}

/** This owner's hearted covers, newest first - the order the covers page
 *  and the order screen show them in. */
export async function heartedCovers(ownerId: string): Promise<string[]> {
  const rows = await prisma.coverHeart.findMany({
    where: { ownerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { coverId: true },
  });
  return rows.map((row) => row.coverId).filter((id) => coverById(id) !== null);
}

/** Heart it. Twice is once: two quick taps, or two tabs, cannot make two
 *  rows or an error (the pair is unique; a duplicate is skipped). */
export async function heartCover(ownerId: string, coverId: string): Promise<void> {
  await prisma.coverHeart.createMany({ data: [{ ownerId, coverId }], skipDuplicates: true });
}

export async function unheartCover(ownerId: string, coverId: string): Promise<void> {
  await prisma.coverHeart.deleteMany({ where: { ownerId, coverId } });
}
