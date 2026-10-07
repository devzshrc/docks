import { TRPCError } from "@trpc/server";
import { GitHubError } from "./github.js";

const GENERIC = /^(unprocessable entity|validation failed|bad request|not found|forbidden)\.?$/i;

type Detail = string | { message?: string; field?: string; code?: string; resource?: string; value?: unknown };

const describe = (d: Detail) => {
  // GitHub prefixes some reasons with the resource name ("Review Can not approve your own pull request").
  if (typeof d === "string") return d.replace(/^Review (?=Can)/, "").replace(/^Can not /, "You can't ");
  if (d.message) return d.message;
  const what = [d.resource, d.field].filter(Boolean).join(" ");
  const why: Record<string, string> = {
    invalid: "is invalid",
    missing: "is missing",
    missing_field: "is required",
    already_exists: "already exists",
    unprocessable: "can't be used",
  };
  return `${what || "A field"} ${why[d.code ?? ""] ?? d.code ?? "was rejected"}`.trim();
};

/** GitHub's reason for a rejected request: its `message`, or the `errors` it hides behind "Unprocessable Entity". */
export function githubReason(raw: string): string {
  const json = raw.slice(raw.indexOf("{"));
  try {
    const body = JSON.parse(json) as { message?: string; errors?: Detail[] };
    const details = (body.errors ?? []).map(describe).filter(Boolean);
    if (body.message && !GENERIC.test(body.message.trim())) {
      return details.length ? `${body.message.replace(/\.$/, "")}: ${details.join("; ")}` : body.message;
    }
    if (details.length) return details.join("; ");
  } catch {
    /* not JSON */
  }
  return "GitHub couldn't process that. The pull request may have changed; refresh and try again.";
}

/** Surface GitHub's own reason (branch protection, conflicts, permissions). */
export function githubFailure(err: unknown): never {
  if (err instanceof GitHubError) {
    throw new TRPCError({
      code: err.status === 403 || err.status === 404 ? "FORBIDDEN" : "BAD_REQUEST",
      message: githubReason(err.message),
    });
  }
  // Our own errors (permissions, reconnect prompts) are already user-facing.
  if (err instanceof TRPCError) throw err;
  // Anything else is config or network trouble: log the detail, show a plain message.
  console.error(`[github] ${(err as Error).message}`);
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't reach GitHub. Try again in a moment." });
}
