// THE CHALLENGES (2026-10-30): books with a start and a finish line, in
// the order form's own two short lengths. Andrew asked for "challenges in
// 30 and 90 day lengths (5k/marathon, organizing your life, stoic, dao,
// beginning of year)", as part of the editorial audit.
//
//   - Thirty days are day pages; ninety are thirteen week spreads, so the
//     longer book is not three times the price to print.
//   - Every page knows where it is: challenge-step prints "Day 7 of 30"
//     and that day's step (moduleRegistry.ts, under the catalogue). The
//     whole plan is also at the front, ticked off as it goes, so an
//     undated book, whose pages cannot count, still has it.
//   - Nothing counts days in a row. A missed day is a blank page, not a
//     reset; the front counts days done, not a streak.
//   - Running is a 5K in 30 days for someone who can walk half an hour,
//     and a half marathon in 90 for someone who can run a 5K: a full
//     marathon needs sixteen weeks or more from a 5K base, and a plan
//     that hurts people is not a product.
//   - The Tao Te Ching is the reader's own translation: chapter numbers and
//     our own questions, never a translator's text (plannerLibrary2.ts).
//     The Stoic steps are practices in our words, not quotations.
//
// Data only. Checked by spreads.test.mts like every planner spread, and the
// planners that use them are in plannerTemplates.ts ("Challenges").

import { BELOW_ROW } from "./archetypes";
import type { HeroSpread } from "./heroSpreads";
import { UNWRITTEN, at, box, prompts, table } from "./plannerLibrary";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const OFF = { intervalMode: "off", offModeRule: "dotted" } as const;
/** The day pages' hours: by the hour in short rows, as the Stoic day. */
const DAY_HOURS = { startTime: "06:00", endTime: "22:00", intervalMinutes: 60, compactHourRows: true } as const;

/** A challenge's page: its count, its step, and its own questions after. */
const step = (unit: "Day" | "Week", list: string[], questions: string[], linesPerPrompt: number) => ({
  heading: `${unit} 1 of ${list.length}`,
  prompts: [list[0], ...questions],
  linesPerPrompt,
  steps: list,
  stepUnit: unit,
});
/** The plan at the front, a step to a row with one box to tick, numbered as
 *  the pages count. A tracker, not a to-do: a to-do's columns follow its
 *  width, a day to every six, so a plan across the page printed four times.
 *  Its rows print as typed: they are sentences, and the tracker's capitals
 *  suit a habit's name, not a sentence (his call, 2026-10-30). */
const plan = (unit: "Day" | "Week", list: string[]) => ({
  heading: "The Plan",
  habits: list.map((s, i) => `${unit === "Day" ? "" : "Week "}${i + 1}. ${s}`),
  columns: ["Done"],
  rowsAsTyped: true,
});

// ------------------------------------------------------------- the steps

/** Run and walk to running thirty minutes, every other day, with rest
 *  and walking between: the progression of the usual nine-week beginner
 *  plans, pressed into four weeks for someone already walking. */
export const FIVE_K = [
  "Walk 5 min. Then run 1 min, walk 2, six times",
  "Walk 30 minutes, easy",
  "Walk 5 min. Then run 1 min, walk 2, eight times",
  "Rest. Stretch your calves and hips",
  "Walk 5 min. Then run 2 min, walk 2, six times",
  "Walk 30 minutes, easy",
  "Rest",
  "Walk 5 min. Then run 3 min, walk 2, five times",
  "Walk or cycle 30 minutes",
  "Walk 5 min. Then run 4 min, walk 2, four times",
  "Rest",
  "Walk 5 min. Then run 5 min, walk 2, three times",
  "Walk 30 minutes, easy",
  "Rest",
  "Walk 5 min. Then run 6 min, walk 1, three times",
  "Walk or cycle 30 minutes",
  "Walk 5 min. Then run 8 min, walk 2, twice",
  "Rest",
  "Walk 5 min. Then run 10 min, walk 2, twice",
  "Walk 30 minutes, easy",
  "Rest",
  "Walk 5 min. Then run 12, walk 1, run 8",
  "Walk or cycle 30 minutes",
  "Walk 5 min. Then run 15, walk 1, run 10",
  "Rest",
  "Walk 5 min. Then run 20 min without stopping",
  "Walk 30 minutes, easy",
  "Walk 5 min. Then run 25 min without stopping",
  "Rest. Lay out your kit for tomorrow",
  "Run your 5K, as slowly as you like",
];

/** Thirteen weeks from a 5K to 13.1 miles: three easy runs a week and a
 *  long one, a quality session from week three, an easier week every
 *  fourth, and two weeks' taper. Short enough for the week's sidebar. */
export const HALF_MARATHON = [
  "Three easy runs; long 3 mi",
  "Three easy runs; long 4 mi",
  "Strides once; long 5 mi",
  "Easier week; long 4 mi",
  "Tempo 15 min; long 6 mi",
  "Tempo 20 min; long 7 mi",
  "Six hill repeats; long 8 mi",
  "Easier week; long 6 mi",
  "Tempo 25 min; long 9 mi",
  "Eight hill repeats; long 10 mi",
  "Tempo 30 min; long 11 mi",
  "Easier week; long 6 mi",
  "Race week: run 13.1 miles",
];

/** A drawer, a room or a pile a day, twenty minutes or so, with a rest day
 *  each week to see the change. */
