import { DOMAIN_IDS, type DomainId, type Proficiency } from "@/lib/content/schema";

export interface DomainScore {
  correct: number;
  total: number;
  pct: number;
  proficiency: Proficiency;
}

export type PerDomainScore = Record<DomainId, DomainScore>;

/** Map a percentage (0-100) to a proficiency band. */
export function proficiencyFromPct(pct: number): Proficiency {
  if (pct >= 85) return "expert";
  if (pct >= 70) return "proficient";
  if (pct >= 50) return "developing";
  return "novice";
}

export interface GradedItem {
  domainId: DomainId;
  correct: boolean;
}

/** Aggregate graded items into per-domain scores (every domain present, even if 0 questions). */
export function scoreByDomain(items: GradedItem[]): PerDomainScore {
  const acc = {} as PerDomainScore;
  for (const id of DOMAIN_IDS) {
    acc[id] = { correct: 0, total: 0, pct: 0, proficiency: "novice" };
  }
  for (const it of items) {
    const d = acc[it.domainId];
    if (!d) continue;
    d.total += 1;
    if (it.correct) d.correct += 1;
  }
  for (const id of DOMAIN_IDS) {
    const d = acc[id];
    d.pct = d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0;
    d.proficiency = proficiencyFromPct(d.pct);
  }
  return acc;
}

export function overallPct(items: GradedItem[]): number {
  if (items.length === 0) return 0;
  const correct = items.filter((i) => i.correct).length;
  return Math.round((correct / items.length) * 100);
}

/**
 * Priority weight for study-plan ordering: weaker domains and higher exam weight
 * both increase priority. Returns a sortable number (higher = study sooner).
 */
export function studyPriority(score: DomainScore, examWeightPct: number): number {
  const gap = (100 - score.pct) / 100; // 0..1, larger when weaker
  return Math.round(gap * examWeightPct * 10) / 10;
}
