import "server-only";
import { prisma } from "@/lib/prisma";
import { allowedEmailDomains, isAllowedEmailDomain } from "@/lib/email-domain";

export { allowedEmailDomains, isAllowedEmailDomain };

export type Role = "user" | "admin";

export interface Access {
  allowed: boolean;
  role: Role;
}

/**
 * Bootstrap admins from the ADMIN_EMAILS env var (comma/space separated).
 * Always admin, even if the AllowedUser table is empty or reset — they prevent
 * lock-out and seed the very first admin. They must still be on an allowed
 * domain to sign in: ADMIN_EMAILS grants a role, not access.
 */
function bootstrapAdmins(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function normalizeEmail(email?: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

export function isBootstrapAdmin(email?: string | null): boolean {
  const e = normalizeEmail(email);
  return !!e && bootstrapAdmins().has(e);
}

export function bootstrapAdminEmails(): string[] {
  return [...bootstrapAdmins()].sort();
}

/**
 * The single source of truth for "can this email use the service, and as what
 * role". Access is the email-domain rule; the role comes from ADMIN_EMAILS, then
 * an AllowedUser row with role "admin" (the table now only grants admin).
 */
export async function resolveAccess(email?: string | null): Promise<Access> {
  const e = normalizeEmail(email);
  if (!isAllowedEmailDomain(e)) return { allowed: false, role: "user" };
  if (isBootstrapAdmin(e)) return { allowed: true, role: "admin" };

  const row = await prisma.allowedUser.findUnique({ where: { email: e } });
  return { allowed: true, role: row?.role === "admin" ? "admin" : "user" };
}
