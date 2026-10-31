// THE OTTER'S QUIZ: the questions, their answers and the route through them.
// Asked for 2026-10-19 ("an akinator style 20 question quiz with the post it
// note otter ... to build them a custom base planner"), drafted and agreed in
// the spec (https://claude.ai/artifact/5K2FinS9kJvhv7QmxP3cs9, draft 2).
//
// Data and the route only: no registry, no React. The start dialog asks the
// questions (planner/OtterQuiz.tsx); the server turns the answers into a
// planner (planner/otterPlanner.ts). What each answer PUTS IN the planner
// lives there, beside the layouts it changes; here is what is asked, in
// what words, and when.
//
// Every answer is a list of option ids (one for a single pick). A question
// that does not apply is never asked, and its answer, if an earlier route
// left one, is ignored - questionsFor is the one description of the route.

export type QuestionId =
  | "fills"
  | "follow"
  | "pages"
  | "hourly"
  | "rhythm"
  | "weekStart"
  | "dated"
  | "start"
  | "track"
  | "habitCount"
  | "money"
  | "todo"
  | "room"
  | "practice"
  | "practices"
  | "schedule"
  | "marks";

/** A weekly thing with a time: a class, a shift. Becomes a calendar event. */
export type ScheduleEntry = { title: string; days: number[]; from: string; to: string };

/** The little extra a few answers need. */
export type AnswerDetails = {
  /** "YYYY-MM-DD", for "Pick a date". */
  startDate?: string;
  schedule?: ScheduleEntry[];
  /** Weekdays, 0 Sunday. */
  trashDay?: number;
  recyclingDay?: number;
  recyclingEvery?: 1 | 2;
  paydayEvery?: "week" | "fortnight" | "month";
  /** A weekday for weekly or fortnightly pay; a date of the month for monthly. */
  paydayDay?: number;
  /** A date of the month. */
  billsDate?: number;
};

export type Answers = Partial<Record<QuestionId, string[]>> & { details?: AnswerDetails };

export type Option = {
  id: string;
  label: string;
  /** What it means for the planner, in a few words, under the label. */
  hint?: string;
  /** Picking it clears the others: "None", "Nothing, keep it clean". */
  only?: boolean;
};

export type Question = {
  id: QuestionId;
  /** Short, for the list of answers at the end. */
  title: string;
  /** What the otter says. */
  ask: (answers: Answers) => string;
  options: (answers: Answers) => Option[];
  /** Several may be picked, up to `max`; Continue moves on. */
  multi?: { max?: number };
  /** Can be skipped without an answer. */
  optional?: boolean;
  /** Whether it is asked, given the answers so far. */
  when?: (answers: Answers) => boolean;
  /** Picked before anyone touches it. */
  preset?: (answers: Answers) => string[];
};

/** The first answer to a question, or null. */
export const one = (answers: Answers, id: QuestionId): string | null => answers[id]?.[0] ?? null;
const has = (answers: Answers, id: QuestionId, option: string) => answers[id]?.includes(option) ?? false;

// ------------------------------------------------------------- question 2

