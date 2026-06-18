"use server";

import { revalidatePath } from "next/cache";
import { getModule, getQuiz, getQuestions } from "@/lib/content";
import { isCorrect } from "@/lib/grading";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/**
 * Mark a module's progress. Used to flip a module to "in-progress" on first view
 * and as a fallback to mark "done". Idempotent via the userId+moduleId unique key.
 */
export async function markProgress(
  moduleId: string,
  status: "todo" | "in-progress" | "done",
): Promise<void> {
  const user = await requireUser();

  await prisma.moduleProgress.upsert({
    where: { userId_moduleId: { userId: user.id, moduleId } },
    update: { status },
    create: { userId: user.id, moduleId, status },
  });

  const m = getModule(moduleId);
  revalidatePath("/learn");
  if (m) revalidatePath(`/learn/${m.domainId}`);
  revalidatePath("/dashboard");
}

export type QuizSubmission = {
  quizId: string;
  moduleId: string;
  domainId: string;
  answers: { questionId: string; selected: string[] }[];
};

export type QuizResult = {
  correct: number;
  total: number;
  scorePct: number;
};

/**
 * Grade a module quiz SERVER-SIDE (never trust client-supplied correctness),
 * persist a QuizAttempt + one Answer row per question, and mark the module done.
 */
export async function submitQuiz(input: QuizSubmission): Promise<QuizResult> {
  const user = await requireUser();

  const quiz = getQuiz(input.quizId);
  if (!quiz || quiz.moduleId !== input.moduleId) {
    throw new Error("Unknown quiz");
  }

  // Authoritative question set comes from the quiz definition, not the client.
  const questions = getQuestions(quiz.questionIds);
  const selectedById = new Map(
    input.answers.map((a) => [a.questionId, a.selected ?? []]),
  );

  let correctCount = 0;
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

  for (const q of questions) {
    const selected = selectedById.get(q.id) ?? [];
    const correct = isCorrect(q.correct, selected);
    if (correct) correctCount++;
    answerRows.push({
      userId: user.id,
      questionId: q.id,
      context: "quiz",
      refId: input.quizId,
      domainId: q.domainId,
      concepts: q.concepts,
      selected,
      correct,
      atMs: 0,
    });
  }

  const total = questions.length;
  const scorePct = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  await prisma.quizAttempt.create({
    data: {
      userId: user.id,
      quizId: input.quizId,
      moduleId: input.moduleId,
      domainId: input.domainId,
      correct: correctCount,
      total,
      scorePct,
    },
  });

  if (answerRows.length > 0) {
    await prisma.answer.createMany({ data: answerRows });
  }

  await prisma.moduleProgress.upsert({
    where: { userId_moduleId: { userId: user.id, moduleId: input.moduleId } },
    update: { status: "done" },
    create: { userId: user.id, moduleId: input.moduleId, status: "done" },
  });

  revalidatePath("/learn");
  revalidatePath(`/learn/${input.domainId}`);
  revalidatePath(`/learn/${input.domainId}/${input.moduleId}`);
  revalidatePath("/dashboard");

  return { correct: correctCount, total, scorePct };
}
