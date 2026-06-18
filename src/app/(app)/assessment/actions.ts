"use server";

import { redirect } from "next/navigation";
import { getQuestion } from "@/lib/content";
import type { GradedItem } from "@/lib/scoring";
import { scoreByDomain, overallPct } from "@/lib/scoring";
import { isCorrect } from "@/lib/grading";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export type AssessmentAnswer = {
  questionId: string;
  selected: string[];
  atMs?: number;
};

/**
 * Deferred grading: the client never sees answer keys. We re-load each question
 * server-side, grade it, persist a run + one Answer row per question, then send
 * the user to the result page.
 */
export async function submitAssessment(answers: AssessmentAnswer[]): Promise<void> {
  const user = await requireUser();

  const graded: GradedItem[] = [];
  const answerRows: {
    userId: string;
    questionId: string;
    context: string;
    domainId: string;
    concepts: string[];
    selected: string[];
    correct: boolean;
    atMs: number;
  }[] = [];

  for (const a of answers) {
    const q = getQuestion(a.questionId);
    if (!q) continue; // skip unknown/stale ids
    const selected = a.selected ?? [];
    const correct = isCorrect(q.correct, selected);
    graded.push({ domainId: q.domainId, correct });
    answerRows.push({
      userId: user.id,
      questionId: q.id,
      context: "assessment",
      domainId: q.domainId,
      concepts: q.concepts,
      selected,
      correct,
      atMs: Math.max(0, Math.round(a.atMs ?? 0)),
    });
  }

  const perDomain = scoreByDomain(graded);
  const overall = overallPct(graded);

  const run = await prisma.assessmentRun.create({
    data: {
      userId: user.id,
      overallPct: overall,
      perDomain: perDomain as unknown as object,
    },
  });

  if (answerRows.length > 0) {
    await prisma.answer.createMany({
      data: answerRows.map((row) => ({ ...row, refId: run.id })),
    });
  }

  redirect("/assessment/result");
}
