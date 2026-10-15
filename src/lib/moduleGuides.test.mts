// THE MODULE PAGES SAY WHAT A PRACTICE IS, PLAINLY AND WITH SOURCES
// (moduleGuides.ts, memari.studio/modules/<slug>). This pins:
//   - every page is for a module the palette offers, and none twice;
//   - our own words keep the plain-words rules the descriptions keep
//     (plainWords.ts) - a quotation keeps its source's words;
//   - every quotation says whose words, and from which translation's year;
//   - every page has its practice's sections and ends its sentences;
//   - the module draws, so a page never shows an empty figure.
//
// Run with: npx tsx src/lib/moduleGuides.test.mts

import { PALETTE_MODULES } from "./moduleRegistry";
import { MODULE_GUIDES, guideProse } from "./moduleGuides";
import { moduleDrawingSvg } from "./moduleGuideDrawing";
import { BANNED_WORDS, BRITISH_SPELLINGS } from "./plainWords";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL ${message}`);
  }
}

const offered = new Set(PALETTE_MODULES.map((m) => m.slug));
const seen = new Set<string>();
for (const guide of MODULE_GUIDES) {
  const at = guide.slug;
  check(offered.has(at), `${at}: has a page but the palette does not offer it`);
  check(!seen.has(at), `${at}: has two pages`);
  seen.add(at);

  check(guide.lede.length >= 40 && guide.lede.length <= 220, `${at}: the lede is ${guide.lede.length} characters - keep it to one or two sentences`);
  check(guide.sections.length >= 2, `${at}: a page needs where the practice comes from and how the module works`);
  check(guide.sections.some((s) => /module/i.test(s.heading)), `${at}: no section says how the module works`);

  for (const text of guideProse(guide)) {
    for (const word of BANNED_WORDS) check(!word.test(text), `${at}: "${text.slice(0, 50)}..." uses ${word}`);
    for (const word of BRITISH_SPELLINGS) check(!word.test(text), `${at}: British spelling ${word}`);
    check(text === text.trim() && !/\s{2,}/.test(text), `${at}: stray spaces in "${text.slice(0, 40)}..."`);
  }
  for (const section of guide.sections) {
    for (const paragraph of section.paragraphs) check(/[.?:"]$/.test(paragraph), `${at}: "${paragraph.slice(-40)}" ends mid-sentence`);
    if (section.quote) {
      check(section.quote.lines.length > 0 && section.quote.lines.every((line) => line.trim().length > 0), `${at}: an empty quotation`);
      check(/\(\d{4}\)|\d{4}/.test(section.quote.cite), `${at}: the quotation "${section.quote.lines[0].slice(0, 30)}..." does not say which year's text it is`);
    }
  }
  for (const source of guide.sources) {
    if (source.url) check(source.url.startsWith("https://"), `${at}: a source link that is not https`);
  }
  const quoted = guide.sections.some((s) => s.quote);
  check(!quoted || guide.sources.length > 0, `${at}: quotes a text but lists no sources`);

  const drawing = moduleDrawingSvg(at);
  check(!!drawing && drawing.markup.includes("<rect") && drawing.widthPx > 0, `${at}: the module does not draw`);
}

if (failures > 0) {
  console.error(`\n${failures} module page check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`Module pages: ${MODULE_GUIDES.length} practices, sourced, plainly written, each module drawn.`);
}
