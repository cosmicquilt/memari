// A "use server" file exports async functions and nothing else: Next.js
// refuses a module that exports anything more, and then EVERY action in it
// is gone, not just the new export. A number exported beside sendFeedback
// (2026-10-31) took every business screen's actions with it, and neither the
// type check nor the unit tests saw it; only a browser did. This reads every
// such file and holds it to the rule. Types are erased, so they may stay.
//
// Run as part of: npm test

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failures++;
    console.error(`FAIL ${what}`);
  }
};

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "generated" || name === "node_modules") return [];
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** What a "use server" file exports that isn't an async function. */
export function strayExports(source: string): string[] {
  const stray: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    const m = /^export\s+(?!type\b|interface\b|async\s+function\b|default\s+async\s+function\b)(\S+)(?:\s+(\S+))?/.exec(line);
    if (m) stray.push(line.trim().slice(0, 80));
  }
  return stray;
}

// the rule itself, on what it should and shouldn't catch
check(strayExports("export const LIMIT = 20;").length === 1, "a constant is caught");
check(strayExports("export function plain() {}").length === 1, "a function that isn't async is caught");
check(strayExports("export { thing };").length === 1, "a re-export of a value is caught");
check(strayExports("export class Thing {}").length === 1, "a class is caught");
check(strayExports("export async function act() {}\nexport type Result = number;\nexport interface X {}\nexport type { Y } from './y';").length === 0, "async functions and types are fine");

const actionFiles = files(root).filter((path) => /^\s*["']use server["']/.test(readFileSync(path, "utf8")));
check(actionFiles.length >= 5, `the "use server" files are found (${actionFiles.length})`);
for (const path of actionFiles) {
  const stray = strayExports(readFileSync(path, "utf8"));
  check(stray.length === 0, `${path.slice(root.length)} exports only async functions (and types): ${stray.join(" | ")}`);
}

if (failures > 0) {
  console.error(`\n${failures} server action check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`All server action checks passed (${actionFiles.length} "use server" files export only async functions).`);
}
