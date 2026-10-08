import { db, schema } from "@docks/db";
import { and, eq, sql } from "drizzle-orm";
import { assertCan, audit } from "./access.js";
import { decrypt, encrypt, signState, verifyState } from "./crypto.js";
import { enqueue, PermanentJobError } from "./jobs.js";
import { effectiveColumn, isStuck } from "./review/columns.js";

/**
 * Slack daily digest — plan.md §5.4. Uses an incoming webhook: the person
 * picks the channel on Slack's OAuth screen and we can post only there.
 *
 * Env: SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, BETTER_AUTH_URL, CLIENT_URL.
 * Slack app "Redirect URL": <BETTER_AUTH_URL>/integrations/slack/callback
 */

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const redirectUri = () =>
  `${process.env.BETTER_AUTH_URL ?? "http://localhost:4000"}/integrations/slack/callback`;
const clientUrl = () => process.env.CLIENT_URL ?? "http://localhost:3000";

/** State binds the flow to this user and workspace. */
export function slackConnectUrl(userId: string, workspaceId: string): string {
  const params = new URLSearchParams({
    client_id: env("SLACK_CLIENT_ID"),
    scope: "incoming-webhook",
    redirect_uri: redirectUri(),
    state: signState(`${userId}:${workspaceId}`),
  });
  return `https://slack.com/oauth/v2/authorize?${params}`;
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  team?: { id: string; name: string };
  incoming_webhook?: { url: string; channel: string; channel_id: string };
}

/** Finish OAuth; the caller has already checked the user can manage the workspace. */
async function completeSlack(userId: string, workspaceId: string, code: string, state: string) {
  if (!verifyState(state, `${userId}:${workspaceId}`)) throw new Error("Invalid or expired state");
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("SLACK_CLIENT_ID"),
      client_secret: env("SLACK_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri(),
    }),
  });
  const body = (await res.json()) as SlackOAuthResponse;
  if (!body.ok || !body.team || !body.incoming_webhook) {
    throw new Error(`Slack OAuth failed: ${body.error ?? res.status}`);
  }
  const values = {
    workspaceId,
    teamId: body.team.id,
    teamName: body.team.name,
    channelId: body.incoming_webhook.channel_id,
    channelName: body.incoming_webhook.channel.replace(/^#/, ""),
    webhookUrlEncrypted: encrypt(body.incoming_webhook.url),
  };
  await db
    .insert(schema.slackIntegration)
    .values(values)
    .onConflictDoUpdate({ target: schema.slackIntegration.workspaceId, set: values });
}

/** Callback entry: state carries "userId:workspaceId"; only owners may connect. */
export async function connectSlack(userId: string, code: string, state: string) {
  const workspaceId = (state.split(".")[0] ?? "").split(":")[1];
  if (!workspaceId) throw new Error("Invalid state");
  await assertCan(userId, workspaceId, "integrations.manage");
  await completeSlack(userId, workspaceId, code, state);
  await audit(workspaceId, userId, "slack.connect");
}

/** "YYYY-MM-DD" and hour in an IANA timezone. */
function localDateHour(timezone: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Called by the worker every minute: queue today's digest once the local hour arrives. */
export async function scheduleDigests(now = new Date()) {
  const rows = await db
    .select({
      workspaceId: schema.slackIntegration.workspaceId,
      digestHour: schema.slackIntegration.digestHour,
      timezone: schema.slackIntegration.timezone,
      lastDigestOn: schema.slackIntegration.lastDigestOn,
    })
    .from(schema.slackIntegration);
  for (const row of rows) {
    const { date, hour } = localDateHour(row.timezone, now);
    if (hour < row.digestHour || row.lastDigestOn === date) continue;
    // One job per workspace per day, whatever its outcome: a failed digest
    // (e.g. channel deleted) must not be re-queued every minute.
    const payload = { workspaceId: row.workspaceId, date };
    const [existing] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.type, "slack_digest"),
          sql`${schema.jobs.payload} = ${JSON.stringify(payload)}::jsonb`,
        ),
      )
      .limit(1);
    if (!existing) await enqueue("slack_digest", payload);
  }
}

