// The people whose weeks the landing page's journal shows (Andrew,
// 2026-10-06: "start with student then go profession order of most
// common"), each one record: who they are, the spread they planned, and
// everything they wrote on it. Thought through in
// handoff/research/hero-archetypes.md; published as the archetypes page.
//
// ONE RECORD, TWO USES. The hero draws the layout (spreads.ts, through
// heroSpreads.ts) and writes the words (handwriting/plan.ts); "Use this
// week" turns the same layout into a new journal (planner/archetypeWeek.ts)
// - though nothing on the landing page offers it since its buttons came off
// (2026-10-06).
//
// THE REGISTER is the hero's best line so far, "doomscroll" in the
// Eisenhower's Delete quadrant: specific, honest, a little funny. Faith and
// recovery weeks keep the humour out of the practice itself (the person can
// still be funny about everything else), quote nothing still under
// copyright, and are HELD - shown in development, not on the live site -
// until someone of that faith, or in recovery, has read them.
//
// The modules these weeks wanted and the catalogue lacked - an assignment
// tracker, a done list, Franklin's virtues, 90 in 90 and the rest - were
// stood in for by their primitives until they were built (2026-10-06,
// edcdbfd and 2602734); they are the real modules now.
//
// Data only: no registry, no React. Imported by the server (layouts) and
// the browser (handwriting).

import type { FontChoice } from "@/lib/theme";
import type { HandFontKey } from "./handFonts";

// ------------------------------------------------------------------ layout

/** One module under the hours: slug, where, how big, and its settings on
 *  top of the module's defaults. */
export type Slot = { slug: string; columnStart: number; rowStart: number; columnSpan: number; rowSpan: number; props?: Record<string, unknown> };

export type WeekLayout = {
  font: FontChoice;
  weekStartsMonday: boolean;
  /** Top to bottom, 6 columns wide, filling rows 3 to 35 (33 rows). */
  sidebar: Array<[slug: string, rowSpan: number, props?: Record<string, unknown>]>;
  /** Under the left page's hours: columns 6-23, rows 21-35. */
  belowLeft: Slot[];
  /** Under the right page's hours: columns 0-23, rows 21-35. */
  belowRight: Slot[];
};

/** The zone under the hours starts a row below them (rows 0-19). */
export const BELOW_ROW = 21;
/** The week title's rows, above the sidebar - pageLayouts.ts's
 *  WEEK_TITLE_ROW_SPAN, which spreads.test.mts checks this against. */
export const SIDEBAR_FROM_ROW = 3;

/** Where a layout's modules go, page by page, with the settings it gives
 *  them - the one description of it, which the hero's spread (spreads.ts)
 *  and "Use this week" (planner/archetypeWeek.ts) both place from. Settings
 *  are the layout's own; each caller lays them over the module's defaults. */
export function layoutPlacements(layout: WeekLayout): Array<Slot & { page: 0 | 1 }> {
  const placed: Array<Slot & { page: 0 | 1 }> = [];
  let row = SIDEBAR_FROM_ROW;
  for (const [slug, rowSpan, props] of layout.sidebar) {
    placed.push({ slug, page: 0, columnStart: 0, rowStart: row, columnSpan: 6, rowSpan, props });
    row += rowSpan;
  }
  for (const s of layout.belowLeft) placed.push({ ...s, page: 0 });
  for (const s of layout.belowRight) placed.push({ ...s, page: 1 });
  return placed;
}

/** A box with a heading, lined or plain. `rule` is what the renderer reads;
 *  the legacy `ruled` boolean is set to agree, as the palette does. */
const box = (heading: string, lined = false) => ({ heading, rule: lined ? "lined" : "none", ruled: lined, templateHeading: heading });
const at = (slug: string, columnStart: number, rowStart: number, columnSpan: number, rowSpan: number, props?: Record<string, unknown>): Slot => ({
  slug,
  columnStart,
  rowStart,
  columnSpan,
  rowSpan,
  props,
});

// ------------------------------------------------------------ handwriting

export type Pen = {
  color: string;
  /** Line width in print px (300 per inch): 3 is a fine pen, 7 a marker. */
  width: number;
  kind: "ink" | "marker" | "highlighter" | "pencil";
  /** A highlighter's chisel tip, held at this angle (radians, from the
   *  page's x axis): what it lays down is the tip swept along the stroke -
   *  a band with slanted ends - not a round-ended line. `width` is then the
   *  tip's length. */
  nib?: number;
};
/**
 * How someone marks a thing done (2026-10-07): a tick; a line through it; a
 * cross; a dot; coloured in; a highlighter's one chisel stroke over it (for a
 * simple circle - "the one parallelogram stroke highlighting it"); a ring
 * round it; hatched; dashed pen strokes; or a little pattern drawn in it
 * (handwriting/patterns.ts).
 */
export type Mark = "check" | "slash" | "cross" | "dot" | "fill" | "swipe" | "circle" | "hatch" | "dashes" | "pattern";
/** What gets marked: a habit grid's cells, a weekday tracker's letters, a
 *  meter's boxes, a meter's circles, a meter's bars (filled along, between
 *  ticks), a small calendar's days, an icon strip's icons, a rating strip's
 *  bubbles. */
export type MarkKind = "grid" | "letters" | "meter" | "circles" | "bar" | "days" | "icons" | "bubbles";
/** The kind of patterns someone draws when they fill things in with a pen
 *  (handwriting/patterns.ts): plain strokes, kolam-inspired, tilings,
 *  Mexican-inspired, Southwest desert, or Western (cowboy shirts). */
export type FillFamily = "strokes" | "kolam" | "tiles" | "mexican" | "southwest" | "western";

/** A way of writing words: a handwriting font, or the stroke-drawn script. */
export type Face = { font: HandFontKey | "allure"; caps: boolean; weight?: number; scale: number };
export type Hand = { words: Face; banner: Face; pen: Pen; accent: Pen; highlight: Pen };

const ink = (color: string, width: number): Pen => ({ color, width, kind: "ink" });
const marker = (color: string, width: number): Pen => ({ color, width, kind: "marker" });
const highlighter = (color: string): Pen => ({ color, width: 46, kind: "highlighter" });

/**
 * Something written in the hours, on a day of the week in the spread's own
 * order (0 is the first day of the left page, 3 the first of the right) at
 * a time of day, 24-hour (13.5 is 1:30pm). `until` draws a line down to
 * when it ends. Text starting with "~" is written and then crossed out - a
 * plan that slipped. `doodle` is a subject from the doodle library, drawn
 * beside it; without one, the planner's own matching applies.
 */
export type HeroEvent = {
  day: number;
  at: number;
  text: string;
  until?: number;
  doodle?: string;
  mark?: "circle" | "underline" | "highlight";
  /** Written ON one of their calendar events, below its title - a note on
   *  it ("goggles!" on the lab). Anything else stays clear of their events
   *  (spreads.test.mts checks). */
  on?: boolean;
};

/**
 * Something on their calendar, drawn by the app as an event block - the
 * translucent rounded rectangle the editor's imported and typed-in events
 * are - not written by hand (Andrew, 2026-10-06: "repeating shifts are
 * supposed to be the in app events ... repeating events or scheduled
 * events"). Shifts, classes, standups, work hours, appointments, the exam,
 * the race, the party. Days as for HeroEvent; hours 24-hour, and an `end`
 * past 24 runs on into the next morning (a night shift).
 */
export type CalendarBlock = { day: number; start: number; end: number; title: string; calendar: Calendar };
/** Which of their calendars it is on. The book prints every one in the same
 *  grey (EVENT_PRINT_GREY, "colour on screen, grey on paper"); the calendar
 *  is what it would be coloured by on a screen. */
