import { Pool } from "pg";
import { logError } from "@docks/api";

/** Separate bounded connection: readiness cannot wait behind the application's pool. */
export async function checkReadiness(
  connectionString = process.env.DATABASE_URL,
): Promise<boolean> {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
    statement_timeout: 2000,
  });
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (error) {
    logError("readiness.failed", error);
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}
