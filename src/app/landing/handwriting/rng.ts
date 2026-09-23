// Seeded randomness and a smooth noise, for handwriting that varies like a
// hand does but is the same on every run with the same seed - which is what
// makes it testable, and what keeps a page from rearranging itself when it
// is redrawn.

export type Rng = {
  /** 0 <= n < 1 */
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  /** A shuffled copy. */
  shuffle<T>(items: readonly T[]): T[];
};

export function rng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r: Rng = {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
  return r;
}

/** Smooth 1D noise in [-1, 1]: a hand's slow drift, not jitter. */
export function noise1(seed: number) {
  const r = rng(seed);
  const points = Array.from({ length: 64 }, () => r.range(-1, 1));
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = points[((i % 64) + 64) % 64];
    const b = points[(((i + 1) % 64) + 64) % 64];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}