export type Calendar = "work" | "school" | "personal" | "family" | "health" | "community";

export type Person = {
  /** The spread's key, and the "Use this week" address. Stable. */
  key: string;
  /** What kind of week, as a heading: "Student". */
  archetype: string;
  name: string;
  age: number;
  /** A sentence about them. */
  about: string;
  /** What this week is about, short: "midterms". */
  week: string;
  /** Why it is not on the live site yet, if it is not. */
  held?: string;
  layout: WeekLayout;
  hand: Hand;
  /** How they doodle, and what: big subjects for a sketch box, small for
   *  beside the date. Subjects are the doodle library's. */
  doodles: { style: "minimal" | "pencil" | "crayon" | "retro" | "riso" | "sketchnote"; big: string[]; small: string[] };
  /** What they wrote in the hours. */
  events: HeroEvent[];
  /** What their calendar put there. */
  calendar: CalendarBlock[];
  /** Lettered across the top of some days of the RIGHT page: from and to
   *  are that page's day columns (0 to 3). */
  banner?: { text: string; from: number; to: number };
  /** What each box, list and table is written with - keyed by its heading
   *  (lower case) or by its module slug. */
  lists?: Record<string, string[]>;
  tables?: Record<string, string[][]>;
  /** Names for a tracker's unnamed rows. */
  trackers?: Record<string, string[]>;
  /** How tracker cells are marked: ticks, or dots (Franklin marked his
   *  faults, not his successes). */
  trackerMark?: "tick" | "dot";
  /** How they mark each kind of thing, and the patterns they fill things
   *  in with; any not given is chosen for the spread, the same every time
   *  it is written (handwriting/plan.ts). */
  marks?: Partial<Record<MarkKind, Mark>>;
  fillFamily?: FillFamily;
  /** Quadrants in reading order: schedule, do, delete, delegate. */
  eisenhower?: string[][];
  /** How many of a meter's cells are filled in. */
  fills?: Record<string, number>;
  /** An icon strip's icons coloured in, per group (a day's), in order. */
  strips?: Record<string, number[]>;
  /** The bubble filled in on each row of a rating strip, 1 up. */
  ratings?: Record<string, number[]>;
  /** A day chart's mark on each day so far, by level - 0 is the top. */
  charts?: Record<string, number[]>;
};

// ------------------------------------------------------------------ people

/**
 * In the order the hero shows them: the student first, then the jobs most
 * people do - office work, nursing, teaching, making - then the weeks
 * shaped by family, training, how a mind works, a philosophy, health, faith
 * and recovery.
 */
