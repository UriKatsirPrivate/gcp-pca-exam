import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  Target,
} from "lucide-react";
import { getModule } from "@/lib/content";
import { prisma } from "@/lib/prisma";
import { getUserProgress } from "@/lib/progress";
import { requireUser } from "@/lib/session";
import { totalEstimatedHours, type StudyPlanMilestone } from "@/lib/study-plan";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Stat,
} from "@/components/ui";
import { StudyPlanControls } from "./StudyPlanControls";

export const dynamic = "force-dynamic";

type PriorityTone = "danger" | "warning" | "info" | "neutral";

function priorityMeta(priority: number): { label: string; tone: PriorityTone } {
  if (priority >= 12) return { label: "Critical", tone: "danger" };
  if (priority >= 7) return { label: "High", tone: "warning" };
  if (priority >= 3) return { label: "Medium", tone: "info" };
  return { label: "Low", tone: "neutral" };
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function hours(minutes: number): string {
  return (Math.round((minutes / 60) * 10) / 10).toString();
}

export default async function StudyPlanPage() {
  const user = await requireUser();
  const [plan, progress] = await Promise.all([
    prisma.studyPlan.findFirst({
      where: { userId: user.id, active: true },
      orderBy: { createdAt: "desc" },
    }),
    getUserProgress(user.id),
  ]);

  // ---- No active plan ----------------------------------------------------
  if (!plan) {
    if (!progress.latestAssessment) {
      return (
        <div className="space-y-6">
          <Header />
          <EmptyState
            title="Take the diagnostic first"
            body="A tailored study plan works best after the diagnostic assessment, which measures where you stand across all six exam domains. You can still generate a plan from your current mastery if you prefer."
            action={
              <div className="flex flex-wrap items-center justify-center gap-3">
                <ButtonLink href="/assessment">Start assessment</ButtonLink>
              </div>
            }
          />
          <Card>
            <CardHeader
              title="Generate from current mastery"
              subtitle="No assessment yet — we'll prioritize domains using your existing module and quiz progress."
              icon={<Target className="h-5 w-5" />}
            />
            <CardBody>
              <StudyPlanControlsClient />
            </CardBody>
          </Card>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <Header />
        <Card>
          <CardHeader
            title="Build your tailored study plan"
            subtitle="We'll order the six domains by how much they need work and how heavily they're weighted on the exam, then pack them into a weekly schedule."
            icon={<Target className="h-5 w-5" />}
          />
          <CardBody className="space-y-4">
            <p className="text-sm text-muted">
              Your latest diagnostic scored{" "}
              <span className="font-semibold text-foreground">
                {progress.latestAssessment.overallPct}%
              </span>{" "}
              overall. Set your timeline below to generate a plan.
            </p>
            <StudyPlanControlsClient />
          </CardBody>
        </Card>
      </div>
    );
  }

  // ---- Active plan -------------------------------------------------------
  const milestones = (plan.milestones as unknown as StudyPlanMilestone[]) ?? [];
  const totalHours = totalEstimatedHours(milestones);

  // Group milestones into "Week N" buckets.
  const byWeek = new Map<number, StudyPlanMilestone[]>();
  for (const m of milestones) {
    const arr = byWeek.get(m.weekStart) ?? [];
    arr.push(m);
    byWeek.set(m.weekStart, arr);
  }
  const weeks = [...byWeek.keys()].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <Header
        action={
          <Badge tone="success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Active plan
          </Badge>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Timeline" value={`${plan.weeks} wk`} hint={`${plan.hoursPerWeek} hrs / week`} />
        <Stat label="Est. study time" value={`${totalHours} hrs`} hint="across all domains" />
        <Stat label="Domains" value={milestones.length} hint="prioritized" />
        <Stat
          label="Created"
          value={plan.createdAt.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
          hint={plan.createdAt.toLocaleDateString(undefined, { year: "numeric" })}
        />
      </div>

      <div className="space-y-8">
        {weeks.map((week) => (
          <section key={week} className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Week {week}
              </h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {byWeek.get(week)!.map((m) => {
                const pm = priorityMeta(m.priority);
                return (
                  <Card key={m.domainId}>
                    <CardHeader
                      title={m.domainTitle}
                      subtitle={
                        <span className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" /> {hours(m.estMinutes)} hrs
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Target className="h-3.5 w-3.5" /> by {formatDate(m.targetDate)}
                          </span>
                        </span>
                      }
                      action={<Badge tone={pm.tone}>{pm.label} priority</Badge>}
                    />
                    <CardBody>
                      {m.moduleIds.length === 0 ? (
                        <p className="text-sm text-muted">No modules available yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {m.moduleIds.map((moduleId) => {
                            const mod = getModule(moduleId);
                            const done =
                              progress.moduleStatusById[moduleId] === "done";
                            return (
                              <li
                                key={moduleId}
                                className="flex items-center justify-between gap-3"
                              >
                                <span className="flex items-center gap-2 text-sm">
                                  {done ? (
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                                  ) : (
                                    <Circle className="h-4 w-4 shrink-0 text-muted" />
                                  )}
                                  <span className={done ? "text-muted line-through" : ""}>
                                    {mod?.title ?? moduleId}
                                  </span>
                                </span>
                                <ButtonLink
                                  href={`/learn/${m.domainId}/${moduleId}`}
                                  variant="secondary"
                                  size="sm"
                                >
                                  {done ? "Review" : "Study"}
                                </ButtonLink>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Regenerate plan"
          subtitle="Adjust your timeline to rebuild the schedule from your latest scores. This replaces the current plan."
          icon={<CalendarDays className="h-5 w-5" />}
        />
        <CardBody>
          <StudyPlanControlsClient
            weeks={plan.weeks}
            hoursPerWeek={plan.hoursPerWeek}
            label="Regenerate plan"
          />
        </CardBody>
      </Card>
    </div>
  );
}

function Header({ action }: { action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">Study plan</h1>
        <p className="mt-1 text-sm text-muted">
          A tailored, week-by-week path through the exam domains — weakest and
          highest-weight first.
        </p>
      </div>
      {action}
    </div>
  );
}

// Thin alias so the active/no-plan branches can render the client form.
function StudyPlanControlsClient(
  props: React.ComponentProps<typeof StudyPlanControls>,
) {
  return <StudyPlanControls {...props} />;
}
