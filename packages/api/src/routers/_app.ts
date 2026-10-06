import { router } from "../trpc.js";
import { billingRouter } from "./billing.js";
import { healthRouter } from "./health.js";
import { integrationRouter } from "./integration.js";
import { peopleRouter } from "./people.js";
import { reviewRouter } from "./review.js";
import { userRouter } from "./user.js";
import { workspaceRouter } from "./workspace.js";

export const appRouter = router({
  health: healthRouter,
  user: userRouter,
  workspace: workspaceRouter,
  review: reviewRouter,
  integration: integrationRouter,
  people: peopleRouter,
  billing: billingRouter,
});

/** Canonical type — client imports ONLY this type, never the runtime. */
export type AppRouter = typeof appRouter;
