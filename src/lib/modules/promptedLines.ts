// One or more printed questions, each with ruled space to answer in.
//
// The primitive behind most of the philosophy and self-help catalogue -
// the Stoic morning page, Seneca's evening review, the Ignatian Examen,
// SOAP, Lectio Divina, weekly reflection, SMART goals, gratitude three.
// Sixteen modules, and the difference between them is the list of
// questions, not the drawing. Several have wording fixed by tradition,
// which is exactly the case a preset serves: the geometry is one thing and
// the words are data.
//
// Structurally a ruled box whose body is divided into blocks - a printed
// prompt, then N rules to write on - repeated down the box.
//
// Everything is a lattice quantity, for the same reason todoChecklist and
// habitTracker are. The header is one cell less the box inset at both
// ends, so what remains is a whole number of cells; a prompt's own line
// takes half a cell and each answer rule a whole one. A block is therefore
// (0.5 + linesPerPrompt) cells and lands on the lattice wherever it
// starts.

import { ptToPx } from "@/lib/print-spec";
import { fitLabelSet, capCentredTextY } from "@/lib/modules/textFit";
import { latticeColumnsIn, latticeDot } from "./latticeFill";
import {
  HEADER_HEIGHT_PT,
  NEAR_BLACK,
  RULE_WIDTH_PT,
  borderElement,
  contentTopPx,
  headerElements,
  rowHeightPx,
  type FrameLattice,
} from "@/lib/modules/moduleFrame";

export type PromptedLinesConfig = {
  heading: string;
  /** The questions, printed in order. Each gets `linesPerPrompt` rules. */
  prompts: string[];
  /** Ruled lines under each prompt - the default for any prompt that does
   *  not set its own in `promptLines`. */
  linesPerPrompt: number;
  /**
   * Lines under EACH prompt, index-aligned with `prompts`. The one named in
   * the editor vision: SOAP's Scripture takes a line and its Application
   * four, a recipe's method is longer than its ingredients. Every block is
   * still whole cells, so every rule stays on a dot.
   */
  promptLines?: number[];
  /** The answer space: ruled (the default), dotted on the lattice, blank. */
  answers?: "lined" | "dotted" | "none";
  /** A number before each prompt, where the prompts are steps in order. */
  numbered?: boolean;
};

/** How many lines prompt `p` has: its own, or the module's default. */
export function promptLinesFor(config: { linesPerPrompt?: unknown; promptLines?: unknown }, p: number): number {
  const own = Array.isArray(config.promptLines) ? Number(config.promptLines[p]) : NaN;
  const fallback = Math.round(Number(config.linesPerPrompt)) || 1;
  return Math.max(1, Math.min(12, Number.isFinite(own) && own > 0 ? Math.round(own) : fallback));
}

export type RenderedElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
};

/**
 * ONE CELL for the printed question, not the half cell it needs for type.
 *
 * Half a cell is enough room to SET the question and too little to read
 * it: at half a cell the prompt sits hard against the rule above it, which
 * is the "text too close to above neighbor in reflection" report. It also
 * made a block (half a cell plus N) land on a half cell, so alternate
 * blocks fell off the lattice - measured at +31.5px against -6.0px for the
 * ones that did not, two different offsets inside one module.
 *
 * A full cell fixes both at once: the question gets air, and a block is
 * (1 + linesPerPrompt) whole cells, so every answer rule lands on a dot
 * wherever its block starts. It costs one prompt at some heights.
 */
const PROMPT_HEIGHT_PT = 18;
const PROMPT_FONT_PT = 8;
// Matches labeledBox's own heading inset, measured from the reference.
const HORIZONTAL_PADDING_PT = 8;

export function getPromptedLinesRowMetricsPx() {
  return {
    headerHeightPx: ptToPx(HEADER_HEIGHT_PT),
    promptHeightPx: ptToPx(PROMPT_HEIGHT_PT),
    answerLineHeightPx: rowHeightPx(),
  };
}

/** Header, one prompt and one line to answer on - the least this can be
 *  and still be the thing it is - in the box's own pixels, which end one
 *  inset short of the last cell. Without the inset off, the floor was a
 *  row taller than its block and arrived with that row empty (the
 *  2026-10-02 sweep). */
export function getPromptedLinesMinHeightPx(linesPerPrompt: number, insetPx = 0): number {
  // The FIRST prompt's lines, when they are set per prompt - it is the block
  // that has to fit for the module to be itself.
  const m = getPromptedLinesRowMetricsPx();
  return (
    m.headerHeightPx +
    m.promptHeightPx +
    m.answerLineHeightPx * Math.max(1, Math.round(linesPerPrompt) || 1) -
    insetPx
  );
}

/**
 * HOW MANY LINES EACH PROMPT GETS in a body `bodyCells` cells tall: the
 * prompts that fit whole, from the top, and the cells left under them
 * shared out as more lines - evenly, the first prompts taking any odd one -
 * so nothing is left empty under the last (2026-10-02: "theres white space
 * at bottom ... do a sweep"; prompted lines "share the extra lines among
 * the prompts"). A prompt's own count is the least it gets.
 */
export function promptLineCounts(config: { prompts?: unknown; linesPerPrompt?: unknown; promptLines?: unknown }, bodyCells: number): number[] {
  const prompts = Array.isArray(config.prompts) ? config.prompts : [];
  const counts: number[] = [];
  let used = 0;
  for (let p = 0; p < prompts.length; p++) {
    const lines = promptLinesFor(config, p);
    if (used + 1 + lines > bodyCells) break;
    counts.push(lines);
    used += 1 + lines;
  }
  const spare = bodyCells - used;
  if (counts.length === 0 || spare <= 0) return counts;
  return counts.map((lines, p) => lines + Math.floor(spare / counts.length) + (p < spare % counts.length ? 1 : 0));
}

