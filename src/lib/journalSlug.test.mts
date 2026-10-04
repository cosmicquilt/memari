// Journal addresses in words (2026-10-04): frosty-otter-4821. The lists are
// clean, the addresses are well formed, and - asked in the same breath as
// the feature, "make sure it doesn't have black monkey in it or something" -
// nothing that reads as an insult can ever be put together.
//
// Run with: npx tsx src/lib/journalSlug.test.mts

import { BLOCKED_SLUG_NUMBER, SLUG_DESCRIBERS, SLUG_THINGS, isJournalSlug, makeJournalSlug } from "./journalSlug";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL ${message}`);
  }
}
process.on("exit", () => {
  if (failures > 0) {
    console.error(`\n${failures} journal-address check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("All journal-address checks passed (clean lists, nothing insulting, well-formed, numbers clear of codes).");
  }
});

const words = [...SLUG_DESCRIBERS, ...SLUG_THINGS];

// --- the lists -----------------------------------------------------------------
{
  check(words.every((w) => /^[a-z]+$/.test(w)), "every word is lowercase letters");
  check(new Set(SLUG_DESCRIBERS).size === SLUG_DESCRIBERS.length && new Set(SLUG_THINGS).size === SLUG_THINGS.length, "no word twice in a list");
  check(SLUG_DESCRIBERS.every((w) => !SLUG_THINGS.includes(w)), "no word in both lists, so no address repeats one");
  const combinations = SLUG_DESCRIBERS.length * SLUG_THINGS.length * [...Array(9000).keys()].filter((n) => !BLOCKED_SLUG_NUMBER.test(String(n + 1000))).length;
  check(combinations > 30_000_000, `tens of millions of addresses (${(combinations / 1e6).toFixed(1)}M)`);
}

// --- nothing insulting -----------------------------------------------------------
// WHOLE WORDS that must never be a word: colours that are also words for
// people, skin tones, primates, animals and foods used as slurs or
// stereotypes, and animals whose names are insults.
const NEVER_A_WORD = [
  "black", "white", "brown", "yellow", "red", "tan", "dusky", "caramel", "mocha", "chocolate", "cocoa", "ebony",
  "monkey", "ape", "gorilla", "chimp", "chimpanzee", "baboon", "lemur", "orangutan", "macaque", "primate", "gibbon",
  "coon", "raccoon", "banana", "coconut", "oreo", "apple", "taco", "burrito", "ginger", "twinkie",
  "jungle", "tribal", "savage", "slave", "gypsy", "pig", "rat", "cow", "dog", "snake", "weasel", "donkey",
  "fat", "chubby", "plump", "ugly", "dumb", "crazy",
];
// And PARTS of words: these must not appear even inside another word
// ("brownie" carries "brown"). Short ones are left to the whole-word list -
// "grape" carries "ape" and is only a grape.
const NEVER_IN_A_WORD = ["black", "white", "brown", "yellow", "monkey", "gorilla", "chimp", "coon", "slave", "jungle", "negr", "nig"];
{
  const whole = words.filter((w) => NEVER_A_WORD.includes(w));
  check(whole.length === 0, `no blocked word (found: ${whole.join(", ")})`);
  const inside = words.filter((w) => NEVER_IN_A_WORD.some((part) => w.includes(part)));
  check(inside.length === 0, `no blocked word inside another (found: ${inside.join(", ")})`);
}

// --- the addresses ----------------------------------------------------------------
{
  // A random stream that cycles, so every number 1000..9999 is asked for.
  let seen = 0;
  let blockedOut = 0;
  for (let n = 0; n < 9000; n++) {
    const draws = [0.31, 0.62, n / 9000];
    let i = 0;
    const slug = makeJournalSlug(() => draws[i++ % 3]);
    const number = slug.split("-")[2];
    if (!isJournalSlug(slug)) check(false, `well formed (${slug})`);
    if (BLOCKED_SLUG_NUMBER.test(number)) blockedOut++;
    seen++;
  }
  check(seen === 9000 && blockedOut === 0, `no blocked number is ever used (${blockedOut} of ${seen})`);
  for (const code of ["1488", "1312", "6969", "1666", "8812", "2669"]) {
    check(BLOCKED_SLUG_NUMBER.test(code), `${code} is blocked`);
  }
  const slug = makeJournalSlug();
  check(isJournalSlug(slug) && slug.split("-").length === 3, `a fresh one looks like frosty-otter-4821 (${slug})`);
  check(!isJournalSlug("cmutj74xh000svsmgitzygjrv") && !isJournalSlug("not-a-real-journal") && !isJournalSlug("Frosty-Otter-4821"), "a database id, or anything else, is not a slug");
  // The ends of each list are reachable.
  const first = makeJournalSlug(() => 0);
  const last = makeJournalSlug(() => 0.99999);
  check(first.startsWith(`${SLUG_DESCRIBERS[0]}-${SLUG_THINGS[0]}-`) && last.startsWith(`${SLUG_DESCRIBERS[SLUG_DESCRIBERS.length - 1]}-${SLUG_THINGS[SLUG_THINGS.length - 1]}-`), `first and last words reachable (${first}, ${last})`);
}
