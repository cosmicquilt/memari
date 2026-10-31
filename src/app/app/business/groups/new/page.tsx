// memari. for businesses - a new group, and its people, in one go.

import { prisma } from "@/lib/prisma";
import { BOOK_MONTHS, requireBusiness } from "@/lib/business";
import { countryOptions } from "@/lib/print/countries";
import { GroupForm } from "../GroupParts";

export default async function NewGroupPage() {
  const { business } = await requireBusiness();
  const [templates, clients] = await Promise.all([
    prisma.businessTemplate.findMany({ where: { businessId: business.id }, include: { planner: { select: { title: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.businessClient.findMany({ where: { businessId: business.id, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, group: { select: { name: true } } } }),
  ]);
  return (
    <>
      <h1>New group</h1>
      <GroupForm
        group={{}}
        templates={templates.map((t) => ({ id: t.id, title: t.planner.title }))}
        countries={countryOptions()}
        months={BOOK_MONTHS}
        clients={clients.map((c) => ({ id: c.id, name: c.name, email: c.email, group: c.group?.name ?? null }))}
      />
    </>
  );
}
