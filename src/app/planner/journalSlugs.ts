// Journals' word addresses, on the server: giving one, and finding a
// journal by one. See src/lib/journalSlug.ts for what they look like.
//
// A journal made before addresses existed has none; the first time it is
// opened or listed it gets one, so there is nothing to backfill and an old
// /app/j/<id> link keeps working - it redirects to the new address.

import { prisma } from "@/lib/prisma";
import { makeJournalSlug } from "@/lib/journalSlug";

/** Prisma's error for a unique constraint already taken. */
function isTaken(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === "P2002";
}

/**
 * A fresh address that is not yet any journal's, chosen with `tries` goes
 * at most - for creating a journal with its slug. Two creations could still
 * pick the same one between this check and the insert; the insert's unique
 * index catches that, and createBookFor tries again (see withFreshSlug).
 */
export async function freeJournalSlug(tries = 8): Promise<string> {
  for (let attempt = 0; attempt < tries; attempt++) {
    const slug = makeJournalSlug();
    if (!(await prisma.planner.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  throw new Error("No free journal address was found - try again.");
}

/** Run `create` with a fresh slug, again with another if the one chosen was
 *  taken in the meantime. */
export async function withFreshSlug<T>(create: (slug: string) => Promise<T>, tries = 5): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await create(await freeJournalSlug());
    } catch (error) {
      if (!isTaken(error) || attempt >= tries - 1) throw error;
    }
  }
}

/** The journal's address, giving it one first if it has none. */
export async function journalSlugOf(plannerId: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await prisma.planner.findUnique({ where: { id: plannerId }, select: { slug: true } });
    if (!row) throw new Error("Journal not found");
    if (row.slug) return row.slug;
    try {
      // Only if it still has none: two requests at once give it one, not two.
      await prisma.planner.updateMany({ where: { id: plannerId, slug: null }, data: { slug: await freeJournalSlug() } });
    } catch (error) {
      if (!isTaken(error)) throw error;
    }
  }
  throw new Error("No free journal address was found - try again.");
}

/** The journal at `slug`, if it is this owner's - nobody else's, and never a
 *  template. */
export async function journalIdForSlug(ownerId: string, slug: string): Promise<string | null> {
  const row = await prisma.planner.findFirst({ where: { slug, ownerId, isTemplate: false }, select: { id: true } });
  return row?.id ?? null;
}
