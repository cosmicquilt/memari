// memari. for businesses - CLIENTS WITHOUT TYPING (2026-10-30). A coach adds
// clients two more ways than the form: a spreadsheet (Clients > Import), and
// a private web address that Zapier, Make or their own tools post to when
// someone buys a package (/api/business/clients/<token>). His call, after
// the coach research, before the first test group: coaches won't retype
// what their booking tool already knows.
//
// Both go through here, with the form's own rules (actions.ts saveClient):
// a name is required, an email must look like one, a book runs 1, 3, 6 or
// 12 months, a country is one Memari posts to. A client already there (the
// same email, or the same name with no email) is skipped, so a spreadsheet
// imported twice, or a purchase Zapier sends again, adds nobody twice.
//
// The web address is a token like a client's page link (clientPortal.ts):
// only its SHA-256 is kept, a new one replaces the old, and turning it off
// clears it.
//
// SERVER-ONLY (the parsing and reading of fields is pure, and tested).

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { BOOK_MONTHS } from "@/lib/business";
import { COUNTRY_CODES, countryOptions } from "@/lib/print/countries";

/** A spreadsheet holds at most this many clients at a time. */
export const IMPORT_MAX_ROWS = 500;
/** The web address adds at most this many clients a day. */
export const INTAKE_PER_DAY = 200;

/** One client as the form would save it. */
export type IntakeClient = {
  name: string;
  coverName: string | null;
  email: string | null;
  startDate: Date | null;
  bookMonths: number;
  note: string | null;
  /** A template named by its journal's title, matched without case. */
  template: string | null;
  shippingAddress: { name: string; street1: string; street2: string; city: string; stateCode: string; postcode: string; countryCode: string; phoneNumber: string } | null;
};

// ---------------------------------------------------------------- reading

/** A CSV file's rows (RFC 4180): quoted cells with commas, quotes and line
 *  breaks inside, CRLF or LF, a byte-order mark at the start ignored. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** The names a column goes by, in coaches' own spreadsheets and booking
 *  tools, and in Memari's own export (businessExport.ts) - so a coach's
 *  download goes straight back in. Compared without case, spaces or marks. */
const FIELD_NAMES: Record<string, string[]> = {
  name: ["name", "fullname", "clientname", "client", "customername", "customer"],
  firstName: ["firstname", "givenname", "first"],
  lastName: ["lastname", "surname", "familyname", "last"],
  coverName: ["nameonthecover", "covername", "cover"],
  email: ["email", "emailaddress", "mail"],
  startDate: ["firstbookstarts", "startdate", "start", "starts", "startson"],
  bookMonths: ["monthsabook", "bookmonths", "months", "booklength", "length"],
  note: ["note", "notes", "comment", "comments"],
  template: ["template", "planner", "program", "programme"],
  addressName: ["shipto", "addressname", "recipient"],
  street1: ["street", "street1", "address", "address1", "addressline1", "streetaddress", "line1"],
  street2: ["street2", "address2", "addressline2", "line2", "apt", "apartment", "suite", "unit"],
  city: ["city", "town", "locality"],
  stateCode: ["state", "statecode", "province", "region", "county"],
  postcode: ["postcode", "zip", "zipcode", "postalcode", "postal"],
  countryCode: ["country", "countrycode"],
  phoneNumber: ["phone", "phonenumber", "telephone", "mobile", "cell"],
};
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const FIELD_OF = new Map(Object.entries(FIELD_NAMES).flatMap(([field, names]) => names.map((n) => [n, field] as const)));

/** A heading row's columns, as fields; unknown columns are null. */
export function fieldsOf(headings: string[]): Array<string | null> {
  return headings.map((h) => FIELD_OF.get(squash(h)) ?? null);
}

/** A cell as the coach typed it: our own export makes = + - @ plain text by
 *  putting an apostrophe in front (businessExport.ts csvCell); taken off. */
const cellText = (raw: unknown) => {
  const text = String(raw ?? "").trim();
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
};

