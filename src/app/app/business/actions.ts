"use server";

// memari. for businesses: what the business screens change. Each checks
// whose business it is (currentBusiness) and reads its input as untrusted.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { makeClientLink, turnOffClientLink } from "@/lib/clientPortal";
import { emailClientLink, type EmailLinkResult } from "@/lib/clientLinkSend";
import { PayoutsError, discardUnfinishedPayouts, payoutsDashboardUrl, payoutsSetupUrl } from "@/lib/payouts";
import { MAX_SHARE_CENTS, MIN_SHARE_CENTS } from "@/lib/print/clientPays";
import { appUrl } from "@/lib/print/fileUrls";
import { prisma } from "@/lib/prisma";
import { BOOK_MONTHS, currentBusiness } from "@/lib/business";
import { buildClientJournal, formerTemplateOf, updateClientJournal, updateClientsOf } from "@/lib/businessJournals";
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

/** Who pays for clients' books (2026-10-22): the coach, or the client from
 *  their own page - at Memari's price, or with the coach's share on top. A
 *  share is kept even before payouts are set up, and added to a client's
 *  price only once they are (payouts.ts shareInForce). */
export async function saveBookPayer(_: FormState, form: FormData): Promise<FormState> {
  const { business } = await myBusiness();
  const clientsPay = text(form, "who", 10) === "client";
  const withShare = clientsPay && text(form, "price", 10) === "share";
  let markupCents = 0;
  if (withShare) {
    const dollars = Number(text(form, "share", 12).replace(/[$,\s]/g, ""));
    const cents = Math.round(dollars * 100);
    if (!Number.isFinite(dollars) || cents < MIN_SHARE_CENTS || cents > MAX_SHARE_CENTS) return { error: `Your share is an amount from $${MIN_SHARE_CENTS / 100} to $${MAX_SHARE_CENTS / 100} a book.` };
    markupCents = cents;
  }
  await prisma.business.update({ where: { id: business.id }, data: { clientsPay, markupCents } });
  revalidatePath("/app/business", "layout");
  return { saved: true };
}

/** Off to Stripe to set up payouts for the coach's share, in their country. */
export async function startPayouts(country: string): Promise<{ error: string }> {
  const { owner, business } = await myBusiness();
  // A Stripe account for payouts is the person's, kept with their account;
  // a guest's business lives in a cookie that can be lost (review,
  // 2026-10-23).
  if (owner.guest) return { error: "Sign in to set up payouts: they belong to your account." };
  let url: string;
  try {
    const email = (await currentUser())?.primaryEmailAddress?.emailAddress ?? null;
    const list = await headers();
    const host = list.get("x-forwarded-host") ?? list.get("host");
    const proto = list.get("x-forwarded-proto") ?? "https";
    url = await payoutsSetupUrl(business.id, email, appUrl(host ? `${proto}://${host}` : undefined), String(country ?? "").toUpperCase().slice(0, 2));
  } catch (error) {
    return { error: error instanceof PayoutsError ? error.message : "Payouts could not be set up just now." };
  }
  redirect(url);
}

/** Start payouts again from the country question - only while Stripe has
 *  not been given their details (a coach who chose the wrong country). */
export async function resetPayouts(): Promise<{ error: string }> {
  const { owner, business } = await myBusiness();
  if (owner.guest) return { error: "Sign in to set up payouts." };
  try {
    await discardUnfinishedPayouts(business.id);
  } catch (error) {
    return { error: error instanceof PayoutsError ? error.message : "Payouts could not be started again just now." };
  }
  revalidatePath("/app/business/settings");
  return { error: "" };
}

/** The coach's own Stripe dashboard: payouts, their bank, tax forms. */
export async function openPayouts(): Promise<{ error: string }> {
  const { owner, business } = await myBusiness();
  if (owner.guest) return { error: "Sign in to see your payouts." };
  let url: string;
  try {
    url = await payoutsDashboardUrl(business.id);
  } catch (error) {
    return { error: error instanceof PayoutsError ? error.message : "Stripe could not be opened just now." };
  }
  redirect(url);
}

