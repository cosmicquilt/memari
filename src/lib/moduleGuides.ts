// THE MODULE PAGES: memari.studio/modules/<slug>, a page each for the
// modules that carry a real practice - a tradition's prayer, a philosopher's
// exercise, a recovery step, a named planning method. About 35 of them, not
// all 127: a page per module would be the scaled, thin content search
// engines penalise. Everything else keeps its one-paragraph description
// (moduleDescriptions.ts). See the module-descriptions memory for the rules.
//
// THE RULES (moduleGuides.test.mts holds the mechanical ones):
// - Facts first. A practice is set out as its own tradition sets it out.
// - A quotation is VERBATIM from a public-domain text, fetched from the text
//   itself (never from memory), and credited to whoever wrote those words,
//   with the translation and year. Copyrighted texts (the AA Big Book, modern
//   Bible and Quran translations) are named, never quoted.
// - Plain words: none of the filler the descriptions also avoid, no asides
//   set off by dashes, American spelling. Quotes keep their own words.
//
// First batch, 2026-10-15, for Andrew to judge the tone before the rest:
// examen, stoic-evening-review, salah-tracker, step-ten-inventory,
// eisenhower-matrix.

export type GuideQuote = {
  /** Verbatim. One entry per line where the source sets it as verse. */
  lines: string[];
  /** Who wrote it, where, in whose translation. */
  cite: string;
};

export type GuideSection = {
  heading: string;
  paragraphs: string[];
  /** Set after the paragraphs. */
  quote?: GuideQuote;
  /** A short list after the paragraphs (the steps of a practice). */
  list?: string[];
};

export type ModuleGuide = {
  slug: string;
  /** "A Stoic practice" - above the title. */
  kicker: string;
  /** One or two sentences under the title. */
  lede: string;
  sections: GuideSection[];
  /** What the facts and quotations come from. */
  sources: Array<{ text: string; url?: string }>;
};