const COUNTRY_BY_NAME = new Map<string, string>([
  ...countryOptions().map((c) => [squash(c.name), c.code] as const),
  ["usa", "US"],
  ["unitedstatesofamerica", "US"],
  ["america", "US"],
  ["uk", "GB"],
  ["england", "GB"],
  ["scotland", "GB"],
  ["wales", "GB"],
  ["greatbritain", "GB"],
]);

/** "US", "us", "United States", "USA" -> "US"; unknown -> null. */
export function countryCodeOf(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.length === 2 && COUNTRY_CODES.includes(text.toUpperCase())) return text.toUpperCase();
  return COUNTRY_BY_NAME.get(squash(text)) ?? null;
}

/** 2027-01-04, or 1/4/2027 as Americans write it; anything else is null. */
export function dateOf(raw: string): Date | null | "bad" {
  const text = raw.trim();
  if (!text) return null;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/.exec(text);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us) [y, m, d] = [Number(us[3]), Number(us[1]), Number(us[2])];
  else return "bad";
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : "bad";
}

/** One client from named fields - a spreadsheet row, or what a tool posts.
 *  Field names are matched as the spreadsheet's headings are. */
export function clientFrom(raw: Record<string, unknown>): { ok: true; client: IntakeClient } | { ok: false; error: string } {
  const by: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = FIELD_OF.get(squash(key));
    if (field && by[field] === undefined && value !== null && typeof value !== "object") by[field] = cellText(value);
  }
  const name = (by.name || [by.firstName, by.lastName].filter(Boolean).join(" ")).slice(0, 120).trim();
  if (!name) return { ok: false, error: "No name." };
  const email = (by.email ?? "").slice(0, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: `${name}: the email "${email}" doesn't look right.` };
  const start = dateOf(by.startDate ?? "");
  if (start === "bad") return { ok: false, error: `${name}: the start date "${by.startDate}" isn't a date (use 2027-01-04 or 1/4/2027).` };
  const monthsText = (by.bookMonths ?? "").replace(/months?/i, "").trim();
  const months = monthsText ? Number(monthsText) : 3;
  if (!(BOOK_MONTHS as readonly number[]).includes(months)) return { ok: false, error: `${name}: a book runs 1, 3, 6 or 12 months, not "${by.bookMonths}".` };
  const street1 = (by.street1 ?? "").slice(0, 200);
  const city = (by.city ?? "").slice(0, 120);
  const postcode = (by.postcode ?? "").slice(0, 20);
  let shippingAddress: IntakeClient["shippingAddress"] = null;
  if (street1 || city || postcode) {
    const countryCode = countryCodeOf(by.countryCode ?? "") ?? (by.countryCode ? null : "US");
    if (!countryCode) return { ok: false, error: `${name}: Memari can't post to "${by.countryCode}".` };
    shippingAddress = {
      name: (by.addressName || name).slice(0, 120),
      street1,
      street2: (by.street2 ?? "").slice(0, 200),
      city,
      stateCode: (by.stateCode ?? "").slice(0, 40),
      postcode,
      countryCode,
      phoneNumber: (by.phoneNumber ?? "").slice(0, 40),
    };
  }
  return {
    ok: true,
    client: {
      name,
      coverName: (by.coverName ?? "").slice(0, 120) || null,
      email: email || null,
      startDate: start,
      bookMonths: months,
      note: (by.note ?? "").slice(0, 2000) || null,
      template: (by.template ?? "").slice(0, 200) || null,
      shippingAddress,
    },
  };
}

/** A spreadsheet's clients, and its rows that can't be one, by row number. */
export function clientsFromCsv(text: string): { clients: IntakeClient[]; problems: Array<{ row: number; error: string }>; unknownColumns: string[] } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { clients: [], problems: [{ row: 1, error: "The file is empty." }], unknownColumns: [] };
  const headings = rows[0];
  const fields = fieldsOf(headings);
  if (!fields.includes("name") && !(fields.includes("firstName") || fields.includes("lastName"))) {
    return { clients: [], problems: [{ row: 1, error: 'The first row should name the columns, with one called "Name".' }], unknownColumns: [] };
  }
  const clients: IntakeClient[] = [];
  const problems: Array<{ row: number; error: string }> = [];
  rows.slice(1, IMPORT_MAX_ROWS + 1).forEach((cells, i) => {
    const raw = Object.fromEntries(headings.map((h, c) => [h, cells[c] ?? ""]));
    const read = clientFrom(raw);
    if (read.ok) clients.push(read.client);
    else problems.push({ row: i + 2, error: read.error });
  });
  if (rows.length - 1 > IMPORT_MAX_ROWS) problems.push({ row: IMPORT_MAX_ROWS + 2, error: `Only ${IMPORT_MAX_ROWS} clients at a time: split the file.` });
  return { clients, problems, unknownColumns: headings.filter((_, c) => !fields[c] && headings[c].trim()) };
}

