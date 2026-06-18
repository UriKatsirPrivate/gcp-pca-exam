import { ShieldCheck } from "lucide-react";
import { bootstrapAdminEmails } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { AdminUsersTable } from "./AdminUsersTable";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await requireAdmin();

  const [rows, bootstrap] = await Promise.all([
    prisma.allowedUser.findMany({ orderBy: { createdAt: "asc" } }),
    Promise.resolve(bootstrapAdminEmails()),
  ]);

  const tableRows = rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role === "admin" ? "admin" : "user",
    addedBy: r.addedBy,
    createdAt: r.createdAt.toISOString(),
  }));

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
    </div>
  );
}