export const MODULE_GUIDES: ModuleGuide[] = [
  {
    slug: "examen",
    kicker: "A Christian practice",
    lede: "A short prayer at the end of the day, in the five steps St. Ignatius of Loyola set down nearly five hundred years ago.",
    sections: [
      {
        heading: "Where it comes from",
        paragraphs: [
          "Ignatius of Loyola (1491 to 1556) founded the Society of Jesus, the Jesuits, in 1540. His Spiritual Exercises, a guide for a retreat of about a month, was approved by Pope Paul III in 1548 and is still used by retreat directors today.",
          "Among its first instructions is a daily review he calls the General Examen. He gives it in five points, which are the five prompts of this module.",
        ],
        quote: {
          lines: [
            "It contains in it five Points.",
            "First Point. The first Point is to give thanks to God our Lord for the benefits received.",
            "Second Point. The second, to ask grace to know our sins and cast them out.",
            "Third Point. The third, to ask account of our soul from the hour that we rose up to the present Examen, hour by hour, or period by period: and first as to thoughts, and then as to words, and then as to acts, in the same order as was mentioned in the Particular Examen.",
            "Fourth Point. The fourth, to ask pardon of God our Lord for the faults.",
            "Fifth Point. The fifth, to purpose amendment with His grace. Our Father.",
          ],
          cite: "St. Ignatius of Loyola, Spiritual Exercises, \"Method for Making the General Examen,\" translated by Elder Mullan, S.J. (1914)",
        },
      },
      {
        heading: "How it is prayed",
        paragraphs: [
          "Most people pray it once a day, at night, in ten to fifteen minutes. Modern guides usually put the five points in plainer words, as this module does: give thanks, ask for light, review the day, ask forgiveness, and resolve for tomorrow.",
          "The third step is the longest. Ignatius asks for the day hour by hour, so go through it in order: the morning, the work, the conversations, the evening. Notice where you were grateful and where you fell short, and leave the judging to the fourth step.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Five numbered prompts, one for each point, with two lines under each. It sits on the daily page, so the book has a fresh one every day.",
          "Two lines is deliberate. The Examen is a prayer, not a diary entry: a few words under each step is enough to remember it by, and enough to look back on at the end of a week.",
        ],
      },
    ],
    sources: [
      { text: "The Spiritual Exercises of St. Ignatius of Loyola, translated from the autograph by Elder Mullan, S.J. (P. J. Kenedy & Sons, 1914), pages 30 and 31.", url: "https://archive.org/details/spiritualexercis00ignauoft" },
    ],
  },
  {
    slug: "stoic-evening-review",
    kicker: "A Stoic practice",
    lede: "Three questions answered before sleep, the way Seneca says he reviewed his day.",
    sections: [
      {
        heading: "Seneca's evening",
        paragraphs: [
          "In his essay On Anger, written in the first century, Seneca says he learned the habit from the philosopher Sextius, who asked himself each night what bad habit he had cured that day, and in what way he was better. Seneca kept it every night.",
        ],
        quote: {
          lines: [
            "I make use of this privilege, and daily plead my cause before myself: when the lamp is taken out of my sight, and my wife, who knows my habit, has ceased to talk, I pass the whole day in review before myself, and repeat all that I have said and done: I conceal nothing from myself, and omit nothing.",
          ],
          cite: "Seneca, On Anger, Book III, chapter 36, translated by Aubrey Stewart (1900)",
        },
      },
      {
        heading: "The three questions",
        paragraphs: [
          "The questions on this module are older than Seneca. They come from the Golden Verses, a Pythagorean poem that Epictetus, a Stoic teacher of the next generation, quotes to his students and tells them to keep ready for use.",
          "What did I do badly? What did I do well? What did I leave undone? They follow the poem's third line in order.",
        ],
        quote: {
          lines: [
            "Let sleep not come upon thy languid eyes",
            "Before each daily action thou hast scann’d;",
            "What’s done amiss, what done, what left undone;",
            "From first to last examine all, and then",
            "Blame what is wrong, in what is right rejoice.",
          ],
          cite: "Epictetus, Discourses, Book III, chapter 10, translated by George Long (1890)",
        },
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Three prompts with two lines each, on the daily page. Answer them in order, and keep it short: the point is to look at the day honestly, not to write it all down.",
          "Seneca's own review ends kindly. Having found where he argued too hard or spoke too freely, he pardons himself and resolves to do better, then sleeps. The last line of the verse says the same: blame what is wrong, and rejoice in what is right.",
        ],
      },
    ],
    sources: [
      { text: "L. Annaeus Seneca, Minor Dialogues, translated by Aubrey Stewart (George Bell and Sons, 1900): Of Anger, Book III, chapter 36.", url: "https://en.wikisource.org/wiki/Of_Anger/Book_III" },
      { text: "A Selection from the Discourses of Epictetus, translated by George Long: \"In what manner we ought to bear sickness\" (Book III, chapter 10).", url: "https://www.gutenberg.org/ebooks/10661" },
    ],
  },
  {
    slug: "salah-tracker",
    kicker: "A Muslim practice",
    lede: "A week of the five daily prayers, with a box to mark each prayer on each day.",
    sections: [
      {
        heading: "The five prayers",
        paragraphs: [
          "Salah, the ritual prayer, is one of the Five Pillars of Islam, and it is prayed five times a day. Each prayer has its own window, set by the sun.",
        ],
        list: [
          "Fajr, from dawn until sunrise.",
          "Dhuhr, after the sun passes its highest point.",
          "Asr, in the afternoon.",
          "Maghrib, just after sunset.",
          "Isha, at night, once the twilight has gone.",
        ],
      },
      {
        heading: "Why the times move",
        paragraphs: [
          "Because the windows follow the sun, they shift through the year and from one place to another. That is why this module leaves the times off: your mosque, a prayer-time calendar for your city, or an app will give you the day's times.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Seven rows for the days of the week and five columns for the prayers, on the weekly spread. Fill in a box, tick it, or mark it however you like as each prayer is prayed.",
          "Some people mark a prayer prayed in congregation differently from one prayed alone, or keep a small mark for a prayer made up later. A week on one page shows the pattern: which prayers come easily and which slip. It is a record for you, not a score.",
        ],
      },
    ],
    sources: [],
  },
  {
    slug: "step-ten-inventory",
    kicker: "A recovery practice",
    lede: "A few minutes at the end of the day to look for resentment, selfishness, dishonesty and fear, as the Tenth Step asks.",
    sections: [
      {
        heading: "The Tenth Step",
        paragraphs: [
          "The Twelve Steps were first published in 1939, in the book Alcoholics Anonymous, which members call the Big Book. The tenth step is to keep taking a personal inventory, and to admit it promptly when you are wrong.",
          "In the chapter \"Into Action,\" the Big Book names four things to keep watching for: selfishness, dishonesty, resentment and fear. Many members look for them in a short review each night. Those four are the prompts on this module.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Four prompts with two lines each, on the daily page: Resentful, Selfish, Dishonest, Afraid. Under each, write where it showed up today, if it did. An empty line is a good day, not a skipped one.",
          "If something on the page needs putting right, the step asks for it to be put right promptly. If something needs talking over, the page is there to bring to your sponsor.",
        ],
      },
      {
        heading: "A note",
        paragraphs: [
          "Memari is not affiliated with Alcoholics Anonymous or any twelve-step fellowship. This module is a page to write on, laid out around the step, not a program. The Big Book is the place to read the step itself, and your sponsor and your group are the people to work it with.",
        ],
      },
    ],
    sources: [
      { text: "Alcoholics Anonymous (Alcoholics Anonymous World Services, first published 1939), chapter 6, \"Into Action.\"" },
    ],
  },
  {
    slug: "eisenhower-matrix",
    kicker: "A planning method",
    lede: "Sort the week's tasks by two questions, is it urgent and is it important, and treat each of the four kinds differently.",
    sections: [
      {
        heading: "Where the name comes from",
        paragraphs: [
          "In August 1954, President Dwight D. Eisenhower spoke to the World Council of Churches at Northwestern University, in Evanston, Illinois. Partway through, he quoted a former college president.",
        ],
        quote: {
          lines: [
            "I have two kinds of problems, the urgent and the important. The urgent are not important, and the important are never urgent.",
          ],
          cite: "Dwight D. Eisenhower, Address at the Second Assembly of the World Council of Churches, Evanston, Illinois, August 19, 1954, quoting an unnamed college president",
        },
      },
      {
        heading: "The four boxes",
        paragraphs: [
          "The grid came later. Stephen Covey made the four quadrants popular in The 7 Habits of Highly Effective People (1989), where he calls it the time management matrix. It crosses the two questions to give four kinds of task, each with its own answer:",
        ],
        list: [
          "Urgent and important: do it now.",
          "Important, not urgent: schedule it.",
          "Urgent, not important: delegate it.",
          "Neither: drop it.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "One grid for the week, with urgency across and importance down, and lined space in each box: Do, Schedule, Delegate, Delete. Write each task where it belongs once, then work from Do.",
          "The box to watch is Schedule. Important work that is never urgent is exactly what Eisenhower's college president meant, and it only gets done if it is given a time. Put each one on a day of this week's spread.",
        ],
      },
    ],
    sources: [
      { text: "Dwight D. Eisenhower, Address at the Second Assembly of the World Council of Churches, Evanston, Illinois, August 19, 1954. The American Presidency Project.", url: "https://www.presidency.ucsb.edu/node/232572" },
      { text: "Stephen R. Covey, The 7 Habits of Highly Effective People (Free Press, 1989), Habit 3, \"Put First Things First.\"" },
    ],
  },
];

export const GUIDE_BY_SLUG: Record<string, ModuleGuide> = Object.fromEntries(MODULE_GUIDES.map((guide) => [guide.slug, guide]));

/** Every word of a guide that is OURS, not a source's - what the plain-words
 *  rules apply to. Quotations keep their own words. */
export function guideProse(guide: ModuleGuide): string[] {
  return [
    guide.kicker,
    guide.lede,
    ...guide.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.list ?? [])]),
  ];
}
