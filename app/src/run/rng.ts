/**
 * Seeded random numbers for a run. Like Balatro's seeds, every random decision of a run follows from its seed: each
 * purpose ("shop", "blinds", ...) has its own stream, derived from the seed, the purpose and how often that purpose
 * has drawn before. Only the counters are stored, so a saved run continues exactly as it would have.
 */

/** xmur3: a 32 bit hash of a string, used to seed sfc32. */
function hash32(s: string): () => number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** sfc32 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string) {
    const h = hash32(seed);
    this.a = h();
    this.b = h();
    this.c = h();
    this.d = h();
    for (let i = 0; i < 12; i++) this.nextUint32();
  }

  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** 0 <= result < 1 */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** 0 <= result < n */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(list: readonly T[]): T {
    if (list.length === 0) throw new Error('pick from an empty list');
    return list[this.int(list.length)];
  }

  /** a weighted pick: weights[i] for list[i] */
  pickWeighted<T>(list: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < list.length; i++) {
      r -= weights[i];
      if (r < 0) return list[i];
    }
    return list[list.length - 1];
  }

  /** Fisher-Yates, in place */
  shuffle<T>(list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    return list;
  }
}

const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789';

/** A new random seed of 8 characters (like a Balatro seed). */
export function randomSeed(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += SEED_CHARS[Math.floor(random() * SEED_CHARS.length)];
  return s;
}

/** Normalizes a seed typed by the player. */
export function normalizeSeed(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

/** The random streams of a run: the stream for a purpose draws from seed + purpose + counter. */
export class RunRandom {
  constructor(
    readonly seed: string,
    readonly counters: Record<string, number>,
  ) {}

  /** a fresh generator for one decision (or one group of decisions) of the given purpose */
  stream(purpose: string): Rng {
    const n = this.counters[purpose] ?? 0;
    this.counters[purpose] = n + 1;
    return new Rng(`${this.seed}/${purpose}/${n}`);
  }
}
