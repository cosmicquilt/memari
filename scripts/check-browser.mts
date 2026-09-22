// The checks that need a real browser.
//
// WHY THIS EXISTS. Three bugs shipped in two days that every other check in
// this repo was structurally unable to see:
//
//   - the section pill "jumps to final state then does the animation from
//     the beginning" - a defect that lives entirely BETWEEN A COMMIT AND A
//     PAINT. No unit test has a paint;
//   - the timeline tab drew at 74% of the window at the compact detent. A
//     unit test now pins the arithmetic, but not that CSS puts the element
//     where the arithmetic says;
//   - ruled lines came out blurry and grey on a 3x display. check:preview
//     verifies snapHairline's numbers and then has to fall back to READING
//     THE SOURCE of its callers, because a function handed the wrong unit
//     uses it exactly as documented.
//
// So: drive the actual app in an actual Chrome, and measure the pixels and
// the frames. This does not replace the other checks. It answers the
// questions they cannot reach.
//
// IT RUNS AT THREE PIXEL RATIOS. `deviceScaleFactor` is a context option, so
// the 2x and 3x cases are measured on any machine - which matters here,
// because the display that reported the hairline fault is not the one this
// is usually run on.
//
// CHROME, NOT A DOWNLOADED BROWSER. playwright-core drives the Chrome that
// is already installed (`channel: "chrome"`), so this adds a few megabytes
// of npm package rather than a few hundred of browser binaries - and it
// measures the engine the app is actually used in.
//
//   npm run check:browser
//   npm run check:browser -- --base http://localhost:4000
//   npm run check:browser -- --headed        watch it happen
//
// EVERY PROBE BELOW WAS SABOTAGED, and each one's comment records what broke
// it and what it printed. One of those sabotages also showed that a clause
// which fires in a visible window does not necessarily fire in a headless
// one - see the pill travel probe.

import { chromium, type Browser, type Page } from "playwright-core";
import { ensureServer, makeGuestJournal, disconnect } from "./appUnderTest.mjs";
import {
  DRAWER_CLOSED_HEIGHT,
  DRAWER_COMPACT_HEIGHT,
  DRAWER_RESTING_HEIGHT,
} from "../src/app/planner/TimelineDrawer.js";

const baseArg = process.argv.indexOf("--base");
const explicitBase = baseArg === -1 ? undefined : process.argv[baseArg + 1];
const HEADED = process.argv.includes("--headed");
/** `--only hairlines` runs one probe. For sabotaging a single clause without
 *  paying for three browser contexts each time. */
const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg === -1 ? null : process.argv[onlyArg + 1];

let failures = 0;
const fail = (probe: string, message: string) => {
  console.error(`  FAIL  [${probe}] ${message}`);
  failures++;
};
const note = (probe: string, message: string) => console.log(`  ok    [${probe}] ${message}`);

const VIEWPORT = { width: 1280, height: 800 };

type Context = { base: string; journalId: string; dpr: number };
type Probe = {
  name: string;
  /** Which pixel ratios this one means anything at. */
  ratios: number[];
  run: (page: Page, context: Context) => Promise<void>;
};