/** The follow-up to "What fills most of your week?", worded for its answer. */
const FOLLOW_UPS: Record<string, { ask: string; options: Option[] }> = {
  school: {
    ask: "A student! Respect. What kind of school?",
    options: [
      { id: "high-school", label: "High school" },
      { id: "college", label: "College" },
      { id: "grad", label: "Grad school" },
      { id: "self", label: "Learning on my own" },
    ],
  },
  office: {
    ask: "Ah, the desk life. What eats most of your workday?",
    options: [
      { id: "meetings", label: "Meetings" },
      { id: "deep", label: "Deep work" },
      { id: "tasks", label: "Lots of small tasks" },
      { id: "people", label: "Managing people" },
    ],
  },
  shifts: {
    ask: "Shift work is no joke. Do you work nights?",
    options: [
      { id: "nights", label: "Yes, often" },
      { id: "sometimes", label: "Sometimes" },
      { id: "days", label: "No, days" },
    ],
  },
  teaching: {
    ask: "A teacher! Who do you teach?",
    options: [
      { id: "little", label: "Little kids" },
      { id: "middle", label: "Middle school" },
      { id: "high", label: "High school" },
      { id: "college", label: "College" },
    ],
  },
  business: {
    ask: "Your own thing, nice. What do you sell?",
    options: [
      { id: "things", label: "Things I make" },
      { id: "service", label: "A service" },
      { id: "content", label: "Content online" },
    ],
  },
  home: {
    ask: "Running a home is a job too. Any kids at home?",
    options: [
      { id: "none", label: "None, home and pets" },
      { id: "one", label: "One" },
      { id: "few", label: "Two or three" },
      { id: "many", label: "Four or more" },
    ],
  },
  training: {
    ask: "Ooh, training. For what?",
    options: [
      { id: "running", label: "Running" },
      { id: "lifting", label: "Lifting" },
      { id: "yoga", label: "Yoga or mobility" },
      { id: "mix", label: "A sport or a mix" },
    ],
  },
  health: {
    ask: "Let's make this easier on you. What helps most to keep track of?",
    options: [
      { id: "symptoms", label: "Symptoms" },
      { id: "medication", label: "Medication" },
      { id: "energy", label: "Energy (spoons)" },
      { id: "appointments", label: "Appointments" },
    ],
  },
  everything: {
    ask: "Fair enough, life is a lot. What's the main thing right now?",
    options: [
      { id: "organized", label: "Get organized" },
      { id: "habits", label: "Build habits" },
      { id: "money", label: "Save money" },
      { id: "calmer", label: "Feel calmer" },
    ],
  },
};

const PRACTICES: Record<string, Option[]> = {
  christian: [
    { id: "examen", label: "Examen" },
    { id: "soap-study", label: "SOAP Study" },
    { id: "verse-mapping", label: "Verse Mapping" },
    { id: "prayer-list", label: "Prayer List" },
    { id: "sermon-notes", label: "Sermon Notes" },
    { id: "lectio-divina", label: "Lectio Divina" },
  ],
  muslim: [
    { id: "salah-tracker", label: "Salah Tracker" },
    { id: "quran-reading-plan", label: "Quran Reading Plan" },
    { id: "dhikr-counter", label: "Dhikr Counter" },
  ],
  jewish: [
    { id: "parashah-study", label: "Parashah Study" },
    { id: "mussar-trait", label: "Mussar Trait" },
  ],
  buddhist: [
    { id: "metta-practice", label: "Metta Practice" },
    { id: "meditation-minutes", label: "Meditation Days" },
  ],
  stoic: [
    { id: "stoic-morning-page", label: "Stoic Morning Page" },
    { id: "stoic-evening-review", label: "Stoic Evening Review" },
    { id: "dichotomy-of-control", label: "Dichotomy of Control" },
    { id: "memento-mori", label: "Memento Mori" },
    { id: "tao-daily-verse", label: "Tao Reflection" },
    { id: "wu-wei-reflection", label: "Wu Wei Reflection" },
  ],
  recovery: [
    { id: "step-ten-inventory", label: "Step Ten Inventory" },
    { id: "recovery-gratitude-list", label: "Gratitude List" },
    { id: "meeting-log", label: "Meeting Log" },
    { id: "sponsor-contact-log", label: "Sponsor Contact Log" },
    { id: "ninety-in-ninety", label: "90 in 90" },
    { id: "halt-check-in", label: "HALT Check-in" },
  ],
};

// ------------------------------------------------------------- the questions

