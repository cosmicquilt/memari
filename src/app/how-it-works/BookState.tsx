"use client";

// THE BOOK THE PAGE IS ABOUT (2026-11-06). How it works shows one book all
// the way down - the counts in step 1, the pages in step 3, the cover and
// binding in step 4, the post in step 5, the renewal in step 6 and the
// price at the end - and changing it anywhere changes it everywhere. This
// holds it: the choices, the book they make (book.ts), the binding it can
// really be printed in, and its estimate (estimate.ts) in every binding.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Cover } from "@/app/covers/catalogue";
import { estimatePrice, type Estimate, type EstimateTable } from "@/lib/print/estimate";
import { coverDatesWords } from "@/lib/print/coverDates";
import { orderRange, renewalDate } from "@/lib/print/orderRange";
import { BINDING_SPECS, BINDINGS, shippedAbroad, type Binding, type PaperColour } from "@/lib/print/products";
import { planBook, type BookPlan } from "./book";

export type Choices = {
  front: number;
  back: number;
  month: boolean;
  monthExtra: number;
  week: boolean;
  weekExtra: number;
  day: boolean;
  dayExtra: number;
  /** 30, 90 or 365, or "other" for `otherDays` */
  length: number | "other";
  otherDays: number;
  /** ISO day */
  start: string;
  binding: Binding;
  paper: PaperColour;
  cover: string;
  ribbon: boolean;
  ribbonColour: RibbonColour;
  country: string;
  postcode: string;
  renew: boolean;
};

/** BookVault's five, the only ribbons either printer sews (hardbacks only). */
export const RIBBON_COLOURS = [
  ["red", "#a3262a"],
  ["black", "#1c1917"],
  ["blue", "#22408f"],
  ["green", "#235c3c"],
  ["white", "#f1ece1"],
] as const;
export type RibbonColour = (typeof RIBBON_COLOURS)[number][0];

/** How far a choice can go: the editor allows more, a calculator need not. */
export const LIMITS = { front: [0, 24], back: [0, 24], monthExtra: [0, 8], weekExtra: [0, 6], dayExtra: [0, 3], otherDays: [1, 731] } as const;

export type Option = { binding: Binding; problem: string | null; estimate: Estimate | null };

type Book = {
  choices: Choices;
  set: (patch: Partial<Choices>) => void;
  days: number;
  startDate: Date;
  plan: BookPlan;
  /** The binding it is printed in: thick wire-o past its 350 pages moves
   *  to standard paper, as the order screen does. */
  binding: Binding;
  moved: boolean;
  /** Why it cannot be printed in that binding, or null. */
  problem: string | null;
  estimate: Estimate | null;
  options: Option[];
  ribbonOn: boolean;
  covers: Cover[];
  cover: Cover;
  coverCount: number;
  countries: Array<{ code: string; name: string }>;
  countryName: string;
  datesWords: string;
  /** Today (UTC midnight) as the server saw it, so the page and the browser agree. */
  today: Date;
  abroad: boolean;
  renewOn: Date;
  quoted: string;
};

const BookContext = createContext<Book | null>(null);

export function useBook(): Book {
  const book = useContext(BookContext);
  if (!book) throw new Error("useBook outside BookProvider");
  return book;
}

function fitProblem(binding: Binding, printed: number, limits: Record<Binding, { min: number; max: number }>): string | null {
  const { min, max } = limits[binding];
  const name = binding === "wireo" ? "Thick paper" : BINDING_SPECS[binding].short;
  if (printed < min) return `${name} needs at least ${min} pages; this book has ${printed}.`;
  if (printed > max) return `${name} holds at most ${max} pages; this book has ${printed}.`;
  return null;
}