export const ORGANIZE_30 = [
  "Empty your bag, wallet and pockets",
  "Clear the kitchen counters",
  "One kitchen drawer: the junk one",
  "The fridge: what's out of date goes",
  "The bathroom cabinet and old medicines",
  "Clothes you haven't worn this year",
  "Rest. Note what's already working",
  "Shoes, coats and the hallway",
  "Under the bed and behind the doors",
  "The paper pile: sort it into three",
  "Bills: list each one and when it's due",
  "Subscriptions: cancel one you forget about",
  "Passwords and the accounts that matter",
  "Rest. Take a bag to give away",
  "Your phone: delete apps you don't use",
  "Photos: clear one month of duplicates",
  "Email: unsubscribe from ten senders",
  "Your desk, or wherever you work",
  "The car, the bike or the bag you carry",
  "Cleaning supplies: what's missing",
  "Rest. Walk round and see the change",
  "A place for keys, post and chargers",
  "Write a weekly reset list",
  "Plan next week's meals",
  "Birthdays and dates into the calendar",
  "Emergency contacts and documents",
  "Books, games and things to pass on",
  "One job you've put off for months",
  "The room you use most, once more",
  "Write the rules that keep it this way",
];

/** An area of life a week. */
export const ORGANIZE_90 = [
  "The kitchen",
  "Clothes and closets",
  "Paper, bills and filing",
  "Money and subscriptions",
  "Bathroom and medicines",
  "Phone, email and photos",
  "Living room, shared spaces",
  "Garage, attic, under beds",
  "Health records and checkups",
  "Desk and work tools",
  "Calendar and routines",
  "Keepsakes, books, hobbies",
  "Review: what to keep doing",
];

/** A practice a day, in our words: what is up to you, judgements, the
 *  hard thing rehearsed, wanting less, the pause, duty, the view from
 *  above, memento mori; a look back every seventh day. */
export const STOIC_30 = [
  "List what is up to you today, and what isn't",
  "Catch one judgement; say what happened without it",
  "Rehearse one thing that could go wrong today",
  "Eat plainly, or go without one comfort",
  "Before you react, wait one breath",
  "Do one duty you've been putting off",
  "Look back: where did you keep your calm?",
  "See today's trouble from far above",
  "Be kind to someone who is hard to like",
  "Spend an hour without your phone",
  "Name a fear; write down the worst case",
  "Thank someone for a thing you take for granted",
  "Take a cold shower or a long walk",
  "Look back: where did you lose your calm?",
  "Accept one thing you can't change",
  "In one conversation, listen more than you speak",
  "You will die. What matters today?",
  "Ask what someone you admire would do",
  "Give away something you won't miss",
  "Admit one mistake out loud",
  "Look back: what has changed?",
  "Treat an insult as information",
  "Do your work well with no one watching",
  "Picture losing something you love, then enjoy it",
  "Keep one promise to yourself",
  "Plan tomorrow tonight, then let it go",
  "Spend time outside and notice its order",
  "Look back: where are you stuck?",
  "Write one rule of your own for living",
  "Read back the month; keep three practices",
];

/** A theme a week, short enough for the week's sidebar. */
export const STOIC_90 = [
  "What is up to me",
  "The judgements I add",
  "Expecting the hard thing",
  "Wanting less",
  "Anger and the pause",
  "Doing my part",
  "The view from above",
  "Patience with people",
  "Fear and the worst case",
  "Gratitude for what I have",
  "Death and what matters",
  "Work done well",
  "My rules for living",
];

/** The whole book in thirty days: three chapters a day for 27, then three
 *  days to go back. Numbers only: the words are the reader's translation. */
export const DAO_30 = [
  ...Array.from({ length: 27 }, (_, d) => `Chapters ${3 * d + 1}, ${3 * d + 2} and ${3 * d + 3}`),
  "Go back to the chapter that stayed with you",
  "Read one chapter aloud, slowly",
  "Write what you'll keep from the book",
];

/** A chapter a day: seven a week for nine weeks, then six a week for three,
 *  so the 81 end with week twelve and no week has empty days (the Gemini
 *  report, 2026-10-30: seven a week left week twelve three days short).
 *  Week thirteen goes back to the ones that stayed. */
export const DAO_90 = [
  ...Array.from({ length: 9 }, (_, w) => `Chapters ${7 * w + 1} to ${7 * w + 7}`),
  ...Array.from({ length: 3 }, (_, w) => `Chapters ${64 + 6 * w} to ${69 + 6 * w}`),
  "The chapters that stayed",
];

/** January: a week looking back, a week choosing, a week setting up, and
 *  the rest beginning. */
export const NEW_YEAR_30 = [
  "Write down the best moments of last year",
  "What was hard last year, and what helped",
  "Who mattered most to you last year",
  "What you learned, in three lines",
  "What you want to leave behind",
  "What you want to bring with you",
  "One word for last year",
  "One word for this year",
  "Three things you want this year to hold",
  "Choose the one goal that matters most",
  "Why it matters, in your own words",
  "What it will cost: time, money, saying no",
  "The first small step, this week",
  "Rest. Read back the first two weeks",
  "Put this year's big dates in your calendar",
  "Choose a day and time for a weekly review",
  "A morning you can keep most days",
  "An evening that ends the day well",
  "Money: a plan for the first month",
  "Health: one thing to start, one to stop",
  "Rest. What already feels different?",
  "Take the first step toward your goal",
  "Tell someone what you're working on",
  "Clear one thing that's in the way",
  "Plan the next month of your goal",
  "Do something kind for someone else",
  "Plan an evening off, and keep it",
  "Write a letter to yourself in December",
  "Look at the month: keep, change, drop",
  "Choose what February is for",
];

