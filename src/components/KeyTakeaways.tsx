import type { Takeaway } from "@/lib/content/schema";

/**
 * Numbered takeaway cards plus an optional "Sources" list. Callers own the
 * section heading (e.g. the "Key takeaways" h2 on the domain page).
 */
export function KeyTakeaways({
  takeaways,
  sources,
}: {
  takeaways: Takeaway[];
  sources?: string[];
}) {
  return (
    <>
      <ul className="space-y-3">
        {takeaways.map((t, i) => (
          <li
            key={i}
            className="flex items-start gap-4 rounded-xl border border-line bg-surface p-4"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t.title}</div>
              <p className="mt-0.5 text-sm text-muted">{t.body}</p>
            </div>
          </li>
        ))}
      </ul>
      {sources && sources.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Sources
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {sources.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
