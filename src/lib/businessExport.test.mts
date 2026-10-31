// A coach's clients as a spreadsheet (businessExport.ts): what Excel and
// Google Sheets open, quoted where it must be, and never a formula.
//
// Run as part of: npm test

import { answersText, csvCell, toCsv, type ClientRow } from "./businessExport";

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failures++;
    console.error(`FAIL ${what}`);
  }
};

check(csvCell("Maya Chen") === "Maya Chen", "a plain cell stays plain");
check(csvCell("Chen, Maya") === '"Chen, Maya"', "a comma is quoted");
check(csvCell('The "Reset" plan') === '"The ""Reset"" plan"', "a quote is doubled inside quotes");
check(csvCell("line one\nline two") === '"line one\nline two"', "a line break stays inside its cell");
check(csvCell("=HYPERLINK(\"x\")") === "\"'=HYPERLINK(\"\"x\"\")\"", "a formula is made plain text");
check(csvCell("+1 555 0100") === "'+1 555 0100", "a phone number starting with + is not read as a formula");
check(csvCell("@coach") === "'@coach" && csvCell("-3") === "'-3", "@ and - lead plain text too");
check(csvCell(3) === "3", "numbers stay numbers");

const row: ClientRow = {
  name: "Maya Chen",
  coverName: "Maya",
  email: "maya@example.com",
  template: "The Reset Planner",
  startDate: "2027-01-04",
  bookMonths: 3,
  address: { name: "Maya Chen", street1: "12 Elm St, Apt 4", street2: "", city: "Jersey City", state: "NJ", postcode: "07302", country: "US", phone: "+1 201 555 0100" },
  note: "Prefers coil",
  archived: "",
  linkLastOpened: "2026-10-29",
  booksOrdered: 2,
  lastBook: "2026-10-05 to 2027-01-03",
  group: "January cohort",
  answers: answersText(
    [
      { id: "q_weekly000001", prompt: "What matters most each week?", max: 3 },
      { id: "q_why000000001", prompt: "Why now", max: 1 },
      { id: "q_unanswered01", prompt: "Unanswered?", max: 1 },
    ],
    { q_weekly000001: ["Run before work", "Call my sister"], q_why000000001: 'Because, "finally"', q_dropped00001: "Kept anyway" }
  ),
};
const csv = toCsv([row]);
const lines = csv.slice(1).split("\r\n");
check(csv.startsWith("﻿"), "starts with a byte-order mark, so Excel reads it as UTF-8");
check(lines[0].startsWith("Name,Name on the cover,Email,Template"), "a heading row first");
check(lines[0].split(",").length === 21 && lines[1].includes('"12 Elm St, Apt 4"'), "twenty-one columns; an address with a comma is one cell");
check(lines[0].endsWith(",Group,Answers"), "the group and the answers last");
check(
  row.answers === 'What matters most each week? Run before work; Call my sister\nWhy now: Because, "finally"\nAn earlier question: Kept anyway',
  `answers a line a question, a list joined, an unanswered question left out, an earlier one kept (${JSON.stringify(row.answers)})`
);
check(csv.includes('"What matters most each week? Run before work; Call my sister\nWhy now: Because, ""finally""\nAn earlier question: Kept anyway"'), "and in one quoted cell, its line breaks and quotes kept");
check(lines[1].includes(",'+1 201 555 0100,"), "the phone keeps its +, as text");
check(csv.endsWith("\r\n") && csv.split("\r\n").length === 3, "CRLF lines, ending in one (a cell's own line breaks are LF, inside its quotes)");

if (failures > 0) {
  console.error(`\n${failures} export check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("All client export checks passed.");
}
