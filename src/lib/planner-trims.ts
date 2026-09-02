// Page sizes, kept OUT of actions.ts: a "use server" module may only export
// async functions, so a plain constant or a synchronous helper there fails
// at build time with "Server Actions must be async functions" - and neither
// tsc nor eslint can see it, because it is a framework rule rather than a
// type error. Found the hard way.

/**
 * The two page sizes a planner is exported at.
 *
 * Both are 24 dots of content wide - that is what lets one design serve
 * both - so Letter spends its extra width on margin rather than on layout.
 * The margins are not chosen, they are forced: 24 dots is 1800px, so a
 * 2550px page leaves (2550 - 1800) / 2 = 375px, and the same 375px
 * vertically leaves exactly 34 whole rows in 3300px. 7x10 carries 0.125in
 * of bleed on each edge (it is trimmed after binding); Letter has none,
 * because nothing is cut off a sheet you printed at home.
 */
export const PLANNER_TRIMS = {
  bound7x10: {
    label: "7 × 10 in",
    hint: "bound, ordered",
    widthPx: 2175, heightPx: 3075, gridRows: 36, marginPx: 187.5,
  },
  letter: {
    label: "US Letter",
    hint: "printed at home",
    widthPx: 2550, heightPx: 3300, gridRows: 34, marginPx: 375,
  },
} as const;

export type PlannerTrimKey = keyof typeof PLANNER_TRIMS;

export function trimKeyForWidth(widthPx: number): PlannerTrimKey {
  return Math.abs(widthPx - PLANNER_TRIMS.letter.widthPx) < 1 ? "letter" : "bound7x10";
}

