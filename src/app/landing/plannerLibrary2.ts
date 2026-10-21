// THE PLANNER LIBRARY, SECOND SHELF (2026-10-21): the planners the Gemini
// library report (handoff/research/gemini-report-planner-library.md) went
// deepest on, and the life events and hobbies it checked demand for. Same
// rules as plannerLibrary.ts, plus what the report found, kept where it held
// up under review:
//
//   - Rate the effort, not the minutes: a language week asks how it went,
//     not how long, and nothing counts days in a row.
//   - A writing planner has to survive the end of the first draft: scenes,
//     revision passes and submissions, not only word counts.
//   - Ikigai as Ken Mogi's small pillars (starting small, letting go,
//     harmony, small joys, the here and now), never the Western Venn
//     diagram of passion and pay.
//   - Franklin's chart is a week, thirteen virtues down by seven days, with
//     what was kept well beside the slips. His precepts are his own words
//     (the Autobiography, public domain).
//   - The Tao Te Ching is the reader's own translation: we print chapter
//     numbers and our own questions, never a translator's text.
//   - One objective a quarter, not a company's OKR tree; a month's task list
//     with a status column, not tasks rewritten every day.
//   - Grief gets no timeline and no progress bar. Pregnancy waits: the
//     report's warning about planners left half-used after a loss.
//   - Health planners are logs to bring to a doctor or dietitian; nothing
//     here claims to treat anything.
//
// Data only. Checked by spreads.test.mts like every planner spread.

import { BELOW_ROW } from "./archetypes";
import type { HeroSpread } from "./heroSpreads";
import { LAST, UNWRITTEN, at, box, prompts, steps, table } from "./plannerLibrary";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const OFF = { intervalMode: "off", offModeRule: "dotted" } as const;