// ---------------------------------------------------------------- adding

/** The key a client is known by: their email, or their name without one. */
/** Who a client is, for "already here": their email, or their name when
 *  there is no email. Groups match their members the same way. */
export const keyOf = (c: { name: string; email: string | null }) => (c.email ? `e:${c.email.toLowerCase()}` : `n:${c.name.toLowerCase().replace(/\s+/g, " ")}`);

/** Adds the clients a business doesn't have yet; returns who was added and
 *  who was already there. A named template that isn't the coach's leaves
 *  the client on `fallbackTemplateId`. */
export async function addClients(businessId: string, clients: IntakeClient[], fallbackTemplateId: string | null): Promise<{ added: Array<{ id: string; name: string }>; skipped: string[] }> {
  const [existing, templates] = await Promise.all([
    prisma.businessClient.findMany({ where: { businessId, archivedAt: null }, select: { name: true, email: true } }),
    prisma.businessTemplate.findMany({ where: { businessId }, select: { id: true, planner: { select: { title: true } } } }),
  ]);
  if (fallbackTemplateId && !templates.some((t) => t.id === fallbackTemplateId)) fallbackTemplateId = null;
  const known = new Set(existing.map(keyOf));
  const added: Array<{ id: string; name: string }> = [];
  const skipped: string[] = [];
  for (const c of clients) {
    const key = keyOf(c);
    if (known.has(key)) {
      skipped.push(c.name);
      continue;
    }
    known.add(key);
    const named = c.template ? templates.find((t) => t.planner.title.trim().toLowerCase() === c.template!.trim().toLowerCase()) : undefined;
    const made = await prisma.businessClient.create({
      data: {
        businessId,
        name: c.name,
        coverName: c.coverName,
        email: c.email,
        startDate: c.startDate,
        bookMonths: c.bookMonths,
        note: c.note,
        templateId: named?.id ?? fallbackTemplateId,
        ...(c.shippingAddress ? { shippingAddress: c.shippingAddress } : {}),
      },
      select: { id: true, name: true },
    });
    added.push(made);
  }
  return { added, skipped };
}

// ---------------------------------------------------------------- the web address

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** A new address for the business, replacing any old one: the token is
 *  shown once, and only its hash is kept. */
export async function makeIntakeToken(businessId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.business.update({ where: { id: businessId }, data: { intakeTokenHash: hashOf(token), intakeMadeAt: new Date() } });
  return token;
}

/** The address off: nothing posted to it adds anyone. */
export async function turnOffIntake(businessId: string): Promise<void> {
  await prisma.business.update({ where: { id: businessId }, data: { intakeTokenHash: null, intakeMadeAt: null } });
}

/** The business an address belongs to, or null. */
export async function businessForIntakeToken(token: string): Promise<{ id: string; name: string } | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  return prisma.business.findUnique({ where: { intakeTokenHash: hashOf(token) }, select: { id: true, name: true } });
}

/** Clients the business added in the last day, by any way: the address's
 *  daily limit counts them all, so a loop in someone's Zap stops at it. */
export async function clientsToday(businessId: string): Promise<number> {
  return prisma.businessClient.count({ where: { businessId, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
}

/** The template a client from the address goes on when it names none:
 *  the business's first. */
export async function firstTemplateOf(businessId: string): Promise<string | null> {
  return (await prisma.businessTemplate.findFirst({ where: { businessId }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id ?? null;
}
