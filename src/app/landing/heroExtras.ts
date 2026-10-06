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
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["weekly-priorities", 11],
        ["mood-tracker", 10],
        ["gratitude-three", 12],
      ],
      belowLeft: [at("habit-tracker", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("meal-planner", 0, BELOW_ROW, 24, 6), at("plant-care", 0, BELOW_ROW + 6, 16, 9), at("labeled-box", 16, BELOW_ROW + 6, 8, 9, box("Notes", "lined"))],
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
      notes: ["magnesium?", "try 4-7-8", "Mo: sat?"],
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
      sidebar: [
        ["daily-big-three", 5],
        ["brain-dump", 12],
        ["someday-maybe", 16],
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
  },
  {
    key: "training",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["stretch-routine", 13],
        // One to five: ten circles do not fit a sidebar and overlap.
        ["energy-pain-scale", 8, { scaleMax: 5 }],
        ["labeled-box", 12, box("Meals")],
      ],
      belowLeft: [at("workout-log", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("weekly-workout-plan", 0, BELOW_ROW, 24, 7), at("run-log", 0, BELOW_ROW + 7, 12, 8), at("sleep-log", 12, BELOW_ROW + 7, 12, 8)],
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
    ratings: { today: [4, 2, 4, 3] },
  },
  {
    key: "money",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: false,
      sidebar: [
        ["no-spend-challenge", 8],
        ["grocery-list", 13],
        ["labeled-box", 12, box("Bills Due")],
      ],
      belowLeft: [at("spending-log", 6, BELOW_ROW, 18, 15)],
      belowRight: [
        at("budget", 0, BELOW_ROW, 12, 15),
        // Five rows each: a bar with words under it.
        at("savings-goal", 12, BELOW_ROW, 12, 5),
        at("debt-payoff", 12, BELOW_ROW + 5, 12, 5),
        at("labeled-box", 12, BELOW_ROW + 10, 12, 5, box("Notes")),
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
      "grocery-list": ["rice", "beans", "eggs", "oats", "frozen peas", "bananas", "coffee (cheap)"],
      "bills due": ["rent - 1st", "phone - 12th", "car ins - 20th", "internet - 22nd"],
      notes: ["bike: $180 firm", "switch phone plan?"],
    },
  },
  {
    key: "creative",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: false,
      sidebar: [
        ["daily-affirmation", 5],
        ["watchlist", 13],
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
      today: ["brave about the open mic"],
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
      sidebar: [
        ["packing-list", 13],
        ["labeled-box", 10, box("To Eat", "lined")],
        ["labeled-box", 10, box("To See", "lined")],
      ],
      belowLeft: [at("trip-itinerary", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("travel-budget", 0, BELOW_ROW, 12, 15), at("sketch-box", 12, BELOW_ROW, 12, 15)],
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
      packing: ["sunscreen!!", "comfy shoes", "adapter"],
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
      ...LISBON_TABLES,
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
      belowLeft: [at("meal-planner", 6, 11, 18, 7), at("cleaning-rota", 6, 18, 18, 9), at("pet-care", 6, 27, 18, 9)],
      belowRight: [
        at("chore-chart", 0, 11, 24, 8, { columns: ["Me", "Sam", "Leo", "Bea"] }),
        at("todo-checklist", 0, 19, 24, 9, { dayCount: 4 }),
        at("plant-care", 0, 28, 12, 8),
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
      belowLeft: [at("chore-chart", 6, 17, 18, 9, { columns: ["Me", "Sam", "Milo", "Ada"], habits: ["Dishes", "Bins", "Tidy toys", "Feed cat", "Set table"] }), at("labeled-box", 6, 26, 18, 10, box("Rainy Day Ideas", "lined"))],
      belowRight: [at("gift-log", 0, 17, 12, 10), at("labeled-box", 12, 17, 12, 10, box("Next Month", "lined")), at("yoga-log", 0, 27, 24, 9)],
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
      yoga: [
        ["thu, 6am", "Mara", "creaky"],
        ["thu, 6am", "Mara", "calm!"],
        ["thu, 6am", "sub - Ben", "too fast"],
      ],
    },
  },
  // A money month, in the money week's hand: paydays, $0 days, bills ticked.
  {
    key: "month-money",
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
      belowRight: [
        at("zero-based-budget", 0, 17, 12, 19, { heading: "Every Dollar" }),
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
      "every dollar": [
        ["rent", "1200"],
        ["food", "400"],
        ["savings", "300"],
        ["debt", "200"],
        ["fun", "150"],
        ["transport", "90"],
        ["left over", "0 !!"],
      ],
    },
  },
  // Maya's month (their week is "student"): deadlines, a V4, the quiz.
  {
    key: "month-student",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "dotted",
      sidebar: [
        ["labeled-box", 10, box("Goals", "lined")],
        ["labeled-box", 12, box("Deadlines", "lined")],
        ["labeled-box", 12, box("Read for Fun", "lined")],
      ],
      belowLeft: [at("climbing-log", 6, 17, 18, 10), at("mood-chart-month", 6, 27, 18, 9)],
      belowRight: [at("exam-countdown", 0, 17, 24, 4, { heading: "Finals" }), at("listening-log", 0, 21, 12, 15), at("lessons-learned", 12, 21, 12, 15)],
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
      deadlines: ["lab report - 2nd", "pset 8 - 9th", "essay draft - 20th", "lab report - 27th"],
      "read for fun": ["Piranesi", "Tomorrow x3", "the climbing zine"],
      lessons: ["start psets on MON", "flashcards > rereading", "eat before lab", "office hours help"],
    },
    tables: {
      climbing: [
        ["3rd", "the gym", "blue crimps", "V3", "✓"],
        ["4th", "the gym", "the roof", "V4", "✓!!"],
        ["10th", "boulders", "slab", "V2", ""],
        ["13th", "the gym", "pink dyno", "V4", ""],
      ],
      listening: [
        ["Blue", "Joni Mitchell", "5"],
        ["Grace", "Jeff Buckley", "5"],
        ["Rumours", "Fleetwood Mac", "4"],
      ],
    },
    charts: { mood: [1, 0, 1, 2, 0, 1, 1, 3, 2, 1, 0, 0, 1, 0, 1] },
    fills: { finals: 16 },
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
      sidebar: [
        ["daily-big-three", 6],
        ["brain-dump", 14],
        ["done-list", 16],
      ],
      below: [at("focus-blocks", 6, 18, 18, 1, { groups: 1 }), at("todo-checklist", 6, 19, 18, 9, { dayCount: 1 }), at("dopamine-menu", 6, 28, 18, 8)],
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
      "dopamine menu": ["boba", "skate sesh", "one episode (ONE)", "new playlist", "draw for fun", "call Sol"],
    },
    strips: { "focus blocks": [4] },
  },
  // Theo's days (their week is "philosophy"): the morning page before the
  // shop, the evening review after it, the hours by the hour between.
  {
    key: "day-stoic",
    layout: {
      kind: "day",
      font: "serif",
      weekStartsMonday: false,
      firstDay: 0,
      hours: { startTime: "06:00", endTime: "22:00", intervalMinutes: 60, compactHourRows: true },
      hoursRows: 10,
      sidebar: [
        ["stoic-morning-page", 13],
        ["dichotomy-of-control", 10],
        ["labeled-box", 13, box("Reading", "lined")],
      ],
      below: [at("memento-mori", 6, 11, 18, 4), at("stoic-evening-review", 6, 15, 18, 11), at("commonplace-book", 6, 26, 18, 10)],
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
    fills: { weeks: 41 },
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
        // The packing list a column wide: wider, it prints its list twice.
        [at("trip-itinerary", 0, 0, 24, 16), at("packing-list", 0, 16, 6, 20), at("travel-budget", 6, 16, 18, 10), at("labeled-box", 6, 26, 18, 10, box("Souvenirs", "lined"))],
        [at("restaurant-log", 0, 0, 24, 12), at("places-been", 0, 12, 12, 24), at("trip-journal", 12, 12, 12, 10, { heading: "Best Day" }), at("sketch-box", 12, 22, 12, 14)],
      ],
    },
    hand: LISBON_HAND,
    doodles: LISBON_DOODLES,
    calendar: [],
    events: [],
    lists: {
      packing: ["sunscreen!!", "comfy shoes", "adapter", "phrasebook", "tote bag"],
      places: ["~Lisbon", "~Porto", "the Azores", "Kyoto", "Oaxaca", "Iceland", "Marrakech", "Edinburgh"],
      // A blank entry moves on to the next prompt.
      "trip-journal": ["Sintra, early train", "the palace in fog", "", "the cloud lifting", "", "bring a jumper. always."],
      souvenirs: ["2 tiles (oops)", "a tiny teapot", "sardine tin (art?)", "cork coasters for Mum"],
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
      ...LISBON_TABLES,
    },
  },
  // A reader's pages: the year's books, what's on, what's next.
  {
    key: "pages-reading",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: false,
      pages: [
        [at("books-read", 0, 0, 24, 20), at("reading-progress", 0, 20, 24, 4), at("listening-log", 0, 24, 24, 12)],
        [at("commonplace-book", 0, 0, 24, 14), at("watchlist", 0, 14, 12, 22), at("labeled-box", 12, 14, 12, 22, box("To Read", "lined"))],
      ],
    },
    hand: { words: { font: "nanum", caps: false, scale: 1.55 }, banner: { font: "homemade", caps: false, scale: 0.8 }, pen: ink("#3d2b5a", 3.4), accent: ink("#b5651d", 3.6), highlight: highlighter("#ffe45c") },
    doodles: { style: "pencil", big: ["reading", "books", "tea", "owl", "cat"], small: ["star", "moon", "leaf", "heart"] },
    calendar: [],
    events: [],
    lists: {
      // Austen, 1813: public domain, as everything quoted in the hero is.
      commonplace: ["'there is no enjoyment like reading!'", "", "Pride + Prejudice, ch. 11", "", "said by someone not reading. still true."],
      "to read": ["Middlemarch (finally)", "Babel", "The Overstory", "anything by Le Guin", "Pachinko", "~Station Eleven"],
    },
    tables: {
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
      listening: [
        ["Blue", "Joni Mitchell", "5"],
        ["Grace", "Jeff Buckley", "5"],
        ["Rumours", "Fleetwood Mac", "4"],
        ["Ys", "Joanna Newsom", "4"],
      ],
    },
    fills: { "books this year": 17 },
  },
  // A kitchen's pages: the week's meals, the shop, the bread.
  {
    key: "pages-kitchen",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: false,
      pages: [
        [at("meal-planner", 0, 0, 24, 8), at("grocery-list", 0, 8, 12, 28), at("recipes-to-try", 12, 8, 12, 14), at("labeled-box", 12, 22, 12, 14, box("Batch Cook", "lined"))],
        [
          at("recipe-card", 0, 0, 24, 22, { heading: "Sourdough" }),
          at("starter-feedings", 0, 22, 24, 1, { groups: 7, groupLabels: "days" }),
          at("labeled-box", 0, 23, 12, 13, box("Pantry", "lined")),
          at("labeled-box", 12, 23, 12, 13, box("Freezer", "lined")),
        ],
      ],
    },
    hand: { words: { font: "grace", caps: false, scale: 1.2 }, banner: { font: "marker", caps: true, scale: 1 }, pen: ink("#5a3e1b", 3.6), accent: marker("#d35400", 4.6), highlight: highlighter("#ffe45c") },
    doodles: { style: "retro", big: ["baking", "cooking", "avocado", "cake", "pizza"], small: ["heart", "star", "sparkle", "leaf"] },
    calendar: [],
    events: [],
    lists: {
      groceries: ["eggs", "spinach", "lemons", "feta", "chickpeas", "tortillas", "coriander", "flour (bread!)", "butter", "yogurt", "apples", "coffee"],
      "to cook": ["~shakshuka", "dal makhani", "~focaccia", "pho from scratch", "lemon tart", "kimchi fried rice"],
      sourdough: ["500g flour", "350g water", "10g salt", "100g starter (bubbly!)", "", "mix, rest 1 hr", "4 folds, 30 min apart", "shape, fridge overnight", "250°C, lid on 20 min", "lid off, 20 more", "WAIT before cutting"],
      pantry: ["rice - low", "lentils x2", "flour (bread!)", "tinned tomatoes x4", "oats"],
      freezer: ["soup x3", "peas", "dumplings", "one lasagna"],
      "batch cook": ["big pot of dal", "roast veg tray", "rice x2", "cookie dough (freeze!)"],
    },
    strips: { starter: [2, 2, 1, 2, 2, 0, 0] },
  },
];
