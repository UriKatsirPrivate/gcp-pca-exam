"use client";

import { useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { QuestionCard } from "@/components/QuestionCard";
import { Button } from "@/components/ui";
import type { RevealQuestion } from "@/types/client";

export type ReviewItem = {
  question: RevealQuestion;
  selected: string[];
  isCorrect: boolean;
};

/**
 * Post-attempt question-by-question review. Reuses QuestionCard in `reveal` mode
 * (locked inputs, correct/incorrect highlighting, explanation + doc links) and
 * offers an "incorrect only" filter so learners can drill straight into misses.
 */
export function AnswerReview({ items }: { items: ReviewItem[] }) {
  const [incorrectOnly, setIncorrectOnly] = useState(false);

  const correctCount = useMemo(
    () => items.filter((it) => it.isCorrect).length,
    [items],
  );
  const incorrectCount = items.length - correctCount;

  const shown = incorrectOnly ? items.filter((it) => !it.isCorrect) : items;

  if (items.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <ListChecks size={16} /> Review your answers
        </h2>
        <Button
          type="button"
          variant={incorrectOnly ? "primary" : "secondary"}
          size="sm"
          onClick={() => setIncorrectOnly((v) => !v)}
          aria-pressed={incorrectOnly}
          disabled={incorrectCount === 0}
        >
          {incorrectOnly
            ? `Showing ${incorrectCount} incorrect`
            : `Show incorrect only (${incorrectCount})`}
        </Button>
      </div>

      <p className="text-sm text-muted">
        {correctCount} correct · {incorrectCount} incorrect of {items.length}.
      </p>

      <div className="space-y-5">
        {shown.map((it) => {
          const originalIndex = items.indexOf(it);
          return (
            <QuestionCard
              key={it.question.id}
              question={it.question}
              selected={it.selected}
              onChange={() => {}}
              reveal={{
                correct: it.question.correct,
                explanation: it.question.explanation,
                isCorrect: it.isCorrect,
              }}
              index={originalIndex}
              total={items.length}
            />
          );
        })}
      </div>
    </section>
  );
}
