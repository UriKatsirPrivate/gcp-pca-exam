"use client";

import { Check, X } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ClientQuestion } from "@/types/client";

export type Reveal = {
  correct: string[];
  explanation: string;
  isCorrect: boolean;
};

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * Presentational question card shared by the assessment, quizzes, and exam.
 * Stateless: the parent owns `selected` and grading. When `reveal` is set the
 * inputs lock and correct/incorrect states + explanation are shown.
 */
export function QuestionCard({
  question,
  selected,
  onChange,
  reveal,
  disabled,
  index,
  total,
}: {
  question: ClientQuestion;
  selected: string[];
  onChange: (next: string[]) => void;
  reveal?: Reveal | null;
  disabled?: boolean;
  index?: number;
  total?: number;
}) {
  const locked = disabled || !!reveal;
  const isMulti = question.type === "multiple";

  function toggle(choiceId: string) {
    if (locked) return;
    if (isMulti) {
      onChange(
        selected.includes(choiceId)
          ? selected.filter((c) => c !== choiceId)
          : [...selected, choiceId],
      );
    } else {
      onChange([choiceId]);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted">
        {typeof index === "number" && typeof total === "number" ? (
          <span className="font-medium">
            Question {index + 1} of {total}
          </span>
        ) : null}
        <Badge tone={isMulti ? "info" : "neutral"}>
          {isMulti ? "Select all that apply" : "Single answer"}
        </Badge>
        <Badge tone="neutral">Difficulty {question.difficulty}</Badge>
      </div>

      <div className="prose-content text-[15px]">
        <Markdown>{question.prompt}</Markdown>
      </div>

      <ul className="mt-4 space-y-2">
        {question.choices.map((choice, i) => {
          const isSelected = selected.includes(choice.id);
          const isAnswer = reveal?.correct.includes(choice.id);
          const showWrong = reveal && isSelected && !isAnswer;

          return (
            <li key={choice.id}>
              <button
                type="button"
                onClick={() => toggle(choice.id)}
                disabled={locked}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                  !reveal && isSelected && "border-brand-500 bg-brand-50",
                  !reveal && !isSelected && "border-line hover:bg-surface-2",
                  reveal && isAnswer && "border-success bg-success/10",
                  showWrong && "border-danger bg-danger/10",
                  reveal && !isAnswer && !showWrong && "border-line opacity-70",
                  locked && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    isSelected && !reveal && "border-brand-500 bg-brand-500 text-white",
                    reveal && isAnswer && "border-success bg-success text-white",
                    showWrong && "border-danger bg-danger text-white",
                    !isSelected && !reveal && "border-line",
                  )}
                >
                  {reveal && isAnswer ? (
                    <Check size={14} />
                  ) : showWrong ? (
                    <X size={14} />
                  ) : (
                    LETTERS[i]
                  )}
                </span>
                <span className="pt-0.5">{choice.text}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {reveal ? (
        <div
          className={cn(
            "mt-4 rounded-lg border p-4",
            reveal.isCorrect
              ? "border-success/40 bg-success/5"
              : "border-danger/40 bg-danger/5",
          )}
        >
          <div
            className={cn(
              "mb-1 flex items-center gap-2 text-sm font-semibold",
              reveal.isCorrect ? "text-success" : "text-danger",
            )}
          >
            {reveal.isCorrect ? <Check size={16} /> : <X size={16} />}
            {reveal.isCorrect ? "Correct" : "Not quite"}
          </div>
          <div className="prose-content text-sm">
            <Markdown>{reveal.explanation}</Markdown>
          </div>
        </div>
      ) : null}
    </div>
  );
}
