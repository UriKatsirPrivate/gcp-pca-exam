"use server";

import { revalidatePath } from "next/cache";
import { normalizeEmail, type Role } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Conservative email shape check — the real gate is Google sign-in, this just
// catches typos before we persist an allowlist entry no one can ever match.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function coerceRole(role: string): Role {
  return role === "admin" ? "admin" : "user";
}

/**
 * Allow an email to sign in (or update its role). Upsert keyed on the unique,
 * lowercased email so re-adding an existing entry just changes its role.
 */
export async function addAllowedUser(
  email: string,
  role: "user" | "admin",
): Promise<ActionResult> {
  const me = await requireAdmin();

  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, error: "Email is required." };
  if (!EMAIL_RE.test(normalized)) {
    return { ok: false, error: "That doesn't look like a valid email." };
  }

  const nextRole = coerceRole(role);

  await prisma.allowedUser.upsert({
    where: { email: normalized },
    update: { role: nextRole },
    create: { email: normalized, role: nextRole, addedBy: me.email ?? null },
  });

  revalidatePath("/admin");
  return { ok: true };
}

export async function setAllowedRole(
  id: string,
  role: "user" | "admin",
): Promise<ActionResult> {
  const me = await requireAdmin();

  const row = await prisma.allowedUser.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "That user no longer exists." };

  // Guard against an admin demoting their own allowlist row mid-session (the
  // same footgun removeAllowedUser protects against).
  if (me.email && normalizeEmail(row.email) === normalizeEmail(me.email)) {
    return { ok: false, error: "You can't change your own role." };
  }

  await prisma.allowedUser.update({
    where: { id },
    data: { role: coerceRole(role) },
  });

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Remove an allowlist entry. Guarded so an admin can't lock themselves out of
 * the console by deleting their own row mid-session.
 */
export async function removeAllowedUser(id: string): Promise<ActionResult> {
  const me = await requireAdmin();

  const row = await prisma.allowedUser.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "That user no longer exists." };

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

  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, error: "Email is required." };

  await prisma.user.upsert({
    where: { email: normalized },
    update: { examUnlocked: unlocked },
    create: { email: normalized, examUnlocked: unlocked },
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/exam");
  return { ok: true };
}
