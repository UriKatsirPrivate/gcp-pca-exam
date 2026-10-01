import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { allowedEmailDomains, resolveAccess } from "@/lib/access";

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
      // Always show the account chooser. Without this, a browser with multiple
      // Google sessions can silently re-auth as the wrong account (authuser=1,
      // prompt=none), whose sub doesn't match the linked one.
      // `hd` pre-filters the chooser to the allowed Workspace domain. It is only a
      // UI hint; the signIn callback below is the actual gate.
      authorization: {
        params: { prompt: "select_account", hd: allowedEmailDomains()[0] },
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Domain gate: only a *verified* Google email on an allowed domain (default
    // google.com) may sign in. Returning false sends the user to
    // /login?error=AccessDenied.
    async signIn({ user, profile }) {
      if (profile?.email_verified !== true) return false;
      const { allowed } = await resolveAccess(user.email);
      return allowed;
    },
    // Runs in the Node runtime (Prisma available). On sign-in, stamp the token
    // with the DB user id and the role resolved from ADMIN_EMAILS / AllowedUser (NOT the
    // unused User.role column). This overrides the edge-safe jwt in auth.config.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        const { role } = await resolveAccess(user.email);
        token.role = role;
      }
      return token;
    },
  },
});