export const QUESTIONS: Question[] = [
  {
    id: "fills",
    title: "What fills your week",
    ask: () => "Hi there! Let's build your planner. What fills most of your week?",
    options: () => [
      { id: "school", label: "School" },
      { id: "office", label: "An office or desk job" },
      { id: "shifts", label: "Shifts", hint: "Nursing, retail, hospitality" },
      { id: "teaching", label: "Teaching" },
      { id: "business", label: "My own business or craft" },
      { id: "home", label: "Kids and home" },
      { id: "training", label: "Training for something" },
      { id: "health", label: "Managing my health" },
      { id: "everything", label: "A bit of everything" },
    ],
  },
  {
    id: "follow",
    title: "More about that",
    ask: (a) => FOLLOW_UPS[one(a, "fills") ?? "everything"]?.ask ?? FOLLOW_UPS.everything.ask,
    options: (a) => FOLLOW_UPS[one(a, "fills") ?? "everything"]?.options ?? FOLLOW_UPS.everything.options,
  },
  {
    id: "pages",
    title: "Which pages",
    ask: () => "How do you like to see your time? Pick any. Daily pages make the book much thicker, so it costs more to print.",
    multi: {},
    preset: () => ["week"],
    options: () => [
      { id: "month", label: "A month at a glance" },
      { id: "week", label: "A week at a glance" },
      { id: "day", label: "A page for every day" },
    ],
  },
  {
    id: "hourly",
    title: "By the hour",
    ask: () => "Do you plan your day hour by hour?",
    when: (a) => has(a, "pages", "week") || has(a, "pages", "day"),
    options: () => [
      { id: "half", label: "Yes, every half hour" },
      { id: "hour", label: "Yes, by the hour" },
      { id: "lists", label: "No, I just make lists", hint: "The days become dotted space to write in" },
    ],
  },
  {
    id: "rhythm",
    title: "When your day runs",
    ask: () => "When does your day usually run?",
    when: (a) => (has(a, "pages", "week") || has(a, "pages", "day")) && (one(a, "hourly") === "half" || one(a, "hourly") === "hour"),
    options: (a) => [
      { id: "early", label: "Early bird", hint: "5 AM to 9 PM" },
      { id: "day", label: "Daytime", hint: "7 AM to 11 PM" },
      { id: "owl", label: "Night owl", hint: "10 AM to 2 AM" },
      ...(one(a, "fills") === "shifts" ? [{ id: "nights", label: "Nights", hint: "7 PM to 7 AM" }] : []),
    ],
  },
  {
    id: "weekStart",
    title: "First day of the week",
    ask: () => "Does your week start on Monday or Sunday?",
    options: () => [
      { id: "monday", label: "Monday" },
      { id: "sunday", label: "Sunday" },
    ],
  },
  {
    id: "dated",
    title: "Dates",
    ask: () => "Should I put the dates in for you, or leave them blank?",
    options: () => [
      { id: "dated", label: "Put the dates in" },
      { id: "undated", label: "Leave them blank", hint: "Fill in the dates yourself" },
    ],
  },
  {
    id: "start",
    title: "Starting",
    ask: () => "When do you want to start?",
    when: (a) => one(a, "dated") !== "undated",
    options: () => [
      { id: "this-week", label: "This week" },
      { id: "next-week", label: "Next week" },
      { id: "next-month", label: "The 1st of next month" },
      { id: "pick", label: "Pick a date" },
    ],
  },
  {
    id: "track",
    title: "Keeping an eye on",
    ask: () => "What do you want to keep an eye on? Pick up to four. Pages only hold so much!",
    multi: { max: 4 },
    optional: true,
    options: () => [
      { id: "habits", label: "Habits" },
      { id: "sleep", label: "Sleep" },
      { id: "mood", label: "Mood" },
      { id: "water", label: "Water" },
      { id: "workouts", label: "Workouts" },
      { id: "money", label: "Money" },
      { id: "meals", label: "Meals" },
      { id: "period", label: "My period" },
      { id: "reading", label: "Reading" },
    ],
  },
  {
    id: "habitCount",
    title: "How many habits",
    ask: () => "How many habits are we tracking?",
    when: (a) => has(a, "track", "habits"),
    options: () => [
      { id: "few", label: "1 to 3" },
      { id: "some", label: "4 to 6" },
      { id: "many", label: "7 or more" },
    ],
  },
  {
    id: "money",
    title: "How money comes in",
    ask: () => "How does money come in for you?",
    when: (a) => has(a, "track", "money"),
    options: () => [
      { id: "steady", label: "A steady paycheck" },
      { id: "varies", label: "It varies", hint: "Freelance, tips, gigs" },
      { id: "saving", label: "I'm saving or paying off debt" },
    ],
  },
  {
    id: "todo",
    title: "Your to-do list",
    ask: () => "How do you like your to-do list?",
    options: () => [
      { id: "list", label: "One long list" },
      { id: "three", label: "Just my top three" },
      { id: "dump", label: "Dump it all, sort it later" },
      { id: "adhd", label: "My brain is busy", hint: "ADHD or similar" },
    ],
  },
  {
    id: "room",
    title: "Room for",
    ask: () => "What else do you want room for? Pick up to two.",
    multi: { max: 2 },
    optional: true,
    options: () => [
      { id: "gratitude", label: "Gratitude" },
      { id: "reflection", label: "A look back each week" },
      { id: "goals", label: "Goals" },
      { id: "notes", label: "Notes" },
      { id: "doodles", label: "Doodles" },
      { id: "nothing", label: "Nothing, keep it clean", only: true },
    ],
  },
  {
    id: "practice",
    title: "A practice",
    ask: () => "Totally optional: do you keep a faith, philosophy or recovery practice?",
    optional: true,
    options: () => [
      { id: "no", label: "No" },
      { id: "christian", label: "Christian" },
      { id: "muslim", label: "Muslim" },
      { id: "jewish", label: "Jewish" },
      { id: "buddhist", label: "Buddhist or meditation" },
      { id: "stoic", label: "Stoic or Taoist" },
      { id: "recovery", label: "Recovery (12 steps)" },
      { id: "private", label: "I'd rather not say" },
    ],
  },
  {
    id: "practices",
    title: "Which practices",
    ask: () => "Which of these would you use? Pick any.",
    multi: {},
    optional: true,
    when: (a) => Boolean(PRACTICES[one(a, "practice") ?? ""]),
    options: (a) => PRACTICES[one(a, "practice") ?? ""] ?? [],
  },
  {
    id: "schedule",
    title: "Regular schedule",
    ask: () => "Anything at the same time every week, like classes, shifts or practice? I can put them in your calendar.",
    optional: true,
    when: (a) => one(a, "dated") !== "undated",
    options: () => [
      { id: "add", label: "Yes, add them now" },
      { id: "later", label: "Later" },
    ],
  },
  {
    id: "marks",
    title: "Days to mark",
    ask: () => "Any days that need a little reminder icon? Trash day, payday?",
    multi: {},
    optional: true,
    when: (a) => one(a, "dated") !== "undated",
    options: () => [
      { id: "trash", label: "Trash day" },
      { id: "recycling", label: "Recycling" },
      { id: "payday", label: "Payday" },
      { id: "bills", label: "Bills due" },
      { id: "none", label: "None", only: true },
    ],
  },
];

