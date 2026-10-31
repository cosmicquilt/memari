// THE LAYOUTS GALLERY'S CONTENTS (memari.studio/layouts, 2026-10-08): weeks,
// months, days and pages of modules to start from, made by us so that the
// first people to use Memari have something to begin with rather than an
// empty page.
//
// Every one is a spread the landing page's journal turns through
// (heroSpreads.ts), so what is seen there is what you get - shown WITHOUT
// the people: no name, nothing written in. "Use this" makes the layout,
// empty (planner/archetypeWeek.ts), so that is what the gallery shows.
// Andrew, the same day: "you only did weeks and not other sample layouts
// like months or full modules, didnt even vary or turn off increments" -
// the first version offered only the people's weeks, because only those
// could be made then. Now every kind can.
//
// Each `line` is checked against the spread's own modules and hours in
// heroSpreads.ts / heroExtras.ts / archetypes.ts. Change one there, change
// its line here.
//
// Never a count of how many people used one, and never a maker's name,
// until there are real ones (Andrew, 2026-10-08: "Popular, no credit").
// GALLERY_LABEL is the one word over them; the research he commissioned the
// same day recommends one that says we made them ("Starter layouts"), which
// is his to choose.

import { HERO_BY_KEY } from "./heroSpreads";
import { spreadPlacements } from "./spreads";
import { PALETTE_INFO_BY_SLUG } from "@/lib/paletteGroups";
import { describeModule } from "@/lib/moduleDescriptions";
import { moduleSchemaDefaults } from "@/lib/moduleRegistry";
import { GLYPH_LABELS, type GlyphShape } from "@/lib/modules/glyphs";
import { progressMeterNumbers } from "@/lib/modules/progressMeter";
import { PLANNER_BY_KEY, PLANNER_OF_SPREAD } from "./plannerTemplates";

export const GALLERY_LABEL = "Popular";

export type StarterKind = "week" | "month" | "day" | "pages";

export type Starter = {
  /** The spread's key: heroSpreads', and /app/from/<key>'s. */
  key: string;
  kind: StarterKind;
  title: string;
  /** What is on it, in a sentence. */
  line: string;
  /** How its hours are set, where they differ from the template's. */
  hours?: string;
  /** The prebuilt planner it was made for (plannerTemplates.ts): listed
   *  there rather than among the weeks and months, still usable alone. */
  planner?: string;
};

const W = (key: string, title: string, line: string, hours?: string): Starter => ({ key, kind: "week", title, line, hours });

/** In the order shown, broadest first. Faith and recovery are left out while
 *  they are held for a read-through (archetypes.ts, `held`). */
