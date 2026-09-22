// Every action that writes a module row keeps linked pages linked.
//
// A use of a saved page is an ordinary page, so every action in actions.ts
// can edit one - and each has to hand the pages it wrote to syncLinkedPages,
// or that use quietly stops matching the others and the saved item. That is
// a rule about seventeen functions today and whichever one is written next,
// and it holds only if something reads them: this does, from the source.
//
// A function may instead be on the list below, with the reason it needs no
// sync. The reasons are checked too, where they can be.
//
// Run as part of: npm test
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "actions.ts"), "utf8");

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (!condition) {
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

/** Each exported function's name and body: from its declaration to the next
 *  top-level declaration. */
const starts = [...source.matchAll(/^export async function (\w+)\(/gm)];
const ends = [...source.matchAll(/^(?:export )?(?:async )?function \w+|^\/\/ -{10,}/gm)].map((m) => m.index!);
const bodies = new Map<string, string>();
for (const start of starts) {
  const end = ends.find((index) => index > start.index!) ?? source.length;
  bodies.set(start[1], source.slice(start.index!, end));
}

const WRITES_A_MODULE = /\b(?:prisma|tx)\.moduleInstance\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\(/;
const SYNCS = /\bsyncLinkedPages\(/;
/** Unlinks a page, which needs no sync: it stops being a use. */
const UNLINKS = /savedPageId: null, savedPageIndex: null/;

const EXEMPT: Record<string, { why: string; holds: (body: string) => boolean }> = {
  setPlannerTrim: {
    why: "a page changing size stops following its saved page first",
    holds: (body) => UNLINKS.test(body),
  },
  resetPlannerToTemplate: {
    why: "the spread being reset stops following its saved page first",
    holds: (body) => UNLINKS.test(body),
  },
  createLevelVariant: {
    why: "it writes only to the occurrence's new pages, which are its own",
    holds: (body) => !/savedPageId:/.test(body),
  },
};

const writers = [...bodies].filter(([, body]) => WRITES_A_MODULE.test(body)).map(([name]) => name);
check("found the actions to check", writers.length >= 13, `found ${writers.length}: ${writers.join(", ")}`);
for (const name of writers) {
  const body = bodies.get(name)!;
  const exempt = EXEMPT[name];
  if (exempt) {
    check(`${name} is exempt because ${exempt.why}`, exempt.holds(body));
    continue;
  }
  check(`${name} writes a module row and hands its pages to syncLinkedPages`, SYNCS.test(body));
}
for (const name of Object.keys(EXEMPT)) {
  check(`the exemption for ${name} is still needed`, writers.includes(name));
}

// A saved module's settings go to every use; the one place settings are
// written from the editor has to say so.
check(
  "updateModuleConfig gives a saved module's settings to every use",
  /spreadSavedModuleProps\(/.test(bodies.get("updateModuleConfig") ?? "")
);

if (failures > 0) {
  console.error(`${failures} linked-page check(s) failed.`);
  process.exit(1);
}
console.log(
  `All linked-page checks passed (${writers.length} actions write module rows; each syncs linked pages or unlinks first).`
);
