"use server";

// memari. for businesses: what the business screens change. Each checks
// whose business it is (currentBusiness) and reads its input as untrusted.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { makeClientLink, turnOffClientLink } from "@/lib/clientPortal";
import { appUrl } from "@/lib/print/fileUrls";
import { prisma } from "@/lib/prisma";
import { BOOK_MONTHS, currentBusiness } from "@/lib/business";
import { buildClientJournal, updateClientsOf } from "@/lib/businessJournals";
import { COUNTRY_CODES } from "@/lib/print/countries";

export type FormState = { error?: string; saved?: boolean } | null;

const text = (form: FormData, key: string, max = 200) => String(form.get(key) ?? "").trim().slice(0, max);

async function mine() {
  const ctx = await currentBusiness();
  if (!ctx) redirect("/sign-in?redirect_url=%2Fapp%2Fbusiness");
  return ctx;
}

async function myBusiness() {
  const ctx = await mine();
  if (!ctx.business) redirect("/app/business");
  return ctx as { owner: typeof ctx.owner; business: NonNullable<typeof ctx.business> };
}

/** Start the business: its name. */
export async function startBusiness(_: FormState, form: FormData): Promise<FormState> {
  const { owner, business } = await mine();
  if (business) redirect("/app/business");
  const name = text(form, "name", 80);
  if (!name) return { error: "Give your business a name." };
  await prisma.business.create({ data: { ownerId: owner.id, name } });
  revalidatePath("/app/business", "layout");
  redirect("/app/business");
}

/** The business's name and logo. */
export async function saveBusinessSettings(_: FormState, form: FormData): Promise<FormState> {
  const { business } = await myBusiness();
  const name = text(form, "name", 80);
  const logoUrl = text(form, "logoUrl", 500);
  if (!name) return { error: "Your business needs a name." };
  if (logoUrl) {
    let url: URL | null = null;
    try {
      url = new URL(logoUrl);
    } catch {
      url = null;
    }
    if (!url || url.protocol !== "https:") return { error: "The logo's address should start with https://" };
  }
  await prisma.business.update({ where: { id: business.id }, data: { name, logoUrl: logoUrl || null } });
  revalidatePath("/app/business", "layout");
  return { saved: true };
}

/** Add a client, or change one: `id` in the form says which. */
export async function saveClient(_: FormState, form: FormData): Promise<FormState> {
  const { business } = await myBusiness();
  const id = text(form, "id", 40);
  const name = text(form, "name", 120);
  if (!name) return { error: "A client needs a name." };
  const email = text(form, "email", 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email address does not look right." };
  const months = Number(text(form, "bookMonths", 3));
  if (!(BOOK_MONTHS as readonly number[]).includes(months)) return { error: "Choose how long each book runs." };
  const startRaw = text(form, "startDate", 10);
  const startDate = startRaw ? new Date(`${startRaw}T00:00:00Z`) : null;
  if (startDate && Number.isNaN(startDate.getTime())) return { error: "That start date does not look right." };
  const templateId = text(form, "templateId", 40) || null;
  if (templateId && !(await prisma.businessTemplate.findFirst({ where: { id: templateId, businessId: business.id }, select: { id: true } })))
    return { error: "That template is not one of yours." };
  const countryCode = text(form, "countryCode", 2).toUpperCase();
  if (countryCode && !COUNTRY_CODES.includes(countryCode)) return { error: "Choose a country from the list." };
  const address = {
    name: text(form, "addressName", 120) || name,
    street1: text(form, "street1"),
    street2: text(form, "street2"),
    city: text(form, "city", 120),
    stateCode: text(form, "stateCode", 40),
    postcode: text(form, "postcode", 20),
    countryCode,
    phoneNumber: text(form, "phoneNumber", 40),
  };
  const hasAddress = address.street1 || address.city || address.postcode;
  const data = {
    name,
    coverName: text(form, "coverName", 120) || null,
    email: email || null,
    startDate,
    bookMonths: months,
    templateId,
    note: text(form, "note", 2000) || null,
    shippingAddress: hasAddress ? address : undefined,
  };
  if (id) {
    const found = await prisma.businessClient.findFirst({ where: { id, businessId: business.id }, select: { id: true } });
    if (!found) return { error: "That client is not one of yours." };
    await prisma.businessClient.update({ where: { id }, data });
  } else {
    await prisma.businessClient.create({ data: { ...data, businessId: business.id } });
  }
  revalidatePath("/app/business", "layout");
  redirect("/app/business/clients");
}

/** Build a client's journal from their template (businessJournals.ts). */
export async function buildJournalFor(clientId: string): Promise<{ error?: string }> {
  const { owner } = await myBusiness();
  try {
    await buildClientJournal(owner.id, clientId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Their journal could not be built." };
  }
  revalidatePath("/app/business", "layout");
  return {};
}

/** Bring every journal of a template's clients that is behind it up to
 *  date: its pages and settings (businessJournals.ts). How many changed. */
export async function updateTemplateClients(templateId: string): Promise<{ updated?: number; error?: string }> {
  const { owner } = await myBusiness();
  try {
    const updated = await updateClientsOf(owner.id, templateId);
    revalidatePath("/app/business", "layout");
    return { updated };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Their journals could not be updated." };
  }
}

/** A private link to a client's own page (clientPortal.ts): the full
 *  address, shown to the coach once - only its hash is kept. */
export async function makeLinkFor(clientId: string): Promise<{ url?: string; error?: string }> {
  const { owner } = await myBusiness();
  try {
    const token = await makeClientLink(owner.id, clientId);
    const list = await headers();
    const host = list.get("x-forwarded-host") ?? list.get("host");
    const proto = list.get("x-forwarded-proto") ?? "https";
    revalidatePath(`/app/business/clients/${clientId}`);
    return { url: `${appUrl(host ? `${proto}://${host}` : undefined)}/c/${token}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The link could not be made." };
  }
}

/** Turn a client's link off: their page closes. */
export async function turnOffLinkFor(clientId: string): Promise<void> {
  const { owner } = await myBusiness();
  await turnOffClientLink(owner.id, clientId);
  revalidatePath(`/app/business/clients/${clientId}`);
}

/** Archive a client, or bring one back (the undo). Their journal and books
 *  are kept either way. */
export async function setClientArchived(id: string, archived: boolean): Promise<void> {
  const { business } = await myBusiness();
  await prisma.businessClient.updateMany({ where: { id, businessId: business.id }, data: { archivedAt: archived ? new Date() : null } });
  revalidatePath("/app/business", "layout");
}

/** Make one of the owner's own journals a template. Not a client's journal,
 *  and not one already a template. */
export async function addTemplate(_: FormState, form: FormData): Promise<FormState> {
  const { owner, business } = await myBusiness();
  const plannerId = text(form, "plannerId", 40);
  const planner = await prisma.planner.findFirst({
    where: { id: plannerId, ownerId: owner.id, isTemplate: false, businessClient: { is: null }, businessTemplate: { is: null } },
    select: { id: true },
  });
  if (!planner) return { error: "Choose one of your journals." };
  await prisma.businessTemplate.create({ data: { businessId: business.id, plannerId: planner.id } });
  revalidatePath("/app/business", "layout");
  revalidatePath("/app");
  return { saved: true };
}

/** Stop using a journal as a template; the journal goes back to your own
 *  journals, and clients who used it keep theirs. */
export async function removeTemplate(templateId: string): Promise<void> {
  const { business } = await myBusiness();
  await prisma.businessTemplate.deleteMany({ where: { id: templateId, businessId: business.id } });
  revalidatePath("/app/business", "layout");
  revalidatePath("/app");
}