export const QUESTION_BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q])) as Record<QuestionId, Question>;

/** The questions asked, in order, given the answers so far: the route. */
export function questionsFor(answers: Answers): Question[] {
  return QUESTIONS.filter((q) => !q.when || q.when(answers));
}

/** The answers with anything the route no longer asks taken out, and
 *  options a question no longer offers dropped - what the planner is made
 *  from. */
export function routedAnswers(answers: Answers): Answers {
  const out: Answers = { details: answers.details };
  for (const q of QUESTIONS) {
    if (q.when && !q.when(out)) continue;
    const options = q.options(out);
    const offered = new Set(options.map((o) => o.id));
    const alone = new Set(options.filter((o) => o.only).map((o) => o.id));
    let picked = (answers[q.id] ?? []).filter((id) => offered.has(id));
    // "Nothing, keep it clean" and "None" stand alone: the quiz clears them
    // when something else is picked (OtterQuiz.tsx). So beside other picks
    // the other picks count, as they would have on screen.
    if (picked.some((id) => !alone.has(id))) picked = picked.filter((id) => !alone.has(id));
    if (picked.length > 0) out[q.id] = q.multi?.max ? picked.slice(0, q.multi.max) : q.multi ? picked : picked.slice(0, 1);
  }
  return out;
}

