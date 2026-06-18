import { DOMAINS, getDomain, getModules } from "@/lib/content";
import type { DomainId } from "@/lib/content/schema";
import type { UserProgress } from "@/lib/progress";

export interface FocusItem {
  domainId: DomainId;
  domainTitle: string;
  reason: string;
  masteryPct: number;
  nextModuleId?: string;
  nextModuleTitle?: string;
}

/**
 * Rank domains by how urgently they need attention. Need blends how far a domain
 * is from mastery with how heavily it's weighted on the exam:
 *   need = (100 - masteryPct) * (weightPct / 100)
 * Fully mastered/complete domains are skipped. Returns up to 4 items, most
 * urgent first. An empty array means the learner is in good shape everywhere.
 */
export function whatToFocusNext(progress: UserProgress): FocusItem[] {
  const scored = DOMAINS.map((domain) => {
    const dp = progress.perDomain[domain.id];
    const masteryPct = dp?.masteryPct ?? 0;
    const need = (100 - masteryPct) * (domain.weightPct / 100);
    return { domain, masteryPct, dp, need };
  })
    // Skip domains that are essentially done: fully mastered and all modules complete.
    .filter(({ masteryPct, dp }) => {
      const allModulesDone =
        dp != null && dp.modulesTotal > 0 && dp.modulesDone >= dp.modulesTotal;
      return !(masteryPct >= 100 || (masteryPct >= 85 && allModulesDone));
    })
    .sort((a, b) => b.need - a.need)
    .slice(0, 4);

  const items: FocusItem[] = [];
  for (const { domain, masteryPct } of scored) {
    const d = getDomain(domain.id);
    const next = getModules(domain.id).find(
      (m) => progress.moduleStatusById[m.id] !== "done",
    );

    items.push({
      domainId: domain.id,
      domainTitle: d.title,
      masteryPct,
      reason: `Mastery is ${masteryPct}% and this domain is worth ${formatPct(
        d.weightPct,
      )}% of the exam.`,
      nextModuleId: next?.id,
      nextModuleTitle: next?.title,
    });
  }

  return items;
}

function formatPct(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