export const PEOPLE: Person[] = [
  {
    key: "student",
    archetype: "Student",
    name: "Maya",
    age: 20,
    about: "Second-year biology. Boulders to stay sane; karaoke with the lab group once the last exam is done.",
    week: "midterms",
    layout: {
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["weekly-priorities", 8],
        ["labeled-box", 7, box("Exams", true)],
        ["sleep-chart", 8],
        ["brain-dump", 10],
      ],
      belowLeft: [
        at("assignment-tracker", 6, BELOW_ROW, 18, 13),
        at("focus-blocks", 6, BELOW_ROW + 13, 18, 1),
        at("water-week", 6, BELOW_ROW + 14, 18, 1),
      ],
      belowRight: [
        at("habit-tracker", 0, BELOW_ROW, 12, 15, { heading: "This Week" }),
        at("labeled-box", 12, BELOW_ROW, 12, 15, box("After Midterms", true)),
      ],
    },
    hand: {
      words: { font: "caveat", caps: false, weight: 500, scale: 1.42 },
      banner: { font: "marker", caps: true, scale: 1 },
      pen: ink("#2d3a8c", 3.8),
      accent: ink("#e0457b", 3.6),
      highlight: highlighter("#ffe45c"),
    },
    doodles: { style: "sketchnote", big: ["studying", "books", "climbing", "singing", "coffee"], small: ["star", "sparkle", "heart", "lightning"] },
    calendar: [
      { day: 0, start: 9, end: 10, title: "ORGO 201", calendar: "school" },
      { day: 1, start: 13, end: 16, title: "Bio lab", calendar: "school" },
      { day: 2, start: 9, end: 10, title: "ORGO 201", calendar: "school" },
      { day: 2, start: 15, end: 16, title: "TA office hours", calendar: "school" },
      { day: 3, start: 9, end: 11, title: "ORGO midterm", calendar: "school" },
      { day: 3, start: 17, end: 19, title: "Work-study", calendar: "work" },
      { day: 4, start: 14, end: 16, title: "BIO practical", calendar: "school" },
    ],
    events: [
      { day: 0, at: 19, text: "library w/ Priya", doodle: "studying" },
      { day: 1, at: 14, text: "goggles!", on: true },
      { day: 1, at: 18.5, text: "climb (1h ONLY)", doodle: "climbing" },
      { day: 2, at: 20, text: "flashcards ch 12" },
      { day: 3, at: 10, text: "rm 204!!", on: true, mark: "circle" },
      { day: 4, at: 21, text: "KARAOKE!!", doodle: "singing", mark: "highlight" },
      { day: 5, at: 11, text: "brunch w/ Lola", doodle: "cafe" },
      { day: 6, at: 14, text: "laundry + call mom" },
    ],
    banner: { text: "midterms", from: 0, to: 1 },
    lists: {
      "weekly-priorities": ["orgo ch 9-14", "lab report!!", "call Lola back", "pay phone bill"],
      exams: ["ORGO thu 9am rm 204", "BIO prac fri 2pm", "stats quiz mon?"],
      "brain-dump": ["why did I take orgo", "return library book ($$$)", "email prof re: curve??", "new climbing shoes?", "mom's bday the 14th"],
      "after midterms": ["KARAOKE fri", "sleep 12 hours", "dye hair??", "visit Lola", "buy the boots", "clean room (lol)"],
    },
    tables: {
      assignments: [
        ["orgo", "problem set 7", "mon", "✓"],
        ["bio", "lab report", "wed", "✓"],
        ["stats", "quiz prep", "mon", ""],
        ["orgo", "flashcards", "thu", ""],
        ["eng", "read ch 3-4", "fri", ""],
      ],
    },
    trackers: { "this week": ["8h sleep", "climb", "call home", "a vegetable", "no phone in bed", "water"] },
    strips: { "focus blocks": [6, 8, 3], water: [5, 3, 2] },
    // 1am, 2am, 12am, 2am: midterms.
    charts: { bedtime: [1, 0, 2, 0] },
  },
  {
    key: "nine-to-five",
    // Each day of leave a little desert landscape, run on across the days
    // taken together.
    fillFamily: "southwest",
    marks: { meter: "pattern" },
    archetype: "9-to-5",
    name: "Marcus",
    age: 33,
    about: "Account manager at a logistics company. Takes the train. Picked skateboarding back up at 33 and is honest about it.",
    week: "the quarterly review",
    layout: {
      font: "serif",
      weekStartsMonday: true,
      sidebar: [
        ["weekly-priorities", 9],
        ["waiting-on", 10],
        ["labeled-box", 14, box("Weekend", true)],
      ],
      belowLeft: [at("time-blocking-column", 6, BELOW_ROW, 18, 6), at("todo-checklist", 6, BELOW_ROW + 6, 18, 9, { dayCount: 3 })],
      belowRight: [
        at("eisenhower-matrix", 0, BELOW_ROW, 12, 15),
        at("one-on-one-agenda", 12, BELOW_ROW, 12, 10),
        at("pto-meter", 12, BELOW_ROW + 10, 12, 5),
      ],
    },
    // The reference photo's: felt-tip capitals throughout.
    hand: {
      words: { font: "marker", caps: true, scale: 0.92 },
      banner: { font: "marker", caps: true, scale: 1 },
      pen: marker("#1d1c21", 5.2),
      accent: ink("#24439c", 3.6),
      highlight: highlighter("#ffe45c"),
    },
    doodles: { style: "minimal", big: ["coffee", "laptop", "skateboarding", "tennis"], small: ["star", "sun", "sparkle", "lightning"] },
    calendar: [
      ...[0, 1, 2, 3, 4].map((day) => ({ day, start: 9, end: 9.5, title: "Standup", calendar: "work" as const })),
      { day: 1, start: 11, end: 12, title: "Vendor call", calendar: "work" },
      { day: 2, start: 8, end: 9, title: "Dentist", calendar: "health" },
      { day: 3, start: 14, end: 16, title: "Q3 review", calendar: "work" },
      { day: 4, start: 17.5, end: 19, title: "Team drinks", calendar: "work" },
    ],
    events: [
      { day: 0, at: 19, text: "fix headphones" },
      { day: 1, at: 7, text: "~gym 7am" },
      { day: 1, at: 18.5, text: "pickleball w/ Theo", doodle: "tennis" },
      { day: 2, at: 20, text: "trivia @ Hal's" },
      { day: 3, at: 10, text: "prep deck" },
      { day: 3, at: 15, text: "don't ramble", on: true, mark: "underline" },
      { day: 5, at: 8, text: "skate park (knees?!)", doodle: "skateboarding" },
      { day: 5, at: 13, text: "laundry (finally)" },
      { day: 6, at: 11, text: "call dad" },
    ],
    banner: { text: "Q3 review", from: 0, to: 0 },
    lists: {
      "weekly-priorities": ["Q3 deck", "renew passport", "book dentist (actually)", "PTO for Dec"],
      weekend: ["skate park sat early", "laundry (finally)", "call dad", "fix headphones", "new grip tape"],
      "todo-checklist": ["expense report", "reply to Hal (be nice)", "book Q4 offsite", "update CRM", "send Henley contract", "new badge", "1:1 notes", "renew parking", "clean desk"],
      "1:1 agenda": ["won Henley acct!", "IT laptop - 3 wks", "ask re: team lead role", "Q4 targets?"],
    },
    tables: {
      "waiting-on": [
        ["Priya", "budget sign-off", "mon"],
        ["IT", "new laptop", "3 WKS"],
        ["Hal", "contract", "thu"],
      ],
    },
    // Kept word for word from the first hero: "doomscroll" in Delete.
    eisenhower: [
      ["dentist", "plan Q4"],
      ["Q3 deck!!", "reply to Ana"],
      ["doomscroll", "re-sort inbox"],
      ["book venue", "order snacks"],
    ],
    fills: { pto: 9 },
  },
  {
    key: "nurse",
    archetype: "Nurse",
    name: "Priya",
    age: 29,
    about: "ICU nurse on three twelve-hour nights this week. Pottery and the climbing gym on days off.",
    week: "three nights on",
    layout: {
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["sleep-chart", 8],
        ["water-week", 1],
        ["self-care-checklist", 11],
        ["labeled-box", 13, box("Shift Bag", true)],
      ],
      belowLeft: [at("meal-planner", 6, BELOW_ROW, 18, 6), at("sleep-log", 6, BELOW_ROW + 6, 18, 9)],
      belowRight: [
        at("labeled-box", 0, BELOW_ROW, 12, 15, box("After Shift", true)),
        at("rest-day-marker", 12, BELOW_ROW, 12, 5),
        at("todo-checklist", 12, BELOW_ROW + 5, 12, 10, { dayCount: 2 }),
      ],
    },
    hand: {
      words: { font: "shadows", caps: false, scale: 1.3 },
      banner: { font: "grace", caps: false, scale: 1.25 },
      pen: ink("#1f2a44", 3.8),
      accent: ink("#2a9d8f", 3.8),
      highlight: highlighter("#b8f08a"),
    },
    doodles: { style: "crayon", big: ["coffee", "moon", "cat", "houseplant"], small: ["moon", "star", "heart", "sparkle"] },
    calendar: [
      { day: 0, start: 10, end: 12, title: "Pottery class", calendar: "personal" },
      { day: 1, start: 19, end: 31, title: "ICU nights", calendar: "work" },
      { day: 2, start: 19, end: 31, title: "ICU nights", calendar: "work" },
      { day: 3, start: 19, end: 31, title: "ICU nights", calendar: "work" },
    ],
    events: [
      { day: 0, at: 14, text: "meal prep x3", doodle: "cooking" },
      { day: 1, at: 13, text: "nap!!" },
      { day: 1, at: 20, text: "night 1", on: true },
      { day: 2, at: 8.5, until: 14, text: "sleep" },
      { day: 3, at: 8.5, until: 14, text: "sleep (blackout)" },
      { day: 3, at: 20, text: "last one!!", on: true, mark: "underline" },
      { day: 4, at: 15, text: "coffee w/ Asha", doodle: "cafe" },
      { day: 5, at: 10, text: "climbing gym", doodle: "climbing" },
      { day: 5, at: 19, text: "dinner @ mom's" },
      { day: 6, at: 11, text: "farmers mkt", doodle: "picnic" },
    ],
    banner: { text: "days off", from: 2, to: 3 },
    lists: {
      "shift bag": ["badge + lanyard", "snacks x3", "compression socks", "charger!!", "lip balm", "spare scrubs"],
      // "survive night 3 of 3": from the Gemini archetypes report (2026-10-06).
      "after shift": ["survive night 3 of 3", "shower > food > bed", "blackout curtains", "text mom I'm alive", "1 episode max"],
      "todo-checklist": ["renew BLS cert", "pay rent", "return Asha's dish", "book dentist", "vet for Mochi", "new shoes"],
    },
    strips: { water: [6] },
    // Monday, the one night home: 11pm. Then bed at 8am - off the chart.
    charts: { bedtime: [3] },
    tables: {
      "sleep-log": [
        ["mon", "11:30p", "7:00a", "7.5", "ok"],
        ["tue", "9a", "2p", "5", "meh"],
        ["wed", "8:30a", "3p", "6.5", "ok"],
        ["thu", "8a", "2:30p", "6.5", "bad"],
      ],
    },
  },
  {
    key: "teacher",
    archetype: "Teacher",
    name: "Dayo",
    age: 42,
    about: "Teaches seventh-grade science, coaches the robotics club, and plays bass in a cover band.",
    week: "report cards",
    layout: {
      font: "serif",
      weekStartsMonday: true,
      sidebar: [
        ["weekly-priorities", 8],
        ["labeled-box", 10, box("Copies to Make", true)],
        ["labeled-box", 15, box("Parent Emails", true)],
      ],
      belowLeft: [at("lesson-planner", 6, BELOW_ROW, 18, 15)],
      belowRight: [
        at("grading-tracker", 0, BELOW_ROW, 12, 15),
        at("labeled-box", 12, BELOW_ROW, 12, 8, box("Robotics", true)),
        at("labeled-box", 12, BELOW_ROW + 8, 12, 7, box("Setlist Sat", true)),
      ],
    },
    hand: {
      words: { font: "nanum", caps: false, scale: 1.55 },
      banner: { font: "marker", caps: true, scale: 1 },
      pen: ink("#232228", 3.4),
      // The red pen.
      accent: ink("#c62828", 3.6),
      highlight: highlighter("#fff06a"),
    },
    doodles: { style: "pencil", big: ["books", "bulb", "guitar", "music"], small: ["star", "tick", "sparkle", "heart"] },
    calendar: [
      { day: 0, start: 15.5, end: 17, title: "Robotics club", calendar: "work" },
      { day: 1, start: 12, end: 12.5, title: "Lunch duty", calendar: "work" },
      { day: 1, start: 19.5, end: 21.5, title: "Band practice", calendar: "personal" },
      { day: 2, start: 15.5, end: 16.5, title: "Staff meeting", calendar: "work" },
      { day: 3, start: 15.5, end: 17, title: "Robotics club", calendar: "work" },
      { day: 5, start: 20, end: 23, title: "Gig - the Anchor", calendar: "personal" },
    ],
    events: [
      { day: 0, at: 7, text: "copies before 1st!" },
      { day: 1, at: 12.5, text: "(ugh)" },
      { day: 2, at: 20, text: "grade 7B labs" },
      { day: 3, at: 20, text: "GRADE. ALL. NIGHT." },
      { day: 4, at: 15, text: "REPORT CARDS DUE", mark: "circle" },
      { day: 4, at: 18, text: "pizza w/ the kids", doodle: "pizza" },
      { day: 5, at: 21, text: "spare strings!", on: true, doodle: "guitar" },
      { day: 6, at: 13, text: "plan next wk" },
    ],
    banner: { text: "report cards", from: 1, to: 1 },
    lists: {
      "weekly-priorities": ["report cards!!", "grade 120 labs", "fix robot motor", "sub plans for 14th"],
      "copies to make": ["7A quiz x32", "lab sheet x96", "permission slips", "seating chart"],
      "parent emails": ["Ms. Ortiz - re: Leo", "Mr. Kim - late work", "the Bakers - thank you!", "Ms. Hale (call back)"],
      robotics: ["fix left motor", "order zip ties", "practice run thu", "permission slips"],
      "setlist sat": ["Valerie", "Superstition", "Use Somebody", "encore: Sweet Disposition"],
    },
    tables: {
      "lesson plan": [
        ["1", "cell structure", "slides + scopes"],
        ["2", "cell structure", "same"],
        ["4", "lab: onion cells", "slides, iodine"],
        ["5", "review", "quiz game"],
        ["6", "quiz", "copies!"],
      ],
      grading: [
        ["7A", "lab report", "fri", "✓"],
        ["7B", "lab report", "fri", ""],
        ["7C", "quiz", "mon", "✓"],
        ["7D", "notebook ck", "fri", ""],
      ],
    },
  },
  {
    key: "maker",
    archetype: "Maker",
    name: "Ines",
    age: 30,
    about: "A ceramicist who sells online and at weekend markets. A kiln firing Thursday, a market Saturday.",
    week: "market week",
    layout: {
      font: "sans",
      weekStartsMonday: false,
      sidebar: [
        ["weekly-priorities", 8],
        ["labeled-box", 10, box("Kiln Schedule", true)],
        ["labeled-box", 15, box("Market Packing", true)],
      ],
      belowLeft: [at("order-tracker", 6, BELOW_ROW, 18, 15)],
      belowRight: [
        at("project-tracker", 0, BELOW_ROW, 24, 7),
        at("content-plan", 0, BELOW_ROW + 7, 12, 8),
        at("spending-log", 12, BELOW_ROW + 7, 12, 8),
      ],
    },
    // A ballpoint in joined script, drawn stroke by stroke.
    hand: {
      words: { font: "allure", caps: false, scale: 1.25 },
      banner: { font: "homemade", caps: false, scale: 0.8 },
      pen: ink("#4a2f8f", 3.2),
      accent: marker("#d23f79", 4.6),
      highlight: highlighter("#9fdcff"),
    },
    doodles: { style: "riso", big: ["painting", "cafe", "houseplant", "camera"], small: ["sparkle", "heart", "star", "moon"] },
    calendar: [
      { day: 2, start: 19, end: 21, title: "Wheel class (teaching)", calendar: "work" },
      { day: 6, start: 8, end: 16, title: "Elm St market", calendar: "work" },
    ],
    events: [
      { day: 0, at: 13, text: "glaze test tiles" },
      { day: 1, at: 9, until: 12, text: "throw 20 mugs" },
      { day: 1, at: 16, text: "post office", doodle: "envelope" },
      { day: 2, at: 10, text: "trim + handles" },
      { day: 2, at: 20, text: "bring towels", on: true },
      { day: 3, at: 9, text: "BISQUE FIRE" },
      { day: 3, at: 14, text: "photos for shop", doodle: "camera" },
      { day: 4, at: 9, text: "unload kiln (x fingers)" },
      { day: 4, at: 13, text: "glaze fire" },
      { day: 5, at: 10, text: "price tags" },
      { day: 5, at: 18, text: "load the car" },
      { day: 6, at: 9, text: "float $150", on: true, mark: "highlight" },
    ],
    banner: { text: "market!", from: 3, to: 3 },
    lists: {
      "weekly-priorities": ["restock mugs (20)", "ship 4 orders", "market float $$", "reply to wholesale lady"],
      "kiln schedule": ["wed - bisque", "thu - glaze ^6", "fri - unload + sort", "slow cool!!"],
      "market packing": ["tent + weights!!", "card reader charged", "bubble wrap", "price tags", "float: $150", "snacks + water"],
    },
    tables: {
      orders: [
        ["#1042", "speckled mug", "mon", "✓"],
        ["#1043", "bud vase x2", "tue", "✓"],
        ["#1044", "ramen bowl", "wed", ""],
        ["#1045", "mug - custom", "fri", ""],
      ],
      "project-tracker": [
        ["wholesale order", "sample box", "nov 1", "waiting"],
        ["new glaze", "test tiles", "sun", "testing"],
        ["website", "new photos", "wed", "doing"],
      ],
      content: [
        ["mon", "kiln opening reel", "✓"],
        ["wed", "glaze test pics", ""],
        ["fri", "market sneak peek", ""],
      ],
      "spending-log": [
        ["sun", "clay 50lb", "supplies", "42"],
        ["tue", "glaze", "supplies", "38"],
        ["thu", "booth fee", "market", "60"],
      ],
    },
  },
  {
    key: "parent",
    archetype: "Parent",
    name: "Lena",
    age: 36,
    about: "A part-time pharmacist with two kids, Milo (7) and Ada (4). Yoga at 6am on Thursday is not up for negotiation.",
    week: "picture day and a party",
    layout: {
      font: "serif",
      weekStartsMonday: false,
      sidebar: [
        ["weekly-priorities", 8],
        ["grocery-list", 13],
        ["labeled-box", 12, box("School Stuff", true)],
      ],
      belowLeft: [at("meal-planner", 6, BELOW_ROW, 18, 6), at("chore-chart", 6, BELOW_ROW + 6, 18, 9)],
      belowRight: [
        at("todo-checklist", 0, BELOW_ROW, 24, 9, { dayCount: 4 }),
        at("kids-said", 0, BELOW_ROW + 9, 12, 6),
        at("gift-log", 12, BELOW_ROW + 9, 12, 6),
      ],
    },
    hand: {
      words: { font: "grace", caps: false, scale: 1.2 },
      banner: { font: "homemade", caps: false, scale: 0.8 },
      pen: ink("#2848a6", 3.6),
      accent: marker("#e27725", 5),
      highlight: highlighter("#ffb3cf"),
    },
    doodles: { style: "retro", big: ["cake", "balloons", "sun", "dog"], small: ["heart", "star", "sparkle", "sun"] },
    calendar: [
      { day: 1, start: 9, end: 14, title: "Work", calendar: "work" },
      { day: 2, start: 16.5, end: 17.5, title: "Swim lessons", calendar: "family" },
      { day: 3, start: 9, end: 14, title: "Work", calendar: "work" },
      { day: 4, start: 11, end: 12, title: "Pediatrician - Ada", calendar: "family" },
      { day: 5, start: 9, end: 14, title: "Work", calendar: "work" },
      { day: 6, start: 14, end: 16, title: "Noa's party", calendar: "family" },
    ],
    events: [
      { day: 0, at: 9.5, text: "pancakes!", doodle: "cooking" },
      { day: 1, at: 7.5, text: "PICTURE DAY - clean shirt", mark: "underline" },
      { day: 2, at: 21.5, text: "bed by 10 (lol)" },
      { day: 3, at: 15, text: "pick up kids" },
      { day: 4, at: 6, text: "yoga 6am", doodle: "yoga" },
      { day: 4, at: 11.5, text: "ask re: rash", on: true },
      { day: 5, at: 18, text: "pizza + movie night", doodle: "movie" },
      { day: 6, at: 15, text: "gift + card!", on: true, doodle: "partyhat" },
    ],
    banner: { text: "party!", from: 3, to: 3 },
    lists: {
      "weekly-priorities": ["Milo's form - SIGN IT", "car service", "dentist x2", "gift for Noa"],
      "grocery-list": ["milk x2", "bananas", "tortillas", "cheddar", "candles (age 5!!)", "juice boxes", "coffee!!!"],
      "school stuff": ["picture day mon", "library bag tue", "field trip $ by thu", "Ada: show + tell fri"],
      "kids said": ["Ada: 'my legs are bored'", "Milo: 'is lava a soup?'"],
      "todo-checklist": ["call pediatrician", "wrap Noa's gift", "library books back", "book car service", "sign field trip form", "school shoes", "RSVP Sam's bday"],
    },
    tables: {
      "gift-log": [
        ["Noa", "lego set", "$25", "✓"],
        ["Mom", "scarf?", "$40", ""],
      ],
    },
  },
  {
    key: "fitness",
    archetype: "Fitness",
    name: "Rosa",
    age: 38,
    about: "A physiotherapist running a first half marathon on Sunday. Lifts twice a week; bouldering is banned until it is over.",
    week: "race week",
    layout: {
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["stretch-routine", 10],
        ["energy-chart", 8],
        ["sleep-chart", 8],
        ["labeled-box", 7, box("Race Kit", true)],
      ],
      belowLeft: [at("run-log", 6, BELOW_ROW, 18, 7), at("workout-log", 6, BELOW_ROW + 7, 18, 8)],
      belowRight: [
        at("weekly-workout-plan", 0, BELOW_ROW, 24, 7),
        at("progressive-overload", 0, BELOW_ROW + 7, 12, 8),
        at("labeled-box", 12, BELOW_ROW + 7, 12, 8, box("Race Morning", true)),
      ],
    },
    hand: {
      words: { font: "marker", caps: false, scale: 0.95 },
      banner: { font: "marker", caps: true, scale: 1 },
      pen: ink("#2848a6", 3.6),
      accent: marker("#e27725", 5),
      highlight: highlighter("#b8f08a"),
    },
    doodles: { style: "crayon", big: ["running", "weights", "yoga", "mountains"], small: ["lightning", "star", "sun", "heart"] },
    calendar: [
      ...[0, 1, 2, 3].map((day) => ({ day, start: 9, end: 17, title: "Clinic", calendar: "work" as const })),
      { day: 1, start: 18, end: 19, title: "Run club", calendar: "personal" },
      { day: 5, start: 10, end: 11, title: "Bib pickup", calendar: "personal" },
      { day: 6, start: 7, end: 9.5, title: "Half marathon", calendar: "personal" },
      { day: 6, start: 17, end: 18, title: "Yin yoga", calendar: "personal" },
    ],
    events: [
      { day: 0, at: 7, text: "5k easy", doodle: "running" },
      { day: 1, at: 18.5, text: "6x400 ugh", on: true },
      { day: 2, at: 7, text: "lift - light!", doodle: "weights" },
      { day: 2, at: 19, text: "~boulder w/ Kat" },
      { day: 3, at: 7.5, text: "4k shakeout" },
      { day: 4, at: 18, text: "carb load!!", doodle: "pizza" },
      { day: 4, at: 21, text: "bed by 9:30", doodle: "moon" },
      { day: 6, at: 8, text: "DON'T start fast", on: true, mark: "highlight" },
    ],
    banner: { text: "taper", from: 0, to: 2 },
    lists: {
      "race kit": ["bib #1147 + pins", "gels x3", "the GOOD socks", "watch charged"],
      "race morning": ["5:30 oats + banana", "coffee (small)", "leave 6:40", "DON'T start fast", "smile at mile 10"],
    },
    tables: {
      "run-log": [
        ["mon", "5k", "27:40", "5:32", "easy"],
        ["tue", "6x400", "--", "4:40", "ugh"],
        ["thu", "4k", "21:10", "5:17", "fresh!"],
      ],
      "workout-log": [
        ["squat", "3", "5", "95"],
        ["RDL", "3", "8", "75"],
        ["split squat", "2", "8", "20s"],
        ["plank", "3", "45s", "-"],
      ],
      "progressive-overload": [
        ["squat", "115", "120", "125", "95"],
        ["deadlift", "155", "160", "165", "--"],
      ],
    },
    // High, high, flat after Tuesday's intervals, coming back; early nights.
    charts: { energy: [0, 0, 3, 1], bedtime: [4, 4, 5, 4] },
  },
  {
    key: "adhd",
    archetype: "ADHD",
    name: "Kai",
    age: 27,
    about: "A freelance illustrator with ADHD and three clients, one of whom still owes them from August. Roller skates on Sundays.",
    week: "a deadline",
    layout: {
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["daily-big-three", 5],
        ["brain-dump", 16],
        ["done-list", 12],
      ],
      belowLeft: [at("focus-blocks", 6, BELOW_ROW, 18, 1), at("todo-checklist", 6, BELOW_ROW + 1, 18, 14, { dayCount: 3 })],
      belowRight: [
        at("project-tracker", 0, BELOW_ROW, 24, 7),
        at("waiting-on", 0, BELOW_ROW + 7, 12, 8),
        at("dopamine-menu", 12, BELOW_ROW + 7, 12, 8),
      ],
    },
    hand: {
      words: { font: "caveat", caps: false, weight: 600, scale: 1.42 },
      banner: { font: "marker", caps: true, scale: 1 },
      pen: marker("#5b2a86", 4.2),
      accent: marker("#ff6b35", 4.6),
      highlight: highlighter("#9fdcff"),
    },
    doodles: { style: "riso", big: ["skateboarding", "painting", "cat", "headphones", "pizza"], small: ["star", "lightning", "sparkle", "heart"] },
    calendar: [
      { day: 0, start: 10, end: 10.5, title: "Mira call", calendar: "work" },
      { day: 1, start: 11, end: 12, title: "Dentist", calendar: "health" },
      { day: 1, start: 14, end: 16, title: "Body double w/ Sol", calendar: "personal" },
      { day: 3, start: 17, end: 17.5, title: "Mira - revisions due", calendar: "work" },
    ],
    events: [
      { day: 0, at: 14, text: "~invoice Bram" },
      { day: 1, at: 11.5, text: "it's been 2 yrs", on: true },
      { day: 2, at: 10, text: "sketches due" },
      { day: 2, at: 16, text: "invoice Bram (AGAIN)", doodle: "envelope" },
      { day: 3, at: 9.5, text: "revisions!!", mark: "circle" },
      { day: 3, at: 14, text: "groceries before 0 food" },
      { day: 4, at: 12, text: "lunch AT lunch" },
      { day: 4, at: 20, text: "~clean desk" },
      { day: 5, at: 11, text: "skate @ the rink", doodle: "skateboarding" },
      { day: 6, at: 13, text: "reset day" },
    ],
    banner: { text: "deadline", from: 0, to: 0 },
    lists: {
      "daily-big-three": ["send Mira sketches", "invoice Bram", "eat a real lunch"],
      "brain-dump": ["WHERE ARE MY KEYS", "dentist (it's been 2 yrs)", "reply to Mira's email from AUGUST", "cancel free trial!!", "card for Jo", "buy more pens (no.)", "fix the skate bearing"],
      "done!": ["showered + left the house", "invoice #2 sent!!", "ate lunch at lunch", "replied to 3 emails", "watered the plant"],
      "dopamine menu": ["boba", "skate sesh", "one episode (ONE)", "new playlist", "draw for fun"],
      "todo-checklist": ["send sketches", "invoice Bram", "renew passport", "call bank", "laundry", "reply to Jo", "book haircut", "pay phone bill", "order ink"],
    },
    tables: {
      "project-tracker": [
        ["Mira - book cover", "revisions", "thu", "doing"],
        ["Bram - zine", "CHASE $$", "--", "waiting"],
        ["Jo - logo", "first sketches", "nov 4", "not yet"],
      ],
      "waiting-on": [
        ["Mira", "feedback", "mon"],
        ["Bram", "PAYMENT", "AUG"],
        ["landlord", "fix sink", "tue"],
      ],
    },
    strips: { "focus blocks": [2, 7, 0] },
  },
  {
    key: "philosophy",
    archetype: "Philosophy",
    name: "Theo",
    age: 47,
    about: "A cabinetmaker who reads the Stoics before the shop opens. Teaching June, sixteen, to drive. Chess club on Thursdays.",
    week: "a two-day install",
    layout: {
      font: "serif",
      weekStartsMonday: false,
      sidebar: [
        ["stoic-morning-page", 12],
        ["dichotomy-of-control", 9],
        // Seneca, Letters 13, in Richard Gummere's translation (Loeb,
        // 1917): public domain, and these are its words.
        ["quote-block", 5, { heading: "", body: "We suffer more often in imagination than in reality.", attribution: "Seneca, Letters 13 (tr. Gummere)" }],
        ["labeled-box", 7, box("Reading", true)],
      ],
      // Franklin's virtue chart: his thirteen, from his Autobiography.
      belowLeft: [at("franklin-virtues", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("stoic-evening-review", 0, BELOW_ROW, 12, 15), at("commonplace-book", 12, BELOW_ROW, 12, 15)],
    },
    hand: {
      words: { font: "homemade", caps: false, scale: 0.8 },
      banner: { font: "homemade", caps: false, scale: 0.8 },
      pen: ink("#3b2a1a", 3.2),
      accent: ink("#1f4e79", 3.4),
      highlight: highlighter("#ffe45c"),
    },
    doodles: { style: "pencil", big: ["tree", "mountains", "books", "coffee", "owl"], small: ["star", "moon", "leaf", "sun"] },
    calendar: [
      { day: 1, start: 7, end: 17, title: "Shop", calendar: "work" },
      { day: 2, start: 7, end: 17, title: "Shop", calendar: "work" },
      { day: 3, start: 7.5, end: 16, title: "Henley install", calendar: "work" },
      { day: 4, start: 7.5, end: 15, title: "Henley install", calendar: "work" },
      { day: 4, start: 19, end: 21, title: "Chess club", calendar: "personal" },
      { day: 5, start: 7, end: 16, title: "Shop", calendar: "work" },
    ],
    events: [
      { day: 0, at: 5.5, text: "read" },
      { day: 0, at: 9, text: "drive w/ June - lot" },
      { day: 1, at: 5.5, text: "read" },
      { day: 1, at: 8, text: "Henley doors", on: true },
      { day: 2, at: 5.5, text: "read" },
      { day: 2, at: 18, text: "sharpen chisels" },
      { day: 3, at: 9, text: "measure twice", on: true },
      { day: 4, at: 20, text: "Sicilian?", on: true },
      { day: 5, at: 17, text: "dinner w/ Ruth" },
      { day: 6, at: 9, text: "drive w/ June - roads!" },
      { day: 6, at: 14, text: "fix the gate" },
    ],
    banner: { text: "install", from: 0, to: 1 },
    lists: {
      "stoic-morning-page": ["my temper w/ June in the car", "the Henley install", "patience", "measure twice"],
      reading: ["Letters 13-20", "Meditations bk 4"],
      "stoic-evening-review": ["snapped at Eli re: dovetails", "kept my word to Ruth", "tomorrow: say sorry first"],
      commonplace: ["Ench. 1 - what is up to me", "Grandad: 'the wood tells you'", "Letters 13 - imagination > reality"],
    },
    tables: {
      "dichotomy-of-control": [
        ["how I answer Eli", "the van's gearbox"],
        ["measure twice", "the weather sat"],
      ],
    },
    trackerMark: "dot",
  },
  {
    key: "chronic-illness",
    archetype: "Chronic illness",
    name: "Noor",
    age: 33,
    about: "Lives with long COVID and works from home part-time. Pacing is the whole game. Crochets, and watches birds from the window.",
    week: "pacing",
    layout: {
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["energy-pain-scale", 8, { scaleMax: 5 }],
        ["labeled-box", 12, box("Pacing Plan", true)],
        ["labeled-box", 13, box("Small Wins", true)],
      ],
      belowLeft: [at("medication-log", 6, BELOW_ROW, 18, 6), at("symptom-tracker", 6, BELOW_ROW + 6, 18, 9)],
      belowRight: [
        at("energy-chart", 0, BELOW_ROW, 12, 8),
        at("spoon-count", 0, BELOW_ROW + 8, 12, 2),
        at("labeled-box", 0, BELOW_ROW + 10, 12, 5, box("Appointments", true)),
        at("labeled-box", 12, BELOW_ROW, 12, 15, box("Rest Menu", true)),
      ],
    },
    hand: {
      words: { font: "shadows", caps: false, scale: 1.3 },
      banner: { font: "grace", caps: false, scale: 1.25 },
      pen: ink("#4b3f72", 3.6),
      accent: ink("#3a7d44", 3.6),
      highlight: highlighter("#ffd6e0"),
    },
    doodles: { style: "retro", big: ["bird", "knitting", "tea", "houseplant", "reading"], small: ["heart", "leaf", "moon", "sparkle"] },
    calendar: [
      { day: 0, start: 10, end: 12, title: "Work (remote)", calendar: "work" },
      { day: 1, start: 11, end: 11.5, title: "GP", calendar: "health" },
      { day: 2, start: 10, end: 12, title: "Work (remote)", calendar: "work" },
      { day: 3, start: 9, end: 10, title: "Physio", calendar: "health" },
      { day: 4, start: 10, end: 12, title: "Work (remote)", calendar: "work" },
      { day: 6, start: 15, end: 17, title: "Amira visiting", calendar: "family" },
    ],
    events: [
      { day: 0, at: 11, text: "2h MAX", on: true },
      { day: 0, at: 15, text: "rest - lie down" },
      { day: 1, at: 16, text: "crochet + audiobook", doodle: "knitting" },
      { day: 2, at: 14, text: "~groceries" },
      { day: 2, at: 14.5, text: "-> delivery" },
      { day: 3, at: 9.5, text: "gentle!!", on: true },
      { day: 3, at: 20, text: "bath + bed" },
      { day: 5, at: 8, text: "window birds + tea", doodle: "bird" },
    ],
    banner: { text: "rest day", from: 3, to: 3 },
    lists: {
      "pacing plan": ["shower = sit on stool", "one big thing a day", "rest BEFORE tired", "no to Sat brunch"],
      // The spoons line is after one in the Gemini archetypes report.
      "small wins": ["crash day - did nothing, that counts", "4 spoons. shower took 3.", "walked to the corner", "sent the email"],
      appointments: ["GP tue 11", "physio thu 9", "bloods - book!!"],
      "rest menu": ["crochet the blanket", "audiobook - ch 7", "window birds", "warm bath", "call Amira"],
    },
    // Energy, pain, mood, sleep, out of five.
    ratings: { today: [2, 4, 2, 3] },
    charts: { energy: [3, 2, 4, 2] },
    strips: { spoons: [9, 7] },
  },
  {
    key: "faith-christian",
    archetype: "Faith (Christian)",
    name: "Grace",
    age: 41,
    about: "A bookkeeper and mother of two. Leads the women's Bible study on Wednesdays, sings alto, and bakes sourdough badly.",
    week: "leading Bible study",
    held: "Until someone of the faith has read it.",
    layout: {
      font: "serif",
      weekStartsMonday: false,
      sidebar: [
        ["prayer-list", 12],
        ["gratitude-three", 6],
        ["labeled-box", 15, box("Study Group Wed", true)],
      ],
      belowLeft: [at("soap-study", 6, BELOW_ROW, 18, 15)],
      belowRight: [
        at("sermon-notes", 0, BELOW_ROW, 12, 15),
        at("habit-tracker", 12, BELOW_ROW, 12, 8, { heading: "This Week" }),
        at("labeled-box", 12, BELOW_ROW + 8, 12, 7, box("Choir", true)),
      ],
    },
    hand: {
      words: { font: "grace", caps: false, scale: 1.2 },
      banner: { font: "homemade", caps: false, scale: 0.8 },
      pen: ink("#6a1b4d", 3.6),
      accent: ink("#2e7d32", 3.6),
      highlight: highlighter("#fff59d"),
    },
    doodles: { style: "minimal", big: ["baking", "singing", "sunflower", "books"], small: ["heart", "star", "sun", "sparkle"] },
    calendar: [
      { day: 0, start: 10, end: 11.5, title: "Church", calendar: "community" },
      { day: 0, start: 12.5, end: 14, title: "Potluck", calendar: "community" },
      { day: 1, start: 9, end: 17, title: "Office", calendar: "work" },
      { day: 2, start: 18, end: 19, title: "Zoe - soccer", calendar: "family" },
      { day: 3, start: 19, end: 20.5, title: "Bible study", calendar: "community" },
      { day: 4, start: 19.5, end: 21, title: "Choir", calendar: "community" },
    ],
    events: [
      { day: 0, at: 13, text: "bring bread", on: true, doodle: "baking" },
      { day: 1, at: 12, text: "month-end close", on: true },
      { day: 1, at: 19, text: "starter fed?" },
      { day: 2, at: 18.5, text: "snacks!", on: true },
      { day: 3, at: 19.5, text: "ch. 4 - mine!", on: true },
      { day: 5, at: 18, text: "bake for Sunday", doodle: "baking" },
      { day: 6, at: 10, text: "farmers mkt" },
      { day: 6, at: 15, text: "visit Mrs. Pell" },
    ],
    banner: { text: "study group", from: 0, to: 0 },
    lists: {
      "prayer-list": ["Mrs. Pell - hip", "Dad's tests", "Zoe's new school", "the Okafors", "patience (me)"],
      "gratitude-three": ["the sourdough rose!", "Zoe's laugh", "a quiet morning"],
      "study group wed": ["ch. 4 - read ahead", "bring tea + cups", "questions 1-6", "ask Dana to pray"],
      // Psalm 46:10, King James Version: public domain.
      "soap-study": ["Ps 46:10 - Be still, and know that I am God", "God is in charge - not me", "stop checking email 40x", "help me rest in You"],
      "sermon-notes": ["Pastor Mike - Matt 6:25-34", "worry adds nothing", "seek first", "1 worry -> 1 prayer"],
      choir: ["alto pt 2, bars 30-44", "learn the descant?"],
    },
    trackers: { "this week": ["read a chapter", "pray", "walk", "water", "call Mom"] },
  },
  {
    key: "faith-muslim",
    // Scales, waves and triangles in the Juz boxes, often run on across
    // two or three parts.
    fillFamily: "tiles",
    marks: { meter: "pattern" },
    archetype: "Faith (Muslim)",
    name: "Yusuf",
    age: 24,
    about: "An engineering grad student. Halaqa on Wednesdays, Jumu'ah on Friday, and Amira's nikah on Saturday.",
    week: "Amira's nikah",
    held: "Until someone of the faith has read it.",
    layout: {
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["weekly-priorities", 8],
        ["quran-reading-plan", 6],
        ["gratitude-three", 6],
        ["labeled-box", 13, box("Halaqa Notes", true)],
      ],
      belowLeft: [at("todo-checklist", 6, BELOW_ROW, 18, 15, { dayCount: 3 })],
      belowRight: [
        at("salah-tracker", 0, BELOW_ROW, 24, 9),
        at("labeled-box", 0, BELOW_ROW + 9, 12, 6, box("Thesis", true)),
        at("labeled-box", 12, BELOW_ROW + 9, 12, 6, box("Nikah Gifts", true)),
      ],
    },
    hand: {
      words: { font: "nanum", caps: false, scale: 1.55 },
      banner: { font: "marker", caps: true, scale: 1 },
      pen: ink("#0b5d63", 3.4),
      accent: ink("#b5651d", 3.6),
      highlight: highlighter("#c5f5c5"),
    },
    doodles: { style: "sketchnote", big: ["laptop", "books", "coffee", "moon"], small: ["star", "moon", "sparkle", "heart"] },
    calendar: [
      { day: 0, start: 10, end: 11, title: "Lab meeting", calendar: "school" },
      { day: 0, start: 14, end: 15, title: "TA section", calendar: "school" },
      { day: 2, start: 14, end: 15, title: "TA section", calendar: "school" },
      { day: 2, start: 19.5, end: 21, title: "Halaqa", calendar: "community" },
      { day: 3, start: 10, end: 10.5, title: "Advisor 1:1", calendar: "school" },
      { day: 4, start: 13, end: 14, title: "Jumu'ah", calendar: "community" },
      { day: 5, start: 15, end: 19, title: "Amira's nikah", calendar: "family" },
    ],
    events: [
      { day: 1, at: 9, until: 12, text: "sim runs", doodle: "laptop" },
      { day: 1, at: 19, text: "football w/ the guys", doodle: "football" },
      { day: 3, at: 9, text: "print slides!!" },
      { day: 3, at: 15, text: "write ch. 3" },
      { day: 4, at: 18, text: "pick up suit" },
      { day: 5, at: 16, text: "photos 4pm", on: true, mark: "highlight" },
      { day: 6, at: 11, text: "help Mama clean up" },
    ],
    banner: { text: "nikah", from: 2, to: 2 },
    lists: {
      "weekly-priorities": ["ch. 3 draft", "advisor slides", "suit from tailor", "call Nana"],
      "gratitude-three": ["Mama's soup", "the sim finally ran", "Amira, happy"],
      "halaqa notes": ["sabr - patience", "small deeds, consistently", "bring dates Wed"],
      "todo-checklist": ["fix plot axes", "lit review x3", "email Prof. Haddad", "renew lab key", "gift for Amira", "iron shirt", "book barber"],
      thesis: ["ch.3 - 2,100 / 6,000 words", "fig 4 redo", "ask about the conf"],
      "nikah gifts": ["Amira - frame?", "flowers for Khala", "card!!"],
    },
    fills: { "quran-reading-plan": 12 },
  },
  {
    key: "faith-jewish",
    archetype: "Faith (Jewish)",
    name: "Miriam",
    age: 63,
    about: "A retired librarian. Studies the week's portion, works on one middah at a time, and hosts Shabbat dinner for six.",
    week: "hosting Shabbat",
    held: "Until someone of the faith has read it.",
    layout: {
      font: "serif",
      weekStartsMonday: false,
      sidebar: [
        ["parashah-study", 11],
        ["mussar-trait", 6, { heading: "Patience" }],
        ["labeled-box", 16, box("Shabbat", true)],
      ],
      belowLeft: [at("todo-checklist", 6, BELOW_ROW, 18, 15, { dayCount: 3 })],
      belowRight: [
        at("grocery-list", 0, BELOW_ROW, 12, 15),
        at("labeled-box", 12, BELOW_ROW, 12, 8, box("Grandkids", true)),
        at("labeled-box", 12, BELOW_ROW + 8, 12, 7, box("Reading", true)),
      ],
    },
    // Joined script, as she was taught it.
    hand: {
      words: { font: "allure", caps: false, scale: 1.25 },
      banner: { font: "homemade", caps: false, scale: 0.8 },
      pen: ink("#1f3a5f", 3.2),
      accent: ink("#8e3b46", 3.4),
      highlight: highlighter("#fff3a0"),
    },
    doodles: { style: "pencil", big: ["books", "tulip", "tea", "bird"], small: ["star", "heart", "leaf", "sun"] },
    // Nothing on Saturday: no writing on Shabbat - only its name, lettered
    // across it in the days before.
    calendar: [
      { day: 0, start: 10, end: 11, title: "Torah study", calendar: "community" },
      { day: 1, start: 10, end: 13, title: "Library shift", calendar: "work" },
      { day: 2, start: 19, end: 21, title: "Book club", calendar: "personal" },
    ],
    events: [
      { day: 0, at: 14, text: "grandkids - zoo!" },
      { day: 2, at: 20, text: "Middlemarch ch 20-30", on: true },
      { day: 3, at: 11, text: "test the challah", doodle: "baking" },
      { day: 4, at: 10, text: "market - fish + flowers" },
      { day: 4, at: 15, text: "call Debbie" },
      { day: 5, at: 11, text: "bake challah", doodle: "baking" },
      { day: 5, at: 17.5, text: "candles 5:52", mark: "underline" },
    ],
    banner: { text: "Shabbat", from: 3, to: 3 },
    lists: {
      "parashah-study": ["read Sun + Thu", "the words 'very good'", "ask Rabbi R. about v.12"],
      shabbat: ["challah x2", "soup Thu night", "table for 6", "flowers", "invite the Levins"],
      "grocery-list": ["flour 5lb", "eggs", "chicken", "carrots", "dill", "wine", "flowers"],
      grandkids: ["zoo sun - snacks!", "Eli's recital 23rd", "puzzle for Noam"],
      reading: ["Middlemarch ch 20-30", "the new Ferrante?"],
      "todo-checklist": ["library: return x3", "call Debbie", "doctor - bloods", "fix the hinge", "card for Avi", "host book club?"],
    },
  },
  {
    key: "recovery",
    // A small kolam-like loop round the dots for each meeting, the way a
    // kolam is drawn each morning; the odd day missed.
    fillFamily: "kolam",
    marks: { meter: "pattern" },
    archetype: "Recovery",
    name: "Jen",
    age: 34,
    about: "A sous chef, 87 days sober and doing 90 meetings in 90 days. Runs before shifts. Found the sober karaoke night.",
    week: "90 days on Sunday",
    held: "Until someone in recovery has read it.",
    layout: {
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["recovery-gratitude-list", 10],
        ["step-ten-inventory", 14],
        ["labeled-box", 9, box("Phone List", true)],
      ],
      belowLeft: [
        at("meeting-log", 6, BELOW_ROW, 18, 9),
        at("ninety-in-ninety", 6, BELOW_ROW + 9, 18, 6),
      ],
      belowRight: [
        at("sponsor-contact-log", 0, BELOW_ROW, 12, 8),
        at("mood-chart-week", 0, BELOW_ROW + 8, 12, 7),
        at("habit-tracker", 12, BELOW_ROW, 12, 15, { heading: "Every Day" }),
      ],
    },
    hand: {
      words: { font: "marker", caps: false, scale: 0.95 },
      banner: { font: "marker", caps: true, scale: 1 },
      pen: ink("#233d4d", 3.6),
      accent: marker("#fe7f2d", 4.6),
      highlight: highlighter("#fcca46"),
    },
    doodles: { style: "crayon", big: ["running", "cafe", "singing", "sun"], small: ["sun", "star", "heart", "laurel"] },
    calendar: [
      { day: 0, start: 12, end: 13, title: "Noon meeting", calendar: "community" },
      { day: 0, start: 15, end: 23, title: "Kitchen", calendar: "work" },
      { day: 1, start: 19, end: 20, title: "Home group", calendar: "community" },
      { day: 2, start: 12, end: 13, title: "Noon meeting", calendar: "community" },
      { day: 3, start: 10, end: 11, title: "Therapy", calendar: "health" },
      { day: 3, start: 15, end: 23, title: "Kitchen", calendar: "work" },
      { day: 4, start: 12, end: 13, title: "Noon meeting", calendar: "community" },
      { day: 5, start: 8, end: 9, title: "Saturday morning meeting", calendar: "community" },
    ],
    events: [
      { day: 0, at: 6.5, text: "run 5k (slow. fine.)", doodle: "running" },
      { day: 1, at: 20.5, text: "coffee after w/ Dana", doodle: "cafe" },
      { day: 2, at: 16, text: "buy a real kettle" },
      { day: 4, at: 12.5, text: "speaker - Mo!", on: true },
      { day: 4, at: 20, text: "sober karaoke!!", doodle: "singing" },
      { day: 6, at: 9, text: "call Dana" },
    ],
    banner: { text: "90 days", from: 3, to: 3 },
    lists: {
      "recovery-gratitude-list": ["Dana picking up at 6am", "my own bed", "the new hot sauce", "Mom texted back", "87 days"],
      "step-ten-inventory": ["the new line cook - talk to him", "the 90 feels big", "honest w/ Dana re: Tues", "kind to myself today"],
      "phone list": ["Dana (sponsor)", "Mo", "Kit", "home group line"],
    },
    tables: {
      "meeting-log": [
        ["mon", "noon group", "open", ""],
        ["tue", "home group", "speaker", ""],
        ["wed", "noon group", "open", ""],
      ],
      "sponsor-contact-log": [
        ["mon", "yes", "yes", "the line cook thing"],
        ["wed", "yes", "vm", "--"],
        ["thu", "yes", "yes", "90 next wk!"],
      ],
    },
    trackers: { "every day": ["meeting", "call Dana", "quiet time", "run", "read 10 pgs", "bed by 1"] },
    // A dip on Tuesday, then steady.
    charts: { mood: [1, 3, 1, 1] },
    fills: { "90 in 90": 87 },
  },
];

export const PEOPLE_BY_KEY: Record<string, Person> = Object.fromEntries(PEOPLE.map((p) => [p.key, p]));
