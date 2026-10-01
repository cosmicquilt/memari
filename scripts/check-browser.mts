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
//   - hairlines painted a frame or two too thick on every page change,
//     because the device ratio arrived after the paint - a bug with no
//     symptom at all on a 1x screen;
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

import { chromium, type Browser, type Locator, type Page } from "playwright-core";
import { ensureServer, makeGuestJournal, disconnect, incrementsOffSpread, storedRows, storedModules, flushUnderHours, setWeeklySidebar, retypeModule } from "./appUnderTest.mjs";
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

type Context = { base: string; journalId: string; dpr: number; forgetSettings: () => Promise<void> };
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

    // THE PALETTE'S CARDS ARE MEASURED TOO - 77 small drawings of real modules
    // at their own scale, beside the 4 on the page - and they draw at idle, up
    // to two seconds after the page settles (see the palette's drawCards).
    // This used to wait a fixed 2.5s, which caught them on some runs and not
    // others: measured on one build, 4 modules at 1x and 81 at 2x and 3x,
    // and 1x passed only when an earlier probe had loaded the page first. So:
    // wait for them, and fail on their absence rather than on a stopwatch.
    const ruledDrawings = `(() => {
      let n = 0;
      for (const svg of document.querySelectorAll("svg")) {
        const k = [...svg.querySelectorAll("rect")].filter((r) => {
          const fill = r.getAttribute("fill");
          if (!fill || fill === "none" || fill === "transparent" || parseFloat(r.getAttribute("stroke-width") || "0") > 0) return false;
          const b = r.getBoundingClientRect();
          return b.height > 0 && b.width > 0 && b.height < b.width * 0.15;
        }).length;
        if (k >= 3) n++;
      }
      return n;
    })()`;
    for (let i = 0, last = -1; i < 40; i++) {
      const n = (await page.evaluate(ruledDrawings)) as number;
      if (n >= 5 && n === last) break;
      last = n;
      await page.waitForTimeout(250);
    }

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
      fail(
        "hairlines",
        `only ${measured.rules} rules in ${measured.modules} modules after 10s - the palette's cards never drew`
      );
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
// 4. A page change never paints a wrong-ratio frame.
//
// Andrew: "when changing between pages or spreads in app. the split second
// it loads in the lines look thicker before quickly jumping to their final
// state." useDevicePixelRatio started at 1 and corrected in a useEffect,
// which runs AFTER the paint, so every newly-mounted module drew a frame or
// two of hairlines floored at one CSS pixel - three device pixels at 3x.
//
// ONLY OBSERVABLE ABOVE 1x, where one CSS pixel and one device pixel are the
// same thing and the bug is invisible. That is the whole argument for the
// harness carrying its own pixel ratios.
//
// WHAT THIS HOLDS, AND WHAT IT DOES NOT. There were two halves to the fix.
// This probe holds the SERVER half - that the ratio reaches the markup - and
// sabotaging it (parse the cookie as dpr 1) reports "348 rules with NO rule
// thinner than 3 device px". The other half, correcting the ratio in a
// layout effect rather than an effect, is NOT held here: the only way to
// mount a RectLayer fresh in a live document is a route this probe cannot
// reach, and sabotaging that half alone leaves this green. It rests on a
// measurement taken by hand in a visible window, recorded in
// useDevicePixelRatio.
//
// The invariant is the hairline probe's, applied to every FRAME of a
// transition rather than to the settled page: the thinnest rule on screen is
// one device pixel. The dpr-1 floor puts the floor at `dpr` instead, so
// during the flash there is no 1 at all.
//
// Sabotaged by putting the useEffect back: "after opening a timeline card: a
// frame painted 348 rules with the thinnest at 3 device px". The FIRST LOAD
// case stayed green under that sabotage, which is correct rather than a
// miss - until the editor has measured the window the canvas is hidden
// outright, so there is nothing to see whatever the ratio says.
// ---------------------------------------------------------------------
const pageChange: Probe = {
  name: "page change",
  ratios: [3],
  run: async (page, { base, journalId, dpr }) => {
    // INSTALLED WITH addInitScript, which runs on every new document before
    // any page script does. Two reasons, and the second was a surprise:
    // the flash is in the FIRST frames of a load, so a recorder started
    // afterwards has already missed it - and opening a timeline card turns
    // out to be a FULL DOCUMENT NAVIGATION, not a client-side transition.
    // A recorder set with page.evaluate was wiped by it, and the first
    // version of this probe reported "no card click changed the page"
    // because its own state had gone with the document.
    await page.addInitScript(`
      window.__f = [];
      requestAnimationFrame(function step() {
        var rects = [].slice.call(document.querySelectorAll("svg rect")).filter(function (r) {
          var f = r.getAttribute("fill"), sw = parseFloat(r.getAttribute("stroke-width") || "0");
          if (!f || f === "none" || f === "transparent" || sw > 0) return false;
          var h = +(r.getAttribute("height") || 0), w = +(r.getAttribute("width") || 0);
          return h > 0 && w > 0 && h < w * 0.15;
        });
        if (rects.length) {
          // CAPPED at 300. A weekly spread carries 3000 rects and measuring
          // every one per frame slows the page down enough to change what is
          // being measured. The wrong-ratio floor applies to every rule at
          // once, so a sample answers the question.
          var cap = Math.min(rects.length, 300);
          var thin = Infinity;
          for (var i = 0; i < cap; i++) {
            var d = rects[i].getBoundingClientRect().height * window.devicePixelRatio;
            if (d < thin) thin = d;
          }
          // HIDDEN FRAMES DO NOT COUNT. Until the editor has measured the
          // window, VIEWPORT_GUARD_SCRIPT marks the document and globals.css
          // puts the canvas at visibility:hidden - the marks still have
          // geometry, so this probe read them and called a first load broken
          // when nobody could see it. The check was wrong, not the app.
          var hidden = document.documentElement.hasAttribute("data-memari-viewport-unmeasured");
          window.__f.push({ n: rects.length, thinnest: +thin.toFixed(2), hidden: hidden });
        }
        if (window.__f.length < 400) requestAnimationFrame(step);
      });`);

    /** The worst frame that painted rules at the wrong floor. */
    const worstOf = async (what: string) => {
      const frames = ((await page.evaluate(`window.__f || []`)) ?? []) as {
        n: number;
        thinnest: number;
        hidden: boolean;
      }[];
      const drawn = frames.filter((f) => f.n >= 20 && !f.hidden);
      if (drawn.length === 0) {
        fail("page change", `${what}: no frame drew any rules - nothing was measured`);
        return;
      }
      // THE SIGNATURE IS EXACTLY `dpr`, not "anything but 1".
      //
      // The wrong floor is one CSS pixel, which is precisely dpr device
      // pixels, and it applies to every hairline at once. "Thinnest is not
      // 1" looked like the same statement and is not: a PARTIAL frame part
      // way through a client-side transition can hold a few dozen marks that
      // genuinely have no sub-pixel rule among them, and this reported one
      // at 3x - "33 rules with the thinnest at 2 device px". Two is not a
      // CSS pixel on a 3x screen and never was the bug. The check was wrong,
      // not the app.
      let worst: { n: number; thinnest: number; hidden: boolean } | null = null;
      for (const frame of drawn) {
        if (Math.abs(frame.thinnest - dpr) < 0.02 && (worst === null || frame.n > worst.n)) worst = frame;
      }
      if (worst) {
        fail(
          "page change",
          `${dpr}x ${what}: a frame painted ${worst.n} rules with NO rule thinner than ${worst.thinnest} ` +
            `device px - which is exactly one CSS pixel here, so the ratio had not arrived and every ` +
            `hairline was floored at it`
        );
      } else {
        note(
          "page change",
          `${dpr}x ${what}: ${drawn.length} drawn frames, none floored at a CSS pixel`
        );
      }
    };

    // FIRST LOAD writes the viewport cookie and is hidden while it does -
    // the guard script flags a page rendered for the wrong window, and
    // globals.css keeps the canvas at visibility:hidden until the editor
    // measures. Nothing is visible to get wrong.
    await page.goto(`${base}/app/j/${journalId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await worstOf("first load");

    // THE SECOND LOAD IS THE ONE THAT MATTERS, and it took two wrong probes
    // to find it. The cookie now matches this window, so the guard does NOT
    // hide anything: the server's own markup paints immediately. If the
    // server did not know the display's ratio it floored every hairline at a
    // CSS pixel and that is what is on screen, before a line of JavaScript
    // has run.
    //
    // Opening a page card was tried here and is a DEAD SWITCH: React
    // reconciles the existing RectLayers rather than remounting them, so the
    // ratio in their state survives the transition and nothing can be wrong.
    // Sabotaging the fix left it green, which is how that was found.
    await page.evaluate(`window.__f = []`);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await worstOf("a reload with the viewport cookie already set");
  },
};

// ---------------------------------------------------------------------
// 5. Nothing on the console.
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

// ---------------------------------------------------------------------
// 6. A mutation does not reload the document.
//
// Andrew, adding a daily page to a journal that had none: "it did a full
// page reload and shifted the timeline view back to the beginning". Every
// structural change in the drawer ended with window.location.reload() -
// eight call sites - so the drawer's scroll and detent, the canvas's zoom
// and scroll, and every in-flight animation went with the document.
//
// The invariant is crude on purpose and holds all eight at once: put a value
// on `window`, change something, and it must still be there. Nothing else
// distinguishes "asked the server again" from "threw the page away", and a
// reload is invisible to every other check in this repo.
//
// Sabotaged by putting window.location.reload() back into addBlank:
// "window state was wiped - the document was reloaded".
// ---------------------------------------------------------------------
const noReload: Probe = {
  name: "no reload",
  ratios: [1],
  run: async (page, { base, journalId }) => {
    await page.goto(`${base}/app/j/${journalId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    const add = page.locator('button[aria-label^="Add a page to"]').first();
    if ((await add.count()) === 0) {
      fail("no reload", "no add-a-page control in the timeline");
      return;
    }
    const before = await page.locator("button.memari-card").count();
    await page.evaluate(`window.__survives = "yes"`);
    await add.click();
    await page.waitForTimeout(3500);

    const survived = (await page.evaluate(`window.__survives`)) === "yes";
    const after = await page.locator("button.memari-card").count();
    if (!survived) {
      fail("no reload", "window state was wiped - the document was reloaded to show a change");
    }
    if (after <= before) {
      fail("no reload", `the page count did not change (${before} -> ${after}) - the add did not take`);
    }
    if (survived && after > before) {
      note("no reload", `a page was added (${before} -> ${after} cards) without reloading the document`);
    }
  },
};

// ---------------------------------------------------------------------
// EVENT DRAG: the live preview sits under the pointer, in the right day.
//
// Reported 2026-09-28: dragging to create an event showed its preview "in
// the wrong place at the wrong size... each day next to each other within
// the first day of the week at the top". The preview is drawn inside the
// module, which is laid out at PRINT size and shrunk by the canvas zoom; it
// also multiplied by the zoom itself, so the zoom applied twice.
//
// Why only a browser can see it: every number in the code was right in its
// own space. The unit tests check hourlyGridGeometry and slotAt, which were
// correct; what was wrong was which coordinate space the preview's CSS was
// in, and that only exists once a real transform is applied. My first check
// of it compared a layer-local number with an on-screen width and passed.
//
// So this compares ON-SCREEN RECTANGLES only: for every day column on both
// pages, press in the middle of that day's drawn tab, drag down, and the
// preview must contain the pointer and line up with the tab. At two zooms,
// because the error scaled with the zoom - fit-width, and zoomed in twice.
//
// Sabotaged by putting `* scale` back on the preview's four numbers: all
// seven columns miss, as 35x9 boxes at the top-left of each page - the
// report, exactly.
//
// Part 2 checks the preview IS the final version - the second report, the
// same day - including across an existing event. See the notes in it.
// ---------------------------------------------------------------------
const eventDrag: Probe = {
  name: "event drag",
  ratios: [1, 2],
  run: async (page, { base, journalId, dpr }) => {
    // ANY update loop during the gesture is a failure. One shipped for an
    // hour on 2026-09-28: setting the day's marks aside re-rendered the
    // module, which re-drew the preview, which set them aside again - and
    // the editor stuck mid-save with "Maximum update depth exceeded".
    const loops: string[] = [];
    const onConsole = (m: { type(): string; text(): string }) => {
      if (m.type() === "error" && /Maximum update depth/i.test(m.text())) loops.push(m.text().slice(0, 80));
    };
    page.on("console", onConsole);
    await page.goto(`${base}/app/j/${journalId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    // Shared helpers, installed once in the page.
    await page.evaluate(`(() => {
      const tick = (ms) => new Promise((r) => setTimeout(r, ms));
      const r4 = (b) => ({ left: +b.left.toFixed(1), top: +b.top.toFixed(1), width: +b.width.toFixed(1), height: +b.height.toFixed(1) });
      const send = (layer, type, x, y) => {
        layer.setPointerCapture = () => {};
        layer.releasePointerCapture = () => {};
        layer.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true,
          pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1, isPrimary: true }));
      };
      const tabsOf = (layer) => {
        const rects = [...layer.parentElement.querySelectorAll("svg rect")];
        const top = Math.min(...rects.map((r) => +r.getAttribute("y")));
        return rects
          .filter((r) => Math.abs(+r.getAttribute("y") - top) < 0.5 && +r.getAttribute("width") > 200)
          .map((r) => r.getBoundingClientRect())
          .sort((a, b) => a.left - b.left);
      };
      const previewBlocks = (layer) =>
        [...layer.querySelectorAll("[data-event-preview] svg rect")].map((r) => ({ ...r4(r.getBoundingClientRect()),
          stroke: r.getAttribute("stroke-width"), rx: r.getAttribute("rx") })).sort((a, b) => a.left - b.left);
      const savedBlocks = (layer) =>
        [...layer.parentElement.querySelectorAll("svg rect")]
          .filter((r) => (r.getAttribute("opacity") === "0.55") && !r.closest("[data-event-preview]"))
          .map((r) => ({ ...r4(r.getBoundingClientRect()), stroke: r.getAttribute("stroke-width"), rx: r.getAttribute("rx") }))
          .sort((a, b) => a.left - b.left);
      window.__probe = { tick, r4, send, tabsOf, previewBlocks, savedBlocks };
    })()`);

    // --- 1. EVERY COLUMN: the preview is under the pointer, in its own day --
    const perColumn = async () =>
      (await page.evaluate(`(async () => {
        const { tick, send, tabsOf, previewBlocks } = window.__probe;
        const out = [];
        for (const layer of document.querySelectorAll("[data-event-layer]")) {
          const L = layer.getBoundingClientRect();
          for (const tab of tabsOf(layer)) {
            const x = tab.left + tab.width / 2;
            // High in the column, clear of the events part 2 makes lower down.
            const y0 = Math.max(L.top + L.height * 0.2, 60);
            const y1 = y0 + 20;
            if (y1 > innerHeight) continue;
            send(layer, "pointerdown", x, y0); await tick(120);
            send(layer, "pointermove", x, y1); await tick(120);
            // THE BLOCK AT THE POINTER - by both coordinates. The preview draws
            // the whole day's events (so a clash shows both), and a column that
            // already holds some has other blocks under the same x.
            const P = previewBlocks(layer).find(
              (p) => p.left <= x && x <= p.left + p.width && p.top <= y1 && y0 <= p.top + p.height
            );
            out.push(P ? {
              under: P.top <= y0 + 3 && y1 - 3 <= P.top + P.height,
              inOwnDay: P.left >= tab.left - 0.5 && P.left + P.width <= tab.right + 0.5,
              where: P.left + "," + P.top + " " + P.width + "x" + P.height,
            } : { under: false, inOwnDay: false, where: "no preview under the pointer" });
            layer.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }));
            await tick(80);
          }
        }
        return out;
      })()`)) as Array<{ under: boolean; inOwnDay: boolean; where: string }>;

    for (const zoom of ["fit width", "zoomed in"]) {
      if (zoom === "zoomed in") {
        const zoomIn = page.locator('button[title="Zoom in"]');
        await zoomIn.click();
        await zoomIn.click();
        await page.waitForTimeout(800);
      }
      const columns = await perColumn();
      const bad = columns.filter((c) => !c.under || !c.inOwnDay);
      if (columns.length < 3) {
        fail("event drag", `${dpr}x ${zoom}: found ${columns.length} day columns to drag in, expected at least 3`);
      } else if (bad.length > 0) {
        fail("event drag", `${dpr}x ${zoom}: ${bad.length}/${columns.length} previews not under the pointer in their own day - ${bad.slice(0, 3).map((c) => c.where).join("; ")}`);
      } else {
        note("event drag", `${dpr}x ${zoom}: ${columns.length}/${columns.length} previews under the pointer, in their own day`);
      }
    }

    // --- 2. THE PREVIEW IS THE FINAL VERSION ----------------------------
    //
    // Reported 2026-09-28: the preview had "the wrong border thickness", was
    // "too wide and extends over the time of day text", and "disappears when
    // even creation popup window appears". It was a hand-styled box; it is
    // now drawn by the same renderer as the saved event. So: make an event,
    // read the preview with the popup open, save, and the saved blocks must
    // be the same rectangles, border and corners. Then drag a second across
    // it - a clash - and BOTH must match, split as the saved page splits
    // them. At fit width, in a column of its own per ratio.
    await page.locator('button[title^="Fill screen with page width"]').click();
    await page.waitForTimeout(800);
    const roundTrip = async (title: string, over: "empty" | "clash") =>
      (await page.evaluate(`(async () => {
        const { tick, send, tabsOf, previewBlocks, savedBlocks } = window.__probe;
        const layer = () => document.querySelectorAll("[data-event-layer]")[0];
        const L = layer().getBoundingClientRect();
        const tab = tabsOf(layer())[${dpr}];
        const x = tab.left + tab.width / 2;
        let y0 = L.top + L.height * 0.55, y1 = y0 + 22;
        if (${JSON.stringify(over)} === "clash") {
          const mine = savedBlocks(layer()).find((b) => b.left >= tab.left - 1 && b.left < tab.right);
          if (!mine) return { error: "no event to clash with" };
          y0 = mine.top + mine.height + 8; y1 = mine.top + 4;  // below it, dragging up across it
        }
        send(layer(), "pointerdown", x, y0); await tick(150);
        send(layer(), "pointermove", x, y1); await tick(300);
        const dragging = previewBlocks(layer());
        send(layer(), "pointerup", x, y1); await tick(400);
        const dialog = document.querySelector("[role=dialog]");
        if (!dialog) return { error: "no popup opened" };
        const input = dialog.querySelector("input");
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(title)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await tick(250);
        const withPopup = previewBlocks(layer());
        // NOT REBUILT: the grid's own element is tagged, and must be the same
        // element once the event has landed. A rebuild makes a new one - which
        // is the canvas refresh Andrew asked to be rid of, 2026-09-28.
        const grid = layer().parentElement;
        grid.__probeSurvives = true;
        // NO FLICKER: every frame from Add until it settles shows exactly the
        // blocks it should - never none (the preview gone before the event
        // arrived) and never double (both at once).
        const inColumn = (list) => list.filter((b) => b.left >= tab.left - 1 && b.left < tab.right).length;
        const frames = [];
        let sampling = true;
        const sample = () => {
          if (!sampling) return;
          const l = layer();
          if (l) frames.push(inColumn(previewBlocks(l)) + inColumn(savedBlocks(l).filter(() => true)));
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        [...dialog.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add").click();
        for (let i = 0; i < 60 && layer()?.querySelector("[data-event-preview]"); i++) await tick(250);
        await tick(500);
        sampling = false;
        const saved = savedBlocks(layer()).filter((b) => b.left >= tab.left - 1 && b.left < tab.right);
        const survived = layer()?.parentElement === grid && grid.__probeSurvives === true;
        return { dragging, withPopup, saved, survived, frameCounts: [...new Set(frames)].sort(), frames: frames.length };
      })()`)) as {
        error?: string;
        survived?: boolean;
        frameCounts?: number[];
        frames?: number;
        dragging: Array<Record<string, number | string>>;
        withPopup: Array<Record<string, number | string>>;
        saved: Array<Record<string, number | string>>;
      };

    for (const over of ["empty", "clash"] as const) {
      const r = await roundTrip(`Probe ${over} ${dpr}x`, over);
      const label = `${dpr}x ${over === "empty" ? "a new event" : "a new event across an existing one"}`;
      if (r.error) {
        fail("event drag", `${label}: ${r.error}`);
        continue;
      }
      if (r.withPopup.length === 0) {
        fail("event drag", `${label}: the preview disappeared when the popup opened`);
        continue;
      }
      const expected = over === "empty" ? 1 : 2;
      const same = (a: Record<string, number | string>, b: Record<string, number | string>) =>
        Math.max(...(["left", "top", "width", "height"] as const).map((k) => Math.abs(Number(a[k]) - Number(b[k])))) <= 1 &&
        a.stroke === b.stroke &&
        a.rx === b.rx;
      if (r.withPopup.length !== expected || r.saved.length !== expected) {
        fail("event drag", `${label}: preview showed ${r.withPopup.length} block(s), the page saved ${r.saved.length}, expected ${expected}`);
      } else if (!r.withPopup.every((p, i) => same(p, r.saved[i]))) {
        fail(
          "event drag",
          `${label}: the preview is not the saved event - preview ${JSON.stringify(r.withPopup)} saved ${JSON.stringify(r.saved)}`
        );
      } else {
        note("event drag", `${label}: preview and saved result identical (${expected} block${expected === 1 ? "" : "s"}, border and corners included)`);
      }
      if (!r.survived) {
        fail("event drag", `${label}: saving REBUILT the editor - the canvas refreshed`);
      }
      const counts = r.frameCounts ?? [];
      // In the column's SAVED blocks, a hidden mark still counts; what the
      // eye sees is what is rendered, so hidden ones are excluded - see
      // savedBlocks, which reads only what the module is drawing.
      if (counts.some((c) => c !== expected)) {
        fail("event drag", `${label}: ${r.frames} frames while saving showed ${counts.join("/")} block(s) - a flicker (expected ${expected} throughout)`);
      } else if (r.survived) {
        note("event drag", `${label}: saved in place, ${r.frames} frames with ${expected} block(s) throughout - no refresh, no flicker`);
      }
    }

    // --- DELETING: gone at once, in place, and it stays gone ------------
    //
    // Delete no longer rebuilds either. The event's marks are set aside the
    // moment Delete is pressed and stay aside until the drawing without it
    // arrives - so it must drop to one fewer block within a couple of frames,
    // never come back, and leave the editor the same element.
    {
      const d = (await page.evaluate(`(async () => {
        const { tick, savedBlocks } = window.__probe;
        const layer = () => document.querySelectorAll("[data-event-layer]")[0];
        const tab = window.__probe.tabsOf(layer())[${dpr}];
        const inColumn = () => savedBlocks(layer()).filter((b) => b.left >= tab.left - 1 && b.left < tab.right);
        const before = inColumn();
        const target = before[before.length - 1];
        if (!target) return { error: "nothing to delete" };
        const l = layer();
        l.setPointerCapture = () => {}; l.releasePointerCapture = () => {};
        l.dispatchEvent(new PointerEvent("pointerdown", { clientX: target.left + target.width / 2,
          clientY: target.top + target.height / 2, bubbles: true, cancelable: true, pointerId: 1,
          button: 0, buttons: 1, isPrimary: true }));
        await tick(400);
        const dialog = document.querySelector("[role=dialog]");
        const del = dialog && [...dialog.querySelectorAll("button")].find((b) => b.textContent.trim() === "Delete");
        if (!del) return { error: "no Delete in the popup" };
        const grid = l.parentElement;
        grid.__probeSurvives = true;
        const frames = [];
        let sampling = true;
        const sample = () => { if (!sampling) return; frames.push(inColumn().length); requestAnimationFrame(sample); };
        requestAnimationFrame(sample);
        del.click();
        await tick(4000);
        sampling = false;
        return { before: before.length, frames, survived: layer()?.parentElement === grid && grid.__probeSurvives === true };
      })()`)) as { error?: string; before: number; frames: number[]; survived: boolean };
      if (d.error) {
        fail("event drag", `${dpr}x deleting: ${d.error}`);
      } else {
        const after = d.before - 1;
        const firstGone = d.frames.findIndex((c) => c === after);
        const cameBack = firstGone >= 0 && d.frames.slice(firstGone).some((c) => c !== after);
        if (!d.survived) fail("event drag", `${dpr}x deleting REBUILT the editor`);
        else if (firstGone < 0 || firstGone > 3) fail("event drag", `${dpr}x deleting: still drawn ${firstGone < 0 ? "after 4s" : `for ${firstGone} frames`}`);
        else if (cameBack) fail("event drag", `${dpr}x deleting: the event came back after it had gone (${[...new Set(d.frames)].join("/")})`);
        else note("event drag", `${dpr}x deleting: gone within ${firstGone} frame(s), in place, and stays gone`);
      }
    }

    // --- 3. A REAL MOUSE DRAG SELECTS NO TEXT ----------------------------
    //
    // Reported 2026-09-28: dragging to create an event also highlighted the
    // "Untitled" in its preview - the browser's own text selection, which is
    // what a mouse drag does by default. Everything above dispatches
    // synthetic pointer events, and a synthetic event never triggers a
    // default action, so none of it could see this. Playwright's mouse sends
    // real input, which does.
    //
    // Read DURING the drag, which is when it shows: once the popup opens, it
    // selects its own title field, and a selection inside an input is not
    // what the person was complaining about.
    {
      const at = (await page.evaluate(`(() => {
        const layer = document.querySelectorAll("[data-event-layer]")[0];
        const L = layer.getBoundingClientRect();
        const tab = window.__probe.tabsOf(layer)[0];
        return { x: tab.left + tab.width / 2, y: Math.max(L.top + L.height * 0.3, 80) };
      })()`)) as { x: number; y: number };
      await page.evaluate(`window.getSelection()?.removeAllRanges()`);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      // Down, then back up over the first row - where the preview's label is,
      // which is what a person's hand does and what my first version did not.
      for (let step = 1; step <= 8; step++) await page.mouse.move(at.x, at.y + step * 6);
      for (let step = 7; step >= 0; step--) await page.mouse.move(at.x + (step % 2 ? 3 : -3), at.y + step * 6);
      await page.waitForTimeout(200);
      // ANY SELECTION INSIDE THE LAYER COUNTS, even a collapsed caret. That
      // caret is where the highlight grows from: measured in the in-app
      // browser, a real press on the hours put one inside the event layer,
      // and a slower drag stretched it across "Untitled". The first version
      // of this clause read only the selected TEXT, and passed.
      const selected = (await page.evaluate(`(() => {
        const s = window.getSelection();
        const text = s?.toString() ?? "";
        const inside = (n) => !!(n && (n.nodeType === 1 ? n : n.parentElement)?.closest?.("[data-event-layer]"));
        const anchored = !!s && s.rangeCount > 0 && (inside(s.anchorNode) || inside(s.focusNode));
        return text.trim() || (anchored ? "(a selection anchored inside the event layer)" : "");
      })()`)) as string;
      await page.mouse.up();
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      if (selected.trim().length > 0) {
        fail("event drag", `${dpr}x: a real mouse drag selected text - "${selected.trim().slice(0, 40)}"`);
      } else {
        note("event drag", `${dpr}x: a real mouse drag selects no text`);
      }
    }

    page.off("console", onConsole);
    if (loops.length > 0) fail("event drag", `${dpr}x: ${loops.length} update-loop error(s) during the gesture - "${loops[0]}"`);
  },
};

// ---------------------------------------------------------------------
// ZOOM BAR: it stays sixteen pixels above the drawer, including after the
// editor is rebuilt on the same page.
//
// Reported 2026-09-28: after adding an event, "zoom ui bar is at high
// position in middle of screen where it would be if timeline was open". The
// drawer writes its height onto the bar as a CSS variable, by element, and
// re-wrote it only when the LEVEL changed. A rebuild on the same page - an
// event, a font, a calendar - made a new bar with no variable, which fell
// back to the resting drawer's height. Hidden until the drawer began loading
// at compact, where resting is the wrong answer.
//
// A rebuild is triggered here by switching the font, which is one; measured
// as the gap from the bar's bottom edge to the drawer's top, which must be
// the same before and after.
// ---------------------------------------------------------------------
const zoomBar: Probe = {
  name: "zoom bar",
  ratios: [1],
  run: async (page, { base, journalId }) => {
    await page.goto(`${base}/app/j/${journalId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    const measure = async () =>
      (await page.evaluate(`(() => {
        const bar = document.querySelector('button[title="Zoom in"]')?.closest("[id]");
        // The drawer's VISIBLE top edge is its grabber. The <section>'s own
        // box does not move with the drawer - measured: it read 186 at both
        // compact and resting - so it cannot be what the gap is taken from.
        const grabber = document.querySelector('section[aria-label="Planner timeline"] [role="separator"]');
        if (!bar || !grabber) return null;
        const top = grabber.getBoundingClientRect().top;
        return { gap: Math.round(top - bar.getBoundingClientRect().bottom), drawerHeight: Math.round(innerHeight - top) };
      })()`)) as { gap: number; drawerHeight: number } | null;

    // SETTLED FIRST. A journal made by a script has no default time zone, so
    // its first open seeds one - at a moment set by the server, not by this
    // probe. When that rebuilt the editor, landing mid-measurement made the
    // first reading a bar caught part-way (-28px). It no longer rebuilds (see
    // the first visit probe), but the seed still redraws the page, so: wait
    // for it.
    for (let i = 0; i < 60; i++) {
      const seeded = await page.evaluate(
        `!!document.querySelector('select[aria-label^="This journal"]') && !/Your default is not set yet/.test(document.body.textContent || "")`
      );
      if (seeded) break;
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1500);

    // OFF THE DEFAULT FIRST. The bar's fallback IS the default drawer height,
    // so at the default the bug cannot show - measured: this probe passed on
    // the broken code until it moved the drawer. Dragged up by hand, with a
    // real mouse, to the next detent.
    const grabber = (await page.evaluate(`(() => {
      const g = document.querySelector('section[aria-label="Planner timeline"] [role="separator"]');
      if (!g) return null;
      const r = g.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`)) as { x: number; y: number } | null;
    const loaded = await measure();
    if (!grabber || !loaded) {
      fail("zoom bar", "could not find the drawer's grabber, the zoom bar or the drawer");
      return;
    }
    await page.mouse.move(grabber.x, grabber.y);
    await page.mouse.down();
    for (let step = 1; step <= 10; step++) await page.mouse.move(grabber.x, grabber.y - step * 7);
    await page.mouse.up();
    await page.waitForTimeout(1500);

    const before = await measure();
    if (!before || before.drawerHeight <= loaded.drawerHeight) {
      fail("zoom bar", `could not move the drawer off its default (${loaded.drawerHeight}px -> ${before?.drawerHeight}px)`);
      return;
    }
    // Switch the font - a rebuild on the same page - and back.
    const switchTo = async (label: string) => {
      await page.evaluate(`document.querySelector('button[aria-label="${label}"]')?.click()`);
      await page.waitForTimeout(4000);
    };
    const current = (await page.evaluate(
      `document.querySelector('button[aria-label="Sans serif"]')?.getAttribute("aria-pressed")`
    )) as string | null;
    const other = current === "true" ? "Serif" : "Sans serif";
    await switchTo(other);
    const after = await measure();
    await switchTo(other === "Serif" ? "Sans serif" : "Serif");

    if (!after) {
      fail("zoom bar", "the zoom bar or the drawer was gone after the rebuild");
    } else if (Math.abs(after.gap - before.gap) > 1 || Math.abs(before.gap - 16) > 2) {
      fail(
        "zoom bar",
        `the bar sat ${before.gap}px above a ${before.drawerHeight}px drawer, and ${after.gap}px above it after a rebuild - it should stay 16px`
      );
    } else {
      note(
        "zoom bar",
        `16px above the drawer before and after a rebuild - opened at ${loaded.drawerHeight}px (compact), moved to ${before.drawerHeight}px`
      );
    }
  },
};

// ---------------------------------------------------------------------
// SPINE DRAG: with increments off, dragging the hours' edge moves BOTH pages
// of the spread live, takes nothing below its minimum, stops when either
// page's stack is all at its minimum, releases to exactly what it showed,
// and leaves every other level's hours alone.
//
// Reported 2026-09-29 on a weekly spread with Habits under the right-hand
// to-do: the right page moved only on release, and then Habits was one row
// tall - below its minimum - because the edge squeezed what was under it
// towards zero. The save also reached every hourly grid in the book, so the
// daily page's hours moved with the weekly ones.
//
// Its own journal and its own browser context, built by incrementsOffSpread,
// so every other probe keeps its increments on.
// ---------------------------------------------------------------------
const spineDrag: Probe = {
  name: "spine drag",
  ratios: [1],
  run: async (page, { base }) => {
    const guest = await makeGuestJournal("Spine drag check");
    // TALLER than the other probes' window. At 800px the grown hours put
    // their own edge under the timeline drawer, so the second drag pressed
    // the drawer instead and, moving nothing, passed - measured: the handle
    // at y=735 with the drawer's top at 614.
    const context = await page.context().browser()!.newContext({
      viewport: { width: VIEWPORT.width, height: 1200 },
      deviceScaleFactor: 1,
    });
    try {
      const spread = await incrementsOffSpread(guest.journalId);
      await context.addCookies([{ name: guest.cookieName, value: guest.cookieValue, domain: "localhost", path: "/" }]);
      const tab = await context.newPage();
      await tab.goto(`${base}/app/j/${guest.journalId}`, { waitUntil: "networkidle" });
      await tab.waitForTimeout(3000);

      const [left, right] = spread.pages;
      const ids = spread.pages.flatMap((p) => [p.spineId, ...p.followers.map((f) => f.id)]);
      type Rows = Record<string, { rowStart: number; rowSpan: number } | null>;
      // The rows each module is laid out at, read off its own grid-row -
      // exact, where a pixel rect would be rounded.
      const read = async () =>
        (await tab.evaluate(`(() => {
          const out = {};
          for (const id of ${JSON.stringify(ids)}) {
            const el = document.querySelector('[data-module-instance-id="' + id + '"]');
            const m = el && /(\\d+) \\/ span (\\d+)/.exec(el.style.gridRow);
            out[id] = m ? { rowStart: +m[1] - 1, rowSpan: +m[2] } : null;
          }
          return out;
        })()`)) as Rows;

      const before = await read();
      if (!before[left.spineId] || !before[right.spineId] || !before[left.followers[0]?.id]) {
        fail("spine drag", "the weekly spread's hours and the module under them are not on screen");
        return;
      }
      const pitch = (await tab.evaluate(`(() => {
        const a = document.querySelector('[data-module-instance-id="${left.spineId}"]').getBoundingClientRect();
        const b = document.querySelector('[data-module-instance-id="${left.followers[0].id}"]').getBoundingClientRect();
        return (b.top - a.top) / ${before[left.followers[0].id]!.rowStart - before[left.spineId]!.rowStart};
      })()`)) as number;

      // THE EDGE'S GRAB STRIP IS THE HOURS' EDGE, not the top of the module
      // below. Reported 2026-09-29 with increments off: "the below resize
      // handle seems too low, its region is the header of the todo below
      // it". Checked on both pages, as drawn, before anything is dragged.
      const strips = (await tab.evaluate(`(() => ${JSON.stringify(spread.pages.map((p) => ({ spine: p.spineId, below: p.followers[0]?.id ?? null })))}.map(({ spine, below }) => {
        const strip = document.querySelector('[data-stack-key="hourly-stack:' + spine + '"]');
        const hours = document.querySelector('[data-module-instance-id="' + spine + '"]');
        const next = below && document.querySelector('[data-module-instance-id="' + below + '"]');
        if (!strip || !hours || !next) return null;
        const s = strip.getBoundingClientRect(), h = hours.getBoundingClientRect(), n = next.getBoundingClientRect();
        return { stripTop: s.top, stripBottom: s.bottom, hoursBottom: h.bottom, belowTop: n.top };
      }))()`)) as Array<{ stripTop: number; stripBottom: number; hoursBottom: number; belowTop: number } | null>;
      strips.forEach((strip, i) => {
        const side = i === 0 ? "left" : "right";
        if (!strip) fail("spine drag", `the ${side} page's hours have no grab strip, or nothing below them`);
        else if (strip.stripBottom > strip.belowTop + 0.5) {
          fail("spine drag", `the ${side} hours' grab strip reaches ${(strip.stripBottom - strip.belowTop).toFixed(1)}px into the module below`);
        } else if (strip.stripBottom < strip.hoursBottom - 0.5) {
          fail("spine drag", `the ${side} hours' grab strip ends above the hours' own bottom edge`);
        }
      });

      // NO EVENT SURFACE WITH INCREMENTS OFF: there are no hours to put an
      // event at and none is drawn, so no crosshair and nothing to drag an
      // event out of. Reported 2026-09-29: "get rid of the plus cursor over
      // the hourly section when the increments are off".
      const surfaces = (await tab.evaluate(`${JSON.stringify(spread.pages.map((p) => p.spineId))}.map((id) => {
        const hours = document.querySelector('[data-module-instance-id="' + id + '"]');
        if (!hours) return null;
        const r = hours.getBoundingClientRect();
        const under = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.4);
        return { layer: !!hours.querySelector("[data-event-layer]"), cursor: under ? getComputedStyle(under).cursor : "" };
      })`)) as Array<{ layer: boolean; cursor: string } | null>;
      surfaces.forEach((surface, i) => {
        const side = i === 0 ? "left" : "right";
        if (!surface) fail("spine drag", `the ${side} page's hours are not on screen`);
        else if (surface.layer || surface.cursor === "cell") {
          fail("spine drag", `the ${side} hours, increments off, still offer events (${surface.layer ? "an event layer" : ""} ${surface.cursor} cursor)`);
        }
      });

      /** A real-mouse drag of the left page's hours edge, sampled as it goes. */
      const drag = async (rows: number) => {
        const handle = await tab.$(`[data-stack-key="hourly-stack:${left.spineId}"]`);
        const box = handle && (await handle.boundingBox());
        if (!box) return null;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        // The press has to land ON the handle, or the drag is not a drag.
        const pressed = await tab.evaluate(
          `document.elementFromPoint(${x}, ${y})?.getAttribute("data-stack-key") ?? null`
        );
        if (pressed !== `hourly-stack:${left.spineId}`) return null;
        await tab.mouse.move(x, y);
        await tab.mouse.down();
        const samples: Rows[] = [];
        const steps = 24;
        for (let i = 1; i <= steps; i++) {
          await tab.mouse.move(x, y + (rows * pitch * i) / steps);
          await tab.waitForTimeout(40);
          samples.push(await read());
        }
        await tab.mouse.up();
        await tab.waitForTimeout(2500);
        return { samples, shown: samples[samples.length - 1], released: await read(), stored: await storedRows(ids) };
      };

      const problems: string[] = [];
      const check = (what: string, result: NonNullable<Awaited<ReturnType<typeof drag>>>) => {
        // LIVE: the facing page's hours are the dragged page's height in
        // every frame, not only after release.
        const apart = result.samples.filter((s) => s[left.spineId]?.rowSpan !== s[right.spineId]?.rowSpan).length;
        if (apart > 0) problems.push(`${what}: the right page's hours differed from the left's in ${apart} of ${result.samples.length} frames`);
        // NOTHING BELOW ITS MINIMUM, in any frame or after release.
        for (const frame of [...result.samples, result.released]) {
          for (const p of spread.pages) {
            for (const f of p.followers) {
              const row = frame[f.id];
              if (row && row.rowSpan < f.minRowSpan) {
                problems.push(`${what}: ${f.slug} drawn ${row.rowSpan} rows tall, under its minimum of ${f.minRowSpan}`);
                return;
              }
              if (row && row.rowStart + row.rowSpan > spread.gridRows) {
                problems.push(`${what}: ${f.slug} runs past the foot of the page (${row.rowStart}+${row.rowSpan})`);
                return;
              }
            }
          }
        }
        // RELEASED AS SHOWN, and stored as released.
        for (const id of ids) {
          const shown = result.shown[id];
          const released = result.released[id];
          const stored = result.stored[id];
          if (JSON.stringify(shown) !== JSON.stringify(released)) {
            problems.push(`${what}: ${id} was shown at ${JSON.stringify(shown)} and released to ${JSON.stringify(released)}`);
            return;
          }
          if (released && (stored?.rowStart !== released.rowStart || stored?.rowSpan !== released.rowSpan)) {
            problems.push(`${what}: ${id} is drawn at ${JSON.stringify(released)} but stored at ${JSON.stringify(stored)}`);
            return;
          }
        }
      };

      // THERE AND BACK IN ONE PRESS. Asked 2026-09-29: "it repeats the steps
      // backwards as you drag back up in the reverse direction without
      // releasing?" It should: the preview is worked out from the snapshot
      // the press took plus how far the pointer is from where it pressed,
      // never from the frame before - so each pointer position has one
      // layout, whichever way the pointer arrived at it. Down past the stop
      // and back to the start, sampled at the same positions both ways,
      // then released where it began, which saves nothing.
      {
        const handle = await tab.$(`[data-stack-key="hourly-stack:${left.spineId}"]`);
        const box = handle && (await handle.boundingBox());
        if (!box) {
          fail("spine drag", "no handle on the left page's hours edge");
          return;
        }
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        const steps = 24;
        const at = (i: number) => y + (18 * pitch * i) / steps;
        await tab.mouse.move(x, y);
        await tab.mouse.down();
        const down: Rows[] = [];
        for (let i = 1; i <= steps; i++) {
          await tab.mouse.move(x, at(i));
          await tab.waitForTimeout(40);
          down.push(await read());
        }
        const up: Rows[] = [];
        for (let i = steps - 1; i >= 0; i--) {
          await tab.mouse.move(x, at(i));
          await tab.waitForTimeout(40);
          up.unshift(await read());
        }
        await tab.mouse.up();
        await tab.waitForTimeout(2500);
        const afterRelease = await read();
        // up[i] is position i (0 = where it pressed); down[i - 1] is the same
        // position on the way down.
        const differ = up
          .slice(1)
          .map((frame, i) => (JSON.stringify(frame) === JSON.stringify(down[i]) ? null : i + 1))
          .filter((i): i is number => i !== null);
        const spans = down.map((f) => f[left.spineId]?.rowSpan);
        if (Math.max(...(spans as number[])) <= before[left.spineId]!.rowSpan) {
          fail("spine drag", "there and back: the hours never grew, so nothing was retraced");
        } else if (differ.length > 0) {
          fail("spine drag", `there and back: ${differ.length} of ${steps - 1} positions drew differently on the way up than on the way down (first at ${differ[0]})`);
        } else if (JSON.stringify(up[0]) !== JSON.stringify(before) || JSON.stringify(afterRelease) !== JSON.stringify(before)) {
          fail("spine drag", "there and back: back at the start, the spread was not as it began, or releasing there changed it");
        } else {
          note(
            "spine drag",
            `there and back in one press: ${steps - 1} positions drawn identically both ways ` +
              `(hours ${spans[0]} up to ${Math.max(...(spans as number[]))} and back), and the start released unchanged`
          );
        }
      }

      // GROW, well past what this spread can give.
      const grown = await drag(18);
      if (!grown) {
        fail("spine drag", "no handle under the pointer on the left page's hours edge");
        return;
      }
      check("growing", grown);
      const grewTo = grown.shown[left.spineId]?.rowSpan ?? 0;
      // ONE ROW FOR BOTH PAGES' STACKS. This journal's left to-do starts flush
      // under the hours and its right one a row down - Andrew's spread,
      // "bottom module section un even" (2026-09-29). After the edge moves,
      // both start a row under it.
      const stackStarts = spread.pages.map((p) => grown.released[p.followers[0]?.id]?.rowStart);
      const hoursEnd = (grown.released[left.spineId]?.rowStart ?? 0) + grewTo;
      if (stackStarts.some((row) => row !== hoursEnd + 1)) {
        problems.push(`growing: the stacks under the hours start on rows ${stackStarts.join(" and ")}, not both at ${hoursEnd + 1}`);
      }
      if (grewTo <= before[left.spineId]!.rowSpan) problems.push(`growing: the hours did not grow (${before[left.spineId]!.rowSpan} -> ${grewTo})`);
      // THE STOP: some page's stack is all at its minimum - not earlier.
      const atFloor = spread.pages.filter((p) => p.followers.every((f) => grown.shown[f.id]?.rowSpan === f.minRowSpan));
      if (atFloor.length === 0) problems.push(`growing: stopped at ${grewTo} rows with neither page's stack at its minimum`);
      // THE SPREAD, NOT THE BOOK.
      const elsewhere = await storedRows(spread.elsewhere.map((e) => e.id));
      const moved = spread.elsewhere.filter((e) => elsewhere[e.id]?.rowSpan !== e.rowSpan);
      if (moved.length > 0) problems.push(`growing: ${moved.length} hourly grid(s) on other levels moved too (${moved.map((e) => `${e.rowSpan} -> ${elsewhere[e.id]?.rowSpan}`).join(", ")})`);

      // SHRINK back part of the way: live again, and the rows go back.
      const shrunk = await drag(-6);
      if (!shrunk) problems.push("shrinking: the handle was not under the pointer after the first drag");
      else {
        check("shrinking", shrunk);
        const shrankTo = shrunk.shown[left.spineId]?.rowSpan ?? grewTo;
        if (shrankTo >= grewTo) problems.push(`shrinking: the hours did not shrink (${grewTo} -> ${shrankTo})`);
        // The rows come back to the last module on each page: no hole.
        for (const p of spread.pages) {
          const last = shrunk.released[p.followers[p.followers.length - 1].id];
          if (last && last.rowStart + last.rowSpan !== spread.gridRows) {
            problems.push(`shrinking: the ${p === left ? "left" : "right"} stack ends at row ${last.rowStart + last.rowSpan}, not the foot (${spread.gridRows})`);
          }
        }
      }

      if (problems.length > 0) {
        for (const problem of problems) fail("spine drag", problem);
      } else {
        const habits = right.followers[right.followers.length - 1];
        note(
          "spine drag",
          `hours ${before[left.spineId]!.rowSpan} -> ${grewTo} -> ${shrunk!.shown[left.spineId]?.rowSpan} rows, both pages in every frame; ` +
            `stopped with the ${atFloor.map((p) => (p === left ? "left" : "right")).join(" and ")} page's stack at its minimums ` +
            `(${habits.slug} held at ${habits.minRowSpan}); released as shown; ${spread.elsewhere.length} other hourly grid(s) untouched`
        );
      }
    } finally {
      await context.close();
      await guest.remove();
    }
  },
};

// ---------------------------------------------------------------------
// MODULE EDITOR: the hours have a pencil and an editor of their own, and a
// line style is chosen from pictures of the module itself.
//
// Asked 2026-09-29: the to-do gets line styles (lined, and crosses from a
// reference page), the note box's rule is chosen by looking at it, and the
// hours' settings - increments, week start, and a new dotted/blank fill with
// increments off - move from Page Settings into the hours' own editor,
// opened from a pencil in the middle of the hours on hover, "the ones that
// are rule of line styles etc" drawn as a zoomed-in preview.
//
// A real mouse, because the pencil only shows on hover and a synthetic event
// does not hover anything. Its own journal, since it turns increments off.
// MEMARI_PROBE_SHOTS=<dir> keeps a screenshot of each editor.
// ---------------------------------------------------------------------
const moduleEditor: Probe = {
  name: "module editor",
  ratios: [1],
  run: async (page, { base }) => {
    const guest = await makeGuestJournal("Module editor check");
    // The left page's to-do flush under the hours, the right one a row down -
    // the uneven spread switching increments off has to straighten.
    await flushUnderHours(guest.journalId, 0);
    // Tall enough that the to-do is not under the timeline drawer - at 800px
    // its pencil sat at y=712 and the drawer began at 614, so the pointer
    // hovered the drawer and the pencil never showed.
    const context = await page.context().browser()!.newContext({
      viewport: { width: VIEWPORT.width, height: 1200 },
      deviceScaleFactor: 1,
    });
    const shots = process.env.MEMARI_PROBE_SHOTS;
    try {
      await context.addCookies([{ name: guest.cookieName, value: guest.cookieValue, domain: "localhost", path: "/" }]);
      const tab = await context.newPage();
      await tab.goto(`${base}/app/j/${guest.journalId}`, { waitUntil: "networkidle" });
      await tab.waitForTimeout(3000);

      const before = await storedModules(guest.journalId);
      const weeklyHours = before.filter((m) => m.slug === "hourly-grid-core" && m.level === "WEEKLY");
      const leftTodo = before.find((m) => m.slug === "todo-checklist" && m.level === "WEEKLY");
      const noteBox = before.find((m) => m.slug === "labeled-box" && m.level === "WEEKLY");
      if (weeklyHours.length === 0 || !leftTodo || !noteBox) {
        fail("module editor", "the weekly spread has no hours, to-do or note box to edit");
        return;
      }

      /** Hover a module with the real mouse and press its pencil. */
      /** Open a module's editor, measuring the flight - and if one frame of
       *  it is long, measure once more ON A FRESHLY LOADED PAGE, failing only
       *  if it is long again. The faults this has found (a re-render, a first
       *  paint, an unpainted panel) were long on every first open; something
       *  unrelated on the main thread is long once - measured: a 96ms frame
       *  in one of five runs of an unchanged flight, and 18-47ms first-open
       *  spreads with and without an unrelated change. Fresh, because a second
       *  open on the same page is warm: retried there, the no-pre-paint
       *  sabotage passed. */
      const openEditor = async (instanceId: string, name: string) => {
        const first = await openEditorOnce(instanceId, name);
        if (!first || !/stuttered/.test(first)) return first;
        await tab.keyboard.press("Escape");
        await tab.reload({ waitUntil: "networkidle" });
        await tab.waitForTimeout(3000);
        const again = await openEditorOnce(instanceId, name);
        return again ? `${again} (and ${first.replace(/^the \S+ /, "")} the time before)` : null;
      };
      const openEditorOnce = async (instanceId: string, name: string) => {
        const box = await tab.locator(`[data-module-instance-id="${instanceId}"]`).boundingBox();
        if (!box) return `the ${name} is not on screen`;
        // Off-centre first, so the pointer arrives the way a person's would.
        await tab.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
        await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await tab.waitForTimeout(300);
        const pencil = tab.locator(`[data-module-instance-id="${instanceId}"] > button[title="Edit ${name}"]`);
        if ((await pencil.count()) === 0) return `the ${name} has no pencil`;
        const opacity = Number(await pencil.evaluate((el) => getComputedStyle(el).opacity));
        if (!(opacity > 0)) return `the ${name}'s pencil stays invisible on hover`;
        // THE FLIGHT, frame by frame from the press: where the preview is
        // drawn on each frame, and how long each frame took. Asked
        // 2026-09-29 whether flying the module out of the canvas "would
        // lag" - this is the answer, measured.
        await tab.evaluate(`(() => {
          const record = (window.__flight = { pressed: 0, seen: 0, frames: [] });
          const tick = () => {
            // THE MODULE, not its card: the preview has paper around it now,
            // and it is the module that leaves the canvas at its own size.
            const frame = document.querySelector('[role="dialog"] [data-editor-piece]')?.parentElement;
            const u = [...document.querySelectorAll('[role="dialog"] [data-editor-piece]')].map((el) => el.getBoundingClientRect()).reduce((u, r) => u ? { left: Math.min(u.left, r.left), top: Math.min(u.top, r.top), right: Math.max(u.right, r.right), bottom: Math.max(u.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, null);
            // Only once it can be seen: it is painted once, all but
            // transparent, where it ends before it flies from the module.
            const r = frame && u && Number(getComputedStyle(frame).opacity) > 0.5 ? { left: u.left, top: u.top, width: u.right - u.left, height: u.bottom - u.top } : null;
            record.frames.push({ t: performance.now(), r: r && { l: r.left, t: r.top, w: r.width, h: r.height } });
            // Until the flight is over - 1.1s from the first frame it can be
            // seen, not from the press - so a slow editor is measured slow
            // rather than missed: on a loaded machine it appeared 0.9-1.0s
            // after the press and a fixed window saw no flight at all.
            if (r && !record.seen) record.seen = performance.now();
            const now = performance.now();
            if ((record.seen ? now - record.seen < 1100 : true) && now - record.pressed < 6000) requestAnimationFrame(tick);
          };
          record.pressed = performance.now();
          requestAnimationFrame(tick);
        })()`);
        await pencil.click();
        const dialog = tab.getByRole("dialog", { name: `Edit ${name}` });
        await dialog.waitFor({ timeout: 5000 }).catch(() => undefined);
        if (!(await dialog.isVisible())) return `pressing the ${name}'s pencil opened no editor`;
        await tab.waitForFunction(`(() => { const f = window.__flight; return f.seen && performance.now() - f.seen > 1150; })()`, undefined, { timeout: 8000 }).catch(() => undefined);
        const flown = (await tab.evaluate(`window.__flight`)) as {
          pressed: number;
          frames: Array<{ t: number; r: { l: number; t: number; w: number; h: number } | null }>;
        };
        const drawn = flown.frames.filter((f) => f.r);
        if (drawn.length < 2) return `the ${name}'s editor drew no flight`;
        const first = drawn[0];
        const last = drawn[drawn.length - 1];
        // TWO NUMBERS, because they are two costs. Before the flight: the
        // preview's first render and paint, while it sits still over the
        // module - a delay, not a stutter (measured on the hours: the width
        // did not move across that frame). During it: the frames themselves,
        // which a composited transform should keep at the display's rate.
        const moving = drawn.findIndex((f) => Math.abs(f.r!.w - first.r!.w) > 0.5 || Math.abs(f.r!.l - first.r!.l) > 0.5);
        const departed = drawn[Math.max(0, moving - 1)];
        const during = drawn.filter((f) => f.t >= departed.t && f.t - departed.t <= 360);
        const longest = during.length > 1 ? Math.max(...during.slice(1).map((f, i) => f.t - during[i].t)) : 0;
        // Where it began: over the module on the canvas (the hours: over
        // both pages' hours). The first frame can already be a step in, so
        // it is compared against the whole distance travelled.
        const origin = (await tab.evaluate(`(() => {
          const rects = ${JSON.stringify(name === "Hours" ? "hours" : instanceId)} === "hours"
            ? [...document.querySelectorAll('[data-module-instance-id]')].filter((el) => el.querySelector('[data-event-layer]')).map((el) => el.getBoundingClientRect())
            : [document.querySelector('[data-module-instance-id="${instanceId}"]').getBoundingClientRect()];
          const l = Math.min(...rects.map((r) => r.left)), t = Math.min(...rects.map((r) => r.top));
          return { l, t, w: Math.max(...rects.map((r) => r.right)) - l, h: Math.max(...rects.map((r) => r.bottom)) - t, hidden: document.querySelector('[data-module-instance-id="${instanceId}"]') ? getComputedStyle(document.querySelector('[data-module-instance-id="${instanceId}"]')).visibility : "" };
        })()`)) as { l: number; t: number; w: number; h: number; hidden: string };
        const travel = Math.max(1, Math.abs(last.r!.l - origin.l) + Math.abs(last.r!.t - origin.t), Math.abs(last.r!.w - origin.w));
        const off = (Math.abs(first.r!.l - origin.l) + Math.abs(first.r!.t - origin.t) + Math.abs(first.r!.w - origin.w)) / travel;
        flights.push(
          `${name} moves ${Math.round(departed.t - flown.pressed)}ms after the press, then ${during.length} frames, longest ${Math.round(longest)}ms`
        );
        if (off > 0.2) return `the ${name}'s preview did not start on the module - its first frame is ${(off * 100).toFixed(0)}% of the way`;
        if (Math.abs(last.r!.w - origin.w) < 4) return `the ${name}'s preview never grew (${origin.w.toFixed(0)} -> ${last.r!.w.toFixed(0)}px)`;
        if (moving < 0) return `the ${name}'s preview never moved`;
        // THREE frames at 60Hz. A guard against a GROSS, repeatable hitch -
        // the faults found were 49-250ms - not a meter of smoothness: this
        // machine's cold first open of the two-page hours spreads 18-47ms
        // with nothing wrong, and at two frames the full suite failed a sound
        // build at 35 and 37ms. The measured frames are in the note for a
        // person to read.
        if (longest > 50) return `the ${name}'s flight stuttered: a ${Math.round(longest)}ms frame while moving`;
        // Generous, because this runs against the DEVELOPMENT build, where
        // React alone is several times slower than in production.
        if (departed.t - flown.pressed > 600) return `the ${name} took ${Math.round(departed.t - flown.pressed)}ms to start moving`;
        if (origin.hidden !== "hidden") return `the ${name} stayed on the canvas while its preview was out`;
        return null;
      };
      const flights: string[] = [];
      /** A picker's options: how many, and whether each draws something. */
      const picker = (group: string) =>
        tab.getByRole("radiogroup", { name: group }).evaluate((el) =>
          [...el.querySelectorAll('[role="radio"]')].map((radio) => ({
            label: radio.getAttribute("aria-label"),
            checked: radio.getAttribute("aria-checked") === "true",
            marks: radio.querySelectorAll("svg rect").length,
            dots: radio.querySelectorAll("svg rect[rx]").length,
            // The drawing itself, not its length: Dotted and Graph came out
            // at 497 characters each - two different drawings the length
            // alone called the same.
            markup: radio.querySelector("svg")?.innerHTML ?? "",
          }))
        );
      const done = async () => {
        await tab.getByRole("dialog").getByRole("button", { name: "Done" }).click();
        await tab.waitForTimeout(3500);
      };
      const problems: string[] = [];
      const notes: string[] = [];

      // --- THE HOURS ---------------------------------------------------
      const palette = (await tab.evaluate(`document.body.innerText`)) as string;
      if (/\bRow height\b/.test(palette)) problems.push("Page Settings still holds the hours' settings");
      const hoursError = await openEditor(weeklyHours[0].id, "Hours");
      if (hoursError) problems.push(hoursError);
      // A stutter is reported, and the editor is open and working - so the
      // rest is still checked rather than failing as knock-ons.
      if (!hoursError || /stuttered|to start moving/.test(hoursError)) {
        const dialog = tab.getByRole("dialog", { name: "Edit Hours" });
        // PAPER AROUND THE MODULE, 24px of it on every side at rest ("a bit of
        // whitespace padding around it", 2026-09-29).
        const margins = (await dialog.evaluate(`((el) => {
          const pieces = [...el.querySelectorAll("[data-editor-piece]")].map((piece) => piece.getBoundingClientRect());
          const frame = el.querySelector("[data-editor-piece]").parentElement.getBoundingClientRect();
          const left = Math.min(...pieces.map((r) => r.left)), top = Math.min(...pieces.map((r) => r.top));
          const right = Math.max(...pieces.map((r) => r.right)), bottom = Math.max(...pieces.map((r) => r.bottom));
          return [left - frame.left, top - frame.top, frame.right - right, frame.bottom - bottom].map((m) => Math.round(m * 10) / 10);
        })(document.querySelector('[role="dialog"]'))`)) as number[];
        if (margins.some((m) => Math.abs(m - 24) > 1)) problems.push(`the preview's paper margins are ${margins.join("/")}px, not 24 all round`);
        else notes.push("24px of paper round the preview");
        // EVERY DROPDOWN'S OPEN LIST READS: its options' text against the list
        // behind them, at 4.5:1 or better. The list was the fields' near-white
        // text on the browser's default white - "light grey text on white".
        // An option with no background of its own is taken as white, even
        // under colour-scheme dark: the hours' fields already had a dark scheme
        // and the list was still reported white, so the options must say.
        const unreadable = (await tab.evaluate(`(() => {
          const el = document.querySelector('[role="dialog"]');
          const rgb = (c) => (c.match(/[0-9.]+/g) || []).map(Number);
          const lum = (c) =>
            c.slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); })
              .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
          const out = [];
          for (const select of el.querySelectorAll("select")) {
            for (const option of select.querySelectorAll("option")) {
              const style = getComputedStyle(option);
              const bgParts = rgb(style.backgroundColor);
              const transparent = bgParts.length === 4 && bgParts[3] === 0;
              const bg = transparent ? [255, 255, 255] : bgParts.slice(0, 3);
              const fg = rgb(style.color).slice(0, 3);
              const pair = [lum(fg), lum(bg)].sort((x, y) => y - x);
              const ratio = (pair[0] + 0.05) / (pair[1] + 0.05);
              if (ratio < 4.5) out.push('"' + option.textContent + '" ' + ratio.toFixed(1) + ":1");
            }
          }
          return out;
        })()`)) as string[];
        if (unreadable.length > 0) problems.push(`dropdown options are unreadable: ${unreadable.slice(0, 3).join(", ")}`);
        else notes.push("dropdown options read");
        // A DROPDOWN'S ARROW sits as far in from the right as its words from
        // the left (2026-10-01: the browser's was "too close to the right
        // border"), and the words stop before it.
        const arrows = (await tab.evaluate(`(() => [...document.querySelectorAll('[role="dialog"] select')].map((s) => {
          const c = getComputedStyle(s);
          const first = c.backgroundPositionX.split(",")[0];
          const x = (first.match(/right ([0-9.]+)px/) || first.match(/100% - ([0-9.]+)px/) || [])[1];
          return { native: c.appearance !== "none", right: x === undefined ? null : Number(x), left: parseFloat(c.paddingLeft), room: parseFloat(c.paddingRight), at: first };
        }))()`)) as Array<{ native: boolean; right: number | null; left: number; room: number; at: string }>;
        const askew = arrows.filter((a) => a.native || a.right === null || Math.abs(a.right - a.left) > 0.5 || a.room < a.right + 10);
        if (arrows.length === 0) problems.push("the hours editor has no dropdown to measure");
        else if (askew.length > 0) problems.push(`a dropdown's arrow is not ${askew[0].left}px in from the right: ${JSON.stringify(askew[0])}`);
        else notes.push(`${arrows.length} dropdown arrows ${arrows[0].right}px in, as the words are`);
        // NO BORDERS on the editor's fields or the header's buttons - Andrew's
        // pick from the borders page, 2026-10-01 ("none" for every one).
        const bordered = (await tab.evaluate(`(() => [
          ...document.querySelectorAll('[role="dialog"] input:not([type="checkbox"]):not([data-canvas-slot]), [role="dialog"] select, [role="dialog"] textarea:not([data-canvas-slot]), [role="dialog"] [role="group"], header button, header a'),
        ].filter((el) => parseFloat(getComputedStyle(el).borderTopWidth) > 0 && getComputedStyle(el).borderTopStyle !== "none")
          .map((el) => (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30)))()`)) as string[];
        if (bordered.length > 0) problems.push(`still bordered: ${bordered.join(", ")}`);
        else notes.push("no borders on its fields or the header's buttons");
        // BOTH PAGES' HOURS, each with its own days.
        const pieces = (await dialog.evaluate((el) =>
          [...el.querySelectorAll("[data-editor-piece]")].map((piece) => piece.textContent ?? "")
        )) as string[];
        if (pieces.length !== weeklyHours.length) {
          problems.push(`the hours' editor shows ${pieces.length} page(s) of hours, not the spread's ${weeklyHours.length}`);
        } else if (!pieces.some((text) => /SUNDAY/.test(text)) || !pieces.some((text) => /WEDNESDAY/.test(text))) {
          problems.push("the hours' editor does not show both halves of the week");
        } else notes.push(`hours: both pages in the editor`);
        for (const field of ["Increments", "Row height", "Week starts on"]) {
          if ((await dialog.getByLabel(field).count()) === 0) problems.push(`the hours' editor has no ${field}`);
        }
        await dialog.getByLabel("Increments").selectOption("off");
        await tab.waitForTimeout(300);
        const fills = await picker("Fill");
        const dotted = fills.find((f) => f.label === "Dotted");
        const blank = fills.find((f) => f.label === "Blank");
        if (!dotted || !blank) problems.push(`the Fill picker offers ${fills.map((f) => f.label).join(", ") || "nothing"}`);
        else if (!(dotted.dots > 0) || blank.dots !== 0) {
          problems.push(`the Fill pictures do not show the fill: dotted draws ${dotted.dots} dots, blank ${blank.dots}`);
        } else notes.push(`hours: Fill drawn as ${dotted.dots} dots vs none`);
        await dialog.getByRole("radio", { name: "Blank" }).click();
        if (shots) await tab.screenshot({ path: `${shots}/hours-editor.png` });
        await done();
        const after = await storedModules(guest.journalId);
        const everyHours = after.filter((m) => m.slug === "hourly-grid-core");
        const wrong = everyHours.filter((m) => m.propValues.intervalMode !== "off" || m.propValues.offModeRule !== "none");
        if (wrong.length > 0) problems.push(`${wrong.length} of ${everyHours.length} hourly grids were not saved as increments off, blank`);
        else notes.push(`saved journal-wide to all ${everyHours.length} hourly grids`);
        // And the stack under each page's hours now sits the off-mode gap - a
        // row - under them: with increments on it can sit flush, and carrying
        // that into off-mode was how two pages of one spread came apart.
        const afterRows = await storedRows(after.map((m) => m.id));
        const uneven: string[] = [];
        for (const hours of after.filter((m) => m.slug === "hourly-grid-core" && m.level === "WEEKLY")) {
          const h = afterRows[hours.id];
          // The stack under THESE hours: same page, same columns, below them.
          const next = Object.entries(afterRows)
            .filter(
              ([id, r]) =>
                id !== hours.id &&
                r.pageId === h.pageId &&
                r.columnStart === h.columnStart &&
                r.columnSpan === h.columnSpan &&
                r.rowStart !== null &&
                (r.rowStart as number) >= (h.rowStart as number) + h.rowSpan
            )
            .map(([, r]) => r.rowStart as number);
          if (next.length === 0) continue;
          const gap = Math.min(...next) - ((h.rowStart as number) + h.rowSpan);
          if (gap !== 1) uneven.push(`${gap}`);
        }
        if (uneven.length > 0) problems.push(`after increments went off, the stacks under the hours sit ${uneven.join(" and ")} row(s) down, not 1`);
        const drawnDots = (await tab.evaluate(
          `[...document.querySelectorAll('[data-module-instance-id="${weeklyHours[0].id}"] svg rect[rx]')].length`
        )) as number;
        if (drawnDots > 0) problems.push(`the hours still draw ${drawnDots} dots after choosing Blank`);
      }

      // --- THE TO-DO ---------------------------------------------------
      const todoError = await openEditor(leftTodo.id, "To-do checklist");
      if (todoError) problems.push(todoError);
      if (!todoError || /stuttered|to start moving/.test(todoError)) {
        const lines = await picker("Lines");
        const lined = lines.find((l) => l.label === "Lined");
        const crosses = lines.find((l) => l.label === "Dashed");
        if (!lined || !crosses) problems.push(`the Lines picker offers ${lines.map((l) => l.label).join(", ") || "nothing"}`);
        else if (!lined.checked) problems.push("a to-do saved before line styles existed does not show Lined as chosen");
        else if (!(crosses.marks > lined.marks)) problems.push(`the Dashed picture (${crosses.marks} marks) is no busier than Lined (${lined.marks})`);
        else notes.push(`to-do: Lines drawn ${lined.marks} vs ${crosses.marks} marks`);
        const rectsBefore = (await tab.evaluate(`document.querySelectorAll('[data-module-instance-id="${leftTodo.id}"] svg rect').length`)) as number;
        await tab.getByRole("dialog", { name: "Edit To-do checklist" }).getByRole("radio", { name: "Dashed" }).click();
        if (shots) await tab.screenshot({ path: `${shots}/todo-editor.png` });
        await done();
        const stored = (await storedModules(guest.journalId)).find((m) => m.id === leftTodo.id);
        const rectsAfter = (await tab.evaluate(`document.querySelectorAll('[data-module-instance-id="${leftTodo.id}"] svg rect').length`)) as number;
        if (stored?.propValues.lineStyle !== "crosses") problems.push(`the to-do saved lineStyle ${JSON.stringify(stored?.propValues.lineStyle)}`);
        else if (!(rectsAfter > rectsBefore * 2)) problems.push(`the to-do on the page drew ${rectsBefore} marks lined and ${rectsAfter} crossed`);
        else notes.push(`to-do on the page: ${rectsBefore} -> ${rectsAfter} marks`);
      }

      // --- THE NOTE BOX -----------------------------------------------
      // CENTRED ON THE PAGE, as print centres it. In serif the gratitude
      // box's heading is wider than its box, and CSS start-aligned it: the
      // PDF put it in the middle and the screen pushed it right - "doesn't
      // look exactly center" (2026-09-29). Its ink's middle is the box's.
      const centring = (await tab.evaluate(`(() => {
        const module = document.querySelector('[data-module-instance-id="${noteBox.id}"]');
        const heading = [...module.querySelectorAll("div")].find((d) => d.childElementCount === 0 && d.textContent.trim().length > 3 && d.textContent === d.textContent.toUpperCase());
        if (!heading) return null;
        const range = document.createRange();
        range.selectNodeContents(heading);
        const ink = range.getBoundingClientRect();
        const box = heading.getBoundingClientRect();
        return { text: heading.textContent, off: (ink.left + ink.width / 2) - (box.left + box.width / 2), inkW: ink.width, boxW: box.width, size: parseFloat(getComputedStyle(heading).fontSize) };
      })()`)) as { text: string; off: number; inkW: number; boxW: number; size: number } | null;
      // AND IT FITS, at 6pt - 25 print px - where it had printed out of its
      // box at 7 ("make the gratitude heading 6pt so it fits").
      if (centring && /GRATEFUL/.test(centring.text)) {
        if (Math.abs(centring.size - 25) > 0.1) problems.push(`the gratitude heading is ${((centring.size * 72) / 300).toFixed(1)}pt, not 6pt`);
        else if (centring.inkW > centring.boxW + 0.5) problems.push(`the gratitude heading still overflows its box (${centring.inkW.toFixed(0)}px in ${centring.boxW.toFixed(0)}px)`);
        else notes.push(`the gratitude heading fits at 6pt`);
      }
      if (!centring) problems.push("no heading drawn on the note box");
      else if (Math.abs(centring.off) > 0.5) {
        problems.push(`"${centring.text}" sits ${centring.off.toFixed(1)}px off the middle of its box on the page (${centring.inkW.toFixed(0)}px of ink in ${centring.boxW.toFixed(0)}px)`);
      } else notes.push(`"${centring.text}" centred on the page (${centring.inkW.toFixed(0)}px of ink in ${centring.boxW.toFixed(0)}px)`);
      const noteError = await openEditor(noteBox.id, "Labeled box");
      if (noteError) problems.push(noteError);
      if (!noteError || /stuttered|to start moving/.test(noteError)) {
        const body = await picker("Body");
        const labels = body.map((b) => b.label).join("/");
        // Graph joined the three on 2026-09-30 (the module-edits list).
        if (labels !== "Blank/Lined/Dotted/Graph") problems.push(`the Body picker offers ${labels || "nothing"}`);
        else if (new Set(body.map((b) => b.markup)).size !== 4) problems.push("two of the Body pictures are the same drawing");
        else notes.push("note box: Body drawn four ways");
        // THE HEADING FIELD SHOWS THE WHOLE HEADING. It clipped "THINGS I'M
        // GRATEFUL FOR" to "...FO" (2026-09-29): in serif the heading is wider
        // than its box, which the page does not clip and an input does.
        // Scrolled to its end, a field holding more than it shows moves.
        const field = await tab.locator("input.memari-heading-field").evaluate((input) => {
          const el = input as HTMLInputElement;
          el.scrollLeft = 100000;
          const hidden = el.scrollLeft;
          const style = getComputedStyle(el);
          const context = document.createElement("canvas").getContext("2d")!;
          context.font = `${style.fontSize} ${style.fontFamily}`;
          return { hidden, text: Math.round(context.measureText(el.value.toUpperCase()).width), width: el.clientWidth, value: el.value };
        });
        if (field.hidden > 0 || field.text > field.width) {
          problems.push(`the heading field hides ${field.hidden}px of "${field.value}" (${field.text}px of text in ${field.width}px)`);
        } else notes.push(`heading field holds "${field.value}" whole (${field.text}px in ${field.width}px)`);
        // And the field is centred as the heading is: its middle is the
        // module's, since a note box's heading box is inset equally.
        const fieldOff = (await tab.locator("input.memari-heading-field").evaluate((input) => {
          const r = input.getBoundingClientRect();
          const frame = (input.parentElement as HTMLElement).getBoundingClientRect();
          return r.left + r.width / 2 - (frame.left + frame.width / 2);
        })) as number;
        if (Math.abs(fieldOff) > 1) problems.push(`the heading field sits ${fieldOff.toFixed(1)}px off the middle of the module`);
        // TYPING STOPS AT THE SMALLEST PRINT SIZE: the heading shrinks as it
        // grows, and a letter that would not fit even at 5pt is refused - with
        // a word to say why. Typed a key at a time, as a person would.
        const headingField = tab.locator("input.memari-heading-field");
        const before = await headingField.inputValue();
        const extra = " and every other thing we could possibly think of";
        await headingField.click();
        await tab.keyboard.press("End");
        await tab.keyboard.type(extra, { delay: 10 });
        const typed = await headingField.inputValue();
        await tab.keyboard.type("X");
        const oneMore = await headingField.inputValue();
        const status = (await tab.getByRole("dialog").getByRole("status").textContent()) ?? "";
        if (typed.length >= before.length + extra.length) problems.push(`the heading field took all ${typed.length} letters - there is no end`);
        else if (typed.length <= before.length) problems.push("the heading field would not take a single letter more");
        else if (oneMore !== typed) problems.push("a letter past the end still went in");
        else if (!/smallest print size/.test(status)) problems.push(`nothing said why the typing stopped (status: "${status}")`);
        else notes.push(`typing stops at ${typed.length} letters with a word why`);
        if (shots) await tab.screenshot({ path: `${shots}/note-editor.png` });
        // OUT: back onto the module, which is on the canvas again once the
        // preview has landed on it.
        const target = await tab.locator(`[data-module-instance-id="${noteBox.id}"]`).boundingBox();
        await tab.evaluate(`(() => {
          const record = (window.__landing = []);
          const tick = () => {
            const u = [...document.querySelectorAll('[role="dialog"] [data-editor-piece]')].map((el) => el.getBoundingClientRect()).reduce((u, r) => u ? { left: Math.min(u.left, r.left), top: Math.min(u.top, r.top), right: Math.max(u.right, r.right), bottom: Math.max(u.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, null);
            const r = u ? { left: u.left, top: u.top, width: u.right - u.left } : null;
            record.push(r && { l: r.left, t: r.top, w: r.width });
            if (r) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        })()`);
        await tab.keyboard.press("Escape");
        await tab.waitForTimeout(800);
        const landing = ((await tab.evaluate(`window.__landing`)) as Array<{ l: number; t: number; w: number } | null>).filter(Boolean) as Array<{ l: number; t: number; w: number }>;
        const landed = landing[landing.length - 1];
        const open = await tab.getByRole("dialog").count();
        const visible = await tab.locator(`[data-module-instance-id="${noteBox.id}"]`).evaluate((el) => getComputedStyle(el).visibility);
        if (open > 0) problems.push("Escape left the editor open");
        else if (!target || !landed || Math.abs(landed.l - target.x) > 6 || Math.abs(landed.w - target.width) > 6) {
          problems.push(`closing did not land on the module (last frame ${JSON.stringify(landed)} against ${JSON.stringify(target)})`);
        } else if (visible !== "visible") problems.push("the note box stayed hidden after its editor closed");
        else notes.push(`closing lands on the module in ${landing.length} frames and puts it back`);
      }
      if (flights.length > 0) notes.push(`flights: ${flights.join("; ")}`);

      if (problems.length > 0) for (const problem of problems) fail("module editor", problem);
      else note("module editor", notes.join("; "));
    } finally {
      await context.close();
      await guest.remove();
    }
  },
};

// ---------------------------------------------------------------------
// ROUND-TWO PICKERS: asked 2026-09-30 - "for icon strip make it so you can
// change the icon with previews of the icons in the setting to select of
// each row and day", "for tick mark column is default with those others as
// options", and a heading band "they can toggle it off". Each is picked in
// the editor as a person would, then read back from the database, from the
// page, and from the editor opened again.
// ---------------------------------------------------------------------
const roundTwoPickers: Probe = {
  name: "round-two pickers",
  ratios: [1],
  run: async (page, { base }) => {
    const guest = await makeGuestJournal("Round-two pickers check");
    await setWeeklySidebar(guest.journalId, [["Things I'm Grateful For", 3, 12], ["Reminders", 15, 11], ["Notes", 26, 10]]);
    const all = await storedModules(guest.journalId);
    const weekly = (slug: string, heading?: string) =>
      all.find((m) => m.slug === slug && m.level === "WEEKLY" && (heading === undefined || m.propValues.heading === heading));
    const strip = weekly("labeled-box", "Reminders");
    const notes = weekly("labeled-box", "Notes");
    const todo = weekly("todo-checklist");
    if (!strip || !notes || !todo) {
      fail("round-two pickers", "the weekly spread has no Reminders, Notes or to-do to work with");
      await guest.remove();
      return;
    }
    // Water where the Reminders were: eleven rows tall, so more than one
    // strip, and three named days - a sidebar is one group wide unless told.
    await retypeModule(strip.id, "water-week", { heading: "Water", icon: "droplet", count: 2, groups: 3, groupLabels: "days" });
    const context = await page.context().browser()!.newContext({
      viewport: { width: VIEWPORT.width, height: 1200 },
      deviceScaleFactor: 1,
    });
    const problems: string[] = [];
    const notesSeen: string[] = [];
    try {
      await context.addCookies([{ name: guest.cookieName, value: guest.cookieValue, domain: "localhost", path: "/" }]);
      const tab = await context.newPage();
      await tab.goto(`${base}/app/j/${guest.journalId}`, { waitUntil: "networkidle" });
      await tab.waitForTimeout(3000);

      // THE FOLD (2026-10-01): the weekly spread's two pages shade toward
      // each other where they meet - the left page's shadow offset left,
      // the right page's right - and nothing else carries one.
      const folds = (await tab.evaluate(`[...document.querySelectorAll("div")].map((d) => d.style.boxShadow).filter((s) => s.includes("inset"))`)) as string[];
      const sideOf = (shadow: string) => (/\) -[\d.]+px 0px/.test(shadow) ? "left" : /\) [\d.]+px 0px/.test(shadow) ? "right" : "?");
      if (folds.length !== 2 || sideOf(folds[0]) !== "left" || sideOf(folds[1]) !== "right") problems.push(`the spread's fold is ${folds.length} shade(s): ${folds.join(" | ") || "none"}`);
      else notesSeen.push("the spread's two pages shade toward the fold");

      /** Hover a module and press its pencil; the dialog once it has flown. */
      const open = async (instanceId: string) => {
        const target = tab.locator(`[data-module-instance-id="${instanceId}"]`);
        const box = await target.boundingBox();
        if (!box) return false;
        await tab.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
        await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await tab.waitForTimeout(300);
        const pencil = target.locator(':scope > button[title^="Edit "]');
        if ((await pencil.count()) === 0) return false;
        await pencil.click();
        const dialog = tab.getByRole("dialog");
        await dialog.waitFor({ timeout: 5000 }).catch(() => undefined);
        await tab.waitForTimeout(1300);
        return dialog.isVisible();
      };
      const done = async () => {
        await tab.getByRole("dialog").getByRole("button", { name: "Done" }).click();
        await tab.waitForTimeout(3500);
      };
      /** Every picker in the editor whose name starts so: its item's name,
       *  how many options, which is chosen, how many different drawings. */
      const pickers = (prefix: string) =>
        tab.evaluate(
          (prefix) =>
            [...document.querySelectorAll('[role="dialog"] [role="radiogroup"]')]
              .filter((group) => (group.getAttribute("aria-label") ?? "").startsWith(prefix))
              .map((group) => {
                const radios = [...group.querySelectorAll('[role="radio"]')];
                return {
                  name: (group.getAttribute("aria-label") ?? "").slice(prefix.length),
                  options: radios.length,
                  chosen: radios.find((radio) => radio.getAttribute("aria-checked") === "true")?.getAttribute("aria-label") ?? "",
                  drawings: new Set(radios.map((radio) => radio.querySelector("svg")?.innerHTML ?? "")).size,
                };
              }),
          prefix
        );
      const drawnOnPage = (instanceId: string) =>
        tab.locator(`[data-module-instance-id="${instanceId}"]`).evaluate((el) => el.innerHTML);
      // EVERY ICON IS IN ITS MODULE. A glyph's path is written in page
      // coordinates and its SVG sits at the module's corner; until
      // 2026-09-30 nothing moved one to the other, and every droplet on a
      // placed module drew a module-offset below it, off it - on the page and
      // in the editor alike. Rects never showed it, as they are moved.
      const strays = (scope: string) =>
        tab.evaluate((scope) => {
          const out: string[] = [];
          for (const holder of document.querySelectorAll(scope)) {
            const box = holder.getBoundingClientRect();
            // The drawing's paths, not the pencil's.
            const paths = [...holder.querySelectorAll("path")].filter((path) => !path.closest("button"));
            // 10px of slack: the last strip's icons reach into the 6-print-px
            // inset below the module's drawn box, which is its own room. The
            // offset this is for was the module's whole distance from the
            // page's corner - a margin at the very least.
            const slack = 10;
            const outside = paths.filter((path) => {
              const r = path.getBoundingClientRect();
              return r.left < box.left - slack || r.right > box.right + slack || r.top < box.top - slack || r.bottom > box.bottom + slack;
            });
            if (paths.length === 0) out.push("no icons drawn at all");
            else if (outside.length > 0) {
              const r = outside[0].getBoundingClientRect();
              out.push(`${outside.length} of ${paths.length} icons outside it (one at y=${Math.round(r.top)}, the module ${Math.round(box.top)}-${Math.round(box.bottom)})`);
            }
          }
          return out;
        }, scope);
      const onPage = await strays(`[data-module-instance-id="${strip.id}"]`);
      if (onPage.length > 0) problems.push(`the water strip on the page: ${onPage.join("; ")}`);
      else notesSeen.push("every droplet inside its module on the page");

      // --- AN ICON FOR EACH ROW AND EACH DAY, CHOSEN ON THE PREVIEW --------
      // The panel is the strip's icon in one row, two steppers and a switch;
      // a row's or a day's own icon is chosen by clicking it (2026-10-01).
      if (!(await open(strip.id))) problems.push("the water strip's editor would not open");
      else {
        const inEditor = await strays('[role="dialog"] [data-editor-piece]');
        if (inEditor.length > 0) problems.push(`the water strip in the editor: ${inEditor.join("; ")}`);
        const editor = tab.getByRole("dialog", { name: /^Edit / });
        const panel = (await editor.evaluate((dialog) => {
          const scroller = [...dialog.querySelectorAll<HTMLElement>("*")].find((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.querySelector("[role=radiogroup]"));
          const icons = [...dialog.querySelectorAll('[role="radiogroup"][aria-label="Icon"] [role="radio"]')].map((el) => Math.round(el.getBoundingClientRect().top));
          return {
            scrolls: scroller ? scroller.scrollHeight > scroller.clientHeight + 1 : false,
            iconRows: new Set(icons).size,
            icons: icons.length,
            lists: dialog.querySelectorAll('[role="radiogroup"][aria-label^="Icon for each"]').length,
            text: (dialog as HTMLElement).innerText,
          };
        })) as { scrolls: boolean; iconRows: number; icons: number; lists: number; text: string };
        if (panel.lists > 0) problems.push("the per-row and per-day lists are still in the panel");
        else if (panel.scrolls) problems.push("the icon strip's panel still scrolls");
        else if (panel.icons !== 10 || panel.iconRows !== 1) problems.push(`the Icon picker is ${panel.icons} drawings on ${panel.iconRows} rows, not one row of ten`);
        else if (!/Icons per group/i.test(panel.text) || !/Groups/i.test(panel.text) || !/Day names/i.test(panel.text)) problems.push("the panel lacks Icons per group, Groups or Day names");
        else notesSeen.push("icon strip panel: one row of ten, two steppers, a switch, no scrolling");

        const chooser = tab.getByRole("dialog", { name: /^Icon for / });
        const reachOf = () => chooser.getByRole("radio", { checked: true }).first().textContent();
        const before = await drawnOnPage(strip.id);
        // Sunday of the first row: a day's own icon.
        await tab.locator('[data-icon-group="0:0"]').click();
        if (!(await chooser.isVisible())) problems.push("clicking an icon on the preview opened no chooser");
        else {
          const reaches = await chooser.getByRole("radiogroup", { name: "How far it reaches" }).getByRole("radio").allTextContents();
          if (reaches.join(",") !== "Strip,Row,Day") problems.push(`the chooser reaches ${reaches.join(",")}, not Strip, Row and Day`);
          if ((await reachOf()) !== "Strip") problems.push(`an icon with nothing of its own opens on ${await reachOf()}, not Strip`);
          // Its icons inside its padding, the reach buttons too - a fixed
          // width spilt the row once the padding grew (panel 14, controls 3).
          const spill = (await chooser.evaluate((el) => {
            const box = el.getBoundingClientRect();
            const pad = parseFloat(getComputedStyle(el).paddingLeft) + parseFloat(getComputedStyle(el).borderLeftWidth);
            return [...el.querySelectorAll('[role="radio"]')]
              .map((b) => b.getBoundingClientRect())
              .map((r) => Math.max(box.left + pad - r.left, r.right - (box.right - pad)))
              .reduce((a, b) => Math.max(a, b), -Infinity);
          })) as number;
          if (spill > 0.5) problems.push(`the chooser's icons run ${spill.toFixed(1)}px into its padding`);
          await chooser.getByRole("radio", { name: "Day" }).click();
          await chooser.getByRole("radio", { name: "Stars" }).click();
          // Escape closes the chooser, not the editor.
          await tab.keyboard.press("Escape");
          await tab.waitForTimeout(150);
          if (await chooser.isVisible()) problems.push("Escape left the chooser open");
          else if (!(await editor.isVisible())) problems.push("Escape in the chooser closed the editor");
        }
        // The second row's Monday: a row's own icon.
        await tab.locator('[data-icon-group="1:1"]').click();
        if (await chooser.isVisible()) {
          await chooser.getByRole("radio", { name: "Row" }).click();
          await chooser.getByRole("radio", { name: "Leaves" }).click();
          await tab.keyboard.press("Escape");
        } else problems.push("the second row's icons opened no chooser");
        await done();
        const stored = (await storedModules(guest.journalId)).find((m) => m.id === strip.id)?.propValues ?? {};
        const groupIcons = stored.groupIcons as string[] | undefined;
        const stripIcons = stored.stripIcons as string[] | undefined;
        if (groupIcons?.[0] !== "star" || groupIcons.slice(1).some(Boolean)) problems.push(`saved groupIcons ${JSON.stringify(groupIcons)}`);
        else if (stripIcons?.[1] !== "leaf" || stripIcons.some((icon, i) => i !== 1 && icon)) problems.push(`saved stripIcons ${JSON.stringify(stripIcons)}`);
        else notesSeen.push("chosen on the preview: Sunday as stars, row 2 as leaves");
        if ((await drawnOnPage(strip.id)) === before) problems.push("the strip on the page drew the same after the picks");
        // Opened again, the chooser opens on the reach each icon has.
        if (await open(strip.id)) {
          await tab.locator('[data-icon-group="0:0"]').click();
          const dayReach = await reachOf();
          const dayStars = await chooser.getByRole("radio", { name: "Stars" }).getAttribute("aria-checked");
          await tab.keyboard.press("Escape");
          await tab.locator('[data-icon-group="1:2"]').click();
          const rowReach = await reachOf();
          await tab.keyboard.press("Escape");
          if (dayReach !== "Day" || dayStars !== "true" || rowReach !== "Row") problems.push(`reopened, Sunday opens on ${dayReach} (stars ${dayStars}) and row 2 on ${rowReach}`);
          await tab.keyboard.press("Escape");
          await tab.waitForTimeout(900);
        } else problems.push("the strip's editor would not open a second time");
      }

      // --- THE TO-DO'S TICK MARK ------------------------------------------
      if (!(await open(todo.id))) problems.push("the to-do's editor would not open");
      else {
        const [tick] = await pickers("Tick mark");
        if (!tick || tick.options !== 3 || tick.drawings !== 3) problems.push(`the Tick mark picker is ${JSON.stringify(tick)}`);
        else if (tick.chosen !== "Column") problems.push(`a to-do opens with ${tick.chosen} as its tick mark, not Column`);
        else notesSeen.push("to-do: tick mark Column by default, three drawn");
        // THE ITEMS ARE TYPED ON THE PAGE NOW, not in a box in the panel
        // (2026-09-30), and the panel no longer says so (2026-10-01). The box
        // it replaced had a resize grip, the to-do's 104-157ms opening frame;
        // the "text on the page" probe holds every text field left to that.
        const panelBoxes = await tab.getByRole("dialog").locator("[data-tour-panel], textarea").count();
        const hint = await tab.getByRole("dialog").getByText("Click any words on the preview", { exact: false }).count();
        if (panelBoxes > 0) problems.push(`the to-do's editor still has ${panelBoxes} text box(es) for its items`);
        else if (hint > 0) problems.push("the to-do's panel still carries the hint about the preview");
        else notesSeen.push("to-do: items typed on the preview, no hint in the panel");
        const before = await drawnOnPage(todo.id);
        await tab.getByRole("dialog").getByRole("radio", { name: "Circle" }).click();
        await done();
        const stored = (await storedModules(guest.journalId)).find((m) => m.id === todo.id)?.propValues ?? {};
        if (stored.tickMark !== "circle") problems.push(`the to-do saved tickMark ${JSON.stringify(stored.tickMark)}`);
        else if ((await drawnOnPage(todo.id)) === before) problems.push("the to-do on the page drew the same with circles");
        else notesSeen.push("saved and drawn as circles");
      }

      // --- THE NOTE BOX'S HEADING -----------------------------------------
      const headingShown = () =>
        tab.locator(`[data-module-instance-id="${notes.id}"]`).evaluate((el) => /NOTES/.test((el as HTMLElement).innerText));
      if (!(await headingShown())) problems.push("the Notes box draws no heading to start with");
      if (!(await open(notes.id))) problems.push("the Notes box's editor would not open");
      else {
        const toggle = tab.getByRole("dialog").getByLabel("Show the heading");
        if (!(await toggle.isChecked())) problems.push("a note box saved before the switch existed opens with its heading off");
        await toggle.uncheck({ force: true });
        await done();
        const stored = (await storedModules(guest.journalId)).find((m) => m.id === notes.id)?.propValues ?? {};
        if (stored.showHeading !== false) problems.push(`the note box saved showHeading ${JSON.stringify(stored.showHeading)}`);
        else if (await headingShown()) problems.push("the Notes box still draws its heading with the switch off");
        else notesSeen.push("note box: heading switched off, saved and gone from the page");
      }
    } finally {
      await context.close();
      await guest.remove();
    }
    if (problems.length > 0) for (const problem of problems) fail("round-two pickers", problem);
    else note("round-two pickers", notesSeen.join("; "));
  },
};

