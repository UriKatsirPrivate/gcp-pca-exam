"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
} from "@/components/ui";
import { cn } from "@/lib/cn";

type FeedbackKind = "pattern" | "tip" | "strength";
type FeedbackSource = "rule" | "llm";

interface FeedbackInsightItem {
  kind: FeedbackKind;
  concepts: string[];
  message: string;
  source: FeedbackSource;
}

interface FeedbackResult {
  insights: FeedbackInsightItem[];
  generatedAt: string;
}

const KIND_META: Record<
  FeedbackKind,
  { Icon: typeof AlertTriangle; iconClass: string; badge: "warning" | "info" | "success"; label: string }
> = {
  pattern: {
    Icon: AlertTriangle,
    iconClass: "text-warning",
    badge: "warning",
    label: "Weak spot",
  },
  tip: {
    Icon: Lightbulb,
    iconClass: "text-info",
    badge: "info",
    label: "Tip",
  },
  strength: {
    Icon: CheckCircle2,
    iconClass: "text-success",
    badge: "success",
    label: "Strength",
  },
};

export function FeedbackPanel({ className }: { className?: string }) {
  const [data, setData] = useState<FeedbackResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (method: "GET" | "POST") => {
    const isRefresh = method === "POST";
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", { method });
      if (!res.ok) {
        throw new Error(
          res.status === 401 ? "Sign in to see your feedback." : "Couldn't load feedback.",
        );
      }
      const json = (await res.json()) as FeedbackResult;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount data load (external system sync), not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load("GET");
  }, [load]);

  const insights = data?.insights ?? [];

  return (
    <Card className={cn(className)}>
      <CardHeader
        title="Feedback"
        subtitle={
          data?.generatedAt
            ? `Updated ${new Date(data.generatedAt).toLocaleString()}`
            : "Personalized coaching from your recent answers"
        }
        icon={<Sparkles className="h-5 w-5" />}
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void load("POST")}
            disabled={loading || refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh analysis
          </Button>
        }
      />
      <CardBody>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing your answers…
          </div>
        ) : error ? (
          <EmptyState
            title="Couldn't load feedback"
            body={error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load("GET")}>
                Try again
              </Button>
            }
          />
        ) : insights.length === 0 ? (
          <EmptyState
            title="No feedback yet"
            body="Answer some practice questions or take the diagnostic, then refresh to get personalized coaching."
          />
        ) : (
          <ul className="space-y-3">
            {insights.map((insight, i) => (
              <InsightRow key={`${insight.kind}-${i}`} insight={insight} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function InsightRow({ insight }: { insight: FeedbackInsightItem }) {
  const meta = KIND_META[insight.kind];
  const { Icon } = meta;
  return (
    <li className="flex gap-3 rounded-lg border border-line bg-surface-2 p-3">
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", meta.iconClass)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge tone={meta.badge}>{meta.label}</Badge>
          <Badge tone={insight.source === "llm" ? "brand" : "neutral"}>
            {insight.source === "llm" ? "AI" : "rule"}
          </Badge>
          {insight.concepts.map((c) => (
            <span key={c} className="font-mono text-xs text-muted">
              {c}
            </span>
          ))}
        </div>
        <p className="text-sm leading-relaxed">{insight.message}</p>
        {insight.kind === "pattern" && insight.concepts.length > 0 ? (
          <ButtonLink
            href={`/practice?concept=${encodeURIComponent(insight.concepts.join(","))}`}
            variant="secondary"
            size="sm"
            className="mt-3"
          >
            Practice this
          </ButtonLink>
        ) : null}
      </div>
    </li>
  );
}
