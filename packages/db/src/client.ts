import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";

export * as schema from "./schema/index.js";

let pool: Pool | undefined;
let dbInstance: NodePgDatabase<typeof schema> | undefined;

/** Lazy singleton — safe to import in dev (tsx watch) and prod. */
export function getDb(): NodePgDatabase<typeof schema> {
  if (!dbInstance) {
    const connectionString =
      process.env.DATABASE_URL ?? "postgresql://docks:docks@localhost:5433/docks";
    pool = new Pool({ connectionString, max: 10 });
    dbInstance = drizzle(pool, { schema });
  }
  return dbInstance;
}

/** Shared instance. Importing this module must not open a connection until first query (pg Pool is lazy). */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  dbInstance = undefined;
}
