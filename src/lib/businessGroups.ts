// memari. for businesses - GROUPS THAT START TOGETHER (v2, 2026-10-31: his
// "all" for v2, after the coach research - a cohort, a workshop, a retreat).
//
// A group's people are added in one go: a list pasted in (one a line, a name
// and maybe an email - straight from a spreadsheet's two columns too), or
// chosen from the clients already here. Someone already a client joins as
// they are (matched as an import matches them, clientIntake.ts keyOf); the
// rest are made. The group's template, start date and length are written
// onto each of them, so every client screen, their page and their journal
// read as they did before groups; changing the group's changes theirs. A
// client is in one group at most: joining another moves them.
//
// Where its books go is the group's: each to its client's own address, or
// all to one place (bookAddressOf, business.ts). Its books are ordered
// together, in one payment (src/lib/print/groupOrders.ts).
//
// SERVER-ONLY (the reading of a pasted list and of the form is pure, and
// tested: businessGroups.test.mts).

import { prisma } from "@/lib/prisma";
import { BOOK_MONTHS, shippableAddress } from "@/lib/business";
import { formerTemplateOf, updateClientJournal } from "@/lib/businessJournals";
import { keyOf } from "@/lib/clientIntake";
import { COUNTRY_CODES } from "@/lib/print/countries";

/** A group holds at most this many people: a cohort or a room, and one
 *  payment's books (a Stripe page lists at most 100 lines). */
export const GROUP_MAX_MEMBERS = 60;

export type Person = { name: string; email: string | null };

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const HEADINGS = new Set(["name", "names", "full name", "client", "email", "e-mail", "email address"]);

/**
 * A pasted list, one person a line: a name, and an email if there is one,
 * in whichever order - "Maya Okafor, maya@example.com", "Maya Okafor
 * <maya@example.com>", or two cells pasted from a spreadsheet (a tab
 * between). A first line of column headings is passed over, blank lines too,
 * and someone listed twice is listed once.
 */
