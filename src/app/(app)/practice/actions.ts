"use server";

import { getQuestion } from "@/lib/content";
import { isCorrect } from "@/lib/grading";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export type PracticeAnswer = { questionId: string; selected: string[] };
export type PracticeResult = { correct: number; total: number; scorePct: number };

/**
 * Grade a drill set server-side and persist one Answer row per question with
 * context "practice", so drilled answers feed feedback + analytics like any
 * other context. Low-stakes: no run record, no module/exam side effects.
 */
export async function submitPractice(
  answers: PracticeAnswer[],
): Promise<PracticeResult> {
  const user = await requireUser();

  const rows: {
    userId: string;
    questionId: string;
    context: string;
    domainId: string;
    concepts: string[];
    selected: string[];
    correct: boolean;
    atMs: number;
  }[] = [];
  let correctCount = 0;

  for (const a of answers) {
    const q = getQuestion(a.questionId);
    if (!q) continue;
    const selected = a.selected ?? [];
    const correct = isCorrect(q.correct, selected);
    if (correct) correctCount++;
    rows.push({
      userId: user.id,
      questionId: q.id,
      context: "practice",
      domainId: q.domainId,
      concepts: q.concepts,
      selected,
      correct,
      atMs: 0,
    });
  }

  const total = rows.length;
  if (total > 0) await prisma.answer.createMany({ data: rows });

  return {
    correct: correctCount,
    total,
    scorePct: total > 0 ? Math.round((correctCount / total) * 100) : 0,
  };
}
