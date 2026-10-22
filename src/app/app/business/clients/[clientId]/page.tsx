// memari. for businesses - one client: their details, their book, where it
// goes.

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BOOK_MONTHS, currentBusiness } from "@/lib/business";
import { countryOptions } from "@/lib/print/countries";
import { ClientForm, type ClientValues } from "../../forms";

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const business = (await currentBusiness())!.business!;
  const { clientId } = await params;
  const [client, templates] = await Promise.all([
    prisma.businessClient.findFirst({ where: { id: clientId, businessId: business.id } }),
    prisma.businessTemplate.findMany({ where: { businessId: business.id }, include: { planner: { select: { title: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!client) notFound();
  const values: ClientValues = {
    id: client.id,
    name: client.name,
    coverName: client.coverName,
    email: client.email,
    startDate: client.startDate ? client.startDate.toISOString().slice(0, 10) : null,
    bookMonths: client.bookMonths,
    templateId: client.templateId,
    note: client.note,
    address: (client.shippingAddress as ClientValues["address"]) ?? undefined,
  };
  return (
    <>
      <h1>{client.name}</h1>
      <ClientForm client={values} templates={templates.map((t) => ({ id: t.id, title: t.planner.title }))} countries={countryOptions()} months={BOOK_MONTHS} />
    </>
  );
}
