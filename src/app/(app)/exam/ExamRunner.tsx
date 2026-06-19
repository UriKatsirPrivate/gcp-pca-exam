"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Flag,
  FileText,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Timer,
  X,
} from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { QuestionCard } from "@/components/QuestionCard";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ClientQuestion, ExamDraft, SubmittedAnswer } from "@/types/client";
import { saveExamDraft, submitExam } from "./actions";

type CaseStudyData = {
  name: string;
  sections: {
    overview: string;
    solutionConcept: string;
    existingTech: string;
    businessReqs: string[];
    technicalReqs: string[];
    executiveStatement: string;
  };
};

export function ExamRunner({
  examId,
  questions,
  caseStudies,
  durationSec,
  initialDraft,
}: {
  examId: string;
  questions: ClientQuestion[];
  caseStudies: Record<string, CaseStudyData>;
  durationSec: number;
  initialDraft?: ExamDraft | null;
}) {
  const total = questions.length;
  const [current, setCurrent] = useState(0);
  // Hydrate from a persisted draft so a reload/crash mid-exam restores state.
  const [selections, setSelections] = useState<Record<string, string[]>>(
    () => initialDraft?.selections ?? {},
  );
  const [flagged, setFlagged] = useState<Record<string, boolean>>(
    () => initialDraft?.flagged ?? {},
  );
  const [reviewing, setReviewing] = useState(false);
  const [casePanelOpen, setCasePanelOpen] = useState(true); // desktop split-screen
  const [mobileCaseOpen, setMobileCaseOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [announce, setAnnounce] = useState("");

  // Single start timestamp; set once on mount, never reset on re-render.
  const startedAtRef = useRef<number | null>(null);
  const [remaining, setRemaining] = useState(durationSec);
  const submittedRef = useRef(false);

  // Per-question dwell time. Committed totals live in timeAccumRef; activeRef
  // tracks which question is on screen and since when, so we can add the elapsed
  // slice on navigation / save / submit. Hydrated from the draft.
  const timeAccumRef = useRef<Record<string, number>>(initialDraft?.timeMs ?? {});
  const activeRef = useRef<{ qid: string; since: number } | null>(null);
  const announcedRef = useRef<Set<number>>(new Set());

  function commitActiveTime() {
    const a = activeRef.current;
    if (!a) return;
    const now = Date.now();
    timeAccumRef.current[a.qid] = (timeAccumRef.current[a.qid] ?? 0) + (now - a.since);
    a.since = now;
  }

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
  const flaggedCount = useMemo(
    () => questions.filter((item) => flagged[item.id]).length,
    [questions, flagged],
  );

  function buildAnswers(): SubmittedAnswer[] {
    commitActiveTime();
    return questions.map((item) => ({
      questionId: item.id,
      selected: selections[item.id] ?? [],
      atMs: Math.round(timeAccumRef.current[item.id] ?? 0),
    }));
  }

  // Persist the in-progress draft. Kept in a ref (refreshed in an effect, not
  // during render) so the debounce/interval effects and nav handlers always call
  // the latest closure without re-subscribing.
  const saveDraftRef = useRef<() => void>(() => {});
  useEffect(() => {
    saveDraftRef.current = () => {
      if (submittedRef.current) return;
      commitActiveTime();
      const draft: ExamDraft = {
        selections,
        flagged,
        timeMs: { ...timeAccumRef.current },
        updatedAt: new Date().toISOString(),
      };
      setSaveState("saving");
      saveExamDraft(examId, draft)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("idle"));
    };
  });

  function doSubmit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setError(null);
    const answers = buildAnswers();
    startTransition(async () => {
      try {
        await submitExam(examId, answers);
      } catch (e) {
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) return;
        submittedRef.current = false;
        setError("Something went wrong submitting your exam. Please try again.");
      }
    });
  }

  // Fix the start timestamp + mark the first question active, once on mount.
  useEffect(() => {
    startedAtRef.current = Date.now();
    if (questions[0]) activeRef.current = { qid: questions[0].id, since: Date.now() };
  }, [questions]);

  // Warn before leaving an unsubmitted exam (compounds with autosave recovery).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Debounced autosave whenever answers or flags change.
  const firstChangeRef = useRef(true);
  useEffect(() => {
    if (firstChangeRef.current) {
      firstChangeRef.current = false;
      return;
    }
    const id = setTimeout(() => saveDraftRef.current(), 3000);
    return () => clearTimeout(id);
  }, [selections, flagged]);

  // Periodic autosave so accumulated per-question time persists even without
  // answer changes (e.g. a long read), bounded to one write / 20s.
  useEffect(() => {
    const id = setInterval(() => saveDraftRef.current(), 20000);
    return () => clearInterval(id);
  }, []);

  // Countdown ticker — recompute from the fixed start so it stays accurate even
  // if the tab is throttled. Announces milestones for screen readers; auto-submits at zero.
  useEffect(() => {
    const id = setInterval(() => {
      const start = startedAtRef.current ?? Date.now();
      const left = durationSec - Math.floor((Date.now() - start) / 1000);
      setRemaining(left);
      for (const threshold of [1800, 900, 300, 60]) {
        if (left <= threshold && !announcedRef.current.has(threshold)) {
          announcedRef.current.add(threshold);
          setAnnounce(`${Math.round(threshold / 60)} minutes remaining.`);
        }
      }
      if (left <= 0) {
        clearInterval(id);
        doSubmit();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationSec]);

  function setSelection(next: string[]) {
    if (!q) return;
    setSelections((prev) => ({ ...prev, [q.id]: next }));
  }

  function toggleFlag() {
    if (!q) return;
    setFlagged((prev) => ({ ...prev, [q.id]: !prev[q.id] }));
  }

  function go(index: number) {
    const next = Math.max(0, Math.min(total - 1, index));
    commitActiveTime();
    const nextQ = questions[next];
    activeRef.current = nextQ ? { qid: nextQ.id, since: Date.now() } : null;
    setCurrent(next);
    setReviewing(false);
    setMobileCaseOpen(false);
  }

  function enterReview() {
    commitActiveTime();
    activeRef.current = null;
    saveDraftRef.current();
    setReviewing(true);
  }

  if (!q) return null;

  const isLast = current === total - 1;
  const timeLow = remaining <= 300; // last 5 minutes

  return (
    <div className="relative">
      {/* Exam header bar: timer + progress + flag count */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-brand-600" />
          <span className="font-semibold">Simulation exam</span>
          <Badge tone="brand">{total} questions</Badge>
        </div>
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "text-xs",
              saveState === "saving" ? "text-muted" : "text-success",
            )}
            aria-live="polite"
          >
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>
          <span className="text-sm text-muted">
            {answeredCount}/{total} answered
            {flaggedCount > 0 ? ` · ${flaggedCount} flagged` : ""}
          </span>
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-sm font-semibold tabular-nums",
              timeLow ? "bg-danger/15 text-danger" : "bg-surface-2 text-foreground",
            )}
            role="timer"
            aria-live="off"
          >
            <Timer size={16} />
            {formatTime(remaining)}
          </div>
        </div>
      </div>

      {/* Screen-reader-only time milestone announcements. */}
      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>

      {error ? (
        <p className="mb-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {reviewing ? (
        <ReviewScreen
          questions={questions}
          selections={selections}
          flagged={flagged}
          onJump={go}
          onBack={() => setReviewing(false)}
          onSubmit={doSubmit}
          isPending={isPending}
          answeredCount={answeredCount}
          total={total}
        />
      ) : (
        <div
          className={cn(
            "grid gap-6",
            caseStudy && casePanelOpen
              ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
              : "lg:grid-cols-[minmax(0,1fr)_240px]",
          )}
        >
          {/* Main question column */}
          <div className="min-w-0">
            {caseStudy ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <FileText size={16} className="text-brand-600" />
                  <span className="text-muted">Case study:</span>
                  <span className="font-medium">{caseStudy.name}</span>
                </div>
                {/* Desktop: toggle split panel. Mobile: open drawer. */}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="hidden lg:inline-flex"
                  onClick={() => setCasePanelOpen((o) => !o)}
                >
                  {casePanelOpen ? (
                    <>
                      <PanelRightClose size={16} /> Hide scenario
                    </>
                  ) : (
                    <>
                      <PanelRightOpen size={16} /> Show scenario
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setMobileCaseOpen(true)}
                >
                  View scenario
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

            {/* Flag + nav controls */}
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant={flagged[q.id] ? "secondary" : "ghost"}
                size="sm"
                onClick={toggleFlag}
                disabled={isPending}
                className={cn(flagged[q.id] && "text-warning")}
                aria-pressed={!!flagged[q.id]}
              >
                <Flag size={16} className={cn(flagged[q.id] && "fill-warning")} />
                {flagged[q.id] ? "Flagged" : "Flag for review"}
              </Button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
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
                  onClick={enterReview}
                  disabled={isPending}
                >
                  Review & submit <ArrowRight size={16} />
                </Button>
              ) : (
                <Button type="button" onClick={() => go(current + 1)} disabled={isPending}>
                  Next <ArrowRight size={16} />
                </Button>
              )}
            </div>
          </div>

          {/* Right column: split-screen case study OR navigator */}
          {caseStudy && casePanelOpen ? (
            <aside className="hidden min-w-0 lg:block">
              <div className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-hidden">
                <CaseStudyPanel
                  caseStudy={caseStudy}
                  scroll
                  footer={
                    <Navigator
                      questions={questions}
                      current={current}
                      selections={selections}
                      flagged={flagged}
                      onJump={go}
                      disabled={isPending}
                      compact
                    />
                  }
                />
              </div>
            </aside>
          ) : (
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <Navigator
                questions={questions}
                current={current}
                selections={selections}
                flagged={flagged}
                onJump={go}
                disabled={isPending}
              />
            </aside>
          )}
        </div>
      )}

      {/* Mobile case-study drawer */}
      {caseStudy ? (
        <CaseStudyDrawer
          caseStudy={caseStudy}
          open={mobileCaseOpen}
          onClose={() => setMobileCaseOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ---- Navigator ------------------------------------------------------------

function Navigator({
  questions,
  current,
  selections,
  flagged,
  onJump,
  disabled,
  compact,
}: {
  questions: ClientQuestion[];
  current: number;
  selections: Record<string, string[]>;
  flagged: Record<string, boolean>;
  onJump: (i: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface p-4", compact && "border-0 p-0 pt-3")}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Navigator</h3>
        <div className="flex items-center gap-2 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-brand-50 ring-1 ring-brand-500" /> answered
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-warning/20 ring-1 ring-warning" /> flagged
          </span>
        </div>
      </div>
      <div className="grid grid-cols-8 gap-2 lg:grid-cols-6">
        {questions.map((item, i) => {
          const isAnswered = (selections[item.id]?.length ?? 0) > 0;
          const isFlagged = !!flagged[item.id];
          const isCurrent = i === current;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onJump(i)}
              disabled={disabled}
              aria-label={`Question ${i + 1}${isAnswered ? ", answered" : ", unanswered"}${
                isFlagged ? ", flagged" : ""
              }`}
              aria-current={isCurrent ? "true" : undefined}
              className={cn(
                "relative flex h-9 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50",
                isCurrent && "ring-2 ring-brand-500",
                isFlagged
                  ? "border-warning bg-warning/15 text-warning"
                  : isAnswered
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-line bg-surface text-muted hover:bg-surface-2",
              )}
            >
              {i + 1}
              {isFlagged ? (
                <Flag size={9} className="absolute right-0.5 top-0.5 fill-warning text-warning" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Review screen --------------------------------------------------------

function ReviewScreen({
  questions,
  selections,
  flagged,
  onJump,
  onBack,
  onSubmit,
  isPending,
  answeredCount,
  total,
}: {
  questions: ClientQuestion[];
  selections: Record<string, string[]>;
  flagged: Record<string, boolean>;
  onJump: (i: number) => void;
  onBack: () => void;
  onSubmit: () => void;
  isPending: boolean;
  answeredCount: number;
  total: number;
}) {
  const unanswered = questions
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => (selections[item.id]?.length ?? 0) === 0);
  const flaggedList = questions
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => flagged[item.id]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">Review before submitting</h2>
        <p className="mt-1 text-sm text-muted">
          You&apos;ve answered <span className="font-medium text-foreground">{answeredCount}</span> of{" "}
          {total} questions. Unanswered questions are scored as incorrect.
        </p>
      </div>

      <ReviewGroup
        title="Unanswered"
        emptyText="Every question has an answer."
        items={unanswered}
        onJump={onJump}
        tone="danger"
      />
      <ReviewGroup
        title="Flagged for review"
        emptyText="No questions flagged."
        items={flaggedList}
        onJump={onJump}
        tone="warning"
      />

      <Navigator
        questions={questions}
        current={-1}
        selections={selections}
        flagged={flagged}
        onJump={onJump}
        disabled={isPending}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={onBack} disabled={isPending}>
          <ArrowLeft size={16} /> Back to questions
        </Button>
        <Button
          type="button"
          variant="success"
          onClick={onSubmit}
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Submitting…
            </>
          ) : (
            <>
              <CheckCircle2 size={16} /> Submit exam
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ReviewGroup({
  title,
  emptyText,
  items,
  onJump,
  tone,
}: {
  title: string;
  emptyText: string;
  items: { item: ClientQuestion; i: number }[];
  onJump: (i: number) => void;
  tone: "danger" | "warning";
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle
          size={16}
          className={tone === "danger" ? "text-danger" : "text-warning"}
        />
        <h3 className="text-sm font-semibold">
          {title}{" "}
          <span className="text-muted">({items.length})</span>
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{emptyText}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map(({ i }) => (
            <button
              key={i}
              type="button"
              onClick={() => onJump(i)}
              className={cn(
                "h-8 min-w-8 rounded-md border px-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                tone === "danger"
                  ? "border-danger/40 bg-danger/10 text-danger hover:bg-danger/20"
                  : "border-warning/40 bg-warning/15 text-warning hover:bg-warning/25",
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Case study renderers -------------------------------------------------

function CaseStudyPanel({
  caseStudy,
  scroll,
  footer,
}: {
  caseStudy: CaseStudyData;
  scroll?: boolean;
  footer?: React.ReactNode;
}) {
  const { sections } = caseStudy;
  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line p-4">
        <FileText size={18} className="text-brand-600" />
        <h2 className="font-semibold">{caseStudy.name}</h2>
      </div>
      <div className={cn("space-y-5 p-4 text-sm", scroll && "flex-1 overflow-y-auto")}>
        <CaseSection title="Overview">
          <Markdown>{sections.overview}</Markdown>
        </CaseSection>
        <CaseSection title="Solution concept">
          <Markdown>{sections.solutionConcept}</Markdown>
        </CaseSection>
        <CaseSection title="Existing technical environment">
          <Markdown>{sections.existingTech}</Markdown>
        </CaseSection>
        <CaseSection title="Business requirements">
          <ul className="list-disc space-y-1 pl-5">
            {sections.businessReqs.map((req, i) => (
              <li key={i}>{req}</li>
            ))}
          </ul>
        </CaseSection>
        <CaseSection title="Technical requirements">
          <ul className="list-disc space-y-1 pl-5">
            {sections.technicalReqs.map((req, i) => (
              <li key={i}>{req}</li>
            ))}
          </ul>
        </CaseSection>
        <CaseSection title="Executive statement">
          <blockquote className="border-l-2 border-brand-500 pl-4 italic text-muted">
            <Markdown>{sections.executiveStatement}</Markdown>
          </blockquote>
        </CaseSection>
        {footer ? <div className="border-t border-line pt-2">{footer}</div> : null}
      </div>
    </div>
  );
}

function CaseStudyDrawer({
  caseStudy,
  open,
  onClose,
}: {
  caseStudy: CaseStudyData;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-opacity lg:hidden",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close case study"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        tabIndex={open ? 0 : -1}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Case study: ${caseStudy.name}`}
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-surface shadow-xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-brand-600" />
            <h2 className="font-semibold">{caseStudy.name}</h2>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CaseStudyPanel caseStudy={caseStudy} />
        </div>
      </aside>
    </div>
  );
}

function CaseSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      <div className="prose-content text-[15px]">{children}</div>
    </section>
  );
}

// ---- helpers --------------------------------------------------------------

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}
