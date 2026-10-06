import { defineConfig } from "drizzle-kit";
export default defineConfig({
    dialect: "postgresql",
    strict: true,
    schema: "./src/schema/index.ts",
    out: "./drizzle",
    dbCredentials: {
        // drizzle-kit reads env at invocation time, e.g.
        // DATABASE_URL=postgresql://docks:docks@localhost:5433/docks pnpm db:push
        url: process.env.DATABASE_URL ?? "postgresql://docks:docks@localhost:5433/docks",
    },
});
//# sourceMappingURL=drizzle.config.js.map