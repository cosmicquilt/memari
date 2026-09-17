// Can you SEE the editor's controls?
//
// Every other check in here asks whether the printed page is right. This one
// asks about the screen, and about the one part of it that is not a matter of
// taste: WCAG 2.2 fixes numbers, and a colour either clears them or does not.
//
//   1.4.11 Non-text Contrast - 3:1 between a control's visual boundary and
//   the colour behind it, and the same 3:1 for a focus indicator.
//   1.4.3  Contrast (Minimum) - 4.5:1 for body text, 3:1 for large text.
//
// It reads the colours OUT OF THE SOURCE rather than repeating them, because
// a check holding its own copy of the value it is checking passes forever
// after somebody edits the real one. Change the border in ModuleFieldsForm
// and this re-measures the thing you actually changed.
//
// Why it exists: the panel shipped with a 0.12-white border, which is 1.43:1,
// and inputs with `outline: none` and no focus style at all - a keyboard user
// had nothing on screen telling them where they were. Neither is the sort of
// thing that gets noticed by looking; both are obvious the moment anybody
// multiplies.
//
//   npm run check:contrast
import { readFileSync } from "node:fs";

type Rgb = [number, number, number];

// --- the arithmetic, straight from the spec ----------------------------
const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]: Rgb) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hex = (value: string): Rgb => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
const format = (c: Rgb) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
/** What a translucent white actually becomes once it is over something. */
const composite = (ground: Rgb, alpha: number): Rgb =>
  ground.map((c) => Math.round(c + alpha * (255 - c))) as Rgb;

// --- prove the arithmetic before trusting it ---------------------------
//
// Sabotage first, as everything in here does. These four are published
// values, so if the formula is wrong they say so rather than the check
// quietly blessing whatever the app happens to look like.
const PUBLISHED: Array<[string, Rgb, Rgb, number]> = [
  ["white on black", hex("#ffffff"), hex("#000000"), 21],
  ["#777777 on white", hex("#777777"), hex("#ffffff"), 4.48],
  ["#767676 on white", hex("#767676"), hex("#ffffff"), 4.54],
  ["a colour on itself", hex("#1c1c1e"), hex("#1c1c1e"), 1],
];
for (const [name, a, b, expected] of PUBLISHED) {
  const got = contrast(a, b);
  if (Math.abs(got - expected) > 0.01) {
    console.error(
      `The contrast formula is wrong: ${name} measured ${got.toFixed(2)}, ` +
        `the published value is ${expected.toFixed(2)}. Nothing below is worth reading.`
    );
    process.exit(1);
  }
}

// --- the colours, read from the files that set them --------------------
const form = readFileSync("src/app/planner/ModuleFieldsForm.tsx", "utf8");
const editor = readFileSync("src/app/planner/ModuleEditor.tsx", "utf8");

const read = (source: string, where: string, pattern: RegExp): string => {
  const match = pattern.exec(source);
  if (!match) {
    console.error(
      `Could not find ${where}. This check reads the real values out of the ` +
        `source; if that source moved, it must be pointed at the new one rather ` +
        `than left measuring nothing.`
    );
    process.exit(1);
  }
  return match[1];
};

const surface = hex(read(editor, "the panel colour (SURFACE in ModuleEditor)", /const SURFACE = "(#[0-9a-f]{6})"/i));
const accent = hex(read(form, "the accent (ACCENT in ModuleFieldsForm)", /const ACCENT = "(#[0-9a-f]{6})"/i));
const borderAlpha = Number(
  read(form, "the input border in inputStyle", /border: "1px solid rgba\(255, 255, 255, ([\d.]+)\)"/)
);
const labelAlpha = Number(
  read(form, "the field label colour in labelStyle", /color: "rgba\(255, 255, 255, ([\d.]+)\)"/)
);
const focusWidth = Number(read(form, "the focus ring width", /outline: (\d)px solid \$\{ACCENT\}/));
const paper = hex(read(form, "the swatch ground", /background: "(#[0-9a-f]{6})",\n\s+opacity: selected/i));

// --- what has to be true -----------------------------------------------
const BOUNDARY = 3; // 1.4.11
const BODY_TEXT = 4.5; // 1.4.3
const FOCUS_MIN_WIDTH = 2; // 2.4.13 wants a 2px perimeter

let problems = 0;
const check = (label: string, got: number, need: number, criterion: string) => {
  const ok = got >= need - 0.0001;
  if (!ok) problems++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"}  ${got.toFixed(2)}:1  (needs ${need}:1, ${criterion})  ${label}`
  );
};

console.log(`panel ${format(surface)}, accent ${format(accent)}, paper ${format(paper)}\n`);

