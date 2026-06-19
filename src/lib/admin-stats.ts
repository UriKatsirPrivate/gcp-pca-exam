import "server-only";
import { prisma } from "@/lib/prisma";
import { getAllModules } from "@/lib/content";
import { DOMAINS, DOMAIN_BY_ID } from "@/lib/content/domains";
import { bootstrapAdminEmails, normalizeEmail } from "@/lib/access";
import type { DomainId } from "@/lib/content/schema";

// The score at or above which an attempt counts as a "pass" — mirrors the
// "proficient" threshold in scoring.ts and the exam-unlock mastery bar.
const PASS_PCT = 70;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DomainQuizStat {
  domainId: DomainId;
  shortTitle: string;
  avgScore: number | null;
  attempts: number;
}

export interface AdminStats {
  // Users
  signedInUsers: number; // have a User row (signed in at least once)
  allowedUsers: number; // allowlist ∪ bootstrap admins (can sign in)
  activeUsers7d: number;
  activeUsers30d: number;
  examUnlockedOverrides: number; // User.examUnlocked === true

  // Module progress (cumulative across all signed-in users)
  totalModules: number;
  avgModuleCompletionPct: number; // mean per-user completion, 0..100
  modulesDoneCount: number;
  modulesInProgressCount: number;
  modulesNotStartedCount: number; // signedInUsers * totalModules - done - in-progress
  usersWithProgress: number; // touched ≥1 module
  usersCompletedAll: number;

  // Quizzes
  quizAttempts: number;
  avgQuizScore: number | null;
  quizByDomain: DomainQuizStat[];

  // Diagnostic assessments
  assessmentsTaken: number;
  avgAssessmentScore: number | null;

  // Full-length exams
  examRunsTotal: number;
  examRunsSubmitted: number;
  examRunsInProgress: number;
  avgExamScore: number | null;
  examPassed: number;
  examPassRate: number | null; // % of submitted runs scoring ≥ PASS_PCT
}

/**
 * Distinct users with any activity since `since`. Unions the user-stamped
 * timestamps across every activity table; volume is small (a focused
 * allowlist), so fetching the recent rows and deduping in memory is cheaper
 * and simpler than five separate distinct() round-trips per window.
 */
async function activeUserCounts(now: number): Promise<{ d7: number; d30: number }> {
  const since30 = new Date(now - 30 * DAY_MS);
  const since7Ms = now - 7 * DAY_MS;

  const [answers, quizzes, modules, assessments, exams] = await Promise.all([
    prisma.answer.findMany({ where: { createdAt: { gte: since30 } }, select: { userId: true, createdAt: true } }),
    prisma.quizAttempt.findMany({ where: { createdAt: { gte: since30 } }, select: { userId: true, createdAt: true } }),
    prisma.moduleProgress.findMany({ where: { updatedAt: { gte: since30 } }, select: { userId: true, updatedAt: true } }),
    prisma.assessmentRun.findMany({ where: { takenAt: { gte: since30 } }, select: { userId: true, takenAt: true } }),
    prisma.examRun.findMany({ where: { startedAt: { gte: since30 } }, select: { userId: true, startedAt: true } }),
  ]);

  // userId -> most recent activity (ms)
  const latest = new Map<string, number>();
  const bump = (userId: string, at: Date) => {
    const t = at.getTime();
    const prev = latest.get(userId);
    if (prev === undefined || t > prev) latest.set(userId, t);
  };
  for (const r of answers) bump(r.userId, r.createdAt);
  for (const r of quizzes) bump(r.userId, r.createdAt);
  for (const r of modules) bump(r.userId, r.updatedAt);
  for (const r of assessments) bump(r.userId, r.takenAt);
  for (const r of exams) bump(r.userId, r.startedAt);

  let d7 = 0;
  for (const t of latest.values()) if (t >= since7Ms) d7++;
  return { d7, d30: latest.size };
}

