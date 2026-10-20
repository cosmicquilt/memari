// FEATURED, in the start dialog (2026-10-19: "in /app section add a default
// section called featured (same level as saved and create), containing the
// journals, pages/spreads, and modules created so far"). Server-only.
//
// What Memari has made, not what the person has: the prebuilt planners
// (plannerTemplates.ts), the layouts the gallery lists (starterLayouts.ts -
// weeks, months, days and pages), and every module the palette offers. The
// same lists /layouts shows, so the two never disagree; a spread held for a
// read-through is in neither.
//
// Plain data for the dialog, which is a client component: the spreads' and
// modules' pictures are fetched or drawn there, so none of that weight is
// in every /app load.

import { PART_NAMES, PLANNERS, coverSpreadOf, partsOf, plannerMakes } from "@/app/landing/plannerTemplates";
import { KIND_SECTIONS, LISTED_STARTERS, actionLabel, makesWhat, modulesOf, type StarterKind } from "@/app/landing/starterLayouts";
import { MODULE_GUIDES } from "@/lib/moduleGuides";
import { PALETTE_INFO } from "@/lib/paletteGroups";

export type FeaturedPlanner = {
  key: string;
  title: string;
  forWhom: string;
  line: string;
  /** The spread its card shows. */
  cover: string;
  /** Each part of the book, named, with the spread it is laid out as. */
  parts: Array<{ name: string; key: string }>;
  /** What "Use this planner" makes, in a sentence. */
  makes: string;
};

export type FeaturedLayout = {
  key: string;
  kind: StarterKind;
  title: string;
  line: string;
  hours: string | null;
  /** "Use this week". */
  action: string;
  makes: string;
  /** What is on it, by name, in the order placed. */
  modules: string[];
};

export type Featured = {
  planners: FeaturedPlanner[];
  layouts: FeaturedLayout[];
  /** The kinds, in the gallery's order, with their headings. */
  kinds: Array<{ kind: StarterKind; heading: string }>;
  /** How many modules the palette offers - the count beside "Modules",
   *  known before their pictures are. */
  moduleCount: number;
  /** Modules with a page of their own at /modules/<slug>. */
  guides: string[];
};

let built: Featured | null = null;

/** Built once per server: it is the same for everyone until a deploy. */
export function featuredItems(): Featured {
  built ??= {
    planners: PLANNERS.map((planner) => ({
      key: planner.key,
      title: planner.title,
      forWhom: planner.forWhom,
      line: planner.line,
      cover: coverSpreadOf(planner),
      parts: partsOf(planner).map(({ part, key }) => ({ name: PART_NAMES[part], key })),
      makes: plannerMakes(planner),
    })),
    layouts: LISTED_STARTERS.map((starter) => ({
      key: starter.key,
      kind: starter.kind,
      title: starter.title,
      line: starter.line,
      hours: starter.hours ?? null,
      action: actionLabel(starter.kind),
      makes: makesWhat(starter.kind),
      modules: modulesOf(starter.key).map((m) => m.name),
    })),
    kinds: KIND_SECTIONS.map(([kind, heading]) => ({ kind, heading })),
    moduleCount: PALETTE_INFO.length,
    guides: MODULE_GUIDES.map((guide) => guide.slug),
  };
  return built;
}