// ---------------------------------------------------------------------
// 1. The section pill travels FROM WHERE IT WAS.
//
// Andrew: "sometimes the highlight (journals, pages, modules) animation
// jumps. i think it jumps to final state then does the animation from the
// beginning." It did: useSectionPillTravel retried with setTimeout(0), which
// races the paint, so the pill painted at its destination and only then
// travelled from its origin.
//
// Read per frame, because that is the only place the defect exists. Two
// independent signatures: the first frame is not at the origin, and some
// frame moves AWAY from the destination.
//
// KEEPING BOTH IS NOT BELT AND BRACES. Sabotaged by putting the timeout
// back, this reported `8 frame(s) moved away from the destination` while
// still reporting `8/8 switches began at the origin` - the first-frame
// clause DID NOT FIRE. Headless lands the stray paint a frame or two later
// than a visible window does, where measuring the same bug by hand gave
// frame0 at the destination and 3 of 10 starting at the origin. Same defect,
// different frame, and only the monotonic clause sees it in both. A check
// written with the first signature alone would have passed here.
// ---------------------------------------------------------------------
const pillTravel: Probe = {
  name: "pill travel",
  ratios: [1],
  run: async (page, { base }) => {
    await page.goto(`${base}/app`, { waitUntil: "networkidle" });
    const seg = page.locator(".sd-seg button");
    if ((await seg.count()) < 3) {
      fail("pill travel", "the Journals/Pages/Modules strip is not on /app");
      return;
    }
    // The pill only exists once the strip has measured itself.
    await page.waitForSelector("[data-section-pill]", { timeout: 10_000 });

    const readX = () =>
      page.evaluate(() => {
        const pill = document.querySelector("[data-section-pill]");
        if (!pill) return null;
        return +new DOMMatrixReadOnly(getComputedStyle(pill).transform).m41.toFixed(2);
      });

    const order = ["Pages", "Modules", "Journals", "Pages", "Journals", "Modules", "Pages", "Modules"];
    let startedAtOrigin = 0;
    let backwardFrames = 0;
    let thinnest = Infinity;

    for (const target of order) {
      const origin = await readX();
      // Recording starts BEFORE the click, so frame zero is the first frame
      // the browser drew after the switch - the one the jump lived in.
      //
      // A STRING, not a function. tsx compiles through esbuild with
      // keepNames on, which wraps any named function - including
      // `const tick = () => {}` - in a `__name()` helper. Playwright ships
      // the function's SOURCE to the page, where that helper does not exist,
      // and the first run of this died on `ReferenceError: __name is not
      // defined`. A string is never compiled.
      await page.evaluate(`
        window.__frames = [];
        window.__stop = false;
        requestAnimationFrame(function step() {
          var pill = document.querySelector("[data-section-pill]");
          if (pill) window.__frames.push(+new DOMMatrixReadOnly(getComputedStyle(pill).transform).m41.toFixed(2));
          if (!window.__stop) requestAnimationFrame(step);
        });
      `);
      // A real click, not element.click(): the whole point is to exercise
      // the path a person takes.
      await page.locator(".sd-seg button", { hasText: new RegExp(`^${target}`) }).click();
      await page.waitForTimeout(600);
      const frames = (await page.evaluate(
        `(function () { window.__stop = true; return window.__frames; })()`
      )) as number[];

      thinnest = Math.min(thinnest, frames.length);
      if (frames.length < 6 || origin === null) {
        fail("pill travel", `only ${frames.length} frames recorded switching to ${target} - rAF is not running`);
        continue;
      }
      const destination = frames[frames.length - 1];
      const direction = Math.sign(destination - origin);
      if (Math.abs(frames[0] - origin) <= 1.5) startedAtOrigin++;
      else
        fail(
          "pill travel",
          `to ${target}: first painted frame at ${frames[0]}, but it came from ${origin}` +
            ` (destination ${destination}) - it jumped to the end and travelled from the start`
        );
      for (let i = 1; i < frames.length; i++) {
        const step = frames[i] - frames[i - 1];
        if (direction !== 0 && Math.sign(step) === -direction && Math.abs(step) > 1.5) backwardFrames++;
      }
    }

    if (backwardFrames > 0) {
      fail("pill travel", `${backwardFrames} frame(s) moved away from the destination`);
    }
    if (failures === 0 || startedAtOrigin === order.length) {
      note(
        "pill travel",
        `${startedAtOrigin}/${order.length} switches began at the origin, ${backwardFrames} backward frames ` +
          `(${thinnest} frames recorded at the thinnest)`
      );
    }
  },
};

