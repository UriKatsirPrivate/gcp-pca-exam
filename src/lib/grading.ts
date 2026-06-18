// Pure answer-grading helpers shared by the assessment, quizzes, and full exam.

/** A selection is correct iff it matches the correct set exactly (order-independent). */
export function isCorrect(correct: string[], selected: string[]): boolean {
  if (correct.length !== selected.length) return false;
  const s = new Set(selected);
  return correct.every((c) => s.has(c));
}

/** Partial-credit ratio (for analytics only; the exam scores binary). */
export function partialCredit(correct: string[], selected: string[]): number {
  if (correct.length === 0) return 0;
  const correctSet = new Set(correct);
  let hits = 0;
  let wrong = 0;
  for (const sel of selected) {
    if (correctSet.has(sel)) hits++;
    else wrong++;
  }
  return Math.max(0, (hits - wrong) / correct.length);
}
