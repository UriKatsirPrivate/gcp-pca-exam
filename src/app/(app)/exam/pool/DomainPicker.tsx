"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LayoutGrid } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DomainId } from "@/lib/content/schema";

export function DomainPicker({
  domains,
  countByDomain,
  unseenByDomain,
}: {
  domains: { id: DomainId; shortTitle: string }[];
  countByDomain: Partial<Record<DomainId, number>>;
  unseenByDomain: Partial<Record<DomainId, number>>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<DomainId>>(new Set());
  const [unseenOnly, setUnseenOnly] = useState(false);
  const allSelected = selected.size === domains.length;
  const totalUnseen = domains.reduce((sum, d) => sum + (unseenByDomain[d.id] ?? 0), 0);

  function toggle(id: DomainId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(domains.map((d) => d.id)));
  }

  function review() {
    if (selected.size === 0) return;
    const params = new URLSearchParams();
    for (const id of selected) params.append("domain", id);
    if (unseenOnly) params.set("unseenOnly", "1");
    router.push(`/exam/pool?${params.toString()}`);
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={toggleAll}
          className={cn(
            "flex flex-1 items-center gap-3 rounded-lg border p-3 text-left text-sm font-medium transition-colors",
            allSelected
              ? "border-brand-500 bg-brand-50"
              : "border-line hover:bg-surface-2",
          )}
        >
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
              allSelected ? "border-brand-500 bg-brand-500 text-background" : "border-line",
            )}
          >
            {allSelected ? <Check size={13} /> : null}
          </span>
          <LayoutGrid size={15} className="text-muted" />
          <span className="flex-1">Select all domains</span>
          <Badge tone={totalUnseen > 0 ? "success" : "neutral"}>{totalUnseen} unseen</Badge>
        </button>

        <label
          className={cn(
            "flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors",
            unseenOnly ? "border-brand-500 bg-brand-50" : "border-line hover:bg-surface-2",
          )}
        >
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
              unseenOnly ? "border-brand-500 bg-brand-500 text-background" : "border-line",
            )}
          >
            {unseenOnly ? <Check size={13} /> : null}
          </span>
          <input
            type="checkbox"
            checked={unseenOnly}
            onChange={(e) => setUnseenOnly(e.target.checked)}
            className="sr-only"
          />
          Only show unseen questions
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {domains.map((d) => {
          const isSelected = selected.has(d.id);
          const count = countByDomain[d.id] ?? 0;
          const unseen = unseenByDomain[d.id] ?? 0;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => toggle(d.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                isSelected ? "border-brand-500 bg-brand-50" : "border-line hover:bg-surface-2",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                  isSelected ? "border-brand-500 bg-brand-500 text-background" : "border-line",
                )}
              >
                {isSelected ? <Check size={13} /> : null}
              </span>
              <span className="flex-1">{d.shortTitle}</span>
              <Badge tone={unseen > 0 ? "success" : "neutral"}>{unseen} unseen</Badge>
              <Badge tone="neutral">{count} total</Badge>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {selected.size === 0
            ? "Pick at least one domain."
            : `${selected.size} of ${domains.length} domains selected.`}
        </p>
        <Button type="button" onClick={review} disabled={selected.size === 0}>
          Review selected
        </Button>
      </div>
    </div>
  );
}
