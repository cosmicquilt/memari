// The front's own choices (coverFront.ts, 2026-11-05): what a journal keeps,
// made safe; and a journal with none prints its cover as pictured - every
// journal before this one did, so nothing already chosen changes.
//
// Run as part of: npm test

import { COVERS, coverById } from "@/app/covers/catalogue";
import { cleanCoverFront, frontOf, NAME_MAX, picturedFront } from "./coverFront";

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`);
};

// as pictured, for all 85
const wrong = COVERS.filter((cover) => {
  const f = frontOf({ cover: cover.id }, cover);
  const mark = cover.kind === "m-corner" ? "m-corner" : cover.kind === "wordmark" ? `wordmark-${cover.face}` : "m-centre";
  return f.mark !== mark || f.finish !== (cover.finish === "gold" ? "gold" : "imprint") || f.dates !== cover.dated || f.name !== "";
});
check(wrong.length === 0, `A JOURNAL WITH NO CHOICES PRINTS ITS COVER AS PICTURED, all ${COVERS.length} (${wrong.map((c) => c.id).join(", ") || "none different"})`);

const onyx = coverById("Onyx010")!;
check(JSON.stringify(picturedFront(onyx)) === JSON.stringify({ mark: "wordmark-serif", finish: "gold", dates: true, name: "" }), "Onyx 9 as pictured: memari. in serif, gold, dated");

// kept choices win, and are made safe
const mine = frontOf({ cover: "Onyx010", coverFront: { mark: "none", finish: "imprint", dates: false, name: "  Sam   Rivera  " } }, onyx);
check(mine.mark === "none" && mine.finish === "imprint" && !mine.dates && mine.name === "Sam Rivera", `a journal's own front is what it prints, the name tidied ("${mine.name}")`);
check(cleanCoverFront({ mark: "m-sideways", finish: "gold", dates: true, name: "" }) === null, "a mark that isn't one is no front at all");
check(cleanCoverFront({ mark: "m-centre", finish: "silver", dates: true, name: "" }) === null, "and so is a finish that isn't one");
check(cleanCoverFront({ mark: "m-centre", finish: "gold", dates: "yes", name: "" }) === null, "and dates that aren't a yes or no");
check(frontOf({ cover: "Onyx010", coverFront: { mark: "m-sideways" } }, onyx).mark === "wordmark-serif", "a bad front kept on a journal falls back to the cover as pictured");
const long = cleanCoverFront({ mark: "m-centre", finish: "gold", dates: false, name: "x".repeat(90) })!;
check(long.name.length === NAME_MAX, `a name is kept to ${NAME_MAX} characters (${long.name.length})`);
const control = cleanCoverFront({ mark: "m-centre", finish: "gold", dates: false, name: "Sam\u0000\nRivera\t" })!;
check(control.name === "Sam Rivera", `control characters in a name become spaces, then one ("${control.name}")`);

if (failures > 0) {
  console.error(`\n${failures} cover front check(s) failed.`);
  process.exitCode = 1;
} else console.log("\nAll cover front checks passed.");