/** The first quarter, a step a week. */
export const NEW_YEAR_90 = [
  "Look back at last year",
  "A word and three hopes",
  "One goal, one first step",
  "Set up a weekly review",
  "A morning you can keep",
  "Money for the quarter",
  "Halfway: keep, change, drop",
  "Health: start one thing",
  "Time with people who matter",
  "Clear what's in the way",
  "An hour a week for a skill",
  "Rest and catch up",
  "Look back; plan the next",
];

/** A 5K in thirteen weeks: the NHS's nine-week climb, three sessions a
 *  week with a rest day between, plus two easier weeks that repeat the one
 *  before. The first 20 minutes without stopping comes in week ten, not on
 *  day 26 (the Gemini report, 2026-10-30, checked against the NHS plan).
 *  Under 28 characters: the week's sidebar. */
export const FIVE_K_90 = [
  "Run 60s, walk 90s, 8 times",
  "Run 90s, walk 2 min, 6 times",
  "Run 90s and 3 min, twice",
  "Easier: week 3 again",
  "Run 3 and 5 min, twice",
  "Run 5 min, 3 times",
  "Run 8 min, twice",
  "Easier: week 7 again",
  "Run 10 min, twice",
  "Run 20 min without stopping",
  "Run 25 min without stopping",
  "Run 28 min without stopping",
  "Run 30 min, then your 5K",
];

/** A first month of running: run and walk every other day, ending at ten
 *  minutes without stopping, not a 5K. For someone who walks but has never
 *  run; the 5K in 90 days takes it on from here. */
export const START_RUNNING = [
  "Walk 5 min. Then run 1 min, walk 2, five times",
  "Walk 20 minutes, easy",
  "Rest. Stretch your calves and hips",
  "Walk 5 min. Then run 1 min, walk 2, six times",
  "Walk 20 minutes, easy",
  "Walk 5 min. Then run 1 min, walk 90s, six times",
  "Rest",
  "Walk 5 min. Then run 90s, walk 2, six times",
  "Walk or cycle 25 minutes",
  "Walk 5 min. Then run 90s, walk 90s, six times",
  "Rest",
  "Walk 5 min. Then run 2 min, walk 2, five times",
  "Walk 25 minutes, easy",
  "Rest. Note how your legs feel",
  "Walk 5 min. Then run 2 min, walk 90s, five times",
  "Walk or cycle 30 minutes",
  "Walk 5 min. Then run 3 min, walk 2, four times",
  "Rest",
  "Walk 5 min. Then run 3 min, walk 90s, four times",
  "Walk 30 minutes, easy",
  "Rest",
  "Walk 5 min. Then run 4 min, walk 2, three times",
  "Walk or cycle 30 minutes",
  "Walk 5 min. Then run 5 min, walk 2, three times",
  "Rest",
  "Walk 5 min. Then run 6 min, walk 2, twice",
  "Walk 30 minutes, easy",
  "Walk 5 min. Then run 8 min, walk 2, run 5",
  "Rest. Lay out your kit for tomorrow",
  "Walk 5 min. Then run 10 minutes without stopping",
];

/** Ten minutes a day rising to sixty, a gentle day each week. */
export const WALK_30 = [
  "Walk 10 minutes, easy",
  "Walk 15 minutes",
  "Walk 15 minutes; notice your breathing",
  "Walk 20 minutes",
  "Walk 20 minutes on a new route",
  "Walk 20 minutes without headphones",
  "Rest, or a gentle 10-minute stroll",
  "Walk 25 minutes",
  "Walk 25 minutes, briskly",
  "Walk 30 minutes",
  "Walk 30 minutes somewhere green",
  "Walk 30 minutes",
  "Walk 35 minutes",
  "Rest, or a gentle 10-minute stroll",
  "Walk 35 minutes",
  "Walk 40 minutes",
  "Walk 40 minutes, briskly",
  "Walk 40 minutes",
  "Walk 45 minutes",
  "Walk 45 minutes somewhere new",
  "Rest, or a gentle 10-minute stroll",
  "Walk 45 minutes",
  "Walk 50 minutes",
  "Walk 50 minutes with a friend",
  "Walk 50 minutes, briskly",
  "Walk 55 minutes",
  "Walk 55 minutes",
  "Rest, or a gentle 10-minute stroll",
  "Walk 60 minutes",
  "Walk 60 minutes, wherever you like",
];

/** A walking habit for a season, a focus a week. */
export const WALK_90 = [
  "Walk 20 min, 3 times",
  "Stretch 5 min after walks",
  "Walk a new route",
  "Walk briskly for 10 min",
  "Walk 30 min, 3 times",
  "Mind your posture",
  "Walk without headphones",
  "Walk 40 min, 3 times",
  "Walk in a park or woods",
  "Add a hill or some stairs",
  "Walk 45 min, 3 times",
  "Notice your energy",
  "One long walk: 60 min",
];

/** A reading habit: minutes and pages that grow, and things to try. */
export const READING_30 = [
  "Read for 10 minutes before bed",
  "Read 10 pages of a paper book",
  "Read on your commute or lunch break",
  "Read 15 minutes, your phone in another room",
  "Visit a library or a bookshop",
  "Read a chapter of non-fiction",
  "Read for 20 minutes",
  "Mark a passage you love",
  "Read a long article or an essay",
  "Read for 20 minutes outdoors",
  "Tell a friend what you're reading",
  "Read for 25 minutes",
  "Read a kind of book you usually skip",
  "Rest, or read whatever you like",
  "Read 20 pages",
  "Read for 30 minutes",
  "Reread a book you loved as a child",
  "Read poems or a short story",
  "Read for 30 minutes before bed",
  "Copy a line you love into your notes",
  "Read 25 pages",
  "Read for 35 minutes",
  "Read an author from another country",
  "Which character has stayed with you?",
  "Read 30 pages",
  "Read for 40 minutes",
  "Write a short review of a book you finished",
  "Read for 45 minutes",
  "Choose your next three books",
  "Read whatever you like, as long as you like",
];

