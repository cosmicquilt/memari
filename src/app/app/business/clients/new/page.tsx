// memari. for businesses - add a client.

import { prisma } from "@/lib/prisma";
import { BOOK_MONTHS, currentBusiness } from "@/lib/business";
import { countryOptions } from "@/lib/print/countries";
import { ClientForm } from "../../forms";

export default async function NewClientPage() {
  const business = (await currentBusiness())!.business!;
  const templates = await prisma.businessTemplate.findMany({
    where: { businessId: business.id },
    include: { planner: { select: { title: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <>
      <h1>Add client</h1>
      <ClientForm
        client={{ templateId: templates.length === 1 ? templates[0].id : null }}
        templates={templates.map((t) => ({ id: t.id, title: t.planner.title }))}
        countries={countryOptions()}
        months={BOOK_MONTHS}
      />
    </>
  );
}
