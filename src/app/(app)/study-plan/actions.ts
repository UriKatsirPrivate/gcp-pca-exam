"use server";

import { revalidatePath } from "next/cache";
import { DOMAINS } from "@/lib/content";
import type { DomainId } from "@/lib/content/schema";
import { prisma } from "@/lib/prisma";
import { getUserProgress } from "@/lib/progress";
import { requireUser } from "@/lib/session";
import { generateMilestones } from "@/lib/study-plan";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export async function generatePlan(formData: FormData): Promise<void> {
  const user = await requireUser();

  const weeks = clamp(Number(formData.get("weeks")) || 6, 1, 16);
  const hoursPerWeek = clamp(Number(formData.get("hoursPerWeek")) || 6, 1, 40);

  const progress = await getUserProgress(user.id);
  const assessment = progress.latestAssessment;

  // Prefer the diagnostic assessment per-domain pct; fall back to current mastery.
  const perDomainPct = {} as Record<DomainId, number>;
  for (const d of DOMAINS) {
    perDomainPct[d.id] =
      assessment?.perDomain[d.id]?.pct ?? progress.perDomain[d.id].masteryPct;
  }

  const milestones = generateMilestones(perDomainPct, { weeks, hoursPerWeek });

  // Single active plan per user.
  await prisma.studyPlan.updateMany({
    where: { userId: user.id, active: true },
    data: { active: false },
  });

  await prisma.studyPlan.create({
    data: {
      userId: user.id,
      active: true,
      weeks,
      hoursPerWeek,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      milestones: milestones as any,
    },
  });

  revalidatePath("/study-plan");
}
