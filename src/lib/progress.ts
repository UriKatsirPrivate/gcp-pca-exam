import "server-only";
import { prisma } from "@/lib/prisma";
import { getAllModules, getModules } from "@/lib/content";
import { DOMAINS } from "@/lib/content/domains";
import { proficiencyFromPct, type PerDomainScore } from "@/lib/scoring";
import type { DomainId, Proficiency } from "@/lib/content/schema";

export interface DomainProgress {
  domainId: DomainId;
  modulesTotal: number;
  modulesDone: number;
  quizAvg: number | null;
  assessmentPct: number | null;
  masteryPct: number;
  proficiency: Proficiency;
}

export interface UserProgress {
  totalModules: number;
  completedModules: number;
  inProgressModules: number;
  modulePct: number;
  moduleStatusById: Record<string, "todo" | "in-progress" | "done">;
  latestAssessment:
    | { takenAt: Date; overallPct: number; perDomain: PerDomainScore }
    | null;
  quizAttempts: number;
  avgQuizPct: number | null;
  perDomain: Record<DomainId, DomainProgress>;
  overallMasteryPct: number;
  examUnlocked: boolean;
  hasStudyPlan: boolean;
}

const EXAM_UNLOCK_MODULE_RATIO = 0.8;
const EXAM_UNLOCK_MASTERY = 70;

export async function getUserProgress(userId: string): Promise<UserProgress> {
  const [moduleRows, quizRows, latest, plan] = await Promise.all([
    prisma.moduleProgress.findMany({ where: { userId } }),
    prisma.quizAttempt.findMany({ where: { userId } }),
    prisma.assessmentRun.findFirst({ where: { userId }, orderBy: { takenAt: "desc" } }),
    prisma.studyPlan.findFirst({ where: { userId, active: true } }),
  ]);

  const moduleStatusById: Record<string, "todo" | "in-progress" | "done"> = {};
  for (const r of moduleRows) {
    moduleStatusById[r.moduleId] = r.status as "todo" | "in-progress" | "done";
  }

  const allModules = getAllModules();
  const totalModules = allModules.length;
  const completedModules = allModules.filter(
    (m) => moduleStatusById[m.id] === "done",
  ).length;
  const inProgressModules = allModules.filter(
    (m) => moduleStatusById[m.id] === "in-progress",
  ).length;
  const modulePct = totalModules ? Math.round((completedModules / totalModules) * 100) : 0;

  // Quiz averages overall and per domain.
  const quizByDomain = new Map<string, number[]>();
  for (const q of quizRows) {
    const arr = quizByDomain.get(q.domainId) ?? [];
    arr.push(q.scorePct);
    quizByDomain.set(q.domainId, arr);
  }
  const avgQuizPct =
    quizRows.length > 0
      ? Math.round(quizRows.reduce((s, q) => s + q.scorePct, 0) / quizRows.length)
      : null;

  const assessmentPerDomain =
    (latest?.perDomain as unknown as PerDomainScore | undefined) ?? undefined;

  const perDomain = {} as Record<DomainId, DomainProgress>;
  for (const d of DOMAINS) {
    const mods = getModules(d.id);
    const modsDone = mods.filter((m) => moduleStatusById[m.id] === "done").length;
    const quizScores = quizByDomain.get(d.id) ?? [];
    const quizAvg =
      quizScores.length > 0
        ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length)
        : null;
    const assessmentPct = assessmentPerDomain?.[d.id]?.pct ?? null;
    const modPct = mods.length ? (modsDone / mods.length) * 100 : 0;

    // Mastery blends module completion with the best available signal of skill.
    const skillSignal = quizAvg ?? assessmentPct ?? 0;
    const masteryPct = Math.round(0.5 * modPct + 0.5 * skillSignal);

    perDomain[d.id] = {
      domainId: d.id,
      modulesTotal: mods.length,
      modulesDone: modsDone,
      quizAvg,
      assessmentPct,
      masteryPct,
      proficiency: proficiencyFromPct(masteryPct),
    };
  }

  const overallMasteryPct = Math.round(
    DOMAINS.reduce((s, d) => s + perDomain[d.id].masteryPct, 0) / DOMAINS.length,
  );

  const examUnlocked =
    completedModules / Math.max(1, totalModules) >= EXAM_UNLOCK_MODULE_RATIO ||
    overallMasteryPct >= EXAM_UNLOCK_MASTERY;

  return {
    totalModules,
    completedModules,
    inProgressModules,
    modulePct,
    moduleStatusById,
    latestAssessment: latest
      ? {
          takenAt: latest.takenAt,
          overallPct: latest.overallPct,
          perDomain: latest.perDomain as unknown as PerDomainScore,
        }
      : null,
    quizAttempts: quizRows.length,
    avgQuizPct,
    perDomain,
    overallMasteryPct,
    examUnlocked,
    hasStudyPlan: !!plan,
  };
}
