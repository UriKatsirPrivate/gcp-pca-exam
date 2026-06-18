import { GraduationCap, ShieldCheck } from "lucide-react";
import { bootstrapAdminEmails, normalizeEmail } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { AdminUsersTable } from "./AdminUsersTable";
import { ExamAccessTable } from "./ExamAccessTable";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await requireAdmin();

  const [rows, bootstrap, users] = await Promise.all([
    prisma.allowedUser.findMany({ orderBy: { createdAt: "asc" } }),
    Promise.resolve(bootstrapAdminEmails()),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, examUnlocked: true },
    }),
  ]);

  const tableRows = rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role === "admin" ? "admin" : "user",
    addedBy: r.addedBy,
    createdAt: r.createdAt.toISOString(),
  }));

  // Exam access is driven by who CAN sign in (bootstrap admins + allowlist),
  // not by who happens to have a User row yet. Join each allowed email with its
  // User record (if any) for name + current override state.
  const userByEmail = new Map(
    users.map((u) => [normalizeEmail(u.email), u]),
  );
  const allowedEmails = [
    ...new Set([
      ...bootstrap.map((e) => normalizeEmail(e)),
      ...rows.map((r) => normalizeEmail(r.email)),
    ]),
  ].filter(Boolean);
  const examUsers = allowedEmails.map((email) => {
    const u = userByEmail.get(email);
    return {
      email,
      name: u?.name ?? null,
      examUnlocked: u?.examUnlocked ?? false,
      signedIn: !!u,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Admin · Users"
          subtitle="Only listed users (plus ADMIN_EMAILS) can sign in to the service."
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <CardBody className="flex flex-col gap-6">
          <p className="text-sm text-muted">
            Add the email of the Google account you want to allow. They sign in
            with Google; only allowlisted emails (plus{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
              ADMIN_EMAILS
            </code>
            ) can use the service.
          </p>

          {bootstrap.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold">Bootstrap admins</h4>
              <p className="text-xs text-muted">
                Configured via the{" "}
                <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
                  ADMIN_EMAILS
                </code>{" "}
                environment variable. Always allowed, always admin, and can't be
                edited here.
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

      <Card>
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
