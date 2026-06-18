import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // The adapter persists OAuth users/accounts to Postgres. Sessions stay JWT
  // (see auth.config.ts); the adapter + JWT combo is supported.
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      // Google verifies email ownership, so auto-linking a Google login to an
      // existing same-email account is safe and avoids OAuthAccountNotLinked.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
});
