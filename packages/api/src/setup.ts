/**
 * Setup health: what's connected, what's broken, and how to fix it. Pure
 * functions here; the setup router gathers the inputs.
 */

export type CheckStatus = "ok" | "warn" | "fail";
export interface SetupCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Where to fix it, or a client action name. */
  fix?: { label: string; href?: string; action?: "webhook_test" | "permission_check" | "sync_access" };
}

const HOUR = 3_600_000;

/** Permissions the App needs per installation, and what breaks without each. */
export const REQUIRED_PERMISSIONS: Record<string, { level: "read" | "write"; why: string }> = {
  pull_requests: { level: "write", why: "approve, comment and merge from Docks" },
  contents: { level: "read", why: "show full files and blame" },
  checks: { level: "read", why: "show CI status" },
  metadata: { level: "read", why: "list repositories" },
  issues: { level: "write", why: "create follow-up issues" },
};

export function missingPermissions(granted: Record<string, string> | undefined): string[] {
  const rank = { read: 1, write: 2, admin: 3 } as Record<string, number>;
  return Object.entries(REQUIRED_PERMISSIONS)
    .filter(([name, need]) => (rank[granted?.[name] ?? ""] ?? 0) < rank[need.level]!)
    .map(([name, need]) => `${name.replace("_", " ")} (${need.level}) to ${need.why}`);
}

export function webhookCheck(
  deliveries: { result: "ok" | "failed" | "signature_rejected"; receivedAt: Date; reason: string | null }[],
  now = new Date(),
): SetupCheck {
  const base = { id: "webhooks", label: "GitHub webhooks", fix: { label: "Run webhook test", action: "webhook_test" as const } };
  if (!deliveries.length)
    return { ...base, status: "warn", detail: "No webhooks received yet. Open or update a pull request, or run the test." };
  const latest = deliveries.reduce((a, b) => (a.receivedAt > b.receivedAt ? a : b));
  const recent = deliveries.filter((d) => now.getTime() - d.receivedAt.getTime() < 24 * HOUR);
  const rejected = recent.filter((d) => d.result === "signature_rejected").length;
  const failed = recent.filter((d) => d.result === "failed").length;
  if (rejected)
    return {
      ...base,
      status: "fail",
      detail: `${rejected} webhook${rejected === 1 ? " was" : "s were"} rejected for a bad signature in the last day. The App's webhook secret doesn't match the server's GITHUB_WEBHOOK_SECRET.`,
    };
  if (failed > recent.length / 2)
    return { ...base, status: "fail", detail: `${failed} of ${recent.length} webhooks failed to process in the last day.` };
  const age = now.getTime() - latest.receivedAt.getTime();
  const ago = age < HOUR ? `${Math.max(1, Math.round(age / 60_000))} min ago` : age < 48 * HOUR ? `${Math.round(age / HOUR)}h ago` : `${Math.round(age / (24 * HOUR))} days ago`;
  if (age > 7 * 24 * HOUR)
    return { ...base, status: "warn", detail: `Last webhook ${ago}. If pull requests changed since, deliveries aren't reaching Docks.` };
  return { ...base, status: "ok", detail: `Working. Last event ${ago}${failed ? `, ${failed} failed in the last day` : ""}.` };
}

/** GitHub logins active in the workspace's repos who aren't members yet, most active first. */
export function inviteCandidates(
  activity: { login: string; n: number }[],
  memberLogins: string[],
  limit = 8,
): { login: string; activity: number }[] {
  const members = new Set(memberLogins.map((l) => l.toLowerCase()));
  const totals = new Map<string, { login: string; activity: number }>();
  for (const a of activity) {
    const key = a.login.toLowerCase();
    if (members.has(key) || /\[bot\]$|^dependabot|^renovate|^github-actions/i.test(a.login)) continue;
    const t = totals.get(key) ?? { login: a.login, activity: 0 };
    t.activity += a.n;
    totals.set(key, t);
  }
  return [...totals.values()].sort((a, b) => b.activity - a.activity || a.login.localeCompare(b.login)).slice(0, limit);
}

/** A failed job's error, as something a workspace owner can act on. */
export function explainJobError(type: string, lastError: string | null): string {
  const e = lastError ?? "";
  if (/\b401\b|bad credentials/i.test(e)) return "GitHub rejected the App's credentials. Check the App is still installed.";
  if (/\b404\b/.test(e)) return "GitHub couldn't find it: the repository or pull request may have been deleted, renamed, or removed from the App.";
  if (/resource not accessible by integration/i.test(e)) return "The App is missing a permission for this. Accept the App's requested permissions in GitHub.";
  if (/rate limit/i.test(e)) return "GitHub rate-limited the request. A retry after a few minutes usually works.";
  if (/openai|model|incomplete|refus/i.test(e) || type === "generate_guide") return "The AI walkthrough couldn't be generated. The folder-grouped tour is shown instead; retrying may help.";
  if (/timeout|ECONNRESET|fetch failed|network/i.test(e)) return "A network error reached GitHub or the AI provider. Retrying usually works.";
  return e ? e.replace(/^GitHub \d+ \S+: /, "").slice(0, 200) : "Failed without a recorded reason.";
}

/** How the webhook test went, from GitHub's side and ours. */
export function webhookTestVerdict(input: {
  configuredUrl: string | null;
  expectedUrl: string;
  githubStatusCode: number | null;
  receivedByUs: boolean;
}): { status: CheckStatus; detail: string } {
  if (input.configuredUrl && input.configuredUrl.replace(/\/$/, "") !== input.expectedUrl)
    return { status: "fail", detail: `The App sends webhooks to ${input.configuredUrl}, but this server expects ${input.expectedUrl}. Update the Webhook URL in the GitHub App settings.` };
  if (input.receivedByUs) return { status: "ok", detail: "Webhooks are reaching Docks." };
  if (input.githubStatusCode === 401 || input.githubStatusCode === 403)
    return { status: "fail", detail: "Docks rejected GitHub's signature. The App's webhook secret must match GITHUB_WEBHOOK_SECRET on the server." };
  if (input.githubStatusCode && input.githubStatusCode >= 500)
    return { status: "fail", detail: `GitHub reached the server but it answered ${input.githubStatusCode}. Check the server logs.` };
  if (input.githubStatusCode === 0 || input.githubStatusCode === null)
    return { status: "warn", detail: "GitHub hasn't reported a result yet, or couldn't connect. Wait a few seconds and test again." };
  return { status: "warn", detail: `GitHub got ${input.githubStatusCode} but Docks has no record of the delivery yet.` };
}
