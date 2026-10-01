import {
  BookOpen,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  History,
  Layers,
  Lock,
  Trophy,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  ProgressBar,
} from "@/components/ui";
import { getCaseStudy, getQuestions, toClientQuestion } from "@/lib/content";
import type { CaseStudyId } from "@/lib/content/schema";
import {
  EXAM_CASE_STUDIES,
  EXAM_DURATION_SEC,
  EXAM_QUESTION_COUNT,
} from "@/lib/exam";
import { prisma } from "@/lib/prisma";
import { getUserProgress } from "@/lib/progress";
import { requireUser } from "@/lib/session";
import { proficiencyFromPct } from "@/lib/scoring";
import type { ClientQuestion, ExamDraft } from "@/types/client";
import { ExamRunner } from "./ExamRunner";
import { startExam } from "./actions";

export const dynamic = "force-dynamic";

export default async function ExamPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const user = await requireUser();
  const { run: runId } = await searchParams;

  // --- Active run: render the runner ----------------------------------------
  if (runId) {
    const run = await prisma.examRun.findUnique({ where: { id: runId } });
    if (run && run.userId === user.id && run.status === "in-progress") {
      const questions: ClientQuestion[] = getQuestions(run.questionIds).map(
        (q) => toClientQuestion(q, { seed: run.id }),
      );

      const caseStudies: Record<
        string,
        {
          name: string;
          sections: {
            overview: string;
            solutionConcept: string;
            existingTech: string;
            businessReqs: string[];
            technicalReqs: string[];
            executiveStatement: string;
          };
        }
      > = {};
      for (const id of run.caseStudyIds) {
        const cs = getCaseStudy(id as CaseStudyId);
        if (cs) caseStudies[id] = { name: cs.name, sections: cs.sections };
      }

      // Account for time already elapsed if the page was reloaded mid-run.
      // (Server component render — Date.now() is fine here.)
      // eslint-disable-next-line react-hooks/purity
      const nowMs = Date.now();
      const elapsedSec = Math.floor((nowMs - new Date(run.startedAt).getTime()) / 1000);
      const remaining = Math.max(0, run.durationSec - elapsedSec);

      return (
        <ExamRunner
          examId={run.id}
          questions={questions}
          caseStudies={caseStudies}
          durationSec={remaining}
          initialDraft={(run.draft as ExamDraft | null) ?? null}
        />
      );
    }
    // Invalid / finished / not owned — fall through to overview.
  }

  const progress = await getUserProgress(user.id);

  // --- Locked state ---------------------------------------------------------
  if (!progress.examUnlocked) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader
            title="Full-length simulation exam"
            subtitle="This is locked until you're ready."
            icon={<Lock size={20} />}
            action={<Badge tone="neutral">Locked</Badge>}
          />
          <CardBody className="space-y-5">
            <p className="text-sm text-muted">
              The simulation mirrors the real Professional Cloud Architect exam:{" "}
              {EXAM_QUESTION_COUNT} questions, {EXAM_DURATION_SEC / 3600} hours, and{" "}
              {EXAM_CASE_STUDIES} case studies. To make it a meaningful dry run,
              unlock it by reaching{" "}
              <span className="font-medium text-foreground">
                80% of modules completed
              </span>{" "}
              or <span className="font-medium text-foreground">70% overall mastery</span>.
            </p>

            <div className="space-y-4">
              <UnlockMeter
                label="Modules completed"
                value={progress.modulePct}
                detail={`${progress.completedModules} of ${progress.totalModules} modules`}
                target={80}
              />
              <UnlockMeter
                label="Overall mastery"
                value={progress.overallMasteryPct}
                detail="blends module completion with quiz & diagnostic scores"
                target={70}
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <ButtonLink href="/learn">
                <BookOpen size={16} /> Keep learning
              </ButtonLink>
              <ButtonLink href="/study-plan" variant="secondary">
                <CalendarRange size={16} /> View study plan
              </ButtonLink>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  // --- Unlocked: overview + past attempts -----------------------------------
  const pastAttempts = await prisma.examRun.findMany({
    where: { userId: user.id, status: "submitted" },
    orderBy: { finishedAt: "desc" },
    take: 10,
  });

  const overview = [
    { icon: ClipboardList, label: `${EXAM_QUESTION_COUNT} questions`, hint: "weighted by domain" },
    { icon: Clock, label: `${EXAM_DURATION_SEC / 3600} hours`, hint: "countdown timer" },
    { icon: Layers, label: `${EXAM_CASE_STUDIES} case studies`, hint: "split-screen scenarios" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Full-length simulation exam"
          subtitle="A realistic dry run of the PCA certification exam."
          icon={<ClipboardList size={20} />}
          action={<Badge tone="success">Unlocked</Badge>}
        />
        <CardBody className="space-y-5">
          <p className="text-sm text-muted">
            This {EXAM_QUESTION_COUNT}-question exam mimics the real Professional
            Cloud Architect test: a {EXAM_DURATION_SEC / 3600}-hour countdown, a
            question mix weighted to the official domain blueprint, and{" "}
            {EXAM_CASE_STUDIES} case studies you read alongside their questions in a
            split-screen view. Flag questions, jump around with the navigator, and
            review before you submit. You&apos;re scored per domain at the end.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            {overview.map((item) => (
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

          <form action={startExam}>
            <Button type="submit" size="lg">
              <ClipboardList size={18} /> Start simulation exam
            </Button>
          </form>
          <p className="text-xs text-muted">
            The timer starts as soon as the exam loads. Set aside the full{" "}
            {EXAM_DURATION_SEC / 3600} hours.
          </p>
        </CardBody>
      </Card>

      {/* Past attempts */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <History size={16} /> Past attempts
        </h2>
        {pastAttempts.length === 0 ? (
          <Card>
            <CardBody className="flex items-center gap-3 text-sm text-muted">
              <FileText size={18} className="text-muted" />
              No simulation exams yet. Your scored attempts will show up here.
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {pastAttempts.map((attempt) => {
              const score = Math.round(attempt.scorePct ?? 0);
              const prof = proficiencyFromPct(score);
              const tone =
                prof === "expert"
                  ? "success"
                  : prof === "proficient"
                    ? "brand"
                    : prof === "developing"
                      ? "warning"
                      : "danger";
              const when = (attempt.finishedAt ?? attempt.startedAt).toLocaleDateString(
                undefined,
                { year: "numeric", month: "short", day: "numeric" },
              );
              return (
                <Card key={attempt.id}>
                  <CardBody className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                        <Trophy size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-semibold leading-none">
                            {score}%
                          </span>
                          <Badge tone={tone as "success" | "brand" | "warning" | "danger"}>
                            {prof.charAt(0).toUpperCase() + prof.slice(1)}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted">Submitted {when}</div>
                      </div>
                    </div>
                    <div className="w-full sm:w-48">
                      <ProgressBar value={score} tone={tone as "success" | "brand" | "warning" | "danger"} />
                    </div>
                    <ButtonLink href={`/exam/result/${attempt.id}`} variant="secondary" size="sm">
                      View report
                    </ButtonLink>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function UnlockMeter({
  label,
  value,
  detail,
  target,
}: {
  label: string;
  value: number;
  detail: string;
  target: number;
}) {
  const met = value >= target;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          {met ? <CheckCircle2 size={15} className="text-success" /> : null}
          {label}
        </span>
        <span className={met ? "font-semibold text-success" : "text-muted"}>
          {value}% / {target}%
        </span>
      </div>
      <ProgressBar value={value} tone={met ? "success" : "brand"} />
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}
