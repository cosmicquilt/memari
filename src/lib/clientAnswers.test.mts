// Intake that fills the book (clientAnswers.ts): which field an answer
// fills, an answer made fit to print, the question id kept through the
// editor's saves, and the stored JSON read safely. Expected values by hand.
//
// Run as part of: npm test

import { ASK_KEY, LIST_MAX, answersOf, askIdOf, cleanAnswer, fillTargetOf, questionsOf, withAsk } from "./clientAnswers";

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failures++;
    console.error(`FAIL ${what}`);
  }
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- which field an answer fills
check(eq(fillTargetOf("text-block"), { key: "body", kind: "text" }), "a text block: its written body");
check(eq(fillTargetOf("todo-checklist"), { key: "items", kind: "list" }), "a to-do list: its printed items");
check(eq(fillTargetOf("daily-big-three"), { key: "items", kind: "list" }), "the big three: its items");
check(eq(fillTargetOf("habit-tracker"), { key: "habits", kind: "list" }), "a habit tracker: its habits, not its columns");
check(fillTargetOf("column-table") === null, "a table with only columns asks nothing: columns shape it");
check(fillTargetOf("prompted-lines") === null, "prompted lines ask nothing: the prompts are the coach's questions, not answers");
check(fillTargetOf("eisenhower-matrix") === null && fillTargetOf("mood-chart-week") === null, "box names and chart levels ask nothing");
check(fillTargetOf("no-such-module") === null, "a module that doesn't exist asks nothing");

// ---- an answer made fit to print
const text = { key: "body", kind: "text" as const };
const list = { key: "items", kind: "list" as const };
check(cleanAnswer(text, "  Because I want my mornings back.\r\n ", 1) === "Because I want my mornings back.", "a written answer, trimmed, line endings made one");
check((cleanAnswer(text, "x".repeat(900), 1) as string).length === 500, "and cut at the editor's own 500");
check(cleanAnswer(text, "   ", 1) === null && cleanAnswer(text, 42, 1) === null, "nothing written, or not text, is no answer: the module prints as the template has it");
check(eq(cleanAnswer(list, ["Run a 10k", "", "  Read   12 books ", "Sleep by 11", "Extra"], 3), ["Run a 10k", "Read 12 books", "Sleep by 11"]), "a list: blank lines dropped, spaces tidied, no more than asked");
check(eq(cleanAnswer(list, "One\nTwo\r\nThree", 5), ["One", "Two", "Three"]), "a list typed in one box, a line each");
check(cleanAnswer(list, ["", " "], 3) === null, "a list of blanks is no answer");
check((cleanAnswer(list, Array.from({ length: 30 }, (_, i) => `item ${i}`), 99) as string[]).length === LIST_MAX, `never more than ${LIST_MAX} items, whatever the question says`);
check(((cleanAnswer(list, ["y".repeat(300)], 3) as string[])[0]).length === 120, "an item cut at 120");
check(eq(cleanAnswer(list, ["a", 7, null, "b"], 3), ["a", "b"]), "only text is an item");

// ---- the question id kept through the editor's saves
const id = "q_abcDEF123456";
check(askIdOf({ [ASK_KEY]: id }) === id, "a module's question id read");
check(askIdOf({ [ASK_KEY]: "nope" }) === null && askIdOf({ [ASK_KEY]: 5 }) === null && askIdOf(null) === null, "anything not an id's shape is none");
const kept: Record<string, unknown> = withAsk({ [ASK_KEY]: id, heading: "Old" }, { heading: "New", items: ["a"] });
check(kept[ASK_KEY] === id && kept.heading === "New", "the editor's new settings keep the stored id (they are filtered to the module's own keys)");
check(!(ASK_KEY in withAsk({ heading: "x" }, { heading: "y" })), "a module asking nothing gets no id");
check(withAsk({}, { [ASK_KEY]: id })[ASK_KEY] === id && !(ASK_KEY in withAsk({}, {})), "nothing is invented");

// ---- the stored JSON read safely
const qs = questionsOf([{ id, prompt: "Your three goals?", max: 3 }, { id: "bad", prompt: "x", max: 1 }, { id: "q_zzzzzzzzzz", prompt: "Why?", max: 40 }, null, "x"]);
check(qs.length === 2 && qs[0].prompt === "Your three goals?" && qs[1].max === LIST_MAX, `questions: bad rows dropped, a list's size capped (${JSON.stringify(qs)})`);
check(eq(questionsOf(null), []) && eq(questionsOf({}), []), "no questions stored is none");
check(eq(answersOf({ [id]: ["a", "b"], q_textanswer1: "why", bad: "x", q_wrongvalue1: [1, 2] }), { [id]: ["a", "b"], q_textanswer1: "why" }), "answers: only ids, and only text or lists of text");
check(eq(answersOf([1, 2]), {}) && eq(answersOf(null), {}), "anything else is no answers");

if (failures > 0) {
  console.error(`\n${failures} intake answer check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("All intake answer checks passed.");
}
