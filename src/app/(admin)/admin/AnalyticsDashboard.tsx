import {
  Activity,
  AlertTriangle,
  BarChart3,
  Globe,
  GraduationCap,
  Layers,
} from "lucide-react";
import type { AdminStats } from "@/lib/admin-stats";
import { Badge, Card, CardBody, CardHeader, ProgressBar, Stat } from "@/components/ui";

const pct = (n: number | null) => (n == null ? "—" : `${n}%`);

function tone(score: number | null): "brand" | "success" | "warning" | "danger" {
  if (score == null) return "brand";
  if (score >= 70) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

export function AnalyticsDashboard({ stats }: { stats: AdminStats }) {
  const {
    signedInUsers,
    activeUsers7d,
    activeUsers30d,
    examUnlockedOverrides,
    totalModules,
    avgModuleCompletionPct,
    modulesDoneCount,
    modulesInProgressCount,
    modulesNotStartedCount,
    usersWithProgress,
    usersCompletedAll,
    quizAttempts,
    avgQuizScore,
    quizByDomain,
    assessmentsTaken,
    avgAssessmentScore,
    examRunsTotal,
    examRunsSubmitted,
    examRunsInProgress,
    avgExamScore,
    examPassed,
    examPassRate,
    hardestQuestions,
    geoByCountry,
    usersWithGeo,
    usersUnknownGeo,
    countriesCount,
  } = stats;

  const geoTotal = usersWithGeo + usersUnknownGeo;

  const moduleCells = modulesDoneCount + modulesInProgressCount + modulesNotStartedCount;
  const seg = (n: number) => (moduleCells > 0 ? (n / moduleCells) * 100 : 0);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Analytics"
          subtitle="Cumulative across all users — no individual data."
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <CardBody className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="Active users (30d)"
              value={activeUsers30d}
              hint={`${activeUsers7d} active in last 7 days`}
            />
            <Stat
              label="Signed-in users"
              value={signedInUsers}
              hint="Google accounts on allowed domains"
            />
            <Stat
              label="Avg. module completion"
              value={pct(avgModuleCompletionPct)}
              hint={`${usersCompletedAll} finished all ${totalModules}`}
            />
            <Stat
              label="Exam-unlock overrides"
              value={examUnlockedOverrides}
              hint="force-unlocked by an admin"
            />
            <Stat label="Avg. quiz score" value={pct(avgQuizScore)} hint={`${quizAttempts} attempts`} />
            <Stat
              label="Avg. diagnostic score"
              value={pct(avgAssessmentScore)}
              hint={`${assessmentsTaken} taken`}
            />
            <Stat
              label="Avg. exam score"
              value={pct(avgExamScore)}
              hint={`${examRunsSubmitted} submitted`}
            />
            <Stat
              label="Exam pass rate"
              value={pct(examPassRate)}
              hint={`${examPassed} of ${examRunsSubmitted} ≥ 70%`}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Users by country"
          subtitle={
            countriesCount > 0
              ? `${usersWithGeo} of ${geoTotal} located across ${countriesCount} ${
                  countriesCount === 1 ? "country" : "countries"
                }`
              : "Browser-reported, cumulative — no individual data."
          }
          icon={<Globe className="h-5 w-5" />}
        />
        <CardBody className="flex flex-col gap-3">
          {geoByCountry.length === 0 ? (
            <p className="text-sm text-muted">
              No location data yet — it&apos;s captured as users sign in and open
              the app.
            </p>
          ) : (
            <>
              {geoByCountry.map((c) => {
                const width = geoTotal > 0 ? (c.users / geoTotal) * 100 : 0;
                return (
                  <div key={c.country} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">
                        <span className="mr-1.5">{c.flag}</span>
                        {c.countryName}
                      </span>
                      <span className="text-muted tabular-nums">
                        {c.users} {c.users === 1 ? "user" : "users"}
                      </span>
                    </div>
                    <ProgressBar value={width} tone="brand" />
                  </div>
                );
              })}
              {usersUnknownGeo > 0 ? (
                <div className="mt-1 flex items-center justify-between border-t border-line pt-3 text-sm">
                  <span className="text-muted">Unknown</span>
                  <span className="font-medium tabular-nums">
                    {usersUnknownGeo} {usersUnknownGeo === 1 ? "user" : "users"}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Module completion"
            subtitle={`${usersWithProgress} of ${signedInUsers} users have started a module`}
            icon={<Layers className="h-5 w-5" />}
          />
          <CardBody className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Avg. completion across all users</span>
              <span className="text-2xl font-semibold">{pct(avgModuleCompletionPct)}</span>
            </div>
            <ProgressBar value={avgModuleCompletionPct} tone="success" />

            <div className="mt-2 flex flex-col gap-2">
              <span className="text-sm font-medium">Module status mix</span>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-success" style={{ width: `${seg(modulesDoneCount)}%` }} />
                <div className="h-full bg-warning" style={{ width: `${seg(modulesInProgressCount)}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Legend dotClass="bg-success" label="Done" value={modulesDoneCount} />
                <Legend dotClass="bg-warning" label="In progress" value={modulesInProgressCount} />
                <Legend dotClass="bg-surface-2" label="Not started" value={modulesNotStartedCount} />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Exam performance"
            subtitle="Full-length simulation exams"
            icon={<GraduationCap className="h-5 w-5" />}
          />
          <CardBody className="flex flex-col gap-3">
            <FunnelRow label="Started" value={examRunsTotal} total={examRunsTotal} tone="brand" />
            <FunnelRow label="Submitted" value={examRunsSubmitted} total={examRunsTotal} tone="brand" />
            <FunnelRow label="Passed (≥70%)" value={examPassed} total={examRunsTotal} tone="success" />
            <div className="mt-1 flex items-center justify-between border-t border-line pt-3 text-sm">
              <span className="text-muted">In progress now</span>
              <span className="font-medium">{examRunsInProgress}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Average score</span>
              <span className="font-medium">{pct(avgExamScore)}</span>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Quiz performance by domain"
          subtitle="Average score across all attempts"
          icon={<Activity className="h-5 w-5" />}
        />
        <CardBody className="flex flex-col gap-3">
          {quizByDomain.map((d) => (
            <div key={d.domainId} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{d.shortTitle}</span>
                <span className="text-muted">
                  {d.avgScore == null ? "no attempts" : `${d.avgScore}% · ${d.attempts} attempts`}
                </span>
              </div>
              <ProgressBar value={d.avgScore ?? 0} tone={tone(d.avgScore)} />
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Hardest questions"
          subtitle="Lowest correct rate across all answers — review flagged items for mis-keys."
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <CardBody>
          {hardestQuestions.length === 0 ? (
            <p className="text-sm text-muted">
              Not enough answers yet to rank question difficulty.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {hardestQuestions.map((q) => (
                <li key={q.questionId} className="flex items-start gap-3 py-3">
                  <span
                    className={`mt-0.5 shrink-0 text-sm font-semibold tabular-nums ${
                      q.correctPct < 50 ? "text-danger" : "text-warning"
                    }`}
                  >
                    {q.correctPct}%
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm">{q.prompt}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span>{q.shortTitle}</span>
                      <span>· {q.attempts} attempts</span>
                      {q.suspectMiskey ? (
                        <Badge tone="danger">possible mis-key</Badge>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Legend({ dotClass, label, value }: { dotClass: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${dotClass}`} />
      <span className="text-muted">{label}</span>
      <span className="ml-auto font-medium tabular-nums">{value}</span>
    </div>
  );
}

function FunnelRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "brand" | "success";
}) {
  const width = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted tabular-nums">{value}</span>
      </div>
      <ProgressBar value={width} tone={tone} />
    </div>
  );
}