/** Stuck open PRs across the workspace's enabled repos, oldest first. */
async function stuckPulls(workspaceId: string) {
  const rows = await db
    .select({
      repo: schema.repository.fullName,
      number: schema.pullRequest.number,
      title: schema.pullRequest.title,
      column: schema.pullRequest.reviewColumn,
      claimedBy: schema.pullRequest.claimedBy,
      reviewers: schema.pullRequest.requestedReviewers,
      lastActivityAt: schema.pullRequest.lastActivityAt,
      stuckHours: schema.workspace.stuckHours,
    })
    .from(schema.pullRequest)
    .innerJoin(schema.repository, eq(schema.repository.id, schema.pullRequest.repoId))
    .innerJoin(
      schema.githubInstallation,
      eq(schema.githubInstallation.id, schema.repository.installationId),
    )
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.githubInstallation.workspaceId))
    .where(
      and(
        eq(schema.githubInstallation.workspaceId, workspaceId),
        eq(schema.repository.enabled, true),
        eq(schema.pullRequest.state, "open"),
        eq(schema.pullRequest.draft, false),
      ),
    );
  return rows
    .filter((r) => isStuck(effectiveColumn(r.column, r.claimedBy), r.lastActivityAt, r.stuckHours))
    .sort((a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime());
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function ageLabel(d: Date) {
  const hours = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/** Slack mrkdwn text for the digest; null when nothing is stuck. */
export async function digestText(workspaceId: string): Promise<string | null> {
  const pulls = await stuckPulls(workspaceId);
  if (!pulls.length) return null;
  const shown = pulls.slice(0, 15);
  const lines = shown.map((p) => {
    const link = `<${clientUrl()}/review/${p.repo}/${p.number}|${escape(p.repo)}#${p.number}>`;
    const who = p.reviewers.length ? `waiting on ${p.reviewers.map(escape).join(", ")}` : "needs a reviewer";
    return `• ${link} ${escape(p.title)} — ${who}, ${ageLabel(p.lastActivityAt)}`;
  });
  const more = pulls.length - shown.length;
  const hours = pulls[0]!.stuckHours;
  return [
    `*${pulls.length} PR${pulls.length === 1 ? "" : "s"} waiting more than ${hours}h*`,
    ...lines,
    more > 0 ? `…and ${more} more on the <${clientUrl()}/review|review board>` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function post(webhookUrlEncrypted: string, text: string) {
  const res = await fetch(decrypt(webhookUrlEncrypted), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text();
    // 403/404/410: webhook revoked or channel gone; retrying won't help.
    const permanent = res.status === 403 || res.status === 404 || res.status === 410;
    const message = `Slack ${res.status}: ${body}`;
    throw permanent ? new PermanentJobError(message) : new Error(message);
  }
}

async function integrationFor(workspaceId: string) {
  const [row] = await db
    .select()
    .from(schema.slackIntegration)
    .where(eq(schema.slackIntegration.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

/** Job body: post the digest for `date` once. Quiet days post nothing. */
export async function sendDigest(workspaceId: string, date: string) {
  const integration = await integrationFor(workspaceId);
  if (!integration || integration.lastDigestOn === date) return;
  const text = await digestText(workspaceId);
  if (text) await post(integration.webhookUrlEncrypted, text);
  await db
    .update(schema.slackIntegration)
    .set({ lastDigestOn: date })
    .where(eq(schema.slackIntegration.workspaceId, workspaceId));
}

/** "Send test" button: today's digest now, or an all-clear line. */
export async function sendTestDigest(workspaceId: string) {
  const integration = await integrationFor(workspaceId);
  if (!integration) throw new Error("Slack isn't connected");
  const text = (await digestText(workspaceId)) ?? "No PRs are stuck waiting for review. Nice.";
  await post(integration.webhookUrlEncrypted, text);
}

/** Uses the existing configured channel. No new Slack scopes or direct messages. */
export async function sendReviewAlert(workspaceId: string, text: string) {
  const integration = await integrationFor(workspaceId);
  if (integration) await post(integration.webhookUrlEncrypted, text);
}
