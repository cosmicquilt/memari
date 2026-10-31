// memari. for businesses - Clients > Import: a spreadsheet of clients
// (2026-10-30, src/lib/clientIntake.ts).

import Link from "next/link";
import { requireBusiness } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { ImportClients } from "../../ImportClients";
import css from "../../business.module.css";

export default async function ImportPage() {
  const { business } = await requireBusiness();
  const templates = await prisma.businessTemplate.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "asc" }, select: { id: true, planner: { select: { title: true } } } });
  return (
    <>
      <div className={css.head}>
        <h1>Import clients</h1>
        <Link href="/app/business/clients" className={css.btn}>
          Back to clients
        </Link>
      </div>
      <ImportClients templates={templates.map((t) => ({ id: t.id, title: t.planner.title }))} />
    </>
  );
}
