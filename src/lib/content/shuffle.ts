/**
 * Deterministic seeded shuffle, used to randomize option order at render time
 *. Authored option order is a free answer — the
 * bank keys (a) or (b) far more often than chance — so nothing may render
 * `question.choices` in authored order.
 *
 * Seeded rather than random so the same attempt shows the same order twice:
 * the runner and the review screen derive the order from
 * `(attemptId, questionId)` instead of persisting it.
 */

/** xmur3: string -> 32-bit seed. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32: 32-bit seed -> uniform [0,1) PRNG. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates over a copy, driven by `seed`. Same seed => same order. */
export function seededShuffle<T>(arr: readonly T[], seed: string): T[] {
  const rand = mulberry32(xmur3(seed)());
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Order a question's choices for display. `seed` should identify the attempt
 * (exam/assessment attempt id, or the quiz/practice session key) so a candidate
 * re-taking an item sees a different arrangement, while the review screen for a
 * given attempt reproduces exactly what was on screen.
 */
export function choiceOrderSeed(questionId: string, seed?: string): string {
  return `${seed ?? "static"}::${questionId}`;
}