export function renderPromptedLines(
  geometry: { x: number; y: number; width: number; height: number },
  config: PromptedLinesConfig,
  idPrefix: string,
  fontFamily: string,
  lattice?: FrameLattice
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic, not positional - see todoChecklist.ts. An id names a prompt
  // and a line within it, so adding a prompt does not renumber the marks
  // belonging to the ones above it.
  const id = (name: string) => `${idPrefix}-${name}`;

  const bodyTop = contentTopPx(geometry, lattice);
  const promptHeight = ptToPx(PROMPT_HEIGHT_PT);
  const answerLineHeight = rowHeightPx(lattice);
  const ruleWidth = ptToPx(RULE_WIDTH_PT);
  const padding = ptToPx(HORIZONTAL_PADDING_PT);
  // Total in its config - see columnTable.ts for why.
  const prompts = config.prompts ?? [];
  const answers = config.answers === "dotted" || config.answers === "none" ? config.answers : "lined";
  // A numbered prompt sets after its number, in the same band.
  const numberWidth = config.numbered ? ptToPx(9) : 0;
  const pitch = answerLineHeight;
  const latticeY = lattice ? geometry.y - lattice.insetPx : geometry.y;

  elements.push(borderElement(geometry, id));
  elements.push(...headerElements(geometry, config.heading ?? "", id, fontFamily, bodyTop));

  const bodyBottom = geometry.y + geometry.height;

  const promptSizes = [ptToPx(PROMPT_FONT_PT), ptToPx(7), ptToPx(6), ptToPx(5.5)];
  // ONE size for all the prompts in a module, chosen so the longest fits.
  //
  // Fitted individually, each prompt picked its own size, and an Examen or
  // a stoic evening review came out with its short questions a couple of
  // points larger than its long ones - three questions in one box in three
  // sizes, which reads as a mistake because it is one. This is precisely
  // the case fitLabelSet was written for, in columnTable, and this file
  // was still calling fitLabel in a loop.
  const fitted = fitLabelSet(
    prompts.map((text) => ({ text: text ?? "", widthPx: geometry.width - padding * 2 - numberWidth })),
    promptSizes
  );
  // The body in whole cells, counting the last, which is the box inset
  // short of a cell as every module's last band is. A block that would not
  // fit whole is not drawn at all - a prompt printed with nowhere to answer
  // it is worse than one page short; the ones that do share what is left.
  const inset = lattice?.insetPx ?? 0;
  const bodyCells = Math.max(0, Math.floor((bodyBottom + inset - bodyTop + 0.5) / pitch));
  const counts = promptLineCounts(config, bodyCells);
  let cursor = bodyTop;
  for (let p = 0; p < counts.length; p++) {
    const linesPerPrompt = counts[p];
    const blockHeight = promptHeight + answerLineHeight * linesPerPrompt;

    // A prompt sits on ONE line, in a band half a cell high, so a long
    // question shrinks and then truncates rather than running out of the
    // box - see textFit.ts. Traditional wordings are long ("What did I do
    // badly? What did I do well? What have I left undone?"), so this is
    // the ordinary case here, not the edge one.
    const prompt = { text: fitted.texts[p] ?? "", fontSizePx: fitted.fontSizePx };
    if (config.numbered) {
      elements.push({
        id: id(`p${p}-number`),
        type: "text",
        x: geometry.x + padding,
        y: capCentredTextY(cursor, promptHeight, prompt.fontSizePx, fontFamily),
        width: numberWidth,
        height: prompt.fontSizePx * 1.2,
        text: String(p + 1),
        fontSize: prompt.fontSizePx,
        fontFamily,
        fill: NEAR_BLACK,
        align: "left",
        opacity: 0.55,
      });
    }
    elements.push({
      id: id(`p${p}-prompt`),
      type: "text",
      x: geometry.x + padding + numberWidth,
      y: capCentredTextY(cursor, promptHeight, prompt.fontSizePx, fontFamily),
      width: geometry.width - padding * 2 - numberWidth,
      height: prompt.fontSizePx * 1.2,
      text: prompt.text,
      fontSize: prompt.fontSizePx,
      fontFamily,
      fill: NEAR_BLACK,
      align: "left",
    });

    for (let line = 0; line < linesPerPrompt; line++) {
      const lineBottom = cursor + promptHeight + answerLineHeight * (line + 1);
      if (answers === "none") continue;
      // The last line's rule is the border.
      if (lineBottom > bodyBottom - 0.5) continue;
      if (answers === "dotted") {
        // The answer line's own lattice row, broken into the page's dots.
        const row = Math.round((lineBottom - latticeY) / pitch);
        for (const column of latticeColumnsIn(geometry, lattice, geometry.x + padding, geometry.x + geometry.width - padding)) {
          elements.push(latticeDot(id(`p${p}-dot${row}-${column.index}`), column.x, lineBottom));
        }
        continue;
      }
      elements.push({
        id: id(`p${p}-line${line}`),
        type: "figure",
        subType: "rect",
        x: geometry.x + padding,
        y: lineBottom - ruleWidth / 2,
        width: geometry.width - padding * 2,
        height: ruleWidth,
        fill: NEAR_BLACK,
        stroke: "none",
        opacity: 0.6,
      });
    }

    cursor += blockHeight;
  }

  return elements;
}
