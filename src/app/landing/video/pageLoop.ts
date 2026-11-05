// What the pages of the video's journal do once the clip has stopped (asked
// for 2026-09-23): the first layout appears at once and is written in; then
// a new blank layout takes its place - no page turn, it simply replaces the
// last - and is written in; and so on, while the hero is on screen.
//
// The same pieces as the 3D journal's Director (desk/director.ts) - pages
// printed by PageSurface, handwriting planned and timed by the handwriting
// modules - on two surfaces in "bare" mode, which the PageWarp lays onto
// the video's pages. The next spread is printed underneath while the last
// one rests, a page per idle moment, so a swap never waits on drawing.

import type { LandingSpread } from "../spreads";
import { PageSurface } from "../desk/pageSurface";
import { familiesFor, planSpread } from "../handwriting/plan";
import { inkTimeline, paintInk, prepareInk, releaseInk, type Timed } from "../handwriting/ink";
import { loadArtIndex } from "../handwriting/art";
import { InkClock } from "../pace";

const BEFORE_WRITING = 0.4;
/** Seconds a finished page rests before the next layout replaces it (1.8
 *  until 2026-09-25: "switch to new layout a bit sooner"). */
const AFTER_WRITING = 1.1;
const WRITING_TARGET = 14;

type Pair = [PageSurface, PageSurface];
type Phase =
  | { name: "waiting" }
  /** On the page and fading in; writing from `at`, or once it is planned. */
  | { name: "starting"; at: number }
  | { name: "writing"; clock: InkClock; timeline: Timed[]; duration: number }
  | { name: "resting"; since: number };

const idle = (fn: () => void) =>
  typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(fn, { timeout: 400 }) : window.setTimeout(fn, 30);

export class PageLoop {
  /** The pair on the pages now, and the pair being printed for next. */
  showing: Pair;
  private next: Pair;
  private phase: Phase = { name: "waiting" };
  private order: number[];
  /** The spread on the pages, as a step of the order from the first. */
  private cycle = 0;
  private nextTimeline: { timeline: Timed[]; duration: number } | null = null;
  private nextReady = false;
  /** The step `next` holds once nextReady. */
  private nextStep = -1;
  /** The first spread's writing, planned while it appears. */
  private firstWriting: Promise<unknown> | null = null;
  /** THE HERO'S CONTROLS (2026-11-04: "play pause forward back should steer
   *  layout and writing should still fill out with writing even if you pause
   *  the layout should just not go to the next"). Paused: the layout on the
   *  pages still writes itself in, and then stays. */
  private paused = false;
  /** A jump back or forward asked for, the step it is to (the latest wins). */
  private wanted: number | null = null;
  private jumping = false;
  /** Prints into `next`, one at a time: the rest's print of what comes next
   *  and a jump both use it. */
  private work: Promise<unknown> = Promise.resolve();
  /** Moves on with each jump: a print begun for an older plan is dropped. */
  private printToken = 0;
  /** The last frame's time, for a jump made between frames. */
  private lastNow = 0;
  /** Told when another spread comes onto the pages (its key). */
  onShown?: (key: string) => void;

  constructor(
    private readonly spreads: LandingSpread[],
    textureHeight: number,
    /** Called when a page's picture has changed (0 left, 1 right). */
    private readonly changed: (page: 0 | 1, picture: HTMLCanvasElement) => void
  ) {
    const surface = () => new PageSurface(textureHeight, { bare: true });
    this.showing = [surface(), surface()];
    this.next = [surface(), surface()];
    // In the order the server sends them: the student first, then the jobs
    // most people do (archetypes.ts, 2026-10-06). They were shuffled after
    // a fixed first one until then.
    this.order = spreads.map((_, i) => i);
  }

  private spreadAt(step: number) {
    const n = this.order.length;
    return this.spreads[this.order[((step % n) + n) % n]];
  }

  /** The spread on the pages. */
  get spread(): LandingSpread {
    return this.spreadAt(this.cycle);
  }

  get isPaused() {
    return this.paused;
  }

  /** Stop going on to the next layout (the one on the pages still writes
   *  itself in), or go on again - at once, if it has rested long enough. */
  setPaused(paused: boolean) {
    this.paused = paused;
  }

