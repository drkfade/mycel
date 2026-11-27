/**
 * Deterministic seedable PRNG for reproducible fuzzing runs.
 */
export class Rand {
  private state: number;

  constructor(seed = 42) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 1;
  }

  /** Random float in [0, 1) */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Random integer in [min, max] (inclusive) */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Random boolean with given probability */
  bool(prob = 0.5): boolean {
    return this.next() < prob;
  }

  /** Pick random element from non-empty array */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("pick from empty array");
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Random subset of elements */
  sample<T>(arr: readonly T[], count: number): T[] {
    const copy = [...arr];
    const res: T[] = [];
    const n = Math.min(count, arr.length);
    for (let i = 0; i < n; i++) {
      const idx = this.int(0, copy.length - 1);
      res.push(copy[idx]);
      copy.splice(idx, 1);
    }
    return res;
  }

  /** Random 64-bit BigInt in [min, max] */
  bigint(min: bigint, max: bigint): bigint {
    if (min > max) throw new Error("min > max in bigint");
    const diff = max - min;
    if (diff === 0n) return min;
    const bits = diff.toString(2).length;
    let b = 0n;
    for (let i = 0; i < bits; i += 30) {
      b = (b << 30n) | BigInt(Math.floor(this.next() * (1 << 30)));
    }
    return min + (b % (diff + 1n));
  }

  /** Shuffles an array in place (Fisher-Yates) */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }
}
