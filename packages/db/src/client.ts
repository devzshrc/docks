import { AsyncLocalStorage } from "node:async_hooks";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";

export * as schema from "./schema/index.js";

type Db = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let dbInstance: Db | undefined;

/** Per-request client (Cloudflare Workers can't share connections across requests). */
const scoped = new AsyncLocalStorage<Db>();

/** Lazy singleton — safe to import in dev (tsx watch) and prod. */
export function getDb(): Db {
  const current = scoped.getStore();
  if (current) return current;
  if (!dbInstance) {
    const connectionString =
      process.env.DATABASE_URL ?? "postgresql://docks:docks@localhost:5433/docks";
    pool = new Pool({ connectionString, max: 10 });
    dbInstance = drizzle(pool, { schema });
  }
  return dbInstance;
}

/**
 * Runs `fn` with `db` bound to a fresh single-connection client (e.g. the Hyperdrive
 * connection string on Workers). The connection is closed when `fn` settles.
 */
export async function withDb<T>(connectionString: string, fn: () => Promise<T>): Promise<T> {
  const requestPool = new Pool({ connectionString, max: 1 });
  try {
    return await scoped.run(drizzle(requestPool, { schema }), fn);
  } finally {
    await requestPool.end().catch(() => {});
  }
}

/** Shared instance. Importing this module must not open a connection until first query (pg Pool is lazy). */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  dbInstance = undefined;
}
