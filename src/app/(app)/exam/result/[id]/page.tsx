import { notFound } from "next/navigation";
import {
  BookOpen,
  Clock,
  LayoutDashboard,
  ListChecks,
  Trophy,
} from "lucide-react";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  ProgressBar,
  Stat,
} from "@/components/ui";
import { DOMAINS, getDomain, getQuestion, toRevealQuestion } from "@/lib/content";
import type { DomainId, Proficiency } from "@/lib/content/schema";
import { prisma } from "@/lib/prisma";
import {
  canReportProficiency,
  proficiencyFromPct,
  smallSampleNote,
  type DomainScore,
  type PerDomainScore,
} from "@/lib/scoring";
import { requireUser } from "@/lib/session";
import { AnswerReview, type ReviewItem } from "@/components/AnswerReview";

export const dynamic = "force-dynamic";

type BadgeTone = "success" | "info" | "warning" | "danger";
const PROFICIENCY_TONE: Record<Proficiency, BadgeTone> = {
  expert: "success",
  proficient: "info",
  developing: "warning",
  novice: "danger",
};
const PROGRESS_TONE: Record<Proficiency, "success" | "warning" | "danger" | "brand"> = {
  expert: "success",
  proficient: "brand",
  developing: "warning",
  novice: "danger",
};

function proficiencyLabel(p: Proficiency): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

