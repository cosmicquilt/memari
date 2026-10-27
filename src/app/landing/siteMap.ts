// THE SITE MAP (2026-10-26): every page of the site in one place, read by
// the header, the phone menu and the footer, so the three can never
// disagree again - the modules, the planners and the coach side had gone
// missing from both header and footer because each kept its own list.
// Andrew chose the header (option A): a Layouts menu, Covers, How it works
// and Help, "For coaches" quiet beside Sign in, and Pricing in the footer
// only ("i also don't want pricing"). The proposal and its research:
// https://claude.ai/artifact/ChVzfVCh2ru5wBRwNz7GpV
//
// Client-safe and small on purpose: the shelves and spreads are written out
// here rather than imported from plannerTemplates/starterLayouts, which
// would carry every planner into the header's bundle. siteMap.test.mts
// checks them against those files, so a shelf added there fails the test
// until it is added here.

export type SiteLink = { href: string; label: string };
export type MenuCard = SiteLink & { note: string };

/** The Layouts menu: whole planners by shelf, spreads by kind, and the
 *  other ways to start. Each heading links to its place on /layouts. */
export const LAYOUTS_MENU = {
  planners: { href: "/layouts#planners", label: "Planners", note: "whole books, by shelf" },
  /** [label, the shelf's id on /layouts] - plannerTemplates' PLANNER_GROUPS and shelfId. */
  shelves: [
    ["Planning", "planning"],
    ["Growth", "growth"],
    ["Philosophy", "philosophy"],
    ["School & work", "school-work"],
    ["Family & life", "family-life"],
    ["Health", "health"],
    ["Money", "money"],
    ["Hobbies & home", "hobbies-home"],
    ["Faith", "faith"],
    ["Recovery", "recovery"],
  ] as const,
  spreads: { href: "/layouts#week", label: "Spreads", note: "one page or two" },
  /** [label, the section's id on /layouts] - starterLayouts' KIND_SECTIONS. */
  kinds: [
    ["Weeks", "week"],
    ["Months", "month"],
    ["Days", "day"],
    ["Pages of modules", "pages"],
  ] as const,
  start: [
    { href: "/quiz", label: "Take the quiz", note: "The otter asks a few questions and builds a planner with you." },
    { href: "/modules", label: "Modules", note: "Every piece a page is built from, each explained." },
    { href: "/app", label: "A blank page", note: "Design every page yourself." },
  ] satisfies MenuCard[],
};

/** The header's plain links, after the Layouts menu. */
export const HEADER_LINKS: SiteLink[] = [
  { href: "/covers", label: "Covers" },
  { href: "/#how", label: "How it works" },
  { href: "/help", label: "Help" },
];

/** Quiet, beside Sign in: the existing start page for now; a public page
 *  for coaches is the proposal's phase 2. */
export const FOR_COACHES: SiteLink = { href: "/app/business", label: "For coaches" };

/** Which header item a page belongs to: Layouts stays lit on a layout's
 *  page, a planner shelf and a module's page. "How it works" is a section
 *  of the home page, so no address is ever it. */
export function headerSection(path: string): "layouts" | "/covers" | "/help" | null {
  const under = (base: string) => path === base || path.startsWith(`${base}/`);
  if (under("/layouts") || under("/modules")) return "layouts";
  if (under("/covers")) return "/covers";
  if (under("/help")) return "/help";
  return null;
}

/** The footer, as the whole site map, in the groups people look for
 *  things in. Privacy and Terms are on the line under it. */
export const FOOTER_COLUMNS: Array<{ heading: string; links: SiteLink[] }> = [
  {
    heading: "Make",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/layouts", label: "Layouts" },
      { href: "/layouts#planners", label: "Planners" },
      { href: "/modules", label: "Modules" },
      { href: "/covers", label: "Covers" },
      { href: "/quiz", label: "Take the quiz" },
      { href: "/app", label: "Open Memari" },
    ],
  },
  {
    heading: "Printed books",
    links: [
      { href: "/pricing", label: "Pricing" },
      { href: "/help#shipping", label: "Shipping & delivery" },
      { href: "/help#returns", label: "Returns & reprints" },
      { href: "/print", label: "Print it yourself" },
      { href: "/print/test-page", label: "Test print page" },
    ],
  },
  {
    heading: "Support",
    links: [
      { href: "/help", label: "Help & FAQ" },
      { href: "/app/account/orders", label: "Your orders" },
      { href: "mailto:hello@memari.studio", label: "Contact" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About" },
      FOR_COACHES,
    ],
  },
];

export const LEGAL_LINKS: SiteLink[] = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];
