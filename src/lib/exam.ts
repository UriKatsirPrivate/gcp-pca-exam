import "server-only";
import { blueprintQuotas, getAllQuestions } from "@/lib/content";
import type { CaseStudyId, Question } from "@/lib/content/schema";

export const EXAM_QUESTION_COUNT = 55;
export const EXAM_DURATION_SEC = 7200; // 2 hours
export const EXAM_CASE_STUDIES = 2;

// Target share of the exam tied to the chosen case studies (real PCA is ~20-30%).
const CASE_TIED_TARGET = 14; // aim ~12-16 across the 2 chosen studies

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Round-robin across difficulty 1/2/3 so picks from a pool stay mixed. */
function interleaveByDifficulty(qs: Question[]): Question[] {
  const buckets: Record<number, Question[]> = { 1: [], 2: [], 3: [] };
  for (const q of qs) (buckets[q.difficulty] ?? (buckets[q.difficulty] = [])).push(q);
  const out: Question[] = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const d of [1, 2, 3]) {
      const b = buckets[d];
      if (b?.length) {
        out.push(b.shift()!);
        progressed = true;
      }
    }
  }
  return out;
}

/**
 * Order a pool for selection, best-first:
 *   1. held-out exam-only items the candidate has never answered
 *   2. any other unseen item
 *   3. items already answered somewhere (quiz, practice, a prior exam)
 * each group shuffled then difficulty-interleaved so the picks taken off the
 * front are fresh and difficulty-varied.
 *
 * Tier 1 is what makes this a simulation rather than a review session: without a
 * holdout, most of a candidate's first form is items they met during study.
 */
function orderPool(pool: Question[], seen: Set<string>): Question[] {
  const tier = (q: Question) => (seen.has(q.id) ? 2 : q.examOnly ? 0 : 1);
  return [0, 1, 2].flatMap((t) =>
    interleaveByDifficulty(shuffle(pool.filter((q) => tier(q) === t))),
  );
}

/**
 * Build a single full-length simulation exam: pick 2 case studies that each have
 * at least 2 associated questions, then select ~55 questions balanced to domain
 * weights while guaranteeing a healthy block of case-tied questions.
 */
export function generateExam(
  { seenIds }: { seenIds?: Set<string> } = {},
): {
  questionIds: string[];
  caseStudyIds: CaseStudyId[];
} {
  const seen = seenIds ?? new Set<string>();
  const all = getAllQuestions();

  // --- 1. Group questions by case study and find eligible studies. ---------
  const byCaseStudy = new Map<CaseStudyId, Question[]>();
  for (const q of all) {
    if (!q.caseStudyId) continue;
    const arr = byCaseStudy.get(q.caseStudyId) ?? [];
    arr.push(q);
    byCaseStudy.set(q.caseStudyId, arr);
  }

  const eligible = [...byCaseStudy.entries()]
    .filter(([, qs]) => qs.length >= 2)
    .map(([id]) => id);

  const chosenCaseStudies = shuffle(eligible).slice(0, EXAM_CASE_STUDIES);
  const chosenSet = new Set<CaseStudyId>(chosenCaseStudies);

  // Track everything we've committed so far to avoid duplicates.
  const picked = new Set<string>();
  const selected: Question[] = [];

  function take(q: Question) {
    if (picked.has(q.id)) return;
    picked.add(q.id);
    selected.push(q);
  }

  // --- 2. Pull case-tied questions for the 2 chosen studies first. ---------
  // Unseen-first, difficulty-interleaved.
  const caseTiedPool = orderPool(
    chosenCaseStudies.flatMap((id) => byCaseStudy.get(id) ?? []),
    seen,
  );
  for (const q of caseTiedPool) {
    if (selected.length >= CASE_TIED_TARGET) break;
    take(q);
  }

  // --- 3. Fill remaining slots, balanced to domain weights. ----------------
  // Non-case-tied questions, grouped by domain (these form the bulk).
  const freePoolByDomain = new Map<string, Question[]>();
  for (const q of all) {
    if (picked.has(q.id)) continue;
    if (q.caseStudyId && chosenSet.has(q.caseStudyId)) continue; // keep extra case-tied as backfill only
    const arr = freePoolByDomain.get(q.domainId) ?? [];
    arr.push(q);
    freePoolByDomain.set(q.domainId, arr);
  }
  for (const [k, v] of freePoolByDomain) freePoolByDomain.set(k, orderPool(v, seen));

  // Per-domain quota from the blueprint weights; sums exactly to the total.
  const quotas = blueprintQuotas(EXAM_QUESTION_COUNT);

  // Subtract case-tied questions already selected from their domain's quota.
  const selectedByDomain = new Map<string, number>();
  for (const q of selected) {
    selectedByDomain.set(q.domainId, (selectedByDomain.get(q.domainId) ?? 0) + 1);
  }

  for (const { domainId, quota } of quotas) {
    const already = selectedByDomain.get(domainId) ?? 0;
    let need = Math.max(0, quota - already);
    const pool = freePoolByDomain.get(domainId) ?? [];
    while (need > 0 && pool.length > 0) {
      take(pool.shift()!);
      need--;
    }
  }

  // --- 4. Backfill to reach the target count from any remaining pool. ------
  if (selected.length < EXAM_QUESTION_COUNT) {
    const leftovers = orderPool(
      all.filter((q) => !picked.has(q.id)),
      seen,
    );
    for (const q of leftovers) {
      if (selected.length >= EXAM_QUESTION_COUNT) break;
      take(q);
    }
  }

  // --- 5. Trim if we overshot (case-tied target + rounding can exceed). ----
  // Trim from the tail of non-case-tied picks so the case-study block stays intact.
  let finalSet = selected;
  if (finalSet.length > EXAM_QUESTION_COUNT) {
    const caseTied = finalSet.filter(
      (q) => q.caseStudyId && chosenSet.has(q.caseStudyId),
    );
    const rest = finalSet.filter(
      (q) => !(q.caseStudyId && chosenSet.has(q.caseStudyId)),
    );
    const keepRest = rest.slice(0, Math.max(0, EXAM_QUESTION_COUNT - caseTied.length));
    finalSet = [...caseTied, ...keepRest];
  }

  return {
    questionIds: shuffle(finalSet).map((q) => q.id),
    caseStudyIds: chosenCaseStudies,
  };
}
