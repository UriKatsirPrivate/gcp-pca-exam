import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronLeft, Clock } from "lucide-react";
import { getDomain, getDomainTakeaways, getModules } from "@/lib/content";
import { DOMAIN_IDS, type DomainId } from "@/lib/content/schema";
import { getUserProgress } from "@/lib/progress";
import { requireUser } from "@/lib/session";
import { Badge, Card, CardBody } from "@/components/ui";
import { KeyTakeaways } from "@/components/KeyTakeaways";

export const dynamic = "force-dynamic";

type ModuleStatus = "todo" | "in-progress" | "done";

function statusBadge(status: ModuleStatus) {
  if (status === "done")
    return <Badge tone="success">Completed</Badge>;
  if (status === "in-progress")
    return <Badge tone="warning">In progress</Badge>;
  return <Badge tone="neutral">Not started</Badge>;
}

export default async function DomainPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  if (!DOMAIN_IDS.includes(domain as DomainId)) notFound();
  const domainId = domain as DomainId;

  const user = await requireUser();
  const progress = await getUserProgress(user.id);

  const d = getDomain(domainId);
  const modules = getModules(domainId);
  const takeaways = getDomainTakeaways(domainId);

  return (
    <div>
      <Link
        href="/learn"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ChevronLeft size={16} /> All domains
      </Link>

      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{d.title}</h1>
          <Badge tone="brand">{d.weightPct}% of exam</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted">{d.blurb}</p>

        {d.subObjectives.length > 0 ? (
          <div className="mt-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Sub-objectives
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              {d.subObjectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Modules</h2>

      {modules.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted">
            No modules are available for this domain yet.
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-3">
          {modules.map((m) => {
            const status = (progress.moduleStatusById[m.id] ??
              "todo") as ModuleStatus;
            return (
              <li key={m.id}>
                <Link
                  href={`/learn/${domainId}/${m.id}`}
                  className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                    {m.order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{m.title}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                      <Clock size={13} /> {m.estMinutes} min
                    </div>
                  </div>
                  {statusBadge(status)}
                  <ArrowRight
                    size={18}
                    className="text-muted transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {takeaways ? (
        <>
          <h2 className="mt-8 mb-3 text-lg font-semibold">Key takeaways</h2>
          <KeyTakeaways takeaways={takeaways.takeaways} sources={takeaways.sources} />
        </>
      ) : null}
    </div>
  );
}
