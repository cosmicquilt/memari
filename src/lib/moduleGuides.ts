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

/**
 * A picture of the practice's person or place, shown as a postage stamp
 * stuck to the page - asked 2026-10-15. Openly
 * licensed only, from Wikimedia Commons, credited under it with its licence
 * and a link back; a crop is said to be one, as the CC licences ask.
 */
export type GuidePhoto = {
  /** Under /public: the cropped picture. */
  src: string;
  alt: string;
  /** Printed on the stamp, in capitals. */
  caption: string;
  /** Who made the picture and what it is, as the credit line reads. */
  credit: string;
  license: "Public domain" | "CC BY 2.0" | "CC BY 2.5" | "CC BY 3.0" | "CC BY 4.0" | "CC BY-SA 2.0" | "CC BY-SA 3.0" | "CC BY-SA 4.0";
  licenseUrl?: string;
  /** The picture's page on Wikimedia Commons. */
  sourceUrl: string;
  /** Wider than tall. */
  landscape?: boolean;
  /** No postmark: a picture of scripture is not inked over. */
  unfranked?: boolean;
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
  photo?: GuidePhoto;
  /**
   * The people, books and traditions the page names, linked to their
   * Wikipedia article where the page FIRST names them ("add wiki links where
   * relevant like people etc.", 2026-10-15): phrase as written -> article
   * title, each checked against Wikipedia's API (no redirects, no
   * disambiguation pages).
   */
  wiki?: Record<string, string>;
};

