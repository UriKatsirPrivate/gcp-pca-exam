"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { QuestionCard } from "@/components/QuestionCard";
import { Button, ProgressBar } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CaseStudy } from "@/lib/content/schema";
import type { ClientQuestion, SubmittedAnswer } from "@/types/client";
import { submitAssessment } from "./actions";

export function AssessmentRunner({
  questions,
  caseStudies,
}: {
  questions: ClientQuestion[];
  caseStudies: Record<string, CaseStudy>;
}) {
  const total = questions.length;
  const [current, setCurrent] = useState(0);
  // selections keyed by questionId
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Per-question dwell time: committed totals in timeAccumRef; activeRef tracks
  // the on-screen question and since when, so we add the slice on nav / submit.
  const timeAccumRef = useRef<Record<string, number>>({});
  const activeRef = useRef<{ qid: string; since: number } | null>(null);

  function commitActiveTime() {
    const a = activeRef.current;
    if (!a) return;
    const now = Date.now();
    timeAccumRef.current[a.qid] = (timeAccumRef.current[a.qid] ?? 0) + (now - a.since);
    a.since = now;
  }

  useEffect(() => {
    if (questions[0]) activeRef.current = { qid: questions[0].id, since: Date.now() };
  }, [questions]);

  const q = questions[current];
  const selected = q ? selections[q.id] ?? [] : [];
  const caseStudy = q?.caseStudyId ? caseStudies[q.caseStudyId] : undefined;

  const answeredCount = useMemo(
    () =>
      questions.reduce(
        (n, item) => n + ((selections[item.id]?.length ?? 0) > 0 ? 1 : 0),
        0,
      ),
    [questions, selections],
  );
  const allAnswered = answeredCount === total && total > 0;
  const progressPct = total > 0 ? (answeredCount / total) * 100 : 0;

  function setSelection(next: string[]) {
    if (!q) return;
    setSelections((prev) => ({ ...prev, [q.id]: next }));
  }

  function go(index: number) {
    const nextIdx = Math.max(0, Math.min(total - 1, index));
    commitActiveTime();
    const nextQ = questions[nextIdx];
    activeRef.current = nextQ ? { qid: nextQ.id, since: Date.now() } : null;
    setCurrent(nextIdx);
    setDrawerOpen(false);
  }

  function handleSubmit() {
    setError(null);
    commitActiveTime();
    const answers: SubmittedAnswer[] = questions.map((item) => ({
      questionId: item.id,
      selected: selections[item.id] ?? [],
      atMs: Math.round(timeAccumRef.current[item.id] ?? 0),
    }));
    startTransition(async () => {
      try {
        await submitAssessment(answers);
      } catch (e) {
        // redirect() throws internally and is handled by Next; only real errors land here.
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) return;
        setError("Something went wrong submitting your assessment. Please try again.");
      }
    });
  }

  if (!q) return null;

  const isLast = current === total - 1;

  return (
    <div className="relative">
      {/* Top: progress + navigator */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">
            {answeredCount} of {total} answered
          </span>
          <span className="text-muted">{Math.round(progressPct)}%</span>
        </div>
        <ProgressBar value={progressPct} tone={allAnswered ? "success" : "brand"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
        {/* Main column */}
        <div>
          {caseStudy ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-2">
              <div className="flex items-center gap-2 text-sm">
                <FileText size={16} className="text-brand-600" />
                <span className="text-muted">Case study:</span>
                <span className="font-medium">{caseStudy.name}</span>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDrawerOpen(true)}
              >
                View case study
              </Button>
            </div>
          ) : null}

          <QuestionCard
            question={q}
            selected={selected}
            onChange={setSelection}
            disabled={isPending}
            index={current}
            total={total}
          />

          {error ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {/* Nav controls */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => go(current - 1)}
              disabled={current === 0 || isPending}
            >
              <ArrowLeft size={16} /> Previous
            </Button>

            {isLast ? (
              <Button
                type="button"
                variant="success"
                onClick={handleSubmit}
                disabled={isPending}
                aria-busy={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Submitting…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} /> Submit assessment
                  </>
                )}
              </Button>
            ) : (
              <Button type="button" onClick={() => go(current + 1)} disabled={isPending}>
                Next <ArrowRight size={16} />
              </Button>
            )}
          </div>

          {isLast && !allAnswered ? (
            <p className="mt-2 text-right text-xs text-muted">
              {total - answeredCount} unanswered — you can still submit.
            </p>
          ) : null}
        </div>

        {/* Question navigator */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold">Questions</h3>
            <div className="grid grid-cols-6 gap-2 lg:grid-cols-5">
              {questions.map((item, i) => {
                const isAnswered = (selections[item.id]?.length ?? 0) > 0;
                const isCurrent = i === current;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(i)}
                    disabled={isPending}
                    aria-label={`Go to question ${i + 1}${isAnswered ? " (answered)" : ""}`}
                    aria-current={isCurrent ? "true" : undefined}
                    className={cn(
                      "flex h-9 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50",
                      isCurrent && "border-brand-500 ring-2 ring-brand-500",
                      isAnswered
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-line bg-surface text-muted hover:bg-surface-2",
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* Case study drawer */}
      {caseStudy ? (
        <CaseStudyDrawer
          caseStudy={caseStudy}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
    </div>
  );
}

function CaseStudyDrawer({
  caseStudy,
  open,
  onClose,
}: {
  caseStudy: CaseStudy;
  open: boolean;
  onClose: () => void;
}) {
  const { sections } = caseStudy;
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-opacity",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close case study"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        tabIndex={open ? 0 : -1}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Case study: ${caseStudy.name}`}
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-surface shadow-xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-line p-5">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-brand-600" />
            <h2 className="font-semibold">{caseStudy.name}</h2>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5 text-sm">
          <Section title="Overview">
            <Markdown>{sections.overview}</Markdown>
          </Section>
          <Section title="Solution concept">
            <Markdown>{sections.solutionConcept}</Markdown>
          </Section>
          <Section title="Existing technical environment">
            <Markdown>{sections.existingTech}</Markdown>
          </Section>
          <Section title="Business requirements">
            <ul className="list-disc space-y-1 pl-5">
              {sections.businessReqs.map((req, i) => (
                <li key={i}>{req}</li>
              ))}
            </ul>
          </Section>
          <Section title="Technical requirements">
            <ul className="list-disc space-y-1 pl-5">
              {sections.technicalReqs.map((req, i) => (
                <li key={i}>{req}</li>
              ))}
            </ul>
          </Section>
          <Section title="Executive statement">
            <blockquote className="border-l-2 border-brand-500 pl-4 italic text-muted">
              <Markdown>{sections.executiveStatement}</Markdown>
            </blockquote>
          </Section>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      <div className="prose-content text-[15px]">{children}</div>
    </section>
  );
}
