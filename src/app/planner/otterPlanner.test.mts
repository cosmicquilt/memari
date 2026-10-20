// The otter's planner: whatever the answers, a real book. Thousands of
// answer sets, picked at random along the quiz's own route, each made into
// a plan whose every spread passes the hero's test (every module fits its
// cells and its floor, nothing overlaps, every page full); and the answers
// that should change something, checked to change it.
//
// Run as part of: npm test
import { planFromAnswers } from "./otterPlanner";
import { slotsOf, valid } from "@/app/landing/similarLayouts";
import { spreadPlacements } from "@/app/landing/spreads";
import { QUESTIONS, questionsFor, routedAnswers, guessLine, type Answers } from "@/lib/otterQuiz";

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (!condition) {
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

/** A small, repeatable shuffle. */
function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Answers picked at random, question by question, as someone would meet
 *  them: only what the route asks, from what it offers. */
function randomAnswers(rand: () => number): Answers {
  const answers: Answers = {
    details: {
      startDate: "2027-02-15",
      trashDay: Math.floor(rand() * 7),
      recyclingDay: Math.floor(rand() * 7),
      recyclingEvery: rand() < 0.5 ? 1 : 2,
      paydayEvery: (["week", "fortnight", "month"] as const)[Math.floor(rand() * 3)],
      paydayDay: 1 + Math.floor(rand() * 6),
      billsDate: 1 + Math.floor(rand() * 28),
      schedule: [{ title: "Bio lab", days: [1, 3], from: "13:00", to: "16:00" }],
    },
  };
  for (const q of QUESTIONS) {
    if (q.when && !q.when(answers)) continue;
    if (q.optional && rand() < 0.15) continue;
    const options = q.options(answers);
    if (q.multi) {
      const max = q.multi.max ?? options.length;
      const picked = options.filter(() => rand() < 0.4).slice(0, max);
      answers[q.id] = picked.length > 0 ? picked.map((o) => o.id) : [options[Math.floor(rand() * options.length)].id];
    } else {
      answers[q.id] = [options[Math.floor(rand() * options.length)].id];
    }
  }
  return answers;
}

const TODAY = new Date(Date.UTC(2026, 9, 20));

// ---------------------------------------------------------------- at random
const rand = rng(20261020);
let plans = 0;
let spreads = 0;
const placedSlugs = new Set<string>();
for (let i = 0; i < 1500; i++) {
  const answers = randomAnswers(rand);
  check("never more than 20 questions", questionsFor(answers).length <= 20, `${questionsFor(answers).length}`);
  const plan = planFromAnswers(answers, undefined, TODAY);
  plans++;
  check("a plan has its pages", plan.parts.length > 0, JSON.stringify(answers));
  for (const { part, spread } of plan.parts) {
    spreads++;
    check(`every ${part} spread passes the hero's test`, valid(spread), `${JSON.stringify(answers)} -> ${slotsOf(spread).map((s) => s.slug).join(",")}`);
    for (const p of spreadPlacements(spread)) placedSlugs.add(p.slug);
  }
  check("the same answers, the same planner", JSON.stringify(planFromAnswers(answers, undefined, TODAY)) === JSON.stringify(plan));
  for (const note of [plan.guess, ...plan.notes]) check("no spaced dashes in what the otter says", !/ [-–—] /.test(note), note);
}

// ---------------------------------------------------------------- answers that matter
const base: Answers = { fills: ["school"], follow: ["college"], pages: ["week"], hourly: ["half"], rhythm: ["day"], weekStart: ["monday"], dated: ["dated"], start: ["next-month"], todo: ["list"] };
const week = (a: Answers) => planFromAnswers(a, undefined, TODAY).parts.find((p) => p.part === "week")!.spread;
const slugs = (a: Answers, part: string) => slotsOf(planFromAnswers(a, undefined, TODAY).parts.find((p) => p.part === part)?.spread ?? week(a)).map((s) => s.slug);

check("a college student's week keeps the assignment tracker", slugs(base, "week").includes("assignment-tracker"));
check("and the exam countdown waits at the front", slugs(base, "front").includes("exam-countdown"));
const hoursOf = (a: Answers) => (week(a).layout as { hours?: { startTime?: string; endTime?: string; intervalMode?: string; intervalMinutes?: number } }).hours ?? {};
check("lists, not hours: the days go dotted", hoursOf({ ...base, hourly: ["lists"] }).intervalMode === "off");
check("an early bird's hours start at 5", hoursOf({ ...base, rhythm: ["early"] }).startTime === "05:00");
check("a night owl's run to midnight", hoursOf({ ...base, rhythm: ["owl"] }).endTime === "24:00");
check("by the hour", hoursOf({ ...base, hourly: ["hour"] }).intervalMinutes === 60);
const sunday = planFromAnswers({ ...base, weekStart: ["sunday"], pages: ["month", "week", "day"] }, undefined, TODAY);
check("a Sunday week, on every page", sunday.weekStartDay === 0 && sunday.parts.every((p) => p.spread.layout.weekStartsMonday === false));
check("month, week and day pages when all three are picked", ["month", "week", "day"].every((part) => sunday.parts.some((p) => p.part === part)));
const water = week({ ...base, fills: ["office"], follow: ["meetings"], track: ["water"] });
check("water runs under all seven days", spreadPlacements(water).filter((p) => p.slug === "water-week").reduce((n, p) => n + Math.round(p.columnSpan / 6), 0) === 7);
const undated = planFromAnswers({ ...base, dated: ["undated"], marks: ["trash"], schedule: ["add"] }, undefined, TODAY);
check("undated: no dates, no icons, no events", undated.startISO === null && undated.dayIcons.length === 0 && undated.schedule.length === 0);
const marked = planFromAnswers({ ...base, marks: ["trash", "payday"], details: { trashDay: 3, paydayEvery: "fortnight", paydayDay: 5 } }, undefined, TODAY);
check("trash day on Wednesdays", marked.dayIcons.find((d) => d.icon === "trash")?.rrule === "FREQ=WEEKLY;BYDAY=WE");
check("payday every other Friday", marked.dayIcons.find((d) => d.icon === "coins")?.rrule === "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR");
check("the book starts on the 1st of next month, for three months", marked.startISO === "2026-11-01" && marked.endISO === "2027-01-31", `${marked.startISO} ${marked.endISO}`);
const picked = planFromAnswers({ ...base, start: ["pick"], details: { startDate: "2027-02-15" } }, undefined, TODAY);
check("or on the date picked", picked.startISO === "2027-02-15" && picked.endISO === "2027-05-14", `${picked.startISO} ${picked.endISO}`);
const scheduled = planFromAnswers({ ...base, schedule: ["add"], details: { schedule: [{ title: "Bio lab", days: [1, 3], from: "13:00", to: "16:00" }, { title: "Night", days: [2], from: "22:00", to: "06:00" }, { title: "", days: [1], from: "09:00", to: "10:00" }] } }, undefined, TODAY);
check("a weekly class is kept; a shift past midnight and an untitled one are not (yet)", scheduled.schedule.length === 1 && scheduled.schedule[0].title === "Bio lab");
check("rather not say: no practice", !slugs({ ...base, practice: ["private"], practices: ["examen"] }, "week").includes("examen"));
check("a practice picked goes in", slugs({ ...base, practice: ["christian"], practices: ["examen"] }, "week").includes("examen"));
check("routing drops what is no longer asked", routedAnswers({ ...base, pages: ["month"], hourly: ["half"] }).hourly === undefined);
check("the guess", guessLine({ ...base, rhythm: ["owl"], track: ["sleep", "money"] }) === "I think you're a night-owl college student who tracks sleep and money. Here's your planner!", guessLine({ ...base, rhythm: ["owl"], track: ["sleep", "money"] }));
check("an early bird gets an", guessLine({ ...base, fills: ["teaching"], follow: ["high"], rhythm: ["early"] }).startsWith("I think you're an early-bird teacher"));
// The base week's own modules stay while a plain box is free: sleep goes
// where the Money box was, not where the week's priorities are (same size).
const everything: Answers = { fills: ["everything"], follow: ["habits"], pages: ["week"], hourly: ["half"], weekStart: ["monday"], dated: ["dated"], start: ["next-month"], track: ["sleep"] };
check("plain boxes give way before the base week's own modules", slugs(everything, "week").includes("weekly-priorities") && slugs(everything, "week").includes("sleep-chart"), slugs(everything, "week").join(","));
check("serif when asked", planFromAnswers(base, "serif", TODAY).parts.every((p) => p.spread.layout.font === "serif"));

if (failures > 0) {
  console.error(`\n${failures} otter planner check(s) failed.`);
  process.exit(1);
}
console.log(`All otter planner checks passed (${plans} random answer sets, ${spreads} spreads, every one a real layout; ${placedSlugs.size} different modules placed).`);