export const MODULE_GUIDES: ModuleGuide[] = [
  {
    slug: "examen",
    wiki: {
      "Ignatius of Loyola": "Ignatius of Loyola",
      "Society of Jesus": "Jesuits",
      "Pope Paul III": "Pope Paul III",
      "Spiritual Exercises": "Spiritual Exercises",
      "General Examen": "Examination of conscience",
    },
    photo: {
      src: "/modules/photos/examen.jpg",
      alt: "Peter Paul Rubens's painting of St. Ignatius of Loyola in red and gold vestments",
      caption: "Ignatius of Loyola",
      credit: "Peter Paul Rubens, Saint Ignatius of Loyola (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:St._Ignatius_of_Loyola_by_Peter_Paul_Rubens.jpg",
    },
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
    wiki: {
      Seneca: "Seneca the Younger",
      "On Anger": "De Ira",
      Sextius: "Quintus Sextius",
      "Golden Verses": "Golden Verses",
      Pythagorean: "Pythagoreanism",
      Epictetus: "Epictetus",
    },
    photo: {
      src: "/modules/photos/stoic-evening-review.jpg",
      alt: "A marble bust of Seneca, with his name carved on the chest",
      caption: "Seneca",
      credit: "Bust of Seneca, Antikensammlung Berlin. Photo by Calidius (cropped)",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Seneca-berlinantikensammlung-2_copy.jpg",
    },
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
            "I make use of this privilege, and daily plead my cause before myself: when the lamp is taken out of my sight, and my wife, who knows my habit, has ceased to talk, I pass the whole day in review before myself, and repeat all that I have said and done: I conceal nothing from myself, and omit nothing...",
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
          cite: "Epictetus, Discourses, Book III, chapter 10, translated by George Long (1877)",
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
    wiki: {
      Salah: "Salah",
      "Five Pillars of Islam": "Five Pillars of Islam",
      Fajr: "Fajr",
      Dhuhr: "Dhuhr",
      Asr: "Asr",
      Maghrib: "Maghrib (prayer)",
      Isha: "Isha (prayer)",
    },
    photo: {
      src: "/modules/photos/salah-tracker.jpg",
      alt: "The domes and six minarets of the Blue Mosque against a dawn sky",
      caption: "Blue Mosque, Istanbul",
      credit: "The Blue Mosque at dawn. Photo by Nithi Ruangpisit (cropped)",
      license: "CC BY 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Blue_Mosque_In_Dawn_(122678105).jpeg",
    },
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
    wiki: {
      "Twelve Steps": "Twelve-step program",
      "Alcoholics Anonymous": "The Big Book (Alcoholics Anonymous)",
    },
    photo: {
      src: "/modules/photos/step-ten-inventory.jpg",
      alt: "A white two-story house with a front porch, on a green lawn",
      caption: "Akron, Ohio",
      credit: "Dr. Robert Smith's house in Akron, where Alcoholics Anonymous began in 1935. Photo by Nyttend (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Dr._Bob%27s_House.jpg",
      landscape: true,
    },
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
    wiki: {
      "Dwight D. Eisenhower": "Dwight D. Eisenhower",
      "World Council of Churches": "World Council of Churches",
      "Northwestern University": "Northwestern University",
      "Evanston, Illinois": "Evanston, Illinois",
      "Stephen Covey": "Stephen Covey",
      "The 7 Habits of Highly Effective People": "The 7 Habits of Highly Effective People",
    },
    photo: {
      src: "/modules/photos/eisenhower-matrix.jpg",
      alt: "Official portrait photograph of Dwight D. Eisenhower in a gray suit",
      caption: "Dwight D. Eisenhower",
      credit: "Official White House portrait, May 29, 1959 (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Dwight_D._Eisenhower,_official_photo_portrait,_May_29,_1959_(crop).jpg",
    },
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
  {
    slug: "stoic-morning-page",
    wiki: {
      "Marcus Aurelius": "Marcus Aurelius",
      Meditations: "Meditations",
      Quadi: "Quadi",
      Carnuntum: "Carnuntum",
      Epictetus: "Epictetus",
      "Junius Rusticus": "Junius Rusticus",
      Stoics: "Stoicism",
    },
    photo: {
      src: "/modules/photos/stoic-morning-page.jpg",
      alt: "A Roman marble bust of Marcus Aurelius, bearded and curly haired, in a cloak",
      caption: "Marcus Aurelius",
      credit: "Bust of Marcus Aurelius, Glyptothek, Munich (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Marcus_Aurelius_Glyptothek_Munich.jpg",
    },
    kicker: "A Stoic practice",
    lede: "Three questions to start the day with, the way Marcus Aurelius started his: by deciding in advance how he would meet it.",
    sections: [
      {
        heading: "Marcus Aurelius's morning",
        paragraphs: [
          "Marcus Aurelius was Roman emperor from 161 until his death in 180. His Meditations are notes he wrote to himself in Greek, never meant to be read by anyone else, and he wrote some of them in army camps on the Danube frontier. The first book ends \"Among the Quadi at the Granua,\" and the second \"This in Carnuntum.\"",
          "The second book opens with a morning exercise. Before the day begins, he names the kind of people he will meet, and reminds himself why they cannot harm him:",
        ],
        quote: {
          lines: [
            "Begin the morning by saying to thyself, I shall meet with the busybody, the ungrateful, arrogant, deceitful, envious, unsocial. All these things happen to them by reason of their ignorance of what is good and evil.",
          ],
          cite: "Marcus Aurelius, Meditations, Book II, section 1, translated by George Long (1862)",
        },
      },
      {
        heading: "The three questions",
        paragraphs: [
          "The first question is the one Epictetus taught: what is up to you, and what is not. Marcus thanks his teacher Junius Rusticus, in the Meditations' first book, for introducing him to Epictetus's lectures.",
          "The second is the obstacle. Marcus does not pretend that obstacles can be avoided. He says they can be used:",
        ],
        quote: {
          lines: [
            "...the mind converts and changes every hindrance to its activity into an aid; and so that which is a hindrance is made a furtherance to an act; and that which is an obstacle on the road helps us on this road.",
          ],
          cite: "Marcus Aurelius, Meditations, Book V, section 20, translated by George Long (1862)",
        },
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Three prompts with two lines each, on the daily page: What is in my control today? What obstacle should I expect? Which virtue will I need?",
          "The Stoics counted four virtues: wisdom, justice, courage and moderation. For the third prompt, pick the one the day will ask for most. The module pairs with the Stoic Evening Review, which asks at night how the day really went.",
        ],
      },
    ],
    sources: [
      { text: "Thoughts of Marcus Aurelius Antoninus, translated by George Long (1862): Book II, section 1; Book V, section 20; the closing lines of Books I and II; and Long's introduction, on Rusticus and Epictetus.", url: "https://www.gutenberg.org/ebooks/15877" },
    ],
  },
  {
    slug: "dichotomy-of-control",
    wiki: {
      Epictetus: "Epictetus",
      Hierapolis: "Hierapolis",
      Epaphroditus: "Epaphroditus (freedman of Nero)",
      Nero: "Nero",
      Domitian: "Domitian",
      Nicopolis: "Nicopolis",
      Arrian: "Arrian",
      Discourses: "Discourses of Epictetus",
      Enchiridion: "Enchiridion of Epictetus",
    },
    photo: {
      src: "/modules/photos/dichotomy-of-control.jpg",
      alt: "An engraving of Epictetus writing at a desk, a crutch under his arm, as an artist imagined him",
      caption: "Epictetus",
      credit: "Imagined portrait of Epictetus, frontispiece of an edition of the Enchiridion, Oxford, 1715 (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Epicteti_Enchiridion_Latinis_versibus_adumbratum_(Oxford_1715)_frontispiece_(cropped).jpg",
    },
    kicker: "A Stoic practice",
    lede: "Two columns, for what is up to you and what is not: the division that Epictetus's handbook opens with.",
    sections: [
      {
        heading: "Epictetus",
        paragraphs: [
          "Epictetus was born a slave around the year 50, in Hierapolis, in what is now Turkey. In Rome he belonged to Epaphroditus, a freedman who served the emperor Nero. Once free, he taught philosophy, first in Rome and then, after the emperor Domitian banished philosophers from the city, at Nicopolis in Greece.",
          "He wrote nothing down himself. His student Arrian recorded his lectures as the Discourses, and drew from them a short handbook, the Enchiridion. Its first lines are the whole idea of this module:",
        ],
        quote: {
          lines: [
            "Of things some are in our power, and others are not. In our power are opinion, movement towards a thing, desire, aversion, turning from a thing; and in a word, whatever are our acts. Not in our power are the body, property, reputation, offices (magisterial power), and in a word, whatever are not our own acts.",
          ],
          cite: "Epictetus, Enchiridion, chapter 1, translated by George Long (1877), with his Greek glosses left out",
        },
      },
      {
        heading: "Why it helps",
        paragraphs: [
          "The point is not to stop caring about what is out of your hands. It is to put your effort where it can change something. The same chapter ends with a test to use on anything that troubles you:",
        ],
        quote: {
          lines: [
            "Then examine it by the rules which you possess, and by this first and chiefly, whether it relates to the things which are in our power or to things which are not in our power; and if it relates to anything which is not in our power, be ready to say that it does not concern you.",
          ],
          cite: "Epictetus, Enchiridion, chapter 1, translated by George Long (1877)",
        },
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Two columns on the daily page, headed Up to me and Not up to me. When something is on your mind, write it down on the side where it belongs.",
          "Most worries have a part on each side. You cannot decide how an interview goes, but you can decide how well you prepare for it. Split those into both columns, then work from the left one: it is the list of what today can actually do something about.",
        ],
      },
    ],
    sources: [
      { text: "A Selection from the Discourses of Epictetus with the Encheiridion, translated by George Long: the Encheiridion, chapter 1, and Long's note on Epictetus's life.", url: "https://www.gutenberg.org/ebooks/10661" },
    ],
  },
  {
    slug: "memento-mori",
    wiki: {
      "Memento mori": "Memento mori",
      "Marcus Aurelius": "Marcus Aurelius",
      Seneca: "Seneca the Younger",
      Virgil: "Virgil",
      vanitas: "Vanitas",
      "Philippe de Champaigne": "Philippe de Champaigne",
    },
    photo: {
      src: "/modules/photos/memento-mori.jpg",
      alt: "A painted skull on a stone ledge, between a tulip in a glass vase and an hourglass",
      caption: "Memento mori",
      credit: "Philippe de Champaigne, Still Life with a Skull (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Philippe_de_Champaigne_Still-Life_with_a_Skull.JPG",
      landscape: true,
    },
    kicker: "A Stoic practice",
    lede: "Fifty-two circles, one for each week of the year, filled in as the weeks go by.",
    sections: [
      {
        heading: "Where it comes from",
        paragraphs: [
          "Memento mori is Latin for remember that you must die. The phrase is best known from Christian art, but the thought is older, and the Stoics came back to it often. Marcus Aurelius uses it in the Meditations not to frighten himself, but to get on with being good:",
        ],
        quote: {
          lines: ["Do not act as if thou wert going to live ten thousand years. Death hangs over thee. While thou livest, while it is in thy power, be good."],
          cite: "Marcus Aurelius, Meditations, Book IV, section 17, translated by George Long (1862)",
        },
      },
      {
        heading: "Seneca's version",
        paragraphs: [
          "Seneca turns the thought into a habit for the end of each day. In a letter on growing old, he suggests going to sleep as if the day had been the last one, quoting a line of Virgil, so that each morning after it is a gift:",
        ],
        quote: {
          lines: [
            "...let us go to our sleep with joy and gladness; let us say:",
            "I have lived; the course which Fortune set for me",
            "Is finished.",
            "And if God is pleased to add another day, we should welcome it with glad hearts. That man is happiest, and is secure in his own possession of himself, who can await the morrow without apprehension. When a man has said: “I have lived!”, every morning he arises he receives a bonus.",
          ],
          cite: "Seneca, Letters to Lucilius, Letter 12, translated by Richard M. Gummere (1917)",
        },
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Fifty-two circles, one for each week of the year, numbered every thirteen weeks so the quarters are easy to find. It goes once, at the front of the book. Fill in a circle as each week ends.",
          "Painters of the 1600s made the same reminder into still lifes called vanitas, like the one by Philippe de Champaigne above: a flower that will fade, a skull, an hourglass running down. The page is meant the same way. The filled circles are time already spent, and the empty ones are the weeks still there to use well.",
        ],
      },
    ],
    sources: [
      { text: "Thoughts of Marcus Aurelius Antoninus, translated by George Long (1862), Book IV, section 17.", url: "https://www.gutenberg.org/ebooks/15877" },
      { text: "Seneca, Moral Letters to Lucilius, translated by Richard M. Gummere, volume 1 (Loeb Classical Library, 1917): Letter 12, On old age.", url: "https://en.wikisource.org/wiki/Moral_letters_to_Lucilius/Letter_12" },
    ],
  },
  {
    slug: "negative-visualisation",
    wiki: {
      Seneca: "Seneca the Younger",
      "Letters to Lucilius": "Epistulae Morales ad Lucilium",
      Lugdunum: "Lugdunum",
      Stoics: "Stoicism",
    },
    photo: {
      src: "/modules/photos/negative-visualisation.jpg",
      alt: "The curved stone seats of the Roman theatre at Lyon, set into a hillside",
      caption: "Lugdunum, Lyon",
      credit: "The Roman theatre of Lugdunum, Lyon. Photo by Vincent Bloch (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Roman_theatre_in_Lyon.jpg",
      landscape: true,
    },
    kicker: "A Stoic practice",
    lede: "Once a week, picture losing something you value and how you would meet it, so that a loss never comes as a complete surprise.",
    sections: [
      {
        heading: "Seneca and the fire at Lyons",
        paragraphs: [
          "Seneca wrote the 91st of his Letters to Lucilius after a fire destroyed the Roman city of Lugdunum, now Lyon, in a single night. His friend Liberalis took the news hard, and Seneca's letter is about why: it is the unexpected that weighs most. His answer is to expect more.",
        ],
        quote: {
          lines: [
            "Therefore, nothing ought to be unexpected by us. Our minds should be sent forward in advance to meet all problems, and we should consider, not what is wont to happen, but what can happen.",
          ],
          cite: "Seneca, Letters to Lucilius, Letter 91, translated by Richard M. Gummere (1920)",
        },
      },
      {
        heading: "A rehearsal, not a worry",
        paragraphs: [
          "The exercise is often called premeditatio malorum, Latin for the rehearsal of misfortunes. It is not the same as worrying. Worry goes round the fear again and again. The rehearsal follows it through to an answer: if this went, what would I do, and what would I still have?",
          "Modern Stoics add a second use. Picturing the loss of something makes you notice it while you have it.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Two prompts with three lines each, on the weekly spread: What might I lose? How would I meet it? Pick one thing a week, small or large: a job, your health, a friend, a plan.",
          "Keep the second answer practical. If something can be prepared for, such as a backup, some money put aside, or a call you have been putting off, write it on a day of this week's spread.",
        ],
      },
    ],
    sources: [
      { text: "Seneca, Moral Letters to Lucilius, translated by Richard M. Gummere, volume 2 (Loeb Classical Library, 1920): Letter 91, On the lesson to be drawn from the burning of Lyons.", url: "https://en.wikisource.org/wiki/Moral_letters_to_Lucilius/Letter_91" },
    ],
  },
  {
    slug: "tao-daily-verse",
    wiki: {
      "Tao Te Ching": "Tao Te Ching",
      Laozi: "Laozi",
      Zhou: "Zhou dynasty",
      "Sima Qian": "Sima Qian",
      Guodian: "Bamboo Texts of Guodian",
      "James Legge": "James Legge",
    },
    photo: {
      src: "/modules/photos/tao-daily-verse.jpg",
      alt: "An ink painting of an old man with a long beard riding an ox",
      caption: "Laozi",
      credit: "Zhang Lu, Laozi Riding an Ox, Ming dynasty (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Zhang_Lu-Laozi_Riding_an_Ox_(cropped).jpg",
    },
    kicker: "A Taoist practice",
    lede: "Copy out a passage of the Tao Te Ching each day, then write what it says plainly and what it says underneath.",
    sections: [
      {
        heading: "The book",
        paragraphs: [
          "The Tao Te Ching is a short Chinese book of 81 chapters, about five thousand characters in all. Tradition gives it to Laozi, a keeper of the archives at the court of the Zhou kings. The historian Sima Qian tells how it came to be written: leaving for the west, Laozi was stopped at a border pass by its keeper, who asked him to write down his teaching before he went. The painting above shows him on his way.",
          "Scholars think the text grew over time. The oldest copies found, on bamboo slips in a tomb at Guodian, date from about 300 BC.",
        ],
      },
      {
        heading: "Its first lines",
        paragraphs: [
          "James Legge, a Scottish missionary who became the first professor of Chinese at Oxford, published his translation in 1891. It is free to use, and it is the one quoted here. The book opens by saying that what it is about cannot be put into words:",
        ],
        quote: {
          lines: ["The Tao that can be trodden is not the enduring and unchanging Tao. The name that can be named is not the enduring and unchanging name."],
          cite: "Laozi, Tao Te Ching, chapter 1, translated by James Legge (1891)",
        },
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Three prompts with two lines each, on the daily page: The passage, What it says plainly, What it says underneath. Copy the line or two that stays with you, not the whole chapter. Then put it in your own words, and then write what you think it points to.",
          "Many chapters are only a few lines long. At a chapter a day, the whole book takes under three months.",
        ],
      },
    ],
    sources: [
      { text: "The Tao Teh King, translated by James Legge, in The Sacred Books of the East, volume 39 (Oxford, 1891).", url: "https://www.gutenberg.org/ebooks/216" },
      { text: "Sima Qian, Records of the Grand Historian, chapter 63, the life of Laozi." },
    ],
  },
  {
    slug: "wu-wei-reflection",
    wiki: {
      "Wu wei": "Wu wei",
      "Tao Te Ching": "Tao Te Ching",
      "Ma Yuan": "Ma Yuan (painter)",
      "Southern Song": "Song dynasty",
    },
    photo: {
      src: "/modules/photos/wu-wei-reflection.jpg",
      alt: "An ink painting of rolling waves, with four Chinese characters at the left",
      caption: "Ma Yuan, Water",
      credit: "Ma Yuan, a leaf of the Water Album (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Ma_Yuan_-_Water_Album_-_Ten_Thousand_Riplets_on_the_Yangzi.jpg",
      landscape: true,
    },
    kicker: "A Taoist practice",
    lede: "Once a week, write down where you pushed against something, and what yielding would have looked like.",
    sections: [
      {
        heading: "Doing without forcing",
        paragraphs: [
          "Wu wei means, word for word, without doing. In the Tao Te Ching it does not mean doing nothing. It means acting the way things already tend to go, without strain, so that the work gets done without being forced:",
        ],
        quote: {
          lines: ["The Tao in its regular course does nothing (for the sake of doing it), and so there is nothing which it does not do."],
          cite: "Laozi, Tao Te Ching, chapter 37, translated by James Legge (1891)",
        },
      },
      {
        heading: "Water",
        paragraphs: [
          "The book's favorite picture of it is water, which gives way to everything and still wears away stone. The painting above is a leaf from the Water Album of Ma Yuan, a court painter of the Southern Song around the year 1200.",
        ],
        quote: {
          lines: [
            "There is nothing in the world more soft and weak than water, and yet for attacking things that are firm and strong there is nothing that can take precedence of it;—for there is nothing (so effectual) for which it can be changed.",
            "Every one in the world knows that the soft overcomes the hard, and the weak the strong, but no one is able to carry it out in practice.",
          ],
          cite: "Laozi, Tao Te Ching, chapter 78, translated by James Legge (1891)",
        },
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Two prompts with three lines each, on the weekly spread: Where did I force something? What would yielding have looked like? Think back over the week's arguments, deadlines and plans that would not go your way.",
          "Yielding is not giving up. It can mean waiting, asking instead of insisting, or letting a plan change shape. The aim is to notice where effort turned into strain, and to try the other way next time.",
        ],
      },
    ],
    sources: [
      { text: "The Tao Teh King, translated by James Legge, in The Sacred Books of the East, volume 39 (Oxford, 1891): chapters 37 and 78.", url: "https://www.gutenberg.org/ebooks/216" },
    ],
  },
  {
    slug: "soap-study",
    wiki: {
      "New Hope Christian Fellowship": "New Hope Christian Fellowship",
      Psalms: "Psalms",
    },
    photo: {
      src: "/modules/photos/soap-study.jpg",
      alt: "Rembrandt's painting of an old woman in a red cloak and hood, reading a large open book",
      caption: "Rembrandt, 1631",
      credit: "Rembrandt, Old Woman Reading, Probably the Prophetess Hannah, 1631, Rijksmuseum (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Oude_lezende_vrouw,_waarschijnlijk_de_profetes_Hanna_Rijksmuseum_SK-A-3066.jpeg",
    },
    kicker: "A Christian practice",
    lede: "Scripture, Observation, Application, Prayer: copy out a passage, say what it says and what it means for you, then answer it in prayer.",
    sections: [
      {
        heading: "Where it comes from",
        paragraphs: [
          "SOAP is the method of Wayne Cordeiro, who started New Hope Christian Fellowship in Honolulu in 1995. He set it out in his book The Divine Mentor (2007) as a way to keep a daily journal of Bible reading. The four letters are the four steps:",
        ],
        list: [
          "Scripture: copy out the verse or verses that stood out in the day's reading.",
          "Observation: what does it say? Who is speaking, to whom, and why?",
          "Application: what does it mean for you, today?",
          "Prayer: answer it, in a few honest sentences.",
        ],
      },
      {
        heading: "Why write it",
        paragraphs: [
          "Copying a verse out by hand slows you down enough to notice it, and writing down what it means keeps the reading from passing straight through. The old picture of what this reading is for comes from the Psalms:",
        ],
        quote: {
          lines: ["Thy word is a lamp unto my feet, and a light unto my path."],
          cite: "Psalm 119:105, King James Version (1611)",
        },
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Four prompts on the daily page, with more lines where there is more to write: two for the Scripture, three for the Observation, four for the Application and three for the Prayer. It is wide, eight columns of the page, so a verse has room to be copied out in full.",
          "Read first, then write. A reading plan saves deciding each morning which passage comes next.",
        ],
      },
    ],
    sources: [
      { text: "Wayne Cordeiro, The Divine Mentor: Growing Your Faith as You Sit at the Feet of the Savior (Bethany House, 2007)." },
      { text: "The Holy Bible, King James Version (Project Gutenberg): Psalm 119:105.", url: "https://www.gutenberg.org/ebooks/10" },
    ],
  },
  {
    slug: "verse-mapping",
    wiki: {
      "Robert Estienne": "Robert Estienne",
      "Geneva Bible": "Geneva Bible",
      "Strong's Concordance": "Strong's Concordance",
      "King James Version": "King James Version",
    },
    photo: {
      src: "/modules/photos/verse-mapping.jpg",
      alt: "A page of Genesis from the 1560 Geneva Bible, with a map of the Garden of Eden, numbered verses and notes in the margins",
      caption: "Geneva Bible, 1560",
      credit: "Genesis, from the Geneva Bible, 1560, Houghton Library, Harvard University (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Houghton_STC_2093_-_aii.jpg",
      unfranked: true,
    },
    kicker: "A Christian practice",
    lede: "Take one verse apart over a week: write it out, compare translations, follow its cross references, and note what it asks of you.",
    sections: [
      {
        heading: "Where it comes from",
        paragraphs: [
          "Verse mapping is a recent name for an old way of studying: one verse at a time, with other Bibles and reference books open beside it. The book of Acts praises the Jews of Berea for reading this way when Paul brought them his message:",
        ],
        quote: {
          lines: ["These were more noble than those in Thessalonica, in that they received the word with all readiness of mind, and searched the scriptures daily, whether those things were so."],
          cite: "Acts 17:11, King James Version (1611)",
        },
      },
      {
        heading: "Verses and references",
        paragraphs: [
          "The method depends on something the Bible did not always have. The Paris printer Robert Estienne numbered the verses of the New Testament in his Greek edition of 1551, and the Geneva Bible of 1560 was the first English Bible with both chapters and verses. The page above is from it, with its verse numbers and the notes in its margins.",
          "For following a word, Strong's Concordance, first published in 1890, lists every place each word appears in the King James Version.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Four prompts with two lines each, on the weekly spread: The verse, Other translations, Cross references, What it asks of me. One verse is enough for a week.",
          "Copy the verse out, then note a word or phrase that reads differently in another translation. Under Cross references, write the references, not the verses, so the lines go further. The last prompt is the point of the rest: what the verse asks of you this week.",
        ],
      },
    ],
    sources: [
      { text: "The Holy Bible, King James Version (Project Gutenberg): Acts 17:11.", url: "https://www.gutenberg.org/ebooks/10" },
      { text: "James Strong, The Exhaustive Concordance of the Bible (1890)." },
    ],
  },
  {
    slug: "lectio-divina",
    wiki: {
      "Lectio divina": "Lectio Divina",
      "Rule of Saint Benedict": "Rule of Saint Benedict",
      "Guigo II": "Guigo II",
      "Grande Chartreuse": "Grande Chartreuse",
      Carthusian: "Carthusians",
      Psalms: "Psalms",
    },
    photo: {
      src: "/modules/photos/lectio-divina.jpg",
      alt: "The Grande Chartreuse monastery, a long cluster of gray roofs in a forested mountain valley",
      caption: "Grande Chartreuse",
      credit: "The monastery of the Grande Chartreuse, France. Photo by Floriel (cropped)",
      license: "CC BY 2.5",
      licenseUrl: "https://creativecommons.org/licenses/by/2.5/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:La_Grande_Chartreuse.JPG",
      landscape: true,
    },
    kicker: "A Christian practice",
    lede: "The monastic way of reading scripture slowly, in four steps: read, reflect, respond, rest.",
    sections: [
      {
        heading: "Where it comes from",
        paragraphs: [
          "Lectio divina is Latin for holy reading. The Rule of Saint Benedict, written in the sixth century, sets aside hours of each monk's day for it, alongside prayer and work.",
          "About six hundred years later, Guigo II, prior of the Grande Chartreuse, the mother house of the Carthusian monks in the French Alps, described it as a ladder of four steps in a letter known as The Ladder of Monks. He compares the steps to eating: reading puts the food in your mouth, meditation chews it, prayer tastes it, and contemplation is the sweetness itself.",
        ],
      },
      {
        heading: "The four steps",
        paragraphs: [
          "Choose a short passage, a few verses at most. Then:",
        ],
        list: [
          "Lectio, read: read it slowly, more than once, until a word or phrase stands out.",
          "Meditatio, reflect: turn that phrase over. Why this, and why today?",
          "Oratio, respond: speak to God about it, in your own words.",
          "Contemplatio, rest: stop talking, and stay with it in silence for a while.",
        ],
      },
      {
        heading: "Day and night",
        paragraphs: [
          "The first psalm in the Book of Psalms describes the same slow, returning kind of reading:",
        ],
        quote: {
          lines: ["But his delight is in the law of the LORD; and in his law doth he meditate day and night."],
          cite: "Psalm 1:2, King James Version (1611)",
        },
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Four numbered prompts on the daily page, one for each step, with two lines under each. Write the phrase that stood out under the first, and a line or two under the next two.",
          "The fourth step has no words of its own. A mark under it, or the minutes you sat, is enough.",
        ],
      },
    ],
    sources: [
      { text: "Guigo II, The Ladder of Monks (Scala claustralium), twelfth century." },
      { text: "The Rule of Saint Benedict, chapter 48, on daily manual labor and reading." },
      { text: "The Holy Bible, King James Version (Project Gutenberg): Psalm 1:2.", url: "https://www.gutenberg.org/ebooks/10" },
    ],
  },
  {
    slug: "mussar-trait",
    wiki: {
      Mussar: "Musar movement",
      "Israel Salanter": "Israel Salanter",
      "Menachem Mendel Lefin": "Menachem Mendel Lefin",
      "Benjamin Franklin": "Benjamin Franklin",
      Vilna: "Vilnius",
      "Pirkei Avot": "Pirkei Avot",
      "Ben Zoma": "Simeon ben Zoma",
    },
    photo: {
      src: "/modules/photos/mussar-trait.jpg",
      alt: "The Hebrew title page of Cheshbon HaNefesh, printed in Vilna in 1844",
      caption: "Cheshbon HaNefesh",
      credit: "Title page of Lefin's Cheshbon HaNefesh, Vilna edition of 1844 (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Lefin_Heshbon_HaNefesh.JPG",
    },
    kicker: "A Jewish practice",
    lede: "Work on one trait of character for a week, such as patience or humility, and mark each day you noticed it, practiced it and thought it over.",
    sections: [
      {
        heading: "Mussar",
        paragraphs: [
          "Mussar is the Jewish tradition of working on your character one trait at a time. A trait is called a middah, and the plural is middot. Mussar books go back to the Middle Ages, and in nineteenth-century Lithuania Rabbi Israel Salanter made the study of them into a movement.",
          "A middah is not a rule to keep. It is a habit of the heart, and the work is to notice it in yourself, practice it on purpose, and look back on how it went.",
        ],
      },
      {
        heading: "Lefin's chart",
        paragraphs: [
          "In 1808, Rabbi Menachem Mendel Lefin published Cheshbon HaNefesh, an accounting of the soul. It works through thirteen traits, one a week, with a chart for marking each day. Lefin adapted the method from Benjamin Franklin's account of his own thirteen virtues. Salanter later had the book reprinted in Vilna, in the edition shown above.",
          "The rabbis' old sayings already treat character this way. In Pirkei Avot, Ben Zoma turns four ideas of greatness into traits:",
        ],
        quote: {
          lines: [
            "Who is wise? He who learns from all men...",
            "Who is mighty? He who controls his passions...",
            "Who is rich? He who rejoices in his portion...",
            "Who is honored? He who honors others...",
          ],
          cite: "Ben Zoma, in Pirkei Avot, chapter 4, translated by Joseph I. Gorfinkle (1913)",
        },
      },
      {
        heading: "How the module works",
        paragraphs: [
          "A week of days across, with three rows to mark: Noticed, Practiced and Reflected. Write the trait in the heading, and mark each day you noticed it in yourself, put it into practice, and looked back on how it went.",
          "Lefin's thirteen include patience, order, humility and silence, but any trait you want to grow will do. Stay with one for a week, or longer if it needs it.",
        ],
      },
    ],
    sources: [
      { text: "Pirke Avot: The Sayings of the Jewish Fathers, translated by Joseph I. Gorfinkle (1913), chapter 4.", url: "https://www.gutenberg.org/ebooks/8547" },
      { text: "Menachem Mendel Lefin, Cheshbon HaNefesh (Lemberg, 1808; Vilna, 1844)." },
    ],
  },
  {
    slug: "omer-counter",
    wiki: {
      "Counting of the Omer": "Counting of the Omer",
      Passover: "Passover",
      Shavuot: "Shavuot",
      Torah: "Torah",
    },
    photo: {
      src: "/modules/photos/omer-counter.jpg",
      alt: "Part of a painted scroll with a panel for each day of the Omer, each with a large number among flowers",
      caption: "Omer calendar, 1804",
      credit: "Omer calendar, Italy, 1804, Jewish Museum London. Photo by Ethan Doyle White (cropped)",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:19th_Century_Italian_Omer_Calendar_at_the_Jewish_Museum_London.jpg",
      landscape: true,
    },
    kicker: "A Jewish practice",
    lede: "Forty-nine numbered marks for the Counting of the Omer, the seven weeks from the second night of Passover to Shavuot.",
    sections: [
      {
        heading: "The count",
        paragraphs: [
          "The Torah commands a count of seven weeks from the offering of the omer, the first sheaf of the barley harvest, at Passover:",
        ],
        quote: {
          lines: [
            "And ye shall count unto you from the morrow after the day of rest, from the day that ye brought the sheaf of the waving; seven weeks shall there be complete;",
            "even unto the morrow after the seventh week shall ye number fifty days...",
          ],
          cite: "Leviticus 23:15 and 16, The Holy Scriptures, Jewish Publication Society (1917)",
        },
      },
      {
        heading: "Night by night",
        paragraphs: [
          "The offering ended with the Temple, but the count goes on. Each night, once it is fully dark, the day is counted aloud after a blessing: today is one day of the Omer, and so on through forty-nine. Shavuot falls on the fiftieth day.",
          "If you forget at night, you can still count during the next day, without the blessing. If a whole day goes by, the usual practice is to keep counting without it. Customs differ, so follow your community's.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Forty-nine numbered marks, grouped in weeks of seven. It goes once, at the front of the book. Mark each night's number after you count it, and the page shows at a glance whether the count is unbroken.",
          "The scroll above, made in Italy in 1804, is an Omer calendar, with a painted panel for each day of the count.",
        ],
      },
    ],
    sources: [
      { text: "The Holy Scriptures According to the Masoretic Text (Jewish Publication Society, 1917): Leviticus 23.", url: "https://mechon-mamre.org/e/et/et0323.htm" },
    ],
  },
  {
    slug: "parashah-study",
    wiki: {
      "Torah portion": "Weekly Torah portion",
      Torah: "Torah",
      Moses: "Moses",
      Shabbat: "Shabbat",
      "Simchat Torah": "Simchat Torah",
    },
    photo: {
      src: "/modules/photos/parashah-study.jpg",
      alt: "A Torah scroll open on its wooden rollers, with a silver pointer lying in front of it",
      caption: "Torah scroll",
      credit: "Torah scroll, Eastern Europe, mid-1800s, Jewish Museum of Australia. Photo by Azoma (cropped)",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Torah_at_the_state_library_of_Victoria.jpg",
      unfranked: true,
      landscape: true,
    },
    kicker: "A Jewish practice",
    lede: "The week's Torah portion, what stood out in it, and what it asks of you.",
    sections: [
      {
        heading: "The weekly portion",
        paragraphs: [
          "The Torah, the five books of Moses, is read aloud in synagogue over the course of a year, in 54 weekly portions. Each portion is named for one of its first words. Part of it is read on Shabbat afternoon and on Monday and Thursday mornings, and the whole portion on the next Shabbat morning.",
          "The cycle ends and begins again on Simchat Torah, in the autumn. Some years have fewer weeks to fill than others, so in those years some portions are read together.",
        ],
      },
      {
        heading: "Why study it",
        paragraphs: [
          "Studying the week's portion puts you on the same page as everyone else reading it that week. The Torah itself asks for its words to be part of ordinary days:",
        ],
        quote: {
          lines: [
            "And these words, which I command thee this day, shall be upon thy heart;",
            "and thou shalt teach them diligently unto thy children, and shalt talk of them when thou sittest in thy house, and when thou walkest by the way, and when thou liest down, and when thou risest up.",
          ],
          cite: "Deuteronomy 6:6 and 7, The Holy Scriptures, Jewish Publication Society (1917)",
        },
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Three prompts with two lines each, on the weekly spread. Write the portion's name and where it starts, then what stood out to you, then what it asks of you this week.",
          "Any Jewish calendar or synagogue newsletter gives the week's portion.",
        ],
      },
    ],
    sources: [
      { text: "The Holy Scriptures According to the Masoretic Text (Jewish Publication Society, 1917): Deuteronomy 6.", url: "https://mechon-mamre.org/e/et/et0506.htm" },
    ],
  },
  {
    slug: "metta-practice",
    wiki: {
      Metta: "Maitrī",
      Pali: "Pali",
      "Metta Sutta": "Metta Sutta",
      "Sutta Nipata": "Sutta Nipata",
      Theravada: "Theravada",
      Buddhaghosa: "Buddhaghosa",
      Visuddhimagga: "Visuddhimagga",
    },
    photo: {
      src: "/modules/photos/metta-practice.jpg",
      alt: "A large seated Buddha carved from granite rock, eyes lowered in meditation",
      caption: "Gal Vihara",
      credit: "The seated Buddha of Gal Vihara, Polonnaruwa, Sri Lanka, twelfth century. Photo by Philip Nalangan (cropped)",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Gal_Vihara_Polonnaruwa.jpg",
    },
    kicker: "A Buddhist practice",
    lede: "Loving-kindness wished one person at a time, moving outward: yourself, someone you love, someone neutral, someone difficult, then all beings.",
    sections: [
      {
        heading: "Metta",
        paragraphs: [
          "Metta is a Pali word for loving-kindness or friendliness: wishing others well, and meaning it. The best-known teaching on it is the Metta Sutta, ten short verses in the Sutta Nipata, an early collection of the Buddha's discourses. Theravada monks still chant it.",
        ],
        quote: {
          lines: [
            "As a mother at the risk of her life watches over her own child, her only child, so also let every one cultivate a boundless (friendly) mind towards all beings.",
            "And let him cultivate goodwill towards all the world, a boundless (friendly) mind, above and below and across, unobstructed, without hatred, without enmity.",
          ],
          cite: "The Metta Sutta, Sutta Nipata 1.8, verses 7 and 8, translated by V. Fausböll (1881)",
        },
      },
      {
        heading: "One person at a time",
        paragraphs: [
          "The order on this module comes from later teachers. Buddhaghosa's Visuddhimagga, a manual of practice written in Sri Lanka in the fifth century, starts with yourself, then someone dear, then someone neutral, then someone hostile, until the goodwill makes no distinction between them. Modern teachers usually end with all beings.",
          "Starting with yourself is not selfish. The Visuddhimagga's reason is that once you see how much you want to be happy, you can see that everyone else wants it too.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Five prompts with a line each, on the daily page: Myself, Someone I love, Someone neutral, Someone difficult, All beings. Sit for a minute or two with each, and wish them well in a simple phrase, such as may you be safe, may you be happy. Then write the name and the phrase you used.",
          "Someone neutral can be anyone you passed today without a second thought: the bus driver, the person at the next desk.",
        ],
      },
    ],
    sources: [
      { text: "The Sutta-Nipâta, translated by V. Fausböll, in The Sacred Books of the East, volume 10, part 2 (Oxford, 1881): the Mettasutta.", url: "https://archive.org/details/mlbd.dhammapadasuttni0000fmax" },
      { text: "Buddhaghosa, Visuddhimagga, chapter 9, on loving-kindness." },
    ],
  },
  {
    slug: "ramadan-log",
    wiki: {
      Ramadan: "Ramadan",
      "Islamic calendar": "Islamic calendar",
      Quran: "Quran",
      "Five Pillars of Islam": "Five Pillars of Islam",
      Taraweeh: "Tarawih",
      Sadaqah: "Sadaqah",
      Dhikr: "Dhikr",
      "Laylat al-Qadr": "Night of Power",
      "Marmaduke Pickthall": "Marmaduke Pickthall",
    },
    photo: {
      src: "/modules/photos/ramadan-log.jpg",
      alt: "Brightly colored Ramadan lanterns in gold, green and blue, for sale on a market stall",
      caption: "Ramadan, Cairo",
      credit: "Ramadan lanterns, Souq el Maadi, Cairo. Photo by B. Simpson (cropped)",
      license: "CC BY 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Colorful_plastic_ramadan_lanterns.jpg",
      landscape: true,
    },
    kicker: "A Muslim practice",
    lede: "All thirty days of Ramadan on one page, with a box each day for the fast, taraweeh, Quran reading, sadaqah and dhikr.",
    sections: [
      {
        heading: "The month",
        paragraphs: [
          "Ramadan is the ninth month of the Islamic calendar, the month in which the Quran was first revealed. Fasting through it, from dawn until sunset, is one of the Five Pillars of Islam. The month lasts 29 or 30 days, from one sighting of the new crescent moon to the next.",
          "The Islamic year follows the moon and is ten or eleven days shorter than the solar year, so Ramadan comes earlier each year and moves through all the seasons. The Quran gives the fast in the verse below, quoted in the translation Marmaduke Pickthall published in 1930:",
        ],
        quote: {
          lines: [
            "The month of Ramadan in which was revealed the Qur'ân, a guidance for mankind, and clear proofs of the guidance, and the Criterion (of right and wrong). And whosoever of you is present, let him fast the month, and whosoever of you is sick or on a journey, (let him fast the same) number of other days. Allah desireth for you ease; He desireth not hardship for you...",
          ],
          cite: "The Quran, Surah 2 (The Cow), verse 185, translated by Marmaduke Pickthall (1930)",
        },
      },
      {
        heading: "The five columns",
        paragraphs: ["Each day of the month has a box in each column:"],
        list: [
          "Fast: from the meal before dawn, suhur, to iftar at sunset.",
          "Taraweeh: the extra night prayers of Ramadan, in which many mosques recite the whole Quran over the month.",
          "Quran: your own reading for the day, such as one of its thirty parts.",
          "Sadaqah: charity given, of any size.",
          "Dhikr: remembrance of God, in whatever form you keep it.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Thirty numbered rows, one for each day, and five columns to tick. It goes on the monthly spread and fills most of the page.",
          "A fast missed for illness or travel is made up later, as the verse says, so leave that box empty and mark it on the day you make it up. The last ten rows are the last ten nights, when many look for Laylat al-Qadr, the Night of Power.",
        ],
      },
    ],
    sources: [
      { text: "The Meaning of the Glorious Koran, translated by Marmaduke Pickthall (Knopf, 1930): Surah 2, The Cow.", url: "https://en.wikisource.org/wiki/The_Meaning_of_the_Glorious_Koran_(1930)/The_Cow" },
    ],
  },
  {
    slug: "quran-reading-plan",
    wiki: {
      Quran: "Quran",
      "juz'": "Juz'",
      Ramadan: "Ramadan",
      surahs: "Surah",
      taraweeh: "Tarawih",
      "Blue Quran": "Blue Quran",
    },
    photo: {
      src: "/modules/photos/quran-reading-plan.jpg",
      alt: "A page of the Blue Quran: lines of gold Kufic letters on deep blue parchment",
      caption: "The Blue Quran",
      credit: "A folio of the Blue Quran, Chester Beatty Library, Dublin (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Folio_from_the_Blue_Qur%27an_(CBL_Is_1405A,_f._1b).jpg",
      unfranked: true,
      landscape: true,
    },
    kicker: "A Muslim practice",
    lede: "Thirty marks, one for each juz', so the whole Quran can be read in a month, as many do in Ramadan.",
    sections: [
      {
        heading: "Thirty parts",
        paragraphs: [
          "The Quran has 114 surahs, of very different lengths. For reading and recitation it is also divided into thirty parts, each called a juz'. The parts are a division for reading, so one can begin partway through a surah.",
          "In the Middle Ages, mosques often kept their copies of the Quran as sets of thirty volumes, one for each part. In Ramadan today, many mosques recite the whole Quran in the taraweeh prayers, often at a juz' a night.",
        ],
      },
      {
        heading: "At your own pace",
        paragraphs: [
          "A month is a common pace, not a rule. The Quran itself asks for what can be managed:",
        ],
        quote: {
          lines: ["Recite, then, of the Qur'ân that which is easy for you."],
          cite: "The Quran, Surah 73 (The Enshrouded One), verse 20, translated by Marmaduke Pickthall (1930)",
        },
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Thirty numbered marks, grouped in tens. It goes once, at the front of the book. Mark each number as you finish that juz'.",
          "A juz' a day finishes in a month. Two pages a day takes most of a year. Either way, the marks keep your place.",
          "The page above is from the Blue Quran, written in gold on parchment dyed with indigo, sometime between the eighth and tenth centuries.",
        ],
      },
    ],
    sources: [
      { text: "The Meaning of the Glorious Koran, translated by Marmaduke Pickthall (Knopf, 1930): Surah 73, The Enshrouded One.", url: "https://en.wikisource.org/wiki/The_Meaning_of_the_Glorious_Koran_(1930)/The_Enshrouded_One" },
    ],
  },
  {
    slug: "dhikr-counter",
    wiki: {
      dhikr: "Dhikr",
      Quran: "Quran",
      "tasbih of Fatimah": "Tasbih",
      misbaha: "Misbaha",
    },
    photo: {
      src: "/modules/photos/dhikr-counter.jpg",
      alt: "A string of pale prayer beads ending in a metal tassel with two coins",
      caption: "Tasbih, 1909",
      credit: "A tasbih dated 1909. Photo by Looi (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Tasbih1924.jpg",
    },
    kicker: "A Muslim practice",
    lede: "Thirty-three circles to fill in for a round of dhikr, the remembrance of God.",
    sections: [
      {
        heading: "Remembrance",
        paragraphs: [
          "Dhikr means remembrance: words in praise of God, said over and over, aloud or under the breath. The Quran asks for it once the Friday prayer is over:",
        ],
        quote: {
          lines: ["And when the prayer is ended, then disperse in the land and seek of Allah's bounty, and remember Allah much, that ye may be successful."],
          cite: "The Quran, Surah 62 (The Congregation), verse 10, translated by Marmaduke Pickthall (1930)",
        },
      },
      {
        heading: "Thirty-three",
        paragraphs: [
          "After each of the daily prayers, many Muslims say SubhanAllah, glory be to God, Alhamdulillah, praise be to God, and Allahu Akbar, God is greatest, thirty-three times each. One form of the round is called the tasbih of Fatimah, after the Prophet's daughter, to whom he taught it.",
          "Prayer beads, called a misbaha or tasbih, are often strung with 33 or 99 beads to keep the same count.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Thirty-three circles on the daily page, in groups of eleven. Fill one in for each repetition, or one for each round, whichever suits you. Without beads, it keeps the count where you can see it.",
          "A filled page is a record, not a score. The count is there to keep the mind on the words.",
        ],
      },
    ],
    sources: [
      { text: "The Meaning of the Glorious Koran, translated by Marmaduke Pickthall (Knopf, 1930): Surah 62, The Congregation.", url: "https://en.wikisource.org/wiki/The_Meaning_of_the_Glorious_Koran_(1930)/The_Congregation" },
    ],
  },
  {
    slug: "step-four-inventory",
    wiki: {
      "Twelve Steps": "Twelve-step program",
      "Bill Wilson": "Bill W.",
      "Alcoholics Anonymous": "The Big Book (Alcoholics Anonymous)",
      Lois: "Lois W.",
    },
    photo: {
      src: "/modules/photos/step-four-inventory.jpg",
      alt: "A gray-shingled house with four dormer windows, snow on the ground",
      caption: "Stepping Stones",
      credit: "Stepping Stones, the home of Bill and Lois Wilson, Katonah, New York. Photo by Daniel Case (cropped)",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Stepping_Stones,_Katonah,_NY.jpg",
      landscape: true,
    },
    kicker: "A recovery practice",
    lede: "The Fourth Step's resentment list, in four columns: who you resent, the cause, what it affects in you, and your own part.",
    sections: [
      {
        heading: "The Fourth Step",
        paragraphs: [
          "The fourth of the Twelve Steps is a moral inventory: an honest look at yourself, in writing. Bill Wilson wrote the Steps in 1938 for the book Alcoholics Anonymous, which members call the Big Book. It was published in 1939. He and his wife Lois later lived at Stepping Stones, the house above, from 1941 until his death in 1971.",
          "In its chapter \"How It Works,\" the Big Book begins the inventory with resentments and sets them out in columns: the person, institution or principle you resent; the cause; and what it affects in you, such as your self-esteem, your security or your relationships.",
        ],
      },
      {
        heading: "Your own part",
        paragraphs: [
          "Then it asks you to set the other person's wrongs aside and look for your own: where you were selfish, dishonest, self-seeking or frightened. Many people write this as a fourth column, and this module has one.",
          "It is the hardest column, and the one the inventory is for. Most people take the finished list to their sponsor at the Fifth Step.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "A table with four columns, Person, Cause, Affects my and My part, and a row for each resentment. It goes once, at the front of the book, and runs fourteen columns wide so each entry has room.",
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
      { text: "Alcoholics Anonymous (Alcoholics Anonymous World Services, first published 1939), chapter 5, \"How It Works.\"" },
    ],
  },
  {
    slug: "recovery-gratitude-list",
    wiki: {
      "Eric Enstrom": "Eric Enstrom",
      Grace: "Grace (photograph)",
    },
    photo: {
      src: "/modules/photos/recovery-gratitude-list.jpg",
      alt: "A black-and-white photograph of an old man with his head bowed over folded hands, a loaf of bread and a bowl on the table before him",
      caption: "Grace, 1918",
      credit: "Eric Enstrom, Grace, 1918 (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:1918photoGrace-EricEnstrom.jpg",
      landscape: true,
    },
    kicker: "A recovery practice",
    lede: "A short list of what you are grateful for today, a habit many people in recovery keep every day.",
    sections: [
      {
        heading: "Why a list",
        paragraphs: [
          "Many people in recovery keep a gratitude list, often at a sponsor's suggestion: a few things, written down each day, that went right or that they would not want to lose.",
          "It is the other side of the inventory. The inventory looks for what went wrong and your part in it. The list looks for what went right, which on a hard day is easy to forget.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "A short list on the daily page, headed Grateful Today. Write a few things, and make them specific: a call that came at the right time, a good meal, another day without a drink. Specific things are easier to feel grateful for than general ones, and easier to remember later.",
          "The photograph above, Grace, was taken by Eric Enstrom in Bovey, Minnesota, and published in 1918.",
        ],
      },
      {
        heading: "A note",
        paragraphs: [
          "Memari is not affiliated with Alcoholics Anonymous or any twelve-step fellowship. This module is a page to write on, not a program. Your sponsor and your group are the people to work your recovery with.",
        ],
      },
    ],
    sources: [],
  },
  {
    slug: "sponsor-contact-log",
    wiki: {
      "Alcoholics Anonymous": "Alcoholics Anonymous",
      "Bill Wilson": "Bill W.",
      "Akron, Ohio": "Akron, Ohio",
      "Henrietta Seiberling": "Henrietta Buckler Seiberling",
      "Bob Smith": "Bob Smith (doctor)",
      "Stan Hywet": "Stan Hywet Hall and Gardens",
    },
    photo: {
      src: "/modules/photos/sponsor-contact-log.jpg",
      alt: "The brick and half-timbered manor house of Stan Hywet Hall above a lawn and terrace",
      caption: "Stan Hywet, Akron",
      credit: "Stan Hywet Hall, Akron, Ohio. Photo by Brandon Bisel (cropped)",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Stan_Hywet_Hall_2.jpg",
      landscape: true,
    },
    kicker: "A recovery practice",
    lede: "Each contact with your sponsor this week: the date, whether you called and whether you spoke, and a note of what you talked about.",
    sections: [
      {
        heading: "One alcoholic to another",
        paragraphs: [
          "Alcoholics Anonymous began with one alcoholic talking to another. In May 1935, Bill Wilson, sober for a few months and alone on a business trip to Akron, Ohio, was tempted to drink and went looking for another alcoholic to talk to. Henrietta Seiberling, of the Akron Oxford Group, arranged for him to meet a local surgeon, Dr. Bob Smith, at the gate lodge of Stan Hywet, the Seiberling family's estate.",
          "Smith agreed to fifteen minutes. As AA tells the story, they talked for hours. Smith's last drink, on June 10, 1935, is taken as the day AA was founded.",
          "A sponsor makes that arrangement last: a member with some time sober who helps a newer one through the steps, and who answers the phone.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "A small table on the weekly spread, with four columns: Date, Called, Spoke and Note. Tick Called when you reached out and Spoke when you actually talked, since the two are not always the same. Keep the note short: what you talked about, or what to bring up next time.",
          "Many sponsors ask someone new to call every day. A week on one table shows whether that is happening.",
        ],
      },
      {
        heading: "A note",
        paragraphs: [
          "Memari is not affiliated with Alcoholics Anonymous or any twelve-step fellowship. This module is a page to write on, not a program. Your sponsor and your group are the people to work your recovery with.",
        ],
      },
    ],
    sources: [],
  },
  {
    slug: "meeting-log",
    wiki: {
      "Alcoholics Anonymous": "Alcoholics Anonymous",
      "Bill Wilson": "Bill W.",
      "East Dorset, Vermont": "East Dorset, Vermont",
    },
    photo: {
      src: "/modules/photos/meeting-log.jpg",
      alt: "A meeting room wall with a Welcome to East Dorset sign above framed recovery slogans",
      caption: "Meeting room",
      credit: "Meeting room at the Wilson House, East Dorset, Vermont. Photo by Artaxerxes (cropped)",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Meeting_room_The_Wilson_House_378_Village_Street_downtown_East_Dorset_VT_August_2026_02.jpg",
      landscape: true,
    },
    kicker: "A recovery practice",
    lede: "The meetings you went to this week, with the date, group and format, and room for a signature where a court or program asks for one.",
    sections: [
      {
        heading: "Meetings",
        paragraphs: [
          "Meetings are where most people in recovery find their footing. By 2001, Alcoholics Anonymous counted about two million members in more than 100,000 groups.",
          "Formats differ. At a speaker meeting, one member tells their story. At a discussion meeting, members share on a topic. A Big Book or step study reads the literature together. Open meetings welcome anyone, and closed meetings are for people who want to stop drinking.",
          "The room above is in the Wilson House in East Dorset, Vermont, where Bill Wilson was born.",
        ],
      },
      {
        heading: "Proof of attendance",
        paragraphs: [
          "Courts, probation offices and treatment programs sometimes ask for proof that someone went to meetings, usually a signed card or sheet. Whether a meeting signs is up to each group, so ask the chairperson or secretary. A signature column keeps those signatures in one place instead of on loose slips.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "A table on the weekly spread with four columns: Date, Group, Format and Signature. It runs fourteen columns wide so a signature fits.",
        ],
      },
      {
        heading: "A note",
        paragraphs: [
          "Memari is not affiliated with Alcoholics Anonymous or any twelve-step fellowship, and a page in this book is not an official attendance record. Check with your court or program what they accept.",
        ],
      },
    ],
    sources: [],
  },
  {
    slug: "ninety-in-ninety",
    wiki: {
      "Bill Wilson": "Bill W.",
      "East Dorset, Vermont": "East Dorset, Vermont",
    },
    photo: {
      src: "/modules/photos/ninety-in-ninety.jpg",
      alt: "The Wilson House, a red clapboard building with white trim, on a village street",
      caption: "East Dorset, Vermont",
      credit: "The Wilson House, East Dorset, Vermont. Photo by Artaxerxes (cropped)",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:The_Wilson_House_378_Village_Street_East_Dorset_VT_April_2023_03.jpg",
      landscape: true,
    },
    kicker: "A recovery practice",
    lede: "Ninety cells, one for each meeting, toward the ninety meetings in ninety days often suggested to someone new to recovery.",
    sections: [
      {
        heading: "Ninety in ninety",
        paragraphs: [
          "Ninety meetings in ninety days is one of the first suggestions many newcomers hear. It is advice, not a rule of any fellowship. The early months are often the hardest, and a meeting every day fills the hours, builds a habit and puts you among people who have stayed sober.",
          "Many groups mark thirty, sixty and ninety days with a coin or chip, and the module numbers those three.",
          "The Wilson House in East Dorset, Vermont, above, is where Bill Wilson was born. It has a meeting room of its own.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Ninety cells, numbered at 30, 60 and 90. It goes once, at the front of the book. Fill a cell for each meeting.",
          "If you miss a day, do not start over at one. Keep filling cells until there are ninety. On a hard day some people go to two meetings, and both count.",
        ],
      },
      {
        heading: "A note",
        paragraphs: [
          "Memari is not affiliated with Alcoholics Anonymous or any twelve-step fellowship. This module is a page to write on, not a program. Your sponsor and your group are the people to work your recovery with.",
        ],
      },
    ],
    sources: [],
  },
  {
    slug: "halt-check-in",
    wiki: {
      "Akron, Ohio": "Akron, Ohio",
      "Bill Wilson": "Bill W.",
      "Bob Smith": "Bob Smith (doctor)",
      "Alcoholics Anonymous": "Alcoholics Anonymous",
    },
    photo: {
      src: "/modules/photos/halt-check-in.jpg",
      alt: "A colored postcard of the Mayflower Hotel, a tall yellow-brick tower on a street corner",
      caption: "Mayflower, Akron",
      credit: "The Mayflower Hotel, Akron, Ohio, on a linen postcard by Tichnor (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Mayflower_Hotel,_Akron,_Ohio_(74484).jpg",
    },
    kicker: "A recovery practice",
    lede: "Are you hungry, angry, lonely or tired? Rate each from one to five, so a hard moment has a likely cause written in front of you.",
    sections: [
      {
        heading: "HALT",
        paragraphs: [
          "HALT stands for hungry, angry, lonely and tired, four states that make a craving, or any bad decision, more likely. Recovery groups teach it as a quick check: when something feels wrong, halt, and ask which of the four it is.",
          "Each has a plain answer. Eat something. Talk the anger through with someone. Call someone. Rest.",
        ],
      },
      {
        heading: "Lonely in Akron",
        paragraphs: [
          "AA's own story starts with one of the four. In May 1935, Bill Wilson was alone in Akron, Ohio, after a business deal fell through. As AA tells it, he stood in the lobby of the Mayflower Hotel, with its bar in view, and instead of going in he looked for another alcoholic to talk to. The calls he made from the lobby led him to Dr. Bob Smith, and the two of them went on to found Alcoholics Anonymous.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Four rows on the daily page, Hungry, Angry, Lonely and Tired, each with five circles from one to five. Fill them in at the same time each day, or whenever a day turns hard.",
          "Over a week, the pattern shows which of the four comes up most, and that is the one to plan for.",
        ],
      },
      {
        heading: "A note",
        paragraphs: [
          "Memari is not affiliated with Alcoholics Anonymous or any twelve-step fellowship. This module is a page to write on, not a program. Your sponsor and your group are the people to work your recovery with.",
        ],
      },
    ],
    sources: [],
  },
  {
    slug: "ivy-lee-six",
    wiki: {
      "Ivy Lee": "Ivy Lee",
      "public relations": "Public relations",
      "Charles M. Schwab": "Charles M. Schwab",
      "Bethlehem Steel": "Bethlehem Steel",
    },
    photo: {
      src: "/modules/photos/ivy-lee-six.jpg",
      alt: "A black-and-white portrait of Ivy Lee, a man in a dark suit and high white collar",
      caption: "Ivy Lee",
      credit: "Ivy Lee, photographed by Harris & Ewing (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Ivy_Lee.jpg",
    },
    kicker: "A planning method",
    lede: "At the end of each day, write the six most important tasks for tomorrow, in order. Tomorrow, work down the list.",
    sections: [
      {
        heading: "Ivy Lee",
        paragraphs: [
          "Ivy Lee (1877 to 1934) was one of the founders of modern public relations. The method carries his name because of a story about Charles M. Schwab, the head of Bethlehem Steel.",
          "As it is usually told, around 1918 Schwab asked Lee how his managers could get more done. Lee gave them a few minutes of advice and asked to be paid whatever Schwab thought it was worth, and a few months later Schwab sent him a check for $25,000. No record from the time has been found, and the story reaches us through later retellings, so treat the details as legend. The method does not depend on them.",
        ],
      },
      {
        heading: "The method",
        paragraphs: ["It has five steps:"],
        list: [
          "At the end of the day, write down the six most important things to do tomorrow. No more than six.",
          "Number them in order of their real importance.",
          "Tomorrow, start on number one and stay with it until it is done. Then move to number two.",
          "At the end of the day, carry anything unfinished onto the next day's six.",
          "Repeat every working day.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Six numbered lines on the daily page, fixed at six however tall the page around them grows. The limit is the point: six makes you choose, and the order means you never have to decide what comes next.",
          "Fill it in the evening before, on the next day's page, so the morning starts with number one.",
        ],
      },
    ],
    sources: [],
  },
  {
    slug: "future-log-months",
    wiki: {
      "Bullet Journal": "Bullet journal",
    },
    photo: {
      src: "/modules/photos/future-log-months.jpg",
      alt: "A handwritten Bullet Journal week in black and red ink, decorated with washi tape and hand lettering",
      caption: "A Bullet Journal",
      credit: "A Bullet Journal week, 2017. Photo by Nea.salo (cropped)",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Bullet_journal_page.jpg",
      landscape: true,
    },
    kicker: "A planning method",
    lede: "The Bullet Journal's future log: six months with a few lines each, for dates too far ahead for this week's pages.",
    sections: [
      {
        heading: "The Bullet Journal",
        paragraphs: [
          "The Bullet Journal is a way of keeping a planner on paper, made by the designer Ryder Carroll and shared online in 2013. He set it out in full in his book The Bullet Journal Method (2018). It is built from a few plain parts: a daily log, a monthly log, an index and the future log.",
        ],
      },
      {
        heading: "The future log",
        paragraphs: [
          "The future log sits at the front of the notebook and holds anything that belongs to a later month: a birthday in May, a renewal in September, a trip already booked.",
          "When a new month begins, you look at its part of the future log and copy what is there onto that month's pages. Carroll calls this moving of entries from one place to another migration.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Six months with three lines each, once at the front of the book. The months are the book's own, so a book that starts in October lists October to March. Write the date beside each entry, and check the log whenever you turn to a new month.",
        ],
      },
    ],
    sources: [{ text: "Ryder Carroll, The Bullet Journal Method (Portfolio, 2018)." }],
  },
  {
    slug: "index",
    wiki: {
      "Bullet Journal": "Bullet journal",
    },
    photo: {
      src: "/modules/photos/index.jpg",
      alt: "A hand-drawn sketchnote summarizing the Bullet Journal method, with boxed notes on topics, calendars and migration",
      caption: "Bullet Journal, 2013",
      credit: "Sketchnote of Ryder Carroll's Bullet Journal, October 2013, by Sacha Chua (cropped)",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:2013-10-23_Sketchnote_Bullet_Journal_(Ryder_Carroll)_-sketchnote_-notetaking_(12798491295).jpg",
      landscape: true,
    },
    kicker: "A planning method",
    lede: "The Bullet Journal's index: topics and the pages they are on, so you can find things again.",
    sections: [
      {
        heading: "Finding things again",
        paragraphs: [
          "A notebook fills up in the order things happen, not the order you will want them back. The Bullet Journal, Ryder Carroll's method from 2013, solves that the way books always have: number the pages, and keep an index at the front.",
          "Whenever you start a collection, such as a reading list, the notes for a project or a plan for a trip, write its name in the index with the page it starts on.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "A two-column table, Topic and Page, once at the front of the book. Add to it as you go rather than all at once. A topic that turns up in several places can list them all: 12, 40, 57.",
          "The sketch above is a note-taker's summary of Carroll's method from October 2013, the year he shared it.",
        ],
      },
    ],
    sources: [{ text: "Ryder Carroll, The Bullet Journal Method (Portfolio, 2018)." }],
  },
  {
    slug: "someday-maybe",
    wiki: {
      "David Allen": "David Allen (author)",
      "Getting Things Done": "Getting Things Done",
    },
    photo: {
      src: "/modules/photos/someday-maybe.jpg",
      alt: "A close-up portrait of David Allen, smiling broadly",
      caption: "David Allen",
      credit: "David Allen. Photo by Robert Scoble (cropped)",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:David_Allen.jpg",
    },
    kicker: "A planning method",
    lede: "Ideas and projects you are not doing yet but do not want to lose, kept where you will see them again.",
    sections: [
      {
        heading: "Getting Things Done",
        paragraphs: [
          "David Allen's Getting Things Done, first published in 2001, rests on one idea: anything you mean to do should be written down somewhere you trust, so your mind is not busy holding it.",
        ],
      },
      {
        heading: "Someday/Maybe",
        paragraphs: [
          "Not everything belongs on this week's list. Allen gives the things you might do one day a list of their own, Someday/Maybe: the language to learn, the long trip, the business idea. Writing them down stops them nagging at you and keeps them from getting lost.",
          "In his weekly review, Allen reads the list through and moves anything whose time has come onto the active lists.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "A lined list, once at the front of the book. Add to it whenever an idea turns up that is not for now.",
          "Read it every so often, and cross out whatever no longer appeals. Letting an idea go is as useful as starting one.",
        ],
      },
    ],
    sources: [{ text: "David Allen, Getting Things Done: The Art of Stress-Free Productivity (Viking, 2001; revised 2015)." }],
  },
  {
    slug: "waiting-on",
    wiki: {
      "Getting Things Done": "Getting Things Done",
      "David Allen": "David Allen (author)",
    },
    photo: {
      src: "/modules/photos/waiting-on.jpg",
      alt: "A painting of a woman leaning on a white fence beside a mailbox, a dog sitting below her",
      caption: "Waiting for the Mail",
      credit: "Grant Wright Christian, Waiting for the Mail, mural study for the post office in Nappanee, Indiana, Smithsonian American Art Museum (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Waiting_for_the_Mail_(mural_study,_Nappanee,_Indiana_Post_Office)_SAAM-1974.28.298_1.jpg",
      landscape: true,
    },
    kicker: "A planning method",
    lede: "What you are waiting for from other people: who, what, and since when.",
    sections: [
      {
        heading: "The Waiting For list",
        paragraphs: [
          "In Getting Things Done, David Allen keeps a separate list for everything you have handed to someone else or are expecting from them: the reply to an email, a part on order, a decision from your manager. He calls it Waiting For.",
          "Keeping it separate means your own lists hold only what you can act on, and nothing you are owed slips out of sight.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "A table on the weekly spread with three columns: Who, What and Since. The date matters most, because it tells you when to follow up. Cross out what arrives.",
          "At the end of the week, chase anything that has waited too long, and carry the rest to next week's spread.",
        ],
      },
    ],
    sources: [{ text: "David Allen, Getting Things Done: The Art of Stress-Free Productivity (Viking, 2001; revised 2015)." }],
  },
  {
    slug: "abc-priority-list",
    wiki: {
      "Alan Lakein": "Alan Lakein",
      "Franklin Planner": "Franklin Planner",
      "Hyrum W. Smith": "Hyrum W. Smith",
    },
    photo: {
      src: "/modules/photos/abc-priority-list.jpg",
      alt: "An open Franklin Planner binder with printed daily pages, loose forms and a pen",
      caption: "Franklin Planner",
      credit: "A Franklin Planner, about 2004. Photo by Rorybowman (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:FranklinPlanner.png",
    },
    kicker: "A planning method",
    lede: "Mark each task A, B or C by how much it is worth doing, then work through the A's first.",
    sections: [
      {
        heading: "Alan Lakein",
        paragraphs: [
          "The ABC list comes from Alan Lakein's How to Get Control of Your Time and Your Life, published in 1973. It sold more than three million copies, and Bill Clinton opens his memoir, My Life, by remembering it.",
          "Lakein's point is that a to-do list is not a plan until it is sorted by value. Mark each item A for high value, B for medium and C for low. Then do the A's, and leave the C's without guilt: most of them can wait, and some never need doing.",
        ],
      },
      {
        heading: "Letters and numbers",
        paragraphs: [
          "The Franklin Planner, created by Hyrum W. Smith and popular in the 1980s and 1990s, pairs the letters with numbers, A1, A2, B1, so the order within each letter is decided too. The planner in the photograph above is one of them.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "A table on the daily page: a narrow column for the letter, a wide one for the task and a box for done. Write the list first, then go back and mark the letters, then add numbers if you use them. Start on A1.",
        ],
      },
    ],
    sources: [{ text: "Alan Lakein, How to Get Control of Your Time and Your Life (New American Library, 1973)." }],
  },
  {
    slug: "franklin-virtues",
    wiki: {
      "Benjamin Franklin": "Benjamin Franklin",
      Autobiography: "The Autobiography of Benjamin Franklin",
      Passy: "Passy",
      "Golden Verses": "Golden Verses",
      Pythagoras: "Pythagoras",
      "Menachem Mendel Lefin": "Menachem Mendel Lefin",
    },
    photo: {
      src: "/modules/photos/franklin-virtues.jpg",
      alt: "Joseph Duplessis's portrait of an elderly Benjamin Franklin in a gray coat with a fur collar",
      caption: "Benjamin Franklin",
      credit: "Joseph Duplessis, Benjamin Franklin, about 1785 (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Joseph_Siffrein_Duplessis_-_Benjamin_Franklin_-_Google_Art_Project.jpg",
    },
    kicker: "A practice of character",
    lede: "Benjamin Franklin's thirteen virtues, charted as he kept them: a line for each virtue, a column for each day, and a spot for every fault.",
    sections: [
      {
        heading: "A bold and arduous project",
        paragraphs: [
          "In 1733, at 27, Benjamin Franklin set out to make himself a better man by method. Half a century later he told the story in the part of his Autobiography he wrote at Passy, near Paris, in 1784:",
        ],
        quote: {
          lines: [
            "It was about this time I conceived the bold and arduous project of arriving at moral perfection. I wish'd to live without committing any fault at any time; I would conquer all that either natural inclination, custom, or company might lead me into.",
          ],
          cite: "Benjamin Franklin, Autobiography, written in 1784, in Frank Woodworth Pine's edition (1916)",
        },
      },
      {
        heading: "The little book",
        paragraphs: [
          "He chose thirteen virtues, from Temperance to Humility, and gave each a short rule. The idea of examining himself every day he took from the Golden Verses of Pythagoras, the same lines the Stoic Evening Review comes from. Then he made a chart:",
        ],
        quote: {
          lines: [
            "I made a little book, in which I allotted a page for each of the virtues. I rul'd each page with red ink, so as to have seven columns, one for each day of the week, marking each column with a letter for the day. I cross'd these columns with thirteen red lines, marking the beginning of each line with the first letter of one of the virtues, on which line, and in its proper column, I might mark, by a little black spot, every fault I found upon examination to have been committed respecting that virtue upon that day.",
          ],
          cite: "Benjamin Franklin, Autobiography, written in 1784, in Frank Woodworth Pine's edition (1916)",
        },
      },
      {
        heading: "Did it work?",
        paragraphs: [
          "He gave each week to one virtue, watching it closely while the others took their chance, so one course took thirteen weeks and four courses filled a year. It did not make him perfect, and he said so:",
        ],
        quote: {
          lines: [
            "In truth, I found myself incorrigible with respect to Order; and now I am grown old, and my memory bad, I feel very sensibly the want of it. But, on the whole, tho' I never arrived at the perfection I had been so ambitious of obtaining, but fell far short of it, yet I was, by the endeavour, a better and a happier man than I otherwise should have been if I had not attempted it...",
          ],
          cite: "Benjamin Franklin, Autobiography, written in 1784, in Frank Woodworth Pine's edition (1916)",
        },
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Thirteen rows, one for each virtue, in Franklin's order and his spelling, and a column for each day of the week. Mark a spot for each fault, as he did, and give the week to one virtue.",
          "The chart outlived him. In 1808, Rabbi Menachem Mendel Lefin adapted it into Cheshbon HaNefesh, the method the Mussar Trait module follows.",
        ],
      },
    ],
    sources: [
      { text: "Autobiography of Benjamin Franklin, edited by Frank Woodworth Pine (Henry Holt, 1916).", url: "https://www.gutenberg.org/ebooks/20203" },
    ],
  },
  {
    slug: "smart-goal",
    wiki: {
      SMART: "SMART criteria",
      "management by objectives": "Management by objectives",
      "Peter Drucker": "Peter Drucker",
    },
    photo: {
      src: "/modules/photos/smart-goal.jpg",
      alt: "A black-and-white photograph of Peter Drucker, seated in a light suit in front of bookshelves",
      caption: "Peter Drucker",
      credit: "Peter Drucker. Photo by Jeff McNeill (cropped)",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Drucker5789.jpg",
    },
    kicker: "A planning method",
    lede: "Write one goal five ways: specific, measurable, achievable, relevant and time-bound.",
    sections: [
      {
        heading: "Where it comes from",
        paragraphs: [
          "SMART comes from a short article by George T. Doran in the November 1981 issue of Management Review, about how managers should write their objectives. It grew out of management by objectives, the approach Peter Drucker set out in the 1950s.",
          "In Doran's version, the A stood for assignable, meaning someone is named to do it, and the R for realistic. Most versions since use achievable and relevant, as this module does.",
        ],
      },
      {
        heading: "Why it helps",
        paragraphs: [
          "A wish becomes a goal when you could tell, on a given date, whether it happened. Get fit is a wish. Run five kilometers without stopping by June 1 is a goal. The five questions are a way to turn the first into the second.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Five prompts with a line each, once at the front of the book: Specific, Measurable, Achievable, Relevant, Time-bound. Write the goal in the heading, then a line under each.",
          "If a line will not fill, the goal needs more thought, and that is worth knowing early.",
        ],
      },
    ],
    sources: [{ text: "George T. Doran, \"There's a S.M.A.R.T. Way to Write Management's Goals and Objectives,\" Management Review 70, no. 11 (November 1981)." }],
  },
  {
    slug: "gratitude-three",
    wiki: {
      "Martin Seligman": "Martin Seligman",
      "University of Pennsylvania": "University of Pennsylvania",
    },
    photo: {
      src: "/modules/photos/gratitude-three.jpg",
      alt: "Martin Seligman, in a dark suit and striped tie, speaking across a table",
      caption: "Martin Seligman",
      credit: "Martin Seligman. U.S. Army photo by D. Myles Cullen (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Flickr_-_The_U.S._Army_-_Comprehensive_Soldiers_Fitness_(1)cropped.jpg",
    },
    kicker: "A tested exercise",
    lede: "Three good things from today, numbered, written down before bed.",
    sections: [
      {
        heading: "The study",
        paragraphs: [
          "In 2005, the psychologist Martin Seligman and his colleagues at the University of Pennsylvania tested several short exercises online, against a placebo exercise of writing about early memories. One was to write down, each night for a week, three things that went well that day and why they went well.",
          "The people who kept it were happier and less depressed than the placebo group, and the difference was still there six months later. Many kept the habit long after the week was over.",
        ],
      },
      {
        heading: "Why it might work",
        paragraphs: [
          "Bad things get noticed without any help, but good ones are easy to let pass. Writing them down makes you look for them, and writing why they happened adds a second look: what you, or someone else, did to make them go well.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Three numbered lines on the daily page, headed Grateful For. Write each good thing, small or large, and a few words on why it happened. Do it at night, when the day is complete.",
        ],
      },
    ],
    sources: [{ text: "Martin E. P. Seligman, Tracy A. Steen, Nansook Park and Christopher Peterson, \"Positive Psychology Progress: Empirical Validation of Interventions,\" American Psychologist 60, no. 5 (2005), pages 410 to 421." }],
  },
  {
    slug: "habit-stacking",
    wiki: {
      "Peter Gollwitzer": "Peter Gollwitzer",
      "implementation intentions": "Implementation intention",
      "B. J. Fogg": "B. J. Fogg",
      "James Clear": "James Clear",
      "Atomic Habits": "Atomic Habits",
    },
    photo: {
      src: "/modules/photos/habit-stacking.jpg",
      alt: "B. J. Fogg speaking at a lectern, one hand raised",
      caption: "B. J. Fogg",
      credit: "B. J. Fogg. Photo by Kris Krüg (cropped)",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:B_J_Fogg_1.jpg",
    },
    kicker: "A planning method",
    lede: "Two columns, After I and I will, to tie each new habit to one you already do.",
    sections: [
      {
        heading: "Where it comes from",
        paragraphs: [
          "In 1999, the psychologist Peter Gollwitzer described plans in the form when this happens, I will do that, and showed that they make a goal more likely to be carried out than a plain intention. He called them implementation intentions.",
          "The Stanford researcher B. J. Fogg built his Tiny Habits method, from 2011, on a recipe in the same shape: after I do something I already do, I will do the new thing. James Clear popularized the pattern as habit stacking in his book Atomic Habits (2018).",
        ],
      },
      {
        heading: "Why it works",
        paragraphs: [
          "A habit you already have happens at a set time and place without a decision. Tying the new habit to it borrows that cue. After I pour my morning coffee, I will write three lines. After I sit down on the train, I will read one page.",
        ],
      },
      {
        heading: "How the module works",
        paragraphs: [
          "Two columns, After I and I will, once at the front of the book. Keep the new habit small enough that it is hard to skip, and make the anchor something you really do every day.",
        ],
      },
    ],
    sources: [
      { text: "Peter M. Gollwitzer, \"Implementation Intentions: Strong Effects of Simple Plans,\" American Psychologist 54, no. 7 (1999)." },
      { text: "B. J. Fogg, Tiny Habits (Houghton Mifflin Harcourt, 2019)." },
      { text: "James Clear, Atomic Habits (Avery, 2018)." },
    ],
  },
];

