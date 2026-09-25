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
import { inkTimeline, paintInk, prepareInk, type Timed } from "../handwriting/ink";
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
  private cycle = 0;
  private nextTimeline: { timeline: Timed[]; duration: number } | null = null;
  private nextReady = false;

  constructor(
    private readonly spreads: LandingSpread[],
    textureHeight: number,
    /** Called when a page's picture has changed (0 left, 1 right). */
    private readonly changed: (page: 0 | 1, picture: HTMLCanvasElement) => void
  ) {
    const surface = () => new PageSurface(textureHeight, { bare: true });
    this.showing = [surface(), surface()];
    this.next = [surface(), surface()];
    const rest = spreads.map((_, i) => i).filter((i) => spreads[i].key !== "classic");
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const first = spreads.findIndex((s) => s.key === "classic");
    this.order = [first >= 0 ? first : 0, ...rest];
  }

  private spreadAt(step: number) {
    return this.spreads[this.order[step % this.order.length]];
  }

  private async print(spread: LandingSpread, pair: Pair) {
    for (const [i, page] of spread.pages.entries()) await pair[i].print(page, spread.fontFamily, i === 0 ? "left" : "right");
  }

  private async prepareWriting(spread: LandingSpread) {
    await Promise.all([...familiesFor(spread.key).map((family) => document.fonts.load(`40px ${family}`).catch(() => [])), loadArtIndex()]);
    const { strokes, duration } = inkTimeline(planSpread(spread, 1 + this.cycle * 7919 + Math.floor(Math.random() * 1000)), WRITING_TARGET, this.cycle + 1);
    await prepareInk(strokes, this.showing[0].scale);
    return { timeline: strokes, duration };
  }

  private show() {
    this.changed(0, this.showing[0].canvas);
    this.changed(1, this.showing[1].canvas);
  }

  /** Print the first spread, blank, ready to appear. */
  async ready() {
    await this.print(this.spreadAt(0), this.showing);
    this.nextTimeline = await this.prepareWriting(this.spreadAt(0));
    this.show();
  }

  /** The finished picture, for reduced motion: the first spread written. */
  still() {
    if (!this.nextTimeline) return;
    paintInk(this.nextTimeline.timeline, Infinity, [this.showing[0].layers, this.showing[1].layers], this.showing[0].scale);
    for (const s of this.showing) s.compose();
    this.show();
  }

  /** The clip has stopped: the first layout is on the page; start writing. */
  start(now: number) {
    if (this.phase.name !== "waiting" || !this.nextTimeline) return;
    this.phase = { name: "writing", clock: new InkClock(now + BEFORE_WRITING), ...this.nextTimeline };
    this.nextTimeline = null;
  }

  update(now: number) {
    const phase = this.phase;
    if (phase.name === "writing") {
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
        this.phase = { name: "resting", since: now };
        this.nextReady = false;
        const step = this.cycle + 1;
        idle(() => {
          void this.print(this.spreadAt(step), this.next).then(async () => {
            this.nextTimeline = await this.prepareWriting(this.spreadAt(step));
            this.nextReady = true;
          });
        });
      }
    } else if (phase.name === "resting" && now - phase.since > AFTER_WRITING && this.nextReady && this.nextTimeline) {
      // The new layout replaces the last, blank, all at once.
      [this.showing, this.next] = [this.next, this.showing];
      this.cycle++;
      this.show();
      this.phase = { name: "writing", clock: new InkClock(now + BEFORE_WRITING), ...this.nextTimeline };
      this.nextTimeline = null;
    }
  }
}