export function BookProvider({
  children,
  table,
  limits,
  covers,
  coverCount,
  countries,
  start,
  today,
}: {
  children: ReactNode;
  table: EstimateTable;
  limits: Record<Binding, { min: number; max: number }>;
  covers: Cover[];
  coverCount: number;
  countries: Array<{ code: string; name: string }>;
  /** ISO day the book starts on, first */
  start: string;
  /** ISO day */
  today: string;
}) {
  const [choices, setChoices] = useState<Choices>({
    front: 2,
    back: 1,
    month: true,
    monthExtra: 0,
    week: true,
    weekExtra: 0,
    day: true,
    dayExtra: 0,
    length: 90,
    otherDays: 120,
    start,
    binding: "wireo",
    paper: "cream",
    cover: covers[0].id,
    ribbon: false,
    ribbonColour: "red",
    country: "US",
    postcode: "",
    renew: false,
  });

  const book = useMemo<Book>(() => {
    const c = choices;
    const days = c.length === "other" ? Math.min(731, Math.max(1, Math.round(c.otherDays) || 1)) : c.length;
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(c.start) ? new Date(`${c.start}T00:00:00Z`) : new Date(`${start}T00:00:00Z`);
    const plan = planBook({
      front: c.front,
      back: c.back,
      month: c.month,
      monthExtra: c.monthExtra,
      week: c.week,
      weekExtra: c.weekExtra,
      day: c.day,
      dayExtra: c.dayExtra,
      start: startDate,
      days,
      // the app's default week (preferences.ts); the editor lets people pick Monday
      weekStartDay: 0,
    });
    const optionFor = (binding: Binding): Option => {
      const problem = fitProblem(binding, plan.printed, limits);
      const ribbon = c.ribbon && binding === "hardcover";
      return { binding, problem, estimate: problem ? null : estimatePrice(table, binding, c.country, plan.printed, ribbon) };
    };
    const options = BINDINGS.map(optionFor);
    let binding = c.binding;
    let moved = false;
    if (binding === "wireo" && plan.printed > limits.wireo.max && !fitProblem("wireoStandard", plan.printed, limits)) {
      binding = "wireoStandard";
      moved = true;
    }
    const chosen = optionFor(binding);
    const range = orderRange(startDate, days);
    const todayDate = new Date(`${today}T00:00:00Z`);
    const abroad = shippedAbroad(binding, c.country);
    return {
      choices: c,
      set: (patch) =>
        setChoices((old) => {
          const next = { ...old, ...patch };
          // a ribbon is sewn into a hardcover only: another binding takes it out
          if (patch.binding && patch.binding !== "hardcover") next.ribbon = false;
          return next;
        }),
      days,
      startDate,
      plan,
      binding,
      moved,
      problem: chosen.problem,
      estimate: chosen.estimate,
      options,
      ribbonOn: c.ribbon && binding === "hardcover",
      covers,
      cover: covers.find((cv) => cv.id === c.cover) ?? covers[0],
      coverCount,
      countries,
      countryName: countries.find((x) => x.code === c.country)?.name ?? c.country,
      datesWords: coverDatesWords(range),
      today: todayDate,
      abroad,
      renewOn: renewalDate(range, "MAIL", abroad, todayDate),
      quoted: table.quoted,
    };
  }, [choices, covers, coverCount, countries, limits, start, table, today]);

  return <BookContext.Provider value={book}>{children}</BookContext.Provider>;
}

// --- words, shared by the parts ------------------------------------------------

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export const dayMonth = (d: Date, year = false) => `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ""}`;

/** "17 to 26 Nov", "28 Nov to 3 Dec", from today. */
export function arrivalWords(today: Date, arrives: [number, number] | null): string | null {
  if (!arrives) return null;
  const a = new Date(today.getTime() + arrives[0] * 86_400_000);
  const b = new Date(today.getTime() + arrives[1] * 86_400_000);
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()} to ${dayMonth(b)}` : `${dayMonth(a)} to ${dayMonth(b)}`;
}

/** The binding as a person reads it: "Metal wire-o, thick paper", "Paperback, cream paper". */
export function bindingWords(binding: Binding, paper: PaperColour): string {
  const spec = BINDING_SPECS[binding];
  return binding === "paperback" || binding === "hardcover" ? `${spec.label}, ${paper} paper` : spec.label;
}

/** Who prints it and what happens at the border, as the order screen says it (printer.ts note). */
export function printerWords(binding: Binding, country: string): string {
  if (binding === "wireo" || binding === "wireoStandard") {
    if (country === "US") return "BookVault prints it in the UK and posts it with duties paid, so there's nothing to pay at the door.";
    if (country === "GB") return "BookVault prints it in the UK and posts it.";
    return "BookVault prints it in the UK and posts it. Any import charges are paid on delivery.";
  }
  return "Lulu prints and posts it. Printing takes 3 to 5 business days, then the post.";
}

export function makingWords(binding: Binding): string {
  return binding === "wireo" || binding === "wireoStandard" ? "BookVault makes it in the UK in about 6 working days." : "Lulu takes 3 to 5 business days to print it.";
}
