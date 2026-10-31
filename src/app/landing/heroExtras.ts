// The hero's spreads beside the people's weeks (heroSpreads.ts says why and
// in what order): the six themed weeks it showed before the people, weeks
// whose hours are set their own way, months, facing days, and pages of
// modules only.
//
// Written the way the people's weeks are (archetypes.ts): specific, honest,
// a little funny; scheduled things are calendar events, written around; a
// month carries what was written after the fact. Nobody here is named on
// the page - the gallery no longer captions the spreads - but the months and
// days that go with a person's week are theirs: their hand, their life.
//
// Data only.

import { BELOW_ROW, PEOPLE_BY_KEY, type Hand, type Pen, type Slot } from "./archetypes";
import type { HeroSpread } from "./heroSpreads";
import choices from "./doodleChoices.json";

const at = (slug: string, columnStart: number, rowStart: number, columnSpan: number, rowSpan: number, props?: Record<string, unknown>): Slot => ({
  slug,
  columnStart,
  rowStart,
  columnSpan,
  rowSpan,
  props,
});
/** A box with a heading: plain, lined or dotted. */
const box = (heading: string, rule: "none" | "lined" | "dotted" = "none") => ({ heading, rule, ruled: rule === "lined", templateHeading: heading });

const ink = (color: string, width: number): Pen => ({ color, width, kind: "ink" });
const marker = (color: string, width: number): Pen => ({ color, width, kind: "marker" });
const highlighter = (color: string): Pen => ({ color, width: 46, kind: "highlighter" });

// ------------------------------------------------------------------ hands

/** The six themed weeks' hands, as they were written before the people
 *  (7df0331~1, handwriting/plan.ts's HANDS). */
const HANDS: Record<string, Hand> = {
  // The reference photo: felt-tip capitals throughout.
  classic: { words: { font: "marker", caps: true, scale: 0.92 }, banner: { font: "marker", caps: true, scale: 1 }, pen: marker("#1d1c21", 5.2), accent: ink("#24439c", 3.6), highlight: highlighter("#ffe45c") },
  wellness: { words: { font: "caveat", caps: false, weight: 500, scale: 1.42 }, banner: { font: "homemade", caps: false, scale: 0.8 }, pen: ink("#1f6f6c", 4), accent: ink("#d4553f", 3.8), highlight: highlighter("#ffb3cf") },
  focus: { words: { font: "nanum", caps: false, scale: 1.55 }, banner: { font: "marker", caps: true, scale: 1 }, pen: ink("#232228", 3.4), accent: ink("#c2352b", 3.6), highlight: highlighter("#fff06a") },
  training: { words: { font: "grace", caps: false, scale: 1.2 }, banner: { font: "marker", caps: true, scale: 1 }, pen: ink("#2848a6", 3.6), accent: marker("#e27725", 5), highlight: highlighter("#b8f08a") },
  money: { words: { font: "shadows", caps: false, scale: 1.3 }, banner: { font: "grace", caps: false, scale: 1.25 }, pen: ink("#2c6a40", 3.8), accent: ink("#1d1c21", 3.4), highlight: highlighter("#ffe45c") },
  // A ballpoint in joined script, drawn stroke by stroke.
  creative: { words: { font: "allure", caps: false, scale: 1.25 }, banner: { font: "homemade", caps: false, scale: 0.8 }, pen: ink("#4a2f8f", 3.2), accent: marker("#d23f79", 4.6), highlight: highlighter("#9fdcff") },
};

const LISBON_HAND: Hand = {
  words: { font: "caveat", caps: false, weight: 500, scale: 1.42 },
  banner: { font: "marker", caps: true, scale: 1 },
  pen: ink("#1f4f8f", 3.6),
  accent: marker("#e35d3a", 4.6),
  highlight: highlighter("#ffd966"),
};
const LISBON_DOODLES: HeroSpread["doodles"] = { style: "sketchnote", big: ["sailboat", "fish", "camera", "suitcase", "icecream", "sun"], small: ["sun", "star", "heart", "sparkle"] };

/** A person's hand and doodles, for their month or their days. */
const theirs = (key: string) => ({ hand: PEOPLE_BY_KEY[key].hand, doodles: PEOPLE_BY_KEY[key].doodles });

const LISBON_TABLES = {
  "trip budget": [
    ["flights", "320", "298"],
    ["room", "540", "540"],
    ["food", "250", "310 (tarts)"],
    ["trains", "40", "36"],
    ["tiles", "0", "45 oops"],
  ],
};

