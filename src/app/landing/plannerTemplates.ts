// PREBUILT PLANNERS (2026-10-15): whole books to start from, not one spread.
// Andrew: "do these and start with build order" - the build order from the
// planner research (handoff/research, Gemini A report), whose planners are
// books: front pages, months and weeks made for one kind of person.
//
// A planner names the spread each part of its book is laid out as
// (plannerSpreads.ts). "Use this planner" (app/from/<key>) makes a journal
// with exactly those parts - front pages, months, weeks, days - each laid
// out from its spread (planner/archetypeWeek.ts, createJournalFromPlanner).
// The spreads are layouts in their own right too: the gallery lists them
// under their planner, and each can still be used alone.
//
// Data only, but for the seasons' dates (Lent and Ramadan, below).

import { HERO_BY_KEY } from "./heroSpreads";
import { leadDays } from "@/lib/print/orderRange";

/** Where a planner is shelved in the library, in the order shown: the
 *  three he named first (2026-10-21), the challenges (2026-10-30), then
 *  school and work, family and the
 *  events of a life, health, money and hobbies, then faith and recovery,
 *  which ask most of a reader. */
export const PLANNER_GROUPS = ["Planning", "Growth", "Philosophy", "Challenges", "School & work", "Family & life", "Health", "Money", "Hobbies & home", "Faith", "Recovery"] as const;
export type PlannerGroup = (typeof PLANNER_GROUPS)[number];

export type PlannerTemplate = {
  /** /layouts/<key> and app/from/<key>. Stable. */
  key: string;
  group: PlannerGroup;
  title: string;
  /** Who it is for, in a phrase. */
  forWhom: string;
  /** What is in it, in a sentence. Checked against its spreads. */
  line: string;
  /** The spread each part of the book is laid out as, by key. */
  front?: string;
  month?: string;
  week?: string;
  day?: string;
  /** The book's own dates, for a planner kept for a season rather than from
   *  next month: Lent and Ramadan (audit 2026-10-29: a Ramadan book made in
   *  October was three months of Ramadan day pages, none in Ramadan).
   *  Absent, the book is the next quarter (archetypeWeek.ts). */
  dates?: (today: Date) => { startISO: string; endISO: string };
  /** With `dates`: when the book runs, said for "Use this planner". */
  when?: (today: Date) => string;
  /** Said after what "Use this planner" makes: what to choose when ordering. */
  orderNote?: string;
};

// ── Seasons ─────────────────────────────────────────────────────────────
// A season's book starts on the season's first day, the next one a printed
// book can still reach in time: the order form's own first offer (ground,
// from the UK printer, orderRange.ts suggestedStart) is up to a week past
// leadDays, so a season sooner than that waits for the year after.