const ALL: Starter[] = [
  W("student", "Student", "Every assignment with its class and due date, what's coming up, a bedtime chart, a done list for the week, and focus blocks to colour in."),
  W("nine-to-five", "9 to 5", "An Eisenhower matrix to sort the week, to-do lists under the first three days, what you are waiting on, notes for your one to one, the weekend and next week."),
  W("classic", "Classic", "Half-hour rows from 5:30 in the morning to 11:30 at night, a notes box and a to-do list. The plainest week, to build your own on."),
  W("rapid-log", "Rapid log", "No hours: dotted days to list tasks, events and notes as they come, with priorities, a mood chart, habits and a done list.", "Increments off, dotted"),
  W("focus", "Deep work", "Three things for the week, a brain dump, what you're waiting on, a to-do list, an Eisenhower matrix and the week's wins.", "By the hour, 6:00 to 24:00"),
  W("nurse", "Shift work", "Built round shifts: a sleep plan and a sleep log, a shift bag checklist, rest days marked, meals ticked off, water counted, and a self-care check."),
  W("teacher", "Teacher", "Each class's lessons from Monday to Friday, and the grading pile by class with the day each goes back."),
  W("parent", "Parent", "Meals planned by the day, the grocery list, chores shared out, something for you, a to-do list, and the things the kids said."),
  W("home", "Home", "Short hours leave room for meals, groceries, a cleaning rota, chores, pet care and the plants.", "By the hour in short rows, 6 AM to 10 PM"),
  W("adhd", "ADHD", "Three things for the week, a brain dump, a done list that counts what you finished, focus blocks, and a dopamine menu for when you are stuck."),
  W("maker", "Maker", "What to make and the supplies for it, orders and the day each ships, projects with their next step, what to post when, and what it all cost."),
  W("wellness", "Wellness", "Priorities, a mood tracker, a gratitude list, habits, self-care, meals and what helped."),
  W("fitness", "Running", "Runs and lifts logged, the week's training plan, lifts from last week to next, how your body feels, notes for next week, stretches, and energy and bedtime beside them."),
  W("training", "Training and recovery", "The week's plan, workouts and runs logged, stretches, an energy and pain scale and a sleep log."),
  W("money", "Money", "Money goals, groceries, bills this week, every purchase, a budget, a coin a day for no-spend days, what you saved and paid off, and money wins."),
  W("philosophy", "Stoic", "A Stoic week ahead and week review, a theme for the week, the dichotomy of control, Franklin's thirteen virtues and a commonplace book."),
  W("chronic-illness", "Chronic illness", "Spoons to spend, energy and pain for the week on one scale, symptoms by day, questions for the doctor, and every dose ticked off."),
  W("lisbon", "Travel", "Blank days for wherever the day goes, with highlights, what to eat and see, an itinerary, spending and a sketch box.", "Increments off, blank"),
  W("creative", "Creative", "A weekly affirmation, what you made, writing prompts, a sketch box and a to-do list."),
  { key: "month-family", kind: "month", title: "Family month", line: "Lined days for the family calendar, with birthdays, a chore chart, rainy day ideas, gifts to buy, school and activities with what's due, and the things the kids said." },
  { key: "month-money", kind: "month", title: "Money month", line: "Money goals, bills due, a no-spend calendar, a budget, income, a subscription audit, and bars for savings and debt." },
  { key: "month-student", kind: "month", title: "Student month", line: "Dotted days, goals, assignments with their due dates, grades, a mood chart for the month and lessons learned." },
  { key: "day-adhd", kind: "day", title: "ADHD day", line: "A page a day: the hours beside three things for today, a brain dump, a done list, focus blocks, a to-do list and tomorrow.", hours: "Half hours, 7 AM to 10 PM" },
  { key: "day-stoic", kind: "day", title: "Stoic day", line: "A page a day: the hours beside the morning and evening Stoic pages, the dichotomy of control, the big three and a commonplace book.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-trip", kind: "pages", title: "Trip pages", line: "Two pages for a trip: an itinerary, a packing list, a budget, what to see, bookings, where you ate, a trip journal and a sketch box." },
  { key: "pages-reading", kind: "pages", title: "Reading pages", line: "Books read, a reading goal, books you didn't finish, passages kept, a watchlist and what to read next." },
  { key: "pages-kitchen", kind: "pages", title: "Kitchen pages", line: "Go-to meals, staples, recipes to try, batch cooking ideas, a recipe card, the pantry and the freezer." },
  // The prebuilt planners' parts (plannerSpreads.ts).
  { key: "pages-irregular-income", kind: "pages", planner: "irregular-income", title: "Irregular income pages", line: "A baseline month, a rule for when there's extra and one for a slow month, sinking funds, irregular bills ninety days ahead, subscriptions, tax set aside by the quarter, and bars for the buffer and debt." },
  { key: "month-irregular-income", kind: "month", planner: "irregular-income", title: "Irregular income month", line: "Lined days for paydays and bills, the month against your baseline, what came in by week, what you're owed, the bills by half month, what to set aside, the buffer, and a month review." },
  { key: "pages-adhd", kind: "pages", planner: "adhd", title: "ADHD pages", line: "A dopamine menu, what to do when you're stuck, someday and maybe, things not to forget, a dotted brain dump and your projects." },
  { key: "month-adhd", kind: "month", planner: "adhd", title: "ADHD month", line: "Dotted days, stars that add up for each week, a brain dump, your projects, what helped, wins and what you dropped." },
  { key: "day-adhd-dots", kind: "day", planner: "adhd", title: "ADHD day", line: "A page a day: three things, what you actually got done and tomorrow down the side, the day as open dots, focus blocks and a short list.", hours: "Increments off, dotted" },
  { key: "week-irregular-income", kind: "week", planner: "irregular-income", title: "Irregular income week", line: "What is safe to spend, worked out, bills due, groceries, every purchase, what came in, and the week ahead." },
  // The library's planners (2026-10-21, plannerLibrary.ts).
  { key: "pages-time-block", kind: "pages", planner: "time-block", title: "Time-block pages", line: "The quarter's deep work projects, what you're saying no to, shallow work to batch, rules for your week, a time audit and a shutdown ritual." },
  { key: "week-time-block", kind: "week", planner: "time-block", title: "Time-block week", line: "By the hour from 6 AM to 10 PM to block out, a weekly plan with a shallow work budget, three priorities, a done list, shallow work under each day and deep work blocks to colour in.", hours: "By the hour, 6 AM to 10 PM" },
  { key: "day-time-block", kind: "day", planner: "time-block", title: "Time-block day", line: "A page a day: half hours to block out beside the big three, shallow work, a shutdown checklist and where you left off, a done list and somewhere for interruptions.", hours: "Half hours, 6 AM to 10 PM" },
  { key: "pages-next-actions", kind: "pages", planner: "next-actions", title: "Next actions pages", line: "All your projects with their next action, someday and maybe, what you're waiting on, your horizons from purpose to goals, checklists and reference." },
  { key: "month-next-actions", kind: "month", planner: "next-actions", title: "Next actions month", line: "Areas to look at, projects finished, someday looked at again, a project tracker, a monthly review and what you're waiting on." },
  { key: "week-next-actions", kind: "week", planner: "next-actions", title: "Next actions week", line: "An inbox to capture into, next actions by where you can do them (calls, errands, computer, home) and the weekly review." },
  { key: "pages-twelve-week", kind: "pages", planner: "twelve-week", title: "Twelve-week pages", line: "A vision, three goals, twelve weeks to tick off, the weekly actions for each goal, a score for every week, a check at week six and the reward at the end." },
  { key: "week-twelve-week", kind: "week", planner: "twelve-week", title: "Twelve-week week", line: "This week's actions for each goal, a done list, other tasks under each day, actions ticked off and the week's score." },
  { key: "pages-habits", kind: "pages", planner: "habits", title: "Habit pages", line: "What matters to you, who you're becoming, each habit's why and two-minute version, habit stacking, cues and rewards, thirty times on any days, the habits you're breaking and a plan for the day you miss." },
  { key: "month-habits", kind: "month", planner: "habits", title: "Habit month", line: "Two-minute versions, habits counted by the week, not as streaks, what helped, wins, a monthly review and what to try next." },
  { key: "week-habits", kind: "week", planner: "habits", title: "Habit week", line: "A Sunday reset with a plan for a missed day, three priorities, a done list, five habits with a weekly total and a reflection." },
  { key: "pages-reading-journal", kind: "pages", planner: "reading-journal", title: "Reading journal pages", line: "Books read, a reading goal, a to-be-read list with who recommended each, a didn't-finish list and two full book reviews." },
  { key: "month-reading-journal", kind: "month", planner: "reading-journal", title: "Reading journal month", line: "What you're reading and what's next, a line you loved, a book review, book club notes and the month's wrap-up." },
  { key: "pages-training-block", kind: "pages", planner: "training-block", title: "Training block pages", line: "The goal, paces and zones, the plan week by week with deload weeks marked, personal bests, gear, stretches, niggles, a race-day checklist and your starting measurements." },
  { key: "month-training-block", kind: "month", planner: "training-block", title: "Training block month", line: "The month's focus, results, wins, progressive overload, weekly volume, measurements and a monthly review." },
  { key: "week-training-block", kind: "week", planner: "training-block", title: "Training block week", line: "The week's sessions, an energy chart, whether it's a build or deload week and its key session, how your body feels, a run log, strength with effort rated (RPE), rest days and sleep." },
  { key: "pages-stoic-practice", kind: "pages", planner: "stoic-practice", title: "Stoic practice pages", line: "The four virtues, what is and isn't in your control, memento mori, negative visualisation, a commonplace book, weekly themes, the view from above and your own rules for living." },
  { key: "week-stoic-practice", kind: "week", planner: "stoic-practice", title: "Stoic practice week", line: "The week's theme and how you'll practise it, three priorities, a commonplace book, negative visualisation, where you fell short, the week reviewed and what's in your control." },
  { key: "day-stoic-practice", kind: "day", planner: "stoic-practice", title: "Stoic practice day", line: "A page a day: the morning page, the big three and what's in your control beside the hours, an evening review and the commonplace book.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-mindful", kind: "pages", planner: "mindful", title: "Mindful practice pages", line: "Intentions, a practice plan, commitments, loving-kindness, wu wei, a passage read slowly, questions to sit with and what you noticed." },
  { key: "month-mindful", kind: "month", planner: "mindful", title: "Mindful practice month", line: "The month's intention, what you noticed, gratitude, sittings counted, a mood chart, a reflection and what was let go." },
  { key: "day-mindful", kind: "day", planner: "mindful", title: "Mindful practice day", line: "An open, dotted day with loving-kindness, three good things, the day's passage, noticing, a rating of calm, kindness and presence, and the evening.", hours: "Increments off, dotted" },
  { key: "pages-bible-study", kind: "pages", planner: "bible-study", title: "Bible study pages", line: "Each book of the Bible as you finish it, a reading plan by week, prayer requests with the answers, verses to memorise and questions to study." },
  { key: "month-bible-study", kind: "month", planner: "bible-study", title: "Bible study month", line: "The month's theme, serving and giving, answered prayers, the month in scripture, the small group, a row a meeting, and a monthly review." },
  { key: "week-bible-study", kind: "week", planner: "bible-study", title: "Bible study week", line: "A prayer list, a memory verse, three good things, sermon notes, a SOAP study and verse mapping, and each day's reading ticked off." },
  { key: "pages-one-day", kind: "pages", planner: "one-day", title: "One day at a time pages", line: "Your reasons, people you can call, what to do when a craving comes, days kept, a meeting log, support contacts, and triggers and warning signs." },
  { key: "month-one-day", kind: "month", planner: "one-day", title: "One day at a time month", line: "The month, gratitude, milestones, days counted up and never reset, a mood chart, a meeting log and a monthly review." },
  { key: "day-one-day", kind: "day", planner: "one-day", title: "One day at a time day", line: "A page a day: just for today, a HALT check, gratitude and craving notes beside the hours, cravings rated through the day and an evening inventory.", hours: "Half hours, 7 AM to 10 PM" },
  { key: "pages-semester", kind: "pages", planner: "semester", title: "Semester pages", line: "Every syllabus deadline with its weight and score, your classes, who to email and a classmate to ask, exam dates, semester goals and a big assignment broken into steps." },
  { key: "month-semester", kind: "month", planner: "semester", title: "Semester month", line: "A grade check, what to study for, wins, an assignment tracker, two big assignments broken into steps, a monthly review and next month." },
  { key: "week-semester", kind: "week", planner: "semester", title: "Semester week", line: "Three priorities, a brain dump, questions for class, a done list, an assignment tracker, a to-do list under each day, meds, water, meals and bed ticked off every day, and focus blocks to colour in." },
  { key: "pages-teacher-year", kind: "pages", planner: "teacher-year", title: "Teacher's year pages", line: "Your classes by period and room, where the sub plans are, the twelve months ahead, month by month, and contacts." },
  { key: "month-teacher-year", kind: "month", planner: "teacher-year", title: "Teacher's year month", line: "What to prepare, units this month, next month, a parent contact log, a grading tracker and a monthly review." },
  { key: "week-teacher-year", kind: "week", planner: "teacher-year", title: "Teacher's year week", line: "Half hours from 6:30 to 6:30, three priorities, copies and prep, students to check on, lessons by class and day, make-up work, grading, parent contacts and next week.", hours: "Half hours, 6:30 AM to 6:30 PM" },
  { key: "pages-small-shop", kind: "pages", planner: "small-shop", title: "Small shop pages", line: "Products with cost, price and margin, suppliers, a launch plan, a bank of content ideas, tools and fees, product ideas, a sales goal and shop policies." },
  { key: "month-small-shop", kind: "month", planner: "small-shop", title: "Small shop month", line: "Launch prep, restocks, wins, the month's sales by channel and week, costs, best sellers and a monthly review." },
  { key: "week-small-shop", kind: "week", planner: "small-shop", title: "Small shop week", line: "Three priorities, things to make, messages to reply to, an order tracker, a content plan and spending." },
  { key: "pages-night-nurse", kind: "pages", planner: "night-nurse", title: "Night nurse pages", line: "Licences and CEUs, PTO, unit numbers, a shift bag checklist, a sleep plan, overtime and pay, good shifts and go-to shift meals." },
  { key: "week-night-nurse", kind: "week", planner: "night-nurse", title: "Night nurse week", line: "Half hours from 7 PM to 7 AM, marked +1 after midnight, a sleep log, meals, a self-care check, a to-do list and water under every night, this week's sleep plan and plans for days off.", hours: "Half hours, 7 PM to 7 AM" },
  // The second shelf (2026-10-21, plannerLibrary2.ts).
  { key: "pages-rapid-log", kind: "pages", planner: "rapid-log", title: "Rapid log pages", line: "An index, your key, someday and maybe, lists you keep and a future log for the year ahead." },
  { key: "month-rapid-log", kind: "month", planner: "rapid-log", title: "Rapid log month", line: "Lined days, the month's goals, what carried over, a done list, a task list with priority and status, a review and what's coming next month." },
  { key: "day-rapid-log", kind: "day", planner: "rapid-log", title: "Rapid log day", line: "A page a day: the day as open dots for quick notes, the big three, what happened, a done list and tomorrow.", hours: "Increments off, dotted" },
  { key: "pages-quarterly-objective", kind: "pages", planner: "quarterly-objective", title: "Quarterly objective pages", line: "The objective and why, key results leading and lagging, thirteen weeks, what could get in the way, weekly check-ins and the end of the quarter." },
  { key: "week-quarterly-objective", kind: "week", planner: "quarterly-objective", title: "Quarterly objective week", line: "What moves it most, three priorities, a done list, what moves the objective under each day, how sure you are and a check-in." },
  { key: "pages-language", kind: "pages", planner: "language", title: "Language learning pages", line: "Why you're learning, milestones from A1 to C2, resources, words to keep and phrases for real life." },
  { key: "month-language", kind: "month", planner: "language", title: "Language learning month", line: "Lined days, the month's words, grammar and something to watch, wins, what you struggled with, what you watched, read and heard, conversations and a review." },
  { key: "week-language", kind: "week", planner: "language", title: "Language learning week", line: "Each day dotted for writing in your language, the week's grammar and words, phrases you needed, practice ticked off and how it went.", hours: "Increments off, dotted" },
  { key: "pages-writing", kind: "pages", planner: "writing", title: "Writing a book pages", line: "The book in a sentence, a word count bar, scenes, characters, revision passes, research and submissions." },
  { key: "month-writing", kind: "month", planner: "writing", title: "Writing a book month", line: "Lined days, chapters to work on, ideas, wins, chapters by stage, research, questions for your readers and a review." },
  { key: "week-writing", kind: "week", planner: "writing", title: "Writing a book week", line: "What to work on and what done looks like, three priorities, ideas and lines, writing sessions with words and how they felt, where you stopped and dialogue." },
  { key: "pages-life-design", kind: "pages", planner: "life-design", title: "Life design pages", line: "A wheel of life, meaning in small things, a look back and a letter to yourself a year from now." },
  { key: "month-life-design", kind: "month", planner: "life-design", title: "Life design month", line: "Dotted days, small joys, enough, what to put down, one small shift in each area, the wheel of life and a review." },
  { key: "week-life-design", kind: "week", planner: "life-design", title: "Life design week", line: "Three priorities, small joys, moments of flow, small things to do each day and where you found harmony." },
  { key: "pages-tao", kind: "pages", planner: "tao", title: "Taoist practice pages", line: "The 81 chapters to tick off, the uncarved block, translations you read, a chapter read slowly, nature noticed and what you let go of." },
  { key: "week-tao", kind: "week", planner: "tao", title: "Taoist practice week", line: "Each day as open dots, the week's chapter, nature noticed, simple things, wu wei, forcing or flowing each day and stillness.", hours: "Increments off, dotted" },
  { key: "pages-franklin", kind: "pages", planner: "franklin", title: "Franklin's virtues pages", line: "Franklin's thirteen virtues in his words, thirteen weeks, four rounds a year and his morning and evening questions." },
  { key: "week-franklin", kind: "week", planner: "franklin", title: "Franklin's virtues week", line: "This week's virtue, where you kept it well and where you slipped, Franklin's chart of the thirteen by day, and his morning and evening questions for each day." },
  { key: "pages-existential", kind: "pages", planner: "existential", title: "Existentialist pages", line: "Radical responsibility, values you choose, if this were all, projects you choose and the questions you're living with." },
  { key: "week-existential", kind: "week", planner: "existential", title: "Existentialist week", line: "A choice you're facing, three priorities, what you did on autopilot, a bad faith check and absurd moments." },
  { key: "pages-wedding", kind: "pages", planner: "wedding", title: "Wedding pages", line: "The guest list with party size, RSVP, meal, gift and thank-yous; the budget, vendors, the day and must-have photos." },
  { key: "month-wedding", kind: "month", planner: "wedding", title: "Wedding month", line: "Lined days, this month's tasks, decisions, ideas, payments due, done this month, questions for vendors and things to buy." },
  { key: "week-wedding", kind: "week", planner: "wedding", title: "Wedding week", line: "Three priorities, who you're waiting to hear from, ideas, a to-do list under each day, calls to make and time for the two of you." },
  { key: "pages-new-baby", kind: "pages", planner: "new-baby", title: "New baby pages", line: "Who to call, help offered, growth, when you arrived, checkups and shots, gifts and thank-yous, and things to remember." },
  { key: "week-new-baby", kind: "week", planner: "new-baby", title: "New baby week", line: "Just three things, firsts, questions to ask the doctor, this week with your baby, looking after yourself and help you can ask for." },
  { key: "day-new-baby", kind: "day", planner: "new-baby", title: "New baby day", line: "A page a day: open dots for the day, sleep, changes, medicines, every feed, how you are and today with your baby.", hours: "Increments off, dotted" },
  { key: "pages-caregiver", kind: "pages", planner: "caregiver", title: "Caregiver pages", line: "About them, a normal day for them, the care team, medicines, help you can ask for, when you need a break and where the papers are." },
  { key: "month-caregiver", kind: "month", planner: "caregiver", title: "Caregiver month", line: "Lined days, how they were, changes to mention, room for you, bills and claims, refills and a review." },
  { key: "week-caregiver", kind: "week", planner: "caregiver", title: "Caregiver week", line: "Three priorities, questions to ask the doctor, room for you, a to-do list under each day, medicines by day and what to watch for." },
  { key: "pages-grief", kind: "pages", planner: "grief", title: "Grief pages", line: "Remembering them, people you can call, dates that may be hard, things to sort and letters to them." },
  { key: "week-grief", kind: "week", planner: "grief", title: "Grief week", line: "Only what matters, a memory, people who helped, open lines for the week, how you were and small things that helped." },
  { key: "pages-homeschool", kind: "pages", planner: "homeschool", title: "Homeschool pages", line: "Subjects and curriculum, the twelve months ahead, month by month, field trips and ideas to try." },
  { key: "month-homeschool", kind: "month", planner: "homeschool", title: "Homeschool month", line: "Lined days, themes and units, books to borrow, progress notes, hours by subject, work samples and a review." },
  { key: "week-homeschool", kind: "week", planner: "homeschool", title: "Homeschool week", line: "Half hours from 8 to 3, three priorities, supplies, what the kids said, a list under each day, hours by subject, books read together and what they loved.", hours: "Half hours, 8 AM to 3 PM" },
  { key: "pages-perimenopause", kind: "pages", planner: "perimenopause", title: "Perimenopause pages", line: "Medicines and supplements, the care team, questions for your doctor, cycles, when symptoms started, what helps and triggers." },
  { key: "month-perimenopause", kind: "month", planner: "perimenopause", title: "Perimenopause month", line: "Lined days, patterns, wins, the doctor and refills, a symptom summary, a mood chart, days of bleeding and a review." },
  { key: "week-perimenopause", kind: "week", planner: "perimenopause", title: "Perimenopause week", line: "Three priorities, triggers, what helped, symptoms rated 0 to 3 each day, sleep and what changed." },
  { key: "pages-low-fodmap", kind: "pages", planner: "low-fodmap", title: "Low-FODMAP pages", line: "Reintroduction by group over three days, safe and trigger foods, the care team, notes for your dietitian, recipes and staples." },
  { key: "week-low-fodmap", kind: "week", planner: "low-fodmap", title: "Low-FODMAP week", line: "Groceries, triggers noticed, the phase and food being tested, and what you ate and how you felt, with times, day by day." },
  { key: "pages-fire", kind: "pages", planner: "fire", title: "Financial independence pages", line: "Your number and how you worked it out, a bar toward it, accounts, net worth by month and savings rate." },
  { key: "month-fire", kind: "month", planner: "fire", title: "Financial independence month", line: "Big expenses ahead, wins, ideas to save or earn, a budget, account balances, renewals due and a review." },
  { key: "pages-garden", kind: "pages", planner: "garden", title: "Garden pages", line: "Your zone and frost dates, a wish list, the bed layout on a grid, what you're growing, seeds on hand, harvest totals and next year." },
  { key: "month-garden", kind: "month", planner: "garden", title: "Garden month", line: "Lined days, what to sow and plant, pests and problems, wins, a harvest log, garden notes and a review." },
  { key: "week-garden", kind: "week", planner: "garden", title: "Garden week", line: "This week in the garden, the weather, what you noticed, garden jobs under each day and watering under all seven." },
  { key: "pages-travel", kind: "pages", planner: "travel", title: "Travel pages", line: "Itinerary, trip budget, packing, bookings, before you go, places you want to go, emergency contacts and days on your visa." },
  { key: "month-travel", kind: "month", planner: "travel", title: "Slow travel month", line: "Lined days, where you're living and when the stay ends, places to work, locals' tips, spending, things to see and the month." },
  { key: "day-travel", kind: "day", planner: "travel", title: "Travel day", line: "A page a day: by the hour, where you went and the best moment, a diary, what you spent, where to eat, and room for tickets and sketches.", hours: "By the hour in short rows, 7 AM to 11 PM" },
  { key: "pages-game-master", kind: "pages", planner: "game-master", title: "Campaign pages", line: "The campaign's premise, tone and lines and veils, player characters, factions, NPCs and places." },
  { key: "week-game-master", kind: "week", planner: "game-master", title: "Session prep week", line: "Each day as open dots, session prep, NPCs to bring in, loot, a map on a grid, secrets and clues, and after the session.", hours: "Increments off, dotted" },
  { key: "pages-ramadan", kind: "pages", planner: "ramadan", title: "Ramadan pages", line: "Thirty days of the fast, night prayer, Quran, sadaqah and dhikr, the juz read, intentions and the last ten nights, duas, what to do before Eid, fasts to make up and what to keep after." },
  { key: "day-ramadan", kind: "day", planner: "ramadan", title: "Ramadan day", line: "A page a day from 4 AM to midnight: the prayers, suhoor and iftar, dhikr, the day's dua, today's reading and a reflection.", hours: "By the hour in short rows, 4 AM to midnight" },
  { key: "pages-lent", kind: "pages", planner: "lent", title: "Lent pages", line: "Your Lenten promises, forty days, Holy Week, who you're praying for, scripture to carry and Easter." },
  { key: "week-lent", kind: "week", planner: "lent", title: "Lent week", line: "Sunday's readings, who you're praying for, grace noticed, prayer, fasting and giving each day, the homily and the examen." },
  { key: "pages-glp1", kind: "pages", planner: "glp1", title: "GLP-1 pages", line: "Your starting point, dose and why, injection sites, protein foods you like, your daily targets, dose changes, questions for your doctor, what helps on hard days and foods that don't sit well." },
  { key: "month-glp1", kind: "month", planner: "glp1", title: "GLP-1 month", line: "Non-scale victories, questions for your doctor and refills beside the month, then measurements, a mood chart, labs and results, a monthly review and meals that worked." },
  { key: "week-glp1", kind: "week", planner: "glp1", title: "GLP-1 week", line: "Side effects scored 0 to 3, high-protein groceries, the week's dose and site, and meals, protein, water and fibre under every day." },
  { key: "pages-flare-log", kind: "pages", planner: "flare-log", title: "Flare log pages", line: "Your care team, medicines, a flare plan, questions for appointments, a record of flares, and conditions and allergies." },
  { key: "month-flare-log", kind: "month", planner: "flare-log", title: "Flare log month", line: "Good days, hard days, questions to ask, a mood chart, flare days marked, the month's patterns, a monthly review and medicine changes." },
  { key: "day-flare-log", kind: "day", planner: "flare-log", title: "Flare log day", line: "A page a day: symptom severity, what helped, a food diary and what made it worse beside the hours, then spoons, energy, pain, mood and sleep from 0 to 10, and every dose taken or skipped.", hours: "Half hours, 7 AM to 10 PM" },
  { key: "pages-challenge-5k-90", kind: "pages", planner: "challenge-5k-90", title: "5K pages, 90 days", line: "Thirteen weeks' plan to tick off, why, where you start and finish, before you start, days done, runs that stood out and race day." },
  { key: "week-challenge-5k-90", kind: "week", planner: "challenge-5k-90", title: "5K week", line: "The week's session, run, walk and stretch ticked each day, energy, how your body feels, runs, stretches, rest days and sleep." },
  { key: "pages-challenge-start-running", kind: "pages", planner: "challenge-start-running", title: "Start running pages", line: "The thirty days' plan to tick off, days done, why, where you start and finish, before you start and what you'll do next." },
  { key: "day-challenge-start-running", kind: "day", planner: "challenge-start-running", title: "Start running day", line: "A page a day: the hours beside three things for today, that day's run, walk or rest and how it went, today's run, how your body feels and tomorrow.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-challenge-walking-30", kind: "pages", planner: "challenge-walking-30", title: "Walking pages, 30 days", line: "The thirty days' plan to tick off, days done, why, where you start and finish, before you start and routes you like." },
  { key: "day-challenge-walking", kind: "day", planner: "challenge-walking-30", title: "Walking day", line: "A page a day: the hours beside three things for today, that day's walk and how it went, minutes, steps and where, how your body feels and tomorrow.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-challenge-walking-90", kind: "pages", planner: "challenge-walking-90", title: "Walking pages, 90 days", line: "Thirteen weeks to tick off, why, where you start and finish, before you start, days done, routes you like and how you feel now." },
  { key: "week-challenge-walking", kind: "week", planner: "challenge-walking-90", title: "Walking week", line: "The week's focus, walks and stretches ticked each day, energy, how your body feels, a log of walks, stretches, rest days and sleep." },
  { key: "pages-challenge-reading-30", kind: "pages", planner: "challenge-reading-30", title: "Reading pages, 30 days", line: "The thirty days' plan to tick off, days done, why, where you start and finish, and books you finished." },
  { key: "day-challenge-reading", kind: "day", planner: "challenge-reading-30", title: "Reading day", line: "A page a day: the hours beside what to read next, words to look up and tomorrow, that day's step and what you read, books and pages, and a commonplace book.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-challenge-reading-90", kind: "pages", planner: "challenge-reading-90", title: "Reading pages, 90 days", line: "Thirteen weeks to tick off, why, where you start and finish, days done, books read and books you want to read." },
  { key: "week-challenge-reading", kind: "week", planner: "challenge-reading-90", title: "Reading week", line: "The week's focus, what to read next, words to look up, a reading log by day, a commonplace book and what stayed with you." },
  { key: "pages-challenge-no-spend-30", kind: "pages", planner: "challenge-no-spend-30", title: "No-spend pages", line: "The thirty days' plan to tick off, days done, why, where you start and finish, and your rules." },
  { key: "day-challenge-no-spend", kind: "day", planner: "challenge-no-spend-30", title: "No-spend day", line: "A page a day: the hours beside three things for today, things wanted and not bought and free things to do, that day's step, what you spent and notes.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-challenge-no-spend-90", kind: "pages", planner: "challenge-no-spend-90", title: "Money habits pages", line: "Thirteen weeks to tick off, why, where you start and finish, days done, subscriptions and your rules." },
  { key: "week-challenge-no-spend", kind: "week", planner: "challenge-no-spend-90", title: "Money habits week", line: "The week's habit, things wanted and not bought, free things to do, a spending log, no-spend days ticked and the week reviewed." },
  { key: "pages-challenge-alcohol-free", kind: "pages", planner: "challenge-alcohol-free", title: "Alcohol-free pages", line: "The thirty days' plan to tick off, dry days done, why, where you start and finish, before you start and the money not spent." },
  { key: "day-challenge-alcohol-free", kind: "day", planner: "challenge-alcohol-free", title: "Alcohol-free day", line: "A page a day: the hours beside three things for today, how you feel and tomorrow, that day's step and how it went, sleep, energy and mood, and notes.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-challenge-5k", kind: "pages", planner: "challenge-5k", title: "5K challenge pages", line: "The thirty days' plan to tick off, days done, why you're doing it, where you start and finish, before you start and a race day plan." },
  { key: "day-challenge-5k", kind: "day", planner: "challenge-5k", title: "5K challenge day", line: "A page a day: the hours beside three things for today, that day's run, walk or rest and how it went, today's run, how your body feels and tomorrow.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-challenge-half-marathon", kind: "pages", planner: "challenge-half-marathon", title: "Half marathon pages", line: "Thirteen weeks' plan to tick off, why, where you start and finish, days done, before you start, long runs and a race day checklist." },
  { key: "week-challenge-half-marathon", kind: "week", planner: "challenge-half-marathon", title: "Half marathon week", line: "The week's plan, sessions to tick each day, energy, how your body feels, runs, strength, rest days and sleep." },
  { key: "pages-challenge-organize-30", kind: "pages", planner: "challenge-organize-30", title: "Organizing challenge pages", line: "The thirty days' plan to tick off, days done, why, where you start and finish, and where things go now." },
  { key: "day-challenge-organize", kind: "day", planner: "challenge-organize-30", title: "Organizing challenge day", line: "A page a day: the hours beside three things for today, that day's job and what you cleared, keep, give or toss, and what got done.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-challenge-organize-90", kind: "pages", planner: "challenge-organize-90", title: "Organizing pages, 90 days", line: "Thirteen areas to tick off, why, where you start and finish, days done, where things go now and what to pass on." },
  { key: "week-challenge-organize", kind: "week", planner: "challenge-organize-90", title: "Organizing week", line: "The week's area, keep, give or toss, what got done, the week's jobs under each day, a daily reset and the week reviewed." },
  { key: "pages-challenge-stoic-30", kind: "pages", planner: "challenge-stoic-30", title: "Stoic challenge pages", line: "The thirty practices to tick off, days done, why, where you start and finish, and your rules for living." },
  { key: "day-challenge-stoic", kind: "day", planner: "challenge-stoic-30", title: "Stoic challenge day", line: "A page a day: the hours beside the morning page, what is in your control and your reading, that day's practice, the evening review and a commonplace book.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-challenge-stoic-90", kind: "pages", planner: "challenge-stoic-90", title: "Stoic pages, 90 days", line: "Thirteen themes to tick off, why, where you start and finish, days done, a commonplace book and your rules for living." },
  { key: "week-challenge-stoic", kind: "week", planner: "challenge-stoic-90", title: "Stoic theme week", line: "The week's theme and how you'll practise it, three priorities, a commonplace book, the hard thing rehearsed, where you fell short, the week reviewed and what's in your control." },
  { key: "pages-challenge-dao-30", kind: "pages", planner: "challenge-dao-30", title: "Tao Te Ching pages, 30 days", line: "Thirty days of chapters to tick off, days done, why you're reading it, the translation you chose, what you'll keep and the chapters that stayed." },
  { key: "day-challenge-dao", kind: "day", planner: "challenge-dao-30", title: "Tao Te Ching day", line: "A page a day: the hours beside nature noticed, simple things and what you let go of, that day's chapters, the line that stayed and stillness.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-challenge-dao-90", kind: "pages", planner: "challenge-dao-90", title: "Tao Te Ching pages, 90 days", line: "Thirteen weeks of chapters to tick off, why, the translation you chose, days done, the chapters that stayed and simple things." },
  { key: "week-challenge-dao", kind: "week", planner: "challenge-dao-90", title: "Tao Te Ching week", line: "Each day as open dots, the week's chapters and the line that stayed, nature noticed, simple things, wu wei, forcing or flowing each day and stillness.", hours: "Increments off, dotted" },
  { key: "pages-challenge-new-year-30", kind: "pages", planner: "challenge-new-year-30", title: "New year challenge pages", line: "January's thirty steps to tick off, days done, why, where you start and finish, and a letter to you in December." },
  { key: "day-challenge-new-year", kind: "day", planner: "challenge-new-year-30", title: "New year challenge day", line: "A page a day: the hours beside three things for today and what you're grateful for, that day's step with room to write, and a to-do list.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-challenge-new-year-90", kind: "pages", planner: "challenge-new-year-90", title: "New year pages, 90 days", line: "Thirteen weeks' steps to tick off, why, where you start and finish, days done, your word for the year and a letter to you in December." },
  { key: "week-challenge-new-year", kind: "week", planner: "challenge-new-year-90", title: "New year week", line: "The week's step, what you'll do and what's in the way, what got done, the week's list under each day, habits and the week reviewed." },
];

