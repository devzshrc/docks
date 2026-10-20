import { boardProcedures } from "./review/board.js";
import { pullProcedures } from "./review/pull.js";
import { actionsProcedures } from "./review/actions.js";
import { reviewersProcedures } from "./review/reviewers.js";
import { threadsProcedures } from "./review/threads.js";
import { linksProcedures } from "./review/links.js";
import { askProcedures } from "./review/ask.js";
import { router } from "../trpc.js";

export type { GuideState } from "./review/shared.js";

/** Review procedures, grouped by screen; see ./review/*.ts. */
export const reviewRouter = router({
  ...boardProcedures,
  ...pullProcedures,
  ...actionsProcedures,
  ...reviewersProcedures,
  ...threadsProcedures,
  ...linksProcedures,
  ...askProcedures,
});
