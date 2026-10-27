// The site map (siteMap.ts) and the covers catalogue (covers/catalogue.ts):
// every link goes to a page that exists, the menus match the planner shelves
// and the layout kinds they stand for, and every carousel cover has a group,
// a name and an address of its own.
//
// Run as part of: npm test

import { existsSync } from "node:fs";
import { FOOTER_COLUMNS, FOR_COACHES, HEADER_LINKS, LAYOUTS_MENU, LEGAL_LINKS, headerSection } from "./siteMap";
import { PLANNERS, PLANNER_GROUPS, plannerShelves, shelfId } from "./plannerTemplates";
import { KIND_SECTIONS } from "./starterLayouts";
import { LEGAL_CONTACT } from "../legal/LegalPage";
import covers from "./coverCarousel.json";
import { COVERS, COVER_GROUPS, FROZEN_SLUGS, MATERIAL_GROUP, coverById, coverBySlug, coverSlugOf, describeBrand } from "../covers/catalogue";

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failures++;
    console.error(`FAIL ${what}`);
  }
};

// every link is a page this app has (a path's page.tsx under src/app, the
// dynamic segments aside), or the contact address
const pageFor = (href: string): boolean => {
  if (href.startsWith("mailto:")) return true;
  const path = href.split("#")[0].split("?")[0];
  const dir = `src/app${path === "/" ? "" : path}`;
  return existsSync(`${dir}/page.tsx`) || existsSync(`${dir}/route.ts`);
};
const every: Array<{ href: string; label: string }> = [
  ...HEADER_LINKS,
  FOR_COACHES,
  LAYOUTS_MENU.planners,
  LAYOUTS_MENU.spreads,
  ...LAYOUTS_MENU.start,
  ...FOOTER_COLUMNS.flatMap((c) => c.links),
  ...LEGAL_LINKS,
];
for (const link of every) check(pageFor(link.href), `${link.label} (${link.href}) goes to a page that exists`);

// the menu's shelves are the planner shelves, in their order, with their ids
const shelves = plannerShelves(PLANNERS).map((s) => s.group);
check(LAYOUTS_MENU.shelves.length === PLANNER_GROUPS.length, `the menu lists all ${PLANNER_GROUPS.length} shelves (${LAYOUTS_MENU.shelves.length})`);
for (const [i, group] of PLANNER_GROUPS.entries()) {
  const entry = LAYOUTS_MENU.shelves[i];
  check(entry?.[0] === group && entry?.[1] === shelfId(group), `shelf ${i + 1} is ${group} at #${shelfId(group)} (${entry?.join(" #")})`);
  check(shelves.includes(group), `${group} has planners, so its place on /layouts exists`);
}
// and its spreads are the layout kinds, with their section ids
check(LAYOUTS_MENU.kinds.length === KIND_SECTIONS.length && KIND_SECTIONS.every(([kind], i) => LAYOUTS_MENU.kinds[i]?.[1] === kind), `the spreads are the layout kinds: ${KIND_SECTIONS.map(([k]) => k).join(", ")}`);

// Andrew's header (2026-10-26): Covers in it, Pricing not
check(HEADER_LINKS.some((l) => l.href === "/covers"), "Covers is in the header");
check(!HEADER_LINKS.some((l) => l.href === "/pricing"), "Pricing is not in the header (his call)");
check(FOOTER_COLUMNS.some((c) => c.links.some((l) => l.href === "/pricing")), "but Pricing is in the footer");
// pages missing from both header and footer until now
for (const href of ["/modules", "/layouts#planners", "/quiz", "/covers", "/app/business"]) {
  check(FOOTER_COLUMNS.some((c) => c.links.some((l) => l.href === href)), `${href} is in the footer`);
}
check(FOOTER_COLUMNS.some((c) => c.links.some((l) => l.href === `mailto:${LEGAL_CONTACT}`)), "Contact writes to the legal contact address");
check(headerSection("/layouts/week-adhd") === "layouts" && headerSection("/modules/habit-tracker") === "layouts" && headerSection("/covers/onyx-4") === "/covers", "Layouts stays lit on a layout's and a module's page; Covers on a cover's");
check(headerSection("/") === null && headerSection("/pricing") === null, "the home page and Pricing light nothing");

// the covers: one for each carousel picture, every material in a group
check(COVERS.length === (covers as unknown[]).length, `every carousel cover is on the page (${COVERS.length})`);
const materials = new Set((covers as Array<{ name: string }>).map((c) => c.name));
for (const m of materials) check(COVER_GROUPS.includes(MATERIAL_GROUP[m]), `the material "${m}" has a group`);
check(new Set(COVERS.map((c) => c.slug)).size === COVERS.length, "every cover has an address of its own");
check(COVERS.every((c) => /^[a-z]+(-[a-z]+)*-\d+$/.test(c.slug) && coverBySlug(c.slug) === c && coverSlugOf(c.id) === c.slug), "addresses read like onyx-4 and lead back to their cover");
check(COVERS.every((c) => existsSync(`public${c.image}`)), "every cover's picture is in public/landing/covers");
check(!COVERS.some((c) => /\d{3}/.test(c.name)), "names are material and number, never the scan's code");
// THE ADDRESSES ARE FROZEN (coverSlugs.json): a new scan must be given its
// address there, so one added or dropped never re-points a published link.
const unfrozen = (covers as Array<{ id: string }>).filter((c) => !FROZEN_SLUGS[c.id]).map((c) => c.id);
check(unfrozen.length === 0, `every carousel cover's address is written in covers/coverSlugs.json${unfrozen.length ? ` - add: ${unfrozen.join(", ")}` : ""}`);
const frozen = Object.values(FROZEN_SLUGS);
check(new Set(frozen).size === frozen.length, "no address is given to two scans");
check(COVERS.every((c) => FROZEN_SLUGS[c.id] === undefined || (c.slug === FROZEN_SLUGS[c.id] && c.slug.startsWith(`${c.material.toLowerCase().replace(/\s+/g, "-")}-`))), "each cover keeps its frozen address, of its own material");
check(COVERS.every((c) => c.name === `${c.material} ${c.slug.slice(c.slug.lastIndexOf("-") + 1)}`), "a cover's name is its address in words (onyx-4: Onyx 4)");
check(coverById("Onyx004")?.slug === "onyx-4" && coverById("Onyx004")?.name === "Onyx 4", "Onyx004 is onyx-4, Onyx 4, as first published");
const b1 = describeBrand("m-centre+dates blind");
check(b1.mark === "m. in the centre" && b1.dated && b1.finish === "imprint", "m-centre+dates blind: m. in the centre, dated, imprint");
const b2 = describeBrand("wordmark sans foil dark");
check(b2.mark === '"memari." in sans' && !b2.dated && b2.finish === "gold" && b2.finishName === "Dark gold", "wordmark sans foil dark: memari. in sans, dark gold");
check(describeBrand("m-corner foil deep").finishName === "Deep gold" && describeBrand("m-corner foil deep").mark === "m. in the corner", "m-corner foil deep: in the corner, deep gold");

if (failures) {
  console.error(`\n${failures} site map check(s) failed.`);
  process.exit(1);
}
console.log(`All site map checks passed (${every.length} links to real pages, ${LAYOUTS_MENU.shelves.length} shelves, ${COVERS.length} covers in ${COVER_GROUPS.length} groups).`);
