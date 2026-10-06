import { z } from "zod";
import { githubLoginEnabled } from "../auth.js";
import { publicProcedure, router } from "../trpc.js";

export const healthRouter = router({
  /** Liveness probe — no auth, no input. */
  check: publicProcedure.query(({ ctx }) => ({
    status: "ok" as const,
    time: new Date(),
    requestId: ctx.requestId,
  })),

  /** What the login page can offer. Public: no secrets, just feature flags. */
  authConfig: publicProcedure.query(() => ({ githubLogin: githubLoginEnabled })),

  /** Echo with validation — useful for client wiring check. */
  echo: publicProcedure
    .input(z.object({ message: z.string().min(1).max(280) }))
    .query(({ input }) => ({
      echo: input.message,
      at: new Date(),
    })),
});