// ---------------------------------------------------------------------
// TEXT ON THE PAGE: asked 2026-09-30 - "instead of typing things out in the
// side panel, have them only editable through hovering the region it will
// display and clicking to edit text normally and live ... ideally with the
// blinking vertical bar indicating typing position as well". Typed as a
// person would, then read back from the database and the page: a to-do's
// items added from its first empty row, a chart's level renamed where it
// prints with the caret where the click was, a table's column renamed and
// one added with Return. With it, the note box's Dividers switch and the
// month calendar's editor showing the whole spread.
// ---------------------------------------------------------------------
const textOnThePage: Probe = {
  name: "text on the page",
  ratios: [1],
  run: async (page, { base }) => {
    const guest = await makeGuestJournal("Text on the page check");
    await setWeeklySidebar(guest.journalId, [["Things I'm Grateful For", 3, 12], ["Reminders", 15, 11], ["Notes", 26, 10]]);
    const all = await storedModules(guest.journalId);
    const chart = all.find((m) => m.slug === "labeled-box" && m.level === "WEEKLY" && m.propValues.heading === "Reminders");
    const todo = all.find((m) => m.slug === "todo-checklist" && m.level === "WEEKLY");
    if (!chart || !todo) {
      fail("text on the page", "the weekly spread has no Reminders or to-do to work with");
      await guest.remove();
      return;
    }
    await retypeModule(chart.id, "mood-chart-week", { heading: "Mood", span: "week", levels: ["Great", "Good", "Okay", "Low", "Awful"] });
    const context = await page.context().browser()!.newContext({ viewport: { width: VIEWPORT.width, height: 1200 }, deviceScaleFactor: 1 });
    const problems: string[] = [];
    const seen: string[] = [];
    const setLevel = (level: string) => context.addCookies([{ name: "memari-open", value: level, domain: "localhost", path: "/" }]);
    try {
      await context.addCookies([{ name: guest.cookieName, value: guest.cookieValue, domain: "localhost", path: "/" }]);
      const tab = await context.newPage();
      const load = async () => {
        await tab.goto(`${base}/app/j/${guest.journalId}`, { waitUntil: "networkidle" });
        await tab.waitForTimeout(3000);
      };
      const open = async (instanceId: string) => {
        const target = tab.locator(`[data-module-instance-id="${instanceId}"]`);
        await target.scrollIntoViewIfNeeded();
        const box = await target.boundingBox();
        if (!box) return false;
        await tab.mouse.move(box.x + box.width * 0.3, box.y + Math.min(box.height * 0.3, 60));
        await tab.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 120));
        await tab.waitForTimeout(300);
        const pencil = target.locator(':scope > button[title^="Edit "]');
        if ((await pencil.count()) === 0) return false;
        await pencil.click();
        await tab.getByRole("dialog").waitFor({ timeout: 5000 }).catch(() => undefined);
        await tab.waitForTimeout(1300);
        return tab.getByRole("dialog").isVisible();
      };
      const done = async () => {
        await tab.getByRole("dialog").getByRole("button", { name: "Done" }).click();
        await tab.waitForTimeout(3500);
      };
      const stored = async (id: string) => (await storedModules(guest.journalId)).find((m) => m.id === id)?.propValues ?? {};
      /** The focused field: which place, its caret, and whether its letters show. */
      const caret = () =>
        tab.evaluate(() => {
          const el = document.activeElement as HTMLInputElement | null;
          const style = el ? getComputedStyle(el) : null;
          return {
            slot: el?.getAttribute("data-canvas-slot") ?? null,
            at: el?.selectionStart ?? -1,
            length: el?.value.length ?? -1,
            caretColor: style?.caretColor ?? "",
            ink: style?.color ?? "",
          };
        });

      await load();

      // --- A TO-DO'S ITEMS, FROM ITS FIRST EMPTY ROW -----------------------
      if (!(await open(todo.id))) problems.push("the to-do's editor would not open");
      else {
        // THE EDITOR'S CORNERS - Apple's structure (2026-10-01, "just try
        // whatever apple uses"), Andrew's numbers off a page of sliders the
        // same day: the panel 14, a control 3, capsules for a switch (20px
        // tall: 10, its knob 8), and what nests inside a control concentric
        // with it (a stepper's ends 2). The pictures stay 1px - "even smaller
        // for the preview and selection within" (2026-09-30). editorStyle.ts.
        const radii = (await tab.getByRole("dialog").evaluate((dialog) => {
          const found = new Set<string>();
          for (const el of dialog.querySelectorAll("*")) {
            if (el.closest("[data-editor-piece]") || el.hasAttribute("data-canvas-slot")) continue;
            const radius = getComputedStyle(el).borderTopLeftRadius;
            if (radius && radius !== "0px") found.add(radius);
          }
          return [...found];
        })) as string[];
        const odd = radii.filter((r) => !["14px", "10px", "8px", "5px", "3px", "2px", "1px"].includes(r));
        const pictures = (await tab.getByRole("dialog").evaluate((dialog) =>
          [...dialog.querySelectorAll(".memari-swatch")].map((el) => getComputedStyle(el).borderTopLeftRadius)
        )) as string[];
        const corners = (await tab.getByRole("dialog").evaluate((dialog) => {
          const done = [...dialog.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Done");
          let el = done as HTMLElement | null;
          while (el && el.parentElement !== dialog) el = el.parentElement;
          const field = dialog.querySelector("input:not([type=checkbox]):not([data-canvas-slot]), select, textarea:not([data-canvas-slot])");
          return {
            panel: el ? getComputedStyle(el).borderTopLeftRadius : "",
            done: done ? getComputedStyle(done).borderTopLeftRadius : "",
            field: field ? getComputedStyle(field).borderTopLeftRadius : "",
          };
        })) as { panel: string; done: string; field: string };
        if (odd.length > 0) problems.push(`the editor has corners of ${odd.join(", ")} - not the panel's 14, a control's 3, a capsule's 10/8, a concentric 2 or a picture's 1px`);
        else if (corners.panel !== "14px") problems.push(`the editor's panel is rounded ${corners.panel}, not 14px`);
        else if (corners.done !== "3px" || (corners.field && corners.field !== "3px")) problems.push(`the editor's controls are rounded ${corners.done} (Done) and ${corners.field} (a field), not 3px`);
        else if (pictures.length === 0 || pictures.some((r) => r !== "1px")) problems.push(`the pickers' pictures are rounded ${[...new Set(pictures)].join(", ")}, not 1px`);
        else seen.push(`editor corners: panel 14px, controls 3px, pictures 1px (${radii.join(", ")})`);
        // THE INTERFACE IS THE LANDING PAGE'S FACE - San Francisco, else
        // Inter (asked 2026-09-30) - and the page it edits is not.
        const faces = (await tab.getByRole("dialog").evaluate(async (dialog) => {
          await document.fonts.ready;
          const label = [...dialog.querySelectorAll("span")].find((el) => (el.textContent ?? "").trim() === "Lines");
          const mark = dialog.querySelector("[data-editor-piece] div, [data-editor-piece] text");
          return {
            panel: label ? getComputedStyle(label).fontFamily : "",
            inter: [...document.fonts].some((f) => /Inter/.test(f.family) && f.status === "loaded"),
            page: mark ? getComputedStyle(mark).fontFamily : "",
          };
        })) as { panel: string; inter: boolean; page: string };
        if (!/^-apple-system/.test(faces.panel) || !/Inter/.test(faces.panel)) problems.push(`the editor's panel is set in ${faces.panel}, not the landing page's face`);
        else if (!faces.inter) problems.push("Inter, the interface face off Apple systems, never loaded");
        else if (/apple-system|Inter/.test(faces.page)) problems.push(`the module on the page took the interface face (${faces.page})`);
        else seen.push("the panel in the landing page's face, the module in its own");
        const first = tab.locator('[data-canvas-slot="items#0"]');
        if ((await first.count()) === 0) problems.push("an empty to-do offers no place for its first item");
        else {
          // AT REST an empty place says it is there - a faint placeholder
          // whenever the editor is open (2026-10-01) - and a printed default
          // shows only the drawing, not its words a second time.
          await tab.mouse.move(2, 2);
          await tab.waitForTimeout(150);
          const rest = (await tab.evaluate(`(() => {
            const alpha = (c) => { const m = (c.match(/[0-9.]+/g) || []).map(Number); return c.startsWith("rgba") ? m[3] : m.length >= 3 ? 1 : 0; };
            const empty = document.querySelector('[data-canvas-slot="items#0"]');
            const printed = [...document.querySelectorAll("[data-canvas-slot]")].find((el) => !el.value && el.placeholder && el.getAttribute("data-canvas-slot") !== "items#0" && !el.getAttribute("data-canvas-slot").startsWith("items#"));
            return {
              empty: alpha(getComputedStyle(empty, "::placeholder").color),
              printed: printed ? alpha(getComputedStyle(printed, "::placeholder").color) : null,
              printedSlot: printed ? printed.getAttribute("data-canvas-slot") : null,
            };
          })()`)) as { empty: number; printed: number | null; printedSlot: string | null };
          if (!(rest.empty > 0.1 && rest.empty < 0.38)) problems.push(`at rest the empty first row's placeholder is at ${rest.empty} opacity, not faint (0.1 to 0.38)`);
          else if (rest.printed !== null && rest.printed > 0) problems.push(`at rest ${rest.printedSlot}'s printed default shows its placeholder too (${rest.printed})`);
          else seen.push(`at rest the empty row's placeholder at ${rest.empty}${rest.printedSlot ? `, ${rest.printedSlot}'s printed default not doubled` : ""}`);
          const box = (await first.boundingBox())!;
          await tab.mouse.move(box.x + 12, box.y + box.height / 2);
          await tab.waitForTimeout(200);
          const hovered = await first.evaluate((el) => ({
            cursor: getComputedStyle(el).cursor,
            outline: getComputedStyle(el).outlineStyle,
            tint: getComputedStyle(el).backgroundColor,
            hint: getComputedStyle(el, "::placeholder").color,
          }));
          await tab.mouse.click(box.x + 12, box.y + box.height / 2);
          await tab.keyboard.type("Buy milk", { delay: 15 });
          await tab.keyboard.press("Enter");
          await tab.keyboard.type("Call mum", { delay: 15 });
          const now = await caret();
          // No highlight - asked 2026-09-30 - but a text cursor, and the
          // empty row's placeholder showing.
          if (hovered.cursor !== "text") problems.push(`hovering the first row shows a ${hovered.cursor} cursor, not a text one`);
          else if (hovered.outline !== "none" || !/rgba\(0, 0, 0, 0\)/.test(hovered.tint)) problems.push(`hovering highlights the row (outline ${hovered.outline}, ${hovered.tint})`);
          else if (/rgba\(0, 0, 0, 0\)/.test(hovered.hint)) problems.push("hovering the first row shows nothing to say an item goes there");
          if (now.slot !== "items#1") problems.push(`after Return the caret is in ${now.slot}, not the second item`);
          else if (now.at !== now.length) problems.push(`the caret is at ${now.at} of ${now.length}, not where the typing is`);
          else if (/rgba\(0, 0, 0, 0\)|74, 92, 255/.test(now.caretColor)) problems.push(`the caret is ${now.caretColor}, not the text's ink`);
          else if (/rgba\(0, 0, 0, 0\)|transparent/.test(now.ink)) problems.push("the item being typed is invisible");
          else seen.push("to-do: no highlight, a text cursor and the row's placeholder on hover; typed from the first row, Return to the next, the caret in ink at the typing");
          await done();
          const items = (await stored(todo.id)).items;
          const printed = await tab.locator(`[data-module-instance-id="${todo.id}"]`).evaluate((el) => (el as HTMLElement).innerText);
          if (JSON.stringify(items) !== '["Buy milk","Call mum"]') problems.push(`the to-do saved items ${JSON.stringify(items)}`);
          else if (!/Buy milk/.test(printed) || !/Call mum/.test(printed)) problems.push("the to-do on the page does not print its new items");
          else seen.push("saved and printed");
        }
      }

      // --- A CHART'S LEVEL, RENAMED WHERE IT PRINTS -------------------------
      if (!(await open(chart.id))) problems.push("the chart's editor would not open");
      else {
        const panelFields = await tab.getByRole("dialog").getByText("Levels, highest first", { exact: false }).count();
        if (panelFields > 0) problems.push("the chart's levels are still a box in the panel");
        const okay = tab.locator('[data-canvas-slot="levels#2"]');
        const box = await okay.boundingBox();
        if (!box) problems.push("the chart's third level has no place on the preview");
        else {
          // Right-aligned: a click at the place's right edge is after the y.
          await tab.mouse.click(box.x + box.width - 1, box.y + box.height / 2);
          const at = await caret();
          if (at.slot !== "levels#2" || at.at !== 4) problems.push(`a click at the end of "Okay" put the caret at ${at.at} in ${at.slot}`);
          await tab.keyboard.press("Backspace");
          await tab.keyboard.press("Backspace");
          await tab.keyboard.press("Backspace");
          await tab.keyboard.press("Backspace");
          await tab.keyboard.type("Fine", { delay: 15 });
          await done();
          const levels = (await stored(chart.id)).levels;
          if (JSON.stringify(levels) !== '["Great","Good","Fine","Low","Awful"]') problems.push(`the chart saved levels ${JSON.stringify(levels)}`);
          else seen.push("chart: a level renamed in place, caret where clicked");
        }
      }

      // --- A TABLE'S COLUMNS, AND DIVIDERS - on the Beginning page ----------
      await setLevel("FRONT_MATTER");
      await load();
      const matter = (await storedModules(guest.journalId)).filter((m) => m.level === "FRONT_MATTER" && m.slug === "labeled-box");
      if (matter.length < 2) problems.push(`the Beginning page has ${matter.length} boxes to work with`);
      else {
        await retypeModule(matter[matter.length - 1].id, "column-table", { heading: "Log", columns: ["Item", "Cost"] });
        await load();
        const table = matter[matter.length - 1];
        if (!(await open(table.id))) problems.push("the table's editor would not open");
        else {
          const head = tab.locator('[data-canvas-slot="columns#0"]');
          if ((await head.count()) === 0) problems.push("the table's first column has no place on the preview");
          else {
            await head.click();
            await tab.keyboard.press("ControlOrMeta+A");
            await tab.keyboard.type("Thing", { delay: 15 });
            await tab.keyboard.press("Enter");
            const next = await caret();
            await tab.keyboard.type("Qty", { delay: 15 });
            await done();
            const columns = (await stored(table.id)).columns;
            if (next.slot !== "columns#1") problems.push(`Return in a column head moved the caret to ${next.slot}`);
            else if (JSON.stringify(columns) !== '["Thing","Qty","Cost"]') problems.push(`the table saved columns ${JSON.stringify(columns)}`);
            else seen.push("table: a head renamed and a column added with Return");
          }
        }
        // Dividers down the day columns: a box across the page is four days.
        const box = matter[0];
        if (!(await open(box.id))) problems.push("the Beginning box's editor would not open");
        else {
          const dividers = tab.getByRole("dialog").getByLabel("Dividers");
          if ((await dividers.count()) === 0) problems.push("the note box has no Dividers switch");
          else {
            await dividers.check({ force: true });
            await done();
            if ((await stored(box.id)).dividers !== true) problems.push(`the note box saved dividers ${JSON.stringify((await stored(box.id)).dividers)}`);
            else seen.push("note box: Dividers saved");
          }
        }
      }

      // --- THE MONTH CALENDAR'S EDITOR SHOWS THE WHOLE SPREAD ---------------
      await setLevel("MONTHLY");
      await load();
      const month = (await storedModules(guest.journalId)).find((m) => m.slug === "month-grid-core" && m.level === "MONTHLY");
      if (!month || !(await open(month.id))) problems.push("the month calendar's editor would not open");
      else {
        const pieces = await tab.getByRole("dialog").locator("[data-editor-piece]").count();
        if (pieces !== 2) problems.push(`the month calendar's editor shows ${pieces} page(s), not the spread's 2`);
        else seen.push("month calendar: both pages in the editor");
      }
    } finally {
      await context.close();
      await guest.remove();
    }
    if (problems.length > 0) for (const problem of problems) fail("text on the page", problem);
    else note("text on the page", seen.join("; "));
  },
};

