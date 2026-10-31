"use server";

// memari. for businesses - what the group screens change (groups,
// 2026-10-31; src/lib/businessGroups.ts, src/lib/print/groupOrders.ts). Each
// checks whose business it is and reads its input as untrusted.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { currentBusiness } from "@/lib/business";
import { addToGroup, createGroup, deleteGroup, groupDetailsFrom, leaveGroup, membersFromLines, saveGroupDetails, type Person } from "@/lib/businessGroups";
import { appUrl } from "@/lib/print/fileUrls";
import { OrderError } from "@/lib/print/orderBook";
import { PriceMovedError } from "@/lib/print/orders";
import { openGroupPayment, prepareGroupBook, quoteGroupOrder, startGroupBatch, type GroupQuote } from "@/lib/print/groupOrders";
import type { ShippingLevel } from "@/lib/print/orderRange";
import type { Binding, PaperColour } from "@/lib/print/products";
import type { FormState } from "../actions";

const fieldOf = (form: FormData) => (key: string, max = 200) => String(form.get(key) ?? "").trim().slice(0, max);

async function myBusiness() {
  const ctx = await currentBusiness();
  if (!ctx) redirect("/sign-in?redirect_url=%2Fapp%2Fbusiness%2Fgroups");
  if (!ctx.business) redirect("/app/business");
  return ctx as { owner: typeof ctx.owner; business: NonNullable<typeof ctx.business> };
}

/** The people a form adds: a pasted list, and clients ticked. A list with a
 *  line that can't be read adds nobody, and says which line. */
function peopleFrom(form: FormData): { members: Person[]; clientIds: string[] } | { error: string } {
  const { members, problems } = membersFromLines(String(form.get("people") ?? "").slice(0, 20_000));
  if (problems.length) return { error: problems.slice(0, 3).map((p) => p.error).join(" ") + (problems.length > 3 ? ` And ${problems.length - 3} more.` : "") };
  const clientIds = form
    .getAll("clientId")
    .map((v) => String(v).slice(0, 40))
    .filter(Boolean)
    .slice(0, 200);
  return { members, clientIds };
}

/** A new group and its people, in one go; then its page, building their
 *  journals. */
export async function createGroupAction(_: FormState, form: FormData): Promise<FormState> {
  const { owner, business } = await myBusiness();
  const read = groupDetailsFrom(fieldOf(form));
  if ("error" in read) return read;
  const people = peopleFrom(form);
  if ("error" in people) return people;
  const made = await createGroup(owner.id, business.id, read.details, people);
  if ("error" in made) return made;
  revalidatePath("/app/business", "layout");
  redirect(`/app/business/groups/${made.groupId}?build=1`);
}

/** The group's settings: written onto each of its people. */
export async function saveGroupAction(_: FormState, form: FormData): Promise<FormState> {
  const { owner, business } = await myBusiness();
  const read = groupDetailsFrom(fieldOf(form));
  if ("error" in read) return read;
  const saved = await saveGroupDetails(owner.id, business.id, fieldOf(form)("id", 40), read.details);
  revalidatePath("/app/business", "layout");
  if ("error" in saved) return saved;
  return saved.problems.length ? { error: `Saved, but ${saved.problems.join(" ")}` } : { saved: true };
}

/** More people into the group. */
export async function addPeopleAction(_: FormState, form: FormData): Promise<FormState> {
  const { owner, business } = await myBusiness();
  const people = peopleFrom(form);
  if ("error" in people) return people;
  if (people.members.length + people.clientIds.length === 0) return { error: "Add someone: a name a line, or tick a client." };
  const moved = await addToGroup(owner.id, business.id, fieldOf(form)("id", 40), people);
  revalidatePath("/app/business", "layout");
  if ("error" in moved) return moved;
  return moved.problems.length ? { error: `Added, but ${moved.problems.join(" ")}` } : { saved: true };
}

