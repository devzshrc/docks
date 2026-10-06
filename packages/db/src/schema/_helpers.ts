import { timestamp } from "drizzle-orm/pg-core";

/** timestamptz column with a custom name. */
export function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true, mode: "date" });
}

export function createdAt() {
  return timestamptz("created_at").defaultNow().notNull();
}

export function updatedAt() {
  return timestamptz("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();
}

export function accessedAt() {
  return timestamptz("accessed_at").defaultNow().notNull();
}

/** Standard audit columns — spread into every table. */
export const timestamps = {
  createdAt: createdAt(),
  updatedAt: updatedAt(),
};