export const EXTRA_SPREADS: HeroSpread[] = [
  // ============================================ the six themed weeks, back
  // As they were laid out before the people's weeks replaced them
  // (7df0331~1, spreads.ts). Their writing was dealt from shared pools; it
  // is each one's own now, scheduled things on the calendar.
  {
    key: "classic",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: false,
      sidebar: [
        ["labeled-box", 7, box("Things I'm Grateful For")],
        ["labeled-box", 11, box("Reminders")],
        ["labeled-box", 15, box("Notes")],
      ],
      belowLeft: [at("todo-checklist", 6, BELOW_ROW, 18, 15, { dayCount: 3 })],
      belowRight: [at("todo-checklist", 0, BELOW_ROW, 24, 15, { dayCount: 4 })],
    },
    hand: HANDS.classic,
    doodles: { style: "minimal", big: ["mountains", "houseplant", "paperplane", "camera", "books"], small: ["star", "sun", "sparkle", "heart"] },
    calendar: [
      { day: 1, start: 8.5, end: 9, title: "Vet - Biscuit", calendar: "personal" },
      { day: 2, start: 15, end: 16, title: "Dentist", calendar: "health" },
      { day: 4, start: 18.5, end: 20.5, title: "Book club", calendar: "community" },
    ],
    events: [
      { day: 0, at: 10, text: "meal prep" },
      { day: 0, at: 16, text: "call mom" },
      { day: 1, at: 12, text: "lunch w/ nat" },
      { day: 1, at: 18, text: "run w/ charlie", doodle: "running" },
      { day: 2, at: 8, text: "emails" },
      { day: 2, at: 15.5, text: "floss more", on: true },
      { day: 2, at: 19, text: "laundry" },
      { day: 3, at: 17.5, text: "groceries" },
      { day: 3, at: 20, text: "clean house" },
      { day: 4, at: 7.5, text: "coffee w/ jess", doodle: "cafe" },
      { day: 4, at: 19, text: "bring wine", on: true },
      { day: 5, at: 9, text: "pack!", doodle: "suitcase", mark: "highlight" },
      { day: 5, at: 17, text: "pick up rental car" },
      { day: 6, at: 10, text: "hike to the falls", doodle: "hiking" },
      { day: 6, at: 20, text: "stargazing", doodle: "moon" },
    ],
    banner: { text: "cabin trip", from: 2, to: 3 },
    lists: {
      "things i'm grateful for": ["slow sunday", "Biscuit's clean bill", "nat's lasagna"],
      reminders: ["renew passport", "mom's bday fri", "library books", "car insurance", "firewood!"],
      notes: ["cabin wifi: none (good)", "ask jess re: dog sitting", "spare key: under the frog"],
      "todo-checklist": ["laundry", "pay parking ticket", "book haircut", "fix bike tire", "buy stamps", "clean fridge", "hiking boots", "print the cabin map", "water plants", "back up phone"],
    },
  },
  {
    key: "wellness",
    fillFamily: "kolam",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      // Six rows of priorities print five, not ten; the gratitude list
      // bulleted, not numbered one to ten.
      sidebar: [
        ["weekly-priorities", 6],
        ["mood-tracker", 10],
        ["gratitude-three", 17, { lineStart: "bullets" }],
      ],
      belowLeft: [at("habit-tracker", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("meal-planner", 0, BELOW_ROW, 24, 6), at("self-care-checklist", 0, BELOW_ROW + 6, 16, 9), at("labeled-box", 16, BELOW_ROW + 6, 8, 9, box("What Helped", "lined"))],
    },
    hand: HANDS.wellness,
    doodles: { style: "retro", big: ["houseplant", "sunflower", "tea", "meditating"], small: ["heart", "sun", "sparkle", "daisy"] },
    calendar: [
      { day: 0, start: 18, end: 19, title: "Yoga", calendar: "health" },
      { day: 2, start: 12.5, end: 13.5, title: "Therapy", calendar: "health" },
      { day: 4, start: 7, end: 8, title: "Pilates", calendar: "health" },
      { day: 5, start: 16, end: 17, title: "Massage", calendar: "health" },
    ],
    events: [
      { day: 0, at: 7, text: "smoothie" },
      { day: 0, at: 21.5, text: "bed by 10", doodle: "moon" },
      { day: 1, at: 6.5, text: "long walk", doodle: "sun" },
      { day: 1, at: 19, text: "journal" },
      { day: 2, at: 13, text: "be honest", on: true },
      { day: 2, at: 19.5, text: "bath + book" },
      { day: 3, at: 8, text: "meditate" },
      { day: 3, at: 17.5, text: "tea w/ mo" },
      { day: 4, at: 20, text: "no screens after 8" },
      { day: 5, at: 9, text: "farmers mkt" },
      { day: 6, at: 10, text: "sauna", mark: "underline" },
      { day: 6, at: 15, text: "~call landlord" },
    ],
    banner: { text: "unplug", from: 2, to: 3 },
    lists: {
      priorities: ["sleep by 10:30", "therapy homework", "walk every day", "call Mo back"],
      "grateful for": ["sun on the balcony", "Mo's voicemail", "the good pillow"],
      "what helped": ["the long walk", "4-7-8 breaths", "telling Mo"],
    },
    trackers: { habits: ["water", "stretch", "8h sleep", "walk", "vitamins", "no phone in bed"] },
    ratings: { mood: [4, 3, 3, 5, 4] },
  },
  {
    key: "focus",
    // By the hour, on a 24-hour clock - the hours' settings, not the
    // layout, are what differ from before.
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: true,
      hours: { startTime: "06:00", endTime: "24:00", intervalMinutes: 60, timeFormat: "24" },
      // Big Three at four rows prints exactly three; what the week waits on
      // rather than a someday list, which would be rewritten every week.
      sidebar: [
        ["daily-big-three", 4],
        ["brain-dump", 13],
        ["waiting-on", 16],
      ],
      belowLeft: [at("todo-checklist", 6, BELOW_ROW, 18, 15, { dayCount: 3 })],
      belowRight: [at("eisenhower-matrix", 0, BELOW_ROW, 12, 15), at("labeled-box", 12, BELOW_ROW, 12, 15, box("Wins This Week"))],
    },
    hand: HANDS.focus,
    doodles: { style: "sketchnote", big: ["bulb", "books", "laptop", "coffee"], small: ["star", "lightning", "sparkle"] },
    calendar: [
      ...[0, 1, 2, 3, 4].map((day) => ({ day, start: 9, end: 9.5, title: "Standup", calendar: "work" as const })),
      { day: 0, start: 10, end: 11, title: "Sprint planning", calendar: "work" },
      { day: 1, start: 14, end: 15, title: "1:1 w/ Ana", calendar: "work" },
      { day: 3, start: 15, end: 16, title: "Demo", calendar: "work" },
      { day: 4, start: 16, end: 17, title: "Retro", calendar: "work" },
    ],
    events: [
      { day: 0, at: 7, text: "deep work", until: 9 },
      { day: 0, at: 13, text: "write draft" },
      { day: 1, at: 10, text: "inbox zero" },
      { day: 1, at: 19, text: "Go course ch. 3", doodle: "studying" },
      { day: 2, at: 10, text: "deep work", until: 13 },
      { day: 2, at: 16, text: "~review PRs" },
      { day: 3, at: 7, text: "deep work", until: 9 },
      { day: 3, at: 12, text: "lunch AWAY from desk" },
      { day: 4, at: 13, text: "ship it!", mark: "circle" },
      { day: 5, at: 10, text: "long walk, no laptop" },
      { day: 6, at: 11, text: "recharge", doodle: "coffee" },
    ],
    banner: { text: "launch", from: 1, to: 1 },
    lists: {
      "big three": ["ship onboarding v2", "write launch post", "fix the flaky test"],
      "brain dump": ["rename the repo?", "flights for Dec", "ask Ana re: promo", "new keyboard (no)", "dentist??"],
      "wins this week": ["shipped v2!", "inbox zero x2", "said no to a mtg"],
      "todo-checklist": ["review Sam's PR", "update the docs", "book 1:1 w/ Ana", "file expenses", "clear the backlog", "test on safari", "launch post draft", "thank-you to design"],
    },
    tables: {
      "waiting on": [
        ["Ana", "promo", "mon"],
        ["design", "v2 icons", "tue"],
        ["legal", "launch ok", "wed"],
      ],
    },
  },
  {
    key: "training",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["stretch-routine", 13],
        // One to five: ten circles do not fit a sidebar and overlap. Rated
        // once for the week, so not headed "Today".
        ["energy-pain-scale", 8, { scaleMax: 5, heading: "This Week" }],
        ["labeled-box", 12, box("Meals", "lined")],
      ],
      // A day column, or a week of sessions cannot be told apart.
      belowLeft: [at("workout-log", 6, BELOW_ROW, 18, 15, { columns: ["Day", "Exercise", "Sets", "Reps", "Weight"], weights: [0.8, 3, 0.8, 0.8, 1.2] })],
      // Nine rows: a table prints two fewer, so seven, a row a night.
      belowRight: [at("weekly-workout-plan", 0, BELOW_ROW, 24, 6, { habits: ["Strength", "Cardio", "Mobility", "Rest"] }), at("run-log", 0, BELOW_ROW + 6, 12, 9), at("sleep-log", 12, BELOW_ROW + 6, 12, 9)],
    },
    hand: HANDS.training,
    doodles: { style: "crayon", big: ["mountains", "sun", "running", "cycling"], small: ["lightning", "star", "sun"] },
    calendar: [
      { day: 0, start: 6.5, end: 7.5, title: "Swim squad", calendar: "personal" },
      { day: 1, start: 18, end: 19, title: "Spin class", calendar: "personal" },
      { day: 3, start: 12, end: 13, title: "Physio", calendar: "health" },
      { day: 5, start: 8, end: 11, title: "Trail race", calendar: "personal" },
    ],
    events: [
      { day: 0, at: 18, text: "5k easy", doodle: "running" },
      { day: 1, at: 7, text: "legs", doodle: "weights" },
      { day: 1, at: 18.5, text: "big gear!!", on: true },
      { day: 2, at: 7, text: "upper body" },
      { day: 2, at: 19, text: "foam roll" },
      { day: 3, at: 7, text: "intervals" },
      { day: 3, at: 12.5, text: "ask re: knee", on: true },
      { day: 4, at: 7, text: "rest day" },
      { day: 4, at: 19, text: "pasta + early night", doodle: "pizza" },
      { day: 5, at: 9, text: "easy downhill", on: true },
      { day: 5, at: 14, text: "ice bath??" },
      { day: 6, at: 10, text: "recovery walk", doodle: "dogwalk" },
      { day: 6, at: 16, text: "mobility" },
    ],
    banner: { text: "race wknd", from: 2, to: 3 },
    lists: { meals: ["oats + PB", "chicken + rice", "pasta (carbs!)", "eggs on toast"] },
    tables: {
      workout: [
        ["tue", "squat", "3", "8", "135"],
        ["tue", "lunges", "3", "10", "30"],
        ["wed", "bench", "3", "10", "95"],
        ["wed", "rows", "3", "12", "70"],
      ],
    },
    ratings: { "this week": [4, 2, 4, 3] },
  },
  {
    key: "money",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: false,
      // No no-spend calendar here: a whole month on a week page printed
      // that month four or five times over. The week's no-spend days are a
      // coin a day along the bottom, across both pages.
      sidebar: [
        ["labeled-box", 8, box("Money Goals", "lined")],
        ["grocery-list", 13],
        // A list to tick, and only this week's.
        ["todo-checklist", 12, { heading: "Bills This Week" }],
      ],
      belowLeft: [at("spending-log", 6, BELOW_ROW, 18, 14), at("icon-strip", 6, BELOW_ROW + 14, 18, 1, { heading: "No Spend", icon: "coins", count: 1 })],
      belowRight: [
        at("budget", 0, BELOW_ROW, 12, 14),
        // What went to savings and debt this week, not the savings and
        // payoff bars: a running total re-shaded on every week of the book
        // (the bars are on the money month).
        at("labeled-box", 12, BELOW_ROW, 12, 5, box("Saved This Week", "lined")),
        at("labeled-box", 12, BELOW_ROW + 5, 12, 5, box("Paid Off This Week", "lined")),
        at("labeled-box", 12, BELOW_ROW + 10, 12, 4, box("Money Wins", "lined")),
        at("icon-strip", 0, BELOW_ROW + 14, 24, 1, { heading: "No Spend", icon: "coins", count: 1 }),
      ],
    },
    hand: HANDS.money,
    doodles: { style: "pencil", big: ["houseplant", "bulb", "envelope", "coffee"], small: ["star", "sparkle", "heart"] },
    calendar: [
      { day: 2, start: 12.5, end: 13.5, title: "Bank appt", calendar: "personal" },
      { day: 4, start: 18.5, end: 20, title: "Homebuyer workshop", calendar: "community" },
    ],
    events: [
      { day: 0, at: 11, text: "meal prep" },
      { day: 0, at: 16, text: "budget!!", mark: "underline" },
      { day: 1, at: 8, text: "pack lunch" },
      { day: 1, at: 18, text: "cancel subs" },
      { day: 2, at: 13, text: "ask re: rates", on: true },
      { day: 2, at: 19, text: "sell bike", doodle: "cycling" },
      { day: 3, at: 12, text: "payday!", mark: "highlight" },
      { day: 3, at: 18, text: "library > bookshop" },
      { day: 4, at: 16.5, text: "thrift run" },
      { day: 5, at: 19, text: "free museum night" },
      { day: 6, at: 9, text: "yard sale!!" },
      { day: 6, at: 15, text: "pantry dinner", doodle: "cooking" },
    ],
    banner: { text: "no-spend week", from: 0, to: 3 },
    lists: {
      "money goals": ["$500 saved", "sell the bike", "no takeout"],
      "grocery-list": ["rice", "beans", "eggs", "oats", "frozen peas", "bananas", "coffee (cheap)"],
      "bills this week": ["phone bill", "car insurance", "card minimum"],
      "saved this week": ["$25 to savings", "bike money, $180"],
      "paid off this week": ["$60 on the card"],
      "money wins": ["bike sold! +$180", "two $0 days"],
    },
    // A coin coloured on each no-spend day, to Friday: Sunday and payday.
    // Only a page's first day: the hand takes a coin a day, evenly spaced,
    // for one group per page (plan.ts groupsOf), so a later day's 1 would
    // not draw.
    strips: { "no spend": [1, 0, 0, 1, 0, 0, 0] },
  },
  {
    key: "creative",
    fillFamily: "mexican",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: false,
      // A week's affirmation, not a day's; and what got made, which a
      // creative week is for, rather than a watchlist written out weekly.
      sidebar: [
        ["daily-affirmation", 5, { heading: "This Week", prompts: ["This week I am"] }],
        ["done-list", 13, { heading: "Made This Week" }],
        ["writing-prompt", 15],
      ],
      belowLeft: [at("sketch-box", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("todo-checklist", 0, BELOW_ROW, 24, 15, { dayCount: 4 })],
    },
    hand: HANDS.creative,
    doodles: { style: "riso", big: ["painting", "guitar", "camera", "rainbow", "music", "movie"], small: ["moon", "sparkle", "heart", "star"] },
    calendar: [
      { day: 2, start: 18.5, end: 21, title: "Life drawing", calendar: "community" },
      { day: 4, start: 19, end: 21, title: "Open mic", calendar: "community" },
      { day: 6, start: 11, end: 13, title: "Pottery class", calendar: "personal" },
    ],
    events: [
      { day: 0, at: 10, text: "museum", doodle: "painting" },
      { day: 0, at: 20, text: "film night", doodle: "movie" },
      { day: 1, at: 7, text: "write 500w" },
      { day: 1, at: 18, text: "guitar" },
      { day: 2, at: 13, text: "photo walk" },
      { day: 2, at: 19, text: "bring charcoal", on: true },
      { day: 3, at: 8, text: "write 500w" },
      { day: 3, at: 19.5, text: "zine!!" },
      { day: 4, at: 15, text: "knit" },
      { day: 4, at: 19.5, text: "2 songs only", on: true },
      { day: 5, at: 10, text: "paint", mark: "circle" },
      { day: 5, at: 20, text: "D&D night" },
      { day: 6, at: 11.5, text: "glaze the mugs", on: true },
      { day: 6, at: 16, text: "sketch in the park" },
    ],
    banner: { text: "art fair", from: 2, to: 3 },
    lists: {
      "this week": ["brave about the open mic"],
      "made this week": ["zine, 40 copies!", "2 new songs", "1000 words", "life drawings"],
      "todo-checklist": ["order canvas", "restring guitar", "print zine x40", "email the gallery", "clean brushes", "scan sketches", "buy glaze", "return library dvd"],
    },
  },

  // ======================================= weeks with their hours set apart
  // Increments off, dotted: a Bullet Journal week. Each day is a rapid log
  // down the dots - tasks, done, moved on, notes - with no times to keep to.
  {
    key: "rapid-log",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      hours: { intervalMode: "off", offModeRule: "dotted" },
      sidebar: [
        ["weekly-priorities", 8],
        ["labeled-box", 12, box("Notes", "dotted")],
        ["mood-chart-week", 13],
      ],
      belowLeft: [at("habit-tracker", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("labeled-box", 0, BELOW_ROW, 12, 15, box("Next Week", "dotted")), at("done-list", 12, BELOW_ROW, 12, 15)],
    },
    hand: { words: { font: "reenie", caps: false, scale: 1.6 }, banner: { font: "marker", caps: true, scale: 1 }, pen: ink("#202124", 3.2), accent: ink("#c0392b", 3.4), highlight: highlighter("#fff06a") },
    doodles: { style: "minimal", big: ["coffee", "books", "laptop", "houseplant", "cat"], small: ["star", "sparkle", "moon", "heart"] },
    calendar: [],
    events: [],
    log: [
      ["x email the editor", "x ch. 3 edits", "> call the bank", "- slept badly. 3 coffees", "x 20 min walk"],
      ["x call the bank", "x pitch the essay", "> fix the intro", "- Dev: read Piranesi"],
      ["x ch. 4 outline", "> fix the intro", "x yoga at home", "- rain all day. good."],
      ["x fix the intro!!", "• invoice March", "x groceries", "- best writing day in weeks"],
      ["x send ch. 4", "x invoice March", "> back up laptop", "- noodles to celebrate"],
      ["x farmers market", "• clean desk", "- long nap. no regrets"],
      ["• plan next week", "• call Gran", "x read 50 pages"],
    ],
    lists: {
      priorities: ["finish ch. 4", "pitch the essay", "bed before 12"],
      notes: ["essay angle: 'slow mail'", "the bank: ask for Ines", "Dev's rec: Piranesi"],
      "next week": ["back up laptop", "clean desk", "ch. 5 outline", "call Gran (sun!)"],
      "done!": ["sent ch. 4!!", "invoice March", "3 walks", "50 pages"],
    },
    trackers: { habits: ["write 500w", "read", "walk", "no phone in bed", "water", "stretch"] },
    charts: { mood: [2, 1, 2, 1, 0, 0] },
  },
  // Increments off, blank: a week away. The days are a travel journal, no
  // grid, under the city lettered across them.
  {
    key: "lisbon",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      hours: { intervalMode: "off", offModeRule: "none" },
      // Every week of the book, so what works week to week on the road: no
      // packing list or whole-trip budget (the Trip pages carry those, once),
      // but the week's highlights and what it cost, day by day.
      sidebar: [
        ["labeled-box", 13, box("Highlights", "lined")],
        ["labeled-box", 10, box("To Eat", "lined")],
        ["labeled-box", 10, box("To See", "lined")],
      ],
      belowLeft: [at("trip-itinerary", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("spending-log", 0, BELOW_ROW, 12, 15, { columns: ["Day", "What", "Cost"], weights: [1, 2.6, 1.2] }), at("sketch-box", 12, BELOW_ROW, 12, 15)],
    },
    hand: LISBON_HAND,
    doodles: LISBON_DOODLES,
    calendar: [],
    events: [],
    banner: { text: "lisbon", from: 0, to: 3 },
    log: [
      ["- landed! pastel de nata #1", "x tram 28 to Alfama", "- got lost (on purpose)", "x sunset at the miradouro"],
      ["x Belém tower", "- the tarts there > all", "x LX Factory", "- sardines!!"],
      ["x day trip: Sintra", "- Pena palace in fog", "• postcards"],
      ["x the tile museum", "- bought 2 tiles (oops)", "x fado night", "> postcards"],
      ["x beach day: Cascais", "- sunburn, left arm only", "x postcards!"],
      ["x flea market", "- a tiny teapot", "• pack (badly)"],
      ["- home. laundry mountain", "• print photos", "• frame the tiles"],
    ],
    lists: {
      highlights: ["Pena in fog", "fado night!!", "Belém tarts", "the miradouro"],
      "to eat": ["~pastéis de nata", "~bifana", "~grilled sardines", "ginjinha", "more tarts"],
      "to see": ["~Belém tower", "~Sintra", "~tile museum", "flea market", "LX Factory"],
    },
    tables: {
      itinerary: [
        ["mon", "Alfama", "tram 28, castle", "✓"],
        ["tue", "Belém", "tower + tarts", "✓"],
        ["wed", "Sintra", "Pena palace", "✓"],
        ["thu", "Baixa", "tiles, fado", "✓"],
        ["fri", "Cascais", "beach!", ""],
        ["sat", "Graça", "flea market", ""],
      ],
      spending: [
        ["mon", "tram + nata", "9"],
        ["tue", "Belém tarts", "7"],
        ["wed", "Sintra train", "5"],
        ["thu", "2 tiles (oops)", "45"],
        ["thu", "fado", "30"],
        ["fri", "beach lunch", "18"],
      ],
    },
  },
  // By the hour, and short: the hours in ten rows, so a household week gets
  // the room under them - meals, cleaning, the dog, the kids' chores.
  {
    key: "home",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: false,
      hours: { startTime: "06:00", endTime: "22:00", intervalMinutes: 60, compactHourRows: true },
      hoursRows: 10,
      sidebar: [
        ["weekly-priorities", 8],
        ["grocery-list", 13],
        ["labeled-box", 12, box("Dinner Ideas", "lined")],
      ],
      // The week's meals written in, not ticked: a home plans its meals
      // for the shopping (2026-10-30).
      belowLeft: [at("weekly-meal-plan", 6, 11, 18, 9), at("cleaning-rota", 6, 20, 18, 7), at("pet-care", 6, 27, 18, 9)],
      // Props print on every week of the book, so no one's own names on the
      // chore chart and no one's own houseplants: the defaults, and blank
      // rows to write the plants in. The chores are none of the cleaning's
      // or the pets' rows beside them: the chart's own Trash and Pets were
      // asked twice on one page (audit 2026-10-30).
      belowRight: [
        at("chore-chart", 0, 11, 24, 8, { habits: ["Dishes", "Tidy", "Set table", "Make beds", "Shopping"] }),
        at("todo-checklist", 0, 19, 24, 9, { dayCount: 4 }),
        at("plant-care", 0, 28, 12, 8, { habits: ["", "", "", ""] }),
        at("labeled-box", 12, 28, 12, 8, box("Fix It List", "lined")),
      ],
    },
    hand: { words: { font: "shadows", caps: false, scale: 1.3 }, banner: { font: "marker", caps: true, scale: 1 }, pen: ink("#7a2e2e", 3.8), accent: marker("#2e7d6b", 4.6), highlight: highlighter("#ffe45c") },
    doodles: { style: "crayon", big: ["dog", "houseplant", "cooking", "cat", "sun"], small: ["heart", "star", "sun", "sparkle"] },
    calendar: [
      { day: 1, start: 9, end: 10, title: "Team call", calendar: "work" },
      { day: 2, start: 17, end: 18, title: "Swim - Bea", calendar: "family" },
      { day: 3, start: 15, end: 16, title: "Parent-teacher", calendar: "family" },
      { day: 4, start: 9, end: 10, title: "Team call", calendar: "work" },
      { day: 6, start: 10, end: 12, title: "Soccer - Leo", calendar: "family" },
    ],
    events: [
      { day: 0, at: 9, text: "pancakes", doodle: "cooking" },
      { day: 0, at: 15, text: "meal prep" },
      { day: 1, at: 19, text: "bins out!" },
      { day: 2, at: 20, text: "fold the pile" },
      { day: 3, at: 12, text: "call plumber" },
      { day: 4, at: 18, text: "taco night", doodle: "taco" },
      { day: 5, at: 19, text: "movie night", doodle: "movie" },
      { day: 6, at: 11, text: "orange slices!", on: true },
      { day: 6, at: 14, text: "clean the garage" },
    ],
    lists: {
      priorities: ["fix the gutter", "Leo's form", "boiler service", "date night!"],
      groceries: ["milk x2", "tortillas", "limes", "dog food!!", "apples", "coffee", "bin bags"],
      "dinner ideas": ["taco night", "sheet-pan gnocchi", "soup + grilled cheese", "fish pie", "breakfast for dinner"],
      "todo-checklist": ["call plumber", "return the parcel", "Leo's form", "gate latch", "book the vet", "hall bulb", "sort the shed", "car tax"],
      "fix it list": ["dripping tap", "squeaky stair", "shed door", "hall bulb"],
    },
    tables: {
      chores: [
        ["✓", "", "✓", ""],
        ["", "✓", "", ""],
        ["", "", "✓", "✓"],
        ["", "", "", "✓"],
        ["✓", "", "", ""],
      ],
    },
  },

  // ================================================================ months
  // Lena's month (their week is "parent"): a line a day of what happened.
  {
    key: "month-family",
    layout: {
      kind: "month",
      font: "serif",
      weekStartsMonday: false,
      inside: "lined",
      sidebar: [
        ["labeled-box", 9, box("This Month", "lined")],
        ["labeled-box", 9, box("Birthdays", "lined")],
        ["kids-said", 16],
      ],
      // The chart's default people (Me and three to name), not this
      // family's: props print on every month of the book.
      belowLeft: [at("chore-chart", 6, 17, 18, 9, { habits: ["Dishes", "Trash", "Tidy toys", "Pets", "Set table"] }), at("labeled-box", 6, 26, 18, 10, box("Rainy Day Ideas", "lined"))],
      // The forms, money and sign-ups a family's month turns on.
      belowRight: [
        at("gift-log", 0, 17, 12, 10),
        at("labeled-box", 12, 17, 12, 10, box("Next Month", "lined")),
        at("column-table", 0, 27, 24, 9, { heading: "School & Activities", columns: ["Who", "What", "Due", "Done"], weights: [1, 3, 1, 0.8] }),
      ],
    },
    ...theirs("parent"),
    calendar: [],
    events: [],
    month: {
      today: 19,
      notes: [
        { date: 3, text: "Milo: lost tooth #3", mark: "circle" },
        { date: 5, text: "first frost", doodle: "snowflake" },
        { date: 8, text: "Ada: 'I'm four and a HALF'" },
        { date: 12, text: "Milo read a whole chapter book!!", mark: "underline" },
        { date: 14, text: "Grandma stayed over", doodle: "heart" },
        { date: 17, text: "Ada swam w/o floaties" },
        { date: 21, text: "Mom's bday", doodle: "cake" },
        { date: 25, text: "field trip $ due" },
        { date: 28, text: "library books back" },
      ],
    },
    lists: {
      "this month": ["swim lessons sign-up", "winter coats", "dentist x2", "photo book"],
      birthdays: ["Mom - 21st", "Noa - 9th", "Uncle Jo - 30th"],
      "kids said": ["Ada: 'my legs are bored'", "Milo: 'is lava a soup?'", "Ada: 'the moon followed us home'", "Milo: 'I'm not tired, my eyes are'"],
      "rainy day ideas": ["blanket fort", "banana bread", "library + hot choc", "lego city", "puppet show"],
      "next month": ["flu shots", "Ada's party - where?", "clear the closet"],
    },
    tables: {
      chores: [
        ["✓", "", "", ""],
        ["", "✓", "", ""],
        ["", "", "✓", "✓"],
        ["", "", "✓", ""],
        ["", "", "", "✓"],
      ],
      gifts: [
        ["Mom", "scarf", "$40", "✓"],
        ["Noa", "lego set", "$25", "✓"],
        ["Uncle Jo", "a book?", "$20", ""],
      ],
      "school & activities": [
        ["Ada", "swim sign-up", "10th", "✓"],
        ["Milo", "field trip $", "25th", ""],
        ["Milo", "library books", "28th", ""],
      ],
    },
  },
  // A money month, in the money week's hand: paydays, $0 days, bills ticked.
  {
    key: "month-money",
    // Cowboy-shirt patterns: a rope along the savings bars, a bandana over
    // the no-spend days.
    fillFamily: "western",
    marks: { bar: "pattern", days: "pattern" },
    layout: {
      kind: "month",
      font: "serif",
      weekStartsMonday: false,
      inside: "none",
      sidebar: [
        ["labeled-box", 9, box("Money Goals", "lined")],
        ["labeled-box", 12, box("Bills Due", "lined")],
        ["no-spend-challenge", 13],
      ],
      belowLeft: [at("budget", 6, 17, 18, 11), at("subscription-audit", 6, 28, 18, 8)],
      // One budget for the month (beside it), and what came in to pay it:
      // a second, zero-based budget had the categories written twice.
      belowRight: [
        at("income-log", 0, 17, 12, 10),
        at("labeled-box", 0, 27, 12, 9, box("Next Month", "lined")),
        at("savings-goal", 12, 17, 12, 5),
        at("debt-payoff", 12, 22, 12, 5),
        at("labeled-box", 12, 27, 12, 9, box("Money Wins", "lined")),
      ],
    },
    hand: HANDS.money,
    doodles: { style: "pencil", big: ["houseplant", "bulb", "envelope", "coffee"], small: ["star", "sparkle", "heart"] },
    calendar: [],
    events: [],
    month: {
      today: 23,
      notes: [
        { date: 1, text: "rent ✓" },
        { date: 3, text: "$0 day" },
        { date: 5, text: "PAYDAY", mark: "highlight", doodle: "sparkle" },
        { date: 6, text: "$0 day" },
        { date: 9, text: "sold the bike! +$180", mark: "circle" },
        { date: 12, text: "$0 day" },
        { date: 15, text: "phone ✓" },
        { date: 19, text: "PAYDAY", mark: "highlight" },
        { date: 20, text: "car ins ✓" },
        { date: 22, text: "$0 day" },
        { date: 28, text: "card due" },
        { date: 30, text: "budget review" },
      ],
    },
    lists: {
      "money goals": ["$500 to savings", "no takeout 2 wks", "sell the bike"],
      "bills due": ["rent - 1st", "phone - 15th", "car ins - 20th", "card - 28th"],
      "money wins": ["sold the bike +$180", "four $0 days", "cancelled meal kit"],
      "next month": ["car service $$", "Ana's wedding gift", "raise savings to $350"],
    },
    tables: {
      budget: [
        ["rent", "1200", "1200", "0"],
        ["food", "400", "362", "+38"],
        ["fun", "150", "171", "-21"],
        ["transport", "90", "84", "+6"],
        ["savings", "300", "300", "0"],
      ],
      subscriptions: [
        ["streaming", "15.99", "3rd", "no"],
        ["gym", "40", "1st", "yes"],
        ["meal kit", "60", "20th", "NO"],
      ],
      income: [
        ["5th", "payroll", "1,640", "0"],
        ["9th", "bike sale", "180", ""],
        ["19th", "payroll", "1,640", "0"],
      ],
    },
  },
  // Maya's month (their week is "student"): deadlines, a V4, the quiz.
  {
    key: "month-student",
    // What is true of every month of a term: the work due and the grades
    // back. No exam countdown (it counted toward nothing most months, and
    // an exam on a date is a calendar event), and none of Maya's hobbies
    // printed for every student.
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "dotted",
      sidebar: [
        ["labeled-box", 10, box("Goals", "lined")],
        // Not "Deadlines": the assignments table has them, with a Due column.
        ["labeled-box", 12, box("Next Month", "lined")],
        ["labeled-box", 12, box("Read for Fun", "lined")],
      ],
      belowLeft: [at("assignment-tracker", 6, 17, 18, 10), at("mood-chart-month", 6, 27, 18, 9)],
      belowRight: [at("column-table", 0, 17, 12, 19, { heading: "Grades", columns: ["Class", "Work", "Score"], weights: [1, 1.6, 0.8] }), at("lessons-learned", 12, 17, 12, 19)],
    },
    ...theirs("student"),
    calendar: [],
    events: [],
    month: {
      today: 16,
      notes: [
        { date: 2, text: "lab report due" },
        { date: 4, text: "sent the V4!!", doodle: "climbing", mark: "circle" },
        { date: 7, text: "slept 11h (worth it)" },
        { date: 9, text: "pset 8 due" },
        { date: 12, text: "A- on the quiz!!", mark: "highlight" },
        { date: 14, text: "karaoke w/ the lab", doodle: "singing" },
        { date: 20, text: "essay draft due" },
        { date: 24, text: "home - laundry run" },
        { date: 27, text: "lab report due" },
        { date: 30, text: "LAST CLASS", mark: "underline" },
      ],
    },
    lists: {
      goals: ["B+ in orgo", "climb 2x a week", "call home sundays", "7h sleep (lol)"],
      "next month": ["register for spring", "book the bus home", "new climbing shoes"],
      "read for fun": ["Piranesi", "Tomorrow x3", "the climbing zine"],
      lessons: ["start psets on MON", "flashcards > rereading", "eat before lab", "office hours help"],
    },
    tables: {
      assignments: [
        ["orgo", "lab report", "2nd", "✓"],
        ["calc", "pset 8", "9th", "✓"],
        ["lit", "essay draft", "20th", ""],
        ["orgo", "lab report", "27th", ""],
      ],
      grades: [
        ["orgo", "quiz 4", "A-"],
        ["calc", "pset 7", "18/20"],
        ["lit", "response 3", "B+"],
        ["orgo", "lab 3", "88"],
      ],
    },
    charts: { mood: [1, 0, 1, 2, 0, 1, 1, 3, 2, 1, 0, 0, 1, 0, 1] },
  },

  // ================================================================== days
  // Kai's days (their week is "adhd"): the day in its hours, the big three,
  // the brain dump, and what got done - which is the point.
  {
    key: "day-adhd",
    layout: {
      kind: "day",
      font: "sans",
      weekStartsMonday: true,
      firstDay: 1,
      hours: { startTime: "07:00", endTime: "22:00" },
      hoursRows: 17,
      // Four rows: the heading and exactly three (at six, Big Three printed
      // five numbered lines).
      sidebar: [
        ["daily-big-three", 4],
        ["brain-dump", 16],
        ["done-list", 16],
      ],
      // Tomorrow, not a dopamine menu: that is a standing list, written
      // once at the front, not a fresh empty one every day.
      below: [at("focus-blocks", 6, 18, 18, 1, { groups: 1 }), at("todo-checklist", 6, 19, 18, 9, { dayCount: 1 }), at("labeled-box", 6, 28, 18, 8, box("Tomorrow", "lined"))],
    },
    ...theirs("adhd"),
    calendar: [
      { day: 0, start: 10, end: 10.5, title: "Mira call", calendar: "work" },
      { day: 0, start: 14, end: 16, title: "Body double w/ Sol", calendar: "personal" },
      { day: 1, start: 9, end: 10, title: "Therapy", calendar: "health" },
      { day: 1, start: 15, end: 15.5, title: "Jo - logo kickoff", calendar: "work" },
    ],
    events: [
      { day: 0, at: 8, text: "meds + breakfast" },
      { day: 0, at: 11, text: "thumbnails", until: 13 },
      { day: 0, at: 13.5, text: "lunch AT lunch" },
      { day: 0, at: 14.5, text: "inbox w/ Sol", on: true },
      { day: 0, at: 16.5, text: "~invoice Bram" },
      { day: 0, at: 19, text: "skate 20 min", doodle: "skateboarding" },
      { day: 0, at: 21, text: "phone in the kitchen" },
      { day: 1, at: 7.5, text: "WATER THE PLANT" },
      { day: 1, at: 11, text: "revisions", until: 14 },
      { day: 1, at: 16, text: "invoice Bram (for real)", mark: "circle" },
      { day: 1, at: 18, text: "groceries before 0 food" },
      { day: 1, at: 20.5, text: "one episode (ONE)", doodle: "movie" },
    ],
    lists: {
      "big three": ["Mira thumbnails", "invoice Bram", "eat 3 meals", "revisions v2", "invoice Bram (AGAIN)", "Jo kickoff notes"],
      "brain dump": ["WHERE ARE MY KEYS", "cancel the free trial", "card for Jo", "is the stove off", "fix skate bearing", "new pens (no.)", "laundry is still in the machine", "dentist?? (2 yrs)", "text Sol thank you"],
      "done!": ["meds", "thumbnails sent!!", "lunch at lunch", "replied to Mira", "therapy", "revisions started", "groceries!!", "watered the plant"],
      "todo-checklist": ["send thumbnails", "invoice Bram", "reply to Jo", "laundry", "book haircut", "call bank", "order ink", "renew passport"],
      tomorrow: ["invoice Bram (for real)", "water the plant", "start revisions", "Jo kickoff notes", "laundry OUT of machine", "call the dentist"],
    },
    strips: { "focus blocks": [4] },
  },
  // Theo's days (their week is "philosophy"): the morning page before the
  // shop, the evening review after it, the hours by the hour between.
  {
    key: "day-stoic",
    fillFamily: "strokes",
    layout: {
      kind: "day",
      font: "serif",
      weekStartsMonday: false,
      firstDay: 0,
      hours: { startTime: "06:00", endTime: "22:00", intervalMinutes: 60, compactHourRows: true },
      hoursRows: 10,
      sidebar: [
        // Shorter questions: the module's own shrink to 5.5pt in a column
        // six wide.
        ["stoic-morning-page", 13, { prompts: ["In my control today", "Obstacles to expect", "The virtue I'll need"] }],
        ["dichotomy-of-control", 10],
        ["labeled-box", 13, box("Reading", "lined")],
      ],
      // The day's three things, not a memento mori: a year of weeks to
      // shade belongs at the front of the book, not on every day.
      below: [at("labeled-box", 6, 11, 18, 5, { ...box("Big Three", "lined"), lineStart: "numbers" }), at("stoic-evening-review", 6, 16, 18, 10), at("commonplace-book", 6, 26, 18, 10)],
    },
    ...theirs("philosophy"),
    calendar: [{ day: 1, start: 7, end: 17, title: "Shop", calendar: "work" }],
    events: [
      { day: 0, at: 6, text: "read" },
      { day: 0, at: 9, text: "drive w/ June - highway!" },
      { day: 0, at: 13, text: "fix the gate hinge" },
      { day: 0, at: 17, text: "dinner w/ Ruth" },
      { day: 0, at: 20, text: "sharpen chisels" },
      { day: 1, at: 6, text: "read" },
      { day: 1, at: 8, text: "Henley drawings", on: true },
      { day: 1, at: 12, text: "lunch outside", on: true },
      { day: 1, at: 18, text: "call Eli - say sorry", mark: "underline" },
      { day: 1, at: 20, text: "Meditations bk 5" },
    ],
    lists: {
      "big three": ["June: the highway", "fix the gate hinge", "sharpen chisels", "Henley drawings", "call Eli", "Meditations bk 5"],
      "stoic-morning-page": ["how I teach June", "the highway merge", "patience", "my tone w/ Eli", "the Henley deadline", "justice - be fair to Eli"],
      "stoic-evening-review": ["rushed the hinge", "stayed calm on the merge", "didn't call Eli", "said sorry to Eli", "measured twice", "the Henley quote"],
      reading: ["Meditations bk 5", "Letters 21-25", "the joinery book"],
      commonplace: ["Med. 5.1 - get up", "Marcus, at dawn", "the bed is not the work", "'the wood tells you'", "Grandad", "listen before cutting"],
    },
    tables: {
      "dichotomy-of-control": [
        ["my patience", "June's nerves"],
        ["the route", "other drivers"],
        ["my tone", "Eli's mood"],
        ["the joints", "the Henleys' taste"],
      ],
    },
  },

  // ================================================================= pages
  // Pages of modules and nothing else - a book's extra pages.
  // The trip, from the front of the book (the Lisbon week's).
  {
    key: "pages-trip",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("trip-itinerary", 0, 0, 24, 16),
          // The packing list a column wide: wider, it prints its list twice.
          at("packing-list", 0, 16, 6, 20),
          at("travel-budget", 6, 16, 18, 10),
          // The booking references, what a trip's pages are most looked up
          // for.
          at("column-table", 6, 26, 18, 10, { heading: "Bookings", columns: ["What", "Confirmation", "Date"], weights: [2, 1.6, 0.9] }),
        ],
        // This trip's sights: "Places" beside Eating Out did not say been
        // or to go.
        [at("restaurant-log", 0, 0, 24, 12), at("places-been", 0, 12, 12, 24, { heading: "To See" }), at("trip-journal", 12, 12, 12, 10, { heading: "Best Day" }), at("sketch-box", 12, 22, 12, 14)],
      ],
    },
    hand: LISBON_HAND,
    doodles: LISBON_DOODLES,
    calendar: [],
    events: [],
    lists: {
      packing: ["sunscreen!!", "comfy shoes", "adapter", "phrasebook", "tote bag"],
      "to see": ["~the castle", "~Belém tower", "~Pena palace", "~tile museum", "LX Factory", "Cascais", "flea market", "the Gulbenkian"],
      // A blank entry moves on to the next prompt.
      "trip-journal": ["Sintra, early train", "the palace in fog", "", "the cloud lifting", "", "bring a jumper. always."],
    },
    tables: {
      itinerary: [
        ["sat", "fly in", "check in, Alfama", "✓"],
        ["sun", "Alfama", "castle, tram 28", "✓"],
        ["mon", "Belém", "tower + tarts", "✓"],
        ["tue", "Sintra", "Pena palace", "✓"],
        ["wed", "Baixa", "tile museum", "✓"],
        ["thu", "Cascais", "beach day", ""],
        ["fri", "Graça", "flea market", ""],
        ["sat", "home", "", ""],
      ],
      "eating out": [
        ["the corner tasca", "bacalhau", "go back!!"],
        ["the custard place", "nata x4", "obsessed"],
        ["a kiosk", "bifana", "5 stars"],
        ["the beer hall", "prawns", "worth it"],
      ],
      bookings: [
        ["flights", "TPX4K9", "sat"],
        ["room, Alfama", "88213", "sat"],
        ["Pena palace", "PN-0412", "tue"],
      ],
      ...LISBON_TABLES,
    },
  },
  // A reader's pages: the books read, the passages kept, what's next.
  {
    key: "pages-reading",
    // Each book finished drawn in - a Talavera tile, a step fret, a
    // satin-stitch flower - often across two books or four.
    fillFamily: "mexican",
    marks: { meter: "pattern" },
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: false,
      // Front pages print once a book, and a book is often a quarter: a
      // reading goal, not "this year". A passage a row, not one passage for
      // the whole book; To Read ticked off, as the watchlist beside it is.
      pages: [
        [at("books-read", 0, 0, 24, 20), at("reading-progress", 0, 20, 24, 4, { heading: "Reading Goal" }), at("labeled-box", 0, 24, 24, 12, box("Didn't Finish", "lined"))],
        [
          at("column-table", 0, 0, 24, 14, { heading: "Commonplace", columns: ["Passage", "Book", "Page"], weights: [4, 2, 0.8] }),
          at("watchlist", 0, 14, 12, 22),
          at("todo-checklist", 12, 14, 12, 22, { heading: "To Read" }),
        ],
      ],
    },
    hand: { words: { font: "nanum", caps: false, scale: 1.55 }, banner: { font: "homemade", caps: false, scale: 0.8 }, pen: ink("#3d2b5a", 3.4), accent: ink("#b5651d", 3.6), highlight: highlighter("#ffe45c") },
    doodles: { style: "pencil", big: ["reading", "books", "tea", "owl", "cat"], small: ["star", "moon", "leaf", "heart"] },
    calendar: [],
    events: [],
    lists: {
      "didn't finish": ["Ulysses (p. 80, maybe later)", "a thriller I've already forgotten"],
      "to read": ["Middlemarch (finally)", "Babel", "The Overstory", "anything by Le Guin", "Pachinko", "~Station Eleven"],
    },
    tables: {
      // Austen, 1813: public domain, as everything quoted in the hero is.
      commonplace: [["'there is no enjoyment like reading!'", "Pride + Prejudice", "ch. 11"]],
      books: [
        ["Piranesi", "S. Clarke", "5", "jan"],
        ["Circe", "M. Miller", "4", "feb"],
        ["Klara + the Sun", "K. Ishiguro", "4", "mar"],
        ["The Hobbit (again)", "Tolkien", "5", "mar"],
        ["Educated", "T. Westover", "5", "apr"],
        ["Tomorrow x3", "G. Zevin", "4", "may"],
        ["Demon Copperhead", "B. Kingsolver", "5", "jul"],
        ["Normal People", "S. Rooney", "3", "aug"],
        ["Station Eleven", "E. St. John Mandel", "5", "sep"],
      ],
    },
    fills: { "reading goal": 17 },
  },
  // A kitchen's pages: the meals you come back to, the staples, a recipe.
  // Front pages, printed once a book, so standing lists: no week's meal
  // plan, shop or starter feedings, which would cover the first week only.
  {
    key: "pages-kitchen",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: false,
      pages: [
        [
          at("labeled-box", 0, 0, 24, 8, box("Go-To Meals", "lined")),
          at("todo-checklist", 0, 8, 12, 28, { heading: "Staples" }),
          at("recipes-to-try", 12, 8, 12, 14),
          at("labeled-box", 12, 22, 12, 14, box("Batch Cook Ideas", "lined")),
        ],
        [at("recipe-card", 0, 0, 24, 23), at("labeled-box", 0, 23, 12, 13, box("Pantry", "lined")), at("labeled-box", 12, 23, 12, 13, box("Freezer", "lined"))],
      ],
    },
    hand: { words: { font: "grace", caps: false, scale: 1.2 }, banner: { font: "marker", caps: true, scale: 1 }, pen: ink("#5a3e1b", 3.6), accent: marker("#d35400", 4.6), highlight: highlighter("#ffe45c") },
    doodles: { style: "retro", big: ["baking", "cooking", "avocado", "cake", "pizza"], small: ["heart", "star", "sparkle", "leaf"] },
    calendar: [],
    events: [],
    lists: {
      "go-to meals": ["sheet-pan gnocchi", "dal + rice", "fish tacos", "shakshuka", "soup + toasties"],
      staples: ["eggs", "spinach", "lemons", "feta", "chickpeas", "tortillas", "coriander", "flour (bread!)", "butter", "yogurt", "apples", "coffee"],
      "to cook": ["~shakshuka", "dal makhani", "~focaccia", "pho from scratch", "lemon tart", "kimchi fried rice"],
      // The sourdough, under the card's Ingredients and Method.
      recipe: ["500g flour", "350g water", "10g salt", "100g starter (bubbly!)", "", "mix, rest 1 hr", "4 folds, 30 min apart", "shape, fridge overnight", "250°C, lid on 20 min", "lid off, 20 more", "WAIT before cutting"],
      pantry: ["rice - low", "lentils x2", "flour (bread!)", "tinned tomatoes x4", "oats"],
      freezer: ["soup x3", "peas", "dumplings", "one lasagna"],
      "batch cook ideas": ["big pot of dal", "roast veg tray", "rice x2", "cookie dough (freeze!)"],
    },
  },
];

