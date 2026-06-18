import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Pool } from "pg";

// Two connection paths, chosen purely by env vars (no code change per deploy):
//
//   • Cloud SQL (prod): set CLOUD_SQL_CONNECTION_NAME. The Cloud SQL Node
//     connector builds a pg Pool that authenticates with the runtime service
//     account's IAM identity — no DB password. Defaults to IAM auth; set
//     DB_IAM_AUTH=false to use a password (DB_PASSWORD) over the connector.
//
//   • Neon / local dev: leave CLOUD_SQL_CONNECTION_NAME unset and provide
//     DATABASE_URL. The pg driver also parses `?host=/cloudsql/...` here, so a
//     password-over-socket Cloud SQL string works on this path too.
//
// The PrismaClient is created lazily on first use so importing this module
// during `next build` (no DB env present) never connects. The connector pool,
// however, must be built asynchronously, so it is created here at module load —
// but ONLY when CLOUD_SQL_CONNECTION_NAME is set, which is never the case during
// a build.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

const instanceConnectionName = process.env.CLOUD_SQL_CONNECTION_NAME;
if (instanceConnectionName && !globalForPrisma.pgPool) {
  globalForPrisma.pgPool = await createCloudSqlPool(instanceConnectionName);
}

async function createCloudSqlPool(instanceConnectionName: string): Promise<Pool> {
  const [{ Connector, AuthTypes, IpAddressTypes }, pgModule] = await Promise.all([
    import("@google-cloud/cloud-sql-connector"),
    import("pg"),
  ]);
  const { Pool } = pgModule.default;

  const useIam = process.env.DB_IAM_AUTH !== "false";
  const ipType =
    process.env.CLOUD_SQL_IP_TYPE === "PRIVATE"
      ? IpAddressTypes.PRIVATE
      : process.env.CLOUD_SQL_IP_TYPE === "PSC"
        ? IpAddressTypes.PSC
        : IpAddressTypes.PUBLIC;

  // The connector lives for the life of the process (one Cloud Run instance).
  const connector = new Connector();
  const clientOpts = await connector.getOptions({
    instanceConnectionName,
    ipType,
    authType: useIam ? AuthTypes.IAM : AuthTypes.PASSWORD,
  });

  return new Pool({
    ...clientOpts,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    // IAM auth uses an OAuth token instead of a password.
    ...(useIam ? {} : { password: process.env.DB_PASSWORD }),
    max: Number(process.env.DB_POOL_MAX ?? 5),
  });
}

function createClient(): PrismaClient {
  const log =
    process.env.NODE_ENV === "development"
      ? (["error", "warn"] as const)
      : (["error"] as const);

  // Cloud SQL path: drive the adapter with the connector-built pool.
  if (globalForPrisma.pgPool) {
    return new PrismaClient({
      adapter: new PrismaPg(globalForPrisma.pgPool),
      log: [...log],
    });
  }

  // Neon / local path: a plain connection string.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "No database configured: set DATABASE_URL (Neon/local) or CLOUD_SQL_CONNECTION_NAME (Cloud SQL).",
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg(connectionString),
    log: [...log],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

// A Proxy defers client construction until a property (e.g. `prisma.user`) is
// actually accessed, keeping the ergonomic `prisma.model.method()` call sites.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
