// A coach's kit (coachKit.ts): the made-up example builds; every way a kit
// can be wrong is caught, and said, before anything is made. Expected
// values by hand.
//
// Run as part of: npm test

import { readFileSync } from "node:fs";
import { kitProblems, kitSpreads, type CoachKit } from "./coachKit";

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failures++;
    console.error(`FAIL ${what}`);
  }
};

const example = JSON.parse(readFileSync(new URL("../../scripts/coach-kit.example.json", import.meta.url), "utf8")) as CoachKit;
const ok = kitProblems(example);
check(ok.length === 0, `the example kit builds (${ok.join(" | ")})`);
check(JSON.stringify(kitSpreads(example).map((s) => [s.part, s.spread.key])) === JSON.stringify([["front", "coach-example-steady-ground-front"], ["week", "coach-example-steady-ground-week"]]), "its spreads: the front and a week, keyed by the kit");

/** The example changed one way, and what kitProblems says. */
const wrong = (change: (kit: CoachKit) => void) => {
  const kit = JSON.parse(JSON.stringify(example)) as CoachKit;
  change(kit);
  return kitProblems(kit).join(" | ");
};
const front = (kit: CoachKit) => kit.journal.parts.front as unknown as { pages: Array<Array<{ slug: string; rowSpan: number; rowStart: number; props?: Record<string, unknown> }>> };

check(/"key"/.test(wrong((k) => (k.key = "Deposit Leakage!"))), "a key with capitals and spaces is refused");
check(/"coach.name"/.test(wrong((k) => (k.coach.name = " "))), "a coach needs a name");
check(/"coach.email"/.test(wrong((k) => (k.coach.email = "jordan at example"))), "an email that isn't one is refused");
check(/"business.logoUrl"/.test(wrong((k) => (k.business.logoUrl = "http://insecure.example/logo.png"))), "a logo not on https is refused");
check(/"journal.months"/.test(wrong((k) => (k.journal.months = 4))), "a book runs 1, 3, 6 or 12 months");
check(/"firstClient.startDate"/.test(wrong((k) => (k.firstClient = { startDate: "4 Jan" }))), "a start that isn't a date is refused");
check(/no book has/.test(wrong((k) => ((k.journal.parts as Record<string, unknown>).appendix = k.journal.parts.front))), "a part no book has is refused");
check(/needs the front, a week or a day/.test(wrong((k) => (k.journal.parts = {}))), "a kit with no pages is refused");
check(/laid out as "week"; it takes pages/.test(wrong((k) => (k.journal.parts.front = k.journal.parts.week))), "the front laid out as a week is refused");
check(/The front: .*overlap|The front: .*runs off|The front: .*cell/i.test(wrong((k) => (front(k).pages[0][1].rowStart = 18))), `two modules on top of each other are refused (${wrong((k) => (front(k).pages[0][1].rowStart = 18))})`);
check(/The front: .*needs/.test(wrong((k) => (front(k).pages[0][0].rowSpan = 3))), "a module too short for itself is refused");
check(/has no todo-checklist headed "Four Goals"/.test(wrong((k) => (k.questions![1].heading = "Four Goals"))), "a question about a module the part doesn't have is refused");
check(/nothing a client could fill in/.test(wrong((k) => k.questions!.push({ part: "front", slug: "prompted-lines", prompt: "Where do you start?" }))), "a question about a module with nothing to fill is refused");
check(/"max" is 1 to 10/.test(wrong((k) => (k.questions![1].max = 40))), "a list question asks for 1 to 10 answers");
check(/same module as one before/.test(wrong((k) => k.questions!.push({ ...k.questions![0] }))), "the same module asked about twice is refused");
check(/"prompt"/.test(wrong((k) => (k.questions![0].prompt = ""))), "a question needs its words");
check(/the day, which the book doesn't have/.test(wrong((k) => k.questions!.push({ part: "day", slug: "text-block", prompt: "x" }))), "a question on a part the book doesn't have is refused");
check(kitProblems(null)[0] === "The kit is not a JSON object.", "nothing at all is said to be nothing");

if (failures > 0) {
  console.error(`\n${failures} coach kit check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("All coach kit checks passed.");
}
