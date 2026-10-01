import { BarChart3, GraduationCap, ShieldCheck } from "lucide-react";
import {
  allowedEmailDomains,
  bootstrapAdminEmails,
  isAllowedEmailDomain,
  normalizeEmail,
} from "@/lib/access";
import { getAdminStats } from "@/lib/admin-stats";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { AdminUsersTable } from "./AdminUsersTable";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import { ExamAccessTable } from "./ExamAccessTable";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await requireAdmin();

  const [rows, bootstrap, users, stats] = await Promise.all([
    prisma.allowedUser.findMany({ where: { role: "admin" }, orderBy: { createdAt: "asc" } }),
    Promise.resolve(bootstrapAdminEmails()),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, examUnlocked: true },
    }),
    getAdminStats(),
  ]);

  const tableRows = rows.map((r) => ({
    id: r.id,
    email: r.email,
    addedBy: r.addedBy,
    createdAt: r.createdAt.toISOString(),
  }));

  // Exam access is listed for everyone who can sign in: users who have already
  // signed in (and still match the domain rule) plus admins who haven't yet.
  // Anyone else can be pre-unlocked by email from the form below the list.
  const userByEmail = new Map(
    users.map((u) => [normalizeEmail(u.email), u]),
  );
  const allowedEmails = [
    ...new Set([
      ...users.map((u) => normalizeEmail(u.email)),
      ...bootstrap.map((e) => normalizeEmail(e)),
      ...rows.map((r) => normalizeEmail(r.email)),
    ]),
  ].filter((e) => e && isAllowedEmailDomain(e));
  const examUsers = allowedEmails.map((email) => {
    const u = userByEmail.get(email);
    return {
      email,
      name: u?.name ?? null,
      examUnlocked: u?.examUnlocked ?? false,
      signedIn: !!u,
    };
  });

  const domains = allowedEmailDomains().map((d) => `@${d}`).join(", ");
  const sections = [
    { href: "#analytics", label: "Analytics", icon: BarChart3 },
    { href: "#users", label: "Admins", icon: ShieldCheck },
    { href: "#exam-access", label: "Exam access", icon: GraduationCap },
  ];

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="Admin sections"
        className="sticky top-14 z-20 -mx-4 border-b border-line bg-surface/80 px-4 py-2 backdrop-blur"
      >
        <div className="flex items-center gap-1 overflow-x-auto">
          <span className="mr-1 shrink-0 text-xs font-medium uppercase tracking-wide text-muted">
            Jump to
          </span>
          {sections.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <s.icon size={16} />
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <section id="analytics" className="scroll-mt-28">
        <AnalyticsDashboard stats={stats} />
      </section>

      <Card id="users" className="scroll-mt-28">
        <CardHeader
          title="Admin · Access & admins"
          subtitle={`Anyone with a ${domains} Google account can sign in; this list grants the admin role.`}
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <CardBody className="flex flex-col gap-6">
          <p className="text-sm text-muted">
            There is no allowlist: any verified Google account on{" "}
            <span className="font-medium text-foreground">{domains}</span> can
            sign in as a regular user. Add an email below to make that person an
            admin (they must be on an allowed domain).
          </p>

          {bootstrap.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold">Bootstrap admins</h4>
              <p className="text-xs text-muted">
                Configured via the{" "}
                <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
                  ADMIN_EMAILS
                </code>{" "}
                environment variable. Always admin, and can&apos;t be edited here.
                They still need an allowed-domain account to sign in.
              </p>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {bootstrap.map((email) => (
                  <li
                    key={email}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="truncate text-sm">{email}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Badge tone="brand">admin</Badge>
                      <Badge tone="neutral">bootstrap</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <AdminUsersTable rows={tableRows} meEmail={me.email ?? null} />
        </CardBody>
      </Card>

      <Card id="exam-access" className="scroll-mt-28">
        <CardHeader
          title="Final exam access"
          subtitle="Force-unlock the final exam for a user, regardless of their progress."
          icon={<GraduationCap className="h-5 w-5" />}
        />
        <CardBody className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Unlocking here overrides the usual requirement (80% of modules
            complete or 70% mastery). Relocking falls back to that requirement —
            it won&apos;t hide the exam from someone who already earned it.
          </p>
          <ExamAccessTable users={examUsers} />
        </CardBody>
      </Card>
    </div>
  );
}
