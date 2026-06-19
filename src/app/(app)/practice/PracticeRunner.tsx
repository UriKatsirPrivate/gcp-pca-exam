"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { QuestionCard } from "@/components/QuestionCard";
import { Button, ProgressBar } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { RevealQuestion } from "@/types/client";
import { submitPractice, type PracticeResult } from "./actions";

/** Local set-equality grading for instant client-side feedback. */
function localIsCorrect(correct: string[], selected: string[]): boolean {
  if (correct.length !== selected.length) return false;
  const s = new Set(selected);
  return correct.every((c) => s.has(c));
}

export function PracticeRunner({ questions }: { questions: RevealQuestion[] }) {
  const router = useRouter();
  const total = questions.length;
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const checkedCount = useMemo(
    () => questions.filter((q) => revealed[q.id]).length,
    [questions, revealed],
  );
  const allChecked = checkedCount === total && total > 0;
  const progressPct = total > 0 ? (checkedCount / total) * 100 : 0;

  function setSelection(qid: string, next: string[]) {
    if (revealed[qid] || result) return;
    setSelections((prev) => ({ ...prev, [qid]: next }));
  }

  function check(qid: string) {
    if (!selections[qid]?.length) return;
    setRevealed((prev) => ({ ...prev, [qid]: true }));
  }

  function finish() {
    setError(null);
    const answers = questions.map((q) => ({
      questionId: q.id,
      selected: selections[q.id] ?? [],
    }));
    startTransition(async () => {
      try {
        const res = await submitPractice(answers);
        setResult(res);
        if (typeof window !== "undefined") {
          window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        }
      } catch {
        setError("Something went wrong saving your practice. Please try again.");
      }
    });
  }

  function nextSet() {
    // Re-run the server component to draw a fresh set.
    router.refresh();
    setSelections({});
    setRevealed({});
    setResult(null);
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div>
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">
            {checkedCount} of {total} checked
          </span>
          <span className="text-muted">{Math.round(progressPct)}%</span>
        </div>
        <ProgressBar value={progressPct} tone={allChecked ? "success" : "brand"} />
      </div>

      <div className="space-y-5">
        {questions.map((q, i) => {
          const selected = selections[q.id] ?? [];
          const isRevealed = !!revealed[q.id];
          const reveal = isRevealed
            ? {
                correct: q.correct,
                explanation: q.explanation,
                isCorrect: localIsCorrect(q.correct, selected),
              }
            : null;

          return (
            <div key={q.id}>
              <QuestionCard
                question={q}
                selected={selected}
                onChange={(next) => setSelection(q.id, next)}
                reveal={reveal}
                disabled={!!result}
                index={i}
                total={total}
              />
              {!isRevealed && !result ? (
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => check(q.id)}
                    disabled={selected.length === 0}
                  >
                    Check answer
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div
          className={cn(
            "mt-6 rounded-xl border p-5",
            result.scorePct >= 80
              ? "border-success/40 bg-success/5"
              : result.scorePct >= 50
                ? "border-warning/40 bg-warning/5"
                : "border-danger/40 bg-danger/5",
          )}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-success" />
            <h3 className="text-lg font-semibold">
              You scored {result.correct} / {result.total} ({result.scorePct}%)
            </h3>
          </div>
          <p className="mt-1 text-sm text-muted">
            Saved to your progress — your weak spots update as you practice.
          </p>
          <div className="mt-4">
            <Button type="button" onClick={nextSet}>
              <RefreshCw size={15} /> Practice another set
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex items-center justify-between gap-3">
          {!allChecked ? (
            <p className="text-xs text-muted">Check all {total} questions to finish.</p>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="success"
            onClick={finish}
            disabled={!allChecked || isPending}
            aria-busy={isPending}
          >
            {isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Saving…
              </>
            ) : (
              <>
                <CheckCircle2 size={16} /> Finish & save
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
