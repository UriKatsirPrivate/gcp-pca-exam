"use server";

import { getQuestion } from "@/lib/content";
import { isCorrect } from "@/lib/grading";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export type PoolAnswer = { questionId: string; selected: string[] };

/**
 * Persist a single held-out (examOnly) answer the moment it's checked, with
 * context "examOnly" — so it counts toward "seen" for future exam draws right
 * away rather than only once the whole set is finished. A candidate who checks
 * a few questions and leaves keeps that progress instead of losing it because
 * they never hit "Finish". Low-stakes: no run record, one row per question.
 */
export async function submitPoolAnswer(answer: PoolAnswer): Promise<void> {
  const user = await requireUser();

  const q = getQuestion(answer.questionId);
  if (!q) return;
  const selected = answer.selected ?? [];

  await prisma.answer.create({
    data: {
      userId: user.id,
      questionId: q.id,
      context: "examOnly",
      domainId: q.domainId,
      concepts: q.concepts,
      selected,
      correct: isCorrect(q.correct, selected),
      atMs: 0,
    },
  });
}
