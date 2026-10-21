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
  W("student", "Student", "Every assignment with its class and due date, an exams box, a bedtime chart for the truth about exam week, and focus blocks to colour in."),
  W("nine-to-five", "9 to 5", "An Eisenhower matrix to sort the week, the day split into parts, what you are waiting on, notes for your one to one, and your days off counted."),
  W("classic", "Classic", "Half-hour rows from 5:30 in the morning to 11:30 at night, a notes box and a to-do list. The plainest week, to build your own on."),
  W("rapid-log", "Rapid log", "No hours: dotted days to list tasks, events and notes as they come, with priorities, a mood chart, habits and a done list.", "Increments off, dotted"),
  W("focus", "Deep work", "Three things a day, a brain dump, someday and maybe, a to-do list and an Eisenhower matrix.", "By the hour, 6:00 to 24:00"),
  W("nurse", "Shift work", "Built round nights: a sleep log and bedtime chart, rest days marked, meals planned ahead, water counted, and a self-care check."),
  W("teacher", "Teacher", "Each period's topic and materials, and the grading pile by class with the day each goes back."),
  W("parent", "Parent", "Meals and the grocery list, chores shared out, gifts to buy, a to-do list, and the things the kids said."),
  W("home", "Home", "Short hours leave room for meals, groceries, a cleaning rota, chores, pet care and the plants.", "By the hour in short rows, 6 AM to 10 PM"),
  W("adhd", "ADHD", "Three things a day, a brain dump, a done list that counts what you finished, focus blocks, and a dopamine menu for when you are stuck."),
  W("maker", "Maker", "Orders and the day each ships, projects with their next step, what to post when, and what it all cost."),
  W("wellness", "Wellness", "Priorities, a mood tracker, three good things, habits, meals and the plants to water."),
  W("fitness", "Running", "Runs and lifts logged, the week's training plan, progressive overload, stretches, and energy and bedtime beside them."),
  W("training", "Training and recovery", "The week's plan, workouts and runs logged, stretches, an energy and pain scale and a sleep log."),
  W("money", "Money", "A no-spend challenge, groceries, every purchase, a budget, and bars to fill for savings and debt."),
  W("philosophy", "Stoic", "Morning and evening Stoic pages, the dichotomy of control, Franklin's thirteen virtues and a commonplace book."),
  W("chronic-illness", "Chronic illness", "Spoons to spend, energy and pain on one scale, symptoms through the day, and every dose ticked off."),
  W("lisbon", "Travel", "Blank days for wherever the day goes, with a packing list, an itinerary, a budget and a sketch box.", "Increments off, blank"),
  W("creative", "Creative", "A daily affirmation, a watchlist, writing prompts, a sketch box and a to-do list."),
  { key: "month-family", kind: "month", title: "Family month", line: "Lined days for the family calendar, with notes, a chore chart, gifts to buy, a yoga log and the things the kids said." },
  { key: "month-money", kind: "month", title: "Money month", line: "A no-spend calendar, a budget, a zero-based budget, a subscription audit, and bars for savings and debt." },
  { key: "month-student", kind: "month", title: "Student month", line: "Dotted days, a thirty-day exam countdown, a mood chart for the month, a climbing log, the albums you listened to and lessons learned." },
  { key: "day-adhd", kind: "day", title: "ADHD day", line: "A page a day: the hours beside three things for today, a brain dump, a done list, focus blocks, a to-do list and a dopamine menu.", hours: "Half hours, 7 AM to 10 PM" },
  { key: "day-stoic", kind: "day", title: "Stoic day", line: "A page a day: the hours beside the morning and evening Stoic pages, the dichotomy of control, memento mori and a commonplace book.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-trip", kind: "pages", title: "Trip pages", line: "Two pages for a trip: an itinerary, a packing list, a budget, places to go, where you ate, a trip journal and a sketch box." },
  { key: "pages-reading", kind: "pages", title: "Reading pages", line: "Books read, reading progress, albums, a watchlist and a commonplace book." },
  { key: "pages-kitchen", kind: "pages", title: "Kitchen pages", line: "Meals for the week, groceries, recipes to try, a recipe card and sourdough starter feedings." },
  // The prebuilt planners' parts (plannerSpreads.ts).
  { key: "pages-irregular-income", kind: "pages", planner: "irregular-income", title: "Irregular income pages", line: "A baseline month, a rule for when there's extra, sinking funds, irregular bills ninety days ahead, subscriptions, tax set aside by the quarter, and bars for the buffer and debt." },
  { key: "month-irregular-income", kind: "month", planner: "irregular-income", title: "Irregular income month", line: "Lined days for paydays and bills, every payment logged, two paychecks budgeted, what to set aside, the buffer, and a month review." },
  { key: "pages-adhd", kind: "pages", planner: "adhd", title: "ADHD pages", line: "A dopamine menu, what to do when you're stuck, someday and maybe, things not to forget, a dotted brain dump and your projects." },
  { key: "month-adhd", kind: "month", planner: "adhd", title: "ADHD month", line: "Dotted days, stars that add up for each week, a brain dump, your projects, what helped, wins and a done list." },
  { key: "day-adhd-dots", kind: "day", planner: "adhd", title: "ADHD day", line: "A page a day: three things, what you actually got done and tomorrow down the side, the day as open dots, focus blocks and a short list.", hours: "Increments off, dotted" },
  { key: "week-irregular-income", kind: "week", planner: "irregular-income", title: "Irregular income week", line: "What is safe to spend, bills due, groceries, every purchase, what came in, and bars for the buffer and debt." },
  // The library's planners (2026-10-21, plannerLibrary.ts).
  { key: "pages-time-block", kind: "pages", planner: "time-block", title: "Time-block pages", line: "The quarter's deep work projects, what you're saying no to, shallow work to batch, rules for your week, a time audit and a shutdown ritual." },
  { key: "week-time-block", kind: "week", planner: "time-block", title: "Time-block week", line: "By the hour from 6 AM to 10 PM to block out, a weekly plan with a shallow work budget, three priorities, a done list, shallow work under each day and deep work blocks to colour in." },
  { key: "day-time-block", kind: "day", planner: "time-block", title: "Time-block day", line: "A page a day: half hours to block out beside the big three, shallow work, a shutdown checklist, a done list and somewhere for interruptions.", hours: "Half hours, 6 AM to 10 PM" },
  { key: "pages-next-actions", kind: "pages", planner: "next-actions", title: "Next actions pages", line: "All your projects with their next action, someday and maybe, what you're waiting on, your horizons from purpose to goals, checklists and reference." },
  { key: "month-next-actions", kind: "month", planner: "next-actions", title: "Next actions month", line: "Projects started and finished, someday looked at again, a project tracker, a monthly review and what you're waiting on." },
  { key: "week-next-actions", kind: "week", planner: "next-actions", title: "Next actions week", line: "An inbox to capture into, next actions by where you can do them (calls, errands, computer, home) and the weekly review." },
  { key: "pages-twelve-week", kind: "pages", planner: "twelve-week", title: "Twelve-week pages", line: "A vision, three goals, 84 days to fill, the weekly actions for each goal, a score for every week, a check at week six and the reward at the end." },
  { key: "week-twelve-week", kind: "week", planner: "twelve-week", title: "Twelve-week week", line: "This week's actions for each goal, three priorities, a done list, a to-do list under each day, actions ticked off and the week's score." },
  { key: "pages-habits", kind: "pages", planner: "habits", title: "Habit pages", line: "What matters to you, who you're becoming, each habit's why and two-minute version, habit stacking, cues and rewards, a thirty-day challenge, the habits you're breaking and a plan for the day you miss." },
  { key: "month-habits", kind: "month", planner: "habits", title: "Habit month", line: "Habits counted by the week, not as streaks, stars that add up, what helped, wins, a monthly review and what to try next." },
  { key: "week-habits", kind: "week", planner: "habits", title: "Habit week", line: "A Sunday reset, three priorities, a done list, five habits with a weekly total, a reflection and notes." },
  { key: "pages-reading-journal", kind: "pages", planner: "reading-journal", title: "Reading journal pages", line: "Books read, a reading goal, a to-be-read list with who recommended each, a didn't-finish list and two full book reviews." },
  { key: "month-reading-journal", kind: "month", planner: "reading-journal", title: "Reading journal month", line: "What you're reading and what's next, a line you loved, reading progress, book club notes and the month's wrap-up." },
  { key: "pages-training-block", kind: "pages", planner: "training-block", title: "Training block pages", line: "The goal, paces and zones, the plan week by week with deload weeks marked, personal bests, gear, stretches, niggles, measurements and a race-day checklist." },
  { key: "month-training-block", kind: "month", planner: "training-block", title: "Training block month", line: "The month's focus, races and tests, progressive overload, weekly volume, measurements and a monthly review." },
  { key: "week-training-block", kind: "week", planner: "training-block", title: "Training block week", line: "The week's workout plan, an energy chart, how your body feels, a run log, strength with effort rated (RPE), rest days and sleep." },
  { key: "pages-stoic-practice", kind: "pages", planner: "stoic-practice", title: "Stoic practice pages", line: "The four virtues, what is and isn't in your control, memento mori, negative visualisation, a commonplace book, weekly themes, the view from above and your own rules for living." },
  { key: "week-stoic-practice", kind: "week", planner: "stoic-practice", title: "Stoic practice week", line: "The week's theme and how you'll practise it, three priorities, a commonplace book, negative visualisation, where you fell short and the week reviewed." },
  { key: "day-stoic-practice", kind: "day", planner: "stoic-practice", title: "Stoic practice day", line: "A page a day: the morning page, the big three and what's in your control beside the hours, an evening review and the commonplace book.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-mindful", kind: "pages", planner: "mindful", title: "Mindful practice pages", line: "Intentions, a practice plan, commitments, loving-kindness, wu wei, a passage read slowly, questions to sit with and what you noticed this year." },
  { key: "month-mindful", kind: "month", planner: "mindful", title: "Mindful practice month", line: "The month's intention, what you noticed, gratitude, minutes of practice, a mood chart, a reflection and what was let go." },
  { key: "day-mindful", kind: "day", planner: "mindful", title: "Mindful practice day", line: "An open, dotted day with loving-kindness, three good things, the day's verse, noticing, a rating of calm, kindness and presence, and the evening.", hours: "Increments off, dotted" },
  { key: "pages-bible-study", kind: "pages", planner: "bible-study", title: "Bible study pages", line: "Through the Bible in a year, a reading plan by week, prayer requests with the answers, verses to memorise and answered prayers." },
  { key: "month-bible-study", kind: "month", planner: "bible-study", title: "Bible study month", line: "The month's theme, serving and giving, answered prayers, the month in scripture, small group notes and a monthly review." },
  { key: "week-bible-study", kind: "week", planner: "bible-study", title: "Bible study week", line: "A prayer list, a memory verse, three good things, sermon notes, a SOAP study and verse mapping." },
  { key: "pages-one-day", kind: "pages", planner: "one-day", title: "One day at a time pages", line: "Your reasons, people you can call, what to do when a craving comes, your first 90 days, a meeting log, support contacts and milestones." },
  { key: "month-one-day", kind: "month", planner: "one-day", title: "One day at a time month", line: "The month, gratitude, milestones, days counted up and never reset, a mood chart, a meeting log and a monthly review." },
  { key: "day-one-day", kind: "day", planner: "one-day", title: "One day at a time day", line: "A page a day: just for today, a HALT check, gratitude and craving notes beside the hours, cravings rated through the day and an evening inventory.", hours: "Half hours, 7 AM to 10 PM" },
  { key: "pages-semester", kind: "pages", planner: "semester", title: "Semester pages", line: "Your classes and office hours, every syllabus deadline with its weight, an exam countdown, semester goals, assignments broken into steps and grades." },
  { key: "month-semester", kind: "month", planner: "semester", title: "Semester month", line: "What's due this month, exams, wins, an assignment tracker, a project tracker, a monthly review and next month." },
  { key: "week-semester", kind: "week", planner: "semester", title: "Semester week", line: "Three priorities, a brain dump, questions for class, a done list, an assignment tracker, a to-do list under each day, meds, water, meals and bed ticked off every day, and focus blocks to colour in." },
  { key: "pages-teacher-year", kind: "pages", planner: "teacher-year", title: "Teacher's year pages", line: "Your classes by period and room, bell times, the school year from August to July month by month, and contacts." },
  { key: "month-teacher-year", kind: "month", planner: "teacher-year", title: "Teacher's year month", line: "Dates and deadlines, duties, next month, a parent contact log, a grading tracker and a monthly review." },
  { key: "week-teacher-year", kind: "week", planner: "teacher-year", title: "Teacher's year week", line: "Half hours from 6:30 to 6:30, three priorities, copies and prep, notes, a lesson planner, duties, grading, parent contacts and next week.", hours: "Half hours, 6:30 AM to 6:30 PM" },
  { key: "pages-small-shop", kind: "pages", planner: "small-shop", title: "Small shop pages", line: "Products with cost, price and margin, suppliers, a launch plan, a content plan, tools and fees, product ideas, a sales goal and shop policies." },
  { key: "month-small-shop", kind: "month", planner: "small-shop", title: "Small shop month", line: "Launches, restocks, wins, the month's sales, costs, a content plan and a monthly review." },
  { key: "week-small-shop", kind: "week", planner: "small-shop", title: "Small shop week", line: "Three priorities, things to make and to ship, an order tracker, a content plan and spending." },
  { key: "pages-night-nurse", kind: "pages", planner: "night-nurse", title: "Night nurse pages", line: "Licences and CEUs, PTO, unit numbers, a shift bag checklist, a sleep plan, overtime and pay, good shifts and meal prep." },
  { key: "week-night-nurse", kind: "week", planner: "night-nurse", title: "Night nurse week", line: "Half hours from 7 PM to 7 AM, marked +1 after midnight, a sleep log, meals, a self-care check, before and after the shift, a to-do list and water under every night.", hours: "Half hours, 7 PM to 7 AM" },
  // The second shelf (2026-10-21, plannerLibrary2.ts).
  { key: "pages-rapid-log", kind: "pages", planner: "rapid-log", title: "Rapid log pages", line: "An index, your key, someday and maybe, lists you keep and a future log for the year ahead." },
  { key: "month-rapid-log", kind: "month", planner: "rapid-log", title: "Rapid log month", line: "Lined days, the month's goals, what carried over, a done list, a task list with priority and status, a review and dotted notes." },
  { key: "day-rapid-log", kind: "day", planner: "rapid-log", title: "Rapid log day", line: "A page a day: the day as open dots for quick notes, the big three, events, notes, a done list and tomorrow.", hours: "Increments off, dotted" },
  { key: "pages-quarterly-objective", kind: "pages", planner: "quarterly-objective", title: "Quarterly objective pages", line: "The objective and why, key results leading and lagging, thirteen weeks, what could get in the way, weekly check-ins and the end of the quarter." },
  { key: "week-quarterly-objective", kind: "week", planner: "quarterly-objective", title: "Quarterly objective week", line: "The one thing that moves it, three priorities, a done list, what moves the objective under each day, how sure you are and a check-in." },
  { key: "pages-language", kind: "pages", planner: "language", title: "Language learning pages", line: "Why you're learning, milestones from A1 to C2, resources, words to keep and phrases for real life." },
  { key: "month-language", kind: "month", planner: "language", title: "Language learning month", line: "Lined days, the month's words, grammar and something to watch, wins, what you struggled with, what you watched, read and heard, new words and a review." },
  { key: "week-language", kind: "week", planner: "language", title: "Language learning week", line: "Each day dotted for writing in your language, the week's grammar and words, phrases you needed, practice ticked off and how it went.", hours: "Increments off, dotted" },
  { key: "pages-writing", kind: "pages", planner: "writing", title: "Writing a book pages", line: "The book in a sentence, a word count bar, scenes, characters, revision passes, research and submissions." },
  { key: "month-writing", kind: "month", planner: "writing", title: "Writing a book month", line: "Lined days, chapters to draft or revise, ideas, wins, chapters by stage, research, questions for your readers and a review." },
  { key: "week-writing", kind: "week", planner: "writing", title: "Writing a book week", line: "What to work on and when, three priorities, ideas and lines, writing sessions with words and how they felt, scene ideas and dialogue." },
  { key: "pages-life-design", kind: "pages", planner: "life-design", title: "Life design pages", line: "A wheel of life, meaning in small things, the year in review and a letter to yourself a year from now." },
  { key: "month-life-design", kind: "month", planner: "life-design", title: "Life design month", line: "Dotted days, small joys, enough, what to put down, life areas with one small shift each, the wheel of life and a review." },
  { key: "week-life-design", kind: "week", planner: "life-design", title: "Life design week", line: "Three priorities, small joys, moments of flow, small things to do each day and where you found harmony." },
  { key: "pages-tao", kind: "pages", planner: "tao", title: "Taoist practice pages", line: "The 81 chapters to tick off, the uncarved block, translations you read, a chapter read slowly, nature noticed and what you let go of." },
  { key: "week-tao", kind: "week", planner: "tao", title: "Taoist practice week", line: "Each day as open dots, the week's chapter, nature noticed, simple things, wu wei, forcing or flowing each day and stillness.", hours: "Increments off, dotted" },
  { key: "pages-franklin", kind: "pages", planner: "franklin", title: "Franklin's virtues pages", line: "Franklin's thirteen virtues in his words, thirteen weeks, four rounds a year and his morning and evening questions." },
  { key: "week-franklin", kind: "week", planner: "franklin", title: "Franklin's virtues week", line: "This week's virtue, kept well, slipped, Franklin's chart of the thirteen by day, what good you did and the week reviewed." },
  { key: "pages-existential", kind: "pages", planner: "existential", title: "Existentialist pages", line: "Radical responsibility, values you choose, if this were all, absurd moments and the questions you're living with." },
  { key: "week-existential", kind: "week", planner: "existential", title: "Existentialist week", line: "A choice you're facing, three priorities, norms followed without thinking, a bad faith check and absurd moments." },
  { key: "pages-wedding", kind: "pages", planner: "wedding", title: "Wedding pages", line: "The guest list with party size, RSVP, meal, gift and thank-yous; the budget, vendors, the day and must-have photos." },
  { key: "month-wedding", kind: "month", planner: "wedding", title: "Wedding month", line: "Lined days, this month's tasks, decisions, ideas, payments due, RSVPs in, questions for vendors and notes." },
  { key: "week-wedding", kind: "week", planner: "wedding", title: "Wedding week", line: "Three priorities, who you're waiting to hear from, ideas, a to-do list under each day, calls to make and time for the two of you." },
  { key: "pages-new-baby", kind: "pages", planner: "new-baby", title: "New baby pages", line: "Who to call, help offered, growth, firsts, checkups and shots, gifts and thank-yous, and things to remember." },
  { key: "week-new-baby", kind: "week", planner: "new-baby", title: "New baby week", line: "Just three things, firsts, questions for the doctor, this week with your baby, looking after yourself and help you can ask for." },
  { key: "day-new-baby", kind: "day", planner: "new-baby", title: "New baby day", line: "A page a day: open dots for the day, sleep, changes, notes for the doctor, every feed and how you are.", hours: "Increments off, dotted" },
  { key: "pages-caregiver", kind: "pages", planner: "caregiver", title: "Caregiver pages", line: "About them, the care team, medicines, help you can ask for, when you need a break and where the papers are." },
  { key: "month-caregiver", kind: "month", planner: "caregiver", title: "Caregiver month", line: "Lined days, how they were, changes to mention, room for you, bills and claims, refills and a review." },
  { key: "week-caregiver", kind: "week", planner: "caregiver", title: "Caregiver week", line: "Three priorities, questions for the doctor, room for you, medicines and symptoms by day, a to-do list and how they were." },
  { key: "pages-grief", kind: "pages", planner: "grief", title: "Grief pages", line: "Remembering them, people you can call, dates that may be hard, things to sort and letters to them." },
  { key: "week-grief", kind: "week", planner: "grief", title: "Grief week", line: "Only what matters, a memory, people who helped, open lines for the week, how you were and small things that helped." },
  { key: "pages-homeschool", kind: "pages", planner: "homeschool", title: "Homeschool pages", line: "Subjects and curriculum, the year from August to July, and field trips." },
  { key: "month-homeschool", kind: "month", planner: "homeschool", title: "Homeschool month", line: "Lined days, themes and units, books read together, what the kids said, hours by subject, work samples and a review." },
  { key: "week-homeschool", kind: "week", planner: "homeschool", title: "Homeschool week", line: "Half hours from 8 to 3, three priorities, supplies, what the kids said, lessons, what got done by subject, each day's list, books and what they loved.", hours: "Half hours, 8 AM to 3 PM" },
  { key: "pages-perimenopause", kind: "pages", planner: "perimenopause", title: "Perimenopause pages", line: "Medicines and supplements, the care team, questions for your doctor, cycles, what helps and triggers." },
  { key: "month-perimenopause", kind: "month", planner: "perimenopause", title: "Perimenopause month", line: "Lined days, patterns, wins, notes for your doctor, a symptom summary, a mood chart and a review." },
  { key: "week-perimenopause", kind: "week", planner: "perimenopause", title: "Perimenopause week", line: "Three priorities, triggers, what helped, symptoms rated, sleep and doctor prep." },
  { key: "pages-low-fodmap", kind: "pages", planner: "low-fodmap", title: "Low-FODMAP pages", line: "Reintroduction by group over three days, safe and trigger foods, the care team, notes for your dietitian, recipes and staples." },
  { key: "week-low-fodmap", kind: "week", planner: "low-fodmap", title: "Low-FODMAP week", line: "Groceries, triggers noticed, wins, meals for the week and what you ate beside how you felt." },
  { key: "pages-fire", kind: "pages", planner: "fire", title: "Financial independence pages", line: "Your number and how you worked it out, a bar toward it, accounts, net worth by month and savings rate." },
  { key: "month-fire", kind: "month", planner: "fire", title: "Financial independence month", line: "Big expenses ahead, wins, ideas to save or earn, a budget, this month's income, spending and savings, subscriptions and a review." },
  { key: "pages-garden", kind: "pages", planner: "garden", title: "Garden pages", line: "Your zone and frost dates, a wish list, the bed layout on a grid, what you're growing, seeds on hand, harvest totals and next year." },
  { key: "month-garden", kind: "month", planner: "garden", title: "Garden month", line: "Lined days, what to sow and plant, pests and problems, wins, a harvest log, garden notes and a review." },
  { key: "week-garden", kind: "week", planner: "garden", title: "Garden week", line: "This week in the garden, harvested, noticed, garden jobs under each day and watering under all seven." },
  { key: "pages-travel", kind: "pages", planner: "travel", title: "Travel pages", line: "Itinerary, trip budget, packing, bookings, before you go, places you want to go and emergency contacts." },
  { key: "month-travel", kind: "month", planner: "travel", title: "Slow travel month", line: "Lined days, where you're living and when the stay ends, places to work, locals' tips, spending, days here, things to see and the month." },
  { key: "day-travel", kind: "day", planner: "travel", title: "Travel day", line: "A page a day: by the hour, the day's diary, what you spent, where to eat, today, and room for tickets and sketches.", hours: "By the hour in short rows, 7 AM to 11 PM" },
  { key: "pages-game-master", kind: "pages", planner: "game-master", title: "Campaign pages", line: "The campaign's premise, tone and lines and veils, player characters, factions, NPCs and places." },
  { key: "week-game-master", kind: "week", planner: "game-master", title: "Session prep week", line: "Each day as open dots, session prep, NPCs to bring in, loot, a map on a grid, session notes and after the session.", hours: "Increments off, dotted" },
  { key: "pages-ramadan", kind: "pages", planner: "ramadan", title: "Ramadan pages", line: "Thirty days of the fast, night prayer, Quran, sadaqah and dhikr, the juz read, intentions, duas and preparing for Eid." },
  { key: "day-ramadan", kind: "day", planner: "ramadan", title: "Ramadan day", line: "A page a day from 4 AM to midnight: the prayers, suhoor and iftar, dhikr, the day's dua, today's reading and a reflection.", hours: "By the hour in short rows, 4 AM to midnight" },
  { key: "pages-lent", kind: "pages", planner: "lent", title: "Lent pages", line: "Your Lenten promises, forty days, Holy Week, who you're praying for, scripture to carry and Easter." },
  { key: "week-lent", kind: "week", planner: "lent", title: "Lent week", line: "Sunday's readings, who you're praying for, grace noticed, prayer, fasting and giving each day, the homily and the examen." },
  { key: "pages-glp1", kind: "pages", planner: "glp1", title: "GLP-1 pages", line: "Your starting point and why, injection sites, protein foods you like, non-scale victories, dose changes, questions for your doctor and what helps on hard days." },
  { key: "month-glp1", kind: "month", planner: "glp1", title: "GLP-1 month", line: "Non-scale victories, questions for your doctor and refills beside the month, then measurements, a mood chart, labs and results, a monthly review and next month." },
  { key: "week-glp1", kind: "week", planner: "glp1", title: "GLP-1 week", line: "Meals planned around protein, high-protein groceries, wins, side effects scored 0 to 3, the week's injection, and protein, water and fibre under every day." },
  { key: "pages-flare-log", kind: "pages", planner: "flare-log", title: "Flare log pages", line: "Your care team, medicines, a flare plan, questions for appointments, a record of flares and notes." },
  { key: "month-flare-log", kind: "month", planner: "flare-log", title: "Flare log month", line: "Good days, hard days, questions to ask, a mood chart, a period tracker, the month's patterns and a monthly review." },
  { key: "day-flare-log", kind: "day", planner: "flare-log", title: "Flare log day", line: "A page a day: symptom severity, what helped, questions for your doctor and notes beside the hours, then spoons, energy, pain, mood and sleep from 1 to 10, every dose taken or skipped, and a food diary.", hours: "Half hours, 7 AM to 10 PM" },
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
  ["pages", "Pages", "Pages of modules and nothing else, for the front of a journal: a trip, a reading year, the kitchen."],
];