/** A season of reading, a focus a week. */
export const READING_90 = [
  "Set your reading goal",
  "Choose your next five books",
  "Visit a library",
  "Try a new kind of book",
  "30 minutes a day, no phone",
  "Check your pace",
  "Start a harder book",
  "Read outdoors or in a cafe",
  "Talk about a book",
  "Reread an old favorite",
  "Read some poetry",
  "Write a book review",
  "Look back at the quarter",
];

/** A month of buying only what was agreed on day one. The report's steps,
 *  rewritten and the filler cut. */
export const NO_SPEND_30 = [
  "Write your rules: what still counts as needed",
  "Unsubscribe from five shop emails",
  "Delete saved cards from your browser",
  "Pack lunch and make coffee at home",
  "Want something? Wait 24 hours",
  "Read last month's bank statement",
  "Note what makes you want to spend",
  "Cook dinner from what's in the cupboard",
  "Find a free thing to do this weekend",
  "Add up what you haven't spent so far",
  "Cancel one subscription you don't use",
  "Use something up before you replace it",
  "Leave a basket in an online cart overnight",
  "Plan a free evening with friends",
  "Mend something instead of replacing it",
  "Look at what you're saving for",
  "Clear one shelf and see what you have",
  "Write down every cent you spend today",
  "Compare savings account rates",
  "Borrow or swap something you need",
  "Add up what you haven't spent so far",
  "Remember a purchase you regretted",
  "Unfollow accounts that make you want things",
  "Sort your money papers",
  "Write down why this matters to you",
  "Plan next month's budget",
  "A day with no shopping sites or apps",
  "Plan a week of meals from the cupboard",
  "Add up what you didn't spend this month",
  "Celebrate with something free",
];

/** A quarter of money habits, one a week. */
export const NO_SPEND_90 = [
  "Write your spending rules",
  "Check your subscriptions",
  "Wait 48 hours to buy",
  "Look at your grocery spend",
  "Plan a no-spend weekend",
  "Check your debts",
  "Call about one bill",
  "Set up sinking funds",
  "Automate your saving",
  "Sell three things",
  "Review your budget",
  "Plan the next quarter",
  "Add up what you saved",
];

/** A month off drinking, for the sober-curious: noticing, not a program.
 *  Counts dry days done, never days in a row, and ends "however it went".
 *  Kept apart from the recovery planner, which is a twelve-step book. */
export const ALCOHOL_FREE_30 = [
  "Write down why you're taking a month off",
  "Clear the alcohol out of the house",
  "Stock a drink you like that isn't alcohol",
  "Notice the time you'd usually have a drink",
  "Plan this weekend's evenings",
  "Notice how you slept",
  "When you want a drink, wait ten minutes",
  "Add up the money you haven't spent",
  "Try a new way to end the day",
  "Notice your energy this morning",
  "See friends somewhere that isn't a bar",
  "Write down how you feel today",
  "Try a new kind of exercise",
  "Notice how clearly you think",
  "Have a reply ready when someone offers",
  "Read back day one",
  "Treat yourself to something that isn't food",
  "Drink more water today",
  "Write a note to you at the end of the month",
  "Notice your skin and your mood",
  "Try a hobby you've been meaning to",
  "Read back why you started",
  "Breathe slowly through a stressful moment",
  "Add up the money you haven't spent",
  "Plan a night out without alcohol",
  "Notice how things are with people close to you",
  "Write down what has helped",
  "Name what was hard, and what you learned",
  "Decide what you'll do after day 30",
  "Mark the month, however it went",
];

// ------------------------------------------------------------ the fronts

type Front = { start: string[]; end: string[]; keep?: string; safety?: string };
/** What reputable plans print before a body is asked to do more: on the
 *  front pages of the running, walking and alcohol-free challenges (the
 *  Gemini report, 2026-10-30). Two lines at 7pt. */
const safety = (body: string) => ({ heading: "Before You Start", body, align: "left", size: "small", frame: "box" });
const RUN_SAFETY = (unit: "day" | "week") =>
  `See a doctor first if you have a heart, lung or joint condition. Stop and rest if you feel chest pain, dizziness or sharp pain. Repeat any ${unit} you need to.`;
const ALCOHOL_SAFETY =
  "If you drink every day, stopping suddenly can be dangerous: see a doctor first. This is a month off, not a treatment. If it is harder than you expected, talk to someone.";
/** A module for front90's own cells, which it places. */
type Own = { slug: string; props: Record<string, unknown> };
const own = (slug: string, props: Record<string, unknown>): Own => ({ slug, props });

/** A day of running or walking: the hours beside three things for today,
 *  how the body feels and tomorrow; the day's session and how it went, a
 *  row to record it, and notes. */
