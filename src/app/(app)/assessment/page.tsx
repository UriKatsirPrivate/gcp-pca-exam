import { ClipboardCheck, Clock, ListChecks, Target } from "lucide-react";
import { Badge, ButtonLink, Card, CardBody, CardHeader } from "@/components/ui";
import {
  getCaseStudy,
  sampleAssessment,
  toClientQuestion,
} from "@/lib/content";
import type { CaseStudy, CaseStudyId } from "@/lib/content/schema";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { AssessmentRunner } from "./AssessmentRunner";

export const dynamic = "force-dynamic";

export default async function AssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ retake?: string }>;
}) {
  const user = await requireUser();
  const { retake } = await searchParams;

  const lastRun = await prisma.assessmentRun.findFirst({
    where: { userId: user.id },
    orderBy: { takenAt: "desc" },
  });

  const questions = sampleAssessment();
  // Option order is seeded per user so the diagnostic and its review agree.
  const clientQs = questions.map((q) => toClientQuestion(q, { seed: user.id }));

  // Only the case studies actually referenced by these questions.
  const caseStudies: Record<string, CaseStudy> = {};
  for (const q of questions) {
    if (!q.caseStudyId || caseStudies[q.caseStudyId]) continue;
    const cs = getCaseStudy(q.caseStudyId as CaseStudyId);
    if (cs) caseStudies[q.caseStudyId] = cs;
  }

  // Returning users see the summary first unless they explicitly chose to retake.
  const showIntro = lastRun && retake !== "1";

  if (showIntro) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader
            title="Diagnostic assessment"
            subtitle="You've already taken the diagnostic."
            icon={<ClipboardCheck size={20} />}
          />
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 p-4">
              <div>
                <div className="text-sm text-muted">Your last overall score</div>
                <div className="mt-0.5 text-3xl font-semibold">
                  {Math.round(lastRun.overallPct)}%
                </div>
              </div>
              <div className="text-right text-sm text-muted">
                Taken{" "}
                {lastRun.takenAt.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>
            <p className="text-sm text-muted">
              Review your per-domain breakdown, or retake the diagnostic to start
              fresh. Retaking creates a new run and replaces your latest result.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/assessment/result">View my results</ButtonLink>
              <ButtonLink href="/assessment?retake=1" variant="secondary">
                Retake diagnostic
              </ButtonLink>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const intro = [
    { icon: ListChecks, label: `${questions.length} questions`, hint: "across 6 domains" },
    { icon: Clock, label: "~20 minutes", hint: "work at your own pace" },
    { icon: Target, label: "Proficiency", hint: "scored per domain" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Diagnostic assessment"
          subtitle="Find your strengths and gaps before you build a study plan."
          icon={<ClipboardCheck size={20} />}
          action={<Badge tone="brand">Feature 1</Badge>}
        />
        <CardBody className="space-y-4">
          <p className="text-sm text-muted">
            This {questions.length}-question diagnostic spans all six PCA exam
            domains. There&apos;s no timer — answer each question, revisit any with
            the navigator, and submit when you&apos;re ready. Questions tied to a
            case study include a panel with the full scenario. You&apos;ll get a
            proficiency score per domain to drive your tailored study plan.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {intro.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-3"
              >
                <item.icon size={20} className="text-brand-600" />
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted">{item.hint}</div>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <AssessmentRunner questions={clientQs} caseStudies={caseStudies} />
    </div>
  );
}
