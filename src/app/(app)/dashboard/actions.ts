"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/**
 * Wipe all of the current user's learning progress, keeping their account
 * (User/Account/Session) intact. Deletes every per-user record in one
 * transaction so the dashboard returns to a clean slate.
 */
export async function resetProgress(): Promise<void> {
  const user = await requireUser();
  const where = { where: { userId: user.id } };

  await prisma.$transaction([
    prisma.answer.deleteMany(where),
    prisma.quizAttempt.deleteMany(where),
    prisma.assessmentRun.deleteMany(where),
    prisma.studyPlan.deleteMany(where),
    prisma.moduleProgress.deleteMany(where),
    prisma.examRun.deleteMany(where),
    prisma.feedbackInsight.deleteMany(where),
  ]);

  revalidatePath("/dashboard");
  revalidatePath("/learn");
  revalidatePath("/study-plan");
  revalidatePath("/assessment");
}
