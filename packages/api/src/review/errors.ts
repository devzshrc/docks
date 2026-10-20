import { logError } from "../logger.js";
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

/**
 * Known GitHub refusals, rewritten as what to do next. Checked against GitHub's
 * own reason text (and status) before falling back to that text.
 */
const ACTIONABLE: [RegExp, (m: RegExpMatchArray, status: number) => string][] = [
  [/at least (\d+) approving reviews? (?:is|are) required/i, (m) =>
    `Merge blocked by branch protection: ${m[1]} approving review${m[1] === "1" ? " is" : "s are"} required.`],
  [/required status checks? .*(?:expected|not been|failing|pending)|required status check .* is (?:expected|failing)/i, () =>
    "Merge blocked by branch protection: required checks haven't passed yet."],
  [/review from (?:a )?code ?owners? is required|code owner review required/i, () =>
    "Merge blocked: a code owner has to approve this pull request."],
  [/pull request is not mergeable|merge conflict/i, () =>
    "This pull request has merge conflicts. Resolve them on GitHub (or locally), then try again."],
  [/head branch was modified|head sha .* does not match/i, () =>
    "Someone pushed to this pull request a moment ago. Refresh to review the latest commit, then try again."],
  [/base branch policy prohibits the merge|merge commits are not allowed|squash merges are not allowed|rebase merges are not allowed/i, () =>
    "The repository doesn't allow this merge method. Pick another one in the merge menu."],
  [/resource not accessible by integration/i, () =>
    "The Docks GitHub App doesn't have permission for this. Ask an organization owner to accept the App's requested permissions in GitHub settings."],
  [/resource not accessible by personal access token|must have (?:admin|push|write) (?:rights|access)|permission to/i, () =>
    "Your GitHub account doesn't have permission to do this in this repository."],
  [/api rate limit exceeded|secondary rate limit/i, () =>
    "GitHub is rate-limiting requests right now. Wait a minute and try again."],
  [/pull request is in draft|draft pull requests? cannot/i, () =>
    "This pull request is still a draft. Mark it ready for review on GitHub first."],
  [/already merged|pull request is closed/i, () => "This pull request is already merged or closed."],
];

/** Plain next steps for a GitHub refusal: actionable when we recognise it, else GitHub's own reason. */
export function explainGithub(status: number, raw: string): string {
  const reason = githubReason(raw);
  const haystack = `${reason} ${raw}`;
  for (const [pattern, say] of ACTIONABLE) {
    const m = haystack.match(pattern);
    if (m) return say(m, status);
  }
  if (status === 429) return ACTIONABLE.find(([p]) => p.test("api rate limit exceeded"))![1]([] as never, status);
  if (status === 401) return "Your GitHub connection expired. Reconnect GitHub in Settings → Integrations.";
  if (status >= 500) return "GitHub is having trouble right now. Try again in a minute.";
  return reason;
}

/** Surface GitHub's own reason (branch protection, conflicts, permissions). */
export function githubFailure(err: unknown): never {
  if (err instanceof GitHubError) {
    throw new TRPCError({
      code: err.status === 403 || err.status === 404 ? "FORBIDDEN" : "BAD_REQUEST",
      message: explainGithub(err.status, err.message),
    });
  }
  // Our own errors (permissions, reconnect prompts) are already user-facing.
  if (err instanceof TRPCError) throw err;
  // Anything else is config or network trouble: log the detail, show a plain message.
  logError("github.failed", err);
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't reach GitHub. Try again in a moment." });
}
