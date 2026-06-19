import { Dumbbell, Target } from "lucide-react";
import {
  DOMAINS,
  getDomain,
  getQuestion,
  getQuestionsByConcept,
  getQuestionsByDomain,
  toClientQuestion,
} from "@/lib/content";
import { DOMAIN_IDS, type DomainId, type Question } from "@/lib/content/schema";
import { weakConceptSlugs } from "@/lib/feedback/rules";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import type { RevealQuestion } from "@/types/client";
import { PracticeRunner } from "./PracticeRunner";

export const dynamic = "force-dynamic";

const PRACTICE_SIZE = 12;
const MAX_MISSED = 6;
const RECENT_ANSWER_LIMIT = 200;

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  const user = await requireUser();
  const { domain } = await searchParams;
  const domainId: DomainId | null = DOMAIN_IDS.includes(domain as DomainId)
    ? (domain as DomainId)
    : null;

  let picked: Question[] = [];
  let heading = "Drill your weak spots";
  let subtitle = "Targeted practice from the concepts you miss most.";
  let weakConcepts: string[] = [];

  if (domainId) {
    // Explicit domain practice (also the fallback for users with no history).
    picked = shuffle(getQuestionsByDomain(domainId)).slice(0, PRACTICE_SIZE);
    heading = `Practice · ${getDomain(domainId).shortTitle}`;
    subtitle = "A random set from this domain. Check each answer as you go.";
  } else {
    const answers = await prisma.answer.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: RECENT_ANSWER_LIMIT,
      select: { questionId: true, domainId: true, concepts: true, correct: true },
    });

    weakConcepts = weakConceptSlugs(answers);
    const missedIds = [
      ...new Set(answers.filter((a) => !a.correct).map((a) => a.questionId)),
    ];

    const byId = new Map<string, Question>();
    // Re-drill a few recent misses first…
    for (const id of missedIds) {
      const q = getQuestion(id);
      if (q) byId.set(id, q);
      if (byId.size >= MAX_MISSED) break;
    }
    // …then fill with fresh questions on the weak concepts.
    for (const q of getQuestionsByConcept(weakConcepts, {
      limit: PRACTICE_SIZE,
      excludeIds: new Set(byId.keys()),
    })) {
      if (byId.size >= PRACTICE_SIZE) break;
      byId.set(q.id, q);
    }
    picked = shuffle([...byId.values()]);
  }

  // No history yet (or domain has no questions): offer a domain picker.
  if (picked.length === 0) {
    return (
      <div className="space-y-6">
        <PracticeHeader heading="Practice" subtitle="Pick a domain to start drilling." />
        <EmptyState
          title="Nothing to drill yet"
          body="Answer some quiz or diagnostic questions and your weak spots will show up here automatically. Or jump straight into a domain below."
        />
        <DomainPicker />
      </div>
    );
  }

  const questions: RevealQuestion[] = picked.map((q) => ({
    ...toClientQuestion(q),
    correct: q.correct,
    explanation: q.explanation,
  }));

  return (
    <div className="space-y-6">
      <PracticeHeader heading={heading} subtitle={subtitle} />

      {!domainId && weakConcepts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Focus concepts:</span>
          {weakConcepts.slice(0, 6).map((c) => (
            <Badge key={c} tone="warning">
              {c}
            </Badge>
          ))}
        </div>
      ) : null}

      <PracticeRunner questions={questions} />

      <Card>
        <CardHeader title="Practice a specific domain" icon={<Target className="h-5 w-5" />} />
        <CardBody>
          <DomainPicker />
        </CardBody>
      </Card>
    </div>
  );
}

function PracticeHeader({ heading, subtitle }: { heading: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-brand-600">
        <Dumbbell className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold">{heading}</h1>
        <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function DomainPicker() {
  return (
    <div className="flex flex-wrap gap-2">
      {DOMAINS.map((d) => (
        <ButtonLink
          key={d.id}
          href={`/practice?domain=${d.id}`}
          variant="secondary"
          size="sm"
        >
          {d.shortTitle}
        </ButtonLink>
      ))}
    </div>
  );
}

/** Server-side sample helper (Math.random is fine here, not in render-pure code). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
