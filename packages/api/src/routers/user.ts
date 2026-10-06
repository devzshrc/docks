import { protectedProcedure, router } from "../trpc.js";

/** Users come from Better Auth (sign-up), not from tRPC mutations. */
export const userRouter = router({
  /** Currently authenticated user (session resolved in server context). */
  me: protectedProcedure.query(({ ctx }) => ctx.user),
});