/** Out of the group, at once; the undo puts them back. */
export async function leaveGroupAction(groupId: string, clientId: string): Promise<void> {
  const { business } = await myBusiness();
  await leaveGroup(business.id, String(groupId), String(clientId));
  revalidatePath("/app/business", "layout");
}

export async function rejoinGroupAction(groupId: string, clientId: string): Promise<void> {
  const { owner, business } = await myBusiness();
  await addToGroup(owner.id, business.id, String(groupId), { members: [], clientIds: [String(clientId)] });
  revalidatePath("/app/business", "layout");
}

/** The group gone; its people stay clients. */
export async function deleteGroupAction(groupId: string): Promise<void> {
  const { business } = await myBusiness();
  await deleteGroup(business.id, String(groupId));
  revalidatePath("/app/business", "layout");
  redirect("/app/business/groups");
}

// ---- ORDERING A GROUP'S BOOKS ---------------------------------------------

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; again?: boolean };

/** Errors a coach can act on are said; anything else is logged and said
 *  generally. `again`: the price or the people moved, so back to See prices. */
function failure(error: unknown, doing: string): { ok: false; error: string; again?: boolean } {
  if (error instanceof OrderError) return { ok: false, error: error.message, ...(error instanceof PriceMovedError ? { again: true } : {}) };
  console.error(`[groups] ${doing} failed:`, error);
  return { ok: false, error: `Something went wrong ${doing}. Try again in a moment.` };
}

/** Signed in: a payment of many books belongs to an account. Outside each
 *  action's try, as it may redirect (sign in, no business yet), and a
 *  redirect caught there would read as a failure. */
async function orderingCoach(): Promise<{ ownerId: string } | { ok: false; error: string }> {
  const ctx = await myBusiness();
  if (ctx.owner.guest) return { ok: false, error: "Sign in to order a group's books: a payment for many books belongs to your account." };
  return { ownerId: ctx.owner.id };
}

export async function quoteGroup(groupId: string, o: { startISO: string; binding: Binding; paper?: PaperColour }): Promise<Result<GroupQuote>> {
  const coach = await orderingCoach();
  if (!("ownerId" in coach)) return coach;
  try {
    return { ok: true, value: await quoteGroupOrder(coach.ownerId, String(groupId), { startISO: String(o.startISO), binding: o.binding, paper: o.paper }) };
  } catch (error) {
    return failure(error, "pricing the group's books");
  }
}

export async function startGroupOrder(groupId: string): Promise<Result<{ batchId: string }>> {
  const coach = await orderingCoach();
  if (!("ownerId" in coach)) return coach;
  try {
    return { ok: true, value: { batchId: await startGroupBatch(coach.ownerId, String(groupId)) } };
  } catch (error) {
    return failure(error, "starting the order");
  }
}

export async function prepareBook(
  batchId: string,
  clientId: string,
  o: { startISO: string; days: number; binding: Binding; paper?: PaperColour; level: ShippingLevel; expectCents: number }
): Promise<Result<{ orderId: string; totalCents: number }>> {
  const coach = await orderingCoach();
  if (!("ownerId" in coach)) return coach;
  try {
    const email = (await currentUser())?.primaryEmailAddress?.emailAddress ?? undefined;
    return { ok: true, value: await prepareGroupBook(coach.ownerId, String(batchId), String(clientId), { ...o, email }) };
  } catch (error) {
    return failure(error, "making the book");
  }
}

export async function payForGroup(batchId: string, expectTotalCents: number): Promise<Result<{ url: string }>> {
  const coach = await orderingCoach();
  if (!("ownerId" in coach)) return coach;
  try {
    const email = (await currentUser())?.primaryEmailAddress?.emailAddress ?? undefined;
    const list = await headers();
    const host = list.get("x-forwarded-host") ?? list.get("host");
    const proto = list.get("x-forwarded-proto") ?? "https";
    const origin = appUrl(host ? `${proto}://${host}` : undefined);
    return { ok: true, value: { url: await openGroupPayment(coach.ownerId, String(batchId), Number(expectTotalCents), origin, email) } };
  } catch (error) {
    return failure(error, "opening the payment page");
  }
}