/** "Use this week", "Use these pages". */
export function actionLabel(kind: StarterKind): string {
  return kind === "pages" ? "Use these pages" : `Use this ${kind}`;
}

/** What "Use this" makes, said plainly. */
export function makesWhat(kind: StarterKind): string {
  switch (kind) {
    case "month":
      return "Opens a monthly journal of your own with this as its month spread, from next month for three months.";
    case "day":
      return "Opens a daily journal of your own with this as its page for every day, from next month for three months.";
    case "pages":
      return "Opens a weekly journal of your own with these two pages at the front, from next month for three months.";
    default:
      return "Opens a weekly journal of your own with this as its weekly spread, from next month for three months.";
  }
}

export type ModuleSummary = { slug: string; name: string; description: string };

/** A prompt as it reads inside a sentence: its first letter lowered,
 *  unless the first word is a name ("I'm", "Monday", "HALT", "Goal 1"). */
function inSentence(prompt: string): string {
  const first = prompt.trim().split(/\s+/)[0] ?? "";
  const named = /^I('|$)/.test(first) || /^[A-Z][A-Z]/.test(first) || /\d/.test(prompt.split(/\s+/)[1] ?? "") ||
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|God|Jesus|Scripture)\b/.test(first);
  const text = prompt.trim().replace(/\?$/, "");
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

function summary(slug: string): ModuleSummary {
  const info = PALETTE_INFO_BY_SLUG.get(slug);
  return { slug, name: info?.name ?? slug, description: describeModule(slug) ?? "" };
}

/** The modules on a layout, in the order they are placed: each kind once,
 *  except a note box or a plain table, which is listed by its own heading -
 *  "Exams" and "After Midterms" are two different things on the page, and
 *  so are a baseline month and a tax set-aside. */
export function modulesOf(key: string): ModuleSummary[] {
  const spread = HERO_BY_KEY[key];
  if (!spread) return [];
  const seen = new Set<string>();
  const out: ModuleSummary[] = [];
  for (const slot of spreadPlacements(spread)) {
    if (slot.locked) continue;
    const named = slot.slug === "labeled-box" || slot.slug === "column-table";
    // A heading left at the module's own ("To - Do") names nothing new.
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
                    ? `${heading}: ${props.total} marks to fill in, one at a time${typeof props.milestoneEvery === "number" && props.milestoneEvery > 0 ? `, numbered every ${props.milestoneEvery}` : ""}.`
                    : slot.slug === "icon-strip" && typeof props.count === "number"
                      ? `${heading}: ${props.count} ${GLYPH_LABELS[props.icon as GlyphShape]?.many.toLowerCase() ?? "icons"} under each day, filled in one at a time.`
                      : base.description;
      out.push({ ...base, name: `${heading} (${word})`, description });
      continue;
    }
    if (slot.slug === "column-table") {
      const columns = Array.isArray(slot.props.columns) ? (slot.props.columns as string[]) : [];
      const list = columns.length > 1 ? `${columns.slice(0, -1).join(", ")} and ${columns[columns.length - 1]}` : columns.join("");
      out.push({ ...base, name: `${heading} (table)`, description: `A table headed ${heading}, with columns for ${list.toLowerCase()}${slot.props.totalsRow ? ", added up at the bottom" : ""}.` });
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