function moveDay(key: string, list: string[], record: Record<string, unknown>): HeroSpread {
  return {
    key,
    layout: {
      kind: "day",
      font: "sans",
      weekStartsMonday: true,
      firstDay: 1,
      hours: DAY_HOURS,
      hoursRows: 10,
      sidebar: [
        ["daily-big-three", 4],
        ["labeled-box", 16, box("How My Body Feels")],
        ["labeled-box", 16, box("Tomorrow")],
      ],
      below: [
        at("challenge-step", 6, 11, 18, 8, step("Day", list, ["How it went"], 2)),
        at("column-table", 6, 19, 18, 6, record),
        at("labeled-box", 6, 25, 18, 11, box("Notes")),
      ],
    },
    ...UNWRITTEN,
  };
}
const RUN_RECORD = table("Today's Run", ["Distance", "Time", "Pace", "Felt"]);
const WALK_RECORD = table("Today's Walk", ["Minutes", "Steps", "Where", "Felt"]);

/** A week of a beginner's training, running or walking: the week's step,
 *  the sessions ticked by day, energy and how the body feels; the log,
 *  stretches, rest days and sleep. The half marathon's week without its
 *  strength table, which a beginner does not need yet. */
function moveWeek(key: string, list: string[], habits: string[], log: [string, Record<string, unknown> | undefined]): HeroSpread {
  return {
    key,
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["challenge-step", 7, step("Week", list, [], 1)],
        ["weekly-workout-plan", 12, { heading: "This Week", habits }],
        ["energy-chart", 8],
        ["labeled-box", 6, box("How My Body Feels")],
      ],
      belowLeft: [at(log[0], 6, BELOW_ROW, 18, 15, log[1])],
      belowRight: [
        at("stretch-routine", 0, BELOW_ROW, 12, 15),
        at("rest-day-marker", 12, BELOW_ROW, 12, 6, { habits: ["Rest day", "Active rest"] }),
        at("sleep-log", 12, 27, 12, 9),
      ],
    },
    ...UNWRITTEN,
  };
}

/** Thirty days at the front: the plan ticked off, days done, why, where you
 *  start and finish, and one thing of the challenge's own. */
function front30(key: string, list: string[], font: "serif" | "sans", f: Front): HeroSpread {
  return {
    key,
    layout: {
      kind: "pages",
      font,
      weekStartsMonday: true,
      pages: [
        [at("habit-tracker", 0, 0, 24, 32, plan("Day", list)), at("thirty-day-challenge", 0, 32, 24, 4, { heading: "Days Done" })],
        [
          at("labeled-box", 0, 0, 24, 9, box("Why I'm Doing This")),
          at("prompted-lines", 0, 9, 12, 14, prompts("At the Start", f.start, 3)),
          at("prompted-lines", 12, 9, 12, 14, prompts("At the End", f.end, 3)),
          ...(f.safety
            ? [at("text-block", 0, 23, 24, 4, safety(f.safety)), at("labeled-box", 0, 27, 24, 9, box(f.keep ?? "Notes"))]
            : [at("labeled-box", 0, 23, 24, 13, box(f.keep ?? "Notes"))]),
        ],
      ],
    },
    ...UNWRITTEN,
  };
}

/** Ninety days at the front: the thirteen weeks ticked off, why, the start
 *  and the finish, days done, and two things of the challenge's own. */