export async function getAdminStats(): Promise<AdminStats> {
  const now = Date.now();
  const totalModules = getAllModules().length;

  const [
    signedInUsers,
    examUnlockedOverrides,
    allowedRows,
    active,
    moduleStatusGroups,
    doneByUser,
    quizAgg,
    quizByDomainGroups,
    assessmentAgg,
    examStatusGroups,
    examScoreAgg,
    examPassed,
    usersWithProgressRows,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { examUnlocked: true } }),
    prisma.allowedUser.findMany({ select: { email: true } }),
    activeUserCounts(now),
    prisma.moduleProgress.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.moduleProgress.groupBy({
      by: ["userId"],
      where: { status: "done" },
      _count: { _all: true },
    }),
    prisma.quizAttempt.aggregate({ _count: { _all: true }, _avg: { scorePct: true } }),
    prisma.quizAttempt.groupBy({
      by: ["domainId"],
      _count: { _all: true },
      _avg: { scorePct: true },
    }),
    prisma.assessmentRun.aggregate({ _count: { _all: true }, _avg: { overallPct: true } }),
    prisma.examRun.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.examRun.aggregate({
      where: { scorePct: { not: null } },
      _count: { _all: true },
      _avg: { scorePct: true },
    }),
    prisma.examRun.count({ where: { status: "submitted", scorePct: { gte: PASS_PCT } } }),
    prisma.moduleProgress.groupBy({ by: ["userId"] }).then((rows) => rows.length),
  ]);

  // Allowed = allowlist emails ∪ bootstrap admins (who can sign in at all).
  const allowedEmails = new Set<string>(allowedRows.map((r) => normalizeEmail(r.email)));
  for (const e of bootstrapAdminEmails()) allowedEmails.add(normalizeEmail(e));
  allowedEmails.delete("");

  // Module status tallies.
  const statusCount = (s: string) =>
    moduleStatusGroups.find((g) => g.status === s)?._count._all ?? 0;
  const modulesDoneCount = statusCount("done");
  const modulesInProgressCount = statusCount("in-progress");
  const modulesNotStartedCount = Math.max(
    0,
    signedInUsers * totalModules - modulesDoneCount - modulesInProgressCount,
  );

  // Mean per-user completion: every signed-in user counts (those with no
  // progress contribute 0), so divide total "done" by the full user×module grid.
  const avgModuleCompletionPct =
    signedInUsers > 0 && totalModules > 0
      ? Math.round((modulesDoneCount / (signedInUsers * totalModules)) * 100)
      : 0;
  const usersCompletedAll =
    totalModules > 0
      ? doneByUser.filter((u) => u._count._all >= totalModules).length
      : 0;

  const quizByDomain: DomainQuizStat[] = DOMAINS.map((d) => {
    const g = quizByDomainGroups.find((x) => x.domainId === d.id);
    return {
      domainId: d.id,
      shortTitle: DOMAIN_BY_ID[d.id]?.shortTitle ?? d.id,
      avgScore: g?._avg.scorePct != null ? Math.round(g._avg.scorePct) : null,
      attempts: g?._count._all ?? 0,
    };
  });

  const examStatus = (s: string) =>
    examStatusGroups.find((g) => g.status === s)?._count._all ?? 0;
  const examRunsTotal = examStatusGroups.reduce((s, g) => s + g._count._all, 0);
  const examRunsSubmitted = examStatus("submitted");

  const round = (n: number | null | undefined) =>
    n == null ? null : Math.round(n);

  return {
    signedInUsers,
    allowedUsers: allowedEmails.size,
    activeUsers7d: active.d7,
    activeUsers30d: active.d30,
    examUnlockedOverrides,

    totalModules,
    avgModuleCompletionPct,
    modulesDoneCount,
    modulesInProgressCount,
    modulesNotStartedCount,
    usersWithProgress: usersWithProgressRows,
    usersCompletedAll,

    quizAttempts: quizAgg._count._all,
    avgQuizScore: round(quizAgg._avg.scorePct),
    quizByDomain,

    assessmentsTaken: assessmentAgg._count._all,
    avgAssessmentScore: round(assessmentAgg._avg.overallPct),

    examRunsTotal,
    examRunsSubmitted,
    examRunsInProgress: examStatus("in-progress"),
    avgExamScore: round(examScoreAgg._avg.scorePct),
    examPassed,
    examPassRate:
      examRunsSubmitted > 0 ? Math.round((examPassed / examRunsSubmitted) * 100) : null,
  };
}
