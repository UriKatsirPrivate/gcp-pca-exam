"use server";

import { signIn, signOut } from "@/auth";

export async function signInWithGoogle() {
  // signIn throws a redirect (to Google, then back to /api/auth/callback/google);
  // let it propagate.
  await signIn("google", { redirectTo: "/dashboard" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