// ---------------------------------------------------------------------
// 2. The drawer's tab is full width at every OPEN detent.
//
// Andrew: "at the smallest drawer size the tab shrinks maybe like 20% when
// it shouldn't." drawerDetents.test.mts pins tabOpenness, but a unit test
// cannot see whether CSS put the element where the number says - the width
// is a `calc()` and the radius is derived from the same value.
//
// Driven with real mouse input, so setPointerCapture and the drag handlers
// run as they do for a person.
//
// Sabotaged by restoring the height-interpolated openness, and it reproduces
// the report to the decimal: "compact: the drawer is open at 186px but the
// tab is 74.2% of the window", plus "still carrying a 2.78539px tab corner"
// - the second symptom, which nobody had looked at.
// ---------------------------------------------------------------------
const drawerTab: Probe = {
  name: "drawer tab",
  ratios: [1],
  run: async (page, { base, journalId }) => {
    await page.goto(`${base}/app/j/${journalId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    const readTab = () =>
      page.evaluate(() => {
        const el = [...document.querySelectorAll<HTMLElement>("*")].find(
          (e) => e.style?.width?.includes("calc") && Math.round(e.getBoundingClientRect().height) === 28
        );
        if (!el) return null;
        const box = el.getBoundingClientRect();
        return {
          widthPct: +((100 * box.width) / window.innerWidth).toFixed(1),
          radius: getComputedStyle(el).borderTopLeftRadius,
          drawerHeight: Math.round(window.innerHeight - box.top),
          centreX: Math.round(box.left + box.width / 2),
          centreY: Math.round(box.top + box.height / 2),
        };
      });

    const state = await readTab();
    if (!state) {
      fail("drawer tab", "no drawer tab on the journal page");
      return;
    }

    /** Drag the grabber so the drawer's top lands at `height`, and let the
     *  component snap to whichever detent is nearest.
     *
     *  A DRAG OF NEARLY NOTHING IS A CLICK, and the grabber's other job is
     *  close/reopen - anything under 3px of travel is treated as a tap. The
     *  first version of this probe asked for resting while the drawer was
     *  already at resting, produced a zero-length drag, and toggled the
     *  drawer shut; it then measured a closed tab and reported the app
     *  broken at 7.5% width. The check was wrong, not the app. */
    const dragTo = async (height: number) => {
      const now = await readTab();
      if (!now) return null;
      if (Math.abs(now.drawerHeight - height) < 6) return now;
      await page.mouse.move(now.centreX, now.centreY);
      await page.mouse.down();
      const targetY = VIEWPORT.height - height + 14;
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(now.centreX, now.centreY + ((targetY - now.centreY) * i) / steps);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      // Long enough for the snap AND the tab's own width/radius transition,
      // which runs on its own clock after the panel lands.
      await page.waitForTimeout(900);
      return readTab();
    };
    const seen: Record<string, { widthPct: number; radius: string }> = {};

    for (const [label, height] of [
      ["resting", DRAWER_RESTING_HEIGHT],
      ["compact", DRAWER_COMPACT_HEIGHT],
      ["expanded", Math.round(VIEWPORT.height * 0.5)],
      ["closed", DRAWER_CLOSED_HEIGHT],
    ] as const) {
      const after = await dragTo(height);
      if (!after) {
        fail("drawer tab", `the tab vanished on the way to ${label}`);
        continue;
      }
      seen[label] = { widthPct: after.widthPct, radius: after.radius };
      const open = after.drawerHeight > DRAWER_CLOSED_HEIGHT + 2;
      if (open && after.widthPct < 99) {
        fail(
          "drawer tab",
          `${label}: the drawer is open at ${after.drawerHeight}px but the tab is ` +
            `${after.widthPct}% of the window - an open detent must be a full-width edge`
        );
      }
      if (open && after.radius !== "0px") {
        fail("drawer tab", `${label}: open at ${after.drawerHeight}px but still carrying a ${after.radius} tab corner`);
      }
      if (!open && after.widthPct > 30) {
        fail("drawer tab", `closed, but the tab is still ${after.widthPct}% wide - it did not tuck`);
      }
    }
    note(
      "drawer tab",
      Object.entries(seen)
        .map(([k, v]) => `${k} ${v.widthPct}%/${v.radius}`)
        .join(", ")
    );
  },
};

// ---------------------------------------------------------------------
// 3. Ruled lines land on whole device pixels, and agree within a module.
//
// The one check:preview cannot make. It verifies snapHairline's arithmetic
// and then reads the CALL SITES' source to check they pass a device scale,
// because a function handed CSS pixels uses them exactly as documented. This
// measures the rendered rects instead, at three pixel ratios, on a machine
// that has one.
//
// Andrew reported the fault at 3x - "some lines when at further zooms look
// blurry because they are wider versions that are grey while other lines
// show at skinny detailed lines" - and does not have a 3x display to hand
// any more. THIS IS WHERE THAT DISPLAY NOW LIVES.
//
// Sabotaged by passing `scale` instead of `scale * dpr` in
// PolotnoJsonRenderer, which IS the original bug: 1x passed (correctly - the
// fault does not exist at 1x), 2x reported "the thinnest rule is 1.999
// device px, not 1", 3x reported 2.999. Restored, every ratio reports 1.000.
// ---------------------------------------------------------------------
const hairlines: Probe = {
  name: "hairlines",
  ratios: [1, 2, 3],
  run: async (page, { base, journalId, dpr }) => {
    await page.goto(`${base}/app/j/${journalId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    const measured = await page.evaluate(() => {
      const ratio = window.devicePixelRatio;
      const perModule: { n: number; spread: number }[] = [];
      const thicknesses = new Set<string>();
      let rules = 0;
      for (const svg of document.querySelectorAll("svg")) {
        const found = [...svg.querySelectorAll("rect")].filter((r) => {
          const fill = r.getAttribute("fill");
          const stroke = parseFloat(r.getAttribute("stroke-width") || "0");
          if (!fill || fill === "none" || fill === "transparent" || stroke > 0) return false;
          const box = r.getBoundingClientRect();
          return box.height > 0 && box.width > 0 && box.height < box.width * 0.15;
        });
        if (found.length < 3) continue;
        const phases = found.map((r) => {
          const top = r.getBoundingClientRect().top * ratio;
          return top - Math.round(top);
        });
        found.forEach((r) => thicknesses.add((r.getBoundingClientRect().height * ratio).toFixed(3)));
        rules += found.length;
        perModule.push({ n: found.length, spread: Math.max(...phases) - Math.min(...phases) });
      }
      return { ratio, rules, modules: perModule.length, thicknesses: [...thicknesses], perModule };
    });

    if (measured.ratio !== dpr) {
      fail("hairlines", `asked for a ${dpr}x context and the page reports ${measured.ratio}x`);
      return;
    }
    if (measured.modules < 5 || measured.rules < 50) {
      fail("hairlines", `only ${measured.rules} rules in ${measured.modules} modules - nothing was measured`);
      return;
    }

    // WHOLE DEVICE PIXELS. This is what a CSS-px scale breaks: at 3x it
    // produced 3.000, which is the blur that was reported.
    const notWhole = measured.thicknesses.filter((t) => Math.abs(+t - Math.round(+t)) > 0.02);
    if (notWhole.length > 0) {
      fail("hairlines", `${dpr}x: rules ${notWhole.join(", ")} device px thick - not whole pixels`);
    }
    // THE THINNEST RULE ON THE PAGE IS EXACTLY ONE DEVICE PIXEL, and this is
    // the clause that catches a CSS scale.
    //
    // Not "no rule is thicker than the ratio", which was the first attempt
    // and is a DEAD SWITCH: a page legitimately carries 1, 2 and 3 device px
    // rules at 3x, because modules draw rules of different print weights, so
    // a bug that made everything 3.000 sat inside the allowance and passed.
    // What the bug actually does is move the FLOOR - a hairline pinned to one
    // CSS pixel is `dpr` device pixels - so the floor is what to measure. At
    // the page's opening zoom a 1.25 print px rule is well under one device
    // pixel at every ratio, so something on the page is always snapped to
    // exactly 1.
    const thinnest = Math.min(...measured.thicknesses.map(Number));
    if (Math.abs(thinnest - 1) > 0.02) {
      fail(
        "hairlines",
        `${dpr}x: the thinnest rule is ${thinnest.toFixed(3)} device px, not 1. A floor that scales with the ` +
          `pixel ratio means the caller passed a CSS scale - one CSS pixel is ${dpr} device pixels here`
      );
    }

    // ONE PHASE INSIDE A MODULE. The reported unevenness was rules in the
    // same module disagreeing - "the lines under each time slot", "todo
    // interior".
    const worst = Math.max(...measured.perModule.map((m) => m.spread));
    if (worst > 0.02) {
      fail("hairlines", `${dpr}x: rules within one module land on phases ${worst.toFixed(4)} apart`);
    }
    note(
      "hairlines",
      `${dpr}x: ${measured.rules} rules in ${measured.modules} modules, ` +
        `thickness ${measured.thicknesses.join("/")} device px, worst in-module phase spread ${worst.toFixed(4)}`
    );
  },
};

// ---------------------------------------------------------------------
// 4. Nothing on the console.
//
// Cheap, and it catches the class the other three are specific instances of:
// a page that renders but is complaining. Hydration mismatches show up here
// and nowhere else in this repo. Sabotaged with a console.error in
// StartDialog's render; it reported it on both pages.
// ---------------------------------------------------------------------
const consoleClean: Probe = {
  name: "console",
  ratios: [1],
  run: async (page, { base, journalId }) => {
    const problems: string[] = [];
    const listen = (message: { type: () => string; text: () => string }) => {
      if (message.type() === "error") problems.push(message.text());
    };
    page.on("console", listen);
    page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));

    for (const path of ["/app", `/app/j/${journalId}`]) {
      await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);
    }
    page.off("console", listen);

    // Next's dev overlay and the odd extension speak up about things that
    // are not this app's doing.
    const IGNORE = [/Download the React DevTools/i, /\[Fast Refresh\]/i, /favicon/i];
    const real = problems.filter((p) => !IGNORE.some((r) => r.test(p)));
    if (real.length > 0) {
      for (const problem of real.slice(0, 6)) fail("console", problem.slice(0, 220));
    } else {
      note("console", `no errors on /app or a journal page (${problems.length} ignored)`);
    }
  },
};

