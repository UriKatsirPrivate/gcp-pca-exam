"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { QuestionCard } from "@/components/QuestionCard";
import { Button, ProgressBar } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { RevealQuestion } from "@/types/client";
import { submitPoolAnswer } from "./actions";

type PoolResult = { correct: number; total: number; scorePct: number };

/** Local set-equality grading for instant client-side feedback. */
function localIsCorrect(correct: string[], selected: string[]): boolean {
  if (correct.length !== selected.length) return false;
  const s = new Set(selected);
  return correct.every((c) => s.has(c));
}

export function PoolRunner({ questions }: { questions: RevealQuestion[] }) {
  const router = useRouter();
  const total = questions.length;
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [failedToSave, setFailedToSave] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<PoolResult | null>(null);

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

  // Saves the instant a question is checked — not batched to "Finish" — so a
  // candidate who checks a few and leaves keeps that progress toward "seen"
  // instead of losing it because they never finished the set.
  function check(qid: string) {
    const selected = selections[qid];
    if (!selected?.length) return;
    setRevealed((prev) => ({ ...prev, [qid]: true }));
    submitPoolAnswer({ questionId: qid, selected }).catch(() => {
      setFailedToSave((prev) => new Set(prev).add(qid));
    });
  }

  function finish() {
    let correctCount = 0;
    for (const q of questions) {
      if (localIsCorrect(q.correct, selections[q.id] ?? [])) correctCount++;
    }
    setResult({
      correct: correctCount,
      total,
      scorePct: total > 0 ? Math.round((correctCount / total) * 100) : 0,
    });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
  }

  function reviewAnotherDomain() {
    router.push("/exam/pool");
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
              {failedToSave.has(q.id) ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
                  <AlertTriangle size={13} /> Didn&apos;t save — this one may still
                  count as unseen next time.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

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
            Each answer saved as you checked it — reviewed items count as seen
            for future exam draws.
          </p>
          <div className="mt-4">
            <Button type="button" onClick={reviewAnotherDomain}>
              Review another domain
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
          <Button type="button" variant="success" onClick={finish} disabled={!allChecked}>
            <CheckCircle2 size={16} /> Finish
          </Button>
        </div>
      )}
    </div>
  );
}