export const STARTERS: Starter[] = ALL.filter((s) => HERO_BY_KEY[s.key] && !HERO_BY_KEY[s.key].held);

export const STARTER_BY_KEY: Record<string, Starter> = Object.fromEntries(STARTERS.map((s) => [s.key, s]));

/** The ones the gallery lists among the weeks, months, days and pages: not
 *  a planner's parts, which are shown with their planner. */
export const LISTED_STARTERS: Starter[] = STARTERS.filter((s) => !s.planner);

/** The few the landing page shows, one of each kind, ending in "View more"
 *  (2026-10-08: "there should be less layouts and just say view more at
 *  end"). */
export const HOME_KEYS = ["student", "month-family", "day-adhd", "rapid-log", "pages-trip", "nine-to-five"].filter((key) => STARTER_BY_KEY[key]);

export const KIND_SECTIONS: Array<[kind: StarterKind, heading: string, lede: string]> = [
  ["week", "Weeks", "A spread for every week: the hours across both pages, and everything around them. Some set the hours differently, by the hour, a shorter day, or no hours at all."],
  ["month", "Months", "The month's calendar across a spread, with room under it for the things you track by the month."],
  ["day", "Days", "A page for every day, its hours beside the day's own lists. Shown as two facing days."],
  ["pages", "Pages", "Pages of modules and nothing else, for the front of a journal: a trip, your reading, the kitchen."],
];