// ---------------------------------------------------------------------
// PALETTE DROP: after a module is dropped from the palette, the page shows
// exactly what was saved - every module, not only the ones the server moved.
//
// Reported 2026-09-29: two Reflections dragged into the weekly sidebar, and
// "when i released them they also over lapped" - Reminders drawn at rows
// 20-22 over the first of them while it was saved at 15-22. The drop's
// preview had moved Reminders; the server had not; only what the server
// moved was corrected. "Can you ensure this doesn't happen for any other
// module as well" - so several kinds are dropped, into the same crowded
// sidebar, and after each one every module's rows and columns on screen are
// compared with the database, and nothing may overlap in either.
// ---------------------------------------------------------------------
const paletteDrop: Probe = {
  name: "palette drop",
  ratios: [1],
  run: async (page, { base }) => {
    const guest = await makeGuestJournal("Palette drop check");
    // The sidebar it was reported from: three boxes filling it, no room.
    await setWeeklySidebar(guest.journalId, [["Things I'm Grateful For", 3, 12], ["Reminders", 15, 11], ["Notes", 26, 10]]);
    const context = await page.context().browser()!.newContext({
      viewport: { width: VIEWPORT.width, height: 1200 },
      deviceScaleFactor: 1,
    });
    try {
      await context.addCookies([{ name: guest.cookieName, value: guest.cookieValue, domain: "localhost", path: "/" }]);
      const tab = await context.newPage();
      await tab.goto(`${base}/app/j/${guest.journalId}`, { waitUntil: "networkidle" });
      await tab.waitForTimeout(3000);
      await tab.locator('button[title="Open module palette"]').click();
      await tab.waitForTimeout(800);
      // Its Modules section opens collapsed. The cards are in the page either
      // way - a collapsed section clips them rather than removing them - so
      // it is opened outright, not by asking whether cards exist: a drag from
      // a clipped card selected the page's text instead.
      await tab.getByRole("button", { name: "Modules", exact: true }).first().click();
      await tab.waitForTimeout(900);

      const all = await storedModules(guest.journalId);
      const noteBoxes = all.filter((m) => m.slug === "labeled-box" && m.level === "WEEKLY" && m.propValues.heading === "Notes");
      if (noteBoxes.length === 0) {
        fail("palette drop", "the weekly spread has no Notes box to drop above");
        return;
      }
      const notesId = noteBoxes[0].id;

      /** Everything on screen and in the database, compared. */
      const compare = async (what: string) => {
        const onScreen = (await tab.evaluate(`[...document.querySelectorAll('[data-module-instance-id]')].map((el) => {
          const row = /(\\d+) \\/ span (\\d+)/.exec(el.style.gridRow);
          const col = /(\\d+) \\/ span (\\d+)/.exec(el.style.gridColumn);
          return row && col ? { id: el.getAttribute('data-module-instance-id'), rowStart: +row[1] - 1, rowSpan: +row[2], columnStart: +col[1] - 1, columnSpan: +col[2] } : null;
        }).filter(Boolean)`)) as Array<{ id: string; rowStart: number; rowSpan: number; columnStart: number; columnSpan: number }>;
        const saved = await storedRows(onScreen.map((m) => m.id));
        const problems: string[] = [];
        for (const m of onScreen) {
          const s = saved[m.id];
          if (!s) continue;
          if (s.rowStart !== m.rowStart || s.rowSpan !== m.rowSpan || s.columnStart !== m.columnStart || s.columnSpan !== m.columnSpan) {
            problems.push(`${m.id.slice(-6)} shown at rows ${m.rowStart}+${m.rowSpan} cols ${m.columnStart}+${m.columnSpan}, saved at rows ${s.rowStart}+${s.rowSpan} cols ${s.columnStart}+${s.columnSpan}`);
          }
        }
        // Overlaps, page by page, on screen.
        const byPage = new Map<string, typeof onScreen>();
        for (const m of onScreen) {
          const pageId = saved[m.id]?.pageId;
          if (!pageId) continue;
          byPage.set(pageId, [...(byPage.get(pageId) ?? []), m]);
        }
        for (const mods of byPage.values()) {
          for (let i = 0; i < mods.length; i++) {
            for (let j = i + 1; j < mods.length; j++) {
              const a = mods[i], b = mods[j];
              if (a.columnStart < b.columnStart + b.columnSpan && b.columnStart < a.columnStart + a.columnSpan &&
                  a.rowStart < b.rowStart + b.rowSpan && b.rowStart < a.rowStart + a.rowSpan) {
                problems.push(`on screen, rows ${a.rowStart}+${a.rowSpan} and ${b.rowStart}+${b.rowSpan} overlap`);
              }
            }
          }
        }
        if (problems.length > 0) fail("palette drop", `${what}: ${problems.slice(0, 2).join("; ")}`);
        return problems.length === 0;
      };

      /** The left page's sidebar modules as saved, top to bottom. */
      const sidebar = async () => {
        const mods = await storedModules(guest.journalId);
        const rows = await storedRows(mods.map((m) => m.id));
        const notesPage = rows[notesId]?.pageId;
        return mods
          .filter((m) => rows[m.id]?.pageId === notesPage && rows[m.id]?.columnStart === 0 && m.slug !== "week-title")
          .sort((a, b) => (rows[a.id].rowStart as number) - (rows[b.id].rowStart as number));
      };

      type Box = { id: string; left: number; top: number; width: number; height: number };
      const boxes = async () =>
        (await tab.evaluate(`[...document.querySelectorAll('[data-module-instance-id]')].map((el) => {
          const r = el.getBoundingClientRect();
          return { id: el.getAttribute('data-module-instance-id'), left: r.left, top: r.top, width: r.width, height: r.height };
        })`)) as Box[];

      /** A real-mouse drag from `source` to a point in module `targetId` -
       *  `at` of the way down it - and whether release kept what the preview
       *  showed. Reported 2026-09-29: the gap opened in one place and the
       *  module was saved in another, so things moved on release. Every
       *  module already on the target page must end where the preview drew
       *  it, and the arriving one must land in the gap it opened rather than
       *  on anything the preview showed. */
      const dragTo = async (source: Locator, targetId: string, at: number, what: string, grabAt: number | null = null) => {
        await source.scrollIntoViewIfNeeded();
        const from = await source.boundingBox();
        const to = await tab.locator(`[data-module-instance-id="${targetId}"]`).boundingBox();
        if (!from || !to) return `could not find what to drag, or where to, for ${what}`;
        const x0 = from.x + from.width / 2;
        const y0 = from.y + (grabAt === null ? Math.min(40, from.height / 2) : from.height * grabAt);
        const x1 = to.x + to.width / 2, y1 = to.y + Math.max(6, Math.min(to.height - 6, to.height * at));
        const movingId = await source.getAttribute("data-module-instance-id");
        const beforeDrag = await boxes();
        await tab.mouse.move(x0, y0);
        await tab.mouse.down();
        for (let i = 1; i <= 25; i++) {
          await tab.mouse.move(x0 + ((x1 - x0) * i) / 25, y0 + ((y1 - y0) * i) / 25);
          await tab.waitForTimeout(16);
        }
        await tab.waitForTimeout(400);
        const shown = await boxes();
        await tab.mouse.up();
        await tab.waitForTimeout(2500);
        const landed = await boxes();
        const saved = await storedRows(landed.map((b) => b.id));
        const targetPage = saved[targetId]?.pageId;
        const shownById = new Map(shown.map((b) => [b.id, b]));
        const arrivalId = movingId ?? landed.find((b) => !shownById.has(b.id) && saved[b.id]?.pageId === targetPage)?.id;
        const siblings = landed.filter((b) => b.id !== arrivalId && saved[b.id]?.pageId === targetPage && shownById.has(b.id));
        const moved = siblings
          .map((b) => ({ b, was: shownById.get(b.id)! }))
          .filter(({ b, was }) => Math.abs(b.top - was.top) > 2 || Math.abs(b.height - was.height) > 2);
        if (moved.length > 0) {
          const { b, was } = moved[0];
          return `${what}: released, ${moved.length} module(s) moved from where the preview showed them - one from ${was.top.toFixed(0)}+${was.height.toFixed(0)}px to ${b.top.toFixed(0)}+${b.height.toFixed(0)}px`;
        }
        const arrival = landed.find((b) => b.id === arrivalId);
        // Refused - no room even with everything at its minimum, which the
        // preview says with its no-entry mark - and, checked above, nothing
        // moved. Whether drops land at all is counted at the end.
        if (!arrival) return null;
        const under = siblings.find((b) => {
          const was = shownById.get(b.id)!;
          return arrival.left < was.left + was.width - 2 && was.left < arrival.left + arrival.width - 2 &&
            arrival.top < was.top + was.height - 2 && was.top < arrival.top + arrival.height - 2;
        });
        if (under) return `${what}: landed on a module the preview had shown where it landed, not in the gap it opened`;
        // And on the side of each neighbour its drawn middle was on - the box
        // the palette draws round the pointer, or the module being carried.
        // Reported 2026-09-29 as "the space created for it would jump below
        // a module before it should": the rule judged a box half a module
        // lower than the one on screen. Neighbours as they were before the
        // drag, in the columns it landed in; the fixed blocks above a stack
        // (the week title, the hours) are not neighbours it can pass.
        const drawn = shown.find((b) => b.id === (movingId ?? "__palette_phantom__"));
        const fixed = new Set((await storedModules(guest.journalId)).filter((m) => m.slug.endsWith("-title") || m.slug.endsWith("-grid-core")).map((m) => m.id));
        if (drawn) {
          const middle = drawn.top + drawn.height / 2;
          const wrongSide = beforeDrag.find((b) => {
            if (b.id === arrivalId || fixed.has(b.id) || saved[b.id]?.pageId !== targetPage) return false;
            if (Math.abs(b.left - arrival.left) > 2 || Math.abs(b.width - arrival.width) > 2) return false;
            const itsMiddle = b.top + b.height / 2;
            if (Math.abs(middle - itsMiddle) < 4) return false;
            const landedAbove = arrival.top < (landed.find((l) => l.id === b.id)?.top ?? b.top);
            return landedAbove !== middle < itsMiddle;
          });
          if (wrongSide) {
            return `${what}: its middle was ${drawn.top + drawn.height / 2 < wrongSide.top + wrongSide.height / 2 ? "above" : "below"} a neighbour's middle and it landed on the other side of it`;
          }
        }
        return null;
      };

      /** A palette card dropped on one of the sidebar's modules. */
      const drop = async (slug: string, targetIndex: number, at: number) => {
        const card = tab.locator(`[data-palette-slug="${slug}"]`).first();
        if ((await card.count()) === 0) return `no palette card for ${slug}`;
        const targets = await sidebar();
        const target = targets[Math.min(targetIndex, targets.length - 1)];
        if (!target) return "the sidebar is empty";
        return dragTo(card, target.id, at, `${slug} on sidebar module ${targetIndex + 1} at ${Math.round(at * 100)}%`);
      };

      // CROWDED, the way a real sidebar gets: kinds of every shape dropped on
      // the top, middle and foot of whatever is there, until there is no
      // room left and every drop has to shrink something to get in - which
      // is where a preview and a server can disagree about what to shrink.
      // What was reported first: two Reflections (prompted lines) dropped
      // near the foot of the first box. The second previewed ABOVE the
      // first, was saved BELOW it, and the screen kept the preview's
      // Reminders over it. Then two on Notes.
      const plan: Array<[string, number, number]> = [
        ["prompted-lines", 0, 0.9],
        ["prompted-lines", 0, 0.9],
        ["prompted-lines", 3, 0.03],
        ["prompted-lines", 4, 0.03],
        ["column-table", 1, 0.7],
        ["todo-checklist", 0, 0.3],
        ["mini-month", 2, 0.05],
        ["habit-tracker", 4, 0.5],
        ["labeled-box", 0, 0.9],
        ["prompted-lines", 1, 0.5],
        ["column-table", 5, 0.1],
        ["todo-checklist", 3, 0.95],
      ];
      let passed = 0;
      if (!(await compare("before any drop"))) return;
      for (const [i, [slug, target, at]] of plan.entries()) {
        const error = await drop(slug, target, at);
        if (error) {
          fail("palette drop", error);
          return;
        }
        if (await compare(`after drop ${i + 1} (${slug} on sidebar module ${target + 1} at ${Math.round(at * 100)}%)`)) passed++;
        else break;
      }
      // And a MOVE between zones, which is committed the same way. The case
      // where resolving twice disagreed is an arrival TALLER than the module
      // it is put above: the server, starting from the preview's row, finds
      // the two sharing a top and the taller one's middle lower, so it put
      // the arrival after. The to-do under the hours is three rows in the
      // sidebar; Reminders is cut to two, and the to-do is carried by its
      // middle to just above Reminders' middle.
      // Counted before the move below resets the sidebar.
      const added = (await storedModules(guest.journalId)).length - all.length;
      let moveHeld = false;
      if (passed === plan.length) {
        await setWeeklySidebar(guest.journalId, [["Things I'm Grateful For", 3, 12], ["Reminders", 15, 2], ["Notes", 17, 19]]);
        await tab.goto(`${base}/app/j/${guest.journalId}`, { waitUntil: "networkidle" });
        await tab.waitForTimeout(3000);
        const rows = await storedRows(all.map((m) => m.id));
        const notesPage = rows[notesId]?.pageId;
        const todo = all.find((m) => m.level === "WEEKLY" && rows[m.id]?.pageId === notesPage && m.slug === "todo-checklist");
        const reminders = (await sidebar()).find((m) => m.propValues.heading === "Reminders");
        if (!todo || !reminders) fail("palette drop", "no to-do under the hours, or no Reminders, to move between");
        else {
          const error = await dragTo(
            tab.locator(`[data-module-instance-id="${todo.id}"]`),
            reminders.id,
            0.3,
            "the to-do moved into the sidebar, above a shorter module",
            0.5
          );
          if (error) fail("palette drop", error);
          else moveHeld = await compare("after the move");
        }
      }
      if (added < 4) fail("palette drop", `${plan.length} drops added only ${added} module(s) - the drags are not landing`);
      else if (passed === plan.length && moveHeld) {
        note("palette drop", `${plan.length} drops of ${new Set(plan.map((p) => p[0])).size} kinds into a full weekly sidebar (${added} fitted) and one move between zones: every release kept what the preview showed, and the page matched the database, nothing overlapping`);
      }
    } finally {
      await context.close();
      await guest.remove();
    }
  },
};

