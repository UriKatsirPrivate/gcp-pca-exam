import { DOMAINS, getDomain, getModules } from "@/lib/content";
import type { DomainId } from "@/lib/content/schema";
import { proficiencyFromPct, studyPriority } from "@/lib/scoring";

export interface StudyPlanMilestone {
  order: number;
  domainId: DomainId;
  domainTitle: string;
  moduleIds: string[];
  estMinutes: number;
  priority: number;
  weekStart: number;
  targetDate: string;
}

/**
 * Build an ordered list of study milestones (one per domain) from per-domain
 * percentages. Weaker + higher-weight domains get a higher priority and are
 * scheduled earlier. Milestones are packed into weekly time budgets and stamped
 * with an ISO target date.
 */
export function generateMilestones(
  perDomainPct: Record<DomainId, number>,
  opts: { weeks: number; hoursPerWeek: number },
): StudyPlanMilestone[] {
  const weeks = Math.max(1, Math.floor(opts.weeks));
  const weeklyBudget = Math.max(1, Math.floor(opts.hoursPerWeek)) * 60; // minutes

  // Compute priority + workload for each domain.
  const scored = DOMAINS.map((domain) => {
    const pct = perDomainPct[domain.id] ?? 0;
    const priority = studyPriority(
      { correct: 0, total: 0, pct, proficiency: proficiencyFromPct(pct) },
      domain.weightPct,
    );
    const moduleIds = getModules(domain.id).map((m) => m.id);
    const estMinutes = getModules(domain.id).reduce((s, m) => s + m.estMinutes, 0);
    return { domain, priority, moduleIds, estMinutes };
  });

  // Weak + high-weight first.
  scored.sort((a, b) => b.priority - a.priority);

  const now = new Date();

  // Pack each domain's est time into weekly budgets, never exceeding `weeks`.
  let currentWeek = 1; // 1-based
  let usedThisWeek = 0;

  return scored.map((s, i) => {
    // If this domain's load doesn't fit in the remaining room of the current
    // week (and we already placed something this week), advance a week —
    // but never roll past the final week.
    if (usedThisWeek > 0 && usedThisWeek + s.estMinutes > weeklyBudget && currentWeek < weeks) {
      currentWeek += 1;
      usedThisWeek = 0;
    }

    const weekStart = currentWeek;
    usedThisWeek += s.estMinutes;

    // A single domain can exceed one week's budget; spill into following weeks.
    while (usedThisWeek >= weeklyBudget && currentWeek < weeks) {
      currentWeek += 1;
      usedThisWeek -= weeklyBudget;
    }

    const target = new Date(now);
    target.setDate(target.getDate() + (weekStart - 1) * 7);
    const targetDate = target.toISOString().slice(0, 10);

    return {
      order: i + 1,
      domainId: s.domain.id,
      domainTitle: getDomain(s.domain.id).title,
      moduleIds: s.moduleIds,
      estMinutes: s.estMinutes,
      priority: s.priority,
      weekStart,
      targetDate,
    };
  });
}

/** Total estimated study time across all milestones, in hours (1 decimal). */
export function totalEstimatedHours(milestones: StudyPlanMilestone[]): number {
  const minutes = milestones.reduce((s, m) => s + m.estMinutes, 0);
  return Math.round((minutes / 60) * 10) / 10;
}
