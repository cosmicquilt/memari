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
  license: "Public domain" | "CC BY 3.0" | "CC BY 4.0" | "CC BY-SA 3.0";
  licenseUrl?: string;
  /** The picture's page on Wikimedia Commons. */
  sourceUrl: string;
  /** Wider than tall. */
  landscape?: boolean;
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
