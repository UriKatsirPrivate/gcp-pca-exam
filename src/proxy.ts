import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Next 16 renamed the "middleware" convention to "proxy". The Auth.js `auth`
// handler doubles as the proxy function (runs the `authorized` callback).
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
