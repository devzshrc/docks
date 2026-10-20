import { reviewInboxRouter } from "./review-inbox.js";
import { knowledgeRouter } from "./knowledge.js";
import { deliveryRouter } from "./delivery.js";
import { releasesRouter } from "./releases.js";
import { router } from "../trpc.js";
import { adminRouter } from "./admin.js";
import { billingRouter } from "./billing.js";
import { healthRouter } from "./health.js";
import { inboxRouter } from "./inbox.js";
import { insightsRouter } from "./insights.js";
import { integrationRouter } from "./integration.js";
import { issueRouter } from "./issue.js";
import { issuesRouter } from "./issues.js";
import { peopleRouter } from "./people.js";
import { reviewRouter } from "./review.js";
import { setupRouter } from "./setup.js";
import { userRouter } from "./user.js";
import { workspaceRouter } from "./workspace.js";

export const appRouter = router({
  knowledge: knowledgeRouter,
  reviewInbox: reviewInboxRouter,
  releases: releasesRouter,
  delivery: deliveryRouter,
  health: healthRouter,
  user: userRouter,
  workspace: workspaceRouter,
  review: reviewRouter,
  setup: setupRouter,
  integration: integrationRouter,
  issue: issueRouter,
  issues: issuesRouter,
  people: peopleRouter,
  inbox: inboxRouter,
  insights: insightsRouter,
  admin: adminRouter,
  billing: billingRouter,
});

/** Canonical type — client imports ONLY this type, never the runtime. */
export type AppRouter = typeof appRouter;
