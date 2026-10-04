import "server-only";
import { prisma } from "@/lib/prisma";
import { getDomain } from "@/lib/content";
import type { DomainId } from "@/lib/content/schema";
import { getLLMProvider } from "@/lib/feedback/provider";
import {
  analyzeAnswers,
  weakConceptSlugs,
  type AnswerLike,
  type RuleInsight,
} from "@/lib/feedback/rules";

export type FeedbackKind = "pattern" | "tip" | "strength";
export type FeedbackSource = "rule" | "llm";

export interface FeedbackInsightItem {
  kind: FeedbackKind;
  concepts: string[];
  message: string;
  source: FeedbackSource;
}

export interface FeedbackResult {
  insights: FeedbackInsightItem[];
  generatedAt: string;
}

const RECENT_ANSWER_LIMIT = 200;
const LLM_MAX_TOKENS = 2000;

// Minimum gap between forced ("Refresh analysis") LLM regenerations per user.
// A forced refresh inside this window is served from cache, so a user can't spin
// the button to drive Vertex AI cost.
const FORCE_REFRESH_MIN_MS = 60_000;

// Per-instance cache of the last generated feedback, keyed by user. The key fact
// is the latest answer timestamp: feedback only changes when the user answers
// something new, so an unchanged timestamp means the cached result is still valid
// and we can skip the (expensive) LLM call entirely. Lives on globalThis so it
// survives HMR / module re-eval, exactly like the Prisma client.
type FeedbackCacheEntry = {
  latestAnswerAt: number;
  generatedAtMs: number;
  result: FeedbackResult;
};
const globalForFeedback = globalThis as unknown as {
  feedbackCache?: Map<string, FeedbackCacheEntry>;
};
const feedbackCache: Map<string, FeedbackCacheEntry> = (globalForFeedback.feedbackCache ??=
  new Map());

/** Stable ordering: patterns first, tips in the middle, strengths last. */
const KIND_ORDER: Record<FeedbackKind, number> = {
  pattern: 0,
  tip: 1,
  strength: 2,
};

function sortInsights(items: FeedbackInsightItem[]): FeedbackInsightItem[] {
  return [...items].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

/**
 * Generate intelligent feedback for a user from their recent answers.
 * Always returns deterministic rule-based insights; opportunistically enriches
 * with LLM coaching tips when a provider is available. LLM and persistence are
 * both best-effort and never block the result.
 */
export async function generateFeedback(
  userId: string,
  opts?: { force?: boolean },
): Promise<FeedbackResult> {
  const force = opts?.force ?? false;
  const now = Date.now();
  const generatedAt = new Date(now).toISOString();

  const answers = await prisma.answer.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: RECENT_ANSWER_LIMIT,
  });

  if (answers.length === 0) {
    return {
      insights: [
        {
          kind: "tip",
          concepts: [],
          message:
            "No answers yet — take the diagnostic assessment to unlock personalized feedback on your strengths and weak spots.",
          source: "rule",
        },
      ],
      generatedAt,
    };
  }

  // ---- Cache check -------------------------------------------------------
  // Serve the cached result when the user hasn't answered anything new. A forced
  // refresh bypasses this only once the per-user rate-limit window has elapsed.
  const latestAnswerAt = answers[0].createdAt.getTime();
  const cached = feedbackCache.get(userId);
  if (cached && cached.latestAnswerAt === latestAnswerAt) {
    if (!force || now - cached.generatedAtMs < FORCE_REFRESH_MIN_MS) {
      return cached.result;
    }
  }

  const answerLikes: AnswerLike[] = answers.map((a) => ({
    questionId: a.questionId,
    domainId: a.domainId,
    concepts: a.concepts,
    correct: a.correct,
  }));

  // ---- Deterministic rules ----------------------------------------------
  const ruleInsights: RuleInsight[] = analyzeAnswers(answerLikes);
  const ruleItems: FeedbackInsightItem[] = ruleInsights.map((r) => ({
    ...r,
    source: "rule",
  }));

  // ---- LLM enrichment (best-effort) -------------------------------------
  const weak = weakConceptSlugs(answerLikes);
  const llmItems: FeedbackInsightItem[] = [];
  const llm = getLLMProvider();

  if (llm && weak.length >= 1) {
    try {
      const prompt = buildLLMPrompt(answerLikes, weak);
      const raw = await llm.complete({
        system:
          "You are an encouraging Google Cloud Professional Cloud Architect exam coach. Be specific, concise, and map advice to real GCP best practices. Never invent the student's data.",
        prompt,
        maxTokens: LLM_MAX_TOKENS,
      });
      for (const message of parseLLMTips(raw)) {
        llmItems.push({
          kind: "tip",
          concepts: weak.slice(0, 5),
          message,
          source: "llm",
        });
      }
    } catch {
      // LLM unavailable / errored — silently keep rule insights only.
    }
  }

  const combined = sortInsights([...ruleItems, ...llmItems]);
  const result: FeedbackResult = { insights: combined, generatedAt };

  // Cache for this instance and persist a history row — both only happen here, on
  // an actual (re)generation, so neither grows on cache hits or every page load.
  feedbackCache.set(userId, { latestAnswerAt, generatedAtMs: now, result });
  void persistInsights(userId, combined);

  return result;
}

