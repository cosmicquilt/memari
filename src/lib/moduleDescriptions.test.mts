// EVERY MODULE SAYS WHAT IT IS FOR, PLAINLY (2026-10-05). Andrew asked for
// descriptions on the modules; moduleDescriptions.ts holds them, one text
// for the palette's browser and the module pages. This pins:
//   - every module the palette offers has one, and nothing describes a
//     module that does not exist (a renamed slug would orphan its text);
//   - each is a short paragraph: whole sentences, 40 to 360 characters;
//   - none uses the vocabulary that marks machine-written text, the
//     "Ultimately" closers, or dashes for asides - the rules the Gemini
//     report on AI writing (2026-10-05) came down to;
//   - American spelling for the words most likely to slip.
//
// Run with: npx tsx src/lib/moduleDescriptions.test.mts

import { PALETTE_MODULES, REGISTERED_SLUGS } from "./moduleRegistry";
import { MODULE_DESCRIPTIONS } from "./moduleDescriptions";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL ${message}`);
  }
}

const BANNED = [
  /\bdelv(e|es|ed|ing)\b/i,
  /\bunderscor/i,
  /\bshowcas/i,
  /\btapestr/i,
  /\bcrucial/i,
  /\bmeticulous/i,
  /\bnavigat/i,
  /\bseamless/i,
  /\btestament\b/i,
  /\bintricate/i,
  /\bultimately\b/i,
  /\bin essence\b/i,
  /\bit is important to\b/i,
  /\bin today's\b/i,
  /\bjourney\b/i,
  /\bunlock/i,
  /\belevate/i,
  /—|–/, // asides set off by dashes
];
const BRITISH = [/\bcolour/i, /\bpractis/i, /\bfavourite/i, /\borganis/i, /\btotalled\b/i, /\bcentre\b/i];

const offered = PALETTE_MODULES.map((m) => m.slug);
for (const slug of offered) {
  const text = MODULE_DESCRIPTIONS[slug];
  check(typeof text === "string" && text.trim().length > 0, `${slug} has no description`);
  if (!text) continue;
  check(text.length >= 40 && text.length <= 360, `${slug}: ${text.length} characters - keep it between 40 and 360`);
  check(/[.?]$/.test(text), `${slug}: ends mid-sentence`);
  check(text === text.trim() && !/\s{2,}/.test(text), `${slug}: stray spaces`);
  for (const word of BANNED) check(!word.test(text), `${slug}: uses ${word}`);
  for (const word of BRITISH) check(!word.test(text), `${slug}: British spelling ${word}`);
}
for (const slug of Object.keys(MODULE_DESCRIPTIONS)) {
  check(REGISTERED_SLUGS.includes(slug), `${slug} is described but is not a module`);
  check(offered.includes(slug), `${slug} is described but the palette does not offer it`);
}

if (failures > 0) {
  console.error(`\n${failures} description check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`Module descriptions: all ${offered.length} palette modules described, plainly.`);
}