const DAY_MS = 86_400_000;
const SEASON_NOTICE_DAYS = leadDays("GROUND", true) + 7;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const isoOf = (date: Date) => date.toISOString().slice(0, 10);
const utcDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const saidDate = (date: Date) => `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
const earliestSeasonStart = (today: Date) => Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) + SEASON_NOTICE_DAYS * DAY_MS;

// ── Challenges ──────────────────────────────────────────────────────────
// A challenge starts on the first Monday a printed book can reach (the
// seasons' notice, above) and runs its own length, 30 days or 90, the order
// form's two short lengths. A new year's starts on 1 January, the next one a
// book can reach. The spreads and every day's step are in challenges.ts.

/** The first Monday a book ordered today can reach. */
export function challengeStart(today: Date): Date {
  const earliest = new Date(earliestSeasonStart(today));
  return new Date(earliest.getTime() + ((8 - earliest.getUTCDay()) % 7) * DAY_MS);
}

/** A challenge's dates and when it runs: `days` from the first Monday. */
function challengeTerm(days: number): Pick<PlannerTemplate, "dates" | "when"> {
  return {
    dates: (today) => {
      const start = challengeStart(today);
      return { startISO: isoOf(start), endISO: isoOf(new Date(start.getTime() + (days - 1) * DAY_MS)) };
    },
    when: (today) => `for ${days} days from Monday, ${saidDate(challengeStart(today))}`,
  };
}

/** The next 1 January a book can reach. */
export function nextNewYear(today: Date): Date {
  const year = today.getUTCFullYear() + 1;
  return new Date(Date.UTC(year, 0, 1) >= earliestSeasonStart(today) ? Date.UTC(year, 0, 1) : Date.UTC(year + 1, 0, 1));
}

/** A new year's challenge: from 1 January to the 30th, or to 31 March. */
function newYearTerm(lastMonth: 0 | 2, lastDay: number): Pick<PlannerTemplate, "dates" | "when"> {
  const end = (today: Date) => new Date(Date.UTC(nextNewYear(today).getUTCFullYear(), lastMonth, lastDay));
  return {
    dates: (today) => ({ startISO: isoOf(nextNewYear(today)), endISO: isoOf(end(today)) }),
    when: (today) => `from 1 January to ${saidDate(end(today))}`,
  };
}

/** Easter Sunday in `year`: the Gregorian computus (Meeus/Jones/Butcher). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** The next Lent a book can reach: Ash Wednesday (Easter less 46 days) to
 *  Easter Sunday. */
export function nextLent(today: Date): { ashWednesday: Date; easter: Date } {
  for (let year = today.getUTCFullYear(); ; year++) {
    const easter = easterSunday(year);
    const ashWednesday = new Date(easter.getTime() - 46 * DAY_MS);
    if (ashWednesday.getTime() >= earliestSeasonStart(today)) return { ashWednesday, easter };
  }
}

/** The first of Ramadan as expected ahead of time, by Gregorian date. The
 *  sighting of the moon can move each a day either way. */
const RAMADAN_STARTS = ["2027-02-08", "2028-01-28", "2029-01-16", "2030-01-05", "2030-12-26", "2031-12-15"];
const LUNAR_YEAR_DAYS = 354.36707;

/** The next Ramadan a book can reach, and its thirty days. Past the table,
 *  a lunar year on from its last entry. */
export function nextRamadan(today: Date): { start: Date; end: Date } {
  const earliest = earliestSeasonStart(today);
  let start = RAMADAN_STARTS.map(utcDate).find((date) => date.getTime() >= earliest);
  if (!start) {
    const last = utcDate(RAMADAN_STARTS[RAMADAN_STARTS.length - 1]).getTime();
    const years = Math.ceil((earliest - last) / (LUNAR_YEAR_DAYS * DAY_MS));
    start = new Date(last + Math.round(years * LUNAR_YEAR_DAYS) * DAY_MS);
  }
  return { start, end: new Date(start.getTime() + 29 * DAY_MS) };
}

/** Every planner, as written - PLANNERS below is the ones that can be made. */
export const ALL_PLANNERS: PlannerTemplate[] = [
  {
    key: "irregular-income",
    group: "Money",
    title: "Irregular income budget",
    forWhom: "Freelance, gig and tipped work, or any pay that changes month to month.",
    line: "A baseline month you can always cover, a rule for when there's extra and one for a slow month, irregular bills ninety days ahead, tax set aside by the quarter, every payment logged, and each half of the month budgeted on its own.",
    front: "pages-irregular-income",
    month: "month-irregular-income",
    week: "week-irregular-income",
  },
  {
    key: "adhd",
    group: "Planning",
    title: "ADHD brain dump & done list",
    forWhom: "ADHD brains, and anyone who plans in bursts and loses the thread.",
    line: "Three things a day and a list of what you actually got done, the rest of the day as open dots to empty your head onto, focus blocks, stars that add up instead of streaks to break, and a dopamine menu for when you're stuck.",
    front: "pages-adhd",
    month: "month-adhd",
    day: "day-adhd-dots",
  },
  // The library (2026-10-21, plannerLibrary.ts).
  {
    key: "time-block",
    group: "Planning",
    title: "Time-blocked deep work",
    forWhom: "Knowledge workers, writers and anyone whose best work needs long, protected hours.",
    line: "Every hour given a job before the day starts: deep work blocked out and protected, shallow work batched into a column under each day, a shutdown ritual that ends the working day, and the quarter's projects and rules at the front.",
    front: "pages-time-block",
    week: "week-time-block",
    day: "day-time-block",
  },
  {
    key: "next-actions",
    group: "Planning",
    title: "Capture & next actions",
    forWhom: "Busy people with a head full of open loops who want one trusted place for all of it.",
    line: "Everything captured in an inbox and sorted into projects and next actions by where you can do them (calls, errands, computer, home), what you're waiting on, someday and maybe, and a weekly review that keeps it all current.",
    front: "pages-next-actions",
    month: "month-next-actions",
    week: "week-next-actions",
  },
  {
    key: "twelve-week",
    group: "Planning",
    title: "Twelve-week goal sprint",
    forWhom: "Goal-setters who'd rather finish one thing in twelve weeks than plan a whole year.",
    line: "A vision and up to three goals, the weekly actions that move each one, a score each week (actions done over actions planned) instead of a streak, and a check at week six.",
    front: "pages-twelve-week",
    week: "week-twelve-week",
  },
  {
    key: "habits",
    group: "Growth",
    title: "Habits without streaks",
    forWhom: "Anyone who has tried a habit tracker and quit after missing a day.",
    line: "A few habits, each with its reason, a cue and a two-minute version for bad days; counted by the week, where most days is a win, instead of as a streak; a Sunday reset; and a plan written ahead for the day you miss.",
    front: "pages-habits",
    month: "month-habits",
    week: "week-habits",
  },
  {
    key: "reading-journal",
    group: "Growth",
    title: "Reading journal & book club",
    forWhom: "Readers who want a record of every book, and book clubs that meet monthly.",
    line: "Books read, a reading goal, a to-be-read list with who recommended each, a guilt-free didn't-finish list and full review pages; each month what you're reading, what's next, a book review, book club notes and a wrap-up.",
    front: "pages-reading-journal",
    month: "month-reading-journal",
  },
  {
    key: "training-block",
    group: "Growth",
    title: "Training block",
    forWhom: "Runners and lifters working toward a race or a stronger lift.",
    line: "The goal and the plan week by week, paces, personal bests, gear and a race-day checklist at the front; each week's sessions, runs, strength, rest and sleep; each month's lifts, volume and measurements.",
    front: "pages-training-block",
    month: "month-training-block",
    week: "week-training-block",
  },
  {
    key: "stoic-practice",
    group: "Philosophy",
    title: "Stoic practice",
    forWhom: "People practising Stoicism day to day, not only reading about it.",
    line: "A morning to prepare for what will test you and an evening to review it, what is and isn't in your control, a theme to practise each week, the four virtues, the view from above, rules of your own to live by and a commonplace book of the lines you choose to keep.",
    front: "pages-stoic-practice",
    week: "week-stoic-practice",
    day: "day-stoic-practice",
  },
  {
    key: "mindful",
    group: "Philosophy",
    title: "Mindful practice",
    forWhom: "Meditators in the Buddhist and Taoist traditions, or anyone practising attention.",
    line: "Why you practise and a passage read slowly at the front; an open, dotted day of loving-kindness, three good things, the day's passage and an evening reflection; each month's sittings counted and what was let go.",
    front: "pages-mindful",
    month: "month-mindful",
    day: "day-mindful",
  },
  {
    key: "bible-study",
    group: "Faith",
    title: "Bible study & prayer",
    forWhom: "Christians who want scripture, prayer and Sunday's sermon in one book.",
    line: "A reading plan and the books read, prayer requests with the answers written in and verses to memorise; each week's sermon notes, SOAP study, verse mapping and prayer list; each month's theme and small group meetings.",
    front: "pages-bible-study",
    month: "month-bible-study",
    week: "week-bible-study",
  },
  {
    key: "one-day",
    group: "Recovery",
    title: "One day at a time",
    forWhom: "People in early recovery, in a twelve-step program or not.",
    line: "Your reasons and the people to call, with a plan for when a craving comes and the warning signs to watch for; a day that starts with just for today and ends with an honest inventory, a HALT check and gratitude between; each month's days counted up, never reset.",
    front: "pages-one-day",
    month: "month-one-day",
    day: "day-one-day",
  },
  {
    key: "semester",
    group: "School & work",
    title: "College semester",
    forWhom: "College students, ADHD brains especially, juggling deadlines from five syllabuses.",
    line: "Every class and every syllabus deadline in one place at the start, big assignments broken back into steps from the due date, grades kept, and a week of three priorities, a brain dump, what got done, the everyday basics (meds, water, meals) ticked off and focus blocks to colour in.",
    front: "pages-semester",
    month: "month-semester",
    week: "week-semester",
  },
  {
    key: "teacher-year",
    group: "School & work",
    title: "Teacher's school year",
    forWhom: "Middle and high school teachers with several classes to prepare.",
    line: "Your classes and the twelve months ahead, month by month, at the front, each month's preparation, units and parent contacts, and each week's lessons by class and day, grading, copies, make-up work and students to check on.",
    front: "pages-teacher-year",
    month: "month-teacher-year",
    week: "week-teacher-year",
  },
  {
    key: "small-shop",
    group: "School & work",
    title: "Small online shop",
    forWhom: "Makers and sellers running a shop online or at markets.",
    line: "Products with their cost, price and margin, suppliers, launches, content ideas, tools and fees and a sales goal at the front; each month's sales, costs and best sellers; each week's orders, things to make and messages to answer, content and spending.",
    front: "pages-small-shop",
    month: "month-small-shop",
    week: "week-small-shop",
  },
  {
    key: "night-nurse",
    group: "School & work",
    title: "Night-shift nurse",
    forWhom: "Nurses and other night workers whose day runs from evening to morning.",
    line: "A week that runs 7 PM to 7 AM, marked +1 after midnight, with sleep and meals planned around it, a self-care check and water under every night; licences, CEUs, PTO, overtime and a shift bag list at the front.",
    front: "pages-night-nurse",
    week: "week-night-nurse",
  },
  {
    key: "glp1",
    group: "Health",
    title: "GLP-1 meal planner",
    forWhom: "People on a weekly GLP-1 medication tracking meals, protein and how they feel.",
    line: "Meals written under each day; protein, water and fibre counted against your own daily targets; each week's dose and its site, so they rotate; side effects scored 0 to 3; non-scale victories; and questions gathered for the doctor.",
    front: "pages-glp1",
    month: "month-glp1",
    week: "week-glp1",
  },
  {
    key: "flare-log",
    group: "Health",
    title: "Chronic illness flare log",
    forWhom: "People with a chronic illness who need a record their doctors can read.",
    line: "A one-minute daily check-in of energy, pain, symptoms and spoons, every dose taken or skipped and what helped; a month that rolls the days into patterns; the care team, medicines, conditions and allergies and a flare plan at the front.",
    front: "pages-flare-log",
    month: "month-flare-log",
    day: "day-flare-log",
  },
  // The second shelf (2026-10-21, plannerLibrary2.ts), from the Gemini
  // library report.
  {
    key: "rapid-log",
    group: "Planning",
    title: "Rapid log & monthly task list",
    forWhom: "People who like a dotted page and quick notes, without rewriting the same tasks every day.",
    line: "A dotted page a day for tasks, events and notes as they come, the big three and a done list; a month whose task list has a status column, so an unfinished task is marked moved, not written out again; an index, your key and a future log a year ahead.",
    front: "pages-rapid-log",
    month: "month-rapid-log",
    day: "day-rapid-log",
  },
  {
    key: "quarterly-objective",
    group: "Planning",
    title: "One objective a quarter",
    forWhom: "Driven people who want a goal system without a spreadsheet of metrics.",
    line: "One objective for the quarter with a leading and a lagging key result, thirteen weeks to tick off, a weekly check of what moved it and how sure you are, and a look back at the end.",
    front: "pages-quarterly-objective",
    week: "week-quarterly-objective",
  },
  {
    key: "language",
    group: "Growth",
    title: "Language learning",
    forWhom: "Learners from first words to fluency who want to keep going without counting minutes.",
    line: "Why you're learning and milestones by level, resources, words and phrases to keep; a month of what you watched, read and heard; a week with each day left dotted for a few lines in your new language, practice ticked off and effort rated, not timed.",
    front: "pages-language",
    month: "month-language",
    week: "week-language",
  },
  {
    key: "writing",
    group: "Growth",
    title: "Writing a book",
    forWhom: "Novelists and memoirists, from the outline through the last revision.",
    line: "The book in a sentence, a word count bar, scenes and characters, revision passes and submissions; a month of chapters by stage and research; a week of writing sessions with what you worked on, so revising counts as much as drafting.",
    front: "pages-writing",
    month: "month-writing",
    week: "week-writing",
  },
  {
    key: "life-design",
    group: "Growth",
    title: "Life design & small joys",
    forWhom: "Anyone taking stock of their life who wants meaning in small things, not a hustle plan.",
    line: "A wheel of life, five small pillars of ikigai (start small, let go, harmony, small joys, the here and now), a look back and a letter to yourself; a month of one small shift in each area; a week of small joys and moments of flow.",
    front: "pages-life-design",
    month: "month-life-design",
    week: "week-life-design",
  },
  {
    key: "tao",
    group: "Philosophy",
    title: "Taoist practice",
    forWhom: "Readers of the Tao Te Ching who want a light practice, not a rigid one.",
    line: "The 81 chapters read slowly in the translation you choose, the uncarved block, nature noticed and what you let go of; a week of the chapter, wu wei reflected on, forcing or flowing each day, and stillness.",
    front: "pages-tao",
    week: "week-tao",
  },
  {
    key: "franklin",
    group: "Philosophy",
    title: "Franklin's thirteen virtues",
    forWhom: "People drawn to Benjamin Franklin's method of working on one virtue a week.",
    line: "Franklin's thirteen virtues in his own words, a week on each and four rounds a year, his morning and evening questions; a week with his chart of the thirteen by day, and what you kept well beside where you slipped.",
    front: "pages-franklin",
    week: "week-franklin",
  },
  {
    key: "existential",
    group: "Philosophy",
    title: "Existentialist journal",
    forWhom: "Readers of Sartre, Camus and de Beauvoir who want to bring it into their week.",
    line: "Radical responsibility, values and projects you choose, and what you'd do if this were all; a week of the choices you face, bad faith noticed, what you did on autopilot, and absurd moments with the meaning you choose.",
    front: "pages-existential",
    week: "week-existential",
  },
  {
    key: "wedding",
    group: "Family & life",
    title: "Wedding planner",
    forWhom: "Couples planning a wedding, from the guest list to the thank-you notes.",
    line: "The guest list as a whole page with RSVPs, meals, gifts and thank-yous, the budget, vendors and the day itself; a month of payments due, decisions and what got done; a week of calls, who you're waiting to hear from, and time for the two of you.",
    front: "pages-wedding",
    month: "month-wedding",
    week: "week-wedding",
  },
  {
    key: "new-baby",
    group: "Family & life",
    title: "New baby, the first months",
    forWhom: "New parents in the round-the-clock early months.",
    line: "A page a day for feeds, sleep and changes, medicines given and how you are doing; a week of firsts and looking after yourself; who to call, help offered, growth, checkups and thank-yous at the front.",
    front: "pages-new-baby",
    week: "week-new-baby",
    day: "day-new-baby",
  },
  {
    key: "caregiver",
    group: "Family & life",
    title: "Caregiver",
    forWhom: "People caring for a parent, partner or child, who need it all in one place.",
    line: "Everything a stand-in or a doctor needs at the front (care team, medicines, where the papers are), help you can ask for and a plan for breaks; a month of refills, bills and claims; a week of medicines, what to watch for and questions, with room for you.",
    front: "pages-caregiver",
    month: "month-caregiver",
    week: "week-caregiver",
  },
  {
    key: "grief",
    group: "Family & life",
    title: "Grief journal",
    forWhom: "Anyone grieving, at their own pace.",
    line: "Remembering them, people you can call and dates that may be hard, the practical things to sort and letters to them; a week of open lines, how you were and what helped. No timeline, nothing to finish.",
    front: "pages-grief",
    week: "week-grief",
  },
  {
    key: "homeschool",
    group: "Family & life",
    title: "Homeschool year",
    forWhom: "Homeschooling parents keeping lessons, records and the year in one place.",
    line: "Subjects and curriculum, the twelve months ahead, month by month, and field trips; a month of hours by subject and work samples for your records; a week of lessons over the school day, hours by subject and books read together.",
    front: "pages-homeschool",
    month: "month-homeschool",
    week: "week-homeschool",
  },
  {
    key: "perimenopause",
    group: "Health",
    title: "Perimenopause tracker",
    forWhom: "Women in perimenopause who want the patterns and their questions ready for the doctor.",
    line: "Medicines, care team, cycles, triggers, what helps and questions for your doctor; a month of patterns and a symptom summary; a week of symptoms day by day, sleep and what changed. A log to bring along, not medical advice.",
    front: "pages-perimenopause",
    month: "month-perimenopause",
    week: "week-perimenopause",
  },
  {
    key: "low-fodmap",
    group: "Health",
    title: "Low-FODMAP food diary",
    forWhom: "People on an elimination diet with a dietitian, finding which foods suit them.",
    line: "Reintroduction one group at a time over three days, safe and trigger foods, staples and notes for your dietitian; a week of what you ate and how you felt, with times, day by day.",
    front: "pages-low-fodmap",
    week: "week-low-fodmap",
  },
  {
    key: "fire",
    group: "Money",
    title: "Financial independence",
    forWhom: "Savers working toward the day work becomes optional.",
    line: "Your number and how you worked it out, a bar toward it, accounts, net worth and savings rate by month; a month's budget, account balances, renewals due and wins.",
    front: "pages-fire",
    month: "month-fire",
  },
  {
    key: "garden",
    group: "Hobbies & home",
    title: "Garden planner",
    forWhom: "Vegetable and flower gardeners planning a season.",
    line: "Your zone and frost dates, the bed layout on a grid, what to sow and plant out when, seeds on hand, harvest totals and next year; a month of sowing and harvests; a week of garden jobs with watering under every day.",
    front: "pages-garden",
    month: "month-garden",
    week: "week-garden",
  },
  {
    key: "travel",
    group: "Hobbies & home",
    title: "Travel & slow travel",
    forWhom: "Travellers planning a trip, and people living a month at a time somewhere new.",
    line: "Itinerary, budget, packing, bookings, what to do before you go and days on your visa; a month somewhere with places to work, locals' tips, spending and things to see; a page a day as the trip diary.",
    front: "pages-travel",
    month: "month-travel",
    day: "day-travel",
    orderNote: "Choose the day you leave and how many days to print when you order.",
  },
  {
    key: "game-master",
    group: "Hobbies & home",
    title: "Tabletop campaign",
    forWhom: "Game masters running a tabletop roleplaying campaign.",
    line: "The campaign's premise, tone and lines and veils, player characters, factions, NPCs and places; a week of session prep (a strong start, scenes and locations), secrets and clues, a map on a grid and notes after the session.",
    front: "pages-game-master",
    week: "week-game-master",
  },
  {
    key: "ramadan",
    group: "Faith",
    title: "Ramadan",
    forWhom: "Muslims keeping the month of Ramadan, for reflection and return.",
    line: "Thirty days of the fast, night prayer, Quran, sadaqah and dhikr, the juz read, intentions, duas, Eid prepared for and fasts to make up; a page a day from before suhoor to taraweeh with the prayers, the day's reading and a dua.",
    front: "pages-ramadan",
    day: "day-ramadan",
    dates: (today) => {
      const { start, end } = nextRamadan(today);
      return { startISO: isoOf(start), endISO: isoOf(end) };
    },
    when: (today) => `for the thirty days of the next Ramadan, expected to begin on ${saidDate(nextRamadan(today).start)} (it can move a day with the moon)`,
  },
  {
    key: "lent",
    group: "Faith",
    title: "Lent",
    forWhom: "Catholics and other Christians keeping the forty days of Lent.",
    line: "Your promises for prayer, fasting and almsgiving, forty days and Holy Week, who you're praying for and Easter; a week with the three marked each day, Sunday's readings and homily, and the examen.",
    front: "pages-lent",
    week: "week-lent",
    dates: (today) => {
      const { ashWednesday, easter } = nextLent(today);
      return { startISO: isoOf(ashWednesday), endISO: isoOf(easter) };
    },
    when: (today) => {
      const { ashWednesday, easter } = nextLent(today);
      return `from Ash Wednesday, ${saidDate(ashWednesday)}, to Easter Sunday, ${saidDate(easter)}`;
    },
  },

  // ── Challenges (challenges.ts) ──
  // Running in three, the 90-day 5K first: the pace the NHS plan keeps, and
  // the default (Andrew, 2026-10-30: "have them as options with the
  // recommended as default"). The 30-day 5K climbs twice as fast, so it is
  // for people who already jog.
  {
    key: "challenge-5k-90",
    group: "Challenges",
    title: "A 5K in 90 days",
    forWhom: "New runners who can walk briskly for half an hour.",
    line: "Thirteen weeks from a minute of running to a 5K, three sessions a week with easier weeks between, the sessions ticked each day, energy, runs, stretches, rest and sleep; the plan and race day at the front.",
    front: "pages-challenge-5k-90",
    week: "week-challenge-5k-90",
    ...challengeTerm(90),
    orderNote: "If a run hurts, do that week again: a week done twice is not a week lost.",
  },
  {
    key: "challenge-start-running",
    group: "Challenges",
    title: "Start running in 30 days",
    forWhom: "People who have never run and want to start gently.",
    line: "A first month of running and walking every other day, ending at ten minutes without stopping, a page a day with that day's session, today's run and how your body feels.",
    front: "pages-challenge-start-running",
    day: "day-challenge-start-running",
    ...challengeTerm(30),
  },
  {
    key: "challenge-5k",
    group: "Challenges",
    title: "A 5K in 30 days",
    forWhom: "People who already jog a little and want a 5K soon.",
    line: "A faster climb than most plans: a page a day with that day's run, walk or rest and how it went, today's run, how your body feels and tomorrow; the whole plan, days done and a race day plan at the front.",
    front: "pages-challenge-5k",
    day: "day-challenge-5k",
    ...challengeTerm(30),
    orderNote: "If a run hurts, do that day again: a day done twice is not a day lost.",
  },
  {
    key: "challenge-half-marathon",
    group: "Challenges",
    title: "A half marathon in 90 days",
    forWhom: "Runners who can already run a 5K and want 13.1 miles.",
    line: "Thirteen weeks to race day, the week's plan at the top of every week with the sessions, energy, runs, strength, rest and sleep; the plan, long runs and a race day checklist at the front.",
    front: "pages-challenge-half-marathon",
    week: "week-challenge-half-marathon",
    ...challengeTerm(90),
  },
  {
    key: "challenge-walking-30",
    group: "Challenges",
    title: "30 days of walking",
    forWhom: "Anyone who wants to move more without running.",
    line: "Ten minutes a day rising to an hour, a gentle day each week, a page a day with that day's walk, minutes, steps and where, and how your body feels.",
    front: "pages-challenge-walking-30",
    day: "day-challenge-walking",
    ...challengeTerm(30),
  },
  {
    key: "challenge-walking-90",
    group: "Challenges",
    title: "90 days of walking",
    forWhom: "People who want walking to last past the first month.",
    line: "A focus a week for thirteen weeks, longer walks, a new route, hills, the walks ticked each day, energy, a log of walks, stretches, rest and sleep; routes you like at the front.",
    front: "pages-challenge-walking-90",
    week: "week-challenge-walking",
    ...challengeTerm(90),
  },
  {
    key: "challenge-organize-30",
    group: "Challenges",
    title: "Organize your life in 30 days",
    forWhom: "Anyone whose home and paperwork have got ahead of them.",
    line: "A drawer, a room or a pile of paper a day, what you kept, gave away and tossed, a rest day each week to see the change, and where things go now.",
    front: "pages-challenge-organize-30",
    day: "day-challenge-organize",
    ...challengeTerm(30),
  },
  {
    key: "challenge-organize-90",
    group: "Challenges",
    title: "Organize your life in 90 days",
    forWhom: "Anyone who wants a whole household sorted, one area at a time.",
    line: "An area of life a week for thirteen weeks: the week's jobs, a daily reset, keep, give or toss, what got done and the week reviewed; where things go now and what to pass on at the front.",
    front: "pages-challenge-organize-90",
    week: "week-challenge-organize",
    ...challengeTerm(90),
  },
  {
    key: "challenge-stoic-30",
    group: "Challenges",
    title: "30 days of Stoic practice",
    forWhom: "Anyone curious about Stoicism who would rather practise it than read about it.",
    line: "A practice a day in plain words, the morning's preparation, what is in your control, the evening review and a commonplace book, with a look back every seventh day.",
    front: "pages-challenge-stoic-30",
    day: "day-challenge-stoic",
    ...challengeTerm(30),
  },
  {
    key: "challenge-stoic-90",
    group: "Challenges",
    title: "90 days of Stoic practice",
    forWhom: "People who want Stoicism to become a habit of mind, a theme a week.",
    line: "A theme a week for thirteen weeks and how you'll practise it, a commonplace book, the hard thing rehearsed, the week reviewed and what's in your control; your own rules for living at the front.",
    front: "pages-challenge-stoic-90",
    week: "week-challenge-stoic",
    ...challengeTerm(90),
  },
  {
    key: "challenge-dao-30",
    group: "Challenges",
    title: "The Tao Te Ching in 30 days",
    forWhom: "Readers who want to read the whole book once, slowly enough to keep something.",
    line: "Three chapters a day in the translation you choose, the line that stayed and what it asks of you, nature noticed and stillness, then three days to go back.",
    front: "pages-challenge-dao-30",
    day: "day-challenge-dao",
    ...challengeTerm(30),
  },
  {
    key: "challenge-dao-90",
    group: "Challenges",
    title: "The Tao Te Ching in 90 days",
    forWhom: "Readers who want a chapter a day for a season.",
    line: "A chapter a day, seven a week, the line that stayed, wu wei reflected on, forcing or flowing each day and stillness; the chapters that stayed at the front.",
    front: "pages-challenge-dao-90",
    week: "week-challenge-dao",
    ...challengeTerm(90),
  },
  {
    key: "challenge-new-year-30",
    group: "Challenges",
    title: "A new year in 30 days",
    forWhom: "Anyone who wants January to set up the year, not just start it.",
    line: "A step a day all January: a week looking back, a week choosing, a week setting things up and the rest beginning, with three things for today and what you're grateful for.",
    front: "pages-challenge-new-year-30",
    day: "day-challenge-new-year",
    ...newYearTerm(0, 30),
  },
  {
    key: "challenge-new-year-90",
    group: "Challenges",
    title: "A new year in 90 days",
    forWhom: "People who'd rather give the year's first quarter to one goal than make resolutions.",
    line: "A step a week from January to March: last year looked back on, one goal and its first step, routines set up, a check at halfway and the quarter reviewed; your word for the year at the front.",
    front: "pages-challenge-new-year-90",
    week: "week-challenge-new-year",
    ...newYearTerm(2, 31),
  },
  {
    key: "challenge-reading-30",
    group: "Challenges",
    title: "30 days of reading",
    forWhom: "Anyone who wants to read every day again, instead of scrolling.",
    line: "A reading step a day, minutes and pages that grow, what you read, books and pages, a commonplace book, words to look up and what to read next; books you finished at the front.",
    front: "pages-challenge-reading-30",
    day: "day-challenge-reading",
    ...challengeTerm(30),
  },
  {
    key: "challenge-reading-90",
    group: "Challenges",
    title: "90 days of reading",
    forWhom: "Readers who want a season of books, and to remember them.",
    line: "A focus a week for thirteen weeks, a reading log by day, a commonplace book, what stayed with you, words to look up and what to read next; books read and books to read at the front.",
    front: "pages-challenge-reading-90",
    week: "week-challenge-reading",
    ...challengeTerm(90),
  },
  {
    key: "challenge-no-spend-30",
    group: "Challenges",
    title: "30 days of no spending",
    forWhom: "Anyone who wants to break the habit of buying without thinking.",
    line: "A money step a day, what you spent and whether it was needed, things you wanted and didn't buy, free things to do; your rules and the plan at the front.",
    front: "pages-challenge-no-spend-30",
    day: "day-challenge-no-spend",
    ...challengeTerm(30),
  },
  {
    key: "challenge-no-spend-90",
    group: "Challenges",
    title: "90 days of money habits",
    forWhom: "People who want a quarter to spend less and save more.",
    line: "A money habit a week for thirteen weeks, a spending log, no-spend days ticked, things wanted and not bought, free things to do and the week reviewed; your rules and subscriptions at the front.",
    front: "pages-challenge-no-spend-90",
    week: "week-challenge-no-spend",
    ...challengeTerm(90),
  },
  {
    key: "challenge-alcohol-free",
    group: "Challenges",
    title: "30 days alcohol-free",
    forWhom: "The sober-curious, taking a month off drinking.",
    line: "A step a day for a month off, noticing sleep, energy and mood, how you feel and tomorrow; dry days counted, never days in a row, and the money not spent at the front.",
    front: "pages-challenge-alcohol-free",
    day: "day-challenge-alcohol-free",
    ...challengeTerm(30),
    orderNote: "This is a month off, not a treatment: if you drink every day, see a doctor before you stop.",
  },
];

/** The parts of a book a planner can lay out, in book order. */
export const PLANNER_PARTS = ["front", "month", "week", "day"] as const;
export type PlannerPart = (typeof PLANNER_PARTS)[number];

export const PART_NAMES: Record<PlannerPart, string> = {
  front: "Front pages",
  month: "Every month",
  week: "Every week",
  day: "Every day",
};

/** A planner's parts that it has, with their spreads' keys, in book order. */
export function partsOf(planner: PlannerTemplate): Array<{ part: PlannerPart; key: string }> {
  return PLANNER_PARTS.flatMap((part) => (planner[part] ? [{ part, key: planner[part]! }] : []));
}

/** The planners in a group, in the order written. */
export function plannersIn(group: PlannerGroup, planners: PlannerTemplate[]): PlannerTemplate[] {
  return planners.filter((planner) => planner.group === group);
}

/** The groups that have planners, each with them, in shelf order. */
export function plannerShelves(planners: PlannerTemplate[]): Array<{ group: PlannerGroup; planners: PlannerTemplate[] }> {
  return PLANNER_GROUPS.map((group) => ({ group, planners: plannersIn(group, planners) })).filter((shelf) => shelf.planners.length > 0);
}

/** A shelf's id on the page: "school-work" for School & work. */
export function shelfId(group: PlannerGroup): string {
  return group.toLowerCase().replace(/[^a-z]+/g, "-");
}

/** Every planner whose spreads all exist and none is held. */
export const PLANNERS: PlannerTemplate[] = ALL_PLANNERS.filter((planner) => partsOf(planner).every(({ key }) => HERO_BY_KEY[key] && !HERO_BY_KEY[key].held));

export const PLANNER_BY_KEY: Record<string, PlannerTemplate> = Object.fromEntries(PLANNERS.map((p) => [p.key, p]));

/** The planner a spread belongs to, if it was made for one. */
export const PLANNER_OF_SPREAD: Record<string, string> = Object.fromEntries(PLANNERS.flatMap((p) => partsOf(p).map(({ key }) => [key, p.key])));

/** The spread a planner's card shows: its week, else its month, else its
 *  day - the page used most. */
export function coverSpreadOf(planner: PlannerTemplate): string {
  return planner.week ?? planner.month ?? planner.day ?? planner.front!;
}

/** What "Use this planner" makes, said plainly. */
export function plannerMakes(planner: PlannerTemplate, today = new Date()): string {
  const parts = partsOf(planner).map(({ part }) =>
    part === "front" ? "the front pages" : `a ${part === "day" ? "page" : `${part} spread`} for every ${part}`
  );
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  const when = planner.when?.(today) ?? "from next month for three months";
  return `Opens a journal of your own with all of it: ${list}, ${when}.${planner.orderNote ? ` ${planner.orderNote}` : ""}`;
}
