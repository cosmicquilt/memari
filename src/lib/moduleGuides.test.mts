// THE MODULE PAGES SAY WHAT A PRACTICE IS, PLAINLY AND WITH SOURCES
// (moduleGuides.ts, memari.studio/modules/<slug>). This pins:
//   - every page is for a module the palette offers, and none twice;
//   - our own words keep the plain-words rules the descriptions keep
//     (plainWords.ts) - a quotation keeps its source's words;
//   - every quotation says whose words, and from which translation's year;
//   - every page has its practice's sections and ends its sentences;
//   - the module draws, so a page never shows an empty figure;
//   - its picture is there, described, and credited as its licence asks
//     (a CC picture links its licence; a crop says it is one);
//   - every name it links to Wikipedia is linked once, where the page first
//     names it, and the linking leaves the words as they were;
//   - every section of the index has its line and its stamp, held to the
//     same picture rules.
//
// Run with: npx tsx src/lib/moduleGuides.test.mts

import { PALETTE_MODULES, moduleDefinition } from "./moduleRegistry";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GUIDE_SECTIONS, MODULE_GUIDES, guideProse, wikiRuns, type GuidePhoto } from "./moduleGuides";
import { moduleDrawingSvg } from "./moduleGuideDrawing";
import { BANNED_WORDS, BRITISH_SPELLINGS } from "./plainWords";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL ${message}`);
  }
}

function checkPhoto(at: string, photo: GuidePhoto) {
  check(existsSync(join(process.cwd(), "public", photo.src)), `${at}: the picture ${photo.src} is not in /public`);
  check(photo.alt.length >= 20 && !/^(image|photo|picture) of/i.test(photo.alt), `${at}: the picture's alt text says too little`);
  check(photo.caption.length > 0 && photo.caption.length <= 22, `${at}: the stamp's caption "${photo.caption}" will not fit its band`);
  check(photo.sourceUrl.startsWith("https://commons.wikimedia.org/wiki/File:"), `${at}: the picture does not link to its Commons page`);
  check(photo.license === "Public domain" || !!photo.licenseUrl?.startsWith("https://creativecommons.org/licenses/"), `${at}: a ${photo.license} picture must link its licence`);
  check(/\(cropped\)$/.test(photo.credit), `${at}: the credit does not say the picture is cropped`);
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

  check(!!guide.photo, `${at}: no picture`);
  if (guide.photo) checkPhoto(at, guide.photo);

  // The links, made as the page makes them: the lede, then each section's
  // paragraphs and list, with one set of names used up along the way.
  const wiki = guide.wiki ?? {};
  const unlinked = new Set(Object.keys(wiki));
  const linked: string[] = [];
  const pageText = [guide.lede, ...guide.sections.flatMap((section) => [...section.paragraphs, ...(section.list ?? [])])];
  for (const text of pageText) {
    const runs = wikiRuns(text, wiki, unlinked);
    check(runs.map((run) => (typeof run === "string" ? run : run.text)).join("") === text, `${at}: linking changed the words of "${text.slice(0, 40)}..."`);
    for (const run of runs) if (typeof run !== "string") linked.push(run.text);
  }
  check(unlinked.size === 0, `${at}: never names ${[...unlinked].join(", ")}, which it would link`);
  check(new Set(linked).size === linked.length, `${at}: links a name twice`);
  for (const title of Object.values(wiki)) check(title === title.trim() && !title.includes("_"), `${at}: "${title}" is not an article title as Wikipedia writes it`);

  const drawing = moduleDrawingSvg(at);
  check(!!drawing && drawing.markup.includes("<rect") && drawing.widthPx > 0, `${at}: the module does not draw`);
}

// The index's sections: every group that has pages has its line and stamp.
const categories = new Set<string>(MODULE_GUIDES.map((guide) => moduleDefinition(guide.slug)?.category ?? "Other"));
for (const category of categories) {
  const section = GUIDE_SECTIONS[category];
  check(!!section, `the index section "${category}" has no line or stamp`);
  if (!section) continue;
  check(section.lede.length >= 40 && section.lede.length <= 200 && /\.$/.test(section.lede), `the index section "${category}" needs a one-sentence line`);
  for (const word of BANNED_WORDS) check(!word.test(section.lede), `the index section "${category}" uses ${word}`);
  for (const word of BRITISH_SPELLINGS) check(!word.test(section.lede), `the index section "${category}": British spelling ${word}`);
  checkPhoto(`index section ${category}`, section.photo);
}
for (const category of Object.keys(GUIDE_SECTIONS)) check(categories.has(category), `the index section "${category}" has no pages`);

if (failures > 0) {
  console.error(`\n${failures} module page check(s) failed.`);
  process.exitCode = 1;
} else {
  const links = MODULE_GUIDES.reduce((n, guide) => n + Object.keys(guide.wiki ?? {}).length, 0);
  console.log(`Module pages: ${MODULE_GUIDES.length} practices, sourced, plainly written, each module drawn and pictured, ${links} names linked.`);
}
