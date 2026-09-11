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
import { fitLabel } from "@/lib/modules/textFit";

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

const NEAR_BLACK = "#231F20";
const BORDER_WIDTH_PT = 0.5;
// 15.12pt is exactly 63 print px: one cell less the box inset at both
// ends, which is the header height that leaves a whole number of cells
// beneath it at every span. Same value and same reason as
// todoChecklist.ts and habitTracker.ts.
const HEADER_HEIGHT_PT = 15.12;
const HEADER_FONT_PT = 12;
// Half a cell. The prompt is printed rather than written on, so it needs
// room for a line of type and not for handwriting.
const PROMPT_HEIGHT_PT = 9;
const PROMPT_FONT_PT = 8;
// One cell, the same as a to-do row: a quarter inch is comfortable to
// write a sentence on.
const ANSWER_LINE_HEIGHT_PT = 18;
const RULE_WIDTH_PT = 0.35;
// Matches labeledBox's own heading inset, measured from the reference.
const HORIZONTAL_PADDING_PT = 8;

export function getPromptedLinesRowMetricsPx() {
  return {
    headerHeightPx: ptToPx(HEADER_HEIGHT_PT),
    promptHeightPx: ptToPx(PROMPT_HEIGHT_PT),
    answerLineHeightPx: ptToPx(ANSWER_LINE_HEIGHT_PT),
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
  fontFamily: string
): RenderedElement[] {
  const elements: RenderedElement[] = [];
  // Semantic, not positional - see todoChecklist.ts. An id names a prompt
  // and a line within it, so adding a prompt does not renumber the marks
  // belonging to the ones above it.
  const id = (name: string) => `${idPrefix}-${name}`;

  const headerHeight = ptToPx(HEADER_HEIGHT_PT);
  const promptHeight = ptToPx(PROMPT_HEIGHT_PT);
  const answerLineHeight = ptToPx(ANSWER_LINE_HEIGHT_PT);
  const ruleWidth = ptToPx(RULE_WIDTH_PT);
  const padding = ptToPx(HORIZONTAL_PADDING_PT);
  // Total in its config - see columnTable.ts for why.
  const linesPerPrompt = Math.max(1, Math.round(config.linesPerPrompt) || 1);
  const prompts = config.prompts ?? [];

  elements.push({
    id: id("border"),
    type: "figure",
    subType: "rect",
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    fill: "transparent",
    stroke: NEAR_BLACK,
    strokeWidth: ptToPx(BORDER_WIDTH_PT),
  });

  if (config.heading) {
    const headerFontSize = ptToPx(HEADER_FONT_PT);
    const headerTextHeight = headerFontSize * 1.2;
    elements.push({
      id: id("heading"),
      type: "text",
      x: geometry.x,
      y: geometry.y + (headerHeight - headerTextHeight) / 2,
      width: geometry.width,
      height: headerTextHeight,
      text: config.heading,
      fontSize: headerFontSize,
      fontFamily,
      fill: NEAR_BLACK,
      align: "center",
    });
    elements.push({
      id: id("header-rule"),
      type: "figure",
      subType: "rect",
      x: geometry.x,
      y: geometry.y + headerHeight - ruleWidth / 2,
      width: geometry.width,
      height: ruleWidth,
      fill: NEAR_BLACK,
      stroke: "none",
    });
  }

  const bodyTop = geometry.y + (config.heading ? headerHeight : 0);
  const bodyBottom = geometry.y + geometry.height;
  const blockHeight = promptHeight + answerLineHeight * linesPerPrompt;

  const promptSizes = [ptToPx(PROMPT_FONT_PT), ptToPx(7), ptToPx(6), ptToPx(5.5)];
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
    const prompt = fitLabel(prompts[p] ?? "", geometry.width - padding * 2, promptSizes);
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