function front90(key: string, list: string[], font: "serif" | "sans", f: Front, [a, b]: [Own, Own]): HeroSpread {
  return {
    key,
    layout: {
      kind: "pages",
      font,
      weekStartsMonday: true,
      pages: [
        [
          at("habit-tracker", 0, 0, 24, 15, plan("Week", list)),
          at("labeled-box", 0, 15, 24, 8, box("Why I'm Doing This")),
          at("prompted-lines", 0, 23, 12, 13, prompts("At the Start", f.start, 3)),
          at("prompted-lines", 12, 23, 12, 13, prompts("At the End", f.end, 3)),
        ],
        f.safety
          ? [at("ninety-day-sprint", 0, 0, 24, 6, { heading: "Days Done" }), at("text-block", 0, 6, 24, 4, safety(f.safety)), at(a.slug, 0, 10, 24, 11, a.props), at(b.slug, 0, 21, 24, 15, b.props)]
          : [at("ninety-day-sprint", 0, 0, 24, 6, { heading: "Days Done" }), at(a.slug, 0, 6, 24, 15, a.props), at(b.slug, 0, 21, 24, 15, b.props)],
      ],
    },
    ...UNWRITTEN,
  };
}
export const CHALLENGE_SPREADS: HeroSpread[] = [
  // ======================================================== RUNNING
  front30("pages-challenge-5k", FIVE_K, "sans", { start: ["How long I can run", "How it feels"], end: ["How long I can run", "What changed"], keep: "Race Day Plan", safety: RUN_SAFETY("day") }),
  moveDay("day-challenge-5k", FIVE_K, RUN_RECORD),
  front90("pages-challenge-half-marathon", HALF_MARATHON, "sans", { start: ["My longest run", "My 5K time"], end: ["My finish time", "What I'd tell myself at week one"], safety: RUN_SAFETY("week") }, [
    own("column-table", table("Long Runs", ["Week", "Distance", "Time", "How it felt"], [0.8, 1, 1, 2.4])),
    own("habit-tracker", { heading: "Race Day", habits: ["Bib and pins", "Shoes you've run in", "Water and something to eat", "Watch charged", "Where to meet after"], columns: ["Packed"] }),
  ]),
  {
    key: "week-challenge-half-marathon",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["challenge-step", 7, step("Week", HALF_MARATHON, [], 1)],
        ["weekly-workout-plan", 12, { habits: ["Easy run", "Long run", "Tempo or hills", "Strength"] }],
        ["energy-chart", 8],
        ["labeled-box", 6, box("How My Body Feels")],
      ],
      belowLeft: [at("run-log", 6, BELOW_ROW, 18, 15)],
      belowRight: [
        at("workout-log", 0, BELOW_ROW, 12, 15, { heading: "Strength", columns: ["Exercise", "Sets", "Reps", "Weight"], weights: [2.6, 0.7, 0.7, 1] }),
        at("rest-day-marker", 12, BELOW_ROW, 12, 6, { habits: ["Rest day", "Active rest"] }),
        at("sleep-log", 12, 27, 12, 9),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== ORGANIZING
  front30("pages-challenge-organize-30", ORGANIZE_30, "sans", { start: ["What bothers me most at home", "How I want it to feel"], end: ["What's different", "What I'll keep doing"], keep: "Where Things Go Now" }),
  {
    key: "day-challenge-organize",
    layout: {
      kind: "day",
      font: "sans",
      weekStartsMonday: true,
      firstDay: 1,
      hours: DAY_HOURS,
      hoursRows: 10,
      sidebar: [
        ["daily-big-three", 4],
        ["labeled-box", 18, box("Notes")],
        ["labeled-box", 14, box("Tomorrow")],
      ],
      below: [
        at("challenge-step", 6, 11, 18, 8, step("Day", ORGANIZE_30, ["What I cleared"], 2)),
        at("column-table", 6, 19, 18, 9, table("Keep, Give, Toss", ["Keep", "Give away", "Toss"])),
        at("done-list", 6, 28, 18, 8),
      ],
    },
    ...UNWRITTEN,
  },
  front90("pages-challenge-organize-90", ORGANIZE_90, "sans", { start: ["What bothers me most", "How I want it to feel"], end: ["What's different", "What I'll keep doing"] }, [
    own("labeled-box", box("Where Things Go Now")),
    own("column-table", table("To Pass On", ["What", "To whom", "Done"], [2.4, 2, 0.8])),
  ]),
  {
    key: "week-challenge-organize",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["challenge-step", 8, step("Week", ORGANIZE_90, [], 3)],
        ["labeled-box", 12, box("Keep, Give, Toss")],
        ["done-list", 13],
      ],
      belowLeft: [at("todo-checklist", 6, BELOW_ROW, 18, 15, { dayCount: 3, heading: "This Week's Jobs" })],
      belowRight: [
        at("habit-tracker", 0, BELOW_ROW, 12, 15, { heading: "Daily Reset", habits: ["Dishes done", "Surfaces clear", "Post opened", "Ten-minute tidy"] }),
        at("prompted-lines", 12, BELOW_ROW, 12, 15, prompts("The Week Reviewed", ["What I cleared", "What I'll keep doing"], 3)),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== STOIC
  front30("pages-challenge-stoic-30", STOIC_30, "serif", { start: ["What upsets me most often", "What I want to change"], end: ["What upsets me now", "The practices I'll keep"], keep: "My Rules for Living" }),
  {
    key: "day-challenge-stoic",
    layout: {
      kind: "day",
      font: "serif",
      weekStartsMonday: true,
      firstDay: 1,
      hours: DAY_HOURS,
      hoursRows: 10,
      sidebar: [
        ["stoic-morning-page", 13, { prompts: ["In my control today", "Obstacles to expect", "The virtue I'll need"] }],
        ["dichotomy-of-control", 10],
        ["labeled-box", 13, box("Reading", "lined")],
      ],
      below: [
        at("challenge-step", 6, 11, 18, 5, step("Day", STOIC_30, [], 2)),
        at("stoic-evening-review", 6, 16, 18, 10),
        at("commonplace-book", 6, 26, 18, 10),
      ],
    },
    ...UNWRITTEN,
  },
  front90("pages-challenge-stoic-90", STOIC_90, "serif", { start: ["What upsets me most often", "What I want to change"], end: ["What upsets me now", "The themes I'll keep"] }, [
    own("commonplace-book", { linesPerPrompt: 3 }),
    own("labeled-box", box("My Rules for Living")),
  ]),
  {
    key: "week-challenge-stoic",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: true,
      sidebar: [
        ["challenge-step", 12, step("Week", STOIC_90, ["How I'll practise it", "Where it will be hard"], 2)],
        ["weekly-priorities", 4],
        ["commonplace-book", 17],
      ],
      belowLeft: [at("negative-visualisation", 6, BELOW_ROW, 18, 8, { linesPerPrompt: 2 }), at("labeled-box", 6, 29, 18, 7, box("Where I Fell Short"))],
      belowRight: [
        at("weekly-reflection", 0, BELOW_ROW, 12, 15, { heading: "The Week Reviewed", prompts: ["Where I kept the theme", "What I'll carry on"] }),
        at("dichotomy-of-control", 12, BELOW_ROW, 12, 15),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== DAO
  front30("pages-challenge-dao-30", DAO_30, "serif", { start: ["Why I'm reading it", "The translation I chose"], end: ["What surprised me", "What I'll keep"], keep: "Chapters That Stayed" }),
  {
    key: "day-challenge-dao",
    layout: {
      kind: "day",
      font: "serif",
      weekStartsMonday: true,
      firstDay: 1,
      hours: DAY_HOURS,
      hoursRows: 10,
      sidebar: [
        ["labeled-box", 12, box("Nature Noticed")],
        ["labeled-box", 12, box("Simple Things")],
        ["labeled-box", 12, box("Let Go Of")],
      ],
      below: [
        at("challenge-step", 6, 11, 18, 14, step("Day", DAO_30, ["The line that stayed", "What it asks of me"], 3)),
        at("labeled-box", 6, 25, 18, 11, box("Stillness")),
      ],
    },
    ...UNWRITTEN,
  },
  front90("pages-challenge-dao-90", DAO_90, "serif", { start: ["Why I'm reading it", "The translation I chose"], end: ["What surprised me", "What I'll keep"] }, [
    own("column-table", table("Chapters That Stayed", ["Chapter", "The line", "Why"], [0.8, 3, 2])),
    own("labeled-box", box("Simple Things")),
  ]),
  {
    key: "week-challenge-dao",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: true,
      hours: OFF,
      sidebar: [
        ["challenge-step", 15, step("Week", DAO_90, ["The line that stayed", "What it asks of me"], 3)],
        ["labeled-box", 9, box("Nature Noticed")],
        ["labeled-box", 9, box("Simple Things")],
      ],
      belowLeft: [at("wu-wei-reflection", 6, BELOW_ROW, 18, 15)],
      belowRight: [
        at("rating-strip", 0, BELOW_ROW, 24, 9, { heading: "Forcing or Flowing", items: DAYS, scaleMin: 1, scaleMax: 5, scaleHead: "words", lowLabel: "Forcing", highLabel: "Flowing" }),
        at("labeled-box", 0, 30, 24, 6, box("Stillness")),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== A NEW YEAR
  front30("pages-challenge-new-year-30", NEW_YEAR_30, "sans", { start: ["How last year felt", "What I want more of"], end: ["How January felt", "What I'll carry on"], keep: "A Letter to Me in December" }),
  {
    key: "day-challenge-new-year",
    layout: {
      kind: "day",
      font: "sans",
      weekStartsMonday: true,
      firstDay: 1,
      hours: DAY_HOURS,
      hoursRows: 10,
      sidebar: [
        ["daily-big-three", 4],
        ["gratitude-three", 16],
        ["labeled-box", 16, box("Tomorrow")],
      ],
      below: [
        at("challenge-step", 6, 11, 18, 14, step("Day", NEW_YEAR_30, [], 10)),
        at("todo-checklist", 6, 25, 18, 11, { dayCount: 1 }),
      ],
    },
    ...UNWRITTEN,
  },
  front90("pages-challenge-new-year-90", NEW_YEAR_90, "sans", { start: ["How last year felt", "What I want more of"], end: ["How the quarter went", "What I'll carry on"] }, [
    own("prompted-lines", prompts("My Word for the Year", ["The word", "Why this one", "What it asks of me"], 3)),
    own("labeled-box", box("A Letter to Me in December")),
  ]),
  {
    key: "week-challenge-new-year",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["challenge-step", 19, step("Week", NEW_YEAR_90, ["What I'll do", "What's in the way"], 3)],
        ["done-list", 14],
      ],
      belowLeft: [at("todo-checklist", 6, BELOW_ROW, 18, 15, { dayCount: 3, heading: "This Week" })],
      belowRight: [
        at("habit-tracker", 0, BELOW_ROW, 12, 15, { heading: "Habits", habits: ["", "", "", "", "", ""], totalColumn: true }),
        // A score each week, done over planned, as the twelve-week planner
        // keeps: one check at halfway was too far apart (Gemini report).
        at("prompted-lines", 12, BELOW_ROW, 12, 15, prompts("The Week Reviewed", ["Score: done over planned", "What went well", "What I'll change"], 2)),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== RUNNING, AGAIN
  // The 5K at the NHS's pace, the default (first on the shelf); a first
  // month for someone who has never run (Andrew, 2026-10-30: "have them as
  // options with the recommended as default").
  front90("pages-challenge-5k-90", FIVE_K_90, "sans", { start: ["How long I can run", "How it feels"], end: ["How long I can run", "What changed"], safety: RUN_SAFETY("week") }, [
    own("run-log", { heading: "Runs That Stood Out" }),
    own("habit-tracker", { heading: "Race Day", habits: ["Shoes you've run in", "Water", "Watch or phone charged", "Where to meet after"], columns: ["Packed"] }),
  ]),
  moveWeek("week-challenge-5k-90", FIVE_K_90, ["Run", "Walk", "Stretch"], ["run-log", undefined]),
  front30("pages-challenge-start-running", START_RUNNING, "sans", { start: ["How long I can run", "How it feels"], end: ["How long I can run now", "What changed"], keep: "What I'll Do Next", safety: RUN_SAFETY("day") }),
  moveDay("day-challenge-start-running", START_RUNNING, RUN_RECORD),

  // ======================================================== WALKING
  front30("pages-challenge-walking-30", WALK_30, "sans", { start: ["How long I walk easily", "How I feel"], end: ["How long I walk now", "What changed"], keep: "Routes I Like", safety: RUN_SAFETY("day") }),
  moveDay("day-challenge-walking", WALK_30, WALK_RECORD),
  front90("pages-challenge-walking-90", WALK_90, "sans", { start: ["How long I walk easily", "How I feel"], end: ["How long I walk now", "What changed"], safety: RUN_SAFETY("week") }, [
    own("column-table", table("Routes I Like", ["Route", "Minutes", "Notes"], [2, 0.8, 2.4])),
    own("labeled-box", box("How I Feel Now")),
  ]),
  moveWeek("week-challenge-walking", WALK_90, ["Walk", "Brisk walk", "Stretch"], ["column-table", table("Walks", ["Day", "Minutes", "Steps", "Where", "Felt"], [0.8, 1, 1, 2, 1])]),

  // ======================================================== READING
  front30("pages-challenge-reading-30", READING_30, "serif", { start: ["How much I read now", "What gets in the way"], end: ["How much I read now", "What changed"], keep: "Books I Finished" }),
  {
    key: "day-challenge-reading",
    layout: {
      kind: "day",
      font: "serif",
      weekStartsMonday: true,
      firstDay: 1,
      hours: DAY_HOURS,
      hoursRows: 10,
      sidebar: [
        ["labeled-box", 12, box("To Read Next")],
        ["labeled-box", 12, box("Words to Look Up")],
        ["labeled-box", 12, box("Tomorrow")],
      ],
      below: [
        at("challenge-step", 6, 11, 18, 8, step("Day", READING_30, ["What I read"], 2)),
        at("column-table", 6, 19, 18, 6, table("Today's Reading", ["Book", "Pages", "Minutes"], [3, 1, 1])),
        at("commonplace-book", 6, 25, 18, 11),
      ],
    },
    ...UNWRITTEN,
  },
  front90("pages-challenge-reading-90", READING_90, "serif", { start: ["How much I read now", "What gets in the way"], end: ["How much I read now", "What changed"] }, [
    own("books-read", {}),
    own("labeled-box", box("Books I Want to Read")),
  ]),
  {
    key: "week-challenge-reading",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: true,
      sidebar: [
        ["challenge-step", 8, step("Week", READING_90, [], 3)],
        ["labeled-box", 12, box("To Read Next")],
        ["labeled-box", 13, box("Words to Look Up")],
      ],
      belowLeft: [at("column-table", 6, BELOW_ROW, 18, 15, table("Reading Log", ["Day", "Book", "Pages", "Minutes"], [0.8, 3, 1, 1]))],
      belowRight: [
        at("commonplace-book", 0, BELOW_ROW, 12, 15, { linesPerPrompt: 3 }),
        at("prompted-lines", 12, BELOW_ROW, 12, 15, prompts("The Week's Reading", ["What stayed with me", "What I'll read next"], 3)),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== NO SPENDING
  front30("pages-challenge-no-spend-30", NO_SPEND_30, "sans", { start: ["What I spend on without thinking", "What I'm saving for"], end: ["What I didn't spend", "What I'll keep doing"], keep: "My Rules" }),
  {
    key: "day-challenge-no-spend",
    layout: {
      kind: "day",
      font: "sans",
      weekStartsMonday: true,
      firstDay: 1,
      hours: DAY_HOURS,
      hoursRows: 10,
      sidebar: [
        ["daily-big-three", 4],
        ["labeled-box", 16, box("Wanted, Not Bought")],
        ["labeled-box", 16, box("Free Things to Do")],
      ],
      below: [
        at("challenge-step", 6, 11, 18, 8, step("Day", NO_SPEND_30, ["How it went"], 2)),
        at("spending-log", 6, 19, 18, 10, { heading: "Spent Today", columns: ["Item", "Category", "Cost", "Needed?"], weights: [2.4, 1.4, 1, 1] }),
        at("labeled-box", 6, 29, 18, 7, box("Notes")),
      ],
    },
    ...UNWRITTEN,
  },
  front90("pages-challenge-no-spend-90", NO_SPEND_90, "sans", { start: ["What I spend on without thinking", "What I'm saving for"], end: ["What I didn't spend", "What I'll keep doing"] }, [
    own("column-table", table("Subscriptions", ["What", "Cost", "Keep?"], [2.6, 1, 0.8])),
    own("labeled-box", box("My Rules")),
  ]),
  {
    key: "week-challenge-no-spend",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["challenge-step", 8, step("Week", NO_SPEND_90, [], 3)],
        ["labeled-box", 12, box("Wanted, Not Bought")],
        ["labeled-box", 13, box("Free Things to Do")],
      ],
      belowLeft: [at("spending-log", 6, BELOW_ROW, 18, 15)],
      belowRight: [
        at("habit-tracker", 0, BELOW_ROW, 12, 15, { heading: "No-Spend Days", habits: ["Spent nothing", "Cooked at home", "Waited to buy"] }),
        at("prompted-lines", 12, BELOW_ROW, 12, 15, prompts("The Week Reviewed", ["What I spent", "What I didn't", "What I'll change"], 2)),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== ALCOHOL-FREE
  front30("pages-challenge-alcohol-free", ALCOHOL_FREE_30, "sans", { start: ["A usual week of drinking", "What I hope changes"], end: ["How I feel now", "What I'll do next"], keep: "Money Not Spent", safety: ALCOHOL_SAFETY }),
  {
    key: "day-challenge-alcohol-free",
    layout: {
      kind: "day",
      font: "sans",
      weekStartsMonday: true,
      firstDay: 1,
      hours: DAY_HOURS,
      hoursRows: 10,
      sidebar: [
        ["daily-big-three", 4],
        ["labeled-box", 16, box("How I Feel")],
        ["labeled-box", 16, box("Tomorrow")],
      ],
      below: [
        at("challenge-step", 6, 11, 18, 8, step("Day", ALCOHOL_FREE_30, ["How it went"], 2)),
        at("energy-pain-scale", 6, 19, 18, 6, { heading: "Check In", items: ["Sleep", "Energy", "Mood"], scaleMax: 5 }),
        at("labeled-box", 6, 25, 18, 11, box("Notes")),
      ],
    },
    ...UNWRITTEN,
  },
];
