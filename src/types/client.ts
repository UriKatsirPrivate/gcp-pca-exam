// Client-safe types (no server-only imports). Shared by the question runners.
import type { CaseStudyId, DomainId, Exhibit } from "@/lib/content/schema";

/** An option as sent during an active attempt: no rationale, order shuffled. */
export type ClientChoice = { id: string; text: string };

/** An option on a review screen: carries why it is right or wrong. */
export type RevealChoice = ClientChoice & { rationale?: string };

export type ClientQuestion = {
  id: string;
  type: "single" | "multiple";
  domainId: DomainId;
  caseStudyId?: CaseStudyId;
  concepts: string[];
  prompt: string;
  exhibit: Exhibit | null;
  choices: ClientChoice[];
  difficulty: 1 | 2 | 3;
};

/** A question with its answer key — only sent to the client for low-stakes quizzes. */
export type RevealQuestion = Omit<ClientQuestion, "choices"> & {
  choices: RevealChoice[];
  correct: string[];
  explanation?: string;
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