/** "Use this week", "Use these pages". */
export function actionLabel(kind: StarterKind): string {
  return kind === "pages" ? "Use these pages" : `Use this ${kind}`;
}

/** What "Use this" makes, said plainly. Given the spread's key, a spread
 *  from a season's planner says the season's dates, which is what it opens
 *  with (archetypeWeek.ts journalFor, the same lookup): a Ramadan day used
 *  alone is still thirty days of Ramadan, not the next quarter. */
export function makesWhat(kind: StarterKind, key?: string, today = new Date()): string {
  const season = key ? PLANNER_BY_KEY[PLANNER_OF_SPREAD[key] ?? ""]?.when?.(today) : undefined;
  const when = season ?? "from next month for three months";
  switch (kind) {
    case "month":
      return `Opens a monthly journal of your own with this as its month spread, ${when}.`;
    case "day":
      return `Opens a daily journal of your own with this as its page for every day, ${when}.`;
    case "pages":
      return `Opens a weekly journal of your own with these two pages at the front, ${when}.`;
    default:
      return `Opens a weekly journal of your own with this as its weekly spread, ${when}.`;
  }
}

export type ModuleSummary = { slug: string; name: string; description: string };

/** A prompt as it reads inside a sentence: its first letter lowered,
 *  unless the first word is a name ("I'm", "Monday", "Mon", "HALT", "A1",
 *  "Goal 1", "Fajr", "Psalms") or begins a two-word one ("Old Testament",
 *  "Good Friday"; not "What God is teaching me"). Its closing question mark
 *  or full stop goes; the sentence has its own. */