// ------------------------------------------------------------- the guess

const NOUNS: Record<string, Record<string, string> & { _: string }> = {
  school: { _: "student", "high-school": "high school student", college: "college student", grad: "grad student", self: "self-taught learner" },
  office: { _: "desk worker", meetings: "desk worker with a lot of meetings", deep: "deep worker", tasks: "desk worker with lots of small tasks", people: "manager" },
  shifts: { _: "shift worker" },
  teaching: { _: "teacher", college: "professor" },
  business: { _: "small business owner", things: "maker", service: "freelancer", content: "creator" },
  home: { _: "parent", none: "homebody" },
  training: { _: "athlete", running: "runner", lifting: "lifter", yoga: "yogi" },
  health: { _: "person looking after their health" },
  everything: { _: "person juggling a bit of everything" },
};
const RHYTHM: Record<string, string> = { early: "early-bird", owl: "night-owl", nights: "night-shift" };
const TRACKED: Record<string, string> = { habits: "habits", sleep: "sleep", mood: "mood", water: "water", workouts: "workouts", money: "money", meals: "meals", period: "their cycle", reading: "reading" };

/** "I think you're a night-owl college student who tracks sleep and money." */
export function guessLine(input: Answers): string {
  const answers = routedAnswers(input);
  const fills = one(answers, "fills");
  if (!fills) return "Here's your planner!";
  const nouns = NOUNS[fills] ?? NOUNS.everything;
  // Night shifts are the noun, not "a night-shift shift worker"; and a noun
  // that starts with a word like it already ("self-taught learner") takes
  // no second one.
  const nights = fills === "shifts" && one(answers, "rhythm") === "nights";
  const noun = nights ? "night-shift worker" : (nouns[one(answers, "follow") ?? ""] ?? nouns._);
  const rhythm = nights || /^\S+-\S+ /.test(noun) ? undefined : RHYTHM[one(answers, "rhythm") ?? ""];
  const words = rhythm ? `${rhythm} ${noun}` : noun;
  const article = /^[aeiou]/i.test(words) ? "an" : "a";
  const tracked = (answers.track ?? []).map((t) => TRACKED[t]).filter(Boolean).slice(0, 2);
  const tracks = tracked.length === 0 ? "" : ` who tracks ${tracked.join(" and ")}`;
  return `I think you're ${article} ${words}${tracks}. Here's your planner!`;
}

// ------------------------------------------------------------- reactions

/** What the otter says back to some answers, before the next question.
 *  Keyed "question:option". A first draft in a light voice. */
export const REACTIONS: Record<string, string> = {
  "rhythm:owl": "A night owl! Otters are up at dusk too.",
  "rhythm:early": "An early bird. I'll start your hours at five.",
  "rhythm:nights": "Nights. Your day runs from 7 in the evening to 7 the next morning, the hours after midnight marked +1.",
  "pages:day": "Daily pages! A whole page for every day.",
  "hourly:lists": "Lists it is. Your days will be open dots to write on.",
  "dated:undated": "Undated, so you can start any day you like.",
  "track:water": "Water. Otters approve.",
  "todo:adhd": "Got it. I'll keep things loose and kind.",
  "practice:private": "No problem at all.",
  "room:nothing": "Clean and simple. My favourite.",
};

/** The reaction to an answer, if there is one. */
export function reactionTo(id: QuestionId, picked: string[] | undefined): string | null {
  for (const option of picked ?? []) {
    const line = REACTIONS[`${id}:${option}`];
    if (line) return line;
  }
  return null;
}