// ---------------------------------------------------------------------
// FIRST VISIT: filling in a new person's default time zone does not rebuild
// the editor, and the Time zone field shows what was filled in.
//
// A person with no default gets the browser's zone the first time a journal
// opens. That used to rebuild the editor when the server answered, so a new
// person's whole canvas visibly refreshed a few seconds after their journal
// appeared - the complaint about adding an event, on a first visit instead.
// Found 2026-09-28 by the hairline probe, whose palette cards vanished
// mid-measurement at 1x and at no other ratio.
//
// Every "Zoom in" button that ever enters the page is collected from before
// the first paint, by an init script, so a rebuild - a new editor, so a new
// button - counts two however quickly the server answers. On a page of its
// own, so the observer does not ride along into the frame-counting probes.
// ---------------------------------------------------------------------
const firstVisit: Probe = {
  name: "first visit",
  ratios: [1],
  run: async (page, { base, journalId, forgetSettings }) => {
    await forgetSettings();
    const tab = await page.context().newPage();
    try {
      await tab.addInitScript(`(() => {
        const seen = (window.__zoomButtons = []);
        new MutationObserver(() => {
          for (const b of document.querySelectorAll('button[title="Zoom in"]')) if (!seen.includes(b)) seen.push(b);
        }).observe(document, { childList: true, subtree: true });
      })()`);
      await tab.goto(`${base}/app/j/${journalId}`, { waitUntil: "networkidle" });
      const zone = (await tab.evaluate("Intl.DateTimeFormat().resolvedOptions().timeZone")) as string;
      const expected = `Your default is ${zone.replace(/_/g, " ")}`;
      let text = "";
      for (let i = 0; i < 60 && !text.includes(expected); i++) {
        await tab.waitForTimeout(250);
        text = (await tab.evaluate(`document.body.textContent || ""`)) as string;
      }
      // Long enough for a rebuild the seed set off to have landed.
      await tab.waitForTimeout(2000);
      const buttons = (await tab.evaluate(
        `window.__zoomButtons.length + ":" + window.__zoomButtons.filter((b) => b.isConnected).length`
      )) as string;
      const [ever, now] = buttons.split(":").map(Number);

      if (!text.includes(expected)) {
        fail("first visit", `the Time zone field never showed "${expected}" - the seeded default did not reach it`);
      } else if (ever !== 1 || now !== 1) {
        fail("first visit", `seeding the default zone REBUILT the editor - ${ever} zoom bars came and went, ${now} left`);
      } else {
        note("first visit", `the default zone (${zone}) was filled in and shown, in place - one editor throughout`);
      }
    } finally {
      await tab.close();
    }
  },
};

const ALL_PROBES: Probe[] = [
  pillTravel,
  firstVisit,
  drawerTab,
  hairlines,
  pageChange,
  noReload,
  eventDrag,
  zoomBar,
  spineDrag,
  moduleEditor,
  paletteDrop,
  roundTwoPickers,
  textOnThePage,
  consoleClean,
];
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
          await probe.run(page, { base: server.base, journalId: guest.journalId, dpr, forgetSettings: guest.forgetSettings });
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
