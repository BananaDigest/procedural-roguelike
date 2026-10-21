/**
 * Mulberry32 — a tiny, fast, seedable PRNG.
 *
 * Golden rule of the lab: NEVER call Math.random() in generation code.
 * Route every random decision through one of these so a seed fully
 * determines a floor. Same seed in → same dungeon out → reproducible bugs.
 */
export class Mulberry32 {
  private state: number;

  constructor(seed: number) {
    // Force to an unsigned 32-bit integer.
    this.state = seed >>> 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Random element of a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /**
   * Weighted pick: higher `weight` → picked more often.
   * e.g. weighted([{ value: "bread", weight: 30 }, { value: "cheese", weight: 10 }])
   */
  weighted<T>(items: readonly { value: T; weight: number }[]): T {
    let total = 0;
    for (const it of items) total += it.weight;
    let roll = this.next() * total;
    for (const it of items) {
      roll -= it.weight;
      if (roll < 0) return it.value;
    }
    return items[items.length - 1].value;
  }

  /** Fisher–Yates shuffle, in place. Returns the same array. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** Build a numeric seed from an arbitrary string (e.g. a shared seed code). */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Title-screen seed box → numeric seed.
 *   "8819273" → 8819273 (digits are used as-is, so the HUD shows what you typed)
 *   "cheese"  → hash of the text
 *   ""        → null (caller picks a random seed with `randomSeed()`)
 */
export function seedFromInput(input: string): number | null {
  const s = input.trim();
  if (s === "") return null;
  if (/^\d+$/.test(s)) return Number(s) % 4294967296;
  return hashSeed(s);
}

/**
 * A fresh random seed for a new run. This is the ONLY place Math.random() is
 * allowed: it picks *which* world, never *how* the world is built.
 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 1e9);
}

/** Derived seed of one room: baseSeed + level·100 + roomIndex. */
export function roomSeed(baseSeed: number, level: number, roomIndex: number): number {
  return (baseSeed + level * 100 + roomIndex) >>> 0;
}

/** Derived seed for level-wide decisions (room count). Index 99 never clashes with a room. */
export function levelSeed(baseSeed: number, level: number): number {
  return roomSeed(baseSeed, level, 99);
}