// Phrase the score as readiness, never as an official pass/fail — Google does
// not publish a passing score for the PCA exam.
function readinessNote(pct: number): { headline: string; body: string; tone: BadgeTone } {
  if (pct >= 80)
    return {
      headline: "Strong readiness",
      body: "You're scoring well above a comfortable margin. Keep your weakest domains sharp and you should walk in confident.",
      tone: "success",
    };
  if (pct >= 70)
    return {
      headline: "On track",
      body: "You're in a solid range. Close the gaps in your lowest domains to build a safer buffer before exam day.",
      tone: "info",
    };
  if (pct >= 55)
    return {
      headline: "Getting there",
      body: "You have a foundation but some domains need more work. Focus your remaining study on the weakest areas below.",
      tone: "warning",
    };
  return {
    headline: "More prep needed",
    body: "Spend more time in the learning modules before your next simulation. Prioritize the lowest-scoring domains below.",
    tone: "danger",
  };
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default async function ExamResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const run = await prisma.examRun.findUnique({ where: { id } });
  if (!run || run.userId !== user.id) notFound();

  // Per-question review: pair each frozen exam question with the user's answer.
  const answerRows = await prisma.answer.findMany({
    where: { userId: user.id, refId: id, context: "exam" },
  });
  const ansByQ = new Map(answerRows.map((a) => [a.questionId, a]));
  const reviewItems: ReviewItem[] = run.questionIds
    .map((qid): ReviewItem | null => {
      const q = getQuestion(qid);
      if (!q) return null;
      const a = ansByQ.get(qid);
      return {
        question: toRevealQuestion(q, { seed: id }),
        selected: a?.selected ?? [],
        isCorrect: a?.correct ?? false,
      };
    })
    .filter((x): x is ReviewItem => x !== null);

  const score = Math.round(run.scorePct ?? 0);
  const overallProf = proficiencyFromPct(score);
  const readiness = readinessNote(score);

  const perDomain = (run.perDomain as unknown as PerDomainScore) ?? null;

  const rows = DOMAINS.map((d) => {
    const sc: DomainScore =
      perDomain?.[d.id as DomainId] ?? {
        correct: 0,
        total: 0,
        pct: 0,
        proficiency: "novice",
      };
    return { domain: getDomain(d.id), score: sc };
  }).sort((a, b) => a.score.pct - b.score.pct);

  const weakest = rows.filter((r) => r.score.total > 0).slice(0, 2);

  const timeTaken =
    run.finishedAt != null
      ? formatDuration(run.finishedAt.getTime() - run.startedAt.getTime())
      : "—";

  const when = (run.finishedAt ?? run.startedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Simulation exam report</h1>
        <p className="text-sm text-muted">Submitted {when}</p>
      </div>

      {/* Overall score + readiness */}
      <Card>
        <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Trophy size={28} />
            </div>
            <div>
              <div className="text-sm text-muted">Overall score</div>
              <div className="text-5xl font-bold leading-none">{score}%</div>
              <div className="mt-1">
                <Badge tone={PROFICIENCY_TONE[overallProf]}>
                  {proficiencyLabel(overallProf)}
                </Badge>
              </div>
            </div>
          </div>
          <div className="w-full sm:max-w-sm">
            <div className="mb-2 flex items-center gap-2">
              <Badge tone={readiness.tone}>{readiness.headline}</Badge>
            </div>
            <ProgressBar value={score} tone={PROGRESS_TONE[overallProf]} />
            <p className="mt-2 text-xs text-muted">{readiness.body}</p>
          </div>
        </CardBody>
      </Card>

      <p className="text-xs text-muted">
        Note: this percentage is a <span className="font-medium">readiness indicator</span>,
        not an official result. Google does not publish a passing score for the
        Professional Cloud Architect exam.
      </p>

      {/* Run stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Time taken"
          value={
            <span className="flex items-center gap-2">
              <Clock size={20} className="text-brand-600" />
              {timeTaken}
            </span>
          }
          hint={`of ${run.durationSec / 3600}h allotted`}
        />
        <Stat
          label="Questions"
          value={
            <span className="flex items-center gap-2">
              <ListChecks size={20} className="text-brand-600" />
              {run.questionIds.length}
            </span>
          }
          hint="weighted to domain blueprint"
        />
        <Stat
          label="Correct"
          value={`${rows.reduce((n, r) => n + r.score.correct, 0)} / ${run.questionIds.length}`}
          hint="unanswered counts as incorrect"
        />
      </div>

      {/* Per-domain breakdown */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Per-domain breakdown · weakest first
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map(({ domain, score: sc }) => (
            <Card key={domain.id}>
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-muted">
                      Domain {domain.index} · {domain.weightPct}% of exam
                    </div>
                    <h3 className="mt-0.5 font-semibold leading-tight">{domain.title}</h3>
                  </div>
                  {canReportProficiency(sc.total) ? (
                    <Badge tone={PROFICIENCY_TONE[sc.proficiency]}>
                      {proficiencyLabel(sc.proficiency)}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Too few items</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">
                    {sc.correct} / {sc.total} correct
                  </span>
                  <span className="font-semibold">{sc.pct}%</span>
                </div>
                <ProgressBar
                  value={sc.pct}
                  tone={canReportProficiency(sc.total) ? PROGRESS_TONE[sc.proficiency] : "neutral"}
                />
                {!canReportProficiency(sc.total) ? (
                  <p className="text-xs text-muted">{smallSampleNote(sc.correct, sc.total)}</p>
                ) : null}
              </CardBody>
            </Card>
          ))}
        </div>
      </div>

      {/* Weakest-domain callout + CTAs */}
      <Card>
        <CardBody className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Where to focus next</h3>
            {weakest.length > 0 ? (
              <p className="text-sm text-muted">
                Your weakest domains were{" "}
                {weakest.map((w, i) => (
                  <span key={w.domain.id}>
                    <span className="font-medium text-foreground">
                      {w.domain.shortTitle}
                    </span>{" "}
                    ({w.score.pct}%)
                    {i < weakest.length - 1 ? " and " : ""}
                  </span>
                ))}
                . Review those modules to lift your next score.
              </p>
            ) : (
              <p className="text-sm text-muted">
                Review the learning modules to keep every domain sharp.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/learn">
              <BookOpen size={16} /> Review weak domains
            </ButtonLink>
            <ButtonLink href="/dashboard" variant="secondary">
              <LayoutDashboard size={16} /> Go to dashboard
            </ButtonLink>
          </div>
        </CardBody>
      </Card>

      <AnswerReview items={reviewItems} />
    </div>
  );
}