export function membersFromLines(text: string): { members: Person[]; problems: Array<{ line: number; error: string }> } {
  const members: Person[] = [];
  const problems: Array<{ line: number; error: string }> = [];
  const seen = new Set<string>();
  const lines = String(text ?? "").split(/\r\n|\n|\r/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cells = line
      .split(/\t|,|;|<|>/)
      .map((c) => c.replace(/^["'\s]+|["'\s]+$/g, "").trim())
      .filter(Boolean);
    if (i === 0 && cells.length > 0 && cells.every((c) => HEADINGS.has(c.toLowerCase()))) return;
    const at = cells.filter((c) => c.includes("@"));
    if (at.length > 1) return problems.push({ line: i + 1, error: `Line ${i + 1} has two email addresses: one person a line.` });
    if (at.length === 1 && !EMAIL.test(at[0])) return problems.push({ line: i + 1, error: `Line ${i + 1}: "${at[0]}" does not look like an email address.` });
    const name = cells
      .filter((c) => !c.includes("@"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    if (!name) return problems.push({ line: i + 1, error: `Line ${i + 1} needs a name${at[0] ? ` for ${at[0]}` : ""}.` });
    const person = { name, email: at[0]?.toLowerCase() ?? null };
    const key = keyOf(person);
    if (seen.has(key)) return;
    seen.add(key);
    members.push(person);
  });
  return { members, problems };
}

/** A group's settings, as its form gives them. */
export type GroupDetails = {
  name: string;
  templateId: string | null;
  startDate: Date | null;
  bookMonths: number;
  shipToVenue: boolean;
  /** As typed; complete whenever shipToVenue is on. */
  venueAddress: { name: string; street1: string; street2: string; city: string; stateCode: string; postcode: string; countryCode: string; phoneNumber: string } | null;
};

/** The group form read, with the client form's own rules (actions.ts
 *  saveClient): a name, a length the shop sells, a real date, a country
 *  Memari posts to - and, to send every book to one place, all of that
 *  place's address. `field` gives a form field's text. */
export function groupDetailsFrom(field: (key: string, max?: number) => string): { details: GroupDetails } | { error: string } {
  const name = field("name", 80);
  if (!name) return { error: "Give the group a name." };
  const bookMonths = Number(field("bookMonths", 3));
  if (!(BOOK_MONTHS as readonly number[]).includes(bookMonths)) return { error: "Choose how long each book runs." };
  const startRaw = field("startDate", 10);
  const startDate = startRaw ? new Date(`${startRaw}T00:00:00Z`) : null;
  if (startDate && (Number.isNaN(startDate.getTime()) || startDate.toISOString().slice(0, 10) !== startRaw)) return { error: "That start date does not look right." };
  const shipToVenue = field("shipTo", 10) === "venue";
  const countryCode = field("countryCode", 2).toUpperCase();
  const venueAddress = {
    name: field("addressName", 120),
    street1: field("street1"),
    street2: field("street2"),
    city: field("city", 120),
    stateCode: field("stateCode", 40),
    postcode: field("postcode", 20),
    countryCode,
    phoneNumber: field("phoneNumber", 40),
  };
  const typed = !!(venueAddress.street1 || venueAddress.city || venueAddress.postcode);
  if (countryCode && !COUNTRY_CODES.includes(countryCode)) return { error: "Choose a country from the list." };
  if (shipToVenue && !shippableAddress(venueAddress)) {
    const missing = [
      !venueAddress.name && "who it's for",
      !venueAddress.street1 && "street",
      !venueAddress.city && "city",
      !venueAddress.postcode && "postcode",
      !venueAddress.countryCode && "country",
      !venueAddress.phoneNumber && "phone (carriers ask for one)",
    ].filter(Boolean);
    return { error: `To send every book to one place, give its whole address: ${missing.join(", ")}.` };
  }
  return { details: { name, templateId: field("templateId", 40) || null, startDate, bookMonths, shipToVenue, venueAddress: typed ? venueAddress : null } };
}

/** What a group writes onto each of its people: its length always, its start
 *  and template when it has them (a group without a template leaves each on
 *  their own). */
const onEach = (group: { startDate: Date | null; bookMonths: number; templateId: string | null }) => ({
  bookMonths: group.bookMonths,
  ...(group.startDate ? { startDate: group.startDate } : {}),
  ...(group.templateId ? { templateId: group.templateId } : {}),
});

type Moved = { added: number; joined: number; problems: string[] };

/** Their journals onto the group's template, for those whose journal was
 *  built from another - rebuilt from it, their own pages kept, as moving one
 *  client does (actions.ts saveClient). One that will not move goes back to
 *  its template, and is named. */
async function moveJournals(ownerId: string, groupTemplateId: string | null, people: Array<{ id: string; name: string; plannerId: string | null; templateId: string | null; template: { plannerId: string } | null }>): Promise<string[]> {
  const problems: string[] = [];
  if (!groupTemplateId) return problems;
  for (const c of people) {
    if (!c.plannerId || c.templateId === groupTemplateId) continue;
    try {
      await updateClientJournal(ownerId, c.id, { leaving: c.template?.plannerId ?? (await formerTemplateOf(c.plannerId)) });
    } catch (error) {
      await prisma.businessClient.update({ where: { id: c.id }, data: { templateId: c.templateId } });
      problems.push(`${c.name}'s journal stayed on its template: ${error instanceof Error ? error.message : "it could not be moved"}`);
    }
  }
  return problems;
}

/** People into a group: those already clients join (and leave any other
 *  group), the rest are made; then whoever was on another template has their
 *  journal moved to the group's. */
export async function addToGroup(ownerId: string, businessId: string, groupId: string, people: { members: Person[]; clientIds: string[] }): Promise<Moved | { error: string }> {
  const group = await prisma.businessGroup.findFirst({ where: { id: groupId, businessId } });
  if (!group) return { error: "That group is not one of yours." };
  const existing = await prisma.businessClient.findMany({
    where: { businessId, archivedAt: null },
    select: { id: true, name: true, email: true, groupId: true, plannerId: true, templateId: true, template: { select: { plannerId: true } } },
  });
  const byKey = new Map(existing.map((c) => [keyOf(c), c]));
  const chosen = new Set(people.clientIds);
  const joining = new Map(existing.filter((c) => chosen.has(c.id)).map((c) => [c.id, c]));
  const toMake: Person[] = [];
  for (const m of people.members) {
    const found = byKey.get(keyOf(m));
    if (found) joining.set(found.id, found);
    else toMake.push(m);
  }
  const already = existing.filter((c) => c.groupId === groupId).length;
  const newcomers = [...joining.values()].filter((c) => c.groupId !== groupId);
  if (already + newcomers.length + toMake.length > GROUP_MAX_MEMBERS) return { error: `A group holds up to ${GROUP_MAX_MEMBERS} people; this would make ${already + newcomers.length + toMake.length}.` };
  const each = onEach(group);
  if (toMake.length) await prisma.businessClient.createMany({ data: toMake.map((m) => ({ businessId, groupId, name: m.name, email: m.email, ...each })) });
  if (newcomers.length) await prisma.businessClient.updateMany({ where: { id: { in: newcomers.map((c) => c.id) }, businessId }, data: { groupId, ...each } });
  const problems = await moveJournals(ownerId, group.templateId, newcomers);
  return { added: toMake.length, joined: newcomers.length, problems };
}

/** A new group, and its people, in one go. */
export async function createGroup(ownerId: string, businessId: string, details: GroupDetails, people: { members: Person[]; clientIds: string[] }): Promise<({ groupId: string } & Moved) | { error: string }> {
  if (details.templateId && !(await prisma.businessTemplate.findFirst({ where: { id: details.templateId, businessId }, select: { id: true } }))) return { error: "That template is not one of yours." };
  if (people.members.length + people.clientIds.length === 0) return { error: "Add the people in the group: a name a line, or choose clients you have." };
  const group = await prisma.businessGroup.create({ data: { businessId, ...details, venueAddress: details.venueAddress ?? undefined } });
  const moved = await addToGroup(ownerId, businessId, group.id, people);
  if ("error" in moved) {
    await prisma.businessGroup.delete({ where: { id: group.id } });
    return moved;
  }
  return { groupId: group.id, ...moved };
}

/** The group's settings changed: written onto each of its people, whose
 *  journals move with a new template. */
export async function saveGroupDetails(ownerId: string, businessId: string, groupId: string, details: GroupDetails): Promise<{ problems: string[] } | { error: string }> {
  const group = await prisma.businessGroup.findFirst({ where: { id: groupId, businessId } });
  if (!group) return { error: "That group is not one of yours." };
  if (details.templateId && !(await prisma.businessTemplate.findFirst({ where: { id: details.templateId, businessId }, select: { id: true } }))) return { error: "That template is not one of yours." };
  // the place is kept when the books go home again, as typed last
  await prisma.businessGroup.update({ where: { id: groupId }, data: { ...details, venueAddress: details.venueAddress ?? group.venueAddress ?? undefined } });
  const people = await prisma.businessClient.findMany({
    where: { groupId, businessId, archivedAt: null },
    select: { id: true, name: true, plannerId: true, templateId: true, template: { select: { plannerId: true } } },
  });
  if (people.length) await prisma.businessClient.updateMany({ where: { groupId, businessId, archivedAt: null }, data: onEach(details) });
  return { problems: await moveJournals(ownerId, details.templateId, people) };
}

/** Out of the group: they stay a client, with its settings. */
export async function leaveGroup(businessId: string, groupId: string, clientId: string): Promise<boolean> {
  const left = await prisma.businessClient.updateMany({ where: { id: clientId, groupId, businessId }, data: { groupId: null } });
  return left.count === 1;
}

/** The group gone: its people stay clients, with its settings, and its books
 *  stay theirs. */
export async function deleteGroup(businessId: string, groupId: string): Promise<boolean> {
  const gone = await prisma.businessGroup.deleteMany({ where: { id: groupId, businessId } });
  return gone.count === 1;
}
