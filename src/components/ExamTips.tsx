import Link from "next/link";
import { ChevronRight, Lightbulb } from "lucide-react";
import type { DomainId } from "@/lib/content/schema";
import type { ExamTipGroup } from "@/lib/content";
import { Markdown } from "@/components/Markdown";

/**
 * A domain's exam tips, grouped by module and collapsed behind a native
 * <details> so the Review page stays scannable. Native (not a client
 * accordion) so it needs no JS and browser find-in-page can still open it.
 */
export function ExamTips({
  domainId,
  groups,
}: {
  domainId: DomainId;
  groups: ExamTipGroup[];
}) {
  if (groups.length === 0) return null;
  const total = groups.reduce((n, g) => n + g.tips.length, 0);

  return (
    <details className="group mt-3 rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-medium hover:text-brand-700 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={16}
          className="shrink-0 text-muted transition-transform group-open:rotate-90"
        />
        <Lightbulb size={16} className="shrink-0 text-brand-600" />
        Exam tips
        <span className="text-muted">({total})</span>
      </summary>

      <div className="space-y-5 border-t border-line p-5 pt-4">
        {groups.map((g) => (
          <div key={g.moduleId}>
            {/* `#top` for the same reason as the domain links on /review —
                without it the router's topOfElementInViewport early-exit
                leaves the target page scrolled part-way down. */}
            <Link
              href={`/learn/${domainId}/${g.moduleId}#top`}
              className="text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand-700"
            >
              {g.moduleTitle}
            </Link>
            {/* Tips are inline markdown (bold lead-ins), so re-emit them as a
                list and let the shared renderer handle the formatting. */}
            <Markdown className="text-sm">
              {g.tips.map((t) => `- ${t}`).join("\n")}
            </Markdown>
          </div>
        ))}
      </div>
    </details>
  );
}
