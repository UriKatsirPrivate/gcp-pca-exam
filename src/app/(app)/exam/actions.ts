"use server";

import { redirect } from "next/navigation";
import { getQuestion } from "@/lib/content";
import { isCorrect } from "@/lib/grading";
import { prisma } from "@/lib/prisma";
import { getUserProgress } from "@/lib/progress";
import { requireUser } from "@/lib/session";
import { scoreByDomain, overallPct, type GradedItem } from "@/lib/scoring";
import { EXAM_DURATION_SEC, generateExam } from "@/lib/exam";

/**
 * Start a new full-length simulation exam. Requires the exam to be unlocked,
 * generates a balanced 55-question set + 2 case studies, persists the run, and
 * sends the user into the runner (rendered by page.tsx when ?run=<id> is set).
 */
export async function startExam(): Promise<void> {
  const user = await requireUser();

  const progress = await getUserProgress(user.id);
  if (!progress.examUnlocked) redirect("/exam");

  const { questionIds, caseStudyIds } = generateExam();

  const run = await prisma.examRun.create({
    data: {
      userId: user.id,
      status: "in-progress",
      durationSec: EXAM_DURATION_SEC,
      questionIds,
      caseStudyIds,
    },
  });

  redirect(`/exam?run=${run.id}`);
}

export type ExamAnswer = {
  questionId: string;
  selected: string[];
  atMs?: number;
};

/**
 * Grade and finalize an exam server-side. The client never sees answer keys; we
 * re-load each question from the run's frozen questionIds, grade it (unanswered =
 * incorrect), persist the score + per-domain breakdown + one Answer row each,
 * then redirect to the scored report.
 */
export async function submitExam(
  examId: string,
  answers: ExamAnswer[],
): Promise<void> {
  const user = await requireUser();

  const run = await prisma.examRun.findUnique({ where: { id: examId } });
  if (!run || run.userId !== user.id) redirect("/exam");
  // Already finalized — just show the existing report.
  if (run.status !== "in-progress") redirect(`/exam/result/${examId}`);

  const selectedById = new Map<string, string[]>();
  const atMsById = new Map<string, number>();
  for (const a of answers) {
    selectedById.set(a.questionId, a.selected ?? []);
    if (typeof a.atMs === "number") atMsById.set(a.questionId, a.atMs);
  }

  const graded: GradedItem[] = [];
  const answerRows: {
    userId: string;
    questionId: string;
    context: string;
    refId: string;
    domainId: string;
    concepts: string[];
    selected: string[];
    correct: boolean;
    atMs: number;
  }[] = [];

  // Iterate the run's frozen question set so unanswered questions count as wrong.
  for (const qid of run.questionIds) {
    const q = getQuestion(qid);
    if (!q) continue;
    const selected = selectedById.get(qid) ?? [];
    const correct = isCorrect(q.correct, selected);
    graded.push({ domainId: q.domainId, correct });
    answerRows.push({
      userId: user.id,
      questionId: q.id,
      context: "exam",
      refId: examId,
      domainId: q.domainId,
      concepts: q.concepts,
      selected,
      correct,
      atMs: Math.max(0, Math.round(atMsById.get(qid) ?? 0)),
    });
  }

  const perDomain = scoreByDomain(graded);
  const overall = overallPct(graded);

  await prisma.examRun.update({
    where: { id: examId },
    data: {
      status: "submitted",
      finishedAt: new Date(),
      scorePct: overall,
      perDomain: perDomain as unknown as object,
    },
  });

  if (answerRows.length > 0) {
    await prisma.answer.createMany({ data: answerRows });
  }

  redirect(`/exam/result/${examId}`);
}