export function wikiUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_")).replaceAll("%2C", ",")}`;
}

function phraseAt(text: string, phrase: string): number {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.search(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u"));
}

/**
 * A run of a guide's prose with its Wikipedia links: the first time each
 * phrase in `pending` appears, as a whole word, it becomes a link and leaves
 * `pending` - so call it on the page's prose in reading order with one set.
 */
export function wikiRuns(text: string, wiki: Record<string, string>, pending: Set<string>): Array<string | { text: string; url: string }> {
  const runs: Array<string | { text: string; url: string }> = [];
  let rest = text;
  for (;;) {
    let first: { at: number; phrase: string } | null = null;
    for (const phrase of pending) {
      const at = phraseAt(rest, phrase);
      if (at >= 0 && (!first || at < first.at || (at === first.at && phrase.length > first.phrase.length))) first = { at, phrase };
    }
    if (!first) break;
    if (first.at > 0) runs.push(rest.slice(0, first.at));
    runs.push({ text: first.phrase, url: wikiUrl(wiki[first.phrase]) });
    pending.delete(first.phrase);
    rest = rest.slice(first.at + first.phrase.length);
  }
  if (rest) runs.push(rest);
  return runs;
}

/**
 * The sections of memari.studio/modules, which groups the practices as the
 * module drawer does: a line for each, and a stamp ("on each section on the
 * where the modules come from page should have a relevant stamp as well",
 * 2026-10-16). Recovery reuses Dr. Bob's house from the Step Ten page.
 */
export const GUIDE_SECTIONS: Record<string, { lede: string; photo: GuidePhoto }> = {
  "Philosophy & faith": {
    lede: "Prayers, ways of reading scripture and the exercises of philosophers, from Stoic and Taoist practice to Christian, Jewish, Muslim and Buddhist ones.",
    photo: {
      src: "/modules/photos/section-philosophy-faith.jpg",
      alt: "Rembrandt's painting of an old man seated by a sunlit window, beside a winding staircase",
      caption: "Rembrandt, 1632",
      credit: "Rembrandt, Philosopher in Meditation, 1632, Louvre (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Rembrandt_-_The_Philosopher_in_Meditation_(cleaned).jpg",
      landscape: true,
    },
  },
  Recovery: {
    lede: "Pages for working the Twelve Steps, and for the daily habits of recovery around them.",
    photo: {
      src: "/modules/photos/step-ten-inventory.jpg",
      alt: "A white two-story house with a front porch, on a green lawn",
      caption: "Akron, Ohio",
      credit: "Dr. Robert Smith's house in Akron, where Alcoholics Anonymous began in 1935. Photo by Nyttend (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Dr._Bob%27s_House.jpg",
      landscape: true,
    },
  },
  Planning: {
    lede: "Named ways of deciding what to do and when, from Eisenhower's two kinds of problems to the Bullet Journal.",
    photo: {
      src: "/modules/photos/section-planning.jpg",
      alt: "The page for March from Poor Richard's almanac of 1733: a verse above a printed calendar of the month",
      caption: "Poor Richard, 1733",
      credit: "March, from Benjamin Franklin's almanac Poor Richard for 1733 (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Poor_Richard_March_1733.jpg",
    },
  },
  Growth: {
    lede: "Methods for changing yourself a little at a time, from Benjamin Franklin's chart of virtues to habit stacking.",
    photo: {
      src: "/modules/photos/section-growth.jpg",
      alt: "An engraving of the young Benjamin Franklin in an apron, standing beside a wooden printing press",
      caption: "Franklin, apprentice",
      credit: "H. Scheibler, Benjamin Franklin as a printer's apprentice (cropped)",
      license: "Public domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Benjamin_Franklin_as_an_apprentice.jpg",
      landscape: true,
    },
  },
};

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
