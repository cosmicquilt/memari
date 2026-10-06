// WHAT EACH MODULE IS FOR, in two or three plain sentences: shown in the
// palette's browser, and the opening of the module's own page at
// memari.studio/modules/<slug> where it has one. One text, so the two never
// disagree. Keyed by slug, like everything else about a module.
//
// The rules (moduleDescriptions.test.mts holds them):
//   - Say what the page is for and how to use it. Where a practice has a
//     tradition or an author, name it, accurately: the Examen's five steps
//     are Ignatius's, SOAP is Wayne Cordeiro's. Nothing here is quoted;
//     a quotation needs its public-domain source in front of you, never
//     memory (see the quote rules in moduleCatalogue.ts).
//   - Plain words. None of the vocabulary that marks machine-written text
//     (delve, tapestry, crucial...), no "Ultimately" closers, no dashes for
//     asides. The research behind this is in the Gemini report of
//     2026-10-05; it found readers, not detectors, are who to write for.
//   - American spelling: Memari sells in the US first.
//
// Facts checked when written, 2026-10-05: Tao Te Ching 81 chapters, Legge
// 1891 public domain; Meditations 2.1; Seneca On Anger 3.36; Epictetus
// Discourses 3.10 and Enchiridion 1; Spiritual Exercises 43; Guigo II, The
// Ladder of Monks (c. 1150); Cordeiro, The Divine Mentor (2007); Lefin,
// Cheshbon HaNefesh (1812); Lakein (1973); Doran (1981); Seligman et al.
// (2005); Franklin to Priestley (1772); Ivy Lee (c. 1918); Eisenhower
// (1954); 30 juz'; 49 days of the Omer from the second night of Passover;
// 54 Torah portions; dhikr 33 each; the Big Book's four defects (Step Ten)
// and resentment inventory columns (Step Four).

