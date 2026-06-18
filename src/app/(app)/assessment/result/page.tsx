import { CalendarRange, LayoutDashboard, Trophy } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  EmptyState,
  ProgressBar,
} from "@/components/ui";
import { DOMAINS, getDomain } from "@/lib/content";
import type { DomainId, Proficiency } from "@/lib/content/schema";
import { prisma } from "@/lib/prisma";
import type { PerDomainScore, DomainScore } from "@/lib/scoring";
import { proficiencyFromPct } from "@/lib/scoring";
import { requireUser } from "@/lib/session";

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

export default async function AssessmentResultPage() {
  const user = await requireUser();

  const run = await prisma.assessmentRun.findFirst({
    where: { userId: user.id },
    orderBy: { takenAt: "desc" },
  });

  if (!run) {
    return (
      <EmptyState
        title="No diagnostic results yet"
        body="Take the diagnostic assessment to see your proficiency across all six exam domains."
        action={<ButtonLink href="/assessment">Take the diagnostic</ButtonLink>}
      />
    );
  }

  const perDomain = run.perDomain as unknown as PerDomainScore;
  const overall = Math.round(run.overallPct);
  const overallTone = PROGRESS_TONE[proficiencyFromPct(overall)];

  // Per-domain rows, weakest-first.
  const rows = DOMAINS.map((d) => {
    const score: DomainScore =
      perDomain?.[d.id as DomainId] ??
      { correct: 0, total: 0, pct: 0, proficiency: "novice" };
    return { domain: getDomain(d.id), score };
  }).sort((a, b) => a.score.pct - b.score.pct);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Your diagnostic results</h1>
        <p className="text-sm text-muted">
          Taken{" "}
          {run.takenAt.toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Overall score */}
      <Card>
        <CardBody className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Trophy size={28} />
            </div>
            <div>
              <div className="text-sm text-muted">Overall score</div>
              <div className="text-5xl font-bold leading-none">{overall}%</div>
              <div className="mt-1">
                <Badge tone={PROFICIENCY_TONE[proficiencyFromPct(overall)]}>
                  {proficiencyLabel(proficiencyFromPct(overall))}
                </Badge>
              </div>
            </div>
          </div>
          <div className="w-full sm:max-w-xs">
            <ProgressBar value={overall} tone={overallTone} />
          </div>
        </CardBody>
      </Card>

      {/* Per-domain breakdown */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Per-domain breakdown · weakest first
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map(({ domain, score }) => (
            <Card key={domain.id}>
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-muted">
                      Domain {domain.index} · {domain.weightPct}% of exam
                    </div>
                    <h3 className="mt-0.5 font-semibold leading-tight">
                      {domain.title}
                    </h3>
                  </div>
                  <Badge tone={PROFICIENCY_TONE[score.proficiency]}>
                    {proficiencyLabel(score.proficiency)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">
                    {score.correct} / {score.total} correct
                  </span>
                  <span className="font-semibold">{score.pct}%</span>
                </div>
                <ProgressBar value={score.pct} tone={PROGRESS_TONE[score.proficiency]} />
              </CardBody>
            </Card>
          ))}
        </div>
      </div>

      {/* CTAs */}
      <Card>
        <CardBody className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Ready for the next step?</h3>
            <p className="text-sm text-muted">
              Turn these results into a time-bound plan that front-loads your
              weakest, highest-weight domains.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/study-plan">
              <CalendarRange size={16} /> Generate my study plan
            </ButtonLink>
            <ButtonLink href="/dashboard" variant="secondary">
              <LayoutDashboard size={16} /> Go to dashboard
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
