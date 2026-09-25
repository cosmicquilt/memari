// How fast the invisible hand writes in the landing page's journal.
//
// The pace is the share of its natural time a spread's handwriting takes:
// 1 is the speed it was built at (a spread in 14-20 seconds). Andrew tuned
// it with a slider (2026-09-23: "a slider from instant to its current
// speed") and chose 20 times faster (2026-09-24: "I like 20x faster writing
// speed you can get rid of slider"), then 25 (2026-09-25). One value for
// both heroes.

export const PACE = 1 / 25;

/**
 * The pen's clock for one spread: how many seconds of handwriting are done,
 * advanced by real seconds divided by the pace.
 */
export class InkClock {
  private written = 0;
  private last: number | null = null;

  constructor(private readonly startAt: number) {}

  /** Handwriting seconds done at `now`; negative before it starts. */
  advance(now: number) {
    if (now < this.startAt) return -1;
    const from = this.last ?? this.startAt;
    this.last = now;
    this.written += (now - from) / PACE;
    return this.written;
  }
}
