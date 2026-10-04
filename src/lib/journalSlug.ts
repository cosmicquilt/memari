// A JOURNAL'S ADDRESS, in words: /app/j/frosty-otter-4821.
//
// Asked 2026-10-04: "make the unique links for journals to be like
// animals, food, kinda like the neon db purple rice etc and numbers". A word
// that describes - a colour, the weather, a mood - then an animal or a food,
// then four digits. Easy to read out, to recognise in a tab, and to tell two
// journals apart by; tens of millions of them (journalSlug.test counts), so
// a fresh one is found at the first try almost always.
//
// The address is a NAME, not a key: a journal still has its database id,
// which everything inside the app uses. A slug only finds the journal, and
// only for its owner - the same 404 as before for anyone else's - so it does
// not have to be unguessable the way the id happened to be.
//
// NOTHING THAT CAN READ AS AN INSULT. "make sure it doesn't have black
// monkey in it or something" (2026-10-04). So the lists are curated, not
// drawn from a dictionary, and every pairing has to be one somebody is happy
// to see on their own journal:
//   - no colour that is also a word for people (black, white, brown, yellow,
//     red) and no skin-tone words (dusky, caramel);
//   - no primates at all, and no animal or food that is used as a slur or a
//     stereotype (banana, coconut, cocoa, taco, ginger, raccoon, apple...);
//   - no numbers that are hate codes or crude (anything with 88, 666 or 69,
//     and 1312).
// journalSlug.test.mts holds a blocklist of these and fails if one is ever
// added back. No word is in both lists, so no address repeats a word.

export const SLUG_DESCRIBERS: readonly string[] = [
  "amber", "azure", "breezy", "bright", "brisk", "calm", "cheery", "clever", "cobalt", "coral",
  "cosmic", "cozy", "crimson", "crisp", "dewy", "dreamy", "frosty", "fuzzy", "gentle", "glowing",
  "golden", "happy", "hazy", "humble", "ivory", "jade", "jolly", "lilac", "lively", "lucky",
  "lunar", "mellow", "merry", "mild", "minty", "misty", "mossy", "navy", "nimble", "pastel",
  "peppy", "plush", "polar", "proud", "purple", "quiet", "rainy", "rosy", "ruby", "rustic",
  "silky", "silver", "sleepy", "snowy", "sparkly", "spry", "stormy", "sturdy", "sunny", "swift",
  "teal", "tender", "tidy", "toasty", "velvet", "violet", "wavy", "windy", "witty", "woolly",
  "zesty",
];

export const SLUG_THINGS: readonly string[] = [
  // Animals - no primates.
  "alpaca", "badger", "beaver", "bison", "bunny", "chipmunk", "crane", "dolphin", "egret", "falcon",
  "finch", "fox", "gazelle", "gecko", "hare", "hedgehog", "heron", "ibis", "jay", "koala",
  "lark", "llama", "lynx", "magpie", "marmot", "meerkat", "moose", "newt", "ocelot", "octopus",
  "orca", "osprey", "otter", "owl", "panda", "pelican", "penguin", "pony", "puffin", "quail",
  "rabbit", "raven", "robin", "seahorse", "seal", "sloth", "sparrow", "squirrel", "swan", "tapir",
  "tiger", "turtle", "walrus", "whale", "wombat", "wren", "yak", "zebra",
  // Food
  "almond", "apricot", "bagel", "basil", "berry", "biscuit", "carrot", "cashew", "cherry", "crumpet",
  "cookie", "crepe", "cupcake", "custard", "dumpling", "fig", "gelato", "granola", "grape", "guava",
  "kale", "kiwi", "latte", "leek", "lemon", "lentil", "lime", "mango", "melon", "muffin",
  "noodle", "nougat", "oatmeal", "pancake", "papaya", "peach", "pear", "pecan", "pickle", "plum",
  "popcorn", "pretzel", "pudding", "pumpkin", "radish", "rice", "scone", "sorbet", "toast", "toffee",
  "tofu", "truffle", "turnip", "waffle", "walnut", "yogurt",
];

/** frosty-otter-4821: words of letters, then exactly four digits. */
export const JOURNAL_SLUG_PATTERN = /^[a-z]+-[a-z]+-\d{4}$/;

/** Numbers never used: hate codes (88, 1312 - and 1488, which has 88) and
 *  the crude ones (666, 69). */
export const BLOCKED_SLUG_NUMBER = /88|666|69|1312/;

export function isJournalSlug(value: string): boolean {
  return JOURNAL_SLUG_PATTERN.test(value);
}

/** A fresh slug. `random` is Math.random unless a test supplies its own. */
export function makeJournalSlug(random: () => number = Math.random): string {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length) % list.length];
  let number = 1000 + (Math.floor(random() * 9000) % 9000);
  // Walk past a blocked number rather than draw again, so a test's fixed
  // `random` cannot loop forever.
  while (BLOCKED_SLUG_NUMBER.test(String(number))) number = number >= 9999 ? 1000 : number + 1;
  return `${pick(SLUG_DESCRIBERS)}-${pick(SLUG_THINGS)}-${number}`;
}
