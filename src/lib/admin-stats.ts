import "server-only";
import { prisma } from "@/lib/prisma";
import { getAllModules, getQuestion } from "@/lib/content";
import { DOMAINS, DOMAIN_BY_ID } from "@/lib/content/domains";
import { bootstrapAdminEmails, normalizeEmail } from "@/lib/access";
import { countryName, flagEmoji } from "@/lib/geo";
import type { DomainId } from "@/lib/content/schema";

// The score at or above which an attempt counts as a "pass" — mirrors the
// "proficient" threshold in scoring.ts and the exam-unlock mastery bar.
const PASS_PCT = 70;
const DAY_MS = 24 * 60 * 60 * 1000;

// Question-QA thresholds: only rank questions with enough attempts to be
// meaningful, and flag a likely mis-key when almost everyone gets it wrong.
const QA_MIN_ATTEMPTS = 3;
const QA_TOP_N = 10;
const MISKEY_RATE_PCT = 20;
const MISKEY_MIN_ATTEMPTS = 5;

export interface DomainQuizStat {
  domainId: DomainId;
  shortTitle: string;
  avgScore: number | null;
  attempts: number;
}

export interface HardQuestionStat {
  questionId: string;
  prompt: string;
  shortTitle: string; // domain short title
  attempts: number;
  correctPct: number;
  suspectMiskey: boolean; // very low correct rate with enough attempts
}

export interface GeoCountryStat {
  country: string; // ISO-3166 alpha-2
  countryName: string;
  flag: string; // emoji
  users: number;
}

export interface AdminStats {
  // Users
  signedInUsers: number; // have a User row (signed in at least once)
  allowedUsers: number; // allowlist ∪ bootstrap admins (can sign in)
  activeUsers7d: number;
  activeUsers30d: number;
  examUnlockedOverrides: number; // User.examUnlocked === true

  // Geo (browser-reported, cumulative by country)
  geoByCountry: GeoCountryStat[]; // users with a known country, desc by count
  usersWithGeo: number;
  usersUnknownGeo: number; // signed-in users not yet geolocated
  countriesCount: number;

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

  // Content QA: questions answered correctly least often (possible mis-keys).
  hardestQuestions: HardQuestionStat[];
}

/**
 * Hardest questions across every answer context: group by question + correctness,
 * fold into attempts/correct, keep those with enough attempts, and rank by lowest
 * correct rate. Joins content for the prompt/domain; stale ids are dropped.
 */
async function getHardestQuestions(): Promise<HardQuestionStat[]> {
  const groups = await prisma.answer.groupBy({
    by: ["questionId", "correct"],
    _count: { _all: true },
  });

  const tally = new Map<string, { attempts: number; correct: number }>();
  for (const g of groups) {
    const t = tally.get(g.questionId) ?? { attempts: 0, correct: 0 };
    t.attempts += g._count._all;
    if (g.correct) t.correct += g._count._all;
    tally.set(g.questionId, t);
  }

  const rows: HardQuestionStat[] = [];
  for (const [questionId, { attempts, correct }] of tally) {
    if (attempts < QA_MIN_ATTEMPTS) continue;
    const q = getQuestion(questionId);
    if (!q) continue;
    const correctPct = Math.round((correct / attempts) * 100);
    rows.push({
      questionId,
      prompt: q.prompt,
      shortTitle: DOMAIN_BY_ID[q.domainId]?.shortTitle ?? q.domainId,
      attempts,
      correctPct,
      suspectMiskey:
        correctPct < MISKEY_RATE_PCT && attempts >= MISKEY_MIN_ATTEMPTS,
    });
  }

  return rows
    .sort((a, b) => a.correctPct - b.correctPct || b.attempts - a.attempts)
    .slice(0, QA_TOP_N);
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
    hardestQuestions,
    geoGroups,
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
    getHardestQuestions(),
    prisma.user.groupBy({
      by: ["country"],
      where: { country: { not: null } },
      _count: { _all: true },
    }),
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

  // Geo: each row's country is non-null (filtered in the query). Map to display
  // name + flag and rank by headcount.
  const geoByCountry: GeoCountryStat[] = geoGroups
    .map((g) => {
      const iso = (g.country ?? "").toUpperCase();
      return {
        country: iso,
        countryName: countryName(iso),
        flag: flagEmoji(iso),
        users: g._count._all,
      };
    })
    .sort((a, b) => b.users - a.users || a.countryName.localeCompare(b.countryName));
  const usersWithGeo = geoByCountry.reduce((s, g) => s + g.users, 0);

  return {
    signedInUsers,
    allowedUsers: allowedEmails.size,
    activeUsers7d: active.d7,
    activeUsers30d: active.d30,
    examUnlockedOverrides,

    geoByCountry,
    usersWithGeo,
    usersUnknownGeo: Math.max(0, signedInUsers - usersWithGeo),
    countriesCount: geoByCountry.length,

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

    hardestQuestions,
  };
}
