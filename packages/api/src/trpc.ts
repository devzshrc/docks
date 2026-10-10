import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { isSuspended } from "./account-status.js";
import type { Context } from "./context.js";

/**
 * Shared tRPC initialization.
 * Single source of truth for routers, imported by:
 *  - apps/server (Express adapter, runtime)
 *  - apps/web (type-only import of AppRouter, never runtime)
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  // Workers has no NODE_ENV=production, so tRPC would otherwise send stack traces to the browser.
  isDev: false,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** Auth guard — reads ctx.user set in createContext(). */
const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (await isSuspended(ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "Your account is suspended. Contact support." });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(isAuthed);
