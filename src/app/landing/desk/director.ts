// What the journal does, and when: it waits closed while the title arrives,
// opens to this week, is written in, and turns to the next week, which is
// written in by someone else - forever, while it is on screen.
//
// Four page surfaces in rotation: the spread showing (left, right) and the
// one being prepared underneath the next turn. The next spread is PRINTED
// during the pause after writing, a page per idle moment, so a turn never
// waits on drawing a page.

import * as THREE from "three";
import type { LandingSpread } from "../spreads";
import { PageSurface } from "./pageSurface";
import type { DeskScene } from "./scene";
import { familiesFor, planSpread } from "../handwriting/plan";
import { inkTimeline, paintInk, type Timed } from "../handwriting/ink";
import { InkClock } from "../pace";

const OPEN_SECONDS = 2.6;
const BEFORE_WRITING = 0.5;
const AFTER_WRITING = 1.6;
const TURN_SECONDS = 1.7;
const WRITING_TARGET = 14;

type Slot = { surface: PageSurface; texture: THREE.CanvasTexture };
type Phase =
  | { name: "closed" }
  | { name: "opening"; since: number }
  | { name: "writing"; clock: InkClock; timeline: Timed[]; duration: number }
  | { name: "resting"; since: number }
  | { name: "turning"; since: number };

const idle = (fn: () => void) =>
  typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(fn, { timeout: 400 }) : window.setTimeout(fn, 30);

export class Director {
  private slots: Slot[];
  /** Index into slots: the spread on show, and the one being prepared. */
  private showing: [number, number] = [0, 1];
  private next: [number, number] = [2, 3];
  private phase: Phase = { name: "closed" };
  private order: number[];
  private at = 0;
  private cycle = 0;
  private nextReady = false;
  private nextTimeline: { timeline: Timed[]; duration: number } | null = null;

  constructor(
    private scene: DeskScene,
    private spreads: LandingSpread[],
    textureHeight: number
  ) {
    const anisotropy = scene.renderer.capabilities.getMaxAnisotropy();
    this.slots = Array.from({ length: 4 }, () => {
      const surface = new PageSurface(textureHeight);
      const texture = new THREE.CanvasTexture(surface.canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(16, anisotropy);
      return { surface, texture };
    });
    // The reference spread first - it is the one the photo was of - then the
    // rest in a new order each visit.
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

  /** Print a spread onto a pair of slots. */
  private async print(spread: LandingSpread, pair: [number, number]) {
    for (const [i, page] of spread.pages.entries()) {
      const slot = this.slots[pair[i]];
      await slot.surface.print(page, spread.fontFamily, i === 0 ? "left" : "right");
      slot.texture.needsUpdate = true;
    }
  }

  private async prepareWriting(spread: LandingSpread) {
    await Promise.all(familiesFor(spread.key).map((family) => document.fonts.load(`40px ${family}`).catch(() => [])));
    const { strokes, duration } = inkTimeline(planSpread(spread, 1 + this.cycle * 7919 + Math.floor(Math.random() * 1000)), WRITING_TARGET, this.cycle + 1);
    return { timeline: strokes, duration };
  }

  /** Get the first spread onto the pages; the book stays closed. */
  async ready() {
    await this.print(this.spreadAt(0), this.showing);
    this.nextTimeline = await this.prepareWriting(this.spreadAt(0));
    this.scene.journal.setPages(this.slots[this.showing[0]].texture, this.slots[this.showing[1]].texture);
  }

  /** Open the book now (after the title has had its moment). */
  open(now: number) {
    if (this.phase.name === "closed") this.phase = { name: "opening", since: now };
  }

  /** The finished picture, for reduced motion: open, written in, still. */
  still() {
    this.scene.journal.setOpen(1);
    if (this.nextTimeline) {
      const layers: [PageSurface, PageSurface] = [this.slots[this.showing[0]].surface, this.slots[this.showing[1]].surface];
      paintInk(this.nextTimeline.timeline, Infinity, [layers[0].layers, layers[1].layers], layers[0].scale);
      for (const i of this.showing) {
        this.slots[i].surface.compose();
        this.slots[i].texture.needsUpdate = true;
      }
    }
  }

  update(now: number) {
    this.at = now;
    const journal = this.scene.journal;
    const phase = this.phase;
    switch (phase.name) {
      case "closed":
        journal.setOpen(0);
        return;
      case "opening": {
        const p = (now - phase.since) / OPEN_SECONDS;
        journal.setOpen(p);
        if (p >= 1 && this.nextTimeline) {
          this.phase = { name: "writing", clock: new InkClock(now + BEFORE_WRITING), ...this.nextTimeline };
          this.nextTimeline = null;
        }
        return;
      }
      case "writing": {
        const t = phase.clock.advance(now);
        if (t < 0) return;
        const left = this.slots[this.showing[0]];
        const right = this.slots[this.showing[1]];
        const changed = paintInk(phase.timeline, t, [left.surface.layers, right.surface.layers], left.surface.scale);
        if (changed[0]) {
          left.surface.compose();
          left.texture.needsUpdate = true;
        }
        if (changed[1]) {
          right.surface.compose();
          right.texture.needsUpdate = true;
        }
        if (t > phase.duration + 0.2) {
          this.phase = { name: "resting", since: now };
          this.nextReady = false;
          // Print next week underneath while this one is admired.
          const step = this.cycle + 1;
          idle(() => {
            void this.print(this.spreadAt(step), this.next).then(async () => {
              this.nextTimeline = await this.prepareWriting(this.spreadAt(step));
              this.nextReady = true;
            });
          });
        }
        return;
      }
      case "resting":
        if (now - phase.since > AFTER_WRITING && this.nextReady) {
          const [l, r] = this.showing;
          const [nl, nr] = this.next;
          // The right page lifts away carrying what was written on it; the
          // next right page is already underneath it.
          journal.setPages(this.slots[l].texture, this.slots[nr].texture);
          journal.setTurn(0, this.slots[r].texture, this.slots[nl].texture);
          this.phase = { name: "turning", since: now };
        }
        return;
      case "turning": {
        const p = Math.min(1, (now - phase.since) / TURN_SECONDS);
        journal.setTurn(p);
        if (p >= 1) {
          const [l, r] = this.showing;
          this.showing = [...this.next];
          this.next = [l, r];
          journal.setPages(this.slots[this.showing[0]].texture, this.slots[this.showing[1]].texture);
          journal.setTurn(null);
          this.cycle++;
          if (this.nextTimeline) {
            this.phase = { name: "writing", clock: new InkClock(now + BEFORE_WRITING), ...this.nextTimeline };
            this.nextTimeline = null;
          }
        }
        return;
      }
    }
  }

  dispose() {
    for (const slot of this.slots) slot.texture.dispose();
  }
}
