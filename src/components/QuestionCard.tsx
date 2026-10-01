"use client";

import { Check, ExternalLink, FileText, X } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { docsForConcepts } from "@/lib/concept-docs";
import type { Exhibit } from "@/lib/content/schema";
import type { ClientQuestion, RevealChoice } from "@/types/client";

export type Reveal = {
  correct: string[];
  explanation?: string;
  isCorrect: boolean;
};

/**
 * What the card can render. Widened over `ClientQuestion` so a `RevealQuestion`
 * (whose choices carry `rationale`) passes through unchanged — during an active
 * attempt the rationale is simply absent, and it is only ever rendered once
 * `reveal` is set.
 */
export type CardQuestion = Omit<ClientQuestion, "choices"> & {
  choices: RevealChoice[];
};

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * Presentational question card shared by the assessment, quizzes, and exam.
 * Stateless w.r.t. answering: the parent owns `selected` and grading. When
 * `reveal` is set the inputs lock, correct/incorrect states show, and each
 * option's own rationale is rendered beneath it.
 *
 * Choice order is shuffled server-side (see `toClientQuestion`), so nothing here
 * may depend on authored order — the A/B/C/D badges label display position only.
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
  question: CardQuestion;
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

  const docs = reveal ? docsForConcepts(question.concepts) : [];

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

      <Markdown className="text-[15px]">{question.prompt}</Markdown>

      {question.exhibit ? <ExhibitBlock exhibit={question.exhibit} /> : null}

      <ul className="mt-4 space-y-2">
        {question.choices.map((choice, i) => {
          const isSelected = selected.includes(choice.id);
          const isAnswer = reveal?.correct.includes(choice.id);
          const showWrong = reveal && isSelected && !isAnswer;
          const rationale = reveal ? choice.rationale : undefined;

          return (
            <li
              key={choice.id}
              className={cn(
                "overflow-hidden rounded-lg border transition-colors",
                !reveal && isSelected && "border-brand-500 bg-brand-50",
                !reveal && !isSelected && "border-line hover:bg-surface-2",
                reveal && isAnswer && "border-success bg-success/10",
                showWrong && "border-danger bg-danger/10",
                reveal && !isAnswer && !showWrong && "border-line opacity-80",
              )}
            >
              <button
                type="button"
                onClick={() => toggle(choice.id)}
                disabled={locked}
                className={cn(
                  "flex w-full items-start gap-3 p-3 text-left text-sm",
                  locked && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    isSelected && !reveal && "border-brand-500 bg-brand-500 text-background",
                    reveal && isAnswer && "border-success bg-success text-background",
                    showWrong && "border-danger bg-danger text-background",
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

              {/* The rationale for a keyed option the candidate did NOT pick is
                  the whole teaching moment, so it renders for every option that
                  has one — not just the selected ones. */}
              {rationale ? (
                <div className="border-t border-line/60 px-3 pb-3 pt-2 sm:pl-12">
                  <div
                    className={cn(
                      "mb-1 text-[11px] font-semibold uppercase tracking-wide",
                      isAnswer ? "text-success" : "text-muted",
                    )}
                  >
                    {/* A keyed option the candidate did not pick has to say so.
                        On a select-all item the keys all render green, so
                        without this the one they missed looks exactly like the
                        ones they got right. */}
                    {isAnswer
                      ? isSelected
                        ? "Why this is keyed"
                        : "Why this is keyed — you missed this"
                      : "Why this is wrong"}
                  </div>
                  <Markdown className="text-[13px] leading-relaxed">
                    {rationale}
                  </Markdown>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {reveal ? (
        <div className="mt-4 space-y-3">
          <div
            className={cn(
              "flex items-center gap-2 text-sm font-semibold",
              reveal.isCorrect ? "text-success" : "text-danger",
            )}
          >
            {reveal.isCorrect ? <Check size={16} /> : <X size={16} />}
            {reveal.isCorrect ? "Correct" : "Not quite"}
          </div>

          {/* Only shown when the item carries an overall takeaway that doesn't
              belong to any single option — per-option reasoning lives above. */}
          {reveal.explanation ? (
            <div
              className={cn(
                "rounded-lg border p-4",
                reveal.isCorrect
                  ? "border-success/40 bg-success/5"
                  : "border-danger/40 bg-danger/5",
              )}
            >
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Summary
              </div>
              <Markdown className="text-sm">{reveal.explanation}</Markdown>
            </div>
          ) : null}

          {docs.length > 0 ? (
            <div className="border-t border-line/60 pt-3">
              <div className="mb-1.5 text-xs font-semibold text-muted">Learn more</div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {docs.map((doc) => (
                  <li key={doc.url}>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      {doc.label}
                      <ExternalLink size={12} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---- Exhibit ---------------------------------------------------------------

/**
 * An evidence artifact shown with the stem — trace, log, config, code, cost or
 * eval table. `table` is authored as GFM and rendered as markdown; everything
 * else is reproduced verbatim in a monospace block.
 */
function ExhibitBlock({ exhibit }: { exhibit: Exhibit }) {
  return (
    <figure className="mt-4 overflow-hidden rounded-lg border border-line bg-surface-2">
      <figcaption className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <FileText size={14} className="shrink-0 text-muted" />
        <span className="text-xs font-semibold">{exhibit.label}</span>
        <Badge tone="neutral">{exhibit.format}</Badge>
        {exhibit.language ? (
          <span className="font-mono text-[11px] text-muted">{exhibit.language}</span>
        ) : null}
      </figcaption>
      {exhibit.format === "table" ? (
        <div className="overflow-x-auto p-3">
          <Markdown className="text-sm">{exhibit.content}</Markdown>
        </div>
      ) : (
        // `whitespace-pre`, not `pre-wrap`: these exhibits are column-aligned
        // logs, traces and configs, and the alignment IS the evidence the item
        // turns on. Wrapping reflows a continuation flush to column 0, where it
        // reads as a new log row — verified on a narrow viewport, where a
        // two-line entry became indistinguishable from two entries. Scrolling
        // horizontally is the lesser evil, and it is what `overflow-x-auto`
        // was there for all along.
        <pre className="overflow-x-auto whitespace-pre p-3 font-mono text-xs leading-relaxed">
          {exhibit.content}
        </pre>
      )}
    </figure>
  );
}
