export { closeDb, db, getDb, withDb } from "./client.js";
export * as schema from "./schema/index.js";
export * from "./schema/index.js";

// Operators used by external database fixtures must share the schema's Drizzle instance.
export { eq, inArray } from "drizzle-orm";
