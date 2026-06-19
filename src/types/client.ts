// Client-safe types (no server-only imports). Shared by the question runners.
import type { Choice, DomainId, CaseStudyId } from "@/lib/content/schema";

export type ClientQuestion = {
  id: string;
  type: "single" | "multiple";
  domainId: DomainId;
  caseStudyId?: CaseStudyId;
  concepts: string[];
  prompt: string;
  choices: Choice[];
  difficulty: 1 | 2 | 3;
};

/** A question with its answer key — only sent to the client for low-stakes quizzes. */
export type RevealQuestion = ClientQuestion & {
  correct: string[];
  explanation: string;
};

export type SubmittedAnswer = {
  questionId: string;
  selected: string[];
  atMs?: number;
};

/** In-progress exam state persisted server-side for crash/reload recovery. */
export type ExamDraft = {
  selections: Record<string, string[]>;
  flagged: Record<string, boolean>;
  timeMs: Record<string, number>;
  updatedAt: string;
};
