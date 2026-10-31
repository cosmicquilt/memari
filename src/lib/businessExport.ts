// memari. for businesses - A COACH TAKES THEIR WORK WITH THEM (2026-10-30).
// Three coaching platforms closed in 2025 (Practice.do on 3 November after a
// few weeks' notice, Nudge Coach in April, Profi in December), and coaches
// noticed. So everything a coach puts in can come out: their clients as a
// spreadsheet here, and every journal as a PDF through /app/export (the
// client's page and the editor both link to it).
//
// Their group and their answers to the template's questions go too
// (2026-10-31): the answers are the client's own words, which a coach
// leaving would most want to keep.
//
// SERVER-ONLY (clientRowsFor reads the database; toCsv and answersText are
// pure).

import { prisma } from "@/lib/prisma";
import { shippableAddress } from "@/lib/business";
import { answersOf, questionsOf, type Answers, type Question } from "@/lib/clientAnswers";

/** One client, as the spreadsheet has them. */
export type ClientRow = {
  name: string;
  coverName: string;
  email: string;
  template: string;
  startDate: string;
  bookMonths: number;
  address: { name: string; street1: string; street2: string; city: string; state: string; postcode: string; country: string; phone: string };
  note: string;
  archived: string;
  linkLastOpened: string;
  booksOrdered: number;
  lastBook: string;
  group: string;
  /** Their answers, a line a question (answersText). */
  answers: string;
};

const HEADINGS = [
  "Name",
  "Name on the cover",
  "Email",
  "Template",
  "First book starts",
  "Months a book",
  "Ship to",
  "Street",
  "Street 2",
  "City",
  "State",
  "Postcode",
  "Country",
  "Phone",
  "Note",
  "Archived",
  "Their page last opened",
  "Books ordered",
  "Latest book",
  "Group",
  "Answers",
];

/** A client's answers in one cell, a line a question: "What matters most
 *  each week? Run before work; Call my sister". An answer to a question the
 *  template no longer asks is kept, said to be an earlier one. */
export function answersText(questions: Question[], answers: Answers): string {
  const said = (answer: Answers[string]) => [answer].flat().join("; ");
  const asked = questions.flatMap((q) => (q.id in answers ? [`${q.prompt}${/[?:]$/.test(q.prompt) ? "" : ":"} ${said(answers[q.id])}`] : []));
  const earlier = Object.keys(answers)
    .filter((id) => !questions.some((q) => q.id === id))
    .map((id) => `An earlier question: ${said(answers[id])}`);
  return [...asked, ...earlier].join("\n");
}

/** A cell: quoted when it holds a comma, quote or line break (RFC 4180),
 *  and a leading = + - @ made plain text, so a spreadsheet never runs a
 *  client's name as a formula. */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The spreadsheet: a byte-order mark so Excel reads it as UTF-8 (accents,
 *  apostrophes), CRLF lines as the RFC says. */
export function toCsv(rows: ClientRow[]): string {
  const lines = [HEADINGS, ...rows.map((r) => [r.name, r.coverName, r.email, r.template, r.startDate, r.bookMonths, r.address.name, r.address.street1, r.address.street2, r.address.city, r.address.state, r.address.postcode, r.address.country, r.address.phone, r.note, r.archived, r.linkLastOpened, r.booksOrdered, r.lastBook, r.group, r.answers])];
  return `﻿${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/** Every client of the business, archived ones too, oldest first. */
export async function clientRowsFor(businessId: string): Promise<ClientRow[]> {
  const clients = await prisma.businessClient.findMany({
    where: { businessId },
    orderBy: { createdAt: "asc" },
    include: { template: { select: { questions: true, planner: { select: { title: true } } } }, group: { select: { name: true } } },
  });
  const journals = clients.map((c) => c.plannerId).filter((id): id is string => !!id);
  const orders = journals.length
    ? await prisma.printOrder.findMany({
        where: { plannerId: { in: journals }, status: { in: ["PAID", "SUBMITTED", "IN_PRODUCTION", "SHIPPED", "DELIVERED"] } },
        select: { plannerId: true, startDate: true, endDate: true },
        orderBy: { startDate: "asc" },
      })
    : [];
  return clients.map((c) => {
    const theirs = orders.filter((o) => o.plannerId === c.plannerId);
    const last = theirs[theirs.length - 1];
    const a = shippableAddress(c.shippingAddress);
    return {
      name: c.name,
      coverName: c.coverName ?? "",
      email: c.email ?? "",
      template: c.template?.planner.title ?? "",
      startDate: day(c.startDate),
      bookMonths: c.bookMonths,
      address: { name: a?.name ?? "", street1: a?.street1 ?? "", street2: a?.street2 ?? "", city: a?.city ?? "", state: a?.stateCode ?? "", postcode: a?.postcode ?? "", country: a?.countryCode ?? "", phone: a?.phoneNumber ?? "" },
      note: c.note ?? "",
      archived: day(c.archivedAt),
      linkLastOpened: day(c.accessSeenAt),
      booksOrdered: theirs.length,
      lastBook: last ? `${day(last.startDate)} to ${day(last.endDate)}` : "",
      group: c.group?.name ?? "",
      answers: answersText(questionsOf(c.template?.questions), answersOf(c.answers)),
    };
  });
}
