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
import { fitLabelSet } from "@/lib/modules/textFit";
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
  /** Ruled lines under each prompt. */
  linesPerPrompt: number;
};

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
 *  and still be the thing it is. */
export function getPromptedLinesMinHeightPx(linesPerPrompt: number): number {
  const m = getPromptedLinesRowMetricsPx();
  return (
    m.headerHeightPx +
    m.promptHeightPx +
    m.answerLineHeightPx * Math.max(1, Math.round(linesPerPrompt) || 1)
  );
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
  const linesPerPrompt = Math.max(1, Math.round(config.linesPerPrompt) || 1);
  const prompts = config.prompts ?? [];

  elements.push(borderElement(geometry, id));
  elements.push(...headerElements(geometry, config.heading ?? "", id, fontFamily, bodyTop));

  const bodyBottom = geometry.y + geometry.height;
  const blockHeight = promptHeight + answerLineHeight * linesPerPrompt;

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
    prompts.map((text) => ({ text: text ?? "", widthPx: geometry.width - padding * 2 })),
    promptSizes
  );
  let cursor = bodyTop;
  for (let p = 0; p < prompts.length; p++) {
    // A block that would not fit whole is not drawn at all. A prompt
    // printed with nowhere to answer it is worse than one page short:
    // the question is the part that has to be reachable.
    if (cursor + blockHeight > bodyBottom + 0.5) break;

    // A prompt sits on ONE line, in a band half a cell high, so a long
    // question shrinks and then truncates rather than running out of the
    // box - see textFit.ts. Traditional wordings are long ("What did I do
    // badly? What did I do well? What have I left undone?"), so this is
    // the ordinary case here, not the edge one.
    const prompt = { text: fitted.texts[p] ?? "", fontSizePx: fitted.fontSizePx };
    elements.push({
      id: id(`p${p}-prompt`),
      type: "text",
      x: geometry.x + padding,
      y: cursor + (promptHeight - prompt.fontSizePx * 1.2) / 2,
      width: geometry.width - padding * 2,
      height: prompt.fontSizePx * 1.2,
      text: prompt.text,
      fontSize: prompt.fontSizePx,
      fontFamily,
      fill: NEAR_BLACK,
      align: "left",
    });

    for (let line = 0; line < linesPerPrompt; line++) {
      const lineBottom = cursor + promptHeight + answerLineHeight * (line + 1);
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
