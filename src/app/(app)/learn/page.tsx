import { ArrowRight, BookOpen } from "lucide-react";
import { DOMAINS } from "@/lib/content";
import { getUserProgress } from "@/lib/progress";
import { requireUser } from "@/lib/session";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  ProgressBar,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const user = await requireUser();
  const progress = await getUserProgress(user.id);

  const domains = [...DOMAINS].sort((a, b) => a.index - b.index);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <BookOpen className="text-brand-600" size={24} />
        <div>
          <h1 className="text-2xl font-semibold">Learn</h1>
          <p className="text-sm text-muted">
            Work through the six exam domains. Each module pairs a visual lesson
            with a short quiz.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {domains.map((d) => {
          const dp = progress.perDomain[d.id];
          const modulesTotal = dp?.modulesTotal ?? 0;
          const modulesDone = dp?.modulesDone ?? 0;
          const pct =
            modulesTotal > 0
              ? Math.round((modulesDone / modulesTotal) * 100)
              : 0;

          return (
            <Card key={d.id} className="flex flex-col">
              <CardBody className="flex flex-1 flex-col">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h2 className="font-semibold leading-tight">{d.shortTitle}</h2>
                  <Badge tone="brand">{d.weightPct}%</Badge>
                </div>
                <p className="flex-1 text-sm text-muted">{d.blurb}</p>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                    <span>
                      {modulesDone} / {modulesTotal} modules
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <ProgressBar
                    value={pct}
                    tone={pct === 100 ? "success" : "brand"}
                  />
                </div>

                <ButtonLink
                  href={`/learn/${d.id}`}
                  variant="secondary"
                  className="mt-4"
                >
                  {modulesDone > 0 && modulesDone < modulesTotal
                    ? "Continue"
                    : "Start learning"}
                  <ArrowRight size={16} />
                </ButtonLink>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
