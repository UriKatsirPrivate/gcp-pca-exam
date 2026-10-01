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
  // Route auth errors (e.g. a denied sign-in where the signIn callback returns
  // false) to our styled /login page instead of Auth.js's built-in error page.
  pages: { signIn: "/login", error: "/login" },
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

      // Admin console: signed-in admins only. token.role is set at sign-in
      // (auth.ts). Non-admins are bounced to the dashboard; signed-out users
      // fall through to the login redirect below. requireAdmin() is the
      // authoritative server-side check; this is edge defense-in-depth.
      if (pathname.startsWith("/admin")) {
        if (!isLoggedIn) {
          const url = new URL("/login", nextUrl);
          url.searchParams.set("callbackUrl", pathname);
          return Response.redirect(url);
        }
        if ((auth?.user as { role?: string } | undefined)?.role !== "admin") {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }

      const isPublic = PUBLIC_PATHS.has(pathname);

      // Send logged-in users from /login to the app — UNLESS there's an error
      // (e.g. ?error=AccessDenied for an authenticated user outside the allowed email domain).
      // Without this guard, requireUser() bouncing such a user to /login and this
      // rule bouncing them back to /dashboard would loop forever.
      if (
        isLoggedIn &&
        pathname === "/login" &&
        !nextUrl.searchParams.has("error")
      ) {
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
