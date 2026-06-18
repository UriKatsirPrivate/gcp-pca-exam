import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveAccess, type Role } from "@/lib/access";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: Role;
};

/**
 * For server components / actions in protected routes. Redirects signed-out
 * users to /login, and re-checks the allowlist on every request so a user an
 * admin just removed (or whose role changed) is reflected on the next page load.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const access = await resolveAccess(user.email);
  if (!access.allowed) redirect("/login?error=AccessDenied");

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: access.role,
  };
}

/** Like requireUser but additionally requires the admin role. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}