export const LIBRARY_SPREADS_2: HeroSpread[] = [
  // ======================================================== PLANNING
  // ------------------------------------------------ rapid log
  // Quick capture on a dotted day, a future log a year ahead, and a month
  // whose task list carries a status column, so an unfinished task is
  // marked moved instead of written out again every day (the report's
  // "constant migration of the same tasks tedious and overwhelming").
  {
    key: "pages-rapid-log",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("index", 0, 0, 12, 36),
          at("labeled-box", 12, 0, 12, 10, box("My Key")),
          at("someday-maybe", 12, 10, 12, 13),
          at("labeled-box", 12, 23, 12, 13, box("Lists I Keep")),
        ],
        [
          at("future-log-months", 0, 0, 24, 18),
          at("future-log-months", 0, 18, 24, 18, { heading: "Future Log", prompts: ["July", "August", "September", "October", "November", "December"] }),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-rapid-log",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "lined",
      sidebar: [
        ["labeled-box", 10, box("This Month's Goals")],
        ["labeled-box", 12, box("Carried Over")],
        ["done-list", 12],
      ],
      belowLeft: [at("column-table", 6, 17, 18, 19, table("Tasks This Month", ["Task", "Priority", "Status"], [3, 0.9, 1.1]))],
      belowRight: [at("monthly-review", 0, 17, 12, 19), at("labeled-box", 12, 17, 12, 19, box("Notes", "dotted"))],
    },
    ...UNWRITTEN,
  },
  {
    key: "day-rapid-log",
    layout: {
      kind: "day",
      font: "sans",
      weekStartsMonday: true,
      firstDay: 0,
      hours: OFF,
      hoursRows: 24,
      sidebar: [
        ["daily-big-three", 6],
        ["labeled-box", 10, box("Events")],
        ["labeled-box", 10, box("Notes")],
        ["done-list", 10],
      ],
      below: [at("labeled-box", 6, 25, 18, 11, box("Tomorrow"))],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ one objective a quarter
  // The report's verdict on personal OKRs: worth it only stripped down to
  // one objective a quarter, a leading and a lagging measure, and a weekly
  // check of how sure you are.
  {
    key: "pages-quarterly-objective",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 14, prompts("The Objective", ["What I want by the end of the quarter", "Why this, and why now", "What I'm not doing this quarter"])),
          at("column-table", 0, 14, 24, 12, table("Key Results", ["Key result", "Leading or lagging", "Start", "Target"], [3, 1.4, 0.8, 0.8])),
          at("progress-meter", 0, 26, 12, 10, { heading: "13 Weeks", total: 13, milestoneEvery: 1, numbers: "every" }),
          at("labeled-box", 12, 26, 12, 10, box("What Could Get in the Way")),
        ],
        [
          at("column-table", 0, 0, 24, 22, table("Weekly Check-ins", ["Week", "How sure, 1 to 10", "What moved it", "What's in the way"], [0.7, 1.3, 2, 2])),
          at("prompted-lines", 0, 22, 24, 14, prompts("End of the Quarter", ["Where I landed", "What I learned", "Next quarter's objective"])),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-quarterly-objective",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["prompted-lines", 10, prompts("This Week", ["The one thing that moves it", "My leading measure"])],
        ["weekly-priorities", 7],
        ["done-list", 16],
      ],
      belowLeft: [
        at("todo-checklist", 6, BELOW_ROW, 18, 9, { heading: "Moves the Objective", dayCount: 3 }),
        at("rating-strip", 6, 30, 18, 6, { heading: "How Sure I Am", items: ["We'll hit it this quarter"], scaleMin: 1, scaleMax: 10 }),
      ],
      belowRight: [
        at("todo-checklist", 0, BELOW_ROW, 24, 9, { heading: "Moves the Objective", dayCount: 4 }),
        at("prompted-lines", 0, 30, 24, 6, prompts("Weekly Check-in", ["What moved it?", "What's in the way?"], 1)),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== GROWTH
  // ------------------------------------------------ language learning
  // Input and output balanced, effort rated rather than minutes counted, and
  // the week's days left dotted for a few lines in the language each day
  // (the report's learner: "I write a summary of my day in my target
  // language"). Milestones by the CEFR levels, as can-do statements.
  {
    key: "pages-language",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 12, prompts("Why I'm Learning", ["Language", "Why", "What I want to be able to do in a year"], 2, { promptLines: [1, 2, 3] })),
          at("prompted-lines", 0, 12, 12, 24, prompts("Milestones", ["A1: I can", "A2: I can", "B1: I can", "B2: I can", "C1: I can", "C2: I can"], 2)),
          at("column-table", 12, 12, 12, 24, table("Resources", ["Resource", "Kind", "Status"], [2.2, 1, 1])),
        ],
        [
          at("language-study", 0, 0, 24, 24, { heading: "Words to Keep" }),
          at("column-table", 0, 24, 12, 12, table("Phrases for Real Life", ["I want to say", "How to say it"], [1, 1.4])),
          at("labeled-box", 12, 24, 12, 12, box("Mistakes I Keep Making")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-language",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "lined",
      sidebar: [
        ["prompted-lines", 14, prompts("This Month", ["Words to learn", "Grammar to master", "Something to watch or read"])],
        ["labeled-box", 10, box("Wins")],
        ["labeled-box", 10, box("Struggled With")],
      ],
      belowLeft: [at("listening-log", 6, 17, 18, 19, { heading: "Watched, Read, Listened", columns: ["Title", "Kind", "Understood"], weights: [2.6, 1, 1.2] })],
      belowRight: [at("language-study", 0, 17, 12, 19, { heading: "New Words" }), at("monthly-review", 12, 17, 12, 19)],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-language",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      hours: OFF,
      sidebar: [
        ["prompted-lines", 12, prompts("This Week", ["Grammar point", "Words to learn", "Speaking practice"])],
        ["language-study", 14, { heading: "Words" }],
        ["labeled-box", 7, box("Phrases I Needed")],
      ],
      belowLeft: [
        at("habit-tracker", 6, BELOW_ROW, 18, 9, { heading: "Practice", habits: ["Listened", "Read", "Spoke", "Wrote", "Reviewed words"] }),
        at("rating-strip", 6, 30, 18, 6, { heading: "How It Went", items: ["Understood", "Spoke", "Effort"], scaleMin: 1, scaleMax: 5 }),
      ],
      belowRight: [at("labeled-box", 0, BELOW_ROW, 24, 15, box("This Week, in My Language"))],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ writing a book
  // Outline, draft and revise: the scene list and characters at the front,
  // revision passes and submissions for after the draft, a month of
  // chapters by stage, and a week of sessions logged with what was worked
  // on, so a revision week counts as much as a drafting one. No grid of
  // writing days to break.
  {
    key: "pages-writing",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 12, prompts("The Book", ["Working title", "What it's about, in a sentence", "Who it's for", "Finished by"], 2, { promptLines: [1, 2, 1, 1] })),
          at("progress-meter", 0, 12, 24, 6, { heading: "Toward My Word Count", total: 100, milestoneEvery: 10, numbers: "milestones", startLabel: "0", endLabel: "Goal" }),
          at("column-table", 0, 18, 24, 18, table("Scenes", ["#", "Scene", "Point of view", "Where", "What changes"], [0.5, 2.2, 1.1, 1, 2])),
        ],
        [
          at("column-table", 0, 0, 24, 14, table("Characters", ["Name", "Wants", "Fears", "Changes how"], [1.2, 1.6, 1.6, 1.8])),
          at("todo-checklist", 0, 14, 12, 12, steps("Revision Passes", ["Structure and plot", "Characters and arcs", "Scene by scene", "Line edit", "Read aloud", "Proofread"])),
          at("labeled-box", 12, 14, 12, 12, box("Research to Do")),
          at("column-table", 0, 26, 24, 10, table("Submissions", ["Agent or press", "Sent", "Heard back"], [2.4, 1, 1.2])),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-writing",
    layout: {
      kind: "month",
      font: "serif",
      weekStartsMonday: true,
      inside: "lined",
      sidebar: [
        ["prompted-lines", 15, prompts("This Month", ["Chapters to draft or revise", "Arcs to move forward", "Holes to fix"])],
        ["labeled-box", 10, box("Ideas")],
        ["labeled-box", 9, box("Wins")],
      ],
      belowLeft: [at("column-table", 6, 17, 18, 19, table("Chapters", ["Chapter", "Stage", "Words", "Notes"], [1, 1.2, 0.8, 2]))],
      belowRight: [
        at("todo-checklist", 0, 17, 12, 10, { heading: "Research", dayCount: 1 }),
        at("labeled-box", 12, 17, 12, 10, box("Questions for My Readers")),
        at("monthly-review", 0, 27, 24, 9),
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-writing",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: true,
      sidebar: [
        ["prompted-lines", 10, prompts("This Week", ["Scenes or pass to work on", "When I'll write"])],
        ["weekly-priorities", 7],
        ["labeled-box", 16, box("Ideas & Lines")],
      ],
      belowLeft: [at("column-table", 6, BELOW_ROW, 18, 15, table("Sessions", ["Day", "Scene or pass", "Words", "Felt"], [0.8, 2.4, 0.8, 0.8]))],
      belowRight: [at("labeled-box", 0, BELOW_ROW, 12, 15, box("Scene Ideas")), at("labeled-box", 12, BELOW_ROW, 12, 15, box("Dialogue Snippets"))],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ life design
  // A wheel of life to see where things stand, Ken Mogi's small pillars of
  // ikigai in our own words, a year reviewed and a letter to yourself; a
  // month of one small shift per area; a week of small things and the
  // moments that flowed.
  {
    key: "pages-life-design",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: true,
      pages: [
        [
          at("rating-strip", 0, 0, 24, 12, { heading: "Wheel of Life", items: ["Health", "Work", "Money", "Home", "Family", "Friends", "Fun", "Growth"], scaleMin: 1, scaleMax: 10 }),
          at("prompted-lines", 0, 12, 24, 24, prompts("Meaning in Small Things", ["Start small: one thing I'll do well", "Let go: what I can put down", "Harmony: who and what I live alongside", "Small joys: what I already love", "Here and now: where I want to be present"])),
        ],
        [
          at("prompted-lines", 0, 0, 24, 18, prompts("The Year in Review", ["Best moments", "What drained me", "What to keep", "What to change"])),
          at("labeled-box", 0, 18, 24, 18, box("A Letter to Myself, a Year From Now")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-life-design",
    layout: {
      kind: "month",
      font: "serif",
      weekStartsMonday: true,
      inside: "dotted",
      sidebar: [
        ["labeled-box", 12, box("Small Joys")],
        ["labeled-box", 11, box("Enough, This Month")],
        ["labeled-box", 11, box("Put Down")],
      ],
      belowLeft: [at("column-table", 6, 17, 18, 19, table("Life Areas", ["Area", "How it is", "One small shift"], [1, 2, 2]))],
      belowRight: [
        at("rating-strip", 0, 17, 24, 10, { heading: "Wheel of Life", items: ["Health", "Work", "Money", "Home", "Family", "Friends", "Fun", "Growth"], scaleMin: 1, scaleMax: 10 }),
        at("monthly-review", 0, 27, 24, 9),
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-life-design",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: true,
      sidebar: [
        ["weekly-priorities", 7],
        ["gratitude-three", 12, { heading: "Small Joys" }],
        ["labeled-box", 14, box("Moments of Flow")],
      ],
      belowLeft: [at("todo-checklist", 6, BELOW_ROW, 18, 15, { heading: "Small Things I'll Do", dayCount: 3 })],
      belowRight: [
        at("todo-checklist", 0, BELOW_ROW, 24, 9, { heading: "Small Things I'll Do", dayCount: 4 }),
        at("prompted-lines", 0, 30, 24, 6, prompts("This Week", ["Where did I find harmony?", "What can I put down?"], 1)),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== PHILOSOPHY
  // ------------------------------------------------ Taoist practice
  // Light on purpose: a structure that demands too much works against wu wei
  // (the report's reason people drop Taoist journals). The 81 chapters read
  // slowly in a translation of your choosing, nature noticed, and a week
  // whose days are left as open dots.
  {
    key: "pages-tao",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: true,
      pages: [
        [
          at("progress-meter", 0, 0, 24, 9, { heading: "81 Chapters", total: 81, milestoneEvery: 9, numbers: "every" }),
          at("prompted-lines", 0, 9, 24, 15, prompts("The Uncarved Block", ["Where am I forcing things?", "What would yielding look like?", "What can I leave undone?"])),
          at("column-table", 0, 24, 24, 12, table("Translations I Read", ["Translator", "Year", "What I notice"], [1.6, 0.7, 2.4])),
        ],
        [
          at("tao-daily-verse", 0, 0, 24, 18, { heading: "A Chapter Read Slowly" }),
          at("labeled-box", 0, 18, 12, 18, box("Nature Noticed", "dotted")),
          at("labeled-box", 12, 18, 12, 18, box("What I Let Go Of")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-tao",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: true,
      hours: OFF,
      sidebar: [
        ["tao-daily-verse", 15, { heading: "This Week's Chapter" }],
        ["labeled-box", 9, box("Nature Noticed")],
        ["labeled-box", 9, box("Simple Things")],
      ],
      belowLeft: [at("wu-wei-reflection", 6, BELOW_ROW, 18, 15)],
      belowRight: [
        at("rating-strip", 0, BELOW_ROW, 24, 9, { heading: "Forcing or Flowing", items: DAYS, scaleMin: 1, scaleMax: 5, lowLabel: "Forcing", highLabel: "Flowing" }),
        at("labeled-box", 0, 30, 24, 6, box("Stillness")),
      ],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ Franklin's virtues
  // His thirteen virtues in his own words (the Autobiography, 1791), a week
  // on each, four rounds a year; his chart of the week with the slips, and
  // beside it what was kept well, so it is not only a record of faults. His
  // morning and evening questions from the same chapter.
  {
    key: "pages-franklin",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: false,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 36, prompts("The Thirteen Virtues", [
            "Temperance: eat not to dulness; drink not to elevation.",
            "Silence: speak not but what may benefit others or yourself; avoid trifling conversation.",
            "Order: let all your things have their places; let each part of your business have its time.",
            "Resolution: resolve to perform what you ought; perform without fail what you resolve.",
            "Frugality: make no expense but to do good to others or yourself; i.e., waste nothing.",
            "Industry: lose no time; be always employ'd in something useful; cut off all unnecessary actions.",
            "Sincerity: use no hurtful deceit; think innocently and justly, and, if you speak, speak accordingly.",
            "Justice: wrong none by doing injuries, or omitting the benefits that are your duty.",
            "Moderation: avoid extremes; forbear resenting injuries so much as you think they deserve.",
            "Cleanliness: tolerate no uncleanliness in body, cloaths, or habitation.",
            "Tranquillity: be not disturbed at trifles, or at accidents common or unavoidable.",
            "Chastity: never to dulness, weakness, or the injury of your own or another's peace or reputation.",
            "Humility: imitate Jesus and Socrates.",
          ], 1)),
        ],
        [
          at("column-table", 0, 0, 24, 18, table("Thirteen Weeks", ["Week", "Virtue", "What I'll practise"], [0.7, 1.3, 2.6])),
          at("progress-meter", 0, 18, 24, 6, { heading: "Four Rounds a Year", total: 52, milestoneEvery: 13, numbers: "milestones" }),
          at("prompted-lines", 0, 24, 12, 12, prompts("Morning and Evening", ["The morning question: what good shall I do this day?", "The evening question: what good have I done to-day?"])),
          at("labeled-box", 12, 24, 12, 12, box("Progress Noticed")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-franklin",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: false,
      sidebar: [
        ["prompted-lines", 13, prompts("This Week's Virtue", ["Virtue", "Where it will be tested", "How I'll keep it"])],
        ["labeled-box", 10, box("Kept Well")],
        ["labeled-box", 10, box("Slipped")],
      ],
      belowLeft: [at("franklin-virtues", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("labeled-box", 0, BELOW_ROW, 12, 15, box("What Good I Did")), at("weekly-reflection", 12, BELOW_ROW, 12, 15, { heading: "The Week Reviewed" })],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ existentialist journal
  // Responsibility for one's choices, the absurd met with chosen meaning,
  // bad faith noticed in everyday excuses: philosophy brought down to the
  // week, which is where the report says such journals succeed or fail.
  {
    key: "pages-existential",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 16, prompts("Radical Responsibility", ["What am I pretending I can't change?", "Where am I blaming circumstances?", "What do I choose, knowing I could choose otherwise?"])),
          at("values-list", 0, 16, 12, 20, { heading: "Values I Choose" }),
          at("prompted-lines", 12, 16, 12, 20, prompts("If This Were All", ["What would I stop doing?", "What would I start?"], 4)),
        ],
        [
          at("column-table", 0, 0, 24, 20, table("Absurd Moments", ["What happened", "My first reaction", "The meaning I choose"], [2, 1.6, 2])),
          at("labeled-box", 0, 20, 24, 16, box("Questions I'm Living With")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-existential",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: true,
      sidebar: [
        ["prompted-lines", 12, prompts("This Week", ["A choice I'm facing", "What I'd do if no one were watching"])],
        ["weekly-priorities", 7],
        ["labeled-box", 14, box("Norms I Followed Without Thinking")],
      ],
      belowLeft: [at("prompted-lines", 6, BELOW_ROW, 18, 15, prompts("Bad Faith Check", ["Where did I say \"I had no choice\"?", "What was the choice?", "What will I own next time?"]))],
      belowRight: [at("column-table", 0, BELOW_ROW, 24, 15, table("Absurd Moments", ["Day", "What happened", "The meaning I choose"], [0.7, 2, 2]))],
    },
    ...UNWRITTEN,
  },

  // ======================================================== FAMILY & LIFE
  // ------------------------------------------------ wedding
  // The report's most structured niche: the guest list as the whole first
  // page, budget, vendors and payments, the month's decisions and the
  // week's calls. Fittings, tastings and the day itself are calendar events.
  {
    key: "pages-wedding",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: false,
      pages: [
        [at("column-table", 0, 0, 24, 36, table("Guest List", ["Name", "Party", "RSVP", "Meal", "Gift", "Thanked"], [2.4, 0.7, 0.8, 1, 1.2, 0.9], { rowNumbers: true }))],
        [
          at("column-table", 0, 0, 24, 16, table("Budget", ["Item", "Budget", "Actual", "Paid"], [2.4, 1, 1, 0.8], { totalsRow: true })),
          at("column-table", 0, 16, 24, 12, table("Vendors", ["Vendor", "Contact", "Deposit", "Balance due"], [1.8, 2, 1, 1.1])),
          at("prompted-lines", 0, 28, 12, 8, prompts("The Day", ["Date and time", "Where"], 1)),
          at("labeled-box", 12, 28, 12, 8, box("Must-Have Photos")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-wedding",
    layout: {
      kind: "month",
      font: "serif",
      weekStartsMonday: false,
      inside: "lined",
      sidebar: [
        ["todo-checklist", 12, { heading: "This Month", dayCount: 1 }],
        ["labeled-box", 11, box("Decisions to Make")],
        ["labeled-box", 11, box("Ideas")],
      ],
      belowLeft: [at("column-table", 6, 17, 18, 19, table("Payments Due", ["Vendor", "Amount", "Due", "Paid"], [2, 1, 1, 0.8]))],
      belowRight: [
        at("column-table", 0, 17, 24, 10, table("RSVPs In", ["Name", "Coming", "Meal"], [2.4, 0.9, 1])),
        at("labeled-box", 0, 27, 12, 9, box("Questions for Vendors")),
        at("labeled-box", 12, 27, 12, 9, box("Notes")),
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-wedding",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: false,
      sidebar: [
        ["weekly-priorities", 7],
        ["waiting-on", 13, { heading: "Waiting to Hear From" }],
        ["labeled-box", 13, box("Ideas & Inspiration")],
      ],
      belowLeft: [at("todo-checklist", 6, BELOW_ROW, 18, 15, { dayCount: 3 })],
      belowRight: [
        at("todo-checklist", 0, BELOW_ROW, 24, 9, { dayCount: 4 }),
        at("labeled-box", 0, 30, 12, 6, box("Calls to Make")),
        at("labeled-box", 12, 30, 12, 6, box("Time for Us")),
      ],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ new baby
  // The first months: a day page of feeds, sleep and changes for the
  // round-the-clock days, notes for the doctor, and the parent looked after
  // too; a week of firsts; who to call, help offered and growth at the front.
  {
    key: "pages-new-baby",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("column-table", 0, 0, 24, 12, table("Who to Call", ["Who", "Name", "Number"], [1.3, 1.6, 1.6])),
          at("column-table", 0, 12, 24, 12, table("Help Offered", ["Who", "What", "When"], [1.4, 2.4, 1])),
          at("column-table", 0, 24, 12, 12, table("Growth", ["Date", "Weight", "Length", "Head"], [1.1, 1, 1, 1])),
          at("labeled-box", 12, 24, 12, 12, box("Firsts")),
        ],
        [
          at("column-table", 0, 0, 24, 14, table("Checkups & Shots", ["Date", "What", "Notes"], [0.9, 1.8, 2.4])),
          at("column-table", 0, 14, 24, 12, table("Gifts & Thank-Yous", ["From", "Gift", "Thanked"], [1.6, 2.4, 0.9])),
          at("labeled-box", 0, 26, 24, 10, box("Things I Want to Remember")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-new-baby",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["weekly-priorities", 7, { heading: "Just Three Things" }],
        ["labeled-box", 12, box("Firsts")],
        ["labeled-box", 14, box("Questions for the Doctor")],
      ],
      belowLeft: [at("labeled-box", 6, BELOW_ROW, 18, 15, box("This Week With You"))],
      belowRight: [
        at("self-care-checklist", 0, BELOW_ROW, 24, 9, { heading: "Looking After Me" }),
        at("labeled-box", 0, 30, 24, 6, box("Help I Can Ask For")),
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "day-new-baby",
    layout: {
      kind: "day",
      font: "sans",
      weekStartsMonday: true,
      firstDay: 0,
      hours: OFF,
      hoursRows: 10,
      sidebar: [
        ["column-table", 12, table("Sleep", ["Down", "Up", "Hrs"], [1, 1, 0.8])],
        ["column-table", 12, table("Changes", ["Time", "Wet", "Dirty"], [1.2, 0.8, 0.8])],
        ["labeled-box", 12, box("Notes for the Doctor")],
      ],
      below: [
        at("column-table", 6, 11, 18, 17, table("Feeds", ["Time", "Side or bottle", "How much", "How long"], [0.9, 1.4, 1, 1])),
        at("rating-strip", 6, 28, 18, 8, { heading: "Me Today", items: ["Rest", "Mood", "Ate well"], scaleMin: 1, scaleMax: 5 }),
      ],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ caregiver
  // Caring for someone: everything a stand-in or a doctor would need at the
  // front, the week's medicines and symptoms, the month's refills, bills and
  // claims; and room for the carer, since burnout is the report's first word
  // on this niche.
  {
    key: "pages-caregiver",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 12, prompts("About Them", ["Name and date of birth", "Allergies", "Conditions", "Insurance and ID numbers"], 2, { promptLines: [1, 1, 2, 2] })),
          at("column-table", 0, 12, 24, 12, table("Care Team", ["Who", "Role", "Phone"], [1.6, 1.4, 1.4])),
          at("column-table", 0, 24, 24, 12, table("Medicines", ["Medicine", "Dose", "When", "For"], [2, 1, 1.2, 1.6])),
        ],
        [
          at("column-table", 0, 0, 24, 12, table("Help I Can Ask For", ["Who", "What they can do", "Phone"], [1.4, 2.4, 1.2])),
          at("prompted-lines", 0, 12, 24, 12, prompts("When I Need a Break", ["Who can step in", "What recharges me", "One thing I'll stop doing"])),
          at("labeled-box", 0, 24, 24, 12, box("Important Papers: Where They Are")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-caregiver",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "lined",
      sidebar: [
        ["labeled-box", 12, box("How They Were")],
        ["labeled-box", 11, box("Changes to Mention")],
        ["labeled-box", 11, box("For Me")],
      ],
      belowLeft: [at("column-table", 6, 17, 18, 19, table("Bills & Claims", ["What", "Amount", "Sent", "Status"], [2.2, 1, 0.9, 1]))],
      belowRight: [at("column-table", 0, 17, 24, 10, table("Refills", ["Medicine", "Pharmacy", "Due", "Done"], [2, 1.6, 1, 0.8])), at("monthly-review", 0, 27, 24, 9)],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-caregiver",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["weekly-priorities", 7],
        ["labeled-box", 13, box("Questions for the Doctor")],
        ["labeled-box", 13, box("For Me")],
      ],
      belowLeft: [at("medication-log", 6, BELOW_ROW, 18, 8), at("symptom-tracker", 6, 29, 18, 7)],
      belowRight: [at("todo-checklist", 0, BELOW_ROW, 24, 9, { dayCount: 4 }), at("labeled-box", 0, 30, 24, 6, box("How They Were This Week"))],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ grief
  // Gentle, and with no timeline: nothing to fill in by a date, no bar to
  // reach the end of. Remembering, the people to call and the dates that may
  // be hard; the practical things after a death; a week of open lines.
  {
    key: "pages-grief",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 14, prompts("Remembering", ["Their name", "What I miss most", "Something I want to remember"], 2, { promptLines: [1, 3, 3] })),
          at("column-table", 0, 14, 24, 10, table("People I Can Call", ["Name", "Number", "Good for"], [1.6, 1.4, 2])),
          at("column-table", 0, 24, 24, 12, table("Dates That May Be Hard", ["Date", "Why", "What might help"], [0.9, 1.8, 2.2])),
        ],
        [
          at("column-table", 0, 0, 24, 18, table("Things to Sort", ["What", "Who's helping", "Done"], [2.6, 1.6, 0.7])),
          at("labeled-box", 0, 18, 24, 18, box("Letters to Them")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-grief",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: true,
      sidebar: [
        ["weekly-priorities", 7, { heading: "Only What Matters" }],
        ["labeled-box", 13, box("A Memory")],
        ["labeled-box", 13, box("People Who Helped")],
      ],
      belowLeft: [at("labeled-box", 6, BELOW_ROW, 18, 15, box("This Week"))],
      belowRight: [at("mood-tracker", 0, BELOW_ROW, 24, 9, { heading: "How I Was" }), at("labeled-box", 0, 30, 24, 6, box("Small Things That Helped"))],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ homeschool
  // Subjects and the year at the front, field trips; hours by subject each
  // month for the states that ask for a record, work samples kept; a week of
  // lessons over a school-day's hours, what got done by subject, and the
  // books read together.
  {
    key: "pages-homeschool",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("column-table", 0, 0, 24, 14, table("Subjects", ["Subject", "Curriculum", "Days a week", "Child"], [1.4, 2.2, 1, 1])),
          at("future-log-months", 0, 14, 24, 22, { heading: "The Year", prompts: ["August", "September", "October", "November", "December", "January"] }),
        ],
        [
          at("future-log-months", 0, 0, 24, 22, { heading: "The Year", prompts: ["February", "March", "April", "May", "June", "July"] }),
          at("column-table", 0, 22, 12, 14, table("Field Trips", ["Where", "When", "What we learned"], [1.4, 0.9, 1.8])),
          at("labeled-box", 12, 22, 12, 14, box("Ideas to Try")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-homeschool",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "lined",
      sidebar: [
        ["labeled-box", 12, box("Themes & Units")],
        ["labeled-box", 11, box("Read Together")],
        ["kids-said", 11],
      ],
      belowLeft: [at("column-table", 6, 17, 18, 19, table("Hours by Subject", ["Subject", "Wk 1", "Wk 2", "Wk 3", "Wk 4", "Total"], [1.6, 0.8, 0.8, 0.8, 0.8, 0.8]))],
      belowRight: [at("column-table", 0, 17, 24, 10, table("Work Samples & Tests", ["Date", "Subject", "What"], [0.9, 1.2, 2.6])), at("monthly-review", 0, 27, 24, 9)],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-homeschool",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      hours: { startTime: "08:00", endTime: "15:00", intervalMinutes: 30 },
      hoursRows: 9,
      sidebar: [
        ["weekly-priorities", 7],
        ["labeled-box", 12, box("Supplies to Gather")],
        ["kids-said", 14],
      ],
      belowLeft: [
        at("lesson-planner", 6, 10, 18, 14),
        at("habit-tracker", 6, 24, 18, 12, { heading: "Done Today", habits: ["Reading", "Writing", "Math", "Science", "History", "Art & music", "Outside"] }),
      ],
      belowRight: [
        at("todo-checklist", 0, 10, 24, 12, { heading: "Each Day", dayCount: 4 }),
        at("books-read", 0, 22, 12, 14, { heading: "Read Together" }),
        at("labeled-box", 12, 22, 12, 14, box("What They Loved")),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== FAITH
  // ------------------------------------------------ Ramadan
  // The month itself: thirty days of the fast, night prayer, Quran, sadaqah
  // and dhikr at the front, the juz read, duas and Eid prepared for; a day
  // page from before suhoor to after taraweeh. "Reflection and return"
  // first, as the report found the best-loved Ramadan journals put it, not a
  // productivity planner. To be read by a Muslim reader before promotion.
  {
    key: "pages-ramadan",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: true,
      pages: [
        // The thirty days need a page: the log's rows, the fast and what is
        // kept each day, sadaqah among them.
        [at("ramadan-log", 0, 0, 24, 36)],
        [
          at("quran-reading-plan", 0, 0, 24, 8),
          at("prompted-lines", 0, 8, 24, 13, prompts("Intentions for Ramadan", ["What I hope to grow in", "What I want to leave behind", "Who I want to be by Eid"])),
          at("labeled-box", 0, 21, 12, 15, box("Duas")),
          at("column-table", 12, 21, 12, 8, table("Preparing for Eid", ["What", "For whom", "Done"], [1.8, 1.4, 0.8])),
          at("labeled-box", 12, 29, 12, 7, box("To Keep After Ramadan")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "day-ramadan",
    layout: {
      kind: "day",
      font: "serif",
      weekStartsMonday: true,
      firstDay: 0,
      hours: { startTime: "04:00", endTime: "00:00", intervalMinutes: 60, compactHourRows: true },
      hoursRows: 12,
      sidebar: [
        ["todo-checklist", 9, steps("Prayers", ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha", "Taraweeh"])],
        ["column-table", 8, table("Suhoor & Iftar", ["Meal", "What"], [1, 1.8])],
        ["dhikr-counter", 6],
        ["labeled-box", 13, box("Dua Today")],
      ],
      below: [
        at("prompted-lines", 6, 13, 18, 12, prompts("Today's Reading", ["Juz or surah", "What stayed with me"], 2, { promptLines: [1, 4] })),
        at("labeled-box", 6, 25, 18, 11, box("Reflection")),
      ],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ Lent
  // Forty days of prayer, fasting and almsgiving, the promises made on Ash
  // Wednesday and Holy Week at the front; a week with the three marked each
  // day, the Sunday homily and the examen. To be read by a Catholic reader
  // before promotion.
  {
    key: "pages-lent",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: false,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 15, prompts("My Lenten Promises", ["Prayer: how I'll pray", "Fasting: what I'll give up", "Almsgiving: what I'll give"])),
          at("progress-meter", 0, 15, 24, 7, { heading: "Forty Days", total: 40, milestoneEvery: 10, numbers: "milestones" }),
          at("prompted-lines", 0, 22, 24, 14, prompts("Holy Week", ["Palm Sunday", "Holy Thursday", "Good Friday", "Holy Saturday", "Easter Sunday"], 1)),
        ],
        [
          at("prayer-list", 0, 0, 12, 18, { heading: "Praying For" }),
          at("labeled-box", 12, 0, 12, 18, box("Scripture to Carry")),
          at("prompted-lines", 0, 18, 24, 18, prompts("At Easter", ["What changed in me", "What I'll keep"], 4)),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-lent",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: false,
      sidebar: [
        ["prompted-lines", 10, prompts("This Week", ["Sunday's readings", "One word to carry"])],
        ["prayer-list", 12, { heading: "Praying For" }],
        ["labeled-box", 11, box("Grace I Noticed")],
      ],
      belowLeft: [
        at("habit-tracker", 6, BELOW_ROW, 18, 7, { heading: "Prayer, Fasting, Giving", habits: ["Prayed", "Fasted", "Gave"] }),
        at("labeled-box", 6, 28, 18, 8, box("Sunday's Homily")),
      ],
      belowRight: [at("examen", 0, BELOW_ROW, 24, 15)],
    },
    ...UNWRITTEN,
  },

  // ======================================================== HEALTH
  // ------------------------------------------------ perimenopause
  // The report's "doctor visit prep sheets": symptoms by the day across the
  // month, cycles kept at the front, triggers and what helps, and the
  // questions written down before the appointment.
  {
    key: "pages-perimenopause",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("column-table", 0, 0, 24, 12, table("Medicines & Supplements", ["Name", "Dose", "When", "Started"], [2, 1, 1.2, 1])),
          at("column-table", 0, 12, 24, 10, table("Care Team", ["Who", "Role", "Phone"], [1.6, 1.4, 1.4])),
          at("prompted-lines", 0, 22, 24, 14, prompts("Questions for My Doctor", ["What I've noticed", "What I want to ask", "What I'd like to try"])),
        ],
        [
          at("column-table", 0, 0, 12, 36, table("Cycles", ["Started", "Days", "Notes"], [1, 0.6, 2])),
          at("labeled-box", 12, 0, 12, 18, box("What Helps")),
          at("labeled-box", 12, 18, 12, 18, box("Triggers I've Noticed")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-perimenopause",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "lined",
      sidebar: [
        ["labeled-box", 12, box("Patterns")],
        ["labeled-box", 11, box("Wins")],
        ["labeled-box", 11, box("For My Doctor")],
      ],
      // The month's summary for the doctor; the days themselves are noted in
      // the calendar's lines (a 31-day grid needs 33 rows, the zone has 19).
      belowLeft: [at("column-table", 6, 17, 18, 19, table("Symptoms This Month", ["Symptom", "How often", "How bad", "Notes"], [1.6, 1, 1, 2]))],
      belowRight: [at("mood-chart-month", 0, 17, 24, 9), at("monthly-review", 0, 26, 24, 10)],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-perimenopause",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["weekly-priorities", 7],
        ["labeled-box", 12, box("Triggers")],
        ["labeled-box", 14, box("What Helped")],
      ],
      belowLeft: [at("symptom-severity", 6, BELOW_ROW, 18, 15, { items: ["Hot flashes", "Night sweats", "Sleep", "Mood", "Brain fog", "Aches"] })],
      belowRight: [
        at("sleep-log", 0, BELOW_ROW, 12, 15),
        at("prompted-lines", 12, BELOW_ROW, 12, 15, prompts("Doctor Prep", ["Questions to ask", "Refills needed"], 3)),
      ],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ low-FODMAP diary
  // For an elimination diet done with a dietitian: the reintroduction tested
  // a group at a time over three days, safe and trigger foods kept; a week
  // of meals planned and what was eaten beside how it felt.
  {
    key: "pages-low-fodmap",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("column-table", 0, 0, 24, 20, table("Reintroduction", ["Group", "Test food", "Day 1", "Day 2", "Day 3", "How I felt"], [1.2, 1.4, 0.7, 0.7, 0.7, 1.6])),
          at("labeled-box", 0, 20, 12, 16, box("Safe Foods")),
          at("labeled-box", 12, 20, 12, 16, box("Trigger Foods")),
        ],
        [
          at("column-table", 0, 0, 24, 10, table("Care Team", ["Who", "Role", "Phone"], [1.6, 1.4, 1.4])),
          at("prompted-lines", 0, 10, 24, 12, prompts("For My Dietitian", ["What I've noticed", "Questions"], 3)),
          at("recipes-to-try", 0, 22, 12, 14),
          at("grocery-list", 12, 22, 12, 14, { heading: "Staples That Suit Me" }),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-low-fodmap",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["grocery-list", 12],
        ["labeled-box", 10, box("Triggers Noticed")],
        ["labeled-box", 11, box("Wins")],
      ],
      belowLeft: [at("meal-planner", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("column-table", 0, BELOW_ROW, 24, 15, table("Food & Symptoms", ["Day", "Ate", "Symptoms", "How bad, 0 to 3"], [0.7, 2.4, 2, 1]))],
    },
    ...UNWRITTEN,
  },

  // ======================================================== MONEY
  // ------------------------------------------------ financial independence
  // The number, how it was worked out and why it matters; accounts, net
  // worth and the savings rate by month; a month's budget, what came in,
  // went out and was saved. Your own sums: no formula printed for you.
  {
    key: "pages-fire",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 13, prompts("My Number", ["What a year of my life costs", "My number, and how I worked it out", "Why I want it"])),
          at("savings-goal", 0, 13, 24, 6, { heading: "Toward My Number", startLabel: "0%", endLabel: "100%" }),
          at("column-table", 0, 19, 24, 17, table("Accounts", ["Account", "Kind", "Balance", "In each month"], [2, 1.2, 1.1, 1.2])),
        ],
        [
          at("column-table", 0, 0, 24, 20, table("Net Worth by Month", ["Month", "Assets", "Debts", "Net worth"], [1, 1, 1, 1.1])),
          at("column-table", 0, 20, 12, 16, table("Savings Rate", ["Month", "Income", "Saved", "Rate"], [1, 1, 1, 0.8])),
          at("labeled-box", 12, 20, 12, 16, box("Rules I Keep")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-fire",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "none",
      sidebar: [
        ["labeled-box", 12, box("Big Expenses Ahead")],
        ["labeled-box", 11, box("Wins")],
        ["labeled-box", 11, box("Ideas to Save or Earn")],
      ],
      belowLeft: [at("budget", 6, 17, 18, 19)],
      belowRight: [
        at("column-table", 0, 17, 24, 9, table("This Month", ["Income", "Spent", "Saved", "Rate"], [1, 1, 1, 1])),
        at("subscription-audit", 0, 26, 12, 10),
        at("monthly-review", 12, 26, 12, 10),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== HOBBIES & HOME
  // ------------------------------------------------ garden
  // A season in the garden: frost dates and the bed layout on a grid, what
  // to sow indoors and plant out when, seeds on hand, harvest totals and
  // next year; the month's sowing and harvest log; the week's jobs, with
  // watering under all seven days.
  {
    key: "pages-garden",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 12, 10, prompts("My Garden", ["Zone", "Last frost", "First frost"], 1)),
          at("labeled-box", 0, 10, 12, 8, box("Wish List")),
          at("sketch-box", 12, 0, 12, 18, { heading: "Bed Layout" }),
          at("column-table", 0, 18, 24, 18, table("What I'm Growing", ["Crop", "Sow indoors", "Plant out", "Harvest"], [1.6, 1, 1, 1])),
        ],
        [
          at("column-table", 0, 0, 24, 14, table("Seeds I Have", ["Seed", "Variety", "Year", "How many"], [1.4, 1.6, 0.7, 0.9])),
          at("column-table", 0, 14, 12, 22, table("Harvest Totals", ["Crop", "Amount", "Notes"], [1.2, 0.9, 1.4])),
          at("labeled-box", 12, 14, 12, 22, box("Next Year")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-garden",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "lined",
      sidebar: [
        ["todo-checklist", 12, { heading: "Sow & Plant", dayCount: 1 }],
        ["labeled-box", 11, box("Pests & Problems")],
        ["labeled-box", 11, box("Wins")],
      ],
      belowLeft: [at("column-table", 6, 17, 18, 19, table("Harvest Log", ["Date", "Crop", "Amount"], [0.9, 2, 1.2]))],
      belowRight: [at("labeled-box", 0, 17, 12, 19, box("Garden Notes", "dotted")), at("monthly-review", 12, 17, 12, 19)],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-garden",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["weekly-priorities", 7, { heading: "This Week in the Garden" }],
        ["labeled-box", 13, box("Harvested")],
        ["labeled-box", 13, box("Noticed")],
      ],
      belowLeft: [at("todo-checklist", 6, BELOW_ROW, 18, 14, { heading: "Garden Jobs", dayCount: 3 }), at("water-plants", 6, LAST, 18, 1)],
      belowRight: [at("todo-checklist", 0, BELOW_ROW, 24, 14, { heading: "Garden Jobs", dayCount: 4 }), at("water-plants", 0, LAST, 24, 1)],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ travel
  // A trip or a month somewhere: itinerary, budget, packing, bookings and the
  // list before leaving at the front; a slow-travel month of where you live,
  // places to work, spending and days left on the stay; a day page that is
  // the trip diary.
  {
    key: "pages-travel",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [at("trip-itinerary", 0, 0, 24, 20), at("travel-budget", 0, 20, 12, 16), at("packing-list", 12, 20, 12, 16)],
        [
          at("column-table", 0, 0, 24, 12, table("Bookings", ["What", "Confirmation", "Date"], [2, 1.6, 0.9])),
          at("todo-checklist", 0, 12, 12, 12, steps("Before I Go", ["Passport and visa", "Travel insurance", "Tell the bank", "Phone plan", "Copies of documents", "Home sorted"])),
          at("places-been", 12, 12, 12, 12, { heading: "Want to Go" }),
          at("labeled-box", 0, 24, 24, 12, box("Emergency Contacts")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-travel",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "lined",
      sidebar: [
        ["prompted-lines", 9, prompts("This Month", ["Where I'm living", "My stay ends"], 1)],
        ["labeled-box", 13, box("Cafes & Places to Work")],
        ["labeled-box", 12, box("Locals' Tips")],
      ],
      belowLeft: [at("spending-log", 6, 17, 18, 19)],
      belowRight: [
        at("progress-meter", 0, 17, 24, 6, { heading: "Days Here", total: 90, milestoneEvery: 30, numbers: "milestones" }),
        at("todo-checklist", 0, 23, 12, 13, { heading: "Want to See", dayCount: 1 }),
        at("trip-journal", 12, 23, 12, 13, { heading: "The Month", prompts: ["Best moment", "Worth remembering"] }),
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "day-travel",
    layout: {
      kind: "day",
      font: "sans",
      weekStartsMonday: true,
      firstDay: 0,
      hours: { startTime: "07:00", endTime: "23:00", intervalMinutes: 60, compactHourRows: true },
      hoursRows: 10,
      sidebar: [
        ["trip-journal", 14],
        ["column-table", 10, table("Spent", ["What", "Cost"], [1.6, 0.9])],
        ["labeled-box", 12, box("Eat Here")],
      ],
      below: [at("labeled-box", 6, 11, 18, 13, box("Today")), at("sketch-box", 6, 24, 18, 12, { heading: "Tickets & Sketches" })],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ game master
  // A tabletop campaign: premise, tone and the table's lines and veils,
  // player characters, factions, NPCs and places at the front; a week of
  // session prep (a strong start, scenes, secrets and clues), a map on a
  // grid and what happened after. No game's name is used.
  {
    key: "pages-game-master",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 12, prompts("The Campaign", ["Premise", "Tone", "Lines and veils"])),
          at("column-table", 0, 12, 24, 12, table("Player Characters", ["Player", "Character", "Wants", "Hooks"], [1.1, 1.3, 1.6, 1.8])),
          at("column-table", 0, 24, 24, 12, table("Factions", ["Faction", "Wants", "Attitude"], [1.4, 2.2, 1.2])),
        ],
        [
          at("column-table", 0, 0, 24, 20, table("NPCs", ["Name", "Where", "Wants", "Secret"], [1.2, 1.1, 1.6, 1.8])),
          at("column-table", 0, 20, 12, 16, table("Places", ["Place", "What's there", "Visited"], [1.2, 1.8, 0.8])),
          at("labeled-box", 12, 20, 12, 16, box("Plot Threads")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-game-master",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: true,
      hours: OFF,
      sidebar: [
        ["prompted-lines", 15, prompts("Session Prep", ["Strong start", "Scenes", "Secrets and clues"])],
        ["labeled-box", 9, box("NPCs to Bring In")],
        ["labeled-box", 9, box("Loot")],
      ],
      belowLeft: [at("sketch-box", 6, BELOW_ROW, 18, 15, { heading: "Map" })],
      belowRight: [
        at("labeled-box", 0, BELOW_ROW, 12, 15, box("Session Notes")),
        at("prompted-lines", 12, BELOW_ROW, 12, 15, prompts("After the Session", ["What the players did", "Threads to pick up", "Next time"])),
      ],
    },
    ...UNWRITTEN,
  },
];
