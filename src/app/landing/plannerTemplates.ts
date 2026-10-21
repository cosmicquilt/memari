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
// Data only.

import { HERO_BY_KEY } from "./heroSpreads";

/** Where a planner is shelved in the library, in the order shown: the
 *  three he named first (2026-10-21), then school and work, family and the
 *  events of a life, health, money and hobbies, then faith and recovery,
 *  which ask most of a reader. */
export const PLANNER_GROUPS = ["Planning", "Growth", "Philosophy", "School & work", "Family & life", "Health", "Money", "Hobbies & home", "Faith", "Recovery"] as const;
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
};

/** Every planner, as written - PLANNERS below is the ones that can be made. */
export const ALL_PLANNERS: PlannerTemplate[] = [
  {
    key: "irregular-income",
    group: "Money",
    title: "Irregular income budget",
    forWhom: "Freelance, gig and tipped work, or any pay that changes month to month.",
    line: "A baseline month you can always cover, a rule for when there's extra, irregular bills ninety days ahead, tax set aside by the quarter, every payment logged, and each paycheck budgeted on its own.",
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
    line: "Books read, a reading goal, a to-be-read list with who recommended each, a guilt-free didn't-finish list and full review pages; each month what you're reading, what's next, book club notes and a wrap-up.",
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
    line: "Why you practise and a passage read slowly at the front; an open, dotted day of loving-kindness, three good things, the day's verse and an evening reflection; each month's minutes of practice and what was let go.",
    front: "pages-mindful",
    month: "month-mindful",
    day: "day-mindful",
  },
  {
    key: "bible-study",
    group: "Faith",
    title: "Bible study & prayer",
    forWhom: "Christians who want scripture, prayer and Sunday's sermon in one book.",
    line: "A reading plan through the year, prayer requests with the answers written in and verses to memorise; each week's sermon notes, SOAP study, verse mapping and prayer list; each month's theme and small group notes.",
    front: "pages-bible-study",
    month: "month-bible-study",
    week: "week-bible-study",
  },
  {
    key: "one-day",
    group: "Recovery",
    title: "One day at a time",
    forWhom: "People in early recovery, in a twelve-step program or not.",
    line: "Your reasons and the people to call, with a plan for when a craving comes; a day that starts with just for today and ends with an honest inventory, a HALT check and gratitude between; each month's days counted up, never reset.",
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
    line: "Your classes and the whole school year from August at the front, each month's dates, duties and parent contacts, and each week's lessons, grading, copies and notes.",
    front: "pages-teacher-year",
    month: "month-teacher-year",
    week: "week-teacher-year",
  },
  {
    key: "small-shop",
    group: "School & work",
    title: "Small online shop",
    forWhom: "Makers and sellers running a shop online or at markets.",
    line: "Products with their cost, price and margin, suppliers, launches, tools and fees and a sales goal at the front; each month's sales and costs; each week's orders, things to make and to ship, content and spending.",
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
    line: "Meals planned around protein; protein, water and fibre counted each day; every injection logged with its site so they rotate; side effects scored 0 to 3; non-scale victories; and questions gathered for the doctor.",
    front: "pages-glp1",
    month: "month-glp1",
    week: "week-glp1",
  },
  {
    key: "flare-log",
    group: "Health",
    title: "Chronic illness flare log",
    forWhom: "People with a chronic illness who need a record their doctors can read.",
    line: "A one-minute daily check-in of energy, pain, symptoms and spoons, every dose taken or skipped and what helped; a month that rolls the days into patterns; the care team, medicines and a flare plan at the front.",
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
    line: "A wheel of life, five small pillars of ikigai (start small, let go, harmony, small joys, the here and now), the year reviewed and a letter to yourself; a month of one small shift in each area; a week of small joys and moments of flow.",
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
    line: "Radical responsibility, values you choose and what you'd do if this were all; absurd moments and the meaning you choose; a week of the choices you face, bad faith noticed and norms followed without thinking.",
    front: "pages-existential",
    week: "week-existential",
  },
  {
    key: "wedding",
    group: "Family & life",
    title: "Wedding planner",
    forWhom: "Couples planning a wedding, from the guest list to the thank-you notes.",
    line: "The guest list as a whole page with RSVPs, meals, gifts and thank-yous, the budget, vendors and the day itself; a month of payments due, RSVPs and decisions; a week of calls, who you're waiting to hear from, and time for the two of you.",
    front: "pages-wedding",
    month: "month-wedding",
    week: "week-wedding",
  },
  {
    key: "new-baby",
    group: "Family & life",
    title: "New baby, the first months",
    forWhom: "New parents in the round-the-clock early months.",
    line: "A page a day for feeds, sleep and changes, notes for the doctor and how you are doing; a week of firsts and looking after yourself; who to call, help offered, growth, checkups and thank-yous at the front.",
    front: "pages-new-baby",
    week: "week-new-baby",
    day: "day-new-baby",
  },
  {
    key: "caregiver",
    group: "Family & life",
    title: "Caregiver",
    forWhom: "People caring for a parent, partner or child, who need it all in one place.",
    line: "Everything a stand-in or a doctor needs at the front (care team, medicines, where the papers are), help you can ask for and a plan for breaks; a month of refills, bills and claims; a week of medicines, symptoms and questions, with room for you.",
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
    line: "Subjects and curriculum, the year from August to July and field trips; a month of hours by subject and work samples for your records; a week of lessons over the school day, what got done by subject and books read together.",
    front: "pages-homeschool",
    month: "month-homeschool",
    week: "week-homeschool",
  },
  {
    key: "perimenopause",
    group: "Health",
    title: "Perimenopause tracker",
    forWhom: "Women in perimenopause who want the patterns and their questions ready for the doctor.",
    line: "Medicines, care team, cycles, triggers, what helps and questions for your doctor; a month of patterns and a symptom summary; a week of symptoms rated, sleep and doctor prep. A log to bring along, not medical advice.",
    front: "pages-perimenopause",
    month: "month-perimenopause",
    week: "week-perimenopause",
  },
  {
    key: "low-fodmap",
    group: "Health",
    title: "Low-FODMAP food diary",
    forWhom: "People on an elimination diet with a dietitian, finding which foods suit them.",
    line: "Reintroduction one group at a time over three days, safe and trigger foods, staples and notes for your dietitian; a week of meals planned and what you ate beside how you felt.",
    front: "pages-low-fodmap",
    week: "week-low-fodmap",
  },
  {
    key: "fire",
    group: "Money",
    title: "Financial independence",
    forWhom: "Savers working toward the day work becomes optional.",
    line: "Your number and how you worked it out, a bar toward it, accounts, net worth and savings rate by month; a month's budget, what came in, went out and was saved, subscriptions and wins.",
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
    line: "Itinerary, budget, packing, bookings and what to do before you go; a month somewhere with places to work, locals' tips, spending and days left on your stay; a page a day as the trip diary.",
    front: "pages-travel",
    month: "month-travel",
    day: "day-travel",
  },
  {
    key: "game-master",
    group: "Hobbies & home",
    title: "Tabletop campaign",
    forWhom: "Game masters running a tabletop roleplaying campaign.",
    line: "The campaign's premise, tone and lines and veils, player characters, factions, NPCs and places; a week of session prep (a strong start, scenes, secrets and clues), a map on a grid and notes from the session.",
    front: "pages-game-master",
    week: "week-game-master",
  },
  {
    key: "ramadan",
    group: "Faith",
    title: "Ramadan",
    forWhom: "Muslims keeping the month of Ramadan, for reflection and return.",
    line: "Thirty days of the fast, night prayer, Quran, sadaqah and dhikr, the juz read, intentions, duas and Eid prepared for; a page a day from before suhoor to taraweeh with the prayers, the day's reading and a dua.",
    front: "pages-ramadan",
    day: "day-ramadan",
  },
  {
    key: "lent",
    group: "Faith",
    title: "Lent",
    forWhom: "Catholics and other Christians keeping the forty days of Lent.",
    line: "Your promises for prayer, fasting and almsgiving, forty days and Holy Week, who you're praying for and Easter; a week with the three marked each day, Sunday's readings and homily, and the examen.",
    front: "pages-lent",
    week: "week-lent",
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
export function plannerMakes(planner: PlannerTemplate): string {
  const parts = partsOf(planner).map(({ part }) =>
    part === "front" ? "the front pages" : `a ${part === "day" ? "page" : `${part} spread`} for every ${part}`
  );
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `Opens a journal of your own with all of it: ${list}, from next month for three months.`;
}