function buildLLMPrompt(answers: AnswerLike[], weak: string[]): string {
  // Per-domain accuracy summary.
  const domainMap = new Map<string, { total: number; correct: number }>();
  for (const a of answers) {
    const e = domainMap.get(a.domainId) ?? { total: 0, correct: 0 };
    e.total += 1;
    if (a.correct) e.correct += 1;
    domainMap.set(a.domainId, e);
  }

  const domainLines = [...domainMap.entries()]
    .map(([domainId, { total, correct }]) => {
      let title = domainId;
      try {
        title = getDomain(domainId as DomainId)?.shortTitle ?? domainId;
      } catch {
        // unknown domain id — fall back to the raw id
      }
      return `- ${title}: ${Math.round((correct / total) * 100)}% (${correct}/${total})`;
    })
    .join("\n");

  return [
    "A student is preparing for the Google Cloud Professional Cloud Architect exam.",
    "",
    `Weakest concepts (most-missed first): ${weak.slice(0, 8).join(", ")}`,
    "",
    "Per-domain accuracy:",
    domainLines,
    "",
    "Give 2-4 short, specific, encouraging coaching tips that target these weak areas and map to GCP best practices.",
    "Return ONE tip per line, plain text, no numbering, no markdown bullets. Keep each tip under 240 characters.",
  ].join("\n");
}

/** Defensively parse LLM output into 1..4 clean tip strings. */
function parseLLMTips(raw: string): string[] {
  if (!raw) return [];

  // Try JSON array of strings (or objects with a message/tip field) first.
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { tips?: unknown[] }).tips)
          ? (parsed as { tips: unknown[] }).tips
          : [];
      const fromJson = arr
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            const o = item as Record<string, unknown>;
            const v = o.message ?? o.tip ?? o.text;
            return typeof v === "string" ? v : "";
          }
          return "";
        })
        .map(cleanTip)
        .filter(Boolean);
      if (fromJson.length > 0) return fromJson.slice(0, 4);
    } catch {
      // fall through to line parsing
    }
  }

  // Fall back to line-based parsing.
  return trimmed
    .split(/\r?\n/)
    .map(cleanTip)
    .filter(Boolean)
    .slice(0, 4);
}

function cleanTip(line: string): string {
  return line
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "") // strip leading bullets / numbering
    .replace(/^["']|["']$/g, "") // strip wrapping quotes
    .trim();
}

async function persistInsights(
  userId: string,
  items: FeedbackInsightItem[],
): Promise<void> {
  if (items.length === 0) return;
  try {
    await prisma.feedbackInsight.createMany({
      data: items.map((i) => ({
        userId,
        kind: i.kind,
        concepts: i.concepts,
        message: i.message,
        source: i.source,
      })),
    });
  } catch {
    // best-effort: persistence failures must not affect the response.
  }
}
