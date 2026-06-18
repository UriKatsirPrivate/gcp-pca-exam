import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
