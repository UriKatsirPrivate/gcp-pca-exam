import type { NextAuthConfig } from "next-auth";

// Edge-safe config (no Prisma / bcrypt). Used by middleware and extended in auth.ts.
const PUBLIC_PATHS = new Set(["/", "/login"]);

// Cloud Run exposes the service on more than one hostname (e.g. the
// SERVICE-PROJECTNUMBER.run.app and SERVICE-HASH.a.run.app URLs). OAuth state
// cookies are host-scoped, so a sign-in started on a non-AUTH_URL host fails
// when the callback lands on the AUTH_URL host. Canonicalize every request to
// the AUTH_URL host so the whole flow stays on one origin.
const CANONICAL_HOST = process.env.AUTH_URL
  ? new URL(process.env.AUTH_URL).host
  : null;

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [], // real providers are added in auth.ts (Node runtime)
  callbacks: {
    authorized({ auth, request }) {
      const { nextUrl } = request;
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      // Redirect any non-canonical Cloud Run hostname to the AUTH_URL host
      // before auth runs, so OAuth cookies are always set on one origin.
      // Compare the real request Host header — nextUrl.host is already
      // normalized to AUTH_URL by Auth.js, so it can't detect the mismatch.
      const reqHost =
        request.headers.get("x-forwarded-host") ?? request.headers.get("host");
      if (CANONICAL_HOST && reqHost && reqHost !== CANONICAL_HOST) {
        const url = new URL(nextUrl);
        url.protocol = "https:";
        url.host = CANONICAL_HOST;
        url.port = "";
        return Response.redirect(url, 307);
      }

      // Always allow Auth.js endpoints and static assets.
      if (pathname.startsWith("/api/auth")) return true;

      const isPublic = PUBLIC_PATHS.has(pathname);

      if (isLoggedIn && pathname === "/login") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      if (!isLoggedIn && !isPublic) {
        const url = new URL("/login", nextUrl);
        url.searchParams.set("callbackUrl", pathname);
        return Response.redirect(url);
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role ?? "user";
      }
      return token;
    },
    session({ session, token }) {
      if (token?.id) session.user.id = token.id as string;
      if (token?.role) session.user.role = token.role as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
