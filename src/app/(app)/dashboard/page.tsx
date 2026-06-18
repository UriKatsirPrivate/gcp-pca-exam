import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Lock,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { DOMAINS } from "@/lib/content";
import type { Proficiency } from "@/lib/content/schema";
import { prisma } from "@/lib/prisma";
import { getUserProgress } from "@/lib/progress";
import { whatToFocusNext } from "@/lib/recommend";
import { requireUser } from "@/lib/session";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ProgressBar,
  Stat,
} from "@/components/ui";
import { DomainMasteryChart } from "@/components/charts/DomainMasteryChart";
import { ScoreTrendChart } from "@/components/charts/ScoreTrendChart";
import { FeedbackPanel } from "@/components/FeedbackPanel";

export const dynamic = "force-dynamic";

type Tone = "success" | "info" | "warning" | "danger";

const PROFICIENCY_TONE: Record<Proficiency, Tone> = {
  expert: "success",
  proficient: "info",
  developing: "warning",
  novice: "danger",
};

function masteryTone(pct: number): "brand" | "success" | "warning" | "danger" {
  if (pct >= 85) return "success";
  if (pct >= 70) return "brand";
  if (pct >= 50) return "warning";
  return "danger";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [progress, recentAttempts] = await Promise.all([
    getUserProgress(user.id),
    prisma.quizAttempt.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
  ]);

  const focus = whatToFocusNext(progress);
  const firstName = (user.name ?? "").trim().split(/\s+/)[0] || "there";

  const masteryData = DOMAINS.map((d) => {
    const dp = progress.perDomain[d.id];
    return {
      domain: d.shortTitle,
      mastery: dp?.masteryPct ?? 0,
      weight: d.weightPct,
    };
  });

  const trendData = recentAttempts.map((a) => ({
    label: a.createdAt.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    score: Math.round(a.scorePct),
  }));

  return (
    <div className="space-y-6">
      {/* Greeting --------------------------------------------------------- */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Welcome back, {firstName}</h1>
          <p className="mt-1 text-sm text-muted">
            Your progress toward the Google Cloud Professional Architect exam.
          </p>
        </div>
        <Badge tone={progress.examUnlocked ? "success" : "neutral"}>
          {progress.examUnlocked ? (
            <Trophy className="h-3.5 w-3.5" />
          ) : (
            <Lock className="h-3.5 w-3.5" />
          )}
          {progress.examUnlocked ? "Exam unlocked" : "Exam locked"}
        </Badge>
      </div>

      {/* Top stats -------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Overall mastery"
          value={`${progress.overallMasteryPct}%`}
          hint="across six domains"
        />
        <Stat
          label="Modules completed"
          value={`${progress.completedModules}/${progress.totalModules}`}
          hint={`${progress.modulePct}% complete`}
        />
        <Stat
          label="Quizzes taken"
          value={progress.quizAttempts}
          hint={
            progress.avgQuizPct != null
              ? `${progress.avgQuizPct}% avg score`
              : "no quizzes yet"
          }
        />
        <Stat
          label="Exam status"
          value={progress.examUnlocked ? "Unlocked" : "Locked"}
          hint={progress.examUnlocked ? "ready to simulate" : "keep studying"}
        />
      </div>

      {/* Diagnostic CTA --------------------------------------------------- */}
      {!progress.latestAssessment ? (
        <Card className="border-brand-600/40 bg-brand-50/40">
          <CardBody className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="text-brand-600">
                <ClipboardCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold">Start with the diagnostic</h3>
                <p className="mt-0.5 text-sm text-muted">
                  Take the diagnostic assessment to measure where you stand
                  across all six domains and unlock tailored recommendations.
                </p>
              </div>
            </div>
            <ButtonLink href="/assessment" className="shrink-0">
              Take diagnostic <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </CardBody>
        </Card>
      ) : null}

      {/* Mastery chart + focus next -------------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Domain mastery"
            subtitle="Estimated mastery per exam domain (0–100%)."
            icon={<Target className="h-5 w-5" />}
          />
          <CardBody>
            <DomainMasteryChart data={masteryData} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="What to focus next"
            subtitle="Ranked by weakness and exam weight."
            icon={<Sparkles className="h-5 w-5" />}
          />
          <CardBody>
            {focus.length === 0 ? (
              <EmptyState
                title="You're exam-ready"
                body="Every domain is in strong shape. Try a full exam simulation to pressure-test your knowledge."
                action={
                  <ButtonLink href="/exam" variant="success">
                    Start a simulation <ArrowRight className="h-4 w-4" />
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="space-y-4">
                {focus.map((item) => {
                  const href = item.nextModuleId
                    ? `/learn/${item.domainId}/${item.nextModuleId}`
                    : `/learn/${item.domainId}`;
                  return (
                    <li
                      key={item.domainId}
                      className="rounded-lg border border-line p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {item.domainTitle}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {item.reason}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold">
                          {item.masteryPct}%
                        </span>
                      </div>
                      <ProgressBar
                        value={item.masteryPct}
                        tone={masteryTone(item.masteryPct)}
                        className="mt-3"
                      />
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="truncate text-xs text-muted">
                          {item.nextModuleTitle
                            ? `Next: ${item.nextModuleTitle}`
                            : "Review this domain"}
                        </span>
                        <ButtonLink href={href} variant="secondary" size="sm">
                          {item.nextModuleTitle ? "Study" : "Open"}
                        </ButtonLink>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Per-domain progress --------------------------------------------- */}
      <Card>
        <CardHeader
          title="Progress by domain"
          subtitle="Mastery, proficiency, and module completion for each domain."
          icon={<BookOpen className="h-5 w-5" />}
        />
        <CardBody>
          <ul className="divide-y divide-line">
            {DOMAINS.map((d) => {
              const dp = progress.perDomain[d.id];
              const masteryPct = dp?.masteryPct ?? 0;
              const proficiency = dp?.proficiency ?? "novice";
              return (
                <li
                  key={d.id}
                  className="grid grid-cols-1 items-center gap-3 py-4 sm:grid-cols-[1fr_auto] sm:gap-6"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/learn/${d.id}`}
                        className="truncate font-medium hover:text-brand-700"
                      >
                        {d.shortTitle}
                      </Link>
                      <Badge tone={PROFICIENCY_TONE[proficiency]}>
                        {proficiency}
                      </Badge>
                      <span className="text-xs text-muted">
                        {d.weightPct}% of exam
                      </span>
                    </div>
                    <ProgressBar
                      value={masteryPct}
                      tone={masteryTone(masteryPct)}
                      className="mt-2"
                    />
                  </div>
                  <div className="flex items-center gap-6 text-sm sm:justify-end">
                    <span className="tabular-nums">
                      <span className="font-semibold">{masteryPct}%</span>{" "}
                      <span className="text-muted">mastery</span>
                    </span>
                    <span className="tabular-nums text-muted">
                      {dp?.modulesDone ?? 0}/{dp?.modulesTotal ?? 0} modules
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      {/* Score trend ------------------------------------------------------ */}
      {trendData.length >= 2 ? (
        <Card>
          <CardHeader
            title="Score trend"
            subtitle="Your quiz scores over time."
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <CardBody>
            <ScoreTrendChart data={trendData} />
          </CardBody>
        </Card>
      ) : null}

      {/* Intelligent feedback -------------------------------------------- */}
      <FeedbackPanel />

      {/* Quick links ------------------------------------------------------ */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardBody className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="text-brand-600">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Study plan</h3>
                <p className="mt-0.5 text-sm text-muted">
                  {progress.hasStudyPlan
                    ? "Continue your tailored week-by-week schedule."
                    : "Generate a tailored, week-by-week study schedule."}
                </p>
              </div>
            </div>
            <ButtonLink href="/study-plan" variant="secondary" className="shrink-0">
              Open
            </ButtonLink>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="text-brand-600">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Exam simulation</h3>
                <p className="mt-0.5 text-sm text-muted">
                  {progress.examUnlocked
                    ? "Take a full, timed exam simulation."
                    : "Complete 80% of modules or reach 70% mastery to unlock."}
                </p>
              </div>
            </div>
            {progress.examUnlocked ? (
              <ButtonLink href="/exam" className="shrink-0">
                Start
              </ButtonLink>
            ) : (
              <Badge tone="neutral" className="shrink-0">
                <Lock className="h-3.5 w-3.5" /> Locked
              </Badge>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