/** Add a client, or change one: `id` in the form says which. */
export async function saveClient(_: FormState, form: FormData): Promise<FormState> {
  const { owner, business } = await myBusiness();
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
    const found = await prisma.businessClient.findFirst({ where: { id, businessId: business.id }, select: { id: true, plannerId: true, templateId: true, template: { select: { plannerId: true } } } });
    if (!found) return { error: "That client is not one of yours." };
    await prisma.businessClient.update({ where: { id }, data });
    if (found.plannerId) {
      // The name on the cover is the journal's title, which every book's
      // cover prints: a correction reaches the next book (review, 2026-10-26).
      await prisma.planner.update({ where: { id: found.plannerId }, data: { title: data.coverName || name } });
      // Moved to another template: their journal is rebuilt from it, the old
      // one's pages taken away and their own kept (businessJournals.ts).
      if (templateId && templateId !== found.templateId) {
        try {
          await updateClientJournal(owner.id, id, { leaving: found.template?.plannerId ?? (await formerTemplateOf(found.plannerId)) });
        } catch (error) {
          // the template they were on, back: left naming the new one, a later
          // Update would add its pages beside the old one's (review, 2026-10-26)
          await prisma.businessClient.update({ where: { id }, data: { templateId: found.templateId } });
          return { error: error instanceof Error ? error.message : "Their journal could not be moved to that template." };
        }
      }
    }
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
/** Where a client's page lives, on whichever host this was asked from. */
async function portalUrl(token: string): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host");
  const proto = list.get("x-forwarded-proto") ?? "https";
  return `${appUrl(host ? `${proto}://${host}` : undefined)}/c/${token}`;
}

export async function makeLinkFor(clientId: string): Promise<{ url?: string; error?: string }> {
  const { owner } = await myBusiness();
  try {
    const token = await makeClientLink(owner.id, clientId);
    revalidatePath(`/app/business/clients/${clientId}`);
    return { url: await portalUrl(token) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The link could not be made." };
  }
}

/** Email a client their link (2026-10-22, "Email the client their link").
 *  Only the link's hash is kept, so the one they have cannot be sent again:
 *  this makes a new link - the old one stops working - and emails it, with
 *  replies going to the coach's own address when they are signed in. Not
 *  twice within a minute, so a double press is one email. If the email is
 *  not sent (email not set up here, or refused), the new link comes back to
 *  copy, and the coach is told so: the old link has stopped either way. */
export type { EmailLinkResult } from "@/lib/clientLinkSend";

/** Email a client their link (src/lib/clientLinkSend.ts: never from a
 *  guest, at most LINKS_PER_DAY a day). */
export async function emailLinkTo(clientId: string): Promise<EmailLinkResult> {
  const { owner, business } = await myBusiness();
  const result = await emailClientLink({
    owner,
    business,
    clientId,
    portalUrl,
    replyTo: async () => (owner.guest ? null : ((await currentUser())?.primaryEmailAddress?.emailAddress ?? null)),
  });
  revalidatePath(`/app/business/clients/${clientId}`);
  return result;
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
 *  journals, and clients who used it keep theirs - which no longer follow
 *  it (savedItems.ts: a client's journal follows its own template only).
 *  Returns the clients it was the template of, for the undo. */
export async function removeTemplate(templateId: string): Promise<{ clientIds: string[] }> {
  const { business } = await myBusiness();
  const clients = await prisma.businessClient.findMany({ where: { templateId, businessId: business.id }, select: { id: true } });
  await prisma.businessTemplate.deleteMany({ where: { id: templateId, businessId: business.id } });
  revalidatePath("/app/business", "layout");
  revalidatePath("/app");
  return { clientIds: clients.map((c) => c.id) };
}

/** Stop using's undo (review, 2026-10-26): the journal a template again, and
 *  its clients back on it - before, the undo made a new template that no
 *  client used. Only this business's clients still without a template. */
export async function restoreTemplate(plannerId: string, clientIds: string[]): Promise<{ error?: string }> {
  const { owner, business } = await myBusiness();
  const planner = await prisma.planner.findFirst({
    where: { id: plannerId, ownerId: owner.id, isTemplate: false, businessClient: { is: null }, businessTemplate: { is: null } },
    select: { id: true },
  });
  if (!planner) return { error: "That journal can't be a template again." };
  const template = await prisma.businessTemplate.create({ data: { businessId: business.id, plannerId: planner.id } });
  const ids = Array.isArray(clientIds) ? clientIds.filter((id): id is string => typeof id === "string").slice(0, 1000) : [];
  if (ids.length) await prisma.businessClient.updateMany({ where: { id: { in: ids }, businessId: business.id, templateId: null }, data: { templateId: template.id } });
  revalidatePath("/app/business", "layout");
  revalidatePath("/app");
  return {};
}
