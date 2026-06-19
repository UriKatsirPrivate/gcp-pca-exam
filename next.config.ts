import type { NextConfig } from "next";

// Baseline CSP shipped in REPORT-ONLY mode first: it surfaces violations without
// breaking the app, so the policy can be tightened/promoted to enforcing once the
// console is clean. 'unsafe-inline'/'unsafe-eval' are required today by Next's
// hydration scripts, Tailwind's injected styles, and (in dev) the webpack runtime.
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

// Applied to every response. X-Frame-Options is the enforcing clickjacking guard
// (frame-ancestors above is report-only until the CSP is promoted).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Standalone output for a minimal Docker image on Cloud Run.
  output: "standalone",
  serverExternalPackages: [
    "@prisma/client",
    "bcryptjs",
    "pg",
    "@google-cloud/cloud-sql-connector",
  ],
  // Authored exam content is read from the filesystem at runtime; force it into
  // the traced standalone bundle so it ships in the Docker image.
  outputFileTracingIncludes: {
    "/**": ["./content/**/*"],
  },
};

export default nextConfig;
