import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/** For server components / actions in protected routes. Redirects if signed out. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  return user as { id: string; name?: string | null; email?: string | null; role?: string };
}
