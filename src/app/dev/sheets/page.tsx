// The hero's loose sheets, baked: the base week (heroExtras.ts, BASE_SPREAD)
// printed, written in and laid into the film - shown on the film's resting
// frame, and saved from here by scripts/build-hero-sheets.mts. ?seed= writes
// it in another way, to choose one (looseSheets.ts, BASE_SHEET).
//
// Development only: what it makes reaches memari.studio the way code does -
// saved into public/landing/sheets/, committed, pushed. In production this
// page is a 404.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { baseSheetSpread } from "@/app/landing/spreads";
import { BASE_SHEET } from "@/app/landing/looseSheets";
import { SheetsBake } from "./SheetsBake";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Loose sheets - Memari", robots: { index: false } };

export default async function SheetsPage({ searchParams }: { searchParams: Promise<{ seed?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const seed = Number((await searchParams).seed);
  return <SheetsBake spread={baseSheetSpread()} seed={Number.isInteger(seed) && seed > 0 ? seed : BASE_SHEET.seed} />;
}