  /** The next spread written into `next`, alone in the queue. */
  private queue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.work.then(fn);
    this.work = run.catch(() => {});
    return run;
  }

  /** Back or forward a layout: printed, planned, and then shown blank to be
   *  written in, as a layout coming on its own is. Presses while one is
   *  printing add up; the last is where it lands. */
  async jump(by: 1 | -1) {
    if (this.phase.name === "waiting" || this.phase.name === "starting") return;
    // never below the first: back from it is the last, as a step of the
    // order - a negative step made a negative seed for the handwriting,
    // which failed to plan the week ("Writing student's week failed")
    const n = this.order.length;
    const step = (this.wanted ?? this.cycle) + by;
    this.wanted = step < 0 ? ((step % n) + n) % n : step;
    if (this.jumping) return;
    this.jumping = true;
    try {
      while (this.wanted !== null) {
        const target: number = this.wanted;
        // the rest's print, if it was for another step, is not to be shown
        const token = ++this.printToken;
        const writing =
          this.nextReady && this.nextStep === target && this.nextTimeline
            ? this.nextTimeline
            : await this.queue(async () => {
                await this.print(this.spreadAt(target), this.next);
                return this.prepareWriting(this.spreadAt(target));
              });
        if (this.wanted !== target || token !== this.printToken) {
          // put aside for a later press: given back (releaseInk)
          if (writing !== this.nextTimeline) releaseInk(writing.timeline);
          continue;
        }
        this.wanted = null;
        // the writing it replaces, if it was still going
        if (this.phase.name === "writing") releaseInk(this.phase.timeline);
        [this.showing, this.next] = [this.next, this.showing];
        this.cycle = target;
        this.nextReady = false;
        // the rest's own next, if it was not this
        if (this.nextTimeline && this.nextTimeline !== writing) releaseInk(this.nextTimeline.timeline);
        this.nextTimeline = null;
        this.show();
        this.phase = { name: "writing", clock: new InkClock(this.lastNow + BEFORE_WRITING), ...writing };
        this.onShown?.(this.spread.key);
      }
    } finally {
      this.jumping = false;
    }
  }

  private async print(spread: LandingSpread, pair: Pair) {
    for (const [i, page] of spread.pages.entries()) await pair[i].print(page, spread.fontFamily, i === 0 ? "left" : "right");
  }

  private async prepareWriting(spread: LandingSpread) {
    await Promise.all([...familiesFor(spread.key).map((family) => document.fonts.load(`40px ${family}`).catch(() => [])), loadArtIndex()]);
    // A spread whose writing fails is shown unwritten rather than stopping
    // the loop on it: a throw here left the hero on one week forever.
    let plan: ReturnType<typeof planSpread> = [];
    try {
      plan = planSpread(spread, 1 + this.cycle * 7919 + Math.floor(Math.random() * 1000));
    } catch (error) {
      console.error(`Writing ${spread.key}'s week failed:`, error);
    }
    const { strokes, duration } = inkTimeline(plan, WRITING_TARGET, this.cycle + 1);
    // every letter made before the writing starts, the first spread's too
    // (prepareInk, 2026-11-05); later spreads are prepared while one rests
    await prepareInk(strokes, this.showing[0].scale);
    return { timeline: strokes, duration };
  }

  private show() {
    this.changed(0, this.showing[0].canvas);
    this.changed(1, this.showing[1].canvas);
  }

  /** Print the first spread, blank, ready to appear - and plan its writing
   *  alongside, not first (2026-10-22: "i want the layout and other
   *  starting animations for the hero journal to start sooner"). Getting
   *  the ink ready took 0.8 to 1.1 s and the layout waited for it, though
   *  the writing is not wanted until the layout has faded in, 1.6 s later:
   *  now the layout comes as soon as it is printed, and the writing is
   *  planned while it fades (start() waits for it, if it must). */
  async ready() {
    this.firstWriting = this.prepareWriting(this.spreadAt(0))
      // the ink failing leaves the spread unwritten, never the hero stuck
      .catch((error) => {
        console.error("Planning the first spread's writing failed:", error);
        return { timeline: [] as Timed[], duration: 0 };
      })
      .then((writing) => {
        this.nextTimeline = writing;
      });
    await this.print(this.spreadAt(0), this.showing);
    this.show();
  }

  /** The finished picture, for reduced motion: the first spread written. */
  async still() {
    await this.firstWriting;
    if (!this.nextTimeline) return;
    paintInk(this.nextTimeline.timeline, Infinity, [this.showing[0].layers, this.showing[1].layers], this.showing[0].scale);
    for (const s of this.showing) s.compose();
    this.show();
  }

  /** The first layout is coming onto the page: write from `now`, or as
   *  soon after as its writing is planned. */
  start(now: number) {
    if (this.phase.name !== "waiting") return;
    this.phase = { name: "starting", at: now };
  }

  update(now: number) {
    this.lastNow = now;
    const phase = this.phase;
    if (phase.name === "starting") {
      if (!this.nextTimeline) return;
      this.phase = { name: "writing", clock: new InkClock(Math.max(phase.at, now) + BEFORE_WRITING), ...this.nextTimeline };
      this.nextTimeline = null;
    } else if (phase.name === "writing") {
      const t = phase.clock.advance(now);
      if (t < 0) return;
      const [left, right] = this.showing;
      const changed = paintInk(phase.timeline, t, [left.layers, right.layers], left.scale);
      if (changed[0]) {
        left.compose(changed[0]);
        this.changed(0, left.canvas);
      }
      if (changed[1]) {
        right.compose(changed[1]);
        this.changed(1, right.canvas);
      }
      if (t > phase.duration + 0.2) {
        // written in: its letters' and doodles' canvases are done with
        releaseInk(phase.timeline);
        this.phase = { name: "resting", since: now };
        this.nextReady = false;
        const step = this.cycle + 1;
        const token = this.printToken;
        idle(() => {
          void this.queue(async () => {
            if (token !== this.printToken) return;
            await this.print(this.spreadAt(step), this.next);
            const writing = await this.prepareWriting(this.spreadAt(step));
            // a jump since has printed over it
            if (token !== this.printToken) {
              releaseInk(writing.timeline);
              return;
            }
            this.nextTimeline = writing;
            this.nextStep = step;
            this.nextReady = true;
          });
        });
      }
    } else if (
      phase.name === "resting" &&
      !this.paused &&
      !this.jumping &&
      now - phase.since > AFTER_WRITING &&
      this.nextReady &&
      this.nextStep === this.cycle + 1 &&
      this.nextTimeline
    ) {
      // The new layout replaces the last, blank, all at once.
      [this.showing, this.next] = [this.next, this.showing];
      this.cycle++;
      this.nextReady = false;
      this.show();
      this.phase = { name: "writing", clock: new InkClock(now + BEFORE_WRITING), ...this.nextTimeline };
      this.nextTimeline = null;
      this.onShown?.(this.spread.key);
    }
  }
}
