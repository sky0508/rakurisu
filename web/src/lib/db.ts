import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../drizzle/schema";

/**
 * postgres-js client + Drizzle wrapper.
 * HMR で接続が増えないよう module-level singleton。Neon の同時接続制限に合わせ max=1。
 */
const globalForPg = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForPg.pgClient ??
  postgres(process.env.DATABASE_URL ?? "", {
    max: 1,
    ssl: "require",
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
