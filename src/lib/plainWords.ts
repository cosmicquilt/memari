// THE WORDS MEMARI'S OWN WRITING AVOIDS - one list for every check that
// holds text to it (the module descriptions, the module pages). The rules
// came from the Gemini report on AI writing (2026-10-05): the vocabulary that
// marks machine-written text, the "Ultimately" closers, asides set off by
// dashes, and the British spellings most likely to slip into American text.

export const BANNED_WORDS: RegExp[] = [
  /\bdelv(e|es|ed|ing)\b/i,
  /\bunderscor/i,
  /\bshowcas/i,
  /\btapestr/i,
  /\bcrucial/i,
  /\bmeticulous/i,
  /\bnavigat/i,
  /\bseamless/i,
  /\btestament\b/i,
  /\bintricate/i,
  /\bultimately\b/i,
  /\bin essence\b/i,
  /\bit is important to\b/i,
  /\bin today's\b/i,
  /\bjourney\b/i,
  /\bunlock/i,
  /\belevate/i,
  /—|–/, // asides set off by dashes
];

export const BRITISH_SPELLINGS: RegExp[] = [/\bcolour/i, /\bpractis/i, /\bfavourite/i, /\borganis/i, /\btotalled\b/i, /\bcentre\b/i];
