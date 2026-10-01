"use server";

import { revalidatePath } from "next/cache";
import { allowedEmailDomains, isAllowedEmailDomain, normalizeEmail } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Conservative email shape check — the real gate is Google sign-in plus the
// email-domain rule, this just catches typos before we persist a grant no one
// can ever match.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): { ok: true; email: string } | { ok: false; error: string } {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, error: "Email is required." };
  if (!EMAIL_RE.test(normalized)) {
    return { ok: false, error: "That doesn't look like a valid email." };
  }
  if (!isAllowedEmailDomain(normalized)) {
    return {
      ok: false,
      error: `Only ${allowedEmailDomains().map((d) => `@${d}`).join(", ")} accounts can sign in.`,
    };
  }
  return { ok: true, email: normalized };
}

/**
 * Grant the admin role to an email (upsert keyed on the unique, lowercased
 * email). Access itself is the email-domain rule, so the email must be on an
 * allowed domain. Works before the person's first sign-in.
 */
export async function addAdmin(email: string): Promise<ActionResult> {
  const me = await requireAdmin();

  const v = validateEmail(email);
  if (!v.ok) return v;

  await prisma.allowedUser.upsert({
    where: { email: v.email },
    update: { role: "admin" },
    create: { email: v.email, role: "admin", addedBy: me.email ?? null },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Revoke a grant. Only removes the AllowedUser row (and so the admin role); the
 * person keeps their account and progress and can still sign in as a regular
 * user. Guarded so an admin can't revoke themselves mid-session.
 */
export async function removeAdmin(id: string): Promise<ActionResult> {
  const me = await requireAdmin();

  const row = await prisma.allowedUser.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "That admin no longer exists." };

  if (me.email && normalizeEmail(row.email) === normalizeEmail(me.email)) {
    return { ok: false, error: "You can't remove yourself." };
  }

  await prisma.allowedUser.delete({ where: { id } });

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Admin override to force-unlock (or relock) the final exam for a user, keyed by
 * email so it works even before they've signed in. Upserts the User row by email;
 * Google links to it on first sign-in (allowDangerousEmailAccountLinking), so the
 * flag carries over. When true it unlocks regardless of progress; when false the
 * user falls back to the earn-it criteria (module completion / mastery).
 */
export async function setExamUnlocked(
  email: string,
  unlocked: boolean,
): Promise<ActionResult> {
  await requireAdmin();

  const v = validateEmail(email);
  if (!v.ok) return v;

  await prisma.user.upsert({
    where: { email: v.email },
    update: { examUnlocked: unlocked },
    create: { email: v.email, examUnlocked: unlocked },
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/exam");
  return { ok: true };
}
