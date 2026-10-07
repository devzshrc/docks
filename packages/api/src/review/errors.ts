import { TRPCError } from "@trpc/server";
import { GitHubError } from "./github.js";

/** Surface GitHub's own reason (branch protection, conflicts, permissions). */
export function githubFailure(err: unknown): never {
  if (err instanceof GitHubError) {
    const reason = err.message.match(/"message":"([^"]+)"/)?.[1] ?? "GitHub rejected the request";
    throw new TRPCError({
      code: err.status === 403 || err.status === 404 ? "FORBIDDEN" : "BAD_REQUEST",
      message: reason,
    });
  }
  // Our own errors (permissions, reconnect prompts) are already user-facing.
  if (err instanceof TRPCError) throw err;
  // Anything else is config or network trouble: log the detail, show a plain message.
  console.error(`[github] ${(err as Error).message}`);
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't reach GitHub. Try again in a moment." });
}