const ALL_PROBES: Probe[] = [pillTravel, drawerTab, hairlines, consoleClean];
const PROBES = ONLY ? ALL_PROBES.filter((p) => p.name.startsWith(ONLY)) : ALL_PROBES;
if (PROBES.length === 0) {
  console.error(`No probe matches --only ${ONLY}. Try: ${ALL_PROBES.map((p) => p.name).join(", ")}`);
  process.exit(1);
}

// A holder rather than a bare `let`: TypeScript narrows a module-level
// binding to its initializer when the only assignment is inside a function,
// so `browser?.close()` in the finally below came out as `never`.
const shared: { browser: Browser | null } = { browser: null };
let stopServer: () => void = () => {};

async function main() {
  const server = await ensureServer(explicitBase);
  stopServer = server.stop;
  console.log(`Base: ${server.base}${server.started ? " (started here)" : " (already running)"}`);

  const guest = await makeGuestJournal("Browser check journal");
  try {
    try {
      shared.browser = await chromium.launch({ channel: "chrome", headless: !HEADED });
    } catch (error) {
      console.error(
        "\nCould not start Chrome. playwright-core drives the installed browser rather than\n" +
          "downloading one, so this needs Google Chrome on the machine.\n" +
          `  ${(error as Error).message}`
      );
      failures++;
      return;
    }
    const browser = shared.browser;
    console.log(`Chrome: ${browser.version()}\n`);

    const ratios = [...new Set(PROBES.flatMap((p) => p.ratios))].sort();
    for (const dpr of ratios) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: dpr });
      await context.addCookies([
        { name: guest.cookieName, value: guest.cookieValue, domain: "localhost", path: "/" },
      ]);
      const page = await context.newPage();
      for (const probe of PROBES.filter((p) => p.ratios.includes(dpr))) {
        try {
          await probe.run(page, { base: server.base, journalId: guest.journalId, dpr });
        } catch (error) {
          fail(probe.name, `threw at ${dpr}x - ${(error as Error).message.split("\n")[0]}`);
        }
      }
      await context.close();
    }
  } finally {
    await guest.remove();
  }
}

try {
  await main();
} catch (error) {
  console.error(`  ${(error as Error).message}`);
  failures++;
} finally {
  await shared.browser?.close();
  stopServer();
  await disconnect();
}

console.log(
  failures === 0
    ? "\nEverything the browser can see agrees with the code."
    : `\n${failures} problem(s) only a browser could find.`
);
process.exit(failures === 0 ? 0 : 1);