export const MODULE_DESCRIPTIONS: Record<string, string> = {
  // ── Basics ────────────────────────────────────────────────────────────
  "labeled-box": "A box with a heading, for anything. Leave it blank, or rule it with lines, dots or a grid.",
  "todo-checklist": "Rows with a box to tick. Placed across several days, it becomes one list per day.",
  "habit-tracker": "Name a habit on each row and tick it off across the days of your page.",
  "column-table": "A table with columns you name, such as Date, Item and Amount. Drag the column edges to set their widths.",
  "prompted-lines": "Questions with lines to answer them on. Write your own prompts, or start from one of the presets.",
  "mini-month": "A small calendar of one month, for marking days at a glance.",
  "progress-meter": "A row of marks to fill in as you go, such as days of a challenge or money saved. Set how many marks there are and how often a milestone falls.",
  "icon-strip": "A small row of icons for each day, filled in one at a time: droplets for glasses of water, or flames for blocks of focused work.",
  "rating-strip": "Rate a few things each day on a scale, such as mood or energy from 1 to 5, by filling in a circle.",
  "day-chart": "Plot one measure across the days, such as mood or bedtime. The scale can be faces, lightning bolts, moons or your own words.",
  "axis-matrix": "Four boxes on two axes you name, for sorting anything two ways at once, such as urgent against important.",
  "text-block": "Text you set once, printed on every page it repeats on, such as a passage or a rule to keep in view.",
  "quote-block": "A quotation and its author, set between rules.",
  "month-tracker": "A whole month on one page: a row for each day, and a column for each habit you want to keep, such as no spending or an early night.",

  // ── Planning ──────────────────────────────────────────────────────────
  "brain-dump": "An open box to empty your head into before you plan. Get everything down first, then sort it into lists.",
  "weekly-priorities": "A short numbered list of what matters most this week, written before the week fills up.",
  "assignment-tracker": "Each assignment with its class and the day it is due, and a box to tick when it is handed in.",
  "done-list": "A ruled list of what you finished, written down as you finish it. A record of what the day did hold, for the days a to-do list makes it look like nothing happened.",
  "one-on-one-agenda": "Notes to bring to a meeting with your manager: what went well, what is in your way, and what you need from them.",
  "lesson-planner": "Each period with its topic and the materials it needs, set out for a teaching week.",
  "grading-tracker": "Assignments waiting to be graded, by class, with the day each goes back to students and a box to tick when it is done.",
  "order-tracker": "Each order with what was bought and the day it has to ship, ticked once it is sent. For a small shop run alongside everything else.",
  "content-plan": "What to post on which day, with a box to tick once it is out.",
  "pto-meter": "Your paid time off, one cell for each day you take, with a mark every five. It starts at twenty days; change the total to match your allowance.",
  "exam-countdown": "The thirty days before an exam, one cell to cross off each day, ending on exam day.",
  "time-blocking-column": "Split each day into morning, midday, afternoon and evening, and decide what each part is for.",
  "monthly-review": "Three questions at the end of each month: what worked, what did not, and what changes next month.",
  "future-log-months": "The Bullet Journal's future log: six months with a few lines each, for events and deadlines too far ahead for this week's pages.",
  "project-tracker": "One row per project, with its next action, due date and status, so nothing stalls unnoticed.",
  "someday-maybe": "Ideas and projects you are not doing yet but do not want to lose. The Someday/Maybe list comes from David Allen's Getting Things Done.",
  "waiting-on": "What you are waiting for from other people: who, what, and since when. Getting Things Done calls this the Waiting For list.",
  "daily-big-three": "The three tasks that would make today a good day if they got done, numbered so the first comes first.",
  "ivy-lee-six": "At the end of each day, write the six most important tasks for tomorrow in order, then work down the list. Anything unfinished moves to the next day's six. The method is credited to Ivy Lee, around 1918.",
  "eisenhower-matrix": "Sort the week's tasks by urgency and importance: do what is urgent and vital, schedule what is vital, delegate what is urgent, and drop the rest. Named for a 1954 remark of Eisenhower's, and made popular by Stephen Covey.",
  "abc-priority-list": "Mark each task A, B or C by how much it is worth doing, then work through the A's first. The method is Alan Lakein's, from How to Get Control of Your Time and Your Life (1973).",
  "index": "The Bullet Journal's index: topics and the pages they are on, so you can find things again.",
  "week-day-boxes": "A box for each day of the week, Monday to Sunday, for the week's plans in one place.",
  "password-log": "Sites and usernames, with a hint for each password. Write the hint, not the password.",

  // ── Mood & health ─────────────────────────────────────────────────────
  "mood-tracker": "Rate your mood each day of the week on a five-step scale, by filling in a circle.",
  "dopamine-menu": "A menu of things that lift your mood, by size: quick starters, bigger mains, and desserts to save for a treat. Something to choose from instead of scrolling.",
  "mood-chart-week": "Mark your mood each day of the week on a scale of five faces, and the week's ups and downs are there to see.",
  "mood-chart-month": "The five-face mood chart across a whole month, for patterns a single week hides.",
  "energy-chart": "Mark your energy each day of the week, from three lightning bolts down to an empty one.",
  "sleep-chart": "Mark when you went to bed each night, from 9 PM to 2 AM. The moon fills as the hour gets later.",
  "year-in-pixels": "One square for every day of the year, twelve months across and 31 days down. Color each day by mood, or anything else you track, and the year becomes one picture.",
  "sleep-log": "Each night in one row: when you went to bed, when you woke, the hours, and how well you slept.",
  "medication-log": "Tick off each dose, morning, midday, evening and night, across the days of your page.",
  "symptom-tracker": "Note which symptoms showed up each day, such as pain, fatigue or headaches, to spot patterns or take to an appointment.",
  "period-tracker": "A month calendar to ring the days of your period, so the length of your cycle is easy to see.",
  "measurements": "Weight, chest, waist and hips, a row per date, to watch change over months rather than days.",
  "self-care-checklist": "Six small things that keep you well, ticked off each day: moving, getting outside, eating well, sleep, reaching out and rest.",
  "energy-pain-scale": "Rate energy, pain, mood and sleep from 1 to 10 each day, by filling in a circle.",
  "water-week": "Eight droplets for each day of the week. Fill one in for every glass of water.",
  "spoon-count": "Twelve spoons a day to cross off as your energy goes, from Christine Miserandino's spoon theory: a way to count the limited energy a chronic illness leaves for each day.",
  "pill-tracker": "A pill for each dose, three a day, to tick as you take them.",

  // ── Food ──────────────────────────────────────────────────────────────
  "meal-planner": "Breakfast, lunch, dinner and a snack for each day of the week. Plan it before you shop and the grocery list mostly writes itself.",
  "grocery-list": "A checklist for the week's shopping. Write it from your meal plan and tick things off in the store.",
  "macro-log": "Each meal's calories, protein, carbs and fat, with a total row at the bottom.",
  "food-diary": "What you ate and how you felt after. Writing both is a simple way to notice which foods suit you.",
  "recipe-card": "Ingredients and method for a recipe worth keeping, on lines sized for each.",
  "recipes-to-try": "A checklist of dishes you want to cook, ticked off as you try them.",
  "restaurant-log": "Places you ate, what you ordered, and whether you would go back.",
  "in-season-produce": "A line for each month, to note what is in season where you live.",

  // ── Fitness ───────────────────────────────────────────────────────────
  "workout-log": "Each exercise with its sets, reps and weight, so the next session can build on this one.",
  "weekly-workout-plan": "Plan the week's training by type, such as push, pull, legs and cardio, and tick each day off as you do it.",
  "step-counter": "A mark for each day of the month, filled in when you reach your step goal, with every seventh day marked.",
  "run-log": "Each run's date, distance, time and pace, and how it felt.",
  "progressive-overload": "Your main lifts across four weeks, so you can add a little weight or a rep each week and watch it climb.",
  "stretch-routine": "A checklist of stretches from neck to calves, to work through in order.",
  "rest-day-marker": "Mark rest days, active rest and nights with eight hours of sleep, so recovery gets planned like training.",
  "season-days": "Days out in a surf or ski season, one cell for each, with a mark every ten.",
  "yoga-days": "A lotus for each day, filled in on the days you practice yoga.",

  // ── Money ─────────────────────────────────────────────────────────────
  "spending-log": "Every purchase with its date, category and cost, totaled at the bottom.",
  "budget": "Planned against actual for each category, with the difference and a total.",
  "savings-goal": "A bar from nothing to your goal, marked in tenths, to fill in as the savings grow.",
  "debt-payoff": "A bar from what you owe to paid off, marked in tenths, to fill in with each payment.",
  "bill-tracker": "Your regular bills down the side and the twelve months across. Tick each one when it is paid.",
  "no-spend-challenge": "A month calendar to mark every day you spend nothing beyond the essentials.",
  "subscription-audit": "Every subscription with its cost and renewal date, and whether it is worth keeping.",
  "zero-based-budget": "Assign all of your income to something, line by line, until the Remaining row reaches zero.",

  // ── Home & family ─────────────────────────────────────────────────────
  "cleaning-rota": "Rooms and jobs down the side and the days across, to share out the cleaning and see what is done.",
  "chore-chart": "Chores down the side and the people who do them across, so everyone can see their jobs.",
  "home-maintenance": "Jobs that come around every few months, such as filters or gutters, with when each was last done and when it is next due.",
  "kids-said": "A ruled box for the funny and strange things the children say, written down before they are forgotten.",
  "plant-care": "Your plants down the side and the days across. Tick each one when you water or feed it.",
  "birthday-calendar": "A line for each month, to write the birthdays that fall in it.",
  "gift-log": "Gift ideas for each person, with a budget and a box to tick once it is bought.",
  "pet-care": "Feeding, walks, medication and water for each day, so everyone in the house knows what is done.",
  "water-plants": "Four plant icons for each day, filled in as you water, so nothing is watered twice or forgotten.",
  "starter-feedings": "Two jars a day to tick as you feed a sourdough starter, so a missed feeding shows up on the page before it shows in the jar.",

  // ── Philosophy & faith ────────────────────────────────────────────────
  "stoic-morning-page": "Three questions for the start of the day: what is in your control, what obstacle to expect, and which virtue you will need. Marcus Aurelius opens Book 2 of the Meditations by preparing himself for the difficult people he will meet that day.",
  "stoic-evening-review": "The nightly review Seneca describes in On Anger, with three questions adapted from the Pythagorean verses Epictetus quotes in Discourses 3.10.",
  "dichotomy-of-control": "Two columns, for what is up to you and what is not. Epictetus opens the Enchiridion with this division.",
  "memento-mori": "Fifty-two circles, one for each week of the year, filled in as the weeks pass. Seneca and Marcus Aurelius both wrote about keeping death in mind so that time is spent well.",
  "negative-visualisation": "Picture losing something you value, then how you would meet that loss. Seneca recommends this rehearsal, the premeditatio malorum, so that misfortune is never wholly unexpected and what you have is valued now.",
  "tao-daily-verse": "Copy out one chapter of the Tao Te Ching, then write what it says plainly and what it says underneath. There are 81 short chapters, so a chapter a day takes under three months. James Legge's 1891 translation is free to use.",
  "wu-wei-reflection": "Wu wei, usually translated as non-action or effortless action, is the Tao Te Ching's idea of acting without forcing. Once a week, write where you pushed against something and what yielding would have looked like.",
  "metta-practice": "Loving-kindness meditation, moving outward one person at a time: yourself, someone you love, someone neutral, someone difficult, then all beings. One line each for what you wished them.",
  "meditation-minutes": "A mark for each day of the month you sat to meditate, with every seventh day marked.",
  "examen": "The daily examen of St. Ignatius of Loyola, in its five traditional steps: give thanks, ask for light, review the day, ask forgiveness, resolve for tomorrow. Usually prayed at night, in ten to fifteen minutes.",
  "lectio-divina": "The monastic way of reading scripture slowly, in four steps: read, reflect, respond, rest. Guigo II set them out in the twelfth century in The Ladder of Monks.",
  "soap-study": "Scripture, Observation, Application, Prayer: copy out a passage, note what it says and how it applies to you, then respond in prayer. Pastor Wayne Cordeiro set out the method in The Divine Mentor (2007).",
  "verse-mapping": "Take one verse apart: write it out, compare other translations, follow its cross references, and note what it asks of you.",
  "prayer-list": "A list of people and needs to pray for this week, with a box beside each.",
  "sermon-notes": "The speaker and passage, the main points, and how to apply them, on lines sized for each.",
  "salah-tracker": "A week of the five daily prayers, Fajr, Dhuhr, Asr, Maghrib and Isha, with a box for each prayer on each day.",
  "ramadan-log": "All thirty days of Ramadan, with columns for the fast, taraweeh, Quran reading, sadaqah and dhikr.",
  "quran-reading-plan": "Thirty marks, one for each juz'. The Quran is divided into thirty parts, so a part a day completes it in a month, as many do in Ramadan.",
  "dhikr-counter": "Thirty-three circles to fill in for a round of dhikr. After each prayer many say SubhanAllah, Alhamdulillah and Allahu Akbar thirty-three times each.",
  "mussar-trait": "Mussar works on one middah, a trait such as patience or humility, for a week or more at a time. Write the trait in the heading and mark the days you noticed it, practiced it and reflected on it. Menachem Mendel Lefin's Cheshbon HaNefesh (1812) works through thirteen traits this way.",
  "omer-counter": "Forty-nine marks for the Counting of the Omer, the seven weeks from the second night of Passover to Shavuot, counted each evening.",
  "parashah-study": "The week's Torah portion, what stood out, and what it asks of you. The Torah is read through in fifty-four portions over the year.",

  // ── Growth ────────────────────────────────────────────────────────────
  "gratitude-three": "Three good things from today, numbered. Writing them down each night is an exercise Martin Seligman's team tested in 2005.",
  "daily-affirmation": "One prompt, Today I am, with room to finish the sentence in your own words.",
  "thirty-day-challenge": "Thirty numbered days to fill in one at a time, for a habit you want to try for a month.",
  "ninety-day-sprint": "Ninety days marked in tens, for a goal that needs a quarter of a year.",
  "franklin-virtues": "Benjamin Franklin's thirteen virtues, Temperance to Humility, charted as he kept them in his Autobiography: a line for each virtue, a column for each day, and a spot for every fault. He gave each week to one virtue, so one course takes thirteen weeks.",
  "smart-goal": "Write one goal five ways: specific, measurable, achievable, relevant and time-bound. George T. Doran published the SMART acronym in 1981.",
  "values-list": "A numbered list of what matters most to you, to check decisions against.",
  "habit-stacking": "Two columns, After I and I will, to tie each new habit to one you already do.",
  "weekly-reflection": "Three questions to close the week: what went well, what did not, and what comes next.",
  "lessons-learned": "A bulleted box for what the month taught you, so it is not learned twice.",
  "comfort-zone-challenge": "One thing a month that scares you a little, with a box to tick when it is done.",
  "focus-blocks": "Ten flames for the day. Fill one in for each block of focused work, such as the Pomodoro Technique's 25 minutes.",
  "pros-and-cons": "For and against, side by side. Benjamin Franklin described this way of deciding in a 1772 letter to Joseph Priestley.",

  // ── Hobbies & learning ────────────────────────────────────────────────
  "books-read": "Every book you finish, with its author, your rating and when you finished it, numbered through the year.",
  "reading-progress": "Twenty-four marks for a year of reading, two books a month, with every sixth marked.",
  "watchlist": "Films and shows to watch, ticked off as you see them.",
  "listening-log": "Albums you listened to this month, with the artist and your rating, numbered.",
  "sketch-box": "A box ruled with a fine grid, for sketches and diagrams.",
  "writing-prompt": "A prompt and room to follow it, five lines each, for a few minutes of writing a day.",
  "language-study": "New words with their meanings, and a sentence of your own that uses each one.",
  "skill-practice": "A practice session split into warm-up, technique, repertoire and free play, ticked off each day.",
  "climbing-log": "Each climbing session with where you went, the problem or route, its grade, and whether you sent it.",
  "song-list": "Songs you sing or want to try, with the artist and how it went. Made for karaoke night.",
  "trick-list": "Tricks you are learning, with a tick when you first land one and another when you land it clean.",
  "yoga-log": "Each yoga class with its teacher and how you felt afterward.",
  "commonplace-book": "Passages worth keeping, each with where it came from and a thought of your own. The old habit of the commonplace book, a page at a time.",

  // ── Recovery ──────────────────────────────────────────────────────────
  "step-ten-inventory": "A daily check on the four things the Big Book asks you to watch for in the Tenth Step: resentment, selfishness, dishonesty and fear.",
  "step-four-inventory": "The resentment inventory of the Fourth Step: who you resent, the cause, what it affects in you, and your own part.",
  "recovery-gratitude-list": "A short list of what you are grateful for today, a practice many in recovery keep daily.",
  "sponsor-contact-log": "Each contact with your sponsor: the date, whether you called and spoke, and a note.",
  "meeting-log": "Meetings you attended, with the date, group and format, and room for a signature where a court or program asks for one.",
  "ninety-in-ninety": "Ninety cells, one for each meeting, toward the ninety meetings in ninety days often suggested to someone new to a twelve-step program. Numbered at 30, 60 and 90, the days programs often mark.",
  "halt-check-in": "The HALT check from recovery: are you hungry, angry, lonely or tired? Each is rated from one to five, so a hard moment has a likely cause written in front of you.",

  // ── Travel ────────────────────────────────────────────────────────────
  "trip-itinerary": "Day by day: where you will be, what you will do, and whether it is booked.",
  "places-been": "A checklist of places you want to go, ticked off as you get there.",
  "travel-budget": "Planned against actual spending for a trip, with a total.",
  "country-map": "A line for each continent, to write the countries you have been to.",
  "trip-journal": "Three prompts for each travel day: where you went, the best moment, and what is worth remembering.",
  "packing-list": "A checklist that starts with your passport, tickets and chargers, with room for the rest.",
};

/** A module's description, or null for one that has none (a spine, a
 *  title: modules the palette does not offer). */
export function describeModule(slug: string): string | null {
  return MODULE_DESCRIPTIONS[slug] ?? null;
}