const border = composite(surface, borderAlpha);
check(
  `input border rgba(255,255,255,${borderAlpha}) = ${format(border)} on the panel`,
  contrast(border, surface),
  BOUNDARY,
  "1.4.11"
);
check("focus ring (accent on the panel)", contrast(accent, surface), BOUNDARY, "1.4.11");
check("selection ring on a swatch (accent on the panel)", contrast(accent, surface), BOUNDARY, "1.4.11");
check("focus ring on a swatch (white on the panel)", contrast(hex("#ffffff"), surface), BOUNDARY, "1.4.11");
const label = composite(surface, labelAlpha);
check(
  `field labels rgba(255,255,255,${labelAlpha}) = ${format(label)} on the panel`,
  contrast(label, surface),
  BODY_TEXT,
  "1.4.3"
);
check("field text #f2f2f2 on the input fill", contrast(hex("#f2f2f2"), composite(surface, 0.06)), BODY_TEXT, "1.4.3");

// --- the drawer, and the rule the standard does not cover ---------------
//
// WCAG only has a floor. The cog passed that floor at 40% (3.58:1) and was
// still wrong, because the label it stands beside is 0.6 (6.18:1): the only
// control in the row was half the weight of the static text next to it and
// read as an ornament. So there is a second rule here, and it is relational -
// A CONTROL IS NEVER QUIETER THAN THE TEXT BESIDE IT. Nothing in 1.4.3 or
// 1.4.11 says that, and it is the one that was actually being broken.
const drawer = readFileSync("src/app/planner/TimelineDrawer.tsx", "utf8");
const drawerSurface = hex(read(drawer, "the drawer surface", /const SURFACE = "(#[0-9a-f]{6})"/i));
const cogAlpha = Number(
  read(drawer, "the cog's resting colour", /color: bright \? "#ffffff" : "rgba\(255, 255, 255, ([\d.]+)\)"/)
);
const levelLabelAlpha = Number(
  read(
    drawer,
    "the level label's colour",
    /textTransform: "uppercase",\s*\n\s*color: highContrast \? "#ffffff" : "rgba\(255, 255, 255, ([\d.]+)\)"/
  )
);

console.log(`\ndrawer ${format(drawerSurface)}`);
const cog = composite(drawerSurface, cogAlpha);
const levelLabel = composite(drawerSurface, levelLabelAlpha);
check(`cog at rest, ${cogAlpha} = ${format(cog)}`, contrast(cog, drawerSurface), BOUNDARY, "1.4.11");
check(
  `level label, ${levelLabelAlpha} = ${format(levelLabel)}`,
  contrast(levelLabel, drawerSurface),
  BODY_TEXT,
  "1.4.3"
);
if (cogAlpha < levelLabelAlpha) {
  console.log(
    `  FAIL  the cog (${cogAlpha}, ${contrast(cog, drawerSurface).toFixed(2)}:1) is quieter than the ` +
      `label beside it (${levelLabelAlpha}, ${contrast(levelLabel, drawerSurface).toFixed(2)}:1).\n` +
      `        The only control in the row must not be the faintest thing in it.`
  );
  problems++;
} else {
  console.log(
    `  ok    the cog (${contrast(cog, drawerSurface).toFixed(2)}:1) is at least as present as its ` +
      `label (${contrast(levelLabel, drawerSurface).toFixed(2)}:1)`
  );
}

if (focusWidth < FOCUS_MIN_WIDTH) {
  console.log(`  FAIL  focus ring is ${focusWidth}px; 2.4.13 wants at least ${FOCUS_MIN_WIDTH}px`);
  problems++;
} else {
  console.log(`  ok    focus ring is ${focusWidth}px (2.4.13 wants ${FOCUS_MIN_WIDTH}px)`);
}

// --- and, when something fails, the value that would not --------------
//
// A check that only says no costs somebody the ten minutes of bisecting that
// produced this number in the first place.
if (problems > 0) {
  for (let alpha = 0.01; alpha <= 1.0001; alpha += 0.001) {
    if (contrast(composite(surface, alpha), surface) >= BOUNDARY) {
      console.error(
        `\nOn ${format(surface)}, white first reaches ${BOUNDARY}:1 at alpha ` +
          `${alpha.toFixed(3)} (${format(composite(surface, alpha))}). Anything ` +
          `lighter than the panel and darker than that cannot carry a boundary here.`
      );
      break;
    }
  }
  console.error(`\n${problems} problem(s): parts of the editor are harder to see than the standard allows.`);
  process.exit(1);
}
console.log("\nThe editor's controls meet WCAG 2.2 for boundary, focus and text contrast.");
