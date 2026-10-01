import { ArrowLeft, Layers } from "lucide-react";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { DOMAINS, getExamOnlyQuestions, toRevealQuestion } from "@/lib/content";
import type { DomainId, Question } from "@/lib/content/schema";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import type { RevealQuestion } from "@/types/client";
import { DomainPicker } from "./DomainPicker";
import { PoolRunner } from "./PoolRunner";

export const dynamic = "force-dynamic";

export default async function ExamPoolPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string | string[]; unseenOnly?: string }>;
}) {
  const user = await requireUser();
  const { domain, unseenOnly: unseenOnlyParam } = await searchParams;
  const requested = Array.isArray(domain) ? domain : domain ? [domain] : [];
  const domainIds = DOMAINS.map((d) => d.id).filter((id) =>
    requested.includes(id),
  ) as DomainId[];
  const unseenOnly = unseenOnlyParam === "1";

  const examOnly = getExamOnlyQuestions();
  const countByDomain: Partial<Record<DomainId, number>> = {};
  for (const q of examOnly) {
    countByDomain[q.domainId] = (countByDomain[q.domainId] ?? 0) + 1;
  }

  // "Unseen" mirrors generateExam's own definition — never answered by this
  // user in ANY context (quiz, practice, drill, a prior exam, or this pool) —
  // so the count here tells the candidate exactly what a real simulation still
  // has fresh to draw from.
  const seenRows = await prisma.answer.findMany({
    where: { userId: user.id },
    select: { questionId: true },
    distinct: ["questionId"],
  });
  const seenIds = new Set(seenRows.map((r) => r.questionId));
  let unseenTotal = 0;
  const unseenByDomain: Partial<Record<DomainId, number>> = {};
  for (const q of examOnly) {
    if (!seenIds.has(q.id)) {
      unseenTotal++;
      unseenByDomain[q.domainId] = (unseenByDomain[q.domainId] ?? 0) + 1;
    }
  }

  if (domainIds.length === 0) {
    return (
      <div className="space-y-6">
        <PoolHeader total={examOnly.length} unseen={unseenTotal} />
        <Card>
          <CardHeader
            title="Pick one or more domains"
            subtitle="Each domain's held-out set is small enough to review in one sitting — combine as many as you like."
            icon={<Layers className="h-5 w-5" />}
          />
          <CardBody>
            <DomainPicker
              domains={DOMAINS}
              countByDomain={countByDomain}
              unseenByDomain={unseenByDomain}
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  // A single domain reads in its authored order. Combining domains mixes them
  // like the simulation exam does, rather than showing one domain's block
  // followed by the next.
  const inDomains = examOnly.filter((q) => domainIds.includes(q.domainId));
  const mixed = domainIds.length > 1 ? mixAcrossDomains(inDomains) : inDomains;
  const filtered = unseenOnly ? filterUnseen(mixed, seenIds) : mixed;
  const picked = prioritizeUnseen(filtered, seenIds);

  if (picked.length === 0) {
    return (
      <div className="space-y-6">
        <PoolHeader total={examOnly.length} unseen={unseenTotal} />
        <EmptyState
          title={unseenOnly ? "Nothing unseen left here" : "Nothing held out here"}
          body={
            unseenOnly
              ? "You've answered every held-out question in these domains. Turn off \"Unseen only\" to review them again."
              : "These domains have no examOnly questions."
          }
        />
      </div>
    );
  }

  const questions: RevealQuestion[] = picked.map((q) =>
    toRevealQuestion(q, { seed: user.id }),
  );

  const domainTitle = DOMAINS.filter((d) => domainIds.includes(d.id))
    .map((d) => d.shortTitle)
    .join(", ");
  const unseenInSelection = picked.filter((q) => !seenIds.has(q.id)).length;

  return (
    <div className="space-y-6">
      <PoolHeader
        total={examOnly.length}
        unseen={unseenTotal}
        domainTitle={domainTitle}
        selectionCount={picked.length}
        selectionUnseen={unseenInSelection}
      />
      <PoolRunner questions={questions} />
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

/**
 * Round-robin questions across domains so multiple domains never read as one
 * domain's block followed by the next. A plain shuffle is drawn uniformly from
 * every permutation, which occasionally still deals a domain's questions
 * consecutively; round-robin instead pulls at most one question per domain per
 * pass (each pass in a freshly randomized domain order).
 */
function mixAcrossDomains(qs: Question[]): Question[] {
  const byDomain = new Map<DomainId, Question[]>();
  for (const q of qs) {
    const arr = byDomain.get(q.domainId) ?? [];
    arr.push(q);
    byDomain.set(q.domainId, arr);
  }
  const queues = [...byDomain.values()].map((items) => shuffle(items));

  const out: Question[] = [];
  while (queues.some((q) => q.length > 0)) {
    for (const i of shuffle(queues.map((_, i) => i))) {
      const next = queues[i].shift();
      if (next) out.push(next);
    }
  }
  return out;
}

/**
 * Unseen questions first, seen ones last — preserving each group's relative
 * order so this composes with mixAcrossDomains' interleaving instead of
 * undoing it.
 */
function prioritizeUnseen(qs: Question[], seenIds: Set<string>): Question[] {
  return [...qs.filter((q) => !seenIds.has(q.id)), ...qs.filter((q) => seenIds.has(q.id))];
}

/** Drops questions the candidate has already answered. */
function filterUnseen(qs: Question[], seenIds: Set<string>): Question[] {
  return qs.filter((q) => !seenIds.has(q.id));
}

function PoolHeader({
  total,
  unseen,
  domainTitle,
  selectionCount,
  selectionUnseen,
}: {
  total: number;
  unseen: number;
  domainTitle?: string;
  selectionCount?: number;
  selectionUnseen?: number;
}) {
  return (
    <div className="space-y-2">
      <ButtonLink href="/exam" variant="ghost" size="sm">
        <ArrowLeft size={14} /> Back to Exam
      </ButtonLink>
      <div>
        <h1 className="text-2xl font-semibold">
          Held-out pool{domainTitle ? ` · ${domainTitle}` : ""}
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          {typeof selectionCount === "number" && typeof selectionUnseen === "number" ? (
            <>
              {selectionUnseen} of {selectionCount} questions here are still unseen —
              reviewing them now uses up that freshness for a future simulation exam.{" "}
            </>
          ) : (
            <>{unseen} of {total} questions across all domains are still unseen. </>
          )}
          These are held out so your first simulation exam draws mostly-fresh
          items. Review them here with the answer revealed right after each one
          — doing so marks them seen, the same as answering them in a quiz or
          drill.
        </p>
      </div>
    </div>
  );
}