function inSentence(prompt: string): string {
  const [first = "", second = ""] = prompt.trim().split(/\s+/);
  const starts = /^(What|Where|Who|Whose|How|Why|When|Which|The|A|An|My|Your|Our|Their|This|That|These|Those|Today|One|Each|Every|If|So|And|But|For|To|In|On|At)$/.test(first);
  const named = /^I('|$)/.test(first) || /^[A-Z][A-Z]/.test(first) || /\d/.test(first) || /\d/.test(second) ||
    (/^[A-Z]/.test(first) && /^[A-Z]/.test(second) && !/^I('|$)/.test(second) && !starts) ||
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|January|February|March|April|May|June|July|August|September|October|November|December|God|Jesus|Scripture|Psalms|Easter|Fajr|Dhuhr|Asr|Maghrib|Isha|Taraweeh|Zakat|Quran|Eid)\b/.test(first);
  const text = prompt.trim().replace(/[?.]$/, "");
  return named ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

/** The building blocks a layout gives its own words: listed by their
 *  heading, with what kind of thing they are. */
const PRIMITIVE_WORDS: Record<string, string> = {
  "prompted-lines": "questions",
  "habit-tracker": "tracker",
  "progress-meter": "progress bar",
  "rating-strip": "ratings",
  "icon-strip": "icons",
  "todo-checklist": "checklist",
  "day-chart": "chart",
  "axis-matrix": "matrix",
};

/** How a meter's marks are numbered and ruled, as progressMeter.ts draws
 *  them: `numbers` says which carry a number (none, each milestone, every
 *  one), and a milestone is a heavier line whether it is numbered or not.
 *  "Days Kept" with no numbers is not "numbered every 30" (2026-10-30). */
function meterMarks(own: Record<string, unknown>, props: Record<string, unknown>): string {
  const total = Number(props.total);
  const every = Math.max(0, Math.floor(Number(props.milestoneEvery) || 0));
  // A meter saved before `numbers` says it with `numbered`, read only then.
  const numbers = progressMeterNumbers(own.numbers === undefined && own.numbered !== undefined ? own : props);
  const ruled = every > 1 && every < total ? `, with a heavier line every ${every}` : "";
  if (numbers === "every") return `, each numbered${ruled}`;
  if (numbers === "milestones" && every > 0 && every <= total) return every * 2 > total ? `, numbered at ${every}` : `, numbered every ${every}`;
  return ruled;
}

/** A strip's icons under each day, said for its count: one is "a book icon",
 *  not "1 books" (2026-10-30). */
function iconsUnderEachDay(count: number, icon: unknown): string {
  const label = GLYPH_LABELS[icon as GlyphShape];
  if (count === 1) {
    const one = (label?.one ?? "icon").toLowerCase();
    return `${/^[aeiou]/.test(one) ? "an" : "a"} ${one === "icon" ? one : `${one} icon`} under each day, to fill in when it applies`;
  }
  return `${count} ${label?.many.toLowerCase() ?? "icons"} under each day, filled in one at a time`;
}

function summary(slug: string): ModuleSummary {
  const info = PALETTE_INFO_BY_SLUG.get(slug);
  return { slug, name: info?.name ?? slug, description: describeModule(slug) ?? "" };
}

/** The modules on a layout, in the order they are placed: each kind once,
 *  except a note box or a plain table, which is listed by its own heading -
 *  "Copies to Make" and "Parent Emails" are two different things on the
 *  page, and so are a baseline month and a tax set-aside. */
export function modulesOf(key: string): ModuleSummary[] {
  const spread = HERO_BY_KEY[key];
  if (!spread) return [];
  const seen = new Set<string>();
  const out: ModuleSummary[] = [];
  for (const slot of spreadPlacements(spread)) {
    if (slot.locked) continue;
    const named = slot.slug === "labeled-box" || slot.slug === "column-table";
    // A heading left at the module's own ("To Do") names nothing new.
    const given = typeof slot.props?.heading === "string" && slot.props.heading ? (slot.props.heading as string) : null;
    const own = given && (named || given !== moduleSchemaDefaults(slot.slug).heading) ? given : null;
    // A building block given words of its own, or a module given a heading
    // of its own ("Inbox" for a brain dump), is listed by that heading.
    const word = PRIMITIVE_WORDS[slot.slug];
    const renamed = own && !named && !word ? own : null;
    const heading = named || word ? own : renamed;
    const id = heading ? `${slot.slug}:${heading.toLowerCase()}` : slot.slug;
    if (seen.has(id)) continue;
    seen.add(id);
    const base = summary(slot.slug);
    if (!heading) {
      out.push(base);
      continue;
    }
    if (renamed) {
      out.push({ ...base, name: `${renamed} (${base.name})` });
      continue;
    }
    if (word) {
      const listed = (key: string) => (Array.isArray(slot.props[key]) ? (slot.props[key] as string[]).filter((x) => x.trim()) : []);
      const list = { "prompted-lines": "prompts", "todo-checklist": "items", "habit-tracker": "habits", "rating-strip": "items" }[slot.slug];
      const asks = (list ? listed(list) : []).map(inSentence);
      // Prompts with a colon of their own ("Wisdom: where I need it") are
      // listed with semicolons, the colon read as a comma.
      const colons = asks.some((a) => a.includes(": "));
      const sep = colons ? "; " : ", ";
      const items = colons ? asks.map((a) => a.replace(/: /g, ", ")) : asks;
      const all = (list: string[]) => (list.length > 1 ? `${list.slice(0, -1).join(sep)}${colons ? ";" : ""} and ${list[list.length - 1]}` : list.join(""));
      // What this one holds, not what the building block can: "Side
      // Effects, 0 to 3" is not "name a habit on each row" (2026-10-21).
      const props = { ...moduleSchemaDefaults(slot.slug), ...slot.props };
      const columns = Array.isArray(slot.props.columns) ? (slot.props.columns as string[]) : null;
      const across = columns && columns.length > 1 ? `${columns[0]} to ${columns[columns.length - 1]}` : "the days";
      const rows = Array.isArray(slot.props.habits) ? (slot.props.habits as string[]).length : 0;
      const total = props.totalColumn ? ", with a total" : "";
      const description =
        slot.slug === "prompted-lines" && asks.length > 0
          ? `${heading}: ${all(items)}, with lines to answer.`
          : slot.slug === "todo-checklist" && asks.length > 0
            ? `A checklist headed ${heading}: ${all(items)}.`
            : slot.slug === "habit-tracker" && asks.length > 0
              ? `${heading}: ${all(items)}, a row each, marked across ${across}${total}.`
              : slot.slug === "habit-tracker" && rows > 0
                ? `${heading}: ${rows} rows to name for yourself, marked across ${across}${total}.`
                : slot.slug === "rating-strip" && asks.length > 0
                  ? `${heading}: ${all(items)}, each rated ${props.scaleMin} to ${props.scaleMax}.`
                  : slot.slug === "progress-meter" && typeof props.total === "number"
                    ? `${heading}: ${props.total} marks to fill in, one at a time${meterMarks(slot.props, props)}.`
                    : slot.slug === "icon-strip" && typeof props.count === "number"
                      ? `${heading}: ${iconsUnderEachDay(props.count, props.icon)}.`
                      : base.description;
      out.push({ ...base, name: `${heading} (${word})`, description });
      continue;
    }
    if (slot.slug === "column-table") {
      const columns = Array.isArray(slot.props.columns) ? (slot.props.columns as string[]) : [];
      // Each column as it reads in a sentence: "how I felt", "RSVP", "Old
      // Testament", not the whole list lowered to "how i felt" and "rsvp".
      const said = columns.map(inSentence);
      const list = said.length > 1 ? `${said.slice(0, -1).join(", ")} and ${said[said.length - 1]}` : said.join("");
      out.push({ ...base, name: `${heading} (table)`, description: `A table headed ${heading}, with columns for ${list}${slot.props.totalsRow ? ", added up at the bottom" : ""}.` });
      continue;
    }
    // A named box says what it is for, not the generic note box's line
    // eight times over.
    const rule = { lined: "ruled with lines", dotted: "on dots", graph: "on a grid" }[String(slot.props.rule ?? (slot.props.ruled ? "lined" : "none"))] ?? "left blank";
    out.push({ ...base, name: `${heading} (note box)`, description: `A box headed ${heading}, ${rule}, to write in.` });
  }
  return out;
}

/** Modules to start with: one of each kind people reach for first. */
export const STARTER_MODULES: ModuleSummary[] = [
  "habit-tracker",
  "weekly-priorities",
  "brain-dump",
  "water-week",
  "mood-chart-week",
  "sleep-chart",
  "eisenhower-matrix",
  "done-list",
  "meal-planner",
  "savings-goal",
  "books-read",
  "gratitude-three",
]
  .filter((slug) => PALETTE_INFO_BY_SLUG.has(slug))
  .map(summary);