/**
 * THE BASE WEEK - the loose sheets on the hero's desk (Andrew, 2026-10-06:
 * "one more very important archetype. 'base' archetype, the archetype will
 * replace the doodle walls on the loose paper ... a weekly layout of someone
 * trying to 'get their sh*t together' ... the left loose page more focused
 * on things they want to put in place for structure now and the right page
 * more focused on fun things or plans in the future that them getting their
 * shi together will enable").
 *
 * The life cycle it stands for: someone starts on loose printouts - a free
 * week, undated - getting their bearings and picturing what it will let them
 * do; then orders the journal (the book on the desk) and settles into it,
 * making it more their own. So: printed on plain sheets, no dates, the left
 * page the basics they are putting in place, the right page the fun and the
 * plans those basics are for. Not in the journal's turn of spreads; baked
 * onto the sheets by scripts/build-hero-sheets.mts (the page /dev/sheets
 * writes it in).
 */
export const BASE_SPREAD: HeroSpread = {
  key: "base",
  undated: true,
  // Desert patterns - dunes, terraces - along the Lisbon fund's bar.
  fillFamily: "southwest",
  marks: { bar: "pattern" },
  title: "week 1 :)",
  layout: {
    kind: "week",
    font: "sans",
    weekStartsMonday: true,
    sidebar: [
      ["weekly-priorities", 8, { heading: "This Week" }],
      ["labeled-box", 9, box("Reset List", "lined")],
      ["labeled-box", 8, box("Money", "lined")],
      ["sketch-box", 8, { heading: "Doodles" }],
    ],
    belowLeft: [at("habit-tracker", 6, BELOW_ROW, 18, 15, { heading: "Basics" })],
    // The plans on the right: in the film the book's corner lies across
    // the right sheet's bottom left, and took the start of every line. The
    // drawings top left, above the corner; the Lisbon fund (a meter, not
    // writing) under it.
    belowRight: [
      at("sketch-box", 0, BELOW_ROW, 12, 10),
      at("savings-goal", 0, BELOW_ROW + 10, 12, 5, { heading: "Lisbon Fund" }),
      at("labeled-box", 12, BELOW_ROW, 12, 8, box("When It's Sorted", "lined")),
      at("someday-maybe", 12, BELOW_ROW + 8, 12, 7, { heading: "Someday Soon" }),
    ],
  },
  hand: { words: { font: "caveat", caps: false, weight: 500, scale: 1.42 }, banner: { font: "marker", caps: true, scale: 1 }, pen: ink("#24439c", 3.8), accent: ink("#d4553f", 3.6), highlight: highlighter("#ffe45c") },
  // Drawn from the body wall's pencil drawings (2026-10-07: "i want more of
  // the ones on the doodle wall body background", none of the sketchnote or
  // minimal ones), animals first in its drawing boxes ("more emphasis on
  // drawings of animals"; the round little people can come too).
  doodles: { style: "pencil", big: ["dog", "cat", "fox", "owl", "hedgehog", "whale", "bunny", "turtle", "penguin", "bird", "bear", "duck"], small: ["star", "sun", "heart", "sparkle"] },
  drawings: choices.body,
  calendar: [
    ...[0, 1, 3, 4].map((day) => ({ day, start: 9, end: 17, title: "Work", calendar: "work" as const })),
    { day: 2, start: 8, end: 9, title: "Dentist", calendar: "health" },
    { day: 2, start: 9.5, end: 17, title: "Work", calendar: "work" },
    { day: 1, start: 18, end: 19, title: "Therapy", calendar: "health" },
    { day: 3, start: 18.5, end: 20, title: "Climbing intro", calendar: "personal" },
    { day: 5, start: 14, end: 16, title: "Pottery taster", calendar: "personal" },
  ],
  events: [
    // The left page: the basics, going in.
    { day: 0, at: 7, text: "alarm 7am - no snooze" },
    { day: 0, at: 18, text: "meal prep x3", doodle: "cooking" },
    { day: 0, at: 21.5, text: "phone in the kitchen" },
    { day: 1, at: 7.5, text: "make the bed (!)" },
    { day: 1, at: 19.5, text: "laundry + FOLD it" },
    { day: 2, at: 6.5, text: "walk 20 min" },
    { day: 2, at: 8.5, text: "finally", on: true, mark: "circle" },
    { day: 2, at: 18, text: "budget hour", until: 19 },
    // The right page: what they are for.
    { day: 3, at: 7.5, text: "coffee w/ Jess", doodle: "coffee" },
    { day: 3, at: 19, text: "first time!!", on: true, doodle: "climbing" },
    { day: 4, at: 12, text: "lunch outside :)", on: true },
    { day: 4, at: 19, text: "cook for Mo + Sam", doodle: "cooking" },
    { day: 4, at: 21, text: "film + pizza", doodle: "pizza" },
    { day: 5, at: 10, text: "farmers mkt" },
    { day: 5, at: 14.5, text: "old clothes", on: true },
    { day: 5, at: 17, text: "look at Lisbon flights", mark: "highlight" },
    { day: 5, at: 20.5, text: "karaoke?? (yes)", doodle: "singing" },
    { day: 6, at: 11, text: "long walk, no phone", doodle: "sun" },
    { day: 6, at: 17, text: "plan next week", mark: "underline" },
    { day: 6, at: 19.5, text: "call Gran", doodle: "heart" },
  ],
  // Over Thursday and Friday, and short: the film's pencil cup stands on
  // the right sheet's top corner, over Friday's far end and the weekend's
  // tops ("the fun part" ran under it).
  banner: { text: "fun stuff", from: 0, to: 1 },
  lists: {
    "this week": ["dentist (finally)", "make a budget", "inbox to zero", "bed before 12"],
    // Short enough for a line each in the sidebar's narrow boxes.
    "reset list": ["~cut subs", "autopay", "~clear desk", "passport!", "find a GP", "sort closet"],
    money: ["rent: paid!", "phone 15th", "food $60/wk", "save $25"],
    "when it's sorted": ["Lisbon in the spring", "climb 2x a week", "have people over", "a real bookshelf", "say yes to things"],
    "someday soon": ["learn to surf", "a dog (!!)", "night sky trip", "run a 10k", "the pottery wheel", "see Gran more"],
  },
  trackers: { basics: ["water", "bed by 11", "make the bed", "10 min tidy", "walk", "cook dinner"] },
};
