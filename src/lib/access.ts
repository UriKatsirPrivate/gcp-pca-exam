import "server-only";
import { prisma } from "@/lib/prisma";

export type Role = "user" | "admin";

export interface Access {
  allowed: boolean;
  role: Role;
}

/**
 * Bootstrap admins from the ADMIN_EMAILS env var (comma/space separated).
 * These are ALWAYS allowed and ALWAYS admin, even if the DB allowlist is empty
 * or reset — they prevent lock-out and seed the very first admin.
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
 * role". Checks ADMIN_EMAILS first, then the AllowedUser allowlist table.
 */
export async function resolveAccess(email?: string | null): Promise<Access> {
  const e = normalizeEmail(email);
  if (!e) return { allowed: false, role: "user" };
  if (isBootstrapAdmin(e)) return { allowed: true, role: "admin" };

  const row = await prisma.allowedUser.findUnique({ where: { email: e } });
  if (!row) return { allowed: false, role: "user" };
  return { allowed: true, role: row.role === "admin" ? "admin" : "user" };
}
